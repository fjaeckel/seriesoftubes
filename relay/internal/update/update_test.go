package update

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestSemverOrder(t *testing.T) {
	// Ascending, as semver.org 2.0 orders them.
	list := []string{"1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11",
		"1.0.0-rc.1", "1.0.0", "1.0.1", "1.2.0", "1.10.0", "2.0.0", "10.0.0"}
	for i := range list {
		for j := range list {
			a, _ := Parse(list[i])
			b, _ := Parse(list[j])
			want := 0
			if i < j {
				want = -1
			} else if i > j {
				want = 1
			}
			if got := a.Cmp(b); got != want {
				t.Errorf("%s vs %s: %d, want %d", list[i], list[j], got, want)
			}
		}
	}
	if a, _ := Parse("1.2.3+build.7"); a.Cmp(Ver{Major: 1, Minor: 2, Patch: 3}) != 0 {
		t.Error("build metadata counts")
	}
	for _, bad := range []string{"dev", "", "1.2", "v1.2.3", "01.2.3", "1.2.3-", "1.2.3 ", "1.2.3-ü"} {
		if _, ok := Parse(bad); ok {
			t.Errorf("%q parsed", bad)
		}
	}
	if Newer("dev", "1.0.0") || Newer("1.0.0", "dev") || !Newer("3.10.0", "3.9.9") || Newer("3.6.0", "3.6.0") {
		t.Error("Newer")
	}
}

func TestFromFeed(t *testing.T) {
	f := &Feed{V: 1, Version: "3.6.0", Released: "2026-11-12", Notes: "https://github.com/x/y/releases/tag/v3.6.0"}
	if h := FromFeed("3.6.0", f); h != nil {
		t.Fatal("up to date, yet a hint")
	}
	if h := FromFeed("3.7.0-rc.1", f); h != nil {
		t.Fatal("ahead, yet a hint")
	}
	if h := FromFeed("dev", f); h != nil {
		t.Fatal("a development build is never told to update")
	}
	h := FromFeed("3.5.0", f)
	if h == nil || h.Version != "3.6.0" || h.Security || h.Source != "feed" || h.Notes != f.Notes {
		t.Fatalf("behind: %+v", h)
	}
	if h.Text() != "update available: 3.6.0 https://github.com/x/y/releases/tag/v3.6.0" {
		t.Fatal(h.Text())
	}
	f.Security = true
	if h := FromFeed("3.5.0", f); h == nil || !h.Security || h.Text() != "update available: 3.6.0 (security) "+f.Notes {
		t.Fatalf("security: %+v", h)
	}
	// Not a security release itself, but an older one was: only relays below it are told so.
	f.Security, f.MinSafe = false, "3.5.1"
	if h := FromFeed("3.5.0", f); h == nil || !h.Security {
		t.Fatal("below minSafe is a security update")
	}
	if h := FromFeed("3.5.1", f); h == nil || h.Security {
		t.Fatal("at minSafe: a plain update")
	}
}

func TestParseRelease(t *testing.T) {
	f, err := ParseRelease([]byte(`{"tag_name":"v3.7.0","html_url":"https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.7.0",
		"published_at":"2026-11-12T10:00:00Z","body":"notes","assets":[]}`))
	if err != nil || f.Version != "3.7.0" || f.Source != "github" || f.Security || f.Released != "2026-11-12" ||
		f.Notes != "https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.7.0" {
		t.Fatalf("%+v %v", f, err)
	}
	if f, err := ParseRelease([]byte(`{"tag_name":"3.7.1"}`)); err != nil || f.Version != "3.7.1" || f.Notes != "" {
		t.Fatalf("no v: %+v %v", f, err)
	}
	// Only an https:// page on github.com is kept as the notes.
	for _, u := range []string{"http://github.com/x", "https://github.com.evil.example/x", "https://example.com/x",
		"https://user@github.com/x", "javascript:alert(1)"} {
		b, _ := json.Marshal(map[string]any{"tag_name": "v3.7.0", "html_url": u})
		if f, err := ParseRelease(b); err != nil || f.Notes != "" {
			t.Errorf("%s kept: %+v %v", u, f, err)
		}
	}
	// It is never a security hint, even below anything.
	if h := FromFeed("1.0.0", f); h == nil || h.Security || h.Source != "github" || h.Text() != "update available: 3.7.0 (from GitHub releases) "+f.Notes {
		t.Fatalf("%+v", h)
	}
	for _, bad := range []string{`{"tag_name":"vv3.7.0"}`, `{"tag_name":"release-3.7"}`, `{"tag_name":"v3.7"}`, `{"tag_name":""}`,
		`{"tag_name":"v3.7.0","draft":true}`, `{"tag_name":"v3.8.0-rc.1","prerelease":true}`, `[]`, `{`} {
		if _, err := ParseRelease([]byte(bad)); err == nil {
			t.Errorf("%s read", bad)
		}
	}
	if _, err := ParseRelease(make([]byte, MaxRelease+1)); err == nil {
		t.Error("too big read")
	}
}

func TestFetchRelease(t *testing.T) {
	var hdr http.Header
	status, extra := http.StatusOK, map[string]string{}
	body := `{"tag_name":"v3.7.0","html_url":"https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.7.0"}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hdr = r.Header.Clone()
		for k, v := range extra {
			w.Header().Set(k, v)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()
	now := time.Unix(1_800_000_000, 0)
	f, err := FetchRelease(context.Background(), srv.Client(), srv.URL, "3.5.0", now)
	if err != nil || f.Version != "3.7.0" {
		t.Fatalf("%+v %v", f, err)
	}
	// A plain GET: the API's media type and the relay's name and version, nothing else about it.
	if hdr.Get("Accept") != "application/vnd.github+json" || hdr.Get("User-Agent") != "tubes-relay/3.5.0" || hdr.Get("Authorization") != "" || hdr.Get("Cookie") != "" {
		t.Fatalf("headers %v", hdr)
	}
	// 403 and 429 are a LimitedError, with the wait the answer asks for.
	for _, c := range []struct {
		status int
		h      map[string]string
		want   time.Duration
	}{
		{http.StatusTooManyRequests, map[string]string{"Retry-After": "120"}, 2 * time.Minute},
		{http.StatusForbidden, map[string]string{"X-Ratelimit-Remaining": "0", "X-Ratelimit-Reset": "1800003600"}, time.Hour},
		{http.StatusForbidden, map[string]string{"X-Ratelimit-Remaining": "0", "X-Ratelimit-Reset": "1900000000"}, MaxWait},
		{http.StatusForbidden, nil, 0},
	} {
		status, extra = c.status, c.h
		_, err := FetchRelease(context.Background(), srv.Client(), srv.URL, "3.5.0", now)
		lim, ok := err.(*LimitedError)
		if !ok || lim.Wait != c.want {
			t.Errorf("%d %v: %v", c.status, c.h, err)
		}
	}
	status, extra = http.StatusNotFound, nil
	if _, err := FetchRelease(context.Background(), srv.Client(), srv.URL, "3.5.0", now); err == nil {
		t.Error("404 read")
	}
	// An answer bigger than MaxRelease is not read.
	status, body = http.StatusOK, `{"tag_name":"v3.7.0","body":"`+string(make([]byte, MaxRelease))+`"}`
	if _, err := FetchRelease(context.Background(), srv.Client(), srv.URL, "3.5.0", now); err == nil {
		t.Error("too big read")
	}
	if ReleasesURL != "https://api.github.com/repos/fjaeckel/seriesoftubes/releases/latest" {
		t.Error(ReleasesURL)
	}
}

func TestParseFeed(t *testing.T) {
	good := `{"v":1,"version":"3.6.0","released":"2026-11-12","security":true,"notes":"https://github.com/x/y/releases/tag/v3.6.0","minSafe":"3.6.0","extra":1}`
	f, err := ParseFeed([]byte(good))
	if err != nil || f.Version != "3.6.0" || !f.Security || f.MinSafe != "3.6.0" || f.Released != "2026-11-12" {
		t.Fatalf("%+v %v", f, err)
	}
	f, err = ParseFeed([]byte(`{"v":1,"version":"3.6.0","released":"soon","notes":"javascript:alert(1)","minSafe":"x"}`))
	if err != nil || f.Notes != "" || f.Released != "" || f.MinSafe != "" {
		t.Fatalf("unsafe members kept: %+v %v", f, err)
	}
	for _, bad := range []string{`{"v":2,"version":"3.6.0"}`, `{"v":1,"version":"dev"}`, `[]`, `{`} {
		if _, err := ParseFeed([]byte(bad)); err == nil {
			t.Errorf("%s read", bad)
		}
	}
	big := make([]byte, MaxFeed+1)
	if _, err := ParseFeed(big); err == nil {
		t.Error("too big read")
	}
	for s, want := range map[string]bool{"https://a.b/c": true, "http://a.b/c": false, "https://u:p@a.b/": false,
		"https:///x": false, "https://a.b/\"><script>": false, "": false} {
		if HTTPSURL(s) != want {
			t.Errorf("HTTPSURL(%q) != %v", s, want)
		}
	}
}

func TestURLBeside(t *testing.T) {
	for in, want := range map[string]string{
		"https://seriesoftub.es/federation/servers.json": "https://seriesoftub.es/federation/relay.json",
		"https://example.org/servers.json?x=1":           "https://example.org/relay.json",
		"https://example.org":                            "https://example.org/relay.json",
		filepath.Join("data", "site", "servers.json"):    filepath.Join("data", "site", "relay.json"),
		"": "",
	} {
		if got := URLBeside(in); got != want {
			t.Errorf("URLBeside(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestReadImpl(t *testing.T) {
	if im := ReadImpl(map[string]any{"name": "tubes-relay", "version": "3.6.0", "x": 1}); im == nil || im.Version != "3.6.0" {
		t.Fatal("good impl refused")
	}
	for _, bad := range []any{nil, "3.6.0", map[string]any{"name": "tubes-relay"}, map[string]any{"name": "a b", "version": "1"},
		map[string]any{"name": "tubes-relay", "version": "1.0.0‮"}, map[string]any{"name": "x", "version": string(make([]byte, 41))}} {
		if ReadImpl(bad) != nil {
			t.Errorf("%v read", bad)
		}
	}
}

func TestNotifyRetries(t *testing.T) {
	old := Backoff
	Backoff = []time.Duration{time.Millisecond, time.Millisecond}
	defer func() { Backoff = old }()
	var calls atomic.Int32
	var got Notice
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) < 3 {
			http.Error(w, "busy", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("%s %s", r.Method, r.Header.Get("Content-Type"))
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
	}))
	defer srv.Close()
	n := Notice{Server: "srv", Running: "3.5.0", Version: "3.6.0", Security: true, Notes: "https://a.b/n"}
	if err := Notify(context.Background(), srv.Client(), srv.URL, n); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 3 || got != n {
		t.Fatalf("calls %d, got %+v", calls.Load(), got)
	}
	calls.Store(-100)
	if err := Notify(context.Background(), srv.Client(), srv.URL, n); err == nil {
		t.Fatal("every attempt failed, yet nil")
	}
	if calls.Load() != -97 {
		t.Fatalf("attempts: %d", calls.Load()+100)
	}
}

package node_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// withFeed points a node's registry at a folder holding relay.json (and no servers.json: the
// registry refresh fails, the feed is still read beside it), and reads it.
func withFeed(t *testing.T, x *rt.Node, feed string, edit func(*config.Config)) string {
	t.Helper()
	dir := rt.Dir(t)
	if feed != "" {
		if err := os.WriteFile(filepath.Join(dir, "relay.json"), []byte(feed), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	c := *x.Cfg
	c.Registry = filepath.Join(dir, "servers.json")
	if edit != nil {
		edit(&c)
	}
	x.Cfg = &c
	x.R.Reload(&c)
	x.R.CheckUpdate()
	return dir
}

// updateFrame waits up to d for an update frame.
func updateFrame(c *client.Client, d time.Duration) *wire.Frame {
	deadline := time.After(d)
	for {
		select {
		case f, open := <-c.Others():
			if !open {
				return nil
			}
			if f.M == "update" {
				return f
			}
		case <-deadline:
			return nil
		}
	}
}

// catalogOf is a node's answer to servers, joined over its frames.
func catalogOf(t *testing.T, x *rt.Node) []any {
	t.Helper()
	got, err := x.Client(nil).Collect(ctx(t), map[string]any{"m": "servers"})
	if err != nil || len(got) != 1 {
		t.Fatalf("servers: %v", err)
	}
	list, _ := got[0]["entries"].([]any)
	return list
}

func metricsText(t *testing.T, x *rt.Node) string {
	var b bytes.Buffer
	if err := x.Metrics.Write(&b); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

func TestVersionInWelcomeAndStatus(t *testing.T) {
	n := rt.New(t)
	n.Release = "3.5.0"
	a := n.Found("versioned", "open")
	x := a.Nodes[0]
	c := x.Client(nil)
	if im := c.Welcome.Impl; im == nil || im.Name != "tubes-relay" || im.Version != "3.5.0" {
		t.Fatalf("welcome impl: %+v", c.Welcome.Impl)
	}
	if v := x.R.Status()["version"]; v != "3.5.0" {
		t.Fatalf("status version %v", v)
	}
	if !strings.Contains(metricsText(t, x), `relay_build_info{version="3.5.0"} 1`) {
		t.Fatal("no relay_build_info")
	}
	// A development build says so, and is never told to update.
	n.Release = ""
	d := n.Found("devbuild", "open")
	withFeed(t, d.Nodes[0], `{"v":1,"version":"9.0.0","released":"2026-11-12","security":true,"notes":"https://example.com/n"}`, nil)
	if d.Nodes[0].Client(nil).Welcome.Impl.Version != "dev" || d.Nodes[0].R.UpdateStatus() != nil {
		t.Fatal("a development build got a hint")
	}
	if !strings.Contains(metricsText(t, d.Nodes[0]), `relay_update_available{security="true"} 0`) {
		t.Fatal(metricsText(t, d.Nodes[0]))
	}
}

func TestUpdateNoticeToOperatorsOnly(t *testing.T) {
	n := rt.New(t)
	n.Release = "3.5.0"
	a := n.Found("behind", "open")
	x := a.Nodes[0]
	notes := "https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.6.0"
	withFeed(t, x, `{"v":1,"version":"3.6.0","released":"2026-11-12","security":true,"notes":"`+notes+`"}`, nil)
	h := x.R.UpdateStatus()
	if h == nil || h.Version != "3.6.0" || !h.Security || h.Source != "feed" {
		t.Fatalf("hint %+v", h)
	}
	st := x.R.Status()
	u, _ := st["update"].(map[string]any)
	if u == nil || u["says"] != "update available: 3.6.0 (security) "+notes {
		t.Fatalf("status: %v", st["update"])
	}
	m := metricsText(t, x)
	for _, want := range []string{`relay_update_available{security="true"} 1`, `relay_update_available{security="false"} 0`,
		`relay_latest_version_info{version="3.6.0"} 1`} {
		if !strings.Contains(m, want) {
			t.Fatalf("metrics lack %s:\n%s", want, m)
		}
	}
	if !strings.Contains(x.Log.String(), "relay update available") {
		t.Fatal("not logged")
	}

	op := x.Client(nil)
	if ok, err := op.Auth(ctx(t), a.Op, n.Clock.Unix()); err != nil || !ok {
		t.Fatalf("operator auth %v %v", ok, err)
	}
	f := updateFrame(op, 3*time.Second)
	if f == nil {
		t.Fatal("the operator heard nothing")
	}
	if v, _ := f.Str("version"); v != "3.6.0" {
		t.Fatalf("version %v", f.Raw)
	}
	if s, _ := f.Raw["security"].(bool); !s {
		t.Fatal("not marked security")
	}
	if nt, _ := f.Str("notes"); nt != notes {
		t.Fatal("notes")
	}
	if _, has := f.Raw["id"]; has {
		t.Fatal("update carries an id")
	}

	player := x.Client(nil)
	if ok, err := player.Auth(ctx(t), rt.Key("bob"), n.Clock.Unix()); err != nil || ok {
		t.Fatalf("player auth %v %v", ok, err)
	}
	if updateFrame(player, 500*time.Millisecond) != nil {
		t.Fatal("a player who is no operator got the update frame")
	}

	// A newer release: the operator is told again, the player still not.
	if err := os.WriteFile(filepath.Join(filepath.Dir(x.Cfg.Registry), "relay.json"),
		[]byte(`{"v":1,"version":"3.7.0","released":"2026-11-13","security":false,"notes":"https://example.com/n"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	x.R.CheckUpdate()
	f = updateFrame(op, 3*time.Second)
	if v, _ := f.Str("version"); f == nil || v != "3.7.0" {
		t.Fatal("no second notice")
	}
	if updateFrame(player, 300*time.Millisecond) != nil {
		t.Fatal("player got the second notice")
	}
	// The same hint again: nothing new.
	x.R.CheckUpdate()
	if updateFrame(op, 300*time.Millisecond) != nil {
		t.Fatal("the same notice twice")
	}
	if strings.Contains(x.Log.String(), "127.0.0.1") {
		t.Fatal("an address reached the log")
	}
}

func TestUpdateUpToDate(t *testing.T) {
	n := rt.New(t)
	n.Release = "3.6.0"
	a := n.Found("current", "open")
	x := a.Nodes[0]
	withFeed(t, x, `{"v":1,"version":"3.6.0","released":"2026-11-12","security":true,"notes":"https://example.com/n"}`, nil)
	if x.R.UpdateStatus() != nil {
		t.Fatal("up to date, yet a hint")
	}
	if st := x.R.Status(); st["latest"] != "3.6.0" || st["update"] != nil {
		t.Fatalf("status %v %v", st["latest"], st["update"])
	}
	if strings.Contains(x.Log.String(), "relay update available") {
		t.Fatal("warned while up to date")
	}
}

// fakeGitHub stands in for GitHub's latest-release API for the nodes of a net made from now on.
type fakeGitHub struct {
	mu     sync.Mutex
	status int
	body   string
	hdr    map[string]string
	calls  int
	ua     []string
}

func newFakeGitHub(n *rt.Net) *fakeGitHub {
	g := &fakeGitHub{status: http.StatusInternalServerError}
	n.ReleasesURL = n.Serve("api-github", g) + "/repos/fjaeckel/seriesoftubes/releases/latest"
	return g
}

func (g *fakeGitHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.calls++
	g.ua = append(g.ua, r.Header.Get("User-Agent")+" "+r.Header.Get("Accept"))
	for k, v := range g.hdr {
		w.Header().Set(k, v)
	}
	w.WriteHeader(g.status)
	_, _ = w.Write([]byte(g.body))
}

// release makes it answer 200 with a release tagged v<tag>.
func (g *fakeGitHub) release(tag string) {
	g.set(http.StatusOK, `{"tag_name":"v`+tag+`","html_url":"https://github.com/fjaeckel/seriesoftubes/releases/tag/v`+tag+`","published_at":"2026-11-13T09:00:00Z"}`, nil)
}

func (g *fakeGitHub) set(status int, body string, hdr map[string]string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.status, g.body, g.hdr = status, body, hdr
}

func (g *fakeGitHub) count() int { g.mu.Lock(); defer g.mu.Unlock(); return g.calls }

// Versions other servers' nodes report in gossip are shown (catalog impl, looking glass) and
// never make a hint, however many servers report them.
func TestGossipVersionsNeverHint(t *testing.T) {
	n := rt.New(t)
	gh := newFakeGitHub(n) // answers 500: neither source can be read
	n.Release = "3.5.0"
	a := n.Found("gossip-a", "open")
	n.Release = "3.7.0"
	b := n.Found("gossip-b", "open")
	c := n.Found("gossip-c", "open")
	neighbours(a, b, c)
	x := a.Nodes[0]
	seen := map[string]string{}
	rt.Eventually(t, "a heard of b and c with their versions", func() bool {
		for _, e := range catalogOf(t, x) {
			m := e.(map[string]any)
			for _, v := range implsOf(m) {
				path, _ := m["path"].([]any)
				seen[path[0].(string)] = v
			}
		}
		return seen[b.ID] == "3.7.0" && seen[c.ID] == "3.7.0"
	})
	if seen[a.ID] != "3.5.0" {
		t.Fatalf("versions in the catalog: %v", seen)
	}
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); h != nil {
		t.Fatalf("a hint from gossip: %+v", h)
	}
	if gh.count() == 0 {
		t.Fatal("GitHub was not asked though relay.json could not be read")
	}
}

func TestUpdateFromGitHubWhenFeedMissing(t *testing.T) {
	n := rt.New(t)
	gh := newFakeGitHub(n)
	n.Release = "3.5.0"
	a := n.Found("github-fallback", "open")
	x := a.Nodes[0]
	rt.Eventually(t, "the start-up check asked GitHub", func() bool { return gh.count() >= 1 })
	gh.release("3.6.0")
	withFeed(t, x, "", nil) // a registry folder without relay.json
	h := x.R.UpdateStatus()
	if h == nil || h.Version != "3.6.0" || h.Security || h.Source != "github" ||
		h.Notes != "https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.6.0" || h.Text() != "update available: 3.6.0 (from GitHub releases) "+h.Notes {
		t.Fatalf("%+v", h)
	}
	gh.mu.Lock()
	ua := gh.ua[len(gh.ua)-1]
	gh.mu.Unlock()
	if ua != "tubes-relay/3.5.0 application/vnd.github+json" {
		t.Fatalf("request headers: %q", ua)
	}
	if u, _ := x.R.Status()["update"].(map[string]any); u == nil || u["source"] != "github" {
		t.Fatalf("status %v", x.R.Status()["update"])
	}
	// The operator's frame says where it came from.
	op := x.Client(nil)
	if ok, err := op.Auth(ctx(t), a.Op, n.Clock.Unix()); err != nil || !ok {
		t.Fatalf("operator auth %v %v", ok, err)
	}
	f := updateFrame(op, 3*time.Second)
	if f == nil || f.Raw["source"] != "github" || f.Raw["security"] != false || f.Raw["version"] != "3.6.0" {
		t.Fatalf("frame %v", f)
	}

	// relay.json is read: it wins, and GitHub is not asked.
	asked := gh.count()
	dir := filepath.Dir(x.Cfg.Registry)
	feed := filepath.Join(dir, "relay.json")
	if err := os.WriteFile(feed, []byte(`{"v":1,"version":"3.6.1","released":"2026-11-13","security":true,"notes":"https://example.com/n"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); h == nil || h.Version != "3.6.1" || !h.Security || h.Source != "feed" || gh.count() != asked {
		t.Fatalf("%+v, asked %d", h, gh.count()-asked)
	}
	// relay.json can no longer be read: the last one read stands unless GitHub has a newer release.
	if err := os.Remove(feed); err != nil {
		t.Fatal(err)
	}
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); h == nil || h.Version != "3.6.1" || h.Source != "feed" || gh.count() != asked+1 {
		t.Fatalf("an older GitHub release replaced relay.json: %+v", h)
	}
	gh.release("3.7.0")
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); h == nil || h.Version != "3.7.0" || h.Security || h.Source != "github" {
		t.Fatalf("%+v", h)
	}
	// GitHub fails: the last release read is kept.
	gh.set(http.StatusBadGateway, "", nil)
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); h == nil || h.Version != "3.7.0" {
		t.Fatalf("lost the last release: %+v", h)
	}
	// Bad tags and foreign links are not believed.
	gh.set(http.StatusOK, `{"tag_name":"latest","html_url":"https://github.com/x"}`, nil)
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); h == nil || h.Version != "3.7.0" {
		t.Fatalf("%+v", h)
	}
	gh.set(http.StatusOK, `{"tag_name":"v3.8.0","html_url":"https://evil.example/releases/v3.8.0"}`, nil)
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); h == nil || h.Version != "3.8.0" || h.Notes != "" {
		t.Fatalf("%+v", h)
	}
	if !strings.Contains(metricsText(t, x), `relay_latest_version_info{version="3.8.0"} 1`) {
		t.Fatal(metricsText(t, x))
	}
}

func TestGitHubRateLimitBackoff(t *testing.T) {
	n := rt.New(t)
	gh := newFakeGitHub(n)
	n.Release = "3.5.0"
	a := n.Found("github-limited", "open")
	x := a.Nodes[0]
	rt.Eventually(t, "the start-up check asked GitHub", func() bool { return gh.count() >= 1 })
	withFeed(t, x, "", nil)
	// 429 with Retry-After: not asked again before it.
	gh.set(http.StatusTooManyRequests, `{"message":"slow down"}`, map[string]string{"Retry-After": "86400"})
	base := gh.count()
	x.R.CheckUpdate()
	x.R.CheckUpdate()
	if gh.count() != base+1 {
		t.Fatalf("asked %d times while told to wait", gh.count()-base)
	}
	gh.release("3.6.0")
	n.Clock.Add(23 * time.Hour)
	x.R.CheckUpdate()
	if gh.count() != base+1 || x.R.UpdateStatus() != nil {
		t.Fatal("asked before Retry-After")
	}
	n.Clock.Add(time.Hour + time.Second)
	x.R.CheckUpdate()
	if gh.count() != base+2 || x.R.UpdateStatus() == nil {
		t.Fatal("not asked after Retry-After")
	}
	// 403 saying nothing: six hours, then twelve; a success clears it, and the release is kept.
	gh.set(http.StatusForbidden, `{"message":"rate limit"}`, nil)
	n.Clock.Add(time.Second)
	x.R.CheckUpdate() // a success just before: asked
	if gh.count() != base+3 {
		t.Fatal("not asked")
	}
	n.Clock.Add(6*time.Hour - time.Minute)
	x.R.CheckUpdate()
	if gh.count() != base+3 {
		t.Fatal("asked within six hours of a 403")
	}
	n.Clock.Add(2 * time.Minute)
	x.R.CheckUpdate() // a second 403: twelve hours
	n.Clock.Add(11 * time.Hour)
	x.R.CheckUpdate()
	if gh.count() != base+4 {
		t.Fatalf("asked %d", gh.count()-base)
	}
	if h := x.R.UpdateStatus(); h == nil || h.Version != "3.6.0" {
		t.Fatalf("the last release was dropped: %+v", h)
	}
	gh.release("3.6.1")
	n.Clock.Add(time.Hour + time.Second)
	x.R.CheckUpdate()
	if h := x.R.UpdateStatus(); gh.count() != base+5 || h == nil || h.Version != "3.6.1" {
		t.Fatalf("%+v", h)
	}
	if !strings.Contains(x.Log.String(), "update: GitHub releases not read") {
		t.Fatal("not logged")
	}
}

func TestPeerVersionsInStatusAndOwnEntry(t *testing.T) {
	n := rt.New(t)
	n.Release = "3.5.0"
	a := n.Found("two-nodes", "open")
	n.Release = "3.6.0"
	y := n.AddNode(a, "two-nodes2")
	x := a.Nodes[0]
	rt.Eventually(t, "the first node knows what the second runs", func() bool {
		for _, p := range x.R.Status()["peers"].([]map[string]any) {
			if p["node"] == y.Key.Key && p["relay"] == "3.6.0" {
				return true
			}
		}
		return false
	})
	for _, e := range catalogOf(t, x) {
		m := e.(map[string]any)
		if p := m["path"].([]any); p[0] != a.ID {
			continue
		}
		if im := implsOf(m); im[x.Key.Key] != "3.5.0" || im[y.Key.Key] != "3.6.0" || len(im) != 2 {
			t.Fatalf("own entry impl: %v", m["impl"])
		}
		return
	}
	t.Fatal("no own entry")
}

// implsOf reads a catalog entry's impl list: node key -> version.
func implsOf(entry map[string]any) map[string]string {
	out := map[string]string{}
	list, _ := entry["impl"].([]any)
	for _, x := range list {
		m, _ := x.(map[string]any)
		k, _ := m["node"].(string)
		if r := update.ReadImpl(x); r != nil && k != "" {
			out[k] = r.Version
		}
	}
	return out
}

func TestNotifyURLOncePerVersion(t *testing.T) {
	old := update.Backoff
	update.Backoff = []time.Duration{10 * time.Millisecond, 10 * time.Millisecond}
	defer func() { update.Backoff = old }()
	n := rt.New(t)
	var mu sync.Mutex
	var got []map[string]any
	fail := 1 // the first attempt fails: retried
	hook := n.Serve("hook", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if fail > 0 {
			fail--
			http.Error(w, "busy", http.StatusBadGateway)
			return
		}
		var m map[string]any
		_ = json.NewDecoder(r.Body).Decode(&m)
		got = append(got, m)
	}))
	count := func() int { mu.Lock(); defer mu.Unlock(); return len(got) }
	gh := newFakeGitHub(n)
	n.Release = "3.5.0"
	a := n.Found("notified", "open")
	x := a.Nodes[0]
	feed := `{"v":1,"version":"3.6.0","released":"2026-11-12","security":true,"notes":"https://example.com/n"}`
	withFeed(t, x, feed, func(c *config.Config) { c.NotifyURL = hook + "/tubes" })
	rt.Eventually(t, "the hook was told", func() bool { return count() == 1 })
	mu.Lock()
	m := got[0]
	mu.Unlock()
	if m["server"] != a.ID || m["version"] != "3.6.0" || m["running"] != "3.5.0" || m["security"] != true || m["notes"] != "https://example.com/n" || len(m) != 5 {
		t.Fatalf("notice %v", m)
	}
	rt.Eventually(t, "delivery noted", func() bool { return strings.Contains(x.Log.String(), "update notice: delivered") })
	// Checked again, and after a restart: told once only.
	x.R.CheckUpdate()
	x.Restart()
	x.R.CheckUpdate()
	time.Sleep(200 * time.Millisecond)
	if count() != 1 {
		t.Fatalf("told %d times", count())
	}
	// A newer version is told.
	if err := os.WriteFile(filepath.Join(filepath.Dir(x.Cfg.Registry), "relay.json"),
		[]byte(strings.Replace(feed, "3.6.0", "3.6.1", 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	x.R.CheckUpdate()
	rt.Eventually(t, "the hook was told of 3.6.1", func() bool { return count() == 2 })
	// relay.json gone, GitHub has a newer release: told of it once, too.
	if err := os.Remove(filepath.Join(filepath.Dir(x.Cfg.Registry), "relay.json")); err != nil {
		t.Fatal(err)
	}
	gh.release("3.7.0")
	x.R.CheckUpdate()
	rt.Eventually(t, "the hook was told of 3.7.0", func() bool { return count() == 3 })
	rt.Eventually(t, "delivery of 3.7.0 noted", func() bool { return strings.Count(x.Log.String(), "update notice: delivered") == 3 })
	x.R.CheckUpdate()
	time.Sleep(200 * time.Millisecond)
	mu.Lock()
	m = got[2]
	mu.Unlock()
	if count() != 3 || m["version"] != "3.7.0" || m["security"] != false || m["notes"] != "https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.7.0" {
		t.Fatalf("told %d times, %v", count(), m)
	}
}

func TestNotifyURLChecked(t *testing.T) {
	for u, ok := range map[string]bool{"https://hooks.example.com/x?t=1": true, "http://hooks.example.com/x": false,
		"https://user:pw@hooks.example.com/": false, "hooks.example.com": false, "": true} {
		c := config.Default()
		c.NotifyURL = u
		if err := c.Check(); (err == nil) != ok {
			t.Errorf("notifyURL %q: %v", u, err)
		}
	}
}

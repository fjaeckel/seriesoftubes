// Package update tells a relay's operators that a newer relay exists. Versions come from GitHub
// (docs/RELAY.md "Update notices"): first relay.json beside servers.json on the site, the only
// source that can say a release fixes a security issue; when that cannot be read, the project's
// latest release from GitHub's public API. Nothing is sent but a plain GET: no server, no player.
package update

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Name is the implementation name a relay sends in welcome (9.3, 9.4).
const Name = "tubes-relay"

// MaxFeed bounds relay.json; anything bigger is not the feed.
const MaxFeed = 4096

// Ver is a semantic version (semver.org 2.0); build metadata is dropped.
type Ver struct {
	Major, Minor, Patch uint64
	Pre                 []string
}

var semverRe = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)

// Parse reads a semantic version: "dev" and anything else that is not one gives false.
func Parse(s string) (Ver, bool) {
	if len(s) > 40 {
		return Ver{}, false
	}
	m := semverRe.FindStringSubmatch(s)
	if m == nil {
		return Ver{}, false
	}
	var v Ver
	var err error
	for i, p := range []*uint64{&v.Major, &v.Minor, &v.Patch} {
		if *p, err = strconv.ParseUint(m[i+1], 10, 64); err != nil {
			return Ver{}, false
		}
	}
	if m[4] != "" {
		v.Pre = strings.Split(m[4], ".")
	}
	return v, true
}

// Cmp orders two versions: -1, 0 or 1. A pre-release sorts before its release.
func (a Ver) Cmp(b Ver) int {
	for _, d := range [][2]uint64{{a.Major, b.Major}, {a.Minor, b.Minor}, {a.Patch, b.Patch}} {
		if d[0] != d[1] {
			if d[0] < d[1] {
				return -1
			}
			return 1
		}
	}
	switch {
	case len(a.Pre) == 0 && len(b.Pre) == 0:
		return 0
	case len(a.Pre) == 0:
		return 1
	case len(b.Pre) == 0:
		return -1
	}
	for i := 0; i < len(a.Pre) && i < len(b.Pre); i++ {
		if c := preCmp(a.Pre[i], b.Pre[i]); c != 0 {
			return c
		}
	}
	switch {
	case len(a.Pre) < len(b.Pre):
		return -1
	case len(a.Pre) > len(b.Pre):
		return 1
	}
	return 0
}

// preCmp: numeric identifiers by value and before alphanumeric ones, the rest in byte order.
func preCmp(a, b string) int {
	na, ea := strconv.ParseUint(a, 10, 64)
	nb, eb := strconv.ParseUint(b, 10, 64)
	switch {
	case ea == nil && eb == nil:
		if na == nb {
			return 0
		}
		if na < nb {
			return -1
		}
		return 1
	case ea == nil:
		return -1
	case eb == nil:
		return 1
	}
	return strings.Compare(a, b)
}

// Newer reports whether version a is newer than b; false when either is not a semantic version.
func Newer(a, b string) bool {
	va, ok1 := Parse(a)
	vb, ok2 := Parse(b)
	return ok1 && ok2 && va.Cmp(vb) > 0
}

// Feed is relay.json, written by the site build from package.json and the CHANGELOG.
type Feed struct {
	V        int    `json:"v"`
	Version  string `json:"version"`  // the newest release
	Released string `json:"released"` // its date, YYYY-MM-DD
	Security bool   `json:"security"` // it fixes a relay security issue
	Notes    string `json:"notes"`    // its GitHub release, https only
	// MinSafe, optional: the newest release that fixed a relay security issue. A relay older than
	// it misses that fix, even when the newest release is not itself a security release.
	MinSafe string `json:"minSafe,omitempty"`
	// Source is where it came from: "feed" (relay.json) or "github" (the releases API).
	Source string `json:"-"`
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ParseFeed reads relay.json. Members it does not know are ignored; a notes URL that is not
// https is dropped rather than shown.
func ParseFeed(b []byte) (*Feed, error) {
	if len(b) > MaxFeed {
		return nil, errors.New("relay.json is too big")
	}
	var f Feed
	if err := json.Unmarshal(b, &f); err != nil {
		return nil, fmt.Errorf("relay.json: %w", err)
	}
	if f.V != 1 {
		return nil, fmt.Errorf("relay.json: version %d of the format", f.V)
	}
	if _, ok := Parse(f.Version); !ok {
		return nil, errors.New("relay.json: version is not a semantic version")
	}
	if !dateRe.MatchString(f.Released) {
		f.Released = ""
	}
	if !HTTPSURL(f.Notes) {
		f.Notes = ""
	}
	if _, ok := Parse(f.MinSafe); !ok {
		f.MinSafe = ""
	}
	f.Source = "feed"
	return &f, nil
}

// HTTPSURL reports whether s is an absolute https:// URL with a host, short enough to show.
func HTTPSURL(s string) bool {
	if s == "" || len(s) > 512 || strings.ContainsAny(s, " \t\r\n\"'<>\\`") {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil
}

// URLBeside is where relay.json is for a registry source: the same folder as servers.json,
// whether that is an https:// URL or a file. "" when there is no registry.
func URLBeside(registry string) string {
	if registry == "" {
		return ""
	}
	if strings.HasPrefix(registry, "https://") {
		u, err := url.Parse(registry)
		if err != nil {
			return ""
		}
		u.RawQuery, u.Fragment = "", ""
		if i := strings.LastIndex(u.Path, "/"); i >= 0 {
			u.Path = u.Path[:i+1] + "relay.json"
		} else {
			u.Path = "/relay.json"
		}
		u.RawPath = ""
		return u.String()
	}
	return filepath.Join(filepath.Dir(registry), "relay.json")
}

// Hint is an update this relay should get.
type Hint struct {
	Version  string `json:"version"`
	Security bool   `json:"security"`
	Notes    string `json:"notes,omitempty"`
	Released string `json:"released,omitempty"`
	// Source: "feed" (relay.json) or "github" (GitHub's releases API; never a security hint).
	Source string `json:"source"`
}

// Same reports whether two hints say the same thing (nil for none).
func (h *Hint) Same(o *Hint) bool {
	if h == nil || o == nil {
		return h == o
	}
	return *h == *o
}

// Text is the line `relay status` and the log show.
func (h *Hint) Text() string {
	s := "update available: " + h.Version
	if h.Security {
		s += " (security)"
	}
	if h.Source == "github" {
		s += " (from GitHub releases)"
	}
	if h.Notes != "" {
		s += " " + h.Notes
	}
	return s
}

// FromFeed is the hint for a relay running own, or nil when it is up to date or a development
// build (own is not a semantic version). Only relay.json can make it a security hint.
func FromFeed(own string, f *Feed) *Hint {
	if f == nil || !Newer(f.Version, own) {
		return nil
	}
	src := f.Source
	if src == "" {
		src = "feed"
	}
	sec := src == "feed" && (f.Security || f.MinSafe != "" && Newer(f.MinSafe, own))
	return &Hint{Version: f.Version, Security: sec, Notes: f.Notes, Released: f.Released, Source: src}
}

// Repo is the project on GitHub. ReleasesURL, its latest release in GitHub's REST API, is derived
// from it here and nowhere else.
const Repo = "fjaeckel/seriesoftubes"

// ReleasesURL is asked only when relay.json cannot be read.
const ReleasesURL = "https://api.github.com/repos/" + Repo + "/releases/latest"

// MaxRelease bounds the API's answer (a release with long notes is a few tens of KB).
const MaxRelease = 256 << 10

// ReleaseTimeout bounds one request to the API.
var ReleaseTimeout = 15 * time.Second

// ParseRelease reads GitHub's latest release as a feed: tag_name, with a leading "v" dropped, must
// be a semantic version; html_url is kept as the notes only when it is an https:// page on
// github.com. It never says security: only relay.json does.
func ParseRelease(b []byte) (*Feed, error) {
	if len(b) > MaxRelease {
		return nil, errors.New("release: too big")
	}
	var x struct {
		Tag        string `json:"tag_name"`
		HTML       string `json:"html_url"`
		Published  string `json:"published_at"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err := json.Unmarshal(b, &x); err != nil {
		return nil, fmt.Errorf("release: %w", err)
	}
	if x.Draft || x.Prerelease {
		return nil, errors.New("release: a draft or pre-release")
	}
	v := strings.TrimPrefix(x.Tag, "v")
	if _, ok := Parse(v); !ok {
		return nil, errors.New("release: tag is not a semantic version")
	}
	f := &Feed{V: 1, Version: v, Source: "github"}
	if GitHubPage(x.HTML) {
		f.Notes = x.HTML
	}
	if len(x.Published) >= 10 && dateRe.MatchString(x.Published[:10]) {
		f.Released = x.Published[:10]
	}
	return f, nil
}

// GitHubPage reports whether s is an https:// page on github.com.
func GitHubPage(s string) bool {
	if !HTTPSURL(s) {
		return false
	}
	u, _ := url.Parse(s)
	return u.Host == "github.com"
}

// LimitedError is a 403 or 429 from the API: ask again no sooner than Wait from now (0: the
// answer did not say; the caller backs off on its own).
type LimitedError struct {
	Status string
	Wait   time.Duration
}

func (e *LimitedError) Error() string { return "release: " + e.Status }

// FetchRelease asks GitHub's API for the latest release: one unauthenticated GET whose only
// header about this relay is a plain User-Agent with its version.
func FetchRelease(ctx context.Context, c *http.Client, target, own string, now time.Time) (*Feed, error) {
	if c == nil {
		c = http.DefaultClient
	}
	ctx, cancel := context.WithTimeout(ctx, ReleaseTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", Name+"/"+own)
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests:
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, &LimitedError{Status: resp.Status, Wait: limitWait(resp.Header, now)}
	case resp.StatusCode != http.StatusOK:
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("release: %s", resp.Status)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, MaxRelease+1))
	if err != nil {
		return nil, err
	}
	return ParseRelease(b)
}

// MaxWait caps how long a rate limit keeps the relay from asking again.
const MaxWait = 48 * time.Hour

// limitWait is what Retry-After or an exhausted x-ratelimit-reset ask for (0 when neither does).
func limitWait(h http.Header, now time.Time) time.Duration {
	var d time.Duration
	if s, err := strconv.ParseInt(strings.TrimSpace(h.Get("Retry-After")), 10, 64); err == nil && s > 0 {
		d = time.Duration(min(s, int64(MaxWait/time.Second))) * time.Second
	}
	if h.Get("X-Ratelimit-Remaining") == "0" {
		if t, err := strconv.ParseInt(strings.TrimSpace(h.Get("X-Ratelimit-Reset")), 10, 64); err == nil {
			if r := time.Unix(t, 0).Sub(now); r > d {
				d = min(r, MaxWait)
			}
		}
	}
	return d
}

// Notice is what notifyURL receives: the server, never an address or a player.
type Notice struct {
	Server   string `json:"server"`
	Running  string `json:"running"`
	Version  string `json:"version"`
	Security bool   `json:"security"`
	Notes    string `json:"notes,omitempty"`
}

// Backoff is the wait before each retry of a notice (a var so tests shorten it).
var Backoff = []time.Duration{30 * time.Second, 2 * time.Minute, 10 * time.Minute}

// NotifyTimeout bounds each attempt.
var NotifyTimeout = 10 * time.Second

// Notify POSTs one notice, retrying with Backoff; nil once an attempt got a 2xx answer.
func Notify(ctx context.Context, c *http.Client, target string, n Notice) error {
	if c == nil {
		c = http.DefaultClient
	}
	body, err := json.Marshal(n)
	if err != nil {
		return err
	}
	var last error
	for i := 0; i <= len(Backoff); i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(Backoff[i-1]):
			}
		}
		if last = post(ctx, c, target, body); last == nil {
			return nil
		}
	}
	return last
}

func post(ctx context.Context, c *http.Client, target string, body []byte) error {
	ctx, cancel := context.WithTimeout(ctx, NotifyTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", Name)
	resp, err := c.Do(req)
	if err != nil {
		// The error names the URL, which the operator configured: no one else's address.
		return err
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("notify: %s", resp.Status)
	}
	return nil
}

// Impl is what a node says it runs (welcome and hello `impl`, catalog entries' `impl`).
type Impl struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

var implRe = regexp.MustCompile(`^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$`)

// ReadImpl reads an impl member leniently: nil when absent or malformed (it is informational).
func ReadImpl(v any) *Impl {
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	n, _ := m["name"].(string)
	ver, _ := m["version"].(string)
	if !implRe.MatchString(n) || !implRe.MatchString(ver) {
		return nil
	}
	return &Impl{Name: n, Version: ver}
}

// MaxImpls bounds a catalog entry's impl list (a server has at most 16 nodes).
const MaxImpls = 16

// ReadImpls reads a catalog entry's impl member leniently (10.8): a list of at most MaxImpls
// items, each {node, name, version} for a node isNode accepts; anything else is left out, and
// a list that is not one or is too long gives nil. The server that emitted the entry sets it,
// no one signs it, and it is only ever shown.
func ReadImpls(v any, isNode func(string) bool) map[string]*Impl {
	list, ok := v.([]any)
	if !ok || len(list) > MaxImpls {
		return nil
	}
	var out map[string]*Impl
	for _, x := range list {
		m, _ := x.(map[string]any)
		k, _ := m["node"].(string)
		im := ReadImpl(x)
		if im == nil || !isNode(k) {
			continue
		}
		if out == nil {
			out = map[string]*Impl{}
		}
		out[k] = im
	}
	return out
}

// Value is the impl as a frame member.
func (i *Impl) Value() map[string]any { return map[string]any{"name": i.Name, "version": i.Version} }

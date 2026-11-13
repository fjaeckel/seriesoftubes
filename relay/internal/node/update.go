package node

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
)

// Update notices (docs/RELAY.md): versions come from GitHub. relay.json beside the registry, read
// on the registry's schedule; when it cannot be read, the latest release from GitHub's API. What
// other servers' nodes run (gossip) is only ever shown, never a hint. Operators hear of it in the
// log, the metrics, `relay status`, an `update` frame to their game sessions and, when
// configured, one POST.

// updState is what this node knows of newer relays (guarded by r.mu).
type updState struct {
	feed     *update.Feed // the last relay.json that read well (memory only)
	gh       *update.Feed // the last GitHub release read while relay.json could not be (memory only)
	ghNext   int64        // GitHub is not asked again before this (after a 403 or 429)
	ghBack   int64        // the current back-off after a 403 or 429, seconds
	hint     *update.Hint // the update this node should get, nil when none
	warned   int64        // when the log last said so
	notified string       // the version notifyURL was told of (kept in update.json)
	sending  string       // a notice under way
}

// warnEvery: the log says it at start and then at most once a day.
const warnEvery = 86400

// ghBackMin is the first back-off after GitHub limits this relay without saying for how long;
// it doubles up to update.MaxWait.
const ghBackMin = 6 * 3600

// version is what this node runs ("dev" for a build without one).
func (r *Relay) version() string {
	if r.o.Version == "" {
		return "dev"
	}
	return r.o.Version
}

func (r *Relay) implValue() map[string]any { return r.impl.Value() }

func (r *Relay) updatePath() string { return filepath.Join(r.o.Dir, "update.json") }

func (r *Relay) loadUpdateState() {
	b, err := os.ReadFile(r.updatePath())
	if err != nil {
		return
	}
	var x struct {
		Notified string `json:"notified"`
	}
	if json.Unmarshal(b, &x) == nil {
		if _, ok := update.Parse(x.Notified); ok {
			r.upd.notified = x.Notified
		}
	}
}

// checkUpdate reads relay.json beside the registry, or GitHub's latest release when that cannot
// be read, and works out the hint again.
func (r *Relay) checkUpdate() {
	r.mu.Lock()
	src := update.URLBeside(r.cfg.Registry)
	r.mu.Unlock()
	read := false
	if src != "" {
		var b []byte
		var err error
		if strings.HasPrefix(src, "https://") {
			b, err = r.fetch(src)
		} else {
			b, err = os.ReadFile(src)
		}
		var f *update.Feed
		if err == nil {
			f, err = update.ParseFeed(b)
		}
		if err != nil {
			r.o.Log.Info("update feed: not read", "err", err)
		} else {
			read = true
			r.mu.Lock()
			// relay.json is the authority again: a release read from GitHub meanwhile is dropped.
			r.upd.feed, r.upd.gh = f, nil
			r.mu.Unlock()
		}
	}
	if !read {
		r.checkReleases()
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.setHint(r.now())
}

// releasesURL is GitHub's latest-release API, or what the options put instead (tests).
func (r *Relay) releasesURL() string {
	if r.o.ReleasesURL != "" {
		return r.o.ReleasesURL
	}
	return update.ReleasesURL
}

// checkReleases asks GitHub for the latest release, unless a 403 or 429 said to wait. A failure
// keeps the last release read.
func (r *Relay) checkReleases() {
	now := r.now()
	r.mu.Lock()
	wait := now < r.upd.ghNext
	r.mu.Unlock()
	if wait {
		return
	}
	f, err := update.FetchRelease(r.ctx, r.o.HTTPClient, r.releasesURL(), r.version(), time.Unix(now, 0))
	r.mu.Lock()
	defer r.mu.Unlock()
	var lim *update.LimitedError
	switch {
	case errors.As(err, &lim):
		r.upd.ghBack = min(max(2*r.upd.ghBack, ghBackMin), int64(update.MaxWait/time.Second))
		w := max(int64(lim.Wait/time.Second), r.upd.ghBack)
		r.upd.ghNext = now + w
		r.o.Log.Info("update: GitHub releases not read", "err", err, "next", time.Unix(r.upd.ghNext, 0).UTC().Format(time.RFC3339))
	case err != nil:
		r.o.Log.Info("update: GitHub releases not read", "err", err)
	default:
		r.upd.gh, r.upd.ghBack, r.upd.ghNext = f, 0, 0
	}
}

// latest is the release the hint comes from (lock held): relay.json, unless it could not be read
// lately and GitHub has a newer release; nil when neither was ever read.
func (r *Relay) latest() *update.Feed {
	f, g := r.upd.feed, r.upd.gh
	if f == nil || g != nil && update.Newer(g.Version, f.Version) {
		return g
	}
	return f
}

// setHint works out the hint from the latest release and tells everyone who should hear of a
// change (lock held).
func (r *Relay) setHint(now int64) {
	own := r.version()
	h := update.FromFeed(own, r.latest())
	changed := !h.Same(r.upd.hint)
	r.upd.hint = h
	r.updMetrics()
	if h == nil {
		return
	}
	if changed || now-r.upd.warned >= warnEvery {
		r.upd.warned = now
		r.o.Log.Warn("relay update available", "running", own, "version", h.Version, "security", h.Security,
			"source", h.Source, "notes", h.Notes)
	}
	if changed {
		for s := range r.clients {
			r.sendUpdate(s)
		}
	}
	if r.cfg.NotifyURL != "" && h.Version != r.upd.notified && h.Version != r.upd.sending {
		r.notify(h)
	}
}

func (r *Relay) updMetrics() {
	m := r.o.Metrics
	if m == nil {
		return
	}
	h := r.upd.hint
	avail := map[string]float64{"true": 0, "false": 0}
	latest := map[string]float64{}
	if h != nil {
		if h.Security {
			avail["true"] = 1
		} else {
			avail["false"] = 1
		}
		latest[h.Version] = 1
	} else if f := r.latest(); f != nil {
		latest[f.Version] = 1
	}
	m.Set("relay_update_available", "1 when a newer relay is out, by whether it fixes a security issue.", "security", avail)
	m.Set("relay_latest_version_info", "The newest relay version known (relay.json, else GitHub releases).", "version", latest)
}

// sendUpdate tells a client session that proved an operator key of this server about the hint,
// once per hint (lock held). Other sessions never get it.
func (r *Relay) sendUpdate(s *session) {
	h := r.upd.hint
	if h == nil || s.node || !r.operator(s) {
		return
	}
	k := h.Version + "|" + h.Source
	if h.Security {
		k += "|s"
	}
	if s.updSent == k {
		return
	}
	s.updSent = k
	m := map[string]any{"m": "update", "version": h.Version, "security": h.Security, "source": h.Source}
	if h.Notes != "" {
		m["notes"] = h.Notes
	}
	s.enqueue(m)
}

// notify POSTs the hint to notifyURL once per version, retrying in the background (lock held).
func (r *Relay) notify(h *update.Hint) {
	if r.ctx.Err() != nil {
		return
	}
	target, server, ver := r.cfg.NotifyURL, r.cfg.Server, h.Version
	r.upd.sending = ver
	n := update.Notice{Server: server, Running: r.version(), Version: ver, Security: h.Security, Notes: h.Notes}
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		err := update.Notify(r.ctx, r.o.HTTPClient, target, n)
		r.mu.Lock()
		defer r.mu.Unlock()
		r.upd.sending = ""
		if err != nil {
			// Not marked: the next check tries again.
			r.o.Log.Info("update notice: not delivered", "version", ver)
			return
		}
		r.upd.notified = ver
		b, _ := json.Marshal(map[string]string{"notified": ver})
		if err := store.WriteAtomic(r.updatePath(), append(b, '\n'), 0o600); err != nil {
			r.o.Log.Error("update notice: state not saved", "err", err)
		}
		r.o.Log.Info("update notice: delivered", "version", ver)
	}()
}

// UpdateStatus is the hint for `relay status` (nil when up to date or unknown).
func (r *Relay) UpdateStatus() *update.Hint {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.upd.hint
}

// CheckUpdate reads the feed now (tests and the command line).
func (r *Relay) CheckUpdate() { r.checkUpdate() }

// ownImpls is what this server's nodes run, as far as this node knows: itself and the nodes of
// its server it has a session with (lock held). Only listed nodes.
func (r *Relay) ownImpls() map[string]*update.Impl {
	out := map[string]*update.Impl{r.o.Node.Key: r.impl}
	for s := range r.nodes {
		if s.same && s.impl != nil && r.own != nil && r.own.IsNode(s.peerNode) {
			out[s.peerNode] = s.impl
		}
	}
	return out
}

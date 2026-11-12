package node

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
)

// Update notices (docs/RELAY.md): relay.json beside the registry, read on the registry's schedule;
// gossip from other servers when it cannot be had. Operators hear of it in the log, the metrics,
// `relay status`, an `update` frame to their game sessions and, when configured, one POST.

// updState is what this node knows of newer relays (guarded by r.mu).
type updState struct {
	feed     *update.Feed // the last relay.json that read well (memory only)
	hint     *update.Hint // the update this node should get, nil when none
	warned   int64        // when the log last said so
	notified string       // the version notifyURL was told of (kept in update.json)
	sending  string       // a notice under way
}

// warnEvery: the log says it at start and then at most once a day.
const warnEvery = 86400

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

// checkUpdate reads relay.json beside the registry and works out the hint again.
func (r *Relay) checkUpdate() {
	r.mu.Lock()
	src := update.URLBeside(r.cfg.Registry)
	r.mu.Unlock()
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
			r.mu.Lock()
			r.upd.feed = f
			r.mu.Unlock()
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.setHint(r.now())
}

// gossipVersions is, per version, the other servers whose nodes report it (lock held).
func (r *Relay) gossipVersions(now int64) map[string]map[string]bool {
	out := map[string]map[string]bool{}
	self := ""
	if r.own != nil {
		self = r.own.ID
	}
	for id, c := range r.cat {
		if id == self || now >= c.Seen+fed.GossipExpiry {
			continue
		}
		for _, im := range c.Impl {
			if im.Name != update.Name {
				continue
			}
			if out[im.Version] == nil {
				out[im.Version] = map[string]bool{}
			}
			out[im.Version][id] = true
		}
	}
	return out
}

// setHint works out the hint from the feed, else from gossip, and tells everyone who should
// hear of a change (lock held).
func (r *Relay) setHint(now int64) {
	own := r.version()
	var h *update.Hint
	if r.upd.feed != nil {
		h = update.FromFeed(own, r.upd.feed)
	} else {
		h = update.FromGossip(own, r.gossipVersions(now))
	}
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
	if r.cfg.NotifyURL != "" && h.Source == "feed" && h.Version != r.upd.notified && h.Version != r.upd.sending {
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
	} else if r.upd.feed != nil {
		latest[r.upd.feed.Version] = 1
	}
	m.Set("relay_update_available", "1 when a newer relay is out, by whether it fixes a security issue.", "security", avail)
	m.Set("relay_latest_version_info", "The newest relay version known (relay.json, or gossip from other servers).", "version", latest)
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

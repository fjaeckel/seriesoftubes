package node

import (
	"slices"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

// Automatic sync among registry servers (10.9 "Who connects"): an open server in the registry
// snapshot syncs with every other open, live one (or, past fed.AutoPeers, with its neighbours in
// a graph every server computes alike). Of each pair the lower identity dials; the higher one dials
// too when the pair has had no session for fed.AutoFallback seconds (a lower server whose relay
// does not dial, an older one or one with autoSync off), and one-session-per-pair keeps one.

// autoCap is fed.AutoPeers; a var for tests.
var autoCap = fed.AutoPeers

// autoPrefix marks the dialer of an automatic peer in r.dialers (configured ones are keyed by URL).
const autoPrefix = "auto:"

// setAuto recomputes this server's automatic peers (lock held): none unless this node serves,
// its server's own policy is open, the snapshot lists it as eligible and the config does not
// turn it off (autoSync: false; peers may still dial in, as open allows).
func (r *Relay) setAuto() {
	r.auto = nil
	if !r.serving() || r.ownSync() != "open" || r.reg == nil || !r.cfg.Auto() {
		return
	}
	peers := registry.AutoPeers(registry.AutoEligible(r.reg), r.own.ID, autoCap)
	if len(peers) == 0 {
		return
	}
	r.auto = map[string]bool{}
	for _, p := range peers {
		r.auto[p] = true
	}
}

// autoDialer reports whether this node dials its server's automatic peers (lock held): the node
// whose key sorts first among this node and the nodes of its server it has a session with. If
// that node goes away, the next one takes over; a node that has not met its siblings yet dials
// meanwhile, and stops once a lower one is up.
func (r *Relay) autoDialer() bool {
	me := r.Key()
	for s := range r.nodes {
		if s.same && s.verified && s.peerNode < me && r.own.IsNode(s.peerNode) {
			return false
		}
	}
	return true
}

// fallback reports whether this node, the higher identity of the pair, dials the automatic peer p
// (lock held, called on every reconcile): once it has had no session with p for fed.AutoFallback
// seconds by the relay's clock, counted from when p became its peer or the last session with p
// ended, and for as long as the session it dialled that way is up. When the peer dials in, the
// dialer stops (dedupe keeps the session the lower identity dialled, if both are up at once).
func (r *Relay) fallback(p string) bool {
	key := autoPrefix + p
	if r.hasPeer(p) {
		delete(r.quiet, p)
		for s := range r.nodes {
			if s.dialer == key && s.verified && s.peerServer == p {
				return true
			}
		}
		return false
	}
	if r.quiet == nil {
		r.quiet = map[string]int64{}
	}
	since, ok := r.quiet[p]
	if !ok {
		r.quiet[p] = r.now()
		return false
	}
	return r.now()-since >= fed.AutoFallback
}

// autoURLs are the node URLs of a server, sorted by node key (lock taken): an automatic dialer
// goes through them in turn.
func (r *Relay) autoURLs(server string) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	st := r.lookup(server)
	if st == nil {
		return nil
	}
	nodes := slices.Clone(st.Nodes)
	slices.SortFunc(nodes, func(a, b chain.Node) int { return strings.Compare(a.Key, b.Key) })
	var out []string
	for _, n := range nodes {
		out = append(out, n.URL)
	}
	return out
}

// serverOfURL is the server one of whose nodes has this URL, as far as this node knows (lock held).
func (r *Relay) serverOfURL(url string) string {
	if id, ok := r.urlSrv[url]; ok {
		return id
	}
	for id, e := range r.regs {
		for _, n := range e.State.Nodes {
			if n.URL == url {
				return id
			}
		}
	}
	for id, c := range r.cat {
		for _, n := range c.State.Nodes {
			if n.URL == url {
				return id
			}
		}
	}
	return ""
}

// hasPeer reports whether a session with a node of another server is up (lock held).
func (r *Relay) hasPeer(server string) bool {
	for s := range r.nodes {
		if !s.same && s.verified && s.peerServer == server {
			return true
		}
	}
	return false
}

// dedupe keeps one session per pair of servers (lock held), called as s is verified: of two
// sessions with the same server, the one dialled by the lower identity stays (the same choice on
// both sides); when both were dialled by the same side, the older one. It reports whether s stays.
func (r *Relay) dedupe(s *session) bool {
	if s.same || r.own == nil {
		return true
	}
	byLower := func(x *session) bool { return (x.dialURL != "") == (r.own.ID < x.peerServer) }
	for o := range r.nodes {
		if o == s || o.same || !o.verified || o.peerServer != s.peerServer {
			continue
		}
		if byLower(s) && !byLower(o) {
			r.o.Log.Info("sync: one session per server, closing the other", "server", s.peerServer, "node", o.peerNode)
			o.close("duplicate")
			continue
		}
		r.o.Log.Info("sync: one session per server, closing this one", "server", s.peerServer, "node", s.peerNode)
		s.close("duplicate")
		return false
	}
	return true
}

// AutoStatus is what `relay status` shows of the automatic peers (lock held): each one, whether
// this node dials it (else it waits for the peer, or a sibling node dials; "this node (fallback)"
// when the peer has not dialled for fed.AutoFallback seconds), and whether a session is up.
func (r *Relay) autoStatus() []map[string]any {
	out := []map[string]any{}
	dialer := r.own != nil && r.autoDialer()
	for _, id := range sortedKeys(r.auto) {
		name := ""
		if e, ok := r.regs[id]; ok {
			name = e.Name()
		}
		by := "peer"
		if _, ok := r.dialers[autoPrefix+id]; ok && dialer && !registry.Dials(r.own.ID, id) {
			by = "this node (fallback)"
		}
		if registry.Dials(r.own.ID, id) {
			by = "sibling"
			if dialer {
				by = "this node"
			}
		}
		out = append(out, map[string]any{"server": id, "name": name, "dials": by, "up": r.hasPeer(id)})
	}
	return out
}

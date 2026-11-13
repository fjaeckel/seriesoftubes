package node

import (
	"context"
	"crypto/rand"
	"math/big"
	"slices"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// verifyTimeout is how long a peer of an unknown server has to send its own entry (a var for
// tests); maxHeld bounds the bytes of its frames held meanwhile; maxUnverified bounds the sessions
// with servers this node does not know yet, so they never take the slots of servers it knows.
var verifyTimeout = 30 * time.Second

const (
	maxHeld       = 1 << 20
	maxUnverified = 8
)

func nonce() string {
	var b [32]byte
	_, _ = rand.Read(b[:])
	return fed.Encode(b[:])
}

// answerNode is the answering side of a node handshake (9.4).
func (r *Relay) answerNode(s *session, h *wire.Hello) {
	r.mu.Lock()
	ok := r.serving() && r.nodeRoom(h.Server)
	own := r.cfg.Server
	r.mu.Unlock()
	if !ok {
		s.fail(0, fed.NotReady, 0)
		return
	}
	mine := nonce()
	now := r.now()
	s.ver, s.impl, s.feats = h.Ver, h.Impl, h.Feats
	s.enqueue(map[string]any{"m": "welcome", "ver": h.Ver, "server": own, "node": r.Key(), "nonce": mine,
		"proof": r.o.Node.MakeProof(h.Nonce, own, now), "impl": r.implValue(), "feats": feats()})
	ctx, cancel := context.WithTimeout(s.ctx, handshakeTimeout)
	f, ok := s.readFrame(ctx)
	cancel()
	if !ok {
		return
	}
	if f.M != "proof" {
		s.fail(0, fed.NotReady, 0)
		return
	}
	pv, code := canon.Check(f.Raw["proof"])
	if code == "" {
		code = fed.CheckProof(pv, mine, h.Server, h.Node, r.now())
	}
	if code != "" {
		s.fail(0, fed.BadChallenge, 0)
		return
	}
	r.runPeer(s, h.Server, h.Node)
}

// dialNode connects to another node and runs the session until it ends; dialer is the key of
// the dialer in r.dialers.
func (r *Relay) dialNode(ctx context.Context, dialer, url string) error {
	c, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPClient: r.o.HTTPClient, Subprotocols: []string{fed.Subprotocol}})
	if err != nil {
		return err
	}
	if c.Subprotocol() != fed.Subprotocol {
		c.CloseNow()
		return errClosed
	}
	s := newSession(r, c, true)
	s.dialURL, s.dialer = url, dialer
	defer s.end()
	r.mu.Lock()
	own := r.cfg.Server
	r.mu.Unlock()
	mine := nonce()
	vers := make([]any, len(r.speaks))
	for i, v := range r.speaks {
		vers[i] = v
	}
	s.enqueue(map[string]any{"m": "hello", "vers": vers, "role": "node", "server": own, "node": r.Key(), "nonce": mine, "impl": r.implValue(), "feats": feats()})
	hctx, cancel := context.WithTimeout(s.ctx, handshakeTimeout)
	f, ok := s.readFrame(hctx)
	cancel()
	if !ok {
		return errClosed
	}
	if f.M != "welcome" {
		code, _ := f.Str("code")
		r.o.Log.Info("sync: refused by peer", "url", url, "code", code)
		return errClosed
	}
	ver, _ := wire.Int(f.Raw["ver"])
	server, _ := f.Str("server")
	node, _ := f.Str("node")
	theirs, _ := f.Str("nonce")
	pv, code := canon.Check(f.Raw["proof"])
	if code == "" {
		code = fed.CheckProof(pv, mine, server, node, r.now())
	}
	if code != "" || !slices.Contains(r.speaks, ver) || !fed.IsID(theirs) {
		s.fail(0, fed.BadChallenge, 0)
		return errClosed
	}
	if node == r.Key() {
		return errClosed // dialled ourselves
	}
	s.ver, s.impl, s.feats = ver, update.ReadImpl(f.Raw["impl"]), wire.Feats(f.Raw["feats"])
	r.mu.Lock()
	r.urlSrv[url] = server
	r.mu.Unlock()
	s.enqueue(map[string]any{"m": "proof", "proof": r.o.Node.MakeProof(theirs, own, r.now())})
	r.runPeer(s, server, node)
	return nil
}

// nodeRoom reports whether a session with a node of server may start (lock held). This server's
// own nodes always may: they are few, and must never be locked out by others. Other servers share
// MaxNodes, and servers this node knows nothing of yet (which may be made up) at most maxUnverified.
func (r *Relay) nodeRoom(server string) bool {
	if r.own != nil && server == r.own.ID {
		return true
	}
	// Automatic peers are registry servers, at most fed.AutoPeers of them, one session each:
	// they have room of their own, so servers that dial in unasked never take theirs.
	if r.auto[server] {
		return true
	}
	others, unverified := 0, 0
	for s := range r.nodes {
		if !s.same && !r.auto[s.peerServer] {
			others++
			if !s.verified {
				unverified++
			}
		}
	}
	if others >= r.cfg.Limits.MaxNodes {
		return false
	}
	return r.lookup(server) != nil || unverified < min(maxUnverified, r.cfg.Limits.MaxNodes)
}

// runPeer applies policy and membership checks, then syncs until the session ends.
func (r *Relay) runPeer(s *session, server, node string) {
	s.peerServer, s.peerNode = server, node
	r.mu.Lock()
	s.same = r.own != nil && server == r.own.ID
	if s.same {
		if !r.own.IsNode(node) {
			r.mu.Unlock()
			s.fail(0, fed.NotNode, 0)
			return
		}
		s.verified = true
		s.send, s.take = config.Classes, config.Classes
	} else {
		peerSync := r.syncOf(server)
		if !allowsOne(r.ownSync(), r.cfg.Selective, server, peerSync) {
			r.mu.Unlock()
			r.o.Log.Info("sync: refused by policy", "server", server)
			s.fail(0, fed.Policy, 0)
			return
		}
		if st := r.lookup(server); st != nil {
			if !st.IsNode(node) {
				r.mu.Unlock()
				s.fail(0, fed.NotNode, 0)
				return
			}
			s.verified = true
		}
		r.setClasses(s, r.lookup(server))
	}
	if s.verified && !r.dedupe(s) {
		r.mu.Unlock()
		return
	}
	r.nodes[s] = true
	if s.same {
		// Which node of this server dials the automatic peers depends on which siblings are up.
		r.reconcileLocked()
	}
	r.o.Metrics.Inc("relay_connections_total", "node")
	r.o.Metrics.Inc("relay_syncs_total", "")
	// Our own entry first: it tells a peer that does not know us who our nodes are.
	if e := r.ownEntry(r.now()); e != nil {
		s.enqueue(map[string]any{"m": "catalog", "entries": []any{e}})
	}
	if s.verified {
		r.startSync(s)
	}
	r.mu.Unlock()
	r.o.Log.Info("sync: session up", "server", server, "node", node, "same", s.same)
	defer func() {
		r.mu.Lock()
		delete(r.nodes, s)
		if s.same {
			r.reconcileLocked()
		}
		r.mu.Unlock()
		r.o.Log.Info("sync: session down", "server", server, "node", node)
	}()
	if !s.verified {
		// The peer's entry must come in time, whether or not it sends anything else meanwhile.
		t := time.AfterFunc(verifyTimeout, func() {
			r.mu.Lock()
			v := s.verified
			r.mu.Unlock()
			if !v {
				s.fail(0, fed.NotNode, 0)
			}
		})
		defer t.Stop()
	}
	var held []*wire.Frame
	heldBytes := 0
	for {
		f, ok := s.readFrame(s.ctx)
		if !ok {
			return
		}
		if werr := wire.CheckNode(f); werr != nil {
			s.fail(f.ID, werr.Code, 0)
			if werr.Close {
				return
			}
			continue
		}
		if !s.pace(nodeCost(f)) {
			return
		}
		r.mu.Lock()
		verified := s.verified
		r.mu.Unlock()
		if !verified && f.M != "catalog" && f.M != "ping" && f.M != "pong" && f.M != "err" {
			// The peer may have verified us first: keep its frames until its entry arrives.
			heldBytes += s.size
			if len(held) >= 64 || heldBytes > maxHeld {
				s.fail(0, fed.NotNode, 0)
				return
			}
			held = append(held, f)
			continue
		}
		if !r.nodeFrame(s, f) {
			return
		}
		if !verified && len(held) > 0 {
			r.mu.Lock()
			verified = s.verified
			r.mu.Unlock()
			if verified {
				for _, h := range held {
					if !r.nodeFrame(s, h) {
						return
					}
				}
				held, heldBytes = nil, 0
			}
		}
	}
}

// setClasses sets what a session with another server's node sends and takes (lock held): a
// neighbour's classes when the session is with a server one of whose nodes is a neighbour,
// whichever side dialled; else every class for an automatic peer (10.9); else the defaults for
// servers that connect and are not neighbours. st is what this node knows of the peer's server, or nil.
func (r *Relay) setClasses(s *session, st *chain.State) {
	s.send, s.take = config.Or(r.cfg.DefaultSend), config.Or(r.cfg.DefaultTake)
	n := r.cfg.Neighbour(s.dialURL)
	if n == nil && st != nil {
		for _, x := range st.Nodes {
			if n == nil {
				n = r.cfg.Neighbour(x.URL)
			}
		}
	}
	switch {
	case n != nil:
		s.send, s.take = config.Or(n.Send), config.Or(n.Take)
	case r.auto[s.peerServer]:
		s.send, s.take = config.Classes, config.Classes
	}
}

// allowsOne is this side's half of 10.9; the peer applies its own half.
func allowsOne(own string, list []string, other, otherSync string) bool {
	switch own {
	case "selective":
		return slices.Contains(list, other)
	case "open":
		return otherSync != "standalone"
	}
	return false
}

// startSync sends carry (lock held).
func (r *Relay) startSync(s *session) {
	since := int64(0)
	if t, ok := r.lastSyn[s.peerNode]; ok {
		since = max(0, fed.Slot(t)-3600)
	}
	r.lastSyn[s.peerNode] = r.now()
	if !s.same && hasClass(s.send, "catalog") {
		// A new neighbour hears every entry this node keeps, passed on as from here.
		var list []map[string]any
		for _, k := range sortedKeys(r.cat) {
			c := r.cat[k]
			if k == s.peerServer || len(c.Path) >= fed.MaxPath || slices.Contains(c.Path, s.peerServer) {
				continue
			}
			list = append(list, c.value(append(slices.Clone(c.Path), r.own.ID)))
		}
		for _, p := range pageItems(list, fed.MaxItems, fed.NodeFrame-64<<10) {
			if len(p) > 0 {
				s.enqueue(map[string]any{"m": "catalog", "entries": p})
			}
		}
	} else if s.same {
		// A node of this server hears every entry this node keeps, with the path it came by: it
		// may have no session with those servers itself (one session per pair of servers).
		var list []map[string]any
		for _, k := range sortedKeys(r.cat) {
			if c := r.cat[k]; !slices.Contains(c.Path, r.own.ID) {
				list = append(list, c.value(c.Path))
			}
		}
		for _, p := range pageItems(list, fed.MaxItems, fed.NodeFrame-64<<10) {
			if len(p) > 0 {
				s.enqueue(map[string]any{"m": "catalog", "entries": p})
			}
		}
	}
	cl := make([]any, len(s.send))
	for i, c := range s.send {
		cl[i] = c
	}
	s.enqueue(map[string]any{"m": "carry", "classes": cl, "since": since})
}

// nodeFrame handles one sync message; false ends the session.
func (r *Relay) nodeFrame(s *session, f *wire.Frame) bool {
	now := r.now()
	switch f.M {
	case "ping":
		s.enqueue(map[string]any{"m": "pong", "id": f.ID, "now": now})
	case "pong":
	case "err":
		code, _ := f.Str("code")
		r.o.Log.Info("sync: peer reported", "code", code)
	case "carry":
		since, _ := wire.Int(f.Raw["since"])
		ids := r.inventory(s, since) // returns with the lock held
		for i := 0; i < len(ids) || i == 0; i += fed.MaxInv {
			end := min(i+fed.MaxInv, len(ids))
			s.enqueue(map[string]any{"m": "inv", "ids": strList(ids[i:end]), "more": end < len(ids)})
		}
		s.synced = true
		r.queueAllStates(s)
		if s.same {
			// Signatures added to a proposal or server record keep its id, so an inventory
			// cannot show them: push this server's multi-signer records anyway; copies merge.
			var items []map[string]any
			for _, k := range []string{"operators", "server"} {
				for e := range r.st.Kind(k) {
					if r.own != nil && r.st.Rec(e).Str("server") == r.own.ID {
						if it := r.item(e); it != nil {
							items = append(items, it)
						}
					}
				}
			}
			for _, p := range pageItems(items, fed.MaxItems, fed.NodeFrame-64<<10) {
				if len(p) > 0 {
					s.enqueue(map[string]any{"m": "push", "items": p})
				}
			}
		}
		r.mu.Unlock()
	case "inv":
		ids, _ := f.Strs("ids")
		r.mu.Lock()
		var want []string
		for _, id := range ids {
			if fed.IsID(id) && r.st.Get(id) == nil && !r.refused[id] && !s.wanted[id] {
				want = append(want, id)
				s.wanted[id] = true
			}
		}
		if len(s.wanted) > maxWanted {
			// Only a guard against asking twice: forgetting it costs at most a duplicate push.
			s.wanted = map[string]bool{}
		}
		r.mu.Unlock()
		if len(want) > 0 {
			s.enqueue(map[string]any{"m": "want", "ids": strList(want)})
		}
	case "want":
		ids, _ := f.Strs("ids")
		r.mu.Lock()
		var list []*store.Entry
		for _, id := range ids {
			if e := r.st.Get(id); e != nil && s.sends(e.Kind) && !r.shunned[e.Key] {
				list = append(list, e)
			}
		}
		// Pushed a page at a time as the peer reads (pump), never the whole answer at once.
		r.queuePush(s, list)
		r.mu.Unlock()
	case "push":
		list, _ := f.Raw["items"].([]any)
		for _, x := range list {
			r.takePushed(s, x, now)
		}
	case "states":
		r.nodeStates(s, f, now)
	case "catalog":
		entries, _ := f.Raw["entries"].([]any)
		for _, x := range entries {
			r.mu.Lock()
			verified := s.verified
			r.mu.Unlock()
			if !verified && !entryOf(x, s.peerServer) {
				// Until the peer is known, only its own entry is read (9.4): nothing else it
				// says is checked, stored or passed on.
				continue
			}
			if code := r.receiveEntry(s, x, now); code != "" {
				// A refused entry is not a refused frame: the session goes on (too_big included).
				s.r.o.Metrics.Inc("relay_refused_total", code)
				s.enqueue(map[string]any{"m": "err", "code": code})
			}
		}
	}
	return true
}

// invChunk is how many entries the inventory visits per hold of the lock; a var for tests.
var invChunk = 4096

// invPause, when set (tests), runs between inventory chunks with the lock released.
var invPause func()

// inventory lists the ids a carry answers with, in storage order. It walks the store a chunk at
// a time and lets the lock go in between, so a big store does not stall writers while a session
// starts. It returns with the lock held after the last chunk: the caller marks the session synced
// in the same hold, so a record stored after the walk reaches the peer by fanout instead.
func (r *Relay) inventory(s *session, since int64) []string {
	var ids []string
	var after uint64
	for {
		r.mu.Lock()
		n, done := 0, true
		r.st.Scan(after, nil, func(e *store.Entry) bool {
			if n == invChunk {
				done = false
				return false
			}
			n++
			after = e.Seq
			if e.Slot >= since && s.sends(e.Kind) && !r.shunned[e.Key] && classOrChain(e, r) {
				ids = append(ids, e.ID)
			}
			return true
		})
		if done {
			return ids
		}
		r.mu.Unlock()
		if invPause != nil {
			invPause()
		}
	}
}

// maxWanted bounds the ids a session remembers having asked for.
const maxWanted = 1 << 16

// maxRefused bounds the ids remembered as refused, whatever peers push between retention runs.
var maxRefused = 1 << 16

// refuse remembers an id not to ask peers for again (lock held). Only a guard against asking
// twice: when the set is full it starts over, which costs at most a record checked again.
func (r *Relay) refuse(id string) {
	if len(r.refused) >= maxRefused {
		clear(r.refused)
	}
	r.refused[id] = true
}

// classOrChain: chain records travel only between nodes of this server, and only this server's.
func classOrChain(e *store.Entry, r *Relay) bool {
	switch e.Kind {
	case "genesis", "operators", "server":
		return r.own != nil && (e.ID == r.own.ID || r.st.Rec(e).Str("server") == r.own.ID)
	}
	return true
}

func strList(ids []string) []any {
	out := make([]any, len(ids))
	for i, id := range ids {
		out[i] = id
	}
	return out
}

// takePushed checks one pushed item like a record from a client (7.1) and stores it.
func (r *Relay) takePushed(s *session, x any, now int64) {
	m, ok := x.(map[string]any)
	if !ok {
		return
	}
	rec, code := fed.CheckLoose(m["rec"], now, fed.Opts{})
	if code != "" {
		r.o.Log.Info("sync: dropped record", "code", code)
		r.o.Metrics.Inc("relay_refused_total", code)
		return
	}
	c := classOf(rec.Kind)
	if !s.same && c != "always" && (c == "" || !slices.Contains(s.take, c)) {
		return
	}
	var rcpts []any
	if list, ok := m["rcpt"].([]any); ok {
		for _, rv := range list {
			if v, code := canon.Check(rv); code == "" {
				rcpts = append(rcpts, v)
			}
		}
	}
	_, _, code = r.ingest(rec, rcpts, origin{peer: s, same: s.same})
	r.mu.Lock()
	delete(s.wanted, rec.ID)
	// unknown_server is not for good: the server may be learned later.
	if code != "" && code != fed.UnknownSrv {
		r.refuse(rec.ID)
	}
	r.mu.Unlock()
	if code != "" {
		r.o.Log.Info("sync: dropped record", "kind", rec.Kind, "key", rec.Key, "code", code)
	}
}

// reconcile starts and stops outgoing sessions to match the config and the node list.
func (r *Relay) reconcile() {
	r.mu.Lock()
	r.reconcileLocked()
	r.mu.Unlock()
}

func (r *Relay) reconcileLocked() {
	if r.ctx.Err() != nil {
		return
	}
	r.setAuto()
	// Dialers by key: a node URL (this server's nodes, configured neighbours), or autoPrefix and
	// the identity of an automatic peer.
	want := map[string]bool{}
	if r.serving() {
		for _, n := range r.own.Nodes {
			// Of two nodes of one server, the one with the lower key dials.
			if n.Key != r.Key() && r.Key() < n.Key {
				want[n.URL] = true
			}
		}
		if r.ownSync() != "standalone" {
			for _, n := range r.cfg.Neighbours {
				// A neighbour that is also an automatic peer gets the one automatic session
				// (with the neighbour's classes), dialled by whichever server is lower.
				if !r.auto[r.serverOfURL(n.URL)] {
					want[n.URL] = true
				}
			}
		}
		dialer := r.autoDialer()
		for p := range r.quiet {
			// Counted afresh when a peer comes back, or when this node takes over from a sibling.
			if !r.auto[p] || !dialer {
				delete(r.quiet, p)
			}
		}
		if len(r.auto) > 0 && dialer {
			for p := range r.auto {
				if registry.Dials(r.own.ID, p) || r.fallback(p) {
					want[autoPrefix+p] = true
				}
			}
		}
	} else if r.cfg.Server != "" {
		r.bootstrapLocked()
	}
	for key, stop := range r.dialers {
		if !want[key] && key != "bootstrap" {
			stop()
			delete(r.dialers, key)
			for s := range r.nodes {
				if s.dialer == key {
					s.close("")
				}
			}
		}
	}
	for key := range want {
		if _, ok := r.dialers[key]; ok {
			continue
		}
		ctx, cancel := context.WithCancel(r.ctx)
		r.dialers[key] = cancel
		urls := func() []string { return []string{key} }
		if p, ok := strings.CutPrefix(key, autoPrefix); ok {
			urls = func() []string { return r.autoURLs(p) }
		}
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()
			r.dialLoop(ctx, key, urls)
		}()
	}
}

// Backoff of outgoing sessions: doubling from 1 s to 30 min, with jitter.
func backoff(base time.Duration, n int) time.Duration {
	d := base << min(max(n, 0), 11)
	d = min(d, 30*time.Minute)
	j, _ := rand.Int(rand.Reader, big.NewInt(int64(d/5)+1))
	return d - d/10 + time.Duration(j.Int64())
}

// dialLoop keeps a session up through one of urls (asked again before each attempt), moving on
// to the next URL after each failure. It does not dial a server it already has a session with
// (one session per pair of servers) and looks again later.
func (r *Relay) dialLoop(ctx context.Context, key string, urls func() []string) {
	fails, next := 0, 0
	for ctx.Err() == nil {
		if list := urls(); len(list) == 0 {
			fails++
		} else {
			url := list[next%len(list)]
			r.mu.Lock()
			srv := r.serverOfURL(url)
			busy := srv != "" && (r.own == nil || srv != r.own.ID) && r.hasPeer(srv)
			r.mu.Unlock()
			if busy {
				select {
				case <-ctx.Done():
					return
				case <-time.After(backoff(r.o.DialBase, 5)):
				}
				continue
			}
			start := time.Now()
			dctx, cancel := context.WithTimeout(ctx, handshakeTimeout)
			err := r.dialOnce(ctx, dctx, key, url)
			cancel()
			if err == nil && time.Since(start) > time.Minute {
				fails = 0
			} else {
				fails++
				next++
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff(r.o.DialBase, fails-1)):
		}
	}
}

func (r *Relay) dialOnce(ctx, dctx context.Context, key, url string) error {
	// The dial itself is bounded by dctx; the session lives with ctx.
	done := make(chan error, 1)
	go func() { done <- r.dialNode(dctx, key, url) }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// bootstrapLocked learns this server's chain from its seeds and other nodes until this
// node is on the list (relay join). It runs at most one fetch at a time.
func (r *Relay) bootstrapLocked() {
	if _, ok := r.dialers["bootstrap"]; ok {
		return
	}
	ctx, cancel := context.WithCancel(r.ctx)
	r.dialers["bootstrap"] = cancel
	seeds := slices.Clone(r.cfg.Seeds)
	if r.own != nil {
		for _, n := range r.own.Nodes {
			seeds = append(seeds, n.URL)
		}
	}
	server := r.cfg.Server
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		for _, u := range seeds {
			if ctx.Err() != nil {
				return
			}
			r.fetchChain(ctx, u, server)
		}
		r.mu.Lock()
		delete(r.dialers, "bootstrap")
		r.mu.Unlock()
		select {
		case <-ctx.Done():
		case <-time.After(r.o.BootstrapEvery):
			r.reconcile()
		}
	}()
}

func (r *Relay) fetchChain(ctx context.Context, url, server string) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cl, err := client.Dial(ctx, url, client.Options{HTTPClient: r.o.HTTPClient})
	if err != nil {
		return
	}
	defer cl.Close()
	if cl.Welcome.Server != server {
		return
	}
	items, _ := cl.Collect(ctx, map[string]any{"m": "sub", "kinds": []any{"genesis", "operators", "server"}, "since": ""})
	// The genesis first, so the chain records find their server.
	slices.SortStableFunc(items, func(a, b map[string]any) int {
		ka := kindOfItem(a)
		kb := kindOfItem(b)
		return kindOrder(ka) - kindOrder(kb)
	})
	for _, it := range items {
		rec, code := fed.CheckLoose(it["rec"], r.now(), fed.Opts{})
		if code != "" {
			continue
		}
		rc, _ := it["rcpt"].([]any)
		var rcpts []any
		for _, x := range rc {
			if v, code := canon.Check(x); code == "" {
				rcpts = append(rcpts, v)
			}
		}
		r.ingest(rec, rcpts, origin{boot: true})
	}
}

func kindOfItem(it map[string]any) string {
	m, _ := it["rec"].(map[string]any)
	k, _ := m["kind"].(string)
	return k
}

func kindOrder(k string) int {
	switch k {
	case "genesis":
		return 0
	case "operators":
		return 1
	}
	return 2
}

package node

import (
	"context"
	"errors"
	"io"
	"net/http"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/privacy"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// Timeouts (9.1) and per-connection bounds.
const (
	handshakeTimeout = 10 * time.Second
	writeTimeout     = 10 * time.Second
	idlePing         = 60 * time.Second
	idleClose        = 120 * time.Second
	clientQueueBytes = 4 << 20
	nodeQueueBytes   = 32 << 20
	queueFrames      = 1024
	maxSubs          = 16
	// Answers that take many frames (backlogs, catalogs, pushes for want) are sent a page
	// at a time, the next one only when the queue is below this, so they never fill the queue.
	clientLowWater = 256 << 10
	nodeLowWater   = 2 << 20
	maxPending     = 8       // answers a client may have waiting to be paged
	maxPushQueue   = 1 << 17 // records waiting to be pushed to a node
	// Node frames are paced, never refused: the reader waits for tokens (cost per frame below).
	nodeRate  = 5000.0
	nodeBurst = 50000.0
)

// Request costs in a client's token bucket: the ones that answer from the whole store cost more.
var clientCost = map[string]float64{"auth": 2, "rank": 10, "rankwhy": 5, "facets": 5, "nets": 5, "servers": 10, "sub": 5, "unsub": 2, "fetch": 2}

// session is one WebSocket connection, client or node.
type session struct {
	r      *Relay
	c      *websocket.Conn
	node   bool
	limit  int
	out    chan []byte
	queued atomic.Int64
	maxQ   int64
	ctx    context.Context
	cancel context.CancelFunc
	once   sync.Once
	heard  atomic.Int64 // unix nanos of the last frame received
	pinged atomic.Bool
	pingID atomic.Int64
	ending atomic.Bool   // a closing err frame is queued
	wdone  chan struct{} // closed when the writer stops
	ver    int64
	lowQ   int64
	size   int // bytes of the last frame read (the reader's own)

	// answers being paged (guarded by r.mu); hasPend mirrors len(pend) > 0 for the writer
	pend    []pager
	hasPend atomic.Bool
	yield   bool // the last page stopped at maxScan (guarded by r.mu)

	// client
	cc      string         // the connection's country, never its address
	subs    map[int64]*sub // (guarded by r.mu)
	proved  []string       // keys this session proved with auth, at most 4 (guarded by r.mu)
	exSent  bool           // the excluded list follows this session (guarded by r.mu)
	excl    *exclPager     // an excluded answer not yet started, brought up to date rather than queued again (guarded by r.mu)
	tokens  float64
	tokenAt time.Time

	// node
	peerServer string
	peerNode   string
	same       bool
	verified   bool            // the peer node is known to be a node of its server
	synced     bool            // carry exchanged: live pushes flow
	send, take []string        // classes
	wanted     map[string]bool // ids asked for and not yet pushed (guarded by r.mu, bounded)
	push       *listPager      // records waiting to be pushed for want (guarded by r.mu)
	dialURL    string
	dialer     string          // the r.dialers key of the dialer that made this session, when this node dialled
	impl       *update.Impl    // what the peer node runs, when it said (informational)
	feats      []string        // optional messages the peer node takes (9.4 feats)
	stPend     map[string]bool // keys whose newest live state goes to this peer next (guarded by r.mu)

	// client: its own token bucket for live states (states.go)
	stTok float64
	stAt  time.Time

	updSent string // the update hint this operator session was last sent (guarded by r.mu)
}

// sub is one client subscription.
type sub struct {
	kinds map[string]bool
	list  []string
	live  bool // the backlog is sent: live records follow
}

func newSession(r *Relay, c *websocket.Conn, node bool) *session {
	ctx, cancel := context.WithCancel(r.ctx)
	s := &session{r: r, c: c, node: node, limit: fed.ClientFrame, out: make(chan []byte, queueFrames),
		maxQ: clientQueueBytes, lowQ: clientLowWater, ctx: ctx, cancel: cancel, subs: map[int64]*sub{},
		wanted: map[string]bool{}, tokenAt: time.Now(), wdone: make(chan struct{})}
	s.tokens = float64(4 * r.cfg.Limits.MsgsPerSec)
	if node {
		s.becomeNode()
	}
	s.heard.Store(time.Now().UnixNano())
	c.SetReadLimit(-1) // frames are limited by our own reader, so we can answer too_big first
	go s.writer()
	go s.watch()
	return s
}

func (s *session) becomeNode() {
	s.node = true
	s.limit = fed.NodeFrame
	s.maxQ = nodeQueueBytes
	s.lowQ = nodeLowWater
	s.tokens = nodeBurst
}

// pace waits until a node frame of this cost may be handled; false when the session ended.
func (s *session) pace(cost float64) bool {
	now := time.Now()
	s.tokens = min(nodeBurst, s.tokens+now.Sub(s.tokenAt).Seconds()*nodeRate)
	s.tokenAt = now
	s.tokens -= cost
	if s.tokens >= 0 {
		return true
	}
	select {
	case <-s.ctx.Done():
		return false
	case <-time.After(time.Duration(-s.tokens / nodeRate * float64(time.Second))):
		return true
	}
}

// nodeCost weighs a node frame by the work it asks for: a token per signature to verify (records
// and their receipts in items; genesis, chain and server record of each entry, which may carry
// over a thousand), and ids to look up.
func nodeCost(f *wire.Frame) float64 {
	n := func(k string) float64 { l, _ := f.Raw[k].([]any); return float64(len(l)) }
	cost := 1 + n("ids")/64
	items, _ := f.Raw["items"].([]any)
	for _, x := range items {
		m, _ := x.(map[string]any)
		rc, _ := m["rcpt"].([]any)
		cost += float64(sigCount(m["rec"]) + len(rc))
	}
	entries, _ := f.Raw["entries"].([]any)
	for _, x := range entries {
		m, _ := x.(map[string]any)
		sigs := sigCount(m["genesis"]) + sigCount(m["server"])
		ch, _ := m["chain"].([]any)
		for _, y := range ch {
			sigs += sigCount(y)
		}
		cost += float64(sigs)
	}
	return cost
}

// sigCount is how many signatures a record (a loose value) asks to verify: at least one.
func sigCount(v any) int {
	m, _ := v.(map[string]any)
	if l, ok := m["sigs"].([]any); ok && len(l) > 0 {
		return len(l)
	}
	return 1
}

// pager produces a long answer one frame at a time (lock held); done when nothing follows.
type pager interface {
	next(r *Relay, s *session) (frame map[string]any, done bool)
}

// pump queues pages while the connection keeps up (lock held). The writer calls it again as the
// queue drains, so a long answer costs the queue one page at a time.
func (r *Relay) pump(s *session) {
	for len(s.pend) > 0 && s.queued.Load() < s.lowQ && s.ctx.Err() == nil {
		f, done := s.pend[0].next(r, s)
		if done {
			s.pend = s.pend[1:]
		}
		if f != nil && !s.enqueue(f) {
			s.pend = nil
		}
		if s.yield {
			// A page that stopped at maxScan: let the lock go; the writer pumps again once the
			// frame is out.
			s.yield = false
			if f != nil {
				break
			}
		}
	}
	s.hasPend.Store(len(s.pend) > 0)
}

// later queues an answer to be paged (lock held).
func (r *Relay) later(s *session, p pager) {
	s.pend = append(s.pend, p)
	r.pump(s)
}

// listPager pages a list fixed when asked: fetch and catalog answers, pushes for want.
type listPager struct {
	rid     int64
	m       string // recs, catalog or push
	entries []*store.Entry
	vals    []map[string]any
	pos     int
	slot    int64 // a rankwhy answer: the running slot its records are for
	at      int64 // a rankwhy answer for the measure now: the time of its snapshot
}

func (p *listPager) next(r *Relay, s *session) (map[string]any, bool) {
	limit := fed.ClientFrame - 1024
	if p.m == "push" {
		limit = fed.NodeFrame - 64<<10
	}
	n := len(p.entries) + len(p.vals)
	page := []any{}
	size := 0
	for p.pos < n {
		var v map[string]any
		if p.pos < len(p.vals) {
			v = p.vals[p.pos]
		} else if e := p.entries[p.pos-len(p.vals)]; r.st.Get(e.ID) == e && !r.shunned[e.Key] && r.shows(s, e) {
			v = r.item(e)
		}
		if v == nil {
			p.pos++
			continue
		}
		b := itemSize(v)
		if b > limit {
			p.pos++ // could never be sent: no page is ever over the frame limit
			continue
		}
		if len(page) > 0 && (len(page) >= fed.MaxItems || size+b > limit) {
			break
		}
		page = append(page, v)
		size += b + 1
		p.pos++
	}
	done := p.pos >= n
	switch p.m {
	case "push":
		if done && s.push == p {
			s.push = nil
		}
		if len(page) == 0 {
			return nil, done
		}
		r.o.Metrics.Add("relay_records_out_total", "", float64(len(page)))
		return map[string]any{"m": "push", "items": page}, done
	case "catalog":
		return map[string]any{"m": "catalog", "id": p.rid, "entries": page, "more": !done}, done
	}
	r.o.Metrics.Add("relay_records_out_total", "", float64(len(page)))
	m := map[string]any{"m": "recs", "id": p.rid, "items": page, "cursor": "", "more": !done}
	if p.slot != 0 {
		m["slot"] = p.slot
	}
	if p.at != 0 {
		m["at"] = p.at
	}
	return m, done
}

// subPager sends a subscription's backlog by scanning the store from a cursor, a page at a time.
// Each page carries the cursor of what it covers, so a client that drops mid-backlog resumes there;
// the last page makes the subscription live under the same lock, so nothing falls between.
type subPager struct {
	rid   int64
	after uint64
}

// maxScan bounds the records one backlog page visits (a var for tests).
var maxScan = 4096

func (p *subPager) next(r *Relay, s *session) (map[string]any, bool) {
	sb := s.subs[p.rid]
	if sb == nil {
		return nil, true // unsubscribed meanwhile
	}
	page := []any{}
	size := 0
	last, full := p.after, false
	if len(sb.list) == 0 {
		// No kind this node knows: nothing to send, ever (a nil list would scan every kind).
		sb.live = true
		return map[string]any{"m": "recs", "id": p.rid, "items": page, "cursor": r.cursor(r.st.Seq()), "more": false}, true
	}
	visited := 0
	r.st.Scan(p.after, sb.list, func(e *store.Entry) bool {
		// Records this session may not see are skipped, but only so many per page: the lock is
		// held while scanning, and the rest waits for the next page (more: true, cursor moved on).
		if visited++; visited > maxScan {
			full, s.yield = true, true
			return false
		}
		it := map[string]any(nil)
		if !r.shunned[e.Key] && r.shows(s, e) {
			it = r.item(e)
		}
		if it == nil {
			last = e.Seq
			return true
		}
		b := itemSize(it)
		if len(page) > 0 && (len(page) >= fed.MaxItems || size+b > fed.ClientFrame-1024) {
			full = true
			return false
		}
		page = append(page, it)
		size += b + 1
		last = e.Seq
		return true
	})
	if !full {
		last = r.st.Seq()
		sb.live = true
	}
	p.after = last
	r.o.Metrics.Add("relay_records_out_total", "", float64(len(page)))
	return map[string]any{"m": "recs", "id": p.rid, "items": page, "cursor": r.cursor(last), "more": full}, !full
}

// exclPager sends the server's excluded networks (9.3 excluded), a page at a time; reasons go in the
// first frame, to a session that proved an excluded key only.
type exclPager struct {
	keys    []string
	reasons []string
	pos     int
	started bool
}

func (p *exclPager) next(r *Relay, s *session) (map[string]any, bool) {
	if s.excl == p {
		s.excl = nil // started: a change from now on queues a new answer
	}
	limit := fed.ClientFrame - 1024
	page := []any{}
	size := 0
	for p.pos < len(p.keys) {
		b := len(p.keys[p.pos]) + 3
		if len(page) > 0 && size+b > limit {
			break
		}
		page = append(page, p.keys[p.pos])
		size += b
		p.pos++
	}
	done := p.pos >= len(p.keys)
	m := map[string]any{"m": "excluded", "keys": page, "more": !done}
	if !p.started && len(p.reasons) > 0 {
		rs := make([]any, len(p.reasons))
		for i, x := range p.reasons {
			rs[i] = x
		}
		m["reasons"] = rs
	}
	p.started = true
	return m, done
}

// queuePush adds records to push to a node for its want (lock held).
func (r *Relay) queuePush(s *session, list []*store.Entry) {
	if len(list) == 0 {
		return
	}
	if s.push == nil {
		s.push = &listPager{m: "push"}
		s.pend = append(s.pend, s.push)
	}
	s.push.entries = append(s.push.entries, list...)
	if len(s.push.entries)-s.push.pos > maxPushQueue {
		s.close("slow")
		return
	}
	r.pump(s)
}

// enqueue queues a frame; a peer that does not keep up is disconnected, never waited for.
func (s *session) enqueue(m map[string]any) bool {
	b := canon.Encode(m)
	if s.queued.Add(int64(len(b))) > s.maxQ {
		s.close("slow")
		return false
	}
	select {
	case s.out <- b:
		return true
	default:
		s.close("slow")
		return false
	}
}

// fail sends an err frame; codes that close the connection close it after the frame.
func (s *session) fail(id int64, code string, retry int64) {
	m := map[string]any{"m": "err", "code": code}
	if id > 0 {
		m["id"] = id
	}
	if retry > 0 {
		m["retry"] = retry
	}
	s.r.o.Metrics.Inc("relay_refused_total", code)
	if !wire.Closes(code) {
		s.enqueue(m)
		return
	}
	s.ending.Store(true)
	b := canon.Encode(m)
	select {
	case s.out <- b:
	default:
	}
	select {
	case s.out <- nil: // the writer closes after sending what is queued
	default:
		s.close(code)
	}
}

// end closes the session when its handler returns, after a queued closing err is sent.
func (s *session) end() {
	if s.ending.Load() {
		select {
		case <-s.wdone:
		case <-time.After(writeTimeout):
		}
	}
	s.close("")
}

func (s *session) writer() {
	defer close(s.wdone)
	for {
		select {
		case <-s.ctx.Done():
			return
		case b := <-s.out:
			if b == nil {
				// Frames are written in order, so the err frame is already out.
				s.close("")
				return
			}
			ctx, cancel := context.WithTimeout(s.ctx, writeTimeout)
			err := s.c.Write(ctx, websocket.MessageText, b)
			cancel()
			s.queued.Add(-int64(len(b)))
			if err != nil {
				s.close("")
				return
			}
			if s.hasPend.Load() && s.queued.Load() < s.lowQ {
				s.r.mu.Lock()
				s.r.pump(s)
				s.r.mu.Unlock()
			}
		}
	}
}

// watch pings an idle peer after 60 s and closes after 120 s of silence.
func (s *session) watch() {
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-t.C:
			idle := time.Since(time.Unix(0, s.heard.Load()))
			if idle >= idleClose {
				s.close("idle")
				return
			}
			if idle >= idlePing && !s.pinged.Load() {
				s.pinged.Store(true)
				s.enqueue(map[string]any{"m": "ping", "id": s.pingID.Add(1)})
			}
		}
	}
}

func (s *session) close(string) {
	s.once.Do(func() {
		s.cancel()
		s.c.CloseNow()
	})
}

// read returns the next frame's text, or an error code to answer and close with.
func (s *session) read(ctx context.Context) ([]byte, string, error) {
	typ, rd, err := s.c.Reader(ctx)
	if err != nil {
		return nil, "", err
	}
	if typ != websocket.MessageText {
		return nil, "", errors.New("binary frame")
	}
	b, err := io.ReadAll(io.LimitReader(rd, int64(s.limit)+1))
	if err != nil {
		return nil, "", err
	}
	if len(b) > s.limit {
		return nil, fed.TooBig, nil
	}
	s.heard.Store(time.Now().UnixNano())
	s.pinged.Store(false)
	return b, "", nil
}

// readFrame reads and parses one frame; it answers and closes on frame errors.
func (s *session) readFrame(ctx context.Context) (*wire.Frame, bool) {
	b, code, err := s.read(ctx)
	if err != nil {
		s.close("")
		return nil, false
	}
	s.size = len(b)
	if code != "" {
		s.fail(0, code, 0)
		return nil, false
	}
	f, werr := wire.Parse(b, s.limit)
	if werr != nil {
		s.fail(0, werr.Code, 0)
		return nil, false
	}
	return f, true
}

// Handler serves the WebSocket endpoint.
func (r *Relay) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		r.mu.Lock()
		path := r.cfg.Path
		r.mu.Unlock()
		if req.URL.Path != path {
			http.NotFound(w, req)
			return
		}
		r.accept(w, req)
	})
	return mux
}

func offers(req *http.Request) bool {
	for _, v := range req.Header.Values("Sec-WebSocket-Protocol") {
		for _, p := range splitTokens(v) {
			if p == fed.Subprotocol {
				return true
			}
		}
	}
	return false
}

func splitTokens(v string) []string {
	var out []string
	cur := ""
	for _, c := range v {
		switch c {
		case ',':
			out = append(out, cur)
			cur = ""
		case ' ', '\t':
		default:
			cur += string(c)
		}
	}
	return append(out, cur)
}

func (r *Relay) accept(w http.ResponseWriter, req *http.Request) {
	if !offers(req) {
		http.Error(w, "subprotocol "+fed.Subprotocol+" required", http.StatusBadRequest)
		return
	}
	r.mu.Lock()
	trusted := r.cfg.Proxies()
	full := len(r.clients) >= r.cfg.Limits.MaxClients+r.cfg.Limits.MaxNodes
	r.mu.Unlock()
	if full {
		http.Error(w, "busy", http.StatusServiceUnavailable)
		return
	}
	// The address is used here, in memory, and dropped when this block ends.
	cc := ""
	{
		addr := privacy.ClientAddr(req, trusted)
		if addr.IsValid() && !r.limiter.Allow(addr, r.now()) {
			r.o.Metrics.Inc("relay_refused_total", fed.RateLimited)
			http.Error(w, "too many connections", http.StatusTooManyRequests)
			return
		}
		if r.o.Countries != nil && addr.IsValid() {
			cc = r.o.Countries.Country(addr)
		}
	}
	c, err := websocket.Accept(w, req, &websocket.AcceptOptions{
		Subprotocols: []string{fed.Subprotocol},
		// Browsers connect from the game's origin; no cookies or ambient authority exist.
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}
	s := newSession(r, c, false)
	s.cc = cc
	r.serve(s)
}

// serve runs an accepted connection until it ends.
func (r *Relay) serve(s *session) {
	defer s.end()
	hctx, cancel := context.WithTimeout(s.ctx, handshakeTimeout)
	f, ok := s.readFrame(hctx)
	cancel()
	if !ok {
		return
	}
	h, werr := wire.CheckClient(f, false, r.speaks)
	if werr != nil {
		s.fail(0, werr.Code, 0)
		return
	}
	if h.Role == "node" {
		s.becomeNode()
		r.answerNode(s, h)
		return
	}
	r.mu.Lock()
	ok = r.serving() && len(r.clients) < r.cfg.Limits.MaxClients
	if ok {
		r.clients[s] = true
	}
	r.mu.Unlock()
	if !ok {
		s.fail(0, fed.NotReady, 0)
		return
	}
	r.o.Metrics.Inc("relay_connections_total", "client")
	defer func() {
		r.mu.Lock()
		delete(r.clients, s)
		r.mu.Unlock()
	}()
	s.ver = h.Ver
	s.enqueue(map[string]any{"m": "welcome", "ver": h.Ver, "server": r.ServerID(), "node": r.Key(), "now": r.now(), "impl": r.implValue(), "feats": feats()})
	for {
		f, ok := s.readFrame(s.ctx)
		if !ok {
			return
		}
		if _, werr := wire.CheckClient(f, true, r.speaks); werr != nil {
			s.fail(f.ID, werr.Code, 0)
			if werr.Close {
				return
			}
			continue
		}
		cost, ok := clientCost[f.M]
		if !ok {
			cost = 1
		}
		if !s.allow(cost) {
			s.fail(f.ID, fed.RateLimited, 1)
			continue
		}
		r.clientFrame(s, f)
	}
}

// allow is a per-connection token bucket; requests cost by the work they ask for (clientCost).
func (s *session) allow(cost float64) bool {
	rate := float64(s.r.cfg.Limits.MsgsPerSec)
	now := time.Now()
	s.tokens = min(4*rate, s.tokens+now.Sub(s.tokenAt).Seconds()*rate)
	s.tokenAt = now
	if s.tokens < cost {
		return false
	}
	s.tokens -= cost
	return true
}

// clientFrame answers one client message (9.3).
func (r *Relay) clientFrame(s *session, f *wire.Frame) {
	now := r.now()
	switch f.M {
	case "ping":
		s.enqueue(map[string]any{"m": "pong", "id": f.ID, "now": now})
	case "pong", "err":
	case "auth":
		key, _ := f.Str("key")
		sig, _ := f.Str("sig")
		t, _ := wire.Int(f.Raw["t"])
		if code := fed.CheckAuth(key, t, sig, r.Key(), r.ServerID(), now); code != "" {
			s.fail(f.ID, code, 0)
			return
		}
		r.mu.Lock()
		defer r.mu.Unlock()
		if !slices.Contains(s.proved, key) {
			if len(s.proved) >= fed.MaxAuthKeys {
				s.fail(f.ID, fed.TooMany, 0)
				return
			}
			s.proved = append(s.proved, key)
		}
		s.enqueue(map[string]any{"m": "ack", "id": f.ID, "op": r.own != nil && r.own.IsOperator(key)})
		r.sendUpdate(s) // operators hear of a newer relay right after proving their key
		if s.exSent && r.isShunned(key) {
			r.sendExcluded(s, now) // the reasons are for this session now
		}
	case "challenge":
		nonce, _ := f.Str("nonce")
		if !fed.IsID(nonce) {
			s.fail(f.ID, fed.BadFrame, 0)
			return
		}
		s.enqueue(map[string]any{"m": "proof", "id": f.ID, "proof": r.o.Node.MakeProof(nonce, r.ServerID(), now)})
	case "put":
		rec, code := fed.CheckLoose(f.Raw["rec"], now, fed.Opts{})
		if code != "" {
			r.o.Log.Info("put refused", "code", code)
			s.fail(f.ID, code, 0)
			return
		}
		res, rcpt, code := r.ingest(rec, nil, origin{client: true, cc: s.cc})
		if code != "" {
			retry := int64(0)
			if code == fed.RateLimited {
				retry = fed.Slot(now) + fed.SlotLen - now
			}
			r.o.Log.Info("put refused", "kind", rec.Kind, "key", rec.Key, "code", code)
			s.fail(f.ID, code, retry)
			return
		}
		ack := map[string]any{"m": "ack", "id": f.ID, "rid": rec.ID, "dup": res == "duplicate"}
		if rcpt != nil {
			ack["rcpt"] = rcpt
		}
		s.enqueue(ack)
	case "cosign":
		rid, _ := f.Str("rid")
		key, _ := f.Str("key")
		sig, _ := f.Str("sig")
		res, code := r.Cosign(rid, key, sig)
		if code != "" {
			s.fail(f.ID, code, 0)
			return
		}
		s.enqueue(map[string]any{"m": "ack", "id": f.ID, "rid": rid, "dup": res == "duplicate"})
	case "sub":
		kinds, _ := f.Strs("kinds")
		since, _ := f.Str("since")
		r.subscribe(s, f.ID, kinds, since)
	case "unsub":
		r.mu.Lock()
		delete(s.subs, f.ID)
		r.mu.Unlock()
		s.enqueue(map[string]any{"m": "ack", "id": f.ID})
	case "fetch":
		ids, _ := f.Strs("ids")
		if len(ids) > fed.MaxItems {
			s.fail(f.ID, fed.TooMany, 0)
			return
		}
		r.mu.Lock()
		defer r.mu.Unlock()
		if !r.room(s, f.ID) {
			return
		}
		var list []*store.Entry
		for _, id := range ids {
			if e := r.st.Get(id); e != nil {
				list = append(list, e)
			}
		}
		r.later(s, &listPager{rid: f.ID, m: "recs", entries: list})
	case "rank", "facets", "nets", "rankwhy":
		r.rankFrame(s, f)
	case "state":
		r.clientState(s, f, now)
	case "servers":
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.room(s, f.ID) {
			r.later(s, &listPager{rid: f.ID, m: "catalog", vals: r.catalogEntries(now)})
		}
	}
}

// room reports whether a client may have one more answer waiting to be paged (lock held).
func (r *Relay) room(s *session, id int64) bool {
	if len(s.pend) >= maxPending {
		s.fail(id, fed.RateLimited, 1)
		return false
	}
	return true
}

// pageItems splits items into pages of at most n items and about limit bytes.
func pageItems(items []map[string]any, n, limit int) [][]any {
	pages := [][]any{}
	var cur []any
	size := 0
	for _, it := range items {
		b := itemSize(it)
		if len(cur) > 0 && (len(cur) >= n || size+b > limit) {
			pages = append(pages, cur)
			cur, size = nil, 0
		}
		cur = append(cur, it)
		size += b + 1
	}
	if len(cur) > 0 || len(pages) == 0 {
		if cur == nil {
			cur = []any{}
		}
		pages = append(pages, cur)
	}
	return pages
}

// subscribe sends the backlog after a cursor page by page as the client reads, then live
// records (subPager).
func (r *Relay) subscribe(s *session, id int64, kinds []string, since string) {
	sb := &sub{kinds: map[string]bool{}}
	for _, k := range kinds {
		if fed.IsRecordKind(k) && !sb.kinds[k] {
			sb.kinds[k] = true
			sb.list = append(sb.list, k)
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(s.subs) >= maxSubs {
		s.fail(id, fed.TooMany, 0)
		return
	}
	if !r.room(s, id) {
		return
	}
	s.subs[id] = sb
	r.later(s, &subPager{rid: id, after: r.parseCursor(since)})
	// The excluded list follows the first sub, after its backlog, and again on every change.
	if !s.exSent {
		s.exSent = true
		r.sendExcluded(s, r.now())
	}
}

func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}

// Cosign adds one operator signature to a stored proposal or server record.
func (r *Relay) Cosign(rid, key, sig string) (string, string) {
	now := r.now()
	r.mu.Lock()
	e := r.st.Get(rid)
	if e == nil {
		r.mu.Unlock()
		return "", fed.NotFound
	}
	if e.Kind != "operators" && e.Kind != "server" {
		r.mu.Unlock()
		return "", fed.BadKind
	}
	rec := r.st.Rec(e)
	if !fed.IsKey(key) {
		r.mu.Unlock()
		return "", fed.BadKey
	}
	if !fed.IsSig(sig) {
		r.mu.Unlock()
		return "", fed.BadSig
	}
	if r.own == nil || rec.Str("server") != r.own.ID {
		r.mu.Unlock()
		return "", fed.UnknownSrv
	}
	lists := r.own.Lists
	if rec.Kind == "server" {
		lists = r.own.At[rec.Str("head")]
	}
	if !lists.IsOperator(key) {
		r.mu.Unlock()
		return "", fed.NotOperator
	}
	if rec.Kind == "operators" && !slices.ContainsFunc(r.own.Pending(now), func(p *fed.Record) bool { return p.ID == rid }) {
		r.mu.Unlock()
		if now >= rec.T+fed.PendingLife {
			return "", fed.TooOld
		}
		return "", fed.BadChain
	}
	if rec.Kind == "server" && now >= rec.T+fed.PendingLife && r.own.CheckServer(rec) != "" {
		r.mu.Unlock()
		return "", fed.TooOld
	}
	sigs, _ := fed.MergeSigs(rec.Sigs, []fed.SigEntry{{Key: key, Sig: sig}})
	value := rec.WithSigs(r.keepSigs(rec, sigs)).Value
	r.mu.Unlock()
	merged, code := fed.CheckValue(value, now, fed.Opts{})
	if code != "" {
		return "", code
	}
	res, _, code := r.ingest(merged, nil, origin{client: true})
	return res, code
}

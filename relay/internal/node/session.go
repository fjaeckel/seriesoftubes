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
)

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
	ver    int64

	// client
	cc      string                    // the connection's country, never its address
	subs    map[int64]map[string]bool // sub id -> kinds (guarded by r.mu)
	tokens  float64
	tokenAt time.Time

	// node
	peerServer string
	peerNode   string
	same       bool
	verified   bool     // the peer node is known to be a node of its server
	synced     bool     // carry exchanged: live pushes flow
	send, take []string // classes
	wanted     map[string]bool
	dialURL    string
}

func newSession(r *Relay, c *websocket.Conn, node bool) *session {
	ctx, cancel := context.WithCancel(r.ctx)
	s := &session{r: r, c: c, node: node, limit: fed.ClientFrame, out: make(chan []byte, queueFrames),
		maxQ: clientQueueBytes, ctx: ctx, cancel: cancel, subs: map[int64]map[string]bool{},
		wanted: map[string]bool{}, tokenAt: time.Now()}
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

func (s *session) writer() {
	for {
		select {
		case <-s.ctx.Done():
			return
		case b := <-s.out:
			if b == nil {
				s.c.Close(websocket.StatusPolicyViolation, "")
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
	defer s.close("")
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
	s.enqueue(map[string]any{"m": "welcome", "ver": h.Ver, "server": r.ServerID(), "node": r.Key(), "now": r.now()})
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
		if !s.allow() {
			s.fail(f.ID, fed.RateLimited, 1)
			continue
		}
		r.clientFrame(s, f)
	}
}

// allow is a per-connection token bucket.
func (s *session) allow() bool {
	rate := float64(s.r.cfg.Limits.MsgsPerSec)
	now := time.Now()
	s.tokens = min(4*rate, s.tokens+now.Sub(s.tokenAt).Seconds()*rate)
	s.tokenAt = now
	if s.tokens < 1 {
		return false
	}
	s.tokens--
	return true
}

// clientFrame answers one client message (9.3).
func (r *Relay) clientFrame(s *session, f *wire.Frame) {
	now := r.now()
	switch f.M {
	case "ping":
		s.enqueue(map[string]any{"m": "pong", "id": f.ID, "now": now})
	case "pong", "err":
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
		var items []map[string]any
		for _, id := range ids {
			if e := r.st.Get(id); e != nil && !r.shunned[e.Rec.Key] {
				items = append(items, item(e))
			}
		}
		r.sendRecs(s, f.ID, items, "")
		r.mu.Unlock()
	case "board":
		r.mu.Lock()
		r.sendRecs(s, f.ID, r.boardItems(now), "")
		r.mu.Unlock()
	case "servers":
		r.mu.Lock()
		r.sendCatalog(s, f.ID, now)
		r.mu.Unlock()
	}
}

// sendRecs sends items in recs frames within the client frame limit (lock held).
func (r *Relay) sendRecs(s *session, id int64, items []map[string]any, cursor string) {
	pages := pageItems(items, fed.MaxItems, fed.ClientFrame-1024)
	for i, p := range pages {
		s.enqueue(map[string]any{"m": "recs", "id": id, "items": p, "cursor": cursor, "more": i < len(pages)-1})
	}
	r.o.Metrics.Add("relay_records_out_total", "", float64(len(items)))
}

// pageItems splits items into pages of at most n items and about limit bytes.
func pageItems(items []map[string]any, n, limit int) [][]any {
	pages := [][]any{}
	var cur []any
	size := 0
	for _, it := range items {
		b := len(canon.Encode(it))
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

// subscribe sends the backlog after a cursor, then live records (lock held while queueing,
// so live records cannot overtake the backlog).
func (r *Relay) subscribe(s *session, id int64, kinds []string, since string) {
	want := map[string]bool{}
	for _, k := range kinds {
		if fed.IsRecordKind(k) {
			want[k] = true
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(s.subs) >= maxSubs {
		s.fail(id, fed.TooMany, 0)
		return
	}
	var items []map[string]any
	var last uint64
	for _, e := range r.st.After(r.parseCursor(since)) {
		last = e.Seq
		if want[e.Rec.Kind] && !r.shunned[e.Rec.Key] {
			items = append(items, item(e))
		}
	}
	if last == 0 {
		last = r.st.Seq()
	}
	r.sendRecs(s, id, items, r.cursor(last))
	s.subs[id] = want
}

// boardItems is 9.5 (lock held): the stats of the two windows, the newest earlier stats per
// key for carrying forward, the newest announce of those keys and the current hide record.
func (r *Relay) boardItems(now int64) []map[string]any {
	c := fed.Slot(now)
	lo := c - 2*fed.WindowSlots*fed.SlotLen
	var items []map[string]any
	carry := map[string]*store.Entry{}
	keys := map[string]bool{}
	for _, e := range store.Sorted(r.st.Kind("stats")) {
		k := e.Rec.Key
		if r.shunned[k] || r.refusesKey(k) {
			continue
		}
		switch {
		case e.Slot >= lo && e.Slot < c:
			items = append(items, item(e))
			keys[k] = true
		case e.Slot > lo-fed.CarryForward && e.Slot < lo:
			p := carry[k]
			if p == nil || e.Slot > p.Slot || e.Slot == p.Slot && (e.Rec.T > p.Rec.T || e.Rec.T == p.Rec.T && e.Rec.ID < p.Rec.ID) {
				carry[k] = e
			}
			keys[k] = true
		}
	}
	for _, k := range sortedKeys(carry) {
		items = append(items, item(carry[k]))
	}
	for _, k := range sortedKeys(keys) {
		var best *store.Entry
		for _, e := range r.st.Key(k) {
			if e.Rec.Kind == "announce" && (best == nil || e.Rec.T > best.Rec.T || e.Rec.T == best.Rec.T && e.Rec.ID < best.Rec.ID) {
				best = e
			}
		}
		if best != nil {
			items = append(items, item(best))
		}
	}
	if r.hide != nil {
		if e := r.st.Get(r.hide.ID); e != nil {
			items = append(items, item(e))
		}
	}
	return items
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
	rec := e.Rec
	if rec.Kind != "operators" && rec.Kind != "server" {
		r.mu.Unlock()
		return "", fed.BadKind
	}
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
	value := rec.WithSigs(sigs).Value
	r.mu.Unlock()
	merged, code := fed.CheckValue(value, now, fed.Opts{})
	if code != "" {
		return "", code
	}
	res, _, code := r.ingest(merged, nil, origin{client: true})
	return res, code
}

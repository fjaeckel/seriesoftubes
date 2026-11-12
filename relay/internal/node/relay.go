// Package node is the relay: it stores and forwards records, signs receipts, syncs with
// its own server's other nodes and with the servers its policy allows, passes on the
// catalog and counts shun votes. It runs no game logic.
package node

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/metrics"
	"github.com/fjaeckel/seriesoftubes/relay/internal/privacy"
	"github.com/fjaeckel/seriesoftubes/relay/internal/rank"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	"github.com/fjaeckel/seriesoftubes/relay/internal/shun"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

// Options configure a relay. Everything that touches the outside world can be injected.
type Options struct {
	Dir        string
	Config     *config.Config
	Node       *fed.Signer // this node's key
	Clock      func() time.Time
	Log        *slog.Logger
	Countries  privacy.Countries // nil: no country lookups
	HTTPClient *http.Client      // outgoing wss:// and registry fetches; nil: default
	Versions   []int64           // protocol versions spoken; nil: [1]
	Metrics    *metrics.M
	// Retry pacing; tests shorten them. Defaults: one minute and one second.
	BootstrapEvery time.Duration
	DialBase       time.Duration
}

// Relay is one node.
type Relay struct {
	o       Options
	mu      sync.Mutex
	cfg     *config.Config
	st      *store.Store
	own     *chain.State // nil until the server's genesis is known
	ownSrv  *fed.Record  // current server record (8.2)
	headSrv *fed.Record  // newest valid server record at the chain's final head (for gossip)
	hide    *fed.Record  // current hide record
	reg     *registry.Snapshot
	regs    map[string]*registry.Entry
	cat     map[string]*catEntry
	catVia  map[string]int // neighbour server -> catalog entries first learned from it
	rank    *rank.Agg      // the leaderboards in memory (9.5)
	shunned map[string]bool
	shunAt  int64
	counter *shun.Counter                   // voters of the registry snapshot
	votes   map[string]map[string]shun.Vote // target -> vote id -> vote
	left    map[string]int64                // key -> t of its newest leave
	statsAt map[string]int64                // key -> slot of its last stats from a client
	refused map[string]bool                 // ids refused from nodes (not wanted again)
	lastSyn map[string]int64                // peer node key -> start of the last session
	clients map[*session]bool
	nodes   map[*session]bool
	epoch   string
	limiter *privacy.Limiter
	dialers map[string]context.CancelFunc
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	speaks  []int64
	gossip  int64 // last time the own entry was sent

	catDirty bool       // the catalog file is behind
	loading  bool       // reading the catalog file
	catWrite sync.Mutex // one catalog file write at a time
}

// New opens the data folder and rebuilds every index.
func New(o Options) (*Relay, error) {
	if o.Clock == nil {
		o.Clock = time.Now
	}
	if o.Log == nil {
		o.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if o.Versions == nil {
		o.Versions = []int64{fed.Version}
	}
	if o.Config == nil {
		o.Config = config.Default()
	}
	if o.BootstrapEvery == 0 {
		o.BootstrapEvery = time.Minute
	}
	if o.DialBase == 0 {
		o.DialBase = time.Second
	}
	st, err := store.Open(o.Dir)
	if err != nil {
		return nil, err
	}
	var eb [6]byte
	_, _ = rand.Read(eb[:])
	r := &Relay{o: o, cfg: o.Config, st: st, regs: map[string]*registry.Entry{}, cat: map[string]*catEntry{}, catVia: map[string]int{},
		shunned: map[string]bool{}, left: map[string]int64{}, statsAt: map[string]int64{}, refused: map[string]bool{},
		lastSyn: map[string]int64{}, clients: map[*session]bool{}, nodes: map[*session]bool{},
		epoch: fed.Encode(eb[:]), dialers: map[string]context.CancelFunc{}, speaks: o.Versions}
	r.limiter = privacy.NewLimiter(r.cfg.Limits.ConnsPerAddr, int64(r.cfg.Limits.AddrWindowSec))
	st.Keep = r.keepSigs
	r.ctx, r.cancel = context.WithCancel(context.Background())
	if st.Bad > 0 {
		o.Log.Warn("data folder: skipped lines that did not check", "lines", st.Bad)
	}
	r.mu.Lock()
	r.recompute()
	for _, e := range st.Kind("leave") {
		r.left[e.Rec.Key] = max(r.left[e.Rec.Key], e.Rec.T)
	}
	r.indexVotes()
	r.loadCatalog()
	r.loadRegistryCache()
	// The leaderboards are built from the store in parallel chunks while the node already serves
	// (rank answers rate_limited until then); records stored meanwhile are applied after.
	r.rank = rank.New(0)
	raws, anns := r.rankSnapshot()
	ex, names := r.excludedSets()
	r.mu.Unlock()
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		r.rank.Load(raws, anns, ex, names)
		r.rank.Warm(r.now())
	}()
	if m := o.Metrics; m != nil {
		m.Gauge("relay_clients", "Open client connections.", func() float64 { return float64(r.count(false)) })
		m.Gauge("relay_node_sessions", "Open node sessions.", func() float64 { return float64(r.count(true)) })
		m.Gauge("relay_records", "Records stored.", func() float64 { r.mu.Lock(); defer r.mu.Unlock(); return float64(r.st.Len()) })
		m.Gauge("relay_disk_bytes", "Bytes used by the record files.", func() float64 {
			r.mu.Lock()
			defer r.mu.Unlock()
			return float64(r.st.Size())
		})
	}
	return r, nil
}

func (r *Relay) count(nodes bool) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	if nodes {
		return len(r.nodes)
	}
	return len(r.clients)
}

func (r *Relay) now() int64 { return r.o.Clock().Unix() }

// Key is this node's key.
func (r *Relay) Key() string { return r.o.Node.Key }

// ServerID is the server identity this node belongs to ("" before genesis or join).
func (r *Relay) ServerID() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.cfg.Server
}

// serving reports whether this node can take clients: its server is known and lists it.
func (r *Relay) serving() bool { return r.own != nil && r.own.IsNode(r.o.Node.Key) }

// recompute rebuilds the chain, the current server and hide records from the store.
func (r *Relay) recompute() {
	id := r.cfg.Server
	r.own, r.ownSrv, r.headSrv, r.hide = nil, nil, nil, nil
	if id == "" {
		return
	}
	g := r.st.Get(id)
	if g == nil || g.Rec.Kind != "genesis" {
		return
	}
	var ops, srvs []*fed.Record
	for _, e := range r.st.Kind("operators") {
		ops = append(ops, e.Rec)
	}
	for _, e := range r.st.Kind("server") {
		if e.Rec.Str("server") == id {
			srvs = append(srvs, e.Rec)
		}
	}
	r.own = chain.Compute(g.Rec, ops)
	r.ownSrv = r.own.Current(srvs)
	var atHead []*fed.Record
	for _, x := range srvs {
		if x.Str("head") == r.own.Head {
			atHead = append(atHead, x)
		}
	}
	r.headSrv = r.own.Current(atHead)
	for _, e := range r.st.Kind("hide") {
		h := e.Rec
		if h.Str("server") != id || !r.own.IsOperator(h.Key) {
			continue
		}
		if r.hide == nil || h.T > r.hide.T || h.T == r.hide.T && h.ID < r.hide.ID {
			r.hide = h
		}
	}
}

// ownSync is the published sync policy; standalone until a server record exists.
func (r *Relay) ownSync() string {
	if r.ownSrv == nil {
		return "standalone"
	}
	return r.ownSrv.Str("sync")
}

// lookup returns what this node knows of a server's lists: its own, the registry's, gossip's.
func (r *Relay) lookup(id string) *chain.State {
	if r.own != nil && id == r.own.ID {
		return r.own
	}
	if e, ok := r.regs[id]; ok {
		return e.State
	}
	if c, ok := r.cat[id]; ok {
		return c.State
	}
	return nil
}

func (r *Relay) syncOf(id string) string {
	if e, ok := r.regs[id]; ok {
		return e.Server.Str("sync")
	}
	if c, ok := r.cat[id]; ok {
		return c.Server.Str("sync")
	}
	return ""
}

// isShunned uses the cached tally: each target is counted again when a vote for it arrives,
// and every target once a minute (votes expire and shuns lift with time) or on a new registry.
func (r *Relay) isShunned(key string) bool {
	r.fresh(r.now())
	return r.shunned[key]
}

func (r *Relay) fresh(now int64) {
	if r.shunAt == 0 || now-r.shunAt >= 60 {
		r.tally(now)
	}
}

// operator reports whether a client session proved a key that is a current operator of this
// server (lock held).
func (r *Relay) operator(s *session) bool {
	if r.own == nil {
		return false
	}
	for _, k := range s.proved {
		if r.own.IsOperator(k) {
			return true
		}
	}
	return false
}

// shows reports whether a session may be sent this record: shun votes go to other nodes and to
// this server's operators only (9.3); every other client learns the outcome from excluded (lock held).
func (r *Relay) shows(s *session, rec *fed.Record) bool {
	return s.node || rec.Kind != "shun" && rec.Kind != "unshun" || r.operator(s)
}

// sendExcluded queues the excluded list for a client (lock held), with the reasons when the
// session proved an excluded key. An answer queued and not yet started is brought up to date
// instead of queueing another.
func (r *Relay) sendExcluded(s *session, now int64) {
	r.fresh(now)
	keys := sortedKeys(r.shunned)
	var reasons []string
	for _, k := range s.proved {
		if !r.shunned[k] || r.counter == nil {
			continue
		}
		for why, n := range r.counter.Tally(r.votesFor(k), k, now).Reasons {
			if n > 0 && !slices.Contains(reasons, why) {
				reasons = append(reasons, why)
			}
		}
	}
	slices.Sort(reasons)
	if p := s.excl; p != nil {
		p.keys, p.reasons = keys, reasons
		return
	}
	s.excl = &exclPager{keys: keys, reasons: reasons}
	r.later(s, s.excl)
}

// exclChanged sends the excluded list again to every client that follows it, or only to those
// that proved target when just its reasons may have changed (lock held).
func (r *Relay) exclChanged(now int64, target string) {
	for s := range r.clients {
		if s.exSent && (target == "" || slices.Contains(s.proved, target)) {
			r.sendExcluded(s, now)
		}
	}
}

// indexVotes rebuilds the votes by target from the store (start, and after votes were removed).
func (r *Relay) indexVotes() {
	r.votes = map[string]map[string]shun.Vote{}
	for _, k := range []string{"shun", "unshun"} {
		for _, e := range r.st.Kind(k) {
			r.addVote(e.Rec)
		}
	}
	r.shunAt = 0
}

func (r *Relay) addVote(rec *fed.Record) {
	v := shun.FromRecord(rec)
	if r.votes[v.Target] == nil {
		r.votes[v.Target] = map[string]shun.Vote{}
	}
	r.votes[v.Target][v.ID] = v
}

func (r *Relay) votesFor(target string) []shun.Vote {
	out := make([]shun.Vote, 0, len(r.votes[target]))
	for _, v := range r.votes[target] {
		out = append(out, v)
	}
	return out
}

// tally counts every target with votes; the work is the number of votes, not targets times voters.
func (r *Relay) tally(now int64) {
	r.shunAt = now
	old := r.shunned
	r.shunned = map[string]bool{}
	for t := range r.votes {
		if r.counter != nil && r.counter.Tally(r.votesFor(t), t, now).Shunned {
			r.shunned[t] = true
		}
	}
	if !maps.Equal(old, r.shunned) {
		r.rankExcluded()
		r.exclChanged(now, "")
	}
}

func (r *Relay) tallyOne(target string, now int64) {
	on := r.counter != nil && r.counter.Tally(r.votesFor(target), target, now).Shunned
	changed := on != r.shunned[target]
	if on {
		r.shunned[target] = true
	} else {
		delete(r.shunned, target)
	}
	if changed {
		r.rankExcluded()
	}
	switch {
	case changed:
		r.exclChanged(now, "")
	case on:
		r.exclChanged(now, target) // a vote may have changed the reasons the excluded player sees
	}
}

// Tally reports the shun tally for one key (status commands).
func (r *Relay) Tally(target string) shun.Result {
	r.mu.Lock()
	defer r.mu.Unlock()
	c := r.counter
	if c == nil {
		c = shun.Prepare(shun.Registry{})
	}
	return c.Tally(r.votesFor(target), target, r.now())
}

// keepSigs is the store's Keep (10.11): a multi-signer record of this server keeps its author and
// the operators at its head (prev for a proposal), at most 16; one whose head this node does not
// know yet keeps at most 16 by key.
func (r *Relay) keepSigs(rec *fed.Record, sigs []fed.SigEntry) []fed.SigEntry {
	l, ok := r.signersAt(rec)
	if !ok {
		return fed.KeepSigs(rec.Key, sigs, nil)
	}
	return fed.KeepSigs(rec.Key, sigs, l.IsOperator)
}

// signersAt returns the lists whose operators may sign an operators or server record of this server.
func (r *Relay) signersAt(rec *fed.Record) (chain.Lists, bool) {
	if r.own == nil || rec.Str("server") != r.own.ID {
		return chain.Lists{}, false
	}
	head := rec.Str("prev")
	if rec.Kind == "server" {
		head = rec.Str("head")
	}
	l, ok := r.own.At[head]
	return l, ok
}

// strangers reports whether a multi-signer record carries a signature from a key that is neither
// its author nor an operator at its head.
func (r *Relay) strangers(rec *fed.Record) bool {
	l, ok := r.signersAt(rec)
	if !ok {
		return true
	}
	for _, k := range rec.Signers() {
		if k != rec.Key && !l.IsOperator(k) {
			return true
		}
	}
	return false
}

func (r *Relay) refusesKey(key string) bool {
	return r.hide != nil && slices.Contains(r.hide.StrList("refuse"), key)
}

func (r *Relay) hidden(key string) bool {
	return r.hide != nil && slices.Contains(r.hide.StrList("hide"), key)
}

// origin says where a record came from.
type origin struct {
	client bool     // a client (or the local command line): this node signs a receipt
	cc     string   // the connection's country, for the receipt
	peer   *session // the node session it came from
	same   bool     // that session is a node of this server
	boot   bool     // bootstrapping from a seed of this server
}

var operatorKinds = map[string]bool{"genesis": true, "operators": true, "server": true, "hide": true, "shun": true, "unshun": true}

// stateCheck is step 9 of 7.1 for this node.
func (r *Relay) stateCheck(rec *fed.Record, now int64, o origin) string {
	if t, ok := r.left[rec.Key]; ok && rec.Kind != "leave" && rec.T <= t {
		return fed.Refused
	}
	if r.isShunned(rec.Key) {
		return fed.Shunned
	}
	if !operatorKinds[rec.Kind] && r.refusesKey(rec.Key) {
		return fed.Refused
	}
	sameServer := o.same || o.boot
	switch rec.Kind {
	case "genesis":
		if rec.ID == r.cfg.Server && (sameServer || r.own != nil) {
			return ""
		}
		return fed.UnknownSrv
	case "operators", "server":
		if !sameServer && o.peer != nil {
			return fed.BadKind // other servers' chains travel in catalog entries
		}
		if r.own == nil || rec.Str("server") != r.own.ID {
			if o.boot && rec.Str("server") == r.cfg.Server {
				return ""
			}
			return fed.UnknownSrv
		}
		if sameServer {
			return ""
		}
		if rec.Kind == "operators" {
			if code := r.own.Proposal(rec, now); code != "" {
				return code
			}
			if r.strangers(rec) {
				return fed.NotOperator // padding with other keys' signatures would crowd out operators
			}
			return ""
		}
		if code := r.own.ServerShape(rec); code != "" {
			return code
		}
		if l := r.own.At[rec.Str("head")]; !l.IsOperator(rec.Key) || r.strangers(rec) {
			return fed.NotOperator
		}
		if r.own.CheckServer(rec) != "" && now >= rec.T+fed.PendingLife {
			return fed.TooOld
		}
	case "hide":
		st := r.lookup(rec.Str("server"))
		if st == nil {
			return fed.UnknownSrv
		}
		if !st.IsOperator(rec.Key) {
			return fed.NotOperator
		}
	case "shun", "unshun":
		// Only votes this node can check are kept and passed on (8.3): a vote of an unknown server
		// could never count, and storing every one would let anyone fill the store and the tally.
		st := r.lookup(rec.Str("server"))
		if st == nil {
			return fed.UnknownSrv
		}
		if !st.IsOperator(rec.Key) {
			return fed.NotOperator
		}
	}
	return ""
}

// validReceipts keeps the receipts that check against servers this node knows.
func (r *Relay) validReceipts(rec *fed.Record, list []any, now int64) ([]map[string]any, int64) {
	var out []map[string]any
	slot := int64(0)
	for _, v := range list {
		if len(out) >= 8 {
			break
		}
		srv, _, ok := fed.ReceiptServer(v)
		if !ok {
			continue
		}
		st := r.lookup(srv)
		if st == nil {
			continue
		}
		rc, code := fed.CheckReceipt(v, rec, srv, st.NodeKeys(), now)
		if code != "" {
			continue
		}
		out = append(out, rc.Value)
		if slot == 0 || rc.T < slot {
			slot = rc.T
		}
	}
	return out, slot
}

// ingest stores a checked record; it returns the store result, the receipt made for a
// client, and an error code. Fan-out to sessions happens inside, under the lock.
func (r *Relay) ingest(rec *fed.Record, rcpts []any, o origin) (string, map[string]any, string) {
	now := r.now()
	r.mu.Lock()
	defer r.mu.Unlock()
	if code := r.stateCheck(rec, now, o); code != "" {
		r.o.Metrics.Inc("relay_refused_total", code)
		return "", nil, code
	}
	if o.client && rec.Kind == "stats" && r.statsAt[rec.Key] == fed.Slot(now) && r.st.Get(rec.ID) == nil {
		return "", nil, fed.RateLimited
	}
	var mine map[string]any
	var list []map[string]any
	var slot int64
	if existing := r.st.Get(rec.ID); existing == nil {
		if !o.client {
			list, slot = r.validReceipts(rec, rcpts, now)
		}
		if len(list) == 0 {
			cc := ""
			if o.client {
				cc = o.cc
			}
			mine = r.o.Node.MakeReceipt(rec, r.cfg.Server, now, cc)
			list, slot = []map[string]any{mine}, fed.Slot(now)
		}
	}
	res, e, err := r.st.Put(rec, list, slot, fed.Div(now, fed.Day))
	if err != nil {
		r.o.Log.Error("store: write failed", "err", err)
		return "", nil, fed.Internal
	}
	if res == store.Dup {
		return res, nil, ""
	}
	if o.client && rec.Kind == "stats" {
		r.statsAt[rec.Key] = fed.Slot(now)
	}
	r.o.Metrics.Inc("relay_records_in_total", rec.Kind)
	r.after(e, now)
	r.fanout(e, o.peer)
	if !o.client {
		mine = nil
	}
	return res, mine, ""
}

// after updates what depends on a newly stored or merged record.
func (r *Relay) after(e *store.Entry, now int64) {
	rec := e.Rec
	switch rec.Kind {
	case "stats":
		r.rank.Stats(rec.ID, rec.Key, e.Slot, rec.T, rec.Body, rcptCC(e))
	case "announce":
		r.rank.Announce(rec.Key, r.newestAnn(rec.Key))
	}
	switch rec.Kind {
	case "genesis", "operators", "server", "hide":
		before := r.ownEntryID()
		r.recompute()
		r.rankExcluded()
		if r.ownEntryID() != before {
			r.sendOwnEntry(now)
			r.reconcileLocked()
		}
	case "shun", "unshun":
		r.addVote(rec)
		if r.shunAt != 0 {
			r.tallyOne(rec.Str("target"), now)
		}
	case "leave":
		if rec.T > r.left[rec.Key] {
			r.left[rec.Key] = rec.T
		}
		var drop []string
		for id, x := range r.st.Key(rec.Key) {
			if x.Rec.Kind != "leave" && x.Rec.T <= rec.T {
				drop = append(drop, id)
			}
		}
		r.remove(drop)
	}
}

// item is a record with its receipts, as recs and push carry it.
func item(e *store.Entry) map[string]any {
	rc := make([]any, len(e.Rcpts))
	for i, x := range e.Rcpts {
		rc[i] = x
	}
	return map[string]any{"rec": e.Rec.Value, "rcpt": rc}
}

// classOf is the sync class of a kind ("" for kinds only nodes of one server exchange).
func classOf(kind string) string {
	switch kind {
	case "announce", "stats", "offer", "accept", "decline", "leave":
		return "players"
	case "hide":
		return "advice"
	case "shun", "unshun":
		return "always"
	}
	return ""
}

// sends reports whether a session carries this record to its peer.
func (s *session) sends(rec *fed.Record) bool {
	if s.same {
		return true
	}
	c := classOf(rec.Kind)
	return c == "always" || c != "" && slices.Contains(s.send, c)
}

// fanout pushes a stored record to node sessions and client subscriptions (lock held).
func (r *Relay) fanout(e *store.Entry, from *session) {
	if r.shunned[e.Rec.Key] {
		return
	}
	it := item(e)
	for s := range r.nodes {
		if s == from || !s.synced || !s.sends(e.Rec) {
			continue
		}
		s.enqueue(map[string]any{"m": "push", "items": []any{it}})
		r.o.Metrics.Inc("relay_records_out_total", "")
	}
	for s := range r.clients {
		for id, sub := range s.subs {
			// A sub still sending its backlog reaches this record by scanning.
			if sub.live && sub.kinds[e.Rec.Kind] && r.shows(s, e.Rec) {
				s.enqueue(map[string]any{"m": "recs", "id": id, "items": []any{it}, "cursor": r.cursor(e.Seq), "more": false})
				r.o.Metrics.Inc("relay_records_out_total", "")
			}
		}
	}
}

func (r *Relay) cursor(seq uint64) string { return r.epoch + "-" + strconv.FormatUint(seq, 36) }

// parseCursor returns the storage number a cursor stands for; 0 when not understood.
func (r *Relay) parseCursor(c string) uint64 {
	// The epoch is base64url and may hold '-' itself; the number after the last one never does.
	i := strings.LastIndexByte(c, '-')
	if i < 0 || c[:i] != r.epoch {
		return 0
	}
	v, err := strconv.ParseUint(c[i+1:], 36, 64)
	if err != nil || v > r.st.Seq() {
		return 0
	}
	return v
}

// rcptCC is the country of a record's earliest receipt (the one that gives its board slot), or "".
func rcptCC(e *store.Entry) string {
	for _, rc := range e.Rcpts {
		if t, _ := rc["t"].(int64); t == e.Slot {
			b, _ := rc["body"].(map[string]any)
			cc, _ := b["cc"].(string)
			return cc
		}
	}
	return ""
}

// newestAnn is what the boards use of a key's newest announce (lock held), or nil.
func (r *Relay) newestAnn(key string) *rank.Ann {
	var best *fed.Record
	for _, e := range r.st.Key(key) {
		if x := e.Rec; x.Kind == "announce" && (best == nil || x.T > best.T || x.T == best.T && x.ID < best.ID) {
			best = x
		}
	}
	if best == nil {
		return nil
	}
	return annOf(best)
}

func annOf(x *fed.Record) *rank.Ann {
	return &rank.Ann{ID: x.ID, T: x.T, Name: x.Str("name"), Home: x.Str("home"), Policy: x.Str("policy"),
		Founded: x.Int("founded"), Day: x.Int("day")}
}

// rankSnapshot is what the leaderboards are built from at start (lock held): every stats record
// and each key's newest announce.
func (r *Relay) rankSnapshot() ([]rank.Raw, map[string]*rank.Ann) {
	stats := r.st.Kind("stats")
	raws := make([]rank.Raw, 0, len(stats))
	for _, e := range stats {
		raws = append(raws, rank.Raw{ID: e.Rec.ID, Key: e.Rec.Key, Slot: e.Slot, T: e.Rec.T, Body: e.Rec.Body, CC: rcptCC(e)})
	}
	newest := map[string]*fed.Record{}
	for _, e := range r.st.Kind("announce") {
		x := e.Rec
		if b := newest[x.Key]; b == nil || x.T > b.T || x.T == b.T && x.ID < b.ID {
			newest[x.Key] = x
		}
	}
	anns := make(map[string]*rank.Ann, len(newest))
	for k, x := range newest {
		anns[k] = annOf(x)
	}
	return raws, anns
}

// excludedSets are the networks this server leaves off its boards (shunned, hidden, refused) and
// those it names by ASN only (lock held).
func (r *Relay) excludedSets() (map[string]bool, map[string]bool) {
	ex, names := maps.Clone(r.shunned), map[string]bool{}
	if r.hide != nil {
		for _, k := range r.hide.StrList("hide") {
			ex[k] = true
		}
		for _, k := range r.hide.StrList("refuse") {
			ex[k] = true
		}
		for _, k := range r.hide.StrList("names") {
			names[k] = true
		}
	}
	return ex, names
}

// rankExcluded tells the leaderboards who is excluded now (lock held).
func (r *Relay) rankExcluded() {
	if r.rank != nil {
		r.rank.Exclude(r.excludedSets())
	}
}

// lastHeard is the newest board slot of any record by a key.
func (r *Relay) lastHeard(key string) int64 {
	var m int64
	for _, e := range r.st.Key(key) {
		m = max(m, e.Slot)
	}
	return m
}

// gc drops what is no longer kept (Where state lives) and compacts the files.
func (r *Relay) gc() {
	now := r.now()
	r.mu.Lock()
	defer r.mu.Unlock()
	drop := r.expired(now)
	r.remove(drop)
	if err := r.st.Compact(fed.Div(now, fed.Day)); err != nil {
		r.o.Log.Error("store: compaction failed", "err", err)
	}
	for id, c := range r.cat {
		if now >= c.Seen+fed.GossipExpiry {
			r.forget(id)
		}
	}
	for k, s := range r.statsAt {
		if s < fed.Slot(now) {
			delete(r.statsAt, k)
		}
	}
	if len(r.refused) > 100000 {
		r.refused = map[string]bool{}
	}
	if len(drop) > 0 {
		r.o.Log.Info("retention: dropped records", "count", len(drop))
	}
}

// remove drops records from the store and from what is indexed beside it (lock held).
func (r *Relay) remove(ids []string) {
	votes := false
	anns := map[string]bool{}
	for _, id := range ids {
		e := r.st.Get(id)
		if e == nil {
			continue
		}
		switch e.Rec.Kind {
		case "shun", "unshun":
			votes = true
		case "stats":
			r.rank.Drop(id)
		case "announce":
			anns[e.Rec.Key] = true
		}
	}
	r.st.Remove(ids)
	for k := range anns {
		r.rank.Announce(k, r.newestAnn(k))
	}
	if votes {
		r.indexVotes()
	}
}

// expired lists ids past their keeping time.
func (r *Relay) expired(now int64) []string {
	var drop []string
	keepStats := now - 3*fed.Day // two windows and slack
	carryFrom := fed.Slot(now) - 2*fed.WindowSlots*fed.SlotLen - fed.CarryForward
	for key, recs := range r.byKeyKind("stats") {
		sort.Slice(recs, func(i, j int) bool { return recs[i].Slot > recs[j].Slot })
		for i, e := range recs {
			newest := i == 0 && e.Slot > carryFrom
			if e.Slot < keepStats && !newest {
				drop = append(drop, e.Rec.ID)
			}
		}
		_ = key
	}
	for key, recs := range r.byKeyKind("announce") {
		sort.Slice(recs, func(i, j int) bool { return recs[i].Rec.T > recs[j].Rec.T })
		if now-r.lastHeard(key) >= fed.QuietForgotten {
			for _, e := range recs {
				drop = append(drop, e.Rec.ID)
			}
			continue
		}
		// Older announces stay while an offer may still rely on them.
		for i := 1; i < len(recs); i++ {
			if now-recs[i-1].Rec.T > fed.OfferKept+fed.Day {
				drop = append(drop, recs[i].Rec.ID)
			}
		}
	}
	ages := map[string]int64{"offer": fed.OfferKept, "accept": fed.OfferKept, "decline": fed.OfferKept,
		"shun": fed.VoteLife, "unshun": fed.VoteLife, "leave": fed.LeaveKept}
	for k, age := range ages {
		for id, e := range r.st.Kind(k) {
			if now-e.Rec.T > age {
				drop = append(drop, id)
			}
		}
	}
	// Hide: the newest per server.
	newest := map[string]*fed.Record{}
	for _, e := range r.st.Kind("hide") {
		h := e.Rec
		s := h.Str("server")
		if n := newest[s]; n == nil || h.T > n.T || h.T == n.T && h.ID < n.ID {
			newest[s] = h
		}
	}
	for id, e := range r.st.Kind("hide") {
		if newest[e.Rec.Str("server")] != e.Rec {
			drop = append(drop, id)
		}
	}
	// Chain records: this server's applied ones forever, pending ones for 14 days.
	if r.own != nil {
		applied := map[string]bool{}
		for _, a := range r.own.Applied {
			applied[a.ID] = true
		}
		pend := map[string]bool{}
		for _, p := range r.own.Pending(now) {
			pend[p.ID] = true
		}
		for id := range r.st.Kind("operators") {
			if !applied[id] && !pend[id] {
				drop = append(drop, id)
			}
		}
		for id, e := range r.st.Kind("server") {
			if e.Rec == r.ownSrv || e.Rec == r.headSrv {
				continue
			}
			pending := e.Rec.Str("server") == r.own.ID && e.Rec.Str("head") == r.own.Head && now < e.Rec.T+fed.PendingLife
			if !pending || r.ownSrv != nil && e.Rec.T < r.ownSrv.T {
				drop = append(drop, id)
			}
		}
		for id := range r.st.Kind("genesis") {
			if id != r.own.ID {
				drop = append(drop, id)
			}
		}
	}
	return drop
}

func (r *Relay) byKeyKind(kind string) map[string][]*store.Entry {
	out := map[string][]*store.Entry{}
	for _, e := range r.st.Kind(kind) {
		out[e.Rec.Key] = append(out[e.Rec.Key], e)
	}
	return out
}

// Run starts the background work: retention, gossip, syncs, the registry; it returns at once.
func (r *Relay) Run() {
	r.gc()
	r.reconcile()
	r.loop("retention", time.Hour, r.gc)
	r.loop("gossip", 30*time.Minute, func() {
		r.mu.Lock()
		if r.now()-r.gossip >= 6*3600 {
			r.sendOwnEntry(r.now())
		}
		r.mu.Unlock()
	})
	r.loop("registry", 6*time.Hour, r.refreshRegistry)
	r.loop("reconcile", r.o.BootstrapEvery, r.reconcile)
	// The leaderboards of a new slot are worked out as it starts, on the ranking workers.
	r.loop("boards", 10*time.Second, func() {
		if now := r.now(); now-fed.Slot(now) < 30 {
			r.rank.Warm(now)
		}
	})
	// Votes expire and shuns lift with time alone: clients following the excluded list hear of it.
	r.loop("shun", time.Minute, func() {
		r.mu.Lock()
		r.fresh(r.now())
		r.mu.Unlock()
	})
	go r.refreshRegistry()
}

func (r *Relay) loop(name string, every time.Duration, f func()) {
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		t := time.NewTicker(every)
		defer t.Stop()
		for {
			select {
			case <-r.ctx.Done():
				return
			case <-t.C:
				f()
			}
		}
	}()
}

// Close stops everything and closes the files.
func (r *Relay) Close() error {
	r.cancel()
	r.mu.Lock()
	for s := range r.clients {
		s.close("")
	}
	for s := range r.nodes {
		s.close("")
	}
	r.mu.Unlock()
	r.wg.Wait()
	r.rank.Close()
	r.flushCatalog()
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.st.Close()
}

// GC runs retention now (tests and the command line).
func (r *Relay) GC() { r.gc() }

// Reload applies a new config (SIGHUP).
func (r *Relay) Reload(c *config.Config) {
	r.mu.Lock()
	r.cfg = c
	r.limiter.Set(c.Limits.ConnsPerAddr, int64(c.Limits.AddrWindowSec))
	r.mu.Unlock()
	r.reconcile()
	r.o.Log.Info("config reloaded")
}

var errClosed = errors.New("relay closed")

func (r *Relay) logf(msg string, args ...any) { r.o.Log.Info(fmt.Sprintf(msg, args...)) }

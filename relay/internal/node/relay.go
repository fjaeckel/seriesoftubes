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
	"net/netip"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/metrics"
	"github.com/fjaeckel/seriesoftubes/relay/internal/netguard"
	"github.com/fjaeckel/seriesoftubes/relay/internal/privacy"
	"github.com/fjaeckel/seriesoftubes/relay/internal/rank"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	"github.com/fjaeckel/seriesoftubes/relay/internal/shun"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
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
	// AllowInternal lets URLs from the registry, the catalog or peers reach loopback, private and
	// link-local addresses, as the operator's own URLs always may; tests and RELAY_TEST hooks only.
	AllowInternal bool
	Versions      []int64 // protocol versions spoken; nil: [1]
	Metrics       *metrics.M
	Version       string // the relay software version (main.version); "" or "dev": a development build
	// ReleasesURL replaces GitHub's latest-release API (update.ReleasesURL); tests only.
	ReleasesURL string
	// Retry pacing; tests shorten them. Defaults: one minute and one second.
	BootstrapEvery time.Duration
	DialBase       time.Duration
	// Feats replaces what hello and welcome list (9.3, 9.4); nil: every feature this relay has.
	// Tests set fewer to play an older relay.
	Feats []string
}

// Relay is one node.
type Relay struct {
	o        Options
	hc       *http.Client // outgoing wss:// to URLs the operator gave: no redirects
	hcPeer   *http.Client // to URLs from the registry, catalog or peers: no redirects, public addresses only
	mu       sync.Mutex
	cfg      *config.Config
	conf     atomic.Pointer[config.Config] // cfg, for the reads per frame made without the lock
	legacyN  atomic.Int64                  // client auths of the older, unbound form taken since start
	legacyAt atomic.Int64                  // when one was last logged
	st       *store.Store
	own      *chain.State            // nil until the server's genesis is known
	ownSrv   *fed.Record             // current server record (8.2)
	headSrv  *fed.Record             // newest valid server record at the chain's final head (for gossip)
	hide     *fed.Record             // current hide record
	hides    map[string]*store.Entry // server -> its newest stored hide (this server's and registry servers')
	reg      *registry.Snapshot
	regs     map[string]*registry.Entry
	cat      map[string]*catEntry
	catVia   map[string]int // neighbour server -> catalog entries first learned from it
	catViaUn map[string]int // of those, entries of servers the registry does not list
	catUnN   int            // catalog entries of servers the registry does not list
	catSize  catSizes       // bytes of the catalog's records, in all, per neighbour and unlisted
	rank     *rank.Agg      // the leaderboards in memory (9.5)
	shunned  map[string]bool
	shunAt   int64
	counter  *shun.Counter                   // voters of the registry snapshot
	votes    map[string]map[string]shun.Vote // target -> vote id -> vote
	voteN    map[string]int                  // voting server -> votes stored
	ann      map[string]*store.Entry         // key -> its newest announce
	offerN   map[string]int                  // author, and author|to -> offers stored
	left     map[string]int64                // key -> t of its newest leave
	statsAt  map[string]int64                // key -> slot of its last stats from a client
	refused  map[string]bool                 // ids refused from nodes (not wanted again)
	lastSyn  map[string]int64                // peer node key -> start of the last session
	auto     map[string]bool                 // this server's automatic peers (10.9), nil when none
	quiet    map[string]int64                // automatic peer this node does not dial -> since when it has had no session with it
	urlSrv   map[string]string               // node URL dialled -> the server that answered there
	binds    map[string]bool                 // other servers whose nodes bound their proofs in a session (memory only, bounded)

	reports   map[string]map[string]*store.Entry // reporter -> target -> its stored report (5.10)
	addrQ     map[netip.Prefix]*quota            // growth budgets by address, memory only (growth.go)
	peerQ     map[string]*quota                  // growth budgets by other server ("": all servers outside the registry)
	peerAddrQ map[netip.Addr]*quota              // growth budgets of sessions with those servers, by address
	hwAt      int64                              // when the heap and the free disk were last read
	heap      int64                              // heap in use then
	free      int64                              // free disk then (-1: unknown)
	reportN   int                                // reports stored
	repYoung  map[*store.Entry]int64             // reports of reporters without history here -> their first announce's slot

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
	impl    *update.Impl
	upd     updState

	hand     atomic.Int64 // inbound sessions accepted that have not yet said hello (or proved a node)
	nodeHand atomic.Int64 // of those, node handshakes before the proof

	catDirty bool       // the catalog file is behind
	loading  bool       // reading the catalog file
	catWrite sync.Mutex // one catalog file write at a time

	// Catalog entries dropped because their chain forked from the one held (10.8), and when one was last logged.
	forks      int
	forkLogged int64
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
	// The leaderboards' records are parsed as the store reads them (stats only); those removed
	// before the boards load are left out then.
	var pre []loaded
	st, err := store.OpenWith(o.Dir, func(e *store.Entry, rec *fed.Record, rcpts []map[string]any) {
		if e.Kind == "stats" {
			pre = append(pre, loaded{e, rank.Parsed(e.ID, e.Key, e.Slot, e.T, rec.Body, rcptCC(rcpts, e.Slot))})
		}
	})
	if err != nil {
		return nil, err
	}
	var eb [6]byte
	_, _ = rand.Read(eb[:])
	r := &Relay{o: o, cfg: o.Config, st: st, regs: map[string]*registry.Entry{}, cat: map[string]*catEntry{}, catVia: map[string]int{}, catViaUn: map[string]int{}, catSize: catSizes{via: map[string]int{}, viaUn: map[string]int{}},
		shunned: map[string]bool{}, left: map[string]int64{}, statsAt: map[string]int64{}, refused: map[string]bool{},
		lastSyn: map[string]int64{}, addrQ: map[netip.Prefix]*quota{}, peerQ: map[string]*quota{}, urlSrv: map[string]string{}, binds: map[string]bool{}, clients: map[*session]bool{}, nodes: map[*session]bool{},
		epoch: fed.Encode(eb[:]), dialers: map[string]context.CancelFunc{}, speaks: o.Versions,
		hc: netguard.Client(o.HTTPClient, false), hcPeer: netguard.Client(o.HTTPClient, !o.AllowInternal)}
	r.conf.Store(o.Config)
	r.impl = &update.Impl{Name: update.Name, Version: r.version()}
	if update.ReadImpl(r.impl.Value()) == nil {
		r.impl.Version = "dev" // a build stamped with something no peer would read
	}
	r.limiter = privacy.NewLimiter(addrLimits(r.cfg))
	st.Keep = r.keepSigs
	r.ctx, r.cancel = context.WithCancel(context.Background())
	if st.Bad > 0 {
		o.Log.Warn("data folder: skipped lines that did not check", "lines", st.Bad)
	}
	r.mu.Lock()
	r.recompute()
	for e := range st.Kind("leave") {
		r.left[e.Key] = max(r.left[e.Key], e.T)
	}
	// What a leave removed stays removed, even if a restart came before the file was rewritten.
	if gone := r.leftBehind(); len(gone) > 0 {
		st.Remove(gone)
	}
	r.indexVotes()
	r.ann, r.offerN = map[string]*store.Entry{}, map[string]int{}
	for e := range st.Kind("announce") {
		r.noteAnn(e)
	}
	for e := range st.Kind("offer") {
		r.countOffer(e.Key, e.To(), 1)
	}
	r.indexReports()
	r.indexHides()
	// The registry first: the catalog's budget for servers not listed there is smaller.
	r.loadRegistryCache()
	r.loadCatalog()
	r.loadUpdateState()
	// The leaderboards are built from the store in parallel chunks while the node already serves
	// (rank answers rate_limited until then); records stored meanwhile are applied after.
	r.rank = rank.New(0)
	raws, anns := r.rankSnapshot(pre)
	pre = nil
	ex, names := r.excludedSets()
	r.mu.Unlock()
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		r.rank.Load(raws, anns, ex, names)
		r.rank.Warm(r.now())
	}()
	if m := o.Metrics; m != nil {
		m.Set("relay_build_info", "The relay software version this node runs (always 1).", "version", map[string]float64{r.impl.Version: 1})
		r.updMetrics()
		m.Gauge("relay_clients", "Open client connections.", func() float64 { return float64(r.count(false)) })
		m.Gauge("relay_node_sessions", "Open node sessions.", func() float64 { return float64(r.count(true)) })
		m.Gauge("relay_records", "Records stored.", func() float64 { r.mu.Lock(); defer r.mu.Unlock(); return float64(r.st.Len()) })
		m.Gauge("relay_live_states", "Live states held in memory (networks playing now).", func() float64 { n, _ := r.rank.LiveStats(); return float64(n) })
		m.Gauge("relay_high_water", "1 while this node is past its high-water mark (only networks with an announce may put).", func() float64 {
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.highWater(r.now()) {
				return 1
			}
			return 0
		})
		m.Gauge("relay_live_evicted", "Live states dropped to make room for others since start.", func() float64 { return float64(r.rank.LiveEvicted()) })
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
	if g == nil || g.Kind != "genesis" {
		return
	}
	var ops, srvs []*fed.Record
	for e := range r.st.Kind("operators") {
		ops = append(ops, r.st.Rec(e))
	}
	for e := range r.st.Kind("server") {
		if x := r.st.Rec(e); x.Str("server") == id {
			srvs = append(srvs, x)
		}
	}
	r.own = chain.Compute(r.st.Rec(g), ops)
	r.ownSrv = r.own.Current(srvs)
	var atHead []*fed.Record
	for _, x := range srvs {
		if x.Str("head") == r.own.Head {
			atHead = append(atHead, x)
		}
	}
	r.headSrv = r.own.Current(atHead)
	for e := range r.st.Kind("hide") {
		h := r.st.Rec(e)
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

// receiptState is the chain state of a server whose receipts count: this server or a registry one.
func (r *Relay) receiptState(id string) *chain.State {
	if r.own != nil && id == r.own.ID {
		return r.own
	}
	if e, ok := r.regs[id]; ok {
		return e.State
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

// shows reports whether a session may be sent this record (lock held). Other nodes get everything.
// Shun votes and players' reports go to this server's operators only; every other client learns the outcome from
// excluded. Deals go to their two parties only, open consortium projects to everyone (9.3).
func (r *Relay) shows(s *session, e *store.Entry) bool {
	if s.node {
		return true
	}
	if !s.takes(e) {
		return false
	}
	switch e.Kind {
	case "shun", "unshun":
		return r.operator(s)
	case "offer", "accept", "decline":
		return r.party(s, e)
	case "report":
		return r.operator(s)
	}
	return true
}

// party reports whether a client session may see a deal record: it proved the author or to, or
// the record is an open consortium project (an offer without to) or an answer to one (lock held).
func (r *Relay) party(s *session, e *store.Entry) bool {
	if e.Kind == "offer" && e.To() == "" {
		return true
	}
	for _, k := range s.proved {
		if k == e.Key || k == e.To() {
			return true
		}
	}
	if e.Kind == "offer" {
		return false
	}
	o := r.st.Get(e.Offer())
	if o == nil || o.Kind != "offer" || o.Key != e.To() {
		return false
	}
	return o.To() == ""
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
	r.votes, r.voteN = map[string]map[string]shun.Vote{}, map[string]int{}
	for _, k := range []string{"shun", "unshun"} {
		for e := range r.st.Kind(k) {
			if rec := r.st.Rec(e); rec != nil {
				r.addVote(rec)
			}
		}
	}
	r.shunAt = 0
}

func (r *Relay) addVote(rec *fed.Record) {
	v := shun.FromRecord(rec)
	if r.votes[v.Target] == nil {
		r.votes[v.Target] = map[string]shun.Vote{}
	}
	if _, ok := r.votes[v.Target][v.ID]; !ok {
		r.voteN[v.Server]++
	}
	r.votes[v.Target][v.ID] = v
}

// Bounds of what one author can have a node keep (vars so tests can lower them): votes of one
// voting server, offers by one key, offers by one key to one other.
var (
	maxVotesPerServer = 8192
	maxOffersPerKey   = 4096
	maxOffersPerPair  = 128
)

// Bounds of reports (5.10; vars so tests can lower them): one reporter's new reports per day (by
// receipt slot, which the reporter cannot pick), and every report this node keeps. Keys cost
// nothing to make, so reporters without history here (their first announce this node holds is
// younger than reportElder) may fill only the room left after reportReserve (-1: a quarter), and a
// reporter with history takes the place of the oldest report of the newest key when the node is
// full. Reports from games are also counted per address, maxReportsPerAddr an hour.
var (
	maxReportsPerDay  = 20
	maxReports        = 65536
	maxReportsPerAddr = 60
	reportReserve     = -1
	reportElder       = int64(7 * fed.Day)
)

// reserved is the room for reports kept for reporters with history.
func reserved() int {
	if reportReserve >= 0 {
		return reportReserve
	}
	return maxReports / 4
}

// firstAnn is the receipt slot of the oldest announce of key this node holds, or now (lock held).
func (r *Relay) firstAnn(key string, now int64) int64 {
	first := now
	for e := range r.st.Key(key) {
		if e.Kind == "announce" && e.Slot < first {
			first = e.Slot
		}
	}
	return first
}

// evictYoung drops the oldest report of the reporter whose first announce is the newest (lock held).
func (r *Relay) evictYoung() bool {
	var o *store.Entry
	var of int64
	for e, f := range r.repYoung {
		if o == nil || f > of || f == of && (e.T < o.T || e.T == o.T && e.ID < o.ID) {
			o, of = e, f
		}
	}
	if o == nil {
		return false
	}
	r.refuse(o.ID)
	r.remove([]string{o.ID})
	return true
}

// indexReports rebuilds the reports by reporter and target from the store (start). A report
// replaced by a newer one stays in the files until they are rewritten: it goes again here.
func (r *Relay) indexReports() {
	r.reports, r.reportN, r.repYoung = map[string]map[string]*store.Entry{}, 0, map[*store.Entry]int64{}
	var gone []string
	now := r.now()
	for e := range r.st.Kind("report") {
		rec := r.st.Rec(e)
		if rec == nil {
			continue
		}
		if old := r.noteReport(e, rec.Str("target"), now); old != nil {
			gone = append(gone, old.ID)
		}
	}
	r.st.Remove(gone)
}

// noteReport indexes a stored report about target; it returns the report of the same reporter and
// target that is no longer kept (the older one, which may be e itself), for the caller to remove
// (lock held).
func (r *Relay) noteReport(e *store.Entry, target string, now int64) *store.Entry {
	by := r.reports[e.Key]
	if by == nil {
		by = map[string]*store.Entry{}
		r.reports[e.Key] = by
	}
	cur := by[target]
	if cur == e {
		return nil
	}
	if cur != nil && newer(cur.T, cur.ID, e.T, e.ID) {
		return e
	}
	by[target] = e
	if cur == nil {
		r.reportN++
	} else {
		delete(r.repYoung, cur)
	}
	if f := r.firstAnn(e.Key, now); now-f < reportElder {
		r.repYoung[e] = f
	}
	return cur
}

// indexHides rebuilds the newest hide per server from the store (start, and after hides were
// removed; few are kept).
func (r *Relay) indexHides() {
	r.hides = map[string]*store.Entry{}
	for e := range r.st.Kind("hide") {
		h := r.st.Rec(e)
		if h == nil {
			continue
		}
		srv := h.Str("server")
		if cur := r.hides[srv]; cur == nil || newer(e.T, e.ID, cur.T, cur.ID) {
			r.hides[srv] = e
		}
	}
}

// dropReport takes a removed report out of the index (lock held).
func (r *Relay) dropReport(e *store.Entry) {
	by := r.reports[e.Key]
	for target, x := range by {
		if x == e {
			delete(by, target)
			delete(r.repYoung, e)
			r.reportN--
			break
		}
	}
	if by != nil && len(by) == 0 {
		delete(r.reports, e.Key)
	}
}

// reportCheck is the state check of a report (5.10): to this server only, from a network this node
// knows when a client puts it, the newest per reporter and target, and within the caps (lock held).
func (r *Relay) reportCheck(rec *fed.Record, now int64, o origin) string {
	if r.own == nil || rec.Str("server") != r.own.ID {
		return fed.NotNode
	}
	if o.peer != nil && !o.same {
		return fed.BadKind // reports never leave their server
	}
	if o.client && r.ann[rec.Key] == nil {
		return fed.Refused
	}
	if r.st.Get(rec.ID) != nil {
		return ""
	}
	by := r.reports[rec.Key]
	cur := by[rec.Str("target")]
	if cur != nil && newer(cur.T, cur.ID, rec.T, rec.ID) {
		return fed.Refused // older than the report kept
	}
	day := 0
	for _, e := range by {
		if e != cur && e.Slot > now-fed.Day {
			day++
		}
	}
	if day >= maxReportsPerDay {
		return fed.TooMany
	}
	if cur == nil {
		young := now-r.firstAnn(rec.Key, now) < reportElder
		if young && (len(r.repYoung) >= maxReports-reserved() || r.reportN >= maxReports) ||
			!young && r.reportN >= maxReports && len(r.repYoung) == 0 {
			return fed.TooMany
		}
	}
	// A game's reports also count by its address: keys cost nothing to make.
	if o.sess != nil && o.sess.addr.IsValid() {
		if q := quotaOf(r, r.addrQ, addrLevels(o.sess.addr)[0].p, now); q == nil || q.reports.left(now, float64(maxReportsPerAddr)) < 1 {
			return fed.RateLimited
		}
	}
	return ""
}

// countOffer adds d to the offers counted for a stored offer's author and pair (lock held).
func (r *Relay) countOffer(key, to string, d int) {
	for _, k := range []string{key, key + "|" + to} {
		if r.offerN[k] += d; r.offerN[k] <= 0 {
			delete(r.offerN, k)
		}
	}
}

// newer reports whether announce (or report) a is newer than b: greatest t, then lowest id.
func newer(at int64, aid string, bt int64, bid string) bool { return at > bt || at == bt && aid < bid }

// noteAnn indexes a stored announce as its key's newest when it is (lock held).
func (r *Relay) noteAnn(e *store.Entry) {
	if cur := r.ann[e.Key]; cur == nil || newer(e.T, e.ID, cur.T, cur.ID) {
		r.ann[e.Key] = e
	}
}

// reindexAnn works out a key's newest announce again after one was removed (lock held).
func (r *Relay) reindexAnn(key string) {
	delete(r.ann, key)
	for e := range r.st.Key(key) {
		if e.Kind == "announce" {
			r.noteAnn(e)
		}
	}
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
	sess   *session // the client session it came from (nil for the command line)
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
		if rec.Str("head") != r.own.Head {
			// New server records only at the final head (8.2): keys removed since could still sign at
			// the heads where they were operators.
			return fed.BadChain
		}
		if l := r.own.At[rec.Str("head")]; !l.IsOperator(rec.Key) || r.strangers(rec) {
			return fed.NotOperator
		}
		if r.own.CheckServer(rec) != "" && now >= rec.T+fed.PendingLife {
			return fed.TooOld
		}
	case "hide":
		// Only hides of this server and of registry servers are kept and passed on (8.3), like
		// votes: a server known from gossip alone costs nothing to make up. One per server, the
		// newest: an older one is refused, a newer one replaces it at once (after).
		srv := rec.Str("server")
		st := r.receiptState(srv)
		if st == nil {
			return fed.UnknownSrv
		}
		if !st.IsOperator(rec.Key) {
			return fed.NotOperator
		}
		if cur := r.hides[srv]; cur != nil && cur.ID != rec.ID && newer(cur.T, cur.ID, rec.T, rec.ID) {
			return fed.Refused
		}
	case "shun", "unshun":
		// Only votes that can count are kept and passed on (8.3): those of registry servers (10.7
		// counts no others) and this server's own. A server known from gossip alone costs nothing
		// to make up, so its votes would let anyone fill the store and the tally.
		srv := rec.Str("server")
		var st *chain.State
		if e, ok := r.regs[srv]; ok {
			st = e.State
		} else if r.own != nil && srv == r.own.ID {
			st = r.own
		}
		if st == nil {
			return fed.UnknownSrv
		}
		if !st.IsOperator(rec.Key) {
			return fed.NotOperator
		}
		if r.voteN[srv] >= maxVotesPerServer && r.st.Get(rec.ID) == nil {
			return fed.TooMany
		}
	case "announce":
		// A network's founded never changes (5.1): an announce saying another day than the key's
		// newest here is refused, so no one claims the newcomer price late or an old network early.
		if cur := r.ann[rec.Key]; cur != nil && cur.ID != rec.ID {
			if x := r.st.Rec(cur); x != nil && x.Int("founded") != rec.Int("founded") {
				return fed.Refused
			}
		}
	case "offer":
		to, _ := rec.Body["to"].(string)
		if r.st.Get(rec.ID) == nil && (r.offerN[rec.Key] >= maxOffersPerKey || r.offerN[rec.Key+"|"+to] >= maxOffersPerPair) {
			return fed.TooMany
		}
	case "report":
		return r.reportCheck(rec, now, o)
	}
	return ""
}

// validReceipts keeps the receipts that check against servers whose receipts count (6.1): this
// server and registry servers. A server known from gossip alone costs nothing to make up (8.3), so
// its receipts could date any record to any slot.
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
		st := r.receiptState(srv)
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
	existing := r.st.Get(rec.ID)
	if existing == nil && !o.client {
		list, slot = r.validReceipts(rec, rcpts, now)
	}
	refs, newKey, code := r.growthCheck(rec, now, o, list)
	if code != "" {
		r.o.Metrics.Inc("relay_refused_total", code)
		return "", nil, code
	}
	if existing == nil {
		if len(list) == 0 {
			cc := ""
			if o.client {
				cc = o.cc
			}
			mine = r.o.Node.MakeReceipt(rec, r.cfg.Server, now, cc)
			list, slot = []map[string]any{mine}, fed.Slot(now)
		}
		// One announce per key and slot is kept, the newest (5.1): an older one is not stored.
		if cur := r.ann[rec.Key]; rec.Kind == "announce" && cur != nil && cur.Slot == slot && newer(cur.T, cur.ID, rec.T, rec.ID) {
			r.o.Metrics.Inc("relay_refused_total", fed.Refused)
			return "", nil, fed.Refused
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
	if res == store.Stored {
		charge(refs, newKey, e)
		if rec.Kind == "report" && o.sess != nil && o.sess.addr.IsValid() {
			if q := r.addrQ[addrLevels(o.sess.addr)[0].p]; q != nil {
				q.reports.n--
			}
		}
	}
	if o.client && rec.Kind == "stats" {
		r.statsAt[rec.Key] = fed.Slot(now)
	}
	r.o.Metrics.Inc("relay_records_in_total", rec.Kind)
	r.after(e, rec, rcptCC(list, slot), now)
	r.fanout(e, o.peer)
	if !o.client {
		mine = nil
	}
	return res, mine, ""
}

// after updates what depends on a newly stored or merged record (rec: the copy just taken; cc:
// the country of its earliest receipt).
func (r *Relay) after(e *store.Entry, rec *fed.Record, cc string, now int64) {
	switch rec.Kind {
	case "stats":
		r.rank.Stats(e.ID, e.Key, e.Slot, rec.T, rec.Body, cc)
	case "announce":
		// One per key and slot: a newer announce in the slot of the key's newest replaces it.
		cur := r.ann[rec.Key]
		r.noteAnn(e)
		if cur != nil && cur != e && cur.Slot == e.Slot && newer(rec.T, rec.ID, cur.T, cur.ID) {
			r.refuse(cur.ID) // not wanted again from peers
			r.remove([]string{cur.ID})
		}
		r.rank.Announce(rec.Key, r.newestAnn(rec.Key))
	case "offer":
		r.countOffer(e.Key, e.To(), 1)
	case "report":
		// One per reporter and target, the newest (5.10): the older one goes.
		if old := r.noteReport(e, rec.Str("target"), now); old != nil {
			r.refuse(old.ID)
			r.remove([]string{old.ID})
		}
		// Past the bound (a reporter with history came, reportCheck): the newest key's oldest goes.
		for r.reportN > maxReports && r.evictYoung() {
		}
	case "hide":
		// One per server, the newest (5.7): the one it replaces goes now, not at retention.
		srv := rec.Str("server")
		if cur := r.hides[srv]; cur == nil || newer(e.T, e.ID, cur.T, cur.ID) {
			r.hides[srv] = e
			if cur != nil && cur != e {
				r.refuse(cur.ID)
				r.remove([]string{cur.ID})
			}
		}
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
		r.rank.DropState(rec.Key)
		var drop []string
		for x := range r.st.Key(rec.Key) {
			if x.Kind != "leave" && x.T <= rec.T {
				drop = append(drop, x.ID)
			}
		}
		// The files catch up at the next retention run (today's included); until then a restart
		// removes these again from the leave record (New).
		r.remove(drop)
	}
}

// leftBehind lists records a leave removes (non-leave records of its key with t <= its t) that
// are still in the store (lock held).
func (r *Relay) leftBehind() []string {
	var drop []string
	for key, t := range r.left {
		for x := range r.st.Key(key) {
			if x.Kind != "leave" && x.T <= t {
				drop = append(drop, x.ID)
			}
		}
	}
	return drop
}

// item is a record with its receipts, as recs and push carry it: its stored text, not parsed
// again (lock held). Nil when it cannot be read back.
func (r *Relay) item(e *store.Entry) map[string]any {
	rec, rcpt, err := r.st.Raw(e)
	if err != nil {
		r.o.Log.Error("store: a record could not be read back", "id", e.ID, "err", err)
		return nil
	}
	return map[string]any{"rec": canon.Raw(rec), "rcpt": canon.Raw(rcpt)}
}

// itemSize is the length of an item's canonical text.
func itemSize(it map[string]any) int {
	a, ok := it["rec"].(canon.Raw)
	b, _ := it["rcpt"].(canon.Raw)
	if !ok {
		return len(canon.Encode(it))
	}
	return len(a) + len(b) + len(`{"rcpt":,"rec":}`)
}

// classOf is the sync class of a kind ("" for kinds only nodes of one server exchange: the chain
// records, and players' reports, which are for this server's operators alone).
func classOf(kind string) string {
	switch kind {
	case "announce", "stats", "offer", "accept", "decline", "leave", "state":
		return "players"
	case "hide":
		return "advice"
	case "shun", "unshun":
		return "always"
	}
	return ""
}

// sends reports whether a session carries records of this kind to its peer.
func (s *session) sends(kind string) bool {
	if s.same {
		return true
	}
	c := classOf(kind)
	return c == "always" || c != "" && slices.Contains(s.send, c)
}

// takes reports whether a session may be sent a stored record by what it listed in feats (lock
// held): a record carrying ix2 fields goes only to a node or game that takes them (9.3, 9.4), since
// an older one refuses those fields. Nodes of this server too: they may still run an older relay.
func (s *session) takes(e *store.Entry) bool {
	return !e.Ix2() || slices.Contains(s.feats, fed.FeatIx2)
}

// fanout pushes a stored record to node sessions and client subscriptions (lock held).
func (r *Relay) fanout(e *store.Entry, from *session) {
	if r.shunned[e.Key] {
		return
	}
	it := r.item(e)
	if it == nil {
		return
	}
	for s := range r.nodes {
		if s == from || !s.synced || !s.sends(e.Kind) || !s.takes(e) {
			continue
		}
		s.enqueue(map[string]any{"m": "push", "items": []any{it}})
		r.o.Metrics.Inc("relay_records_out_total", "")
	}
	for s := range r.clients {
		// Once per session, however many of its subs follow the kind: in the lowest live one's recs
		// (a sub still sending its backlog reaches this record by scanning).
		var to int64
		found := false
		for id, sub := range s.subs {
			if sub.live && sub.kinds[e.Kind] && (!found || id < to) {
				to, found = id, true
			}
		}
		if found && r.shows(s, e) {
			s.enqueue(map[string]any{"m": "recs", "id": to, "items": []any{it}, "cursor": r.cursor(e.Seq), "more": false})
			r.o.Metrics.Inc("relay_records_out_total", "")
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
func rcptCC(rcpts []map[string]any, slot int64) string {
	for _, rc := range rcpts {
		if t, _ := rc["t"].(int64); t == slot {
			b, _ := rc["body"].(map[string]any)
			cc, _ := b["cc"].(string)
			return cc
		}
	}
	return ""
}

// newestAnnEntry is a key's newest announce (lock held), or nil.
func (r *Relay) newestAnnEntry(key string) *store.Entry { return r.ann[key] }

// newestAnn is what the boards use of a key's newest announce (lock held), or nil.
func (r *Relay) newestAnn(key string) *rank.Ann {
	if e := r.newestAnnEntry(key); e != nil {
		if x := r.st.Rec(e); x != nil {
			return annOf(x)
		}
	}
	return nil
}

func annOf(x *fed.Record) *rank.Ann {
	return &rank.Ann{ID: x.ID, T: x.T, Name: x.Str("name"), Home: x.Str("home"), Policy: x.Str("policy"),
		Founded: x.Int("founded"), Day: x.Int("day")}
}

// loaded is a stats record as the store read it at start, parsed for the leaderboards.
type loaded struct {
	e   *store.Entry
	raw rank.Raw
}

// rankSnapshot is what the leaderboards are built from at start (lock held): every stats record
// still stored and each key's newest announce.
func (r *Relay) rankSnapshot(pre []loaded) ([]rank.Raw, map[string]*rank.Ann) {
	raws := make([]rank.Raw, 0, r.st.Count("stats"))
	for _, p := range pre {
		if r.st.Get(p.e.ID) == p.e {
			raws = append(raws, p.raw)
		}
	}
	anns := make(map[string]*rank.Ann, len(r.ann))
	for k := range r.ann {
		if a := r.newestAnn(k); a != nil {
			anns[k] = a
		}
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
	for e := range r.st.Key(key) {
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
	// A leave is kept LeaveKept: past that its key is forgotten, as a restart would forget it.
	for k, t := range r.left {
		if now-t > fed.LeaveKept {
			delete(r.left, k)
		}
	}
	r.sweepQuotas(now)
	if len(drop) > 0 {
		r.o.Log.Info("retention: dropped records", "count", len(drop))
	}
}

// remove drops records from the store and from what is indexed beside it (lock held).
func (r *Relay) remove(ids []string) {
	votes, hides := false, false
	anns := map[string]bool{}
	for _, id := range ids {
		e := r.st.Get(id)
		if e == nil {
			continue
		}
		switch e.Kind {
		case "shun", "unshun":
			votes = true
		case "stats":
			r.rank.Drop(id)
		case "announce":
			if r.ann[e.Key] == e {
				anns[e.Key] = true // its newest goes: look for the next
			}
		case "offer":
			r.countOffer(e.Key, e.To(), -1)
		case "report":
			r.dropReport(e)
		case "hide":
			hides = true
		}
	}
	r.st.Remove(ids)
	if hides {
		r.indexHides()
	}
	for k := range anns {
		r.reindexAnn(k)
		r.rank.Announce(k, r.newestAnn(k))
	}
	if votes {
		r.indexVotes()
	}
}

// expired lists ids past their keeping time.
func (r *Relay) expired(now int64) []string {
	drop := r.leftBehind()
	keepStats := now - 3*fed.Day // two windows and slack
	prevFrom := fed.Slot(now) - 2*fed.WindowSlots*fed.SlotLen
	carryFrom := prevFrom - fed.CarryForward
	for _, recs := range r.byKeyKind("stats") {
		// Newest first: board slot, then 10.2's order within a slot.
		sort.Slice(recs, func(i, j int) bool {
			a, b := recs[i], recs[j]
			if a.Slot != b.Slot {
				return a.Slot > b.Slot
			}
			if a.T != b.T {
				return a.T > b.T
			}
			return a.ID < b.ID
		})
		// Besides the newest, the record effective at the previous window's start (10.2) is kept
		// while it can carry forward into the windows: a network silent for days that posts again
		// still has its value there.
		atPrev := -1
		for i, e := range recs {
			if e.Slot <= prevFrom {
				atPrev = i
				break
			}
		}
		for i, e := range recs {
			carried := (i == 0 || i == atPrev) && e.Slot > carryFrom
			if e.Slot < keepStats && !carried {
				drop = append(drop, e.ID)
			}
		}
	}
	for key, recs := range r.byKeyKind("announce") {
		sort.Slice(recs, func(i, j int) bool { return recs[i].T > recs[j].T })
		if now-r.lastHeard(key) >= fed.QuietForgotten {
			for _, e := range recs {
				drop = append(drop, e.ID)
			}
			continue
		}
		// Older announces stay while an offer may still rely on them.
		for i := 1; i < len(recs); i++ {
			if now-recs[i-1].T > fed.OfferKept+fed.Day {
				drop = append(drop, recs[i].ID)
			}
		}
	}
	// Votes are kept until they can no longer count: a vote counts for 90 days, and a shun holds
	// 7 days after the votes fell below the threshold (10.7 step 5), so 97 days.
	ages := map[string]int64{"offer": fed.OfferKept, "accept": fed.OfferKept, "decline": fed.OfferKept,
		"shun": fed.VoteLife + fed.ShunLift, "unshun": fed.VoteLife + fed.ShunLift, "leave": fed.LeaveKept, "report": fed.ReportKept}
	for k, age := range ages {
		for e := range r.st.Kind(k) {
			if now-e.T > age {
				drop = append(drop, e.ID)
			}
		}
	}
	// Hide: the newest per server, of this server and registry servers only (older relays kept
	// those of servers known from gossip). Without a registry snapshot yet, others wait for one.
	newest := map[string]*fed.Record{}
	for e := range r.st.Kind("hide") {
		h := r.st.Rec(e)
		s := h.Str("server")
		if n := newest[s]; n == nil || h.T > n.T || h.T == n.T && h.ID < n.ID {
			newest[s] = h
		}
	}
	regKnown := r.reg != nil || r.cfg.Registry == ""
	for e := range r.st.Kind("hide") {
		h := r.st.Rec(e)
		if newest[h.Str("server")] != h || regKnown && r.receiptState(h.Str("server")) == nil {
			drop = append(drop, e.ID)
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
		for e := range r.st.Kind("operators") {
			if !applied[e.ID] && !pend[e.ID] {
				drop = append(drop, e.ID)
			}
		}
		for e := range r.st.Kind("server") {
			x := r.st.Rec(e)
			if x == r.ownSrv || x == r.headSrv {
				continue
			}
			pending := x.Str("server") == r.own.ID && x.Str("head") == r.own.Head && now < x.T+fed.PendingLife
			if !pending || r.ownSrv != nil && x.T < r.ownSrv.T {
				drop = append(drop, e.ID)
			}
		}
		for e := range r.st.Kind("genesis") {
			if e.ID != r.own.ID {
				drop = append(drop, e.ID)
			}
		}
	}
	return drop
}

func (r *Relay) byKeyKind(kind string) map[string][]*store.Entry {
	out := map[string][]*store.Entry{}
	for e := range r.st.Kind(kind) {
		out[e.Key] = append(out[e.Key], e)
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
	// Live states go out to other nodes in batches; quiet keys are forgotten (5.11).
	r.loop("states", statesEvery, r.flushStates)
	r.loop("live", 30*time.Second, func() { r.rank.ExpireStates(r.now()) })
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

// addrLimits is what one address may do (privacy.Limiter).
func addrLimits(c *config.Config) privacy.Limits {
	return privacy.Limits{Open: c.Limits.OpenPerAddr, Burst: c.Limits.ConnBurst, Rate: c.Limits.ConnsPerSec}
}

// Reload applies a new config (SIGHUP).
func (r *Relay) Reload(c *config.Config) {
	r.mu.Lock()
	r.cfg = c
	r.conf.Store(c)
	r.limiter.Set(addrLimits(c))
	r.mu.Unlock()
	r.reconcile()
	r.o.Log.Info("config reloaded")
}

var errClosed = errors.New("relay closed")

func (r *Relay) logf(msg string, args ...any) { r.o.Log.Info(fmt.Sprintf(msg, args...)) }

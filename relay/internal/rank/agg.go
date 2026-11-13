package rank

import (
	"maps"
	"runtime"
	"slices"
	"sync"
	"sync/atomic"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Agg is the in-memory aggregate of one node. Records come in through Stats, Drop, Announce and
// Exclude, which only queue them (they are called with the node's own lock held, so they never
// wait for a ranking); one goroutine applies the queue under the aggregate's write lock, doing
// work in proportion to the networks a record changes. Rankings read under the read lock.
type Agg struct {
	mu    sync.RWMutex
	nets  map[string]*net
	byID  map[string]*stat
	words map[string]string // strings records share (intern)
	c     int64             // the running slot the per-slot sums are for; 0: not yet worked out
	ex    map[string]bool
	names map[string]bool
	gen   atomic.Uint64 // changes when a value in the windows may have changed
	meta  atomic.Uint64 // changes when announces or hidden names changed

	ready atomic.Bool
	qmu   sync.Mutex
	q     []event
	wake  chan struct{}

	cmu  sync.Mutex // guards cone
	cone *coneSet   // per-slot cone sizes of one state, worked out when a cone board is asked for

	// Live states (5.11, live.go): the newest of each key, in memory only, and recent snapshots.
	lmu         sync.RWMutex
	lm          map[string]*Live
	lbytes      int
	lmax, lmaxB int
	snaps       []*snap
	xgen        atomic.Uint64 // changes when the excluded set changes

	workers   int
	jobs      chan func()
	fmu       sync.Mutex
	bases     *lru
	slices    *lru
	facets    *lru
	nowBases  *lru
	nowSlices *lru
	stop      chan struct{}
	wg        sync.WaitGroup
	once      sync.Once
}

type event struct {
	op          byte // 's' stats, 'd' drop, 'a' announce, 'x' excluded
	id, key, cc string
	slot, t     int64
	body        map[string]any
	ann         *Ann
	ex, names   map[string]bool
}

// Bounds of the caches (entries) and of the job queue.
const (
	maxBases  = 64
	maxSlices = 256
	maxFacets = 8
	queueLen  = 256
)

// New makes an aggregate with a pool of workers (0: GOMAXPROCS). It is not ready (Rank answers
// ErrNotReady) until Load has run; records fed before are kept and applied after it.
func New(workers int) *Agg {
	if workers <= 0 {
		workers = runtime.GOMAXPROCS(0)
	}
	a := &Agg{nets: map[string]*net{}, byID: map[string]*stat{}, words: map[string]string{}, ex: map[string]bool{}, names: map[string]bool{},
		wake: make(chan struct{}, 1), workers: workers, jobs: make(chan func(), queueLen),
		bases: newLRU(maxBases), slices: newLRU(maxSlices), facets: newLRU(maxFacets), stop: make(chan struct{}),
		lm: map[string]*Live{}, lmax: LiveMax, lmaxB: LiveMaxBytes, nowBases: newLRU(maxBases / 4), nowSlices: newLRU(maxSlices / 4)}
	a.wg.Add(workers + 1)
	for range workers {
		go a.worker()
	}
	go a.applier()
	return a
}

// Close stops the workers and the applier.
func (a *Agg) Close() {
	a.once.Do(func() { close(a.stop) })
	a.wg.Wait()
}

func (a *Agg) worker() {
	defer a.wg.Done()
	for {
		select {
		case <-a.stop:
			return
		case f := <-a.jobs:
			f()
		}
	}
}

func (a *Agg) applier() {
	defer a.wg.Done()
	for {
		select {
		case <-a.stop:
			return
		case <-a.wake:
			a.flush()
		}
	}
}

func (a *Agg) feed(e event) {
	a.qmu.Lock()
	a.q = append(a.q, e)
	a.qmu.Unlock()
	select {
	case a.wake <- struct{}{}:
	default:
	}
}

// Stats feeds a stored stats record (again when its board slot changed). cc: the country of its
// earliest receipt, or "".
func (a *Agg) Stats(id, key string, slot, t int64, body map[string]any, cc string) {
	a.feed(event{op: 's', id: id, key: key, slot: slot, t: t, body: body, cc: cc})
}

// Drop feeds the removal of a stats record.
func (a *Agg) Drop(id string) { a.feed(event{op: 'd', id: id}) }

// Announce feeds a network's newest announce (nil: none any more).
func (a *Agg) Announce(key string, ann *Ann) { a.feed(event{op: 'a', key: key, ann: ann}) }

// Exclude feeds the networks this server leaves off its boards (shunned, hidden, refused) and
// those it shows by ASN only. The maps are copied.
func (a *Agg) Exclude(ex, names map[string]bool) {
	a.feed(event{op: 'x', ex: maps.Clone(ex), names: maps.Clone(names)})
}

// flush applies what is queued (nothing before Load). The queue is taken under the write lock,
// in one step with applying it: two flushes (the applier's and a request's) then apply events in
// the order they were fed, never a later drop before an earlier stats record.
func (a *Agg) flush() {
	if !a.ready.Load() {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.qmu.Lock()
	q := a.q
	a.q = nil
	a.qmu.Unlock()
	if len(q) == 0 {
		return
	}
	if flushHook != nil {
		flushHook(q)
	}
	for _, e := range q {
		a.apply(e)
	}
}

// flushHook, when set (tests), runs after a flush took the queue and before it applies it.
var flushHook func([]event)

func (a *Agg) pending() bool {
	a.qmu.Lock()
	defer a.qmu.Unlock()
	return len(a.q) > 0
}

// Raw is a stats record for Load.
type Raw struct {
	ID, Key, CC string
	Slot, T     int64
	Body        map[string]any
	s           *stat // already parsed (Parsed)
}

// Parsed is a stats record for Load, parsed now: the body need not be kept until Load.
func Parsed(id, key string, slot, t int64, body map[string]any, cc string) Raw {
	return Raw{s: parse(id, key, slot, t, body, cc)}
}

// Load builds the aggregate from the store (start): records are parsed in parallel chunks, then
// indexed; the per-slot sums are worked out by the first Warm or Rank. Then it is ready.
func (a *Agg) Load(stats []Raw, anns map[string]*Ann, ex, names map[string]bool) {
	parsed := make([]*stat, len(stats))
	parallel(len(stats), a.workers, func(i int) {
		r := stats[i]
		if parsed[i] = r.s; r.s == nil {
			parsed[i] = parse(r.ID, r.Key, r.Slot, r.T, r.Body, r.CC)
		}
	})
	a.mu.Lock()
	for _, s := range parsed {
		if a.byID[s.id] != nil {
			continue
		}
		a.byID[s.id] = s
		x := a.net(s.key)
		s.key = x.key
		x.all = append(x.all, s)
		if len(s.tr) > 0 {
			x.withTr++
		}
		if s.lists() {
			x.withCn++
		}
		for _, e := range s.tr {
			a.lister(e.key, s.key, 1)
		}
		a.intern(s)
	}
	list := slices.Collect(maps.Values(a.nets))
	parallel(len(list), a.workers, func(i int) {
		x := list[i]
		slices.SortFunc(x.all, func(p, q *stat) int {
			switch {
			case p.slot != q.slot:
				return cmp64(p.slot, q.slot)
			case better(p, q):
				return -1
			case better(q, p):
				return 1
			}
			return 0
		})
		x.rewin()
	})
	for k, an := range anns {
		a.net(k).ann = an
	}
	a.ex, a.names = maps.Clone(ex), maps.Clone(names)
	if a.ex == nil {
		a.ex = map[string]bool{}
	}
	if a.names == nil {
		a.names = map[string]bool{}
	}
	a.c = 0
	a.gen.Add(1)
	a.meta.Add(1)
	a.mu.Unlock()
	a.ready.Store(true)
	a.flush()
}

// Ready reports whether Load has run.
func (a *Agg) Ready() bool { return a.ready.Load() }

func cmp64(x, y int64) int {
	switch {
	case x < y:
		return -1
	case x > y:
		return 1
	}
	return 0
}

// parallel runs f(0..n-1) on at most w goroutines that live for this call only.
func parallel(n, w int, f func(i int)) {
	if n < 512 || w <= 1 {
		for i := range n {
			f(i)
		}
		return
	}
	var next atomic.Int64
	var wg sync.WaitGroup
	for range w {
		wg.Go(func() {
			for {
				i := int(next.Add(1) - 1)
				if i >= n {
					return
				}
				f(i)
			}
		})
	}
	wg.Wait()
}

func (a *Agg) net(key string) *net {
	x := a.nets[key]
	if x == nil {
		x = newNet(key)
		a.nets[key] = x
	}
	return x
}

func (a *Agg) lister(of, by string, d int32) {
	y := a.net(of)
	if y.listers == nil {
		y.listers = map[string]int32{}
	}
	y.listers[by] += d
	if y.listers[by] <= 0 {
		delete(y.listers, by)
		a.tidy(y)
	}
}

// maxWords bounds the other strings the aggregate shares between records (cities, countries,
// models, harnesses): what clients send is not a fixed set.
const maxWords = 4096

// intern makes a new record share the strings it repeats with the records already held: keys
// with the networks' own, the rest with a bounded table (write lock held, before s is published).
// Most of what a stats record holds is other networks' keys.
func (a *Agg) intern(s *stat) {
	key := func(k string) string {
		if y := a.nets[k]; y != nil {
			return y.key
		}
		return k
	}
	word := func(w string) string {
		if v, ok := a.words[w]; ok {
			return v
		}
		if len(a.words) < maxWords {
			a.words[w] = w
		}
		return w
	}
	for i := range s.tr {
		s.tr[i].key = key(s.tr[i].key)
	}
	if s.trIdx != nil {
		for i, e := range s.tr {
			if j, ok := s.trIdx[e.key]; ok && int(j) == i {
				delete(s.trIdx, e.key)
				s.trIdx[e.key] = j
			}
		}
	}
	for i := range s.links {
		s.links[i] = key(s.links[i])
	}
	for i := range s.pops {
		s.pops[i].city = word(s.pops[i].city)
	}
	if s.aiw != nil {
		s.aiw.model, s.aiw.harness = word(s.aiw.model), word(s.aiw.harness)
	}
	s.cc = word(s.cc)
}

// tidy forgets a network nothing refers to any more.
func (a *Agg) tidy(x *net) {
	if len(x.all) == 0 && len(x.listers) == 0 && x.ann == nil {
		delete(a.nets, x.key)
	}
}

// apply is one queued change (write lock held).
func (a *Agg) apply(e event) {
	switch e.op {
	case 's':
		if o := a.byID[e.id]; o != nil {
			if o.slot == e.slot {
				return
			}
			a.drop(o)
		}
		s := parse(e.id, e.key, e.slot, e.t, e.body, e.cc)
		x := a.net(s.key)
		s.key = x.key
		x.insert(s)
		a.byID[s.id] = s
		for _, t := range s.tr {
			a.lister(t.key, s.key, 1)
		}
		a.intern(s)
		a.touch(x, s.slot, x.reach(s.slot))
	case 'd':
		if o := a.byID[e.id]; o != nil {
			a.drop(o)
		}
	case 'a':
		x := a.nets[e.key]
		if x == nil && e.ann == nil {
			return
		}
		if x == nil {
			x = a.net(e.key)
		}
		x.ann = e.ann
		a.meta.Add(1)
		a.tidy(x)
	case 'x':
		if !maps.Equal(a.names, e.names) {
			a.names = e.names
			a.meta.Add(1)
		}
		if maps.Equal(a.ex, e.ex) {
			return
		}
		var changed []string
		for k := range a.ex {
			if !e.ex[k] {
				changed = append(changed, k)
			}
		}
		for k := range e.ex {
			if !a.ex[k] {
				changed = append(changed, k)
			}
		}
		a.ex = e.ex
		a.gen.Add(1)
		a.xgen.Add(1)
		// Traffic with an excluded network counts 0: only those that list it change.
		if a.c != 0 {
			for _, k := range changed {
				if y := a.nets[k]; y != nil {
					for z := range y.listers {
						a.fill(a.nets[z], 0, N)
					}
				}
			}
		}
	}
}

func (a *Agg) drop(s *stat) {
	x := a.nets[s.key]
	delete(a.byID, s.id)
	if x == nil {
		return
	}
	x.remove(s)
	a.touch(x, s.slot, x.reach(s.slot))
	for _, t := range s.tr {
		a.lister(t.key, s.key, -1)
	}
	if x.withTr == 0 {
		x.sums.clear()
	}
	a.tidy(x)
}

// touch works out again the sums at the window slots in [lo, hi) (times) of x and of every
// network that lists x, whose effective record there may have changed.
func (a *Agg) touch(x *net, lo, hi int64) {
	if a.c == 0 {
		return
	}
	from := a.c - N*fed.SlotLen
	i0, i1 := ixAt(from, lo), ixAt(from, hi)
	if i0 >= i1 {
		return
	}
	a.gen.Add(1)
	a.fill(x, i0, i1)
	for k := range x.listers {
		a.fill(a.nets[k], i0, i1)
	}
}

// ixAt is the first window slot index at or after time t, clamped to 0..N.
func ixAt(from, t int64) int {
	d := t - from
	if d <= 0 {
		return 0
	}
	i := (d + fed.SlotLen - 1) / fed.SlotLen
	if i > N {
		return N
	}
	return int(i)
}

// fill works out IN and OUT of x at the window slots i0..i1-1 (10.4, no region).
func (a *Agg) fill(x *net, i0, i1 int) {
	if x == nil {
		return
	}
	if x.sums.none() {
		if x.withTr == 0 {
			return
		}
		x.sums.make()
		i0, i1 = 0, N
	}
	from := a.c - N*fed.SlotLen
	x.runs(from, i0, i1, func(i, j int, r *stat) {
		for k := i; k < j; k++ {
			if r == nil || !r.normal || len(r.tr) == 0 {
				x.sums.set(k, 0, 0)
				continue
			}
			in, out := a.traffic(x, r, from+int64(k)*fed.SlotLen, nil)
			x.sums.set(k, in, out)
		}
	})
}

// traffic is IN(s) and OUT(s) of x whose effective record at s is r (10.4).
func (a *Agg) traffic(x *net, r *stat, s int64, rg *region) (int64, int64) {
	var in, out int64
	for _, e := range r.tr {
		if a.ex[e.key] {
			continue
		}
		var ye *stat
		if y := a.nets[e.key]; y != nil {
			ye = y.eff(s)
		}
		if rg != nil && (ye == nil || !ye.normal || !rg.has(ye)) {
			continue
		}
		switch {
		case ye == nil:
			in += int64(e.in)
			out += int64(e.out)
		case !ye.normal:
		default:
			yi, yo := ye.report(x.key)
			in += min(int64(e.in), yo)
			out += min(int64(e.out), yi)
		}
	}
	return in, out
}

// window brings the per-slot sums to the windows of running slot c.
func (a *Agg) window(c int64) {
	a.mu.RLock()
	ok := a.c == c || a.c != 0 && c < a.c
	a.mu.RUnlock()
	if ok {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.shift(c)
}

// shift moves the windows to running slot c (write lock held): the sums of slots still in the
// windows stay, only the new slots are worked out (all of them after a long gap). The windows never
// move back: a request for an older slot (one that waited while another moved them on) is worked
// out for its own slot without the sums (computeBase).
func (a *Agg) shift(c int64) {
	if a.c == c || a.c != 0 && c < a.c {
		return
	}
	var list []*net
	for _, x := range a.nets {
		if !x.sums.none() || x.withTr > 0 {
			list = append(list, x)
		}
	}
	if a.c != 0 && c > a.c && (c-a.c)/fed.SlotLen < N {
		d := int((c - a.c) / fed.SlotLen)
		a.c = c
		parallel(len(list), a.workers, func(i int) {
			x := list[i]
			if x.sums.none() {
				a.fill(x, 0, N)
				return
			}
			x.sums.shift(d)
			a.fill(x, N-d, N)
		})
	} else {
		a.c = c
		parallel(len(list), a.workers, func(i int) {
			list[i].sums.clear()
			a.fill(list[i], 0, N)
		})
	}
	a.gen.Add(1)
}

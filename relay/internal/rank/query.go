package rank

import (
	"container/list"
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Errors of Rank and Facets.
var (
	ErrNotReady = errors.New("rank: still loading")
	ErrBusy     = errors.New("rank: too many rankings waiting")
)

// Row is one line of an answer (9.5).
type Row struct {
	Rank  int    `json:"rank"`
	Key   string `json:"key"`
	Value int64  `json:"value"`
	Name  string `json:"name,omitempty"`
	ASN   int64  `json:"asn"`
	AI    bool   `json:"ai"`
	Home  string `json:"home,omitempty"`
	CC    string `json:"cc,omitempty"`
}

// Me is the asking network's own row: its rank in the slice (nil when the filters leave it out).
type Me struct {
	Rank  *int  `json:"rank"`
	Value int64 `json:"value"`
}

// Answer is a ranking (9.5 ranks).
type Answer struct {
	Slot int64 `json:"slot"`
	N    int   `json:"n"`
	Rows []Row `json:"rows"`
	Me   *Me   `json:"me"`
	// At: the time of the snapshot of live states a ranking of now is for (0 for the other measures).
	At int64 `json:"at,omitempty"`
	// Cached: the slice was already worked out (or being worked out) for this state when asked.
	Cached bool `json:"-"`
}

// brow is a ranked network of a board: the network, its effective record at the last slot.
type brow struct {
	x    *net
	last *stat
	v    int64
}

// flight is one result being worked out, or worked out: done closes when it is there.
type flight struct {
	born time.Time // when it was started: never served once older than flightMaxAge
	done chan struct{}
	rows []brow
	idx  []int32
	fac  *Facets
	err  error
	slot int64
}

// lru is a bounded map of flights, the least recently used going first.
type lru struct {
	max int
	m   map[string]*list.Element
	l   *list.List
}

type lruItem struct {
	k string
	f *flight
}

func newLRU(n int) *lru { return &lru{max: n, m: map[string]*list.Element{}, l: list.New()} }

func (c *lru) get(k string) *flight {
	if e := c.m[k]; e != nil {
		c.l.MoveToFront(e)
		return e.Value.(*lruItem).f
	}
	return nil
}

func (c *lru) put(k string, f *flight) {
	c.m[k] = c.l.PushFront(&lruItem{k, f})
	for c.l.Len() > c.max {
		e := c.l.Back()
		c.l.Remove(e)
		delete(c.m, e.Value.(*lruItem).k)
	}
}

func (c *lru) del(k string, f *flight) {
	if e := c.m[k]; e != nil && e.Value.(*lruItem).f == f {
		c.l.Remove(e)
		delete(c.m, k)
	}
}

// flightMaxAge bounds how long a worked-out ranking, board or facets answer is served: whatever its
// key, nothing older is (a var for tests).
var flightMaxAge = 30 * time.Second

// once gives the flight for k: an existing one (done or still running), or a new one the caller
// must work out (owner true). A failed flight is dropped so the next ask tries again.
func (a *Agg) flightFor(c *lru, k string) (*flight, bool) {
	a.fmu.Lock()
	defer a.fmu.Unlock()
	if f := c.get(k); f != nil {
		if time.Since(f.born) < flightMaxAge {
			return f, false
		}
		c.del(k, f) // too old to serve: worked out again
	}
	f := &flight{born: time.Now(), done: make(chan struct{})}
	c.put(k, f)
	return f, true
}

func (a *Agg) land(c *lru, k string, f *flight) {
	if f.err != nil {
		a.fmu.Lock()
		c.del(k, f)
		a.fmu.Unlock()
	}
	close(f.done)
}

func wait(ctx context.Context, f *flight) error {
	select {
	case <-f.done:
		return f.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// stamp names the state results are worked out from.
func (a *Agg) stamp(c int64) string {
	return itoa(c) + "|" + itoa(int64(a.gen.Load())) + "|"
}

// base is a board, ranked, unfiltered but for the region: worked out once per state and kept.
// Called on a worker; it waits only for a base another worker is working out.
func (a *Agg) base(ctx context.Context, q *Slice, c int64, sn *snap) (*flight, error) {
	k := a.stamp(c) + q.baseKey() + "|" + snapKey(sn)
	if q.Board == "cone" { // who is established comes from the announces
		k += "|" + itoa(int64(a.meta.Load()))
	}
	f, owner := a.flightFor(a.bases, k)
	if owner {
		f.rows = a.computeBase(q.Board, q.Measure, q.Cities, c, sn)
		f.slot = c
		a.land(a.bases, k, f)
	}
	return f, wait(ctx, f)
}

// computeBase is 10.3 to 10.5 for one board, measure and region at running slot c (read lock).
// c is the slot the job was queued for: the windows may have moved on meanwhile, and the answer
// must be what that slot gives, since it is labelled with it (9.5) and spot-checked against it.
//
// sn, when not nil, is the snapshot of live states whose values make the running slot c a slot of the
// current window (10.13, running slot): a key with a live state in normal mode gets one more sample there.
func (a *Agg) computeBase(board, measure string, cities []string, c int64, sn *snap) []brow {
	a.mu.RLock()
	defer a.mu.RUnlock()
	var rg *region
	if cities != nil {
		rg = &region{cities: make(map[string]bool, len(cities)), in: map[*stat]bool{}}
		for _, c := range cities {
			rg.cities[c] = true
		}
	}
	from, last := c-N*fed.SlotLen, c-fed.SlotLen
	rows := make([]brow, 0, len(a.nets))
	var buf [2][][2]int64
	var cs map[*net][]int32
	if board == "cone" {
		cs = a.cones(c)
	}
	sums := a.c == c // the per-slot traffic sums are for this slot
	var coneRun map[string]int32
	if board == "cone" && sn != nil {
		coneRun = a.coneRun(sn, c)
	}
	for _, x := range a.nets {
		if len(x.win) == 0 || a.ex[x.key] {
			continue
		}
		l := x.value(last)
		if l == nil || board == "pies" && !l.hasPies || rg != nil && !rg.has(l) {
			continue
		}
		growth := measure == "growth"
		if growth && x.value(from) == nil {
			continue
		}
		v := a.total(x, board, rg, fed.WindowSlots, N, from, &buf, cs[x], sums, a.runSample(x.key, board, sn, c, rg, coneRun))
		if growth {
			prev := a.total(x, board, rg, 0, fed.WindowSlots, from, &buf, cs[x], sums, sample{})
			v = fed.Div((v-prev)*10000, max(prev, floor[board]))
		}
		rows = append(rows, brow{x, l, v})
	}
	slices.SortFunc(rows, func(p, q brow) int {
		if p.v != q.v {
			return cmp64(q.v, p.v)
		}
		return strings.Compare(p.x.key, q.x.key)
	})
	return rows
}

// region is a region filter, with per record whether it has a POP there (worked out once).
type region struct {
	cities map[string]bool
	in     map[*stat]bool
}

func (g *region) set() map[string]bool {
	if g == nil {
		return nil
	}
	return g.cities
}

func (g *region) has(s *stat) bool {
	v, ok := g.in[s]
	if !ok {
		v = s.popsIn(g.cities) > 0
		g.in[s] = v
	}
	return v
}

// total is 10.4 over window slots lo..hi-1 (read lock held). cone: x's cone size per window slot
// (nil: none at any slot). sums: x.in and x.out are for the windows starting at from. run: the
// value of the running slot, when x has one (10.13): one more sample, and the latest one.
func (a *Agg) total(x *net, board string, rg *region, lo, hi int, from int64, buf *[2][][2]int64, cone []int32, sums bool, run sample) int64 {
	switch board {
	case "cone":
		v := buf[0][:0]
		x.runs(from, lo, hi, func(i, j int, r *stat) {
			if r == nil || !r.normal {
				return
			}
			if cone == nil {
				v = append(v, [2]int64{0, int64(j - i)})
				return
			}
			for k := i; k < j; k++ {
				if n := len(v) - 1; n >= 0 && v[n][0] == int64(cone[k]) {
					v[n][1]++
				} else {
					v = append(v, [2]int64{int64(cone[k]), 1})
				}
			}
		})
		if run.ok {
			v = append(v, [2]int64{run.in, 1})
		}
		buf[0] = v
		return p95(v)
	case "pops", "pies":
		// The value of the latest slot of the window with a value (runs come in order).
		var latest int64
		x.runs(from, lo, hi, func(i, j int, r *stat) {
			if r == nil || !r.normal {
				return
			}
			latest = int64(r.pies)
			if board == "pops" {
				latest = r.popsIn(rg.set())
			}
		})
		if run.ok {
			latest = run.in
		}
		return latest
	case "total":
		v := buf[0][:0]
		x.runs(from, lo, hi, func(i, j int, r *stat) {
			if r != nil && r.normal {
				v = append(v, [2]int64{int64(r.total), int64(j - i)})
			}
		})
		if run.ok {
			v = append(v, [2]int64{run.in, 1})
		}
		buf[0] = v
		return p95(v)
	case "traffic":
		in, out := buf[0][:0], buf[1][:0]
		add := func(v [][2]int64, n int64) [][2]int64 {
			if k := len(v) - 1; k >= 0 && v[k][0] == n {
				v[k][1]++
				return v
			}
			return append(v, [2]int64{n, 1})
		}
		x.runs(from, lo, hi, func(i, j int, r *stat) {
			if r == nil || !r.normal {
				return
			}
			for k := i; k < j; k++ {
				var ti, to int64
				switch {
				case rg == nil && sums:
					if !x.sums.none() {
						ti, to = x.sums.at(k)
					}
				case len(r.tr) > 0:
					ti, to = a.traffic(x, r, from+int64(k)*fed.SlotLen, rg)
				}
				in, out = add(in, ti), add(out, to)
			}
		})
		if run.ok {
			in, out = add(in, run.in), add(out, run.out)
		}
		buf[0], buf[1] = in, out
		return max(p95(in), p95(out))
	}
	return 0
}

// keep reports whether a ranked network passes a slice's filters (10.12; read lock held).
func keep(q *Slice, r brow, day int64, keys map[string]bool) bool {
	l, an := r.last, r.x.ann
	switch {
	case q.Division == "ai" && !l.ai, q.Division == "human" && l.ai:
		return false
	case q.Model != nil && (!l.ai || l.model() != *q.Model), q.Harness != nil && (!l.ai || l.harness() != *q.Harness):
		return false
	case q.Tier1 != nil && l.tier1 != *q.Tier1, q.From != nil && l.cc != *q.From:
		return false
	case q.Home != nil && (an == nil || an.Home != *q.Home), q.Policy != nil && (an == nil || an.Policy != *q.Policy):
		return false
	case keys != nil && !keys[r.x.key]:
		return false
	}
	if q.AgeMin != nil || q.AgeMax != nil {
		if an == nil || day-an.Founded < deref(q.AgeMin, 0) || q.AgeMax != nil && day-an.Founded > *q.AgeMax {
			return false
		}
	}
	if q.DayMin != nil || q.DayMax != nil {
		if an == nil || an.Day < deref(q.DayMin, 0) || q.DayMax != nil && an.Day > *q.DayMax {
			return false
		}
	}
	return true
}

func deref(p *int64, d int64) int64 {
	if p == nil {
		return d
	}
	return *p
}

// slice works out a slice's rows (indexes into its base) into f, on a worker.
func (a *Agg) slice(f *flight, q *Slice, c int64, sn *snap) {
	b, err := a.base(context.Background(), q, c, sn)
	if err != nil {
		f.err = err
		return
	}
	var keys map[string]bool
	if q.Keys != nil {
		keys = make(map[string]bool, len(q.Keys))
		for _, x := range q.Keys {
			keys[x] = true
		}
	}
	day := fed.Div(c, fed.Day)
	a.mu.RLock()
	idx := make([]int32, 0, len(b.rows))
	for i, r := range b.rows {
		if keep(q, r, day, keys) {
			idx = append(idx, int32(i))
		}
	}
	a.mu.RUnlock()
	f.idx, f.rows, f.slot = idx, b.rows, c
}

// Rank answers a slice at now: the top n rows (n < 0: all), and the row of me ("" for none). The
// ranking is worked out on the worker pool once per slice and state; everyone asking for it
// meanwhile waits for that one. ErrNotReady while loading, ErrBusy when the pool's queue is full.
func (a *Agg) Rank(ctx context.Context, q *Slice, now int64, me string, n int) (*Answer, error) {
	if !a.ready.Load() {
		return nil, ErrNotReady
	}
	if q.Measure == "now" {
		return a.rankNow(ctx, q, now, me, n)
	}
	c := a.prepare(now)
	sn := a.snapshot(now, winEvery)
	// Announces change all the time (terms, day, traffic); only slices that read them depend on
	// them, so only those are worked out again when one arrives. Names and homes in the rows are
	// read as the answer is built.
	k := a.stamp(c)
	if q.readsAnnounces() {
		k += itoa(int64(a.meta.Load()))
	}
	k += "|" + snapKey(sn) + "|" + q.key()
	f, owner := a.flightFor(a.slices, k)
	if owner {
		select {
		case a.jobs <- func() { a.slice(f, q, c, sn); a.land(a.slices, k, f) }:
		default:
			f.err = ErrBusy
			a.land(a.slices, k, f)
		}
	}
	if err := wait(ctx, f); err != nil {
		return nil, err
	}
	ans := a.answer(f, now, me, n)
	ans.At = sn.at
	ans.Cached = !owner
	return ans, nil
}

// prepare applies what is queued and brings the windows to now; it gives the running slot.
func (a *Agg) prepare(now int64) int64 {
	if a.pending() {
		a.flush()
	}
	c := fed.Slot(now)
	a.window(c)
	return c
}

// answer builds the rows of an answer from a slice's rows (read lock).
func (a *Agg) answer(f *flight, now int64, me string, n int) *Answer {
	a.mu.RLock()
	defer a.mu.RUnlock()
	ans := &Answer{Slot: f.slot, N: len(f.idx), Rows: []Row{}}
	if n < 0 || n > len(f.idx) {
		n = len(f.idx)
	}
	for i, j := range f.idx[:n] {
		r := f.rows[j]
		row := Row{Rank: i + 1, Key: r.x.key, Value: r.v, ASN: r.x.asn, AI: r.last.ai, CC: r.last.cc}
		if an := r.x.ann; an != nil {
			row.Home = an.Home
			if !a.names[r.x.key] {
				row.Name = an.Name
			}
		}
		ans.Rows = append(ans.Rows, row)
	}
	if me != "" {
		for i, j := range f.idx {
			if f.rows[j].x.key == me {
				rk := i + 1
				ans.Me = &Me{Rank: &rk, Value: f.rows[j].v}
				return ans
			}
		}
		for _, r := range f.rows {
			if r.x.key == me {
				ans.Me = &Me{Value: r.v}
				break
			}
		}
	}
	return ans
}

// Warm brings the windows to now and, on the worker pool, works out the unfiltered boards of
// the new slot (every board, both measures) so the first players to ask find them ready.
func (a *Agg) Warm(now int64) {
	if !a.ready.Load() {
		return
	}
	c := a.prepare(now)
	sn := a.snapshot(now, winEvery)
	for _, b := range Boards {
		for _, m := range []string{"total", "growth"} {
			q := &Slice{Board: b, Measure: m, Division: "all"}
			select {
			case a.jobs <- func() { _, _ = a.base(context.Background(), q, c, sn) }:
			default:
			}
		}
	}
}

// Facets are the values the filter sheet offers (9.5 facets): of the networks with a value at
// the last slot, the AI models and harnesses, the countries players are from, the home markets.
type Facets struct {
	Slot      int64    `json:"slot"`
	Models    []string `json:"models"`
	Harnesses []string `json:"harnesses"`
	From      []string `json:"from"`
	Homes     []string `json:"homes"`
}

// MaxFacet is the most countries of each facet listed, MaxLabels the most models and harnesses
// (up to 64 characters each: a facets answer always fits one frame).
const (
	MaxFacet  = 256
	MaxLabels = 64
)

// Facets gives the facets at now, worked out on the pool once per state.
func (a *Agg) Facets(ctx context.Context, now int64) (*Facets, error) {
	if !a.ready.Load() {
		return nil, ErrNotReady
	}
	c := a.prepare(now)
	k := a.stamp(c) + itoa(int64(a.meta.Load()))
	f, owner := a.flightFor(a.facets, k)
	if owner {
		select {
		case a.jobs <- func() { f.fac = a.computeFacets(c); a.land(a.facets, k, f) }:
		default:
			f.err = ErrBusy
			a.land(a.facets, k, f)
		}
	}
	if err := wait(ctx, f); err != nil {
		return nil, err
	}
	return f.fac, nil
}

func (a *Agg) computeFacets(c int64) *Facets {
	a.mu.RLock()
	defer a.mu.RUnlock()
	sets := [4]map[string]bool{{}, {}, {}, {}}
	for _, x := range a.nets {
		if len(x.win) == 0 || a.ex[x.key] {
			continue
		}
		l := x.value(c - fed.SlotLen)
		if l == nil {
			continue
		}
		if l.ai {
			sets[0][l.model()] = true
			sets[1][l.harness()] = true
		}
		sets[2][l.cc] = true
		if x.ann != nil {
			sets[3][x.ann.Home] = true
		}
	}
	out := [4][]string{}
	for i, s := range sets {
		delete(s, "")
		l := make([]string, 0, len(s))
		for v := range s {
			l = append(l, v)
		}
		slices.Sort(l)
		lim := MaxFacet
		if i < 2 {
			lim = MaxLabels
		}
		out[i] = l[:min(len(l), lim)]
	}
	return &Facets{Slot: c, Models: out[0], Harnesses: out[1], From: out[2], Homes: out[3]}
}

// Net is what the game uses of another network's newest stats record (9.5 nets): who is an AI
// and Tier 1, and what a mentor's game reads for its dividend (Tier 2, POPs, transit customers).
type Net struct {
	Key   string `json:"key"`
	AI    bool   `json:"ai"`
	Tier1 bool   `json:"tier1"`
	Tier2 bool   `json:"tier2"`
	Pops  int64  `json:"pops"`
	Cust  int    `json:"cust"`
	Slot  int64  `json:"slot"` // board slot of that record: when it was heard
}

// Report is what one network's newest stats record says about traffic with the asker.
type Report struct {
	Key string `json:"key"`
	In  int64  `json:"in"`
	Out int64  `json:"out"`
}

// MaxReports is the most reports a nets answer lists.
const MaxReports = 256

// Nets answers a nets request: for each of keys with a stats record, from its newest one; and
// for me, every network whose newest stats record lists me, with what it says (sorted by key).
// Excluded networks are left out.
func (a *Agg) Nets(keys []string, me string) ([]Net, []Report) {
	if a.pending() {
		a.flush()
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	nets := []Net{}
	for _, k := range keys {
		if x := a.nets[k]; x != nil && !a.ex[k] {
			if r := x.newest(); r != nil {
				nets = append(nets, Net{Key: k, AI: r.ai, Tier1: r.tier1, Tier2: r.tier2, Pops: int64(r.popsN), Cust: len(r.cust()), Slot: r.slot})
			}
		}
	}
	reps := []Report{}
	if x := a.nets[me]; me != "" && x != nil {
		for k := range x.listers {
			y := a.nets[k]
			if y == nil || a.ex[k] {
				continue
			}
			if r := y.newest(); r != nil {
				for _, e := range r.tr {
					if e.key == me {
						reps = append(reps, Report{Key: k, In: int64(e.in), Out: int64(e.out)})
						break
					}
				}
			}
		}
		slices.SortFunc(reps, func(p, q Report) int { return strings.Compare(p.Key, q.Key) })
		reps = reps[:min(len(reps), MaxReports)]
	}
	return nets, reps
}

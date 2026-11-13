// Package rank keeps the leaderboards in memory (spec 10.1 to 10.5 and 9.5): per network its
// stats records of the two windows and the carry-forward reach, and per window slot its traffic
// sums (IN and OUT of 10.4), updated as records arrive. Rankings of a slice are worked out from
// that on demand, in a bounded worker pool, once per slot and slice (concurrent askers wait for
// the same result), and kept in bounded caches. It gives exactly the results of package boards.
package rank

import (
	"math"
	"slices"
	"sort"
	"strings"
	"sync/atomic"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// N is the number of slots of the two windows (10.1).
const N = 2 * fed.WindowSlots

// stat is one stats record, parsed once. Never changed once published (the aggregate only shares
// its strings with others' before), so results may point at it. Held for every stats record of
// the windows: its fields are ordered to pack.
type stat struct {
	id, key string
	slot, t int64
	pops    []popc // a list, not a map: a few cities each, and far smaller
	tr      []tentry
	trIdx   map[string]int32 // partner -> index in tr, for long lists
	// links are the transit customers and upstreams it lists (5.2), each sorted, then those of them
	// it reports traffic with both ways (the cone counts only these): cust, up, custOK, upOK.
	links []string
	nl    [4]uint8 // how many of each (at most 128 customers, 16 upstreams)
	aiw   *aiWho   // nil unless an AI says which
	cc    string
	// The checks bound these well within int32: pops 512 cities of 1000, pies 10^7, total 10^9.
	popsN, pies, total int32
	normal             bool
	hasPies            bool
	ai                 bool
	tier1              bool
	tier2              bool
}

// aiWho is the model and harness an AI network names.
type aiWho struct{ model, harness string }

func (s *stat) model() string {
	if s.aiw == nil {
		return ""
	}
	return s.aiw.model
}

func (s *stat) harness() string {
	if s.aiw == nil {
		return ""
	}
	return s.aiw.harness
}

func (s *stat) link(i int) []string {
	a := 0
	for _, n := range s.nl[:i] {
		a += int(n)
	}
	b := a + int(s.nl[i])
	return s.links[a:b:b]
}

func (s *stat) cust() []string   { return s.link(0) }
func (s *stat) up() []string     { return s.link(1) }
func (s *stat) custOK() []string { return s.link(2) }
func (s *stat) upOK() []string   { return s.link(3) }

// lists reports whether the record takes part in the customer cones (lists customers or upstreams).
func (s *stat) lists() bool { return s.nl[0] > 0 || s.nl[1] > 0 }

// upOK reports whether s lists k as an upstream it has traffic with both ways.
func (s *stat) hasUp(k string) bool { _, ok := slices.BinarySearch(s.upOK(), k); return ok }

type popc struct {
	city string
	n    int64
}

type tentry struct {
	key     string
	in, out int32 // at most 10^9 each (mbps)
}

func i32(v int64) int32 { return int32(min(max(v, math.MinInt32), math.MaxInt32)) }

func toInt(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	}
	return 0
}

// parse reads a stats body (already checked, strict values).
func parse(id, key string, slot, t int64, body map[string]any, cc string) *stat {
	s := &stat{id: id, key: key, slot: slot, t: t, cc: cc}
	if m, _ := body["mode"].(string); m == "normal" {
		s.normal = true
	}
	if m, ok := body["pops"].(map[string]any); ok {
		s.pops = make([]popc, 0, len(m))
		var all int64
		for c, v := range m {
			n := toInt(v)
			s.pops = append(s.pops, popc{c, n})
			all += n
		}
		s.popsN = i32(all)
	}
	if v, ok := body["pies"]; ok {
		s.hasPies, s.pies = true, i32(toInt(v))
	}
	s.total = i32(toInt(body["total"]))
	if a, ok := body["ai"].(map[string]any); ok {
		s.ai = true
		m, _ := a["model"].(string)
		h, _ := a["harness"].(string)
		if m != "" || h != "" {
			s.aiw = &aiWho{m, h}
		}
	} else if _, ok := body["ai"]; ok {
		s.ai = true
	}
	s.tier1, _ = body["tier1"].(bool)
	s.tier2, _ = body["tier2"].(bool)
	cust, up := keyList(body["cust"], fed.MaxCust), keyList(body["up"], fed.MaxUp)
	if list, ok := body["traffic"].([]any); ok && len(list) > 0 {
		s.tr = make([]tentry, 0, len(list))
		for _, e := range list {
			m, _ := e.(map[string]any)
			k, _ := m["key"].(string)
			s.tr = append(s.tr, tentry{k, i32(toInt(m["in"])), i32(toInt(m["out"]))})
		}
		if len(s.tr) > 16 {
			s.trIdx = make(map[string]int32, len(s.tr))
			for i, e := range s.tr {
				if _, dup := s.trIdx[e.key]; !dup {
					s.trIdx[e.key] = int32(i)
				}
			}
		}
	}
	if len(cust)+len(up) > 0 {
		custOK, upOK := s.bothWays(cust), s.bothWays(up)
		s.links = slices.Concat(cust, up, custOK, upOK)
		s.nl = [4]uint8{uint8(len(cust)), uint8(len(up)), uint8(len(custOK)), uint8(len(upOK))}
	}
	return s
}

// bothWays keeps the keys of l that s reports traffic with in both directions.
func (s *stat) bothWays(l []string) []string {
	var out []string
	for _, k := range l {
		if in, o := s.report(k); in > 0 && o > 0 {
			out = append(out, k)
		}
	}
	return out
}

// keyList reads a list of keys, sorted and without repeats (nil when empty), at most n (the checks
// allow no more).
func keyList(v any, n int) []string {
	a, _ := v.([]any)
	if len(a) == 0 {
		return nil
	}
	a = a[:min(len(a), n)]
	out := make([]string, 0, len(a))
	for _, e := range a {
		if k, ok := e.(string); ok {
			out = append(out, k)
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// report is what s says about key k: in and out, or 0 and 0.
func (s *stat) report(k string) (int64, int64) {
	if s.trIdx != nil {
		if i, ok := s.trIdx[k]; ok {
			return int64(s.tr[i].in), int64(s.tr[i].out)
		}
		return 0, 0
	}
	for _, e := range s.tr {
		if e.key == k {
			return int64(e.in), int64(e.out)
		}
	}
	return 0, 0
}

func (s *stat) popsIn(cities map[string]bool) int64 {
	if cities == nil {
		return int64(s.popsN)
	}
	var n int64
	for _, p := range s.pops {
		if cities[p.city] {
			n += p.n
		}
	}
	return n
}

// better reports whether a wins over b in the same board slot (10.2): greater t, then lower id.
func better(a, b *stat) bool { return a.t > b.t || a.t == b.t && a.id < b.id }

// Ann is what the boards use of a network's newest announce.
type Ann struct {
	ID, Name, Home, Policy string
	T, Founded, Day        int64
}

// net is one network: its held stats records and what is worked out from them.
type net struct {
	key     string
	all     []*stat          // by slot, the better one first within a slot
	win     []*stat          // the winner of each board slot, by slot
	listers map[string]int32 // networks whose held records list this one -> how many records
	ann     *Ann
	asn     int64
	sums    slots // IN(s) and OUT(s) per window slot (10.4), none while no record has traffic
	withTr  int   // held records with a traffic list
	withCn  int   // held records that list customers or upstreams
}

func newNet(key string) *net {
	asn, _ := fed.ASN(key)
	return &net{key: key, asn: asn}
}

// eff is eff(X, s) of 10.2: nil when none or carried too long.
func (x *net) eff(s int64) *stat {
	i := sort.Search(len(x.win), func(i int) bool { return x.win[i].slot > s }) - 1
	if i < 0 {
		return nil
	}
	if r := x.win[i]; s-r.slot < fed.CarryForward {
		return r
	}
	return nil
}

// value is eff(X, s) when X has a value at s.
func (x *net) value(s int64) *stat {
	if r := x.eff(s); r != nil && r.normal {
		return r
	}
	return nil
}

// newest is the newest held record: greatest slot, then the winner of that slot.
func (x *net) newest() *stat {
	if len(x.win) == 0 {
		return nil
	}
	return x.win[len(x.win)-1]
}

// insert adds a record.
func (x *net) insert(s *stat) {
	i := sort.Search(len(x.all), func(i int) bool {
		a := x.all[i]
		return a.slot > s.slot || a.slot == s.slot && !better(a, s)
	})
	x.all = slices.Insert(x.all, i, s)
	x.rewin()
	if len(s.tr) > 0 {
		x.withTr++
	}
	if s.lists() {
		x.withCn++
	}
}

func (x *net) remove(s *stat) {
	if i := slices.Index(x.all, s); i >= 0 {
		x.all = slices.Delete(x.all, i, i+1)
		x.rewin()
		if len(s.tr) > 0 {
			x.withTr--
		}
		if s.lists() {
			x.withCn--
		}
	}
}

func (x *net) rewin() {
	x.win = x.win[:0]
	for i, s := range x.all {
		if i == 0 || x.all[i-1].slot != s.slot {
			x.win = append(x.win, s)
		}
	}
}

// reach is the end (exclusive) of the times whose effective record may change when the winner of
// board slot s changes: the next board slot or seven days, whichever comes first.
func (x *net) reach(s int64) int64 {
	end := s + fed.CarryForward
	i := sort.Search(len(x.win), func(i int) bool { return x.win[i].slot > s })
	if i < len(x.win) && x.win[i].slot < end {
		end = x.win[i].slot
	}
	return end
}

// runs calls f for each stretch [i, j) of window slots (from the slot at from) with one
// effective record, in order; r is nil where there is none.
func (x *net) runs(from int64, lo, hi int, f func(i, j int, r *stat)) {
	ix := func(t int64) int { // the first slot index at or after time t
		d := t - from
		if d <= 0 {
			return 0
		}
		return int((d + fed.SlotLen - 1) / fed.SlotLen)
	}
	cur := lo
	for k, r := range x.win {
		a := max(ix(r.slot), lo)
		end := r.slot + fed.CarryForward
		if k+1 < len(x.win) && x.win[k+1].slot < end {
			end = x.win[k+1].slot
		}
		b := min(ix(end), hi)
		if a >= b {
			continue
		}
		if a > cur {
			f(cur, a, nil)
		}
		f(a, b, r)
		cur = b
	}
	if cur < hi {
		f(cur, hi, nil)
	}
}

// slots holds IN(s) and OUT(s) of one network per window slot: as uint32 while every value fits
// (a network's traffic with all its partners under 4.29 Tbit/s, nearly always), as int64 once one
// does not. Half the memory of int64 for the common case.
type slots struct {
	s32 []uint32 // in at 2k, out at 2k+1
	s64 []int64
}

// widened counts slot sums moved to 64 bits (tests).
var widened atomic.Int64

func (p *slots) none() bool { return p.s32 == nil && p.s64 == nil }

func (p *slots) clear() { p.s32, p.s64 = nil, nil }

// make allocates the slots, all 0.
func (p *slots) make() { p.s32, p.s64 = make([]uint32, 2*N), nil }

func (p *slots) at(k int) (int64, int64) {
	if p.s64 != nil {
		return p.s64[2*k], p.s64[2*k+1]
	}
	return int64(p.s32[2*k]), int64(p.s32[2*k+1])
}

func (p *slots) set(k int, in, out int64) {
	if p.s64 == nil && (uint64(in) > math.MaxUint32 || uint64(out) > math.MaxUint32) {
		p.s64 = make([]int64, 2*N)
		for i, v := range p.s32 {
			p.s64[i] = int64(v)
		}
		p.s32 = nil
		widened.Add(1)
	}
	if p.s64 != nil {
		p.s64[2*k], p.s64[2*k+1] = in, out
		return
	}
	p.s32[2*k], p.s32[2*k+1] = uint32(in), uint32(out)
}

// shift drops the first d slots (the windows moved on d slots); the last d are worked out again.
func (p *slots) shift(d int) {
	if p.s64 != nil {
		copy(p.s64, p.s64[2*d:])
		return
	}
	copy(p.s32, p.s32[2*d:])
}

// Slice is one leaderboard view: a board, a measure, and filters (spec 10.12). Nil or empty
// filters do not filter.
type Slice struct {
	Board    string   // traffic, total, pops, pies, cone
	Measure  string   // total, growth, now
	Division string   // all, human, ai
	Cities   []string // region: sorted, unique; nil for the world
	Model    *string
	Harness  *string
	Tier1    *bool
	From     *string
	Home     *string
	Policy   *string
	AgeMin   *int64
	AgeMax   *int64
	DayMin   *int64
	DayMax   *int64
	Keys     []string // only these networks; nil for all
}

// readsAnnounces reports whether which networks a slice keeps depends on their announces: the
// filters on home, policy, age and day, and the cone board (whose edges need established networks).
func (q *Slice) readsAnnounces() bool {
	return q.Board == "cone" || q.Home != nil || q.Policy != nil || q.AgeMin != nil || q.AgeMax != nil ||
		q.DayMin != nil || q.DayMax != nil
}

// baseKey names the part of a slice that is worked out from the records: board, measure, region.
func (q *Slice) baseKey() string {
	return q.Board + "|" + q.Measure + "|" + regionKey(q.Cities)
}

// regionKey and the string fields of key are length-prefixed: model, harness and the rest are
// whatever a client sent, so no separator inside them can make two slices share a cache entry.
func regionKey(c []string) string {
	if c == nil {
		return "*"
	}
	var b strings.Builder
	for _, x := range c {
		b.WriteString(itoa(int64(len(x))) + ":" + x)
	}
	return b.String()
}

// key names a whole slice (for the caches).
func (q *Slice) key() string {
	var b strings.Builder
	b.WriteString(q.baseKey())
	b.WriteString("|" + q.Division)
	ps := func(p *string) {
		b.WriteByte('|')
		if p != nil {
			b.WriteString("=" + itoa(int64(len(*p))) + ":" + *p)
		}
	}
	pi := func(p *int64) {
		b.WriteByte('|')
		if p != nil {
			b.WriteString("=" + itoa(*p))
		}
	}
	ps(q.Model)
	ps(q.Harness)
	b.WriteByte('|')
	if q.Tier1 != nil {
		if *q.Tier1 {
			b.WriteString("t")
		} else {
			b.WriteString("f")
		}
	}
	ps(q.From)
	ps(q.Home)
	ps(q.Policy)
	pi(q.AgeMin)
	pi(q.AgeMax)
	pi(q.DayMin)
	pi(q.DayMax)
	b.WriteByte('|')
	if q.Keys != nil {
		k := slices.Clone(q.Keys)
		slices.Sort(k)
		b.WriteString("=" + regionKey(slices.Compact(k)))
	}
	return b.String()
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var d [20]byte
	i := len(d)
	for n > 0 {
		i--
		d[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		d[i] = '-'
	}
	return string(d[i:])
}

// p95 of 10.4 over runs of equal values: [value, slots], sorted here.
func p95(v [][2]int64) int64 {
	var n int64
	for _, x := range v {
		n += x[1]
	}
	if n == 0 {
		return 0
	}
	k := fed.Div(n*5, 100)
	slices.SortFunc(v, func(a, b [2]int64) int {
		switch {
		case a[0] > b[0]:
			return -1
		case a[0] < b[0]:
			return 1
		}
		return 0
	})
	var c int64
	for _, x := range v {
		c += x[1]
		if c > k {
			return x[0]
		}
	}
	return 0
}

var floor = map[string]int64{"pops": 10, "pies": 100, "traffic": 1000, "total": 1000, "cone": 10}

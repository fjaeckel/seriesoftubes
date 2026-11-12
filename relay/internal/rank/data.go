// Package rank keeps the leaderboards in memory (spec 10.1 to 10.5 and 9.5): per network its
// stats records of the two windows and the carry-forward reach, and per window slot its traffic
// sums (IN and OUT of 10.4), updated as records arrive. Rankings of a slice are worked out from
// that on demand, in a bounded worker pool, once per slot and slice (concurrent askers wait for
// the same result), and kept in bounded caches. It gives exactly the results of package boards.
package rank

import (
	"slices"
	"sort"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// N is the number of slots of the two windows (10.1).
const N = 2 * fed.WindowSlots

// stat is one stats record, parsed once. Never changed after parsing, so results may point at it.
type stat struct {
	id, key        string
	slot, t        int64
	normal         bool
	pops           []popc // a list, not a map: a few cities each, and far smaller
	popsN          int64
	pies           int64
	hasPies        bool
	total          int64
	ai             bool
	model, harness string
	tier1          bool
	cc             string
	tr             []tentry
	trIdx          map[string]int32 // partner -> index in tr, for long lists
}

type popc struct {
	city string
	n    int64
}

type tentry struct {
	key     string
	in, out int64
}

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
		for c, v := range m {
			n := toInt(v)
			s.pops = append(s.pops, popc{c, n})
			s.popsN += n
		}
	}
	if v, ok := body["pies"]; ok {
		s.hasPies, s.pies = true, toInt(v)
	}
	s.total = toInt(body["total"])
	if a, ok := body["ai"].(map[string]any); ok {
		s.ai = true
		s.model, _ = a["model"].(string)
		s.harness, _ = a["harness"].(string)
	} else if _, ok := body["ai"]; ok {
		s.ai = true
	}
	s.tier1, _ = body["tier1"].(bool)
	if list, ok := body["traffic"].([]any); ok && len(list) > 0 {
		s.tr = make([]tentry, 0, len(list))
		for _, e := range list {
			m, _ := e.(map[string]any)
			k, _ := m["key"].(string)
			s.tr = append(s.tr, tentry{k, toInt(m["in"]), toInt(m["out"])})
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
	return s
}

// report is what s says about key k: in and out, or 0 and 0.
func (s *stat) report(k string) (int64, int64) {
	if s.trIdx != nil {
		if i, ok := s.trIdx[k]; ok {
			return s.tr[i].in, s.tr[i].out
		}
		return 0, 0
	}
	for _, e := range s.tr {
		if e.key == k {
			return e.in, e.out
		}
	}
	return 0, 0
}

func (s *stat) popsIn(cities map[string]bool) int64 {
	if cities == nil {
		return s.popsN
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
	in, out []int64 // IN(s) and OUT(s) per window slot (10.4), nil while no record has traffic
	withTr  int     // held records with a traffic list
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
}

func (x *net) remove(s *stat) {
	if i := slices.Index(x.all, s); i >= 0 {
		x.all = slices.Delete(x.all, i, i+1)
		x.rewin()
		if len(s.tr) > 0 {
			x.withTr--
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

// Slice is one leaderboard view: a board, a measure, and filters (spec 10.12). Nil or empty
// filters do not filter.
type Slice struct {
	Board    string   // traffic, total, pops, pies
	Measure  string   // total, growth
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

// baseKey names the part of a slice that is worked out from the records: board, measure, region.
func (q *Slice) baseKey() string {
	return q.Board + "|" + q.Measure + "|" + regionKey(q.Cities)
}

func regionKey(c []string) string {
	if c == nil {
		return "*"
	}
	return strings.Join(c, ",")
}

// key names a whole slice (for the caches).
func (q *Slice) key() string {
	var b strings.Builder
	b.WriteString(q.baseKey())
	b.WriteString("|" + q.Division)
	ps := func(p *string) {
		b.WriteByte('|')
		if p != nil {
			b.WriteString("=" + *p)
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
		b.WriteString("=" + strings.Join(slices.Compact(k), ","))
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

var floor = map[string]int64{"pops": 10, "pies": 100, "traffic": 1000, "total": 1000}

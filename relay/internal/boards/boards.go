// Package boards computes the leaderboards (spec 10.1 to 10.5) and the quiet states (10.6).
// It is the plain reference: the in-memory aggregate (package rank) is held to it by tests.
// The same rules run in the game; the relay uses them for its status commands.
package boards

import (
	"slices"
	"sort"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Stats is one stats record as the boards see it.
type Stats struct {
	ID   string
	Key  string
	Slot int64 // board slot: the earliest receipt slot
	T    int64 // author's t
	Body map[string]any
}

func (s *Stats) mode() string { m, _ := s.Body["mode"].(string); return m }

// Mode returns the record's mode.
func (s *Stats) Mode() string { return s.mode() }

// Windows of 10.1 for now: current and previous, as first and last slot.
func Windows(now int64) (curFrom, curTo, prevFrom, prevTo int64) {
	c := fed.Slot(now)
	return c - fed.WindowSlots*fed.SlotLen, c - fed.SlotLen, c - 2*fed.WindowSlots*fed.SlotLen, c - (fed.WindowSlots+1)*fed.SlotLen
}

// BoardSlot is the earliest receipt time.
func BoardSlot(receipts []int64) int64 {
	m := receipts[0]
	for _, r := range receipts[1:] {
		if r < m {
			m = r
		}
	}
	return m
}

// Series holds one key's records, one per slot (the winner of that slot), by slot.
type Series struct {
	recs []*Stats
}

// NewSeries builds a key's series; duplicates by id count once.
func NewSeries(recs []*Stats) *Series {
	best := map[int64]*Stats{}
	for _, r := range recs {
		b := best[r.Slot]
		if b == nil || r.T > b.T || r.T == b.T && r.ID < b.ID {
			best[r.Slot] = r
		}
	}
	s := &Series{}
	for _, r := range best {
		s.recs = append(s.recs, r)
	}
	sort.Slice(s.recs, func(i, j int) bool { return s.recs[i].Slot < s.recs[j].Slot })
	return s
}

// Eff is eff(X, s) of 10.2 (nil when none or carried too long).
func (x *Series) Eff(s int64) *Stats {
	i := sort.Search(len(x.recs), func(i int) bool { return x.recs[i].Slot > s }) - 1
	if i < 0 {
		return nil
	}
	r := x.recs[i]
	if s-r.Slot >= fed.CarryForward {
		return nil
	}
	return r
}

// Value is eff(X, s) when X has a value at s (normal mode), else nil.
func (x *Series) Value(s int64) *Stats {
	r := x.Eff(s)
	if r == nil || r.mode() != "normal" {
		return nil
	}
	return r
}

// Query describes one board.
type Query struct {
	Now      int64
	Board    string // pops, pies, traffic, total, cone
	Measure  string // total, growth
	Division string // all, human, ai
	Exclude  map[string]bool
	Founded  map[string]int64 // cone board: key -> founded of its newest announce
	Cities   []string         // region filter, nil for none
	// States are the live states held at Now (5.11): they make the running slot a slot of the current
	// window (10.13). Nil: none.
	States []*State
}

// Row is one line of a board.
type Row struct {
	Key   string `json:"key"`
	Value int64  `json:"value"`
}

// Compute ranks the records (deduplicated by id) for a query.
func Compute(q Query, recs []*Stats) []Row {
	byKey := map[string][]*Stats{}
	seen := map[string]bool{}
	for _, r := range recs {
		if seen[r.ID] {
			continue
		}
		seen[r.ID] = true
		byKey[r.Key] = append(byKey[r.Key], r)
	}
	series := map[string]*Series{}
	for k, rs := range byKey {
		series[k] = NewSeries(rs)
	}
	curFrom, curTo, prevFrom, prevTo := Windows(q.Now)
	var region map[string]bool
	if q.Cities != nil {
		region = map[string]bool{}
		for _, c := range q.Cities {
			region[c] = true
		}
	}
	popsAt := func(r *Stats) int64 {
		m, _ := r.Body["pops"].(map[string]any)
		var n int64
		for c, v := range m {
			if region == nil || region[c] {
				n += toInt(v)
			}
		}
		return n
	}
	c := fed.Slot(q.Now)
	L := Latest(q.Now, q.States)
	// run is what a key reports in the running slot: its live state, else its effective record at c.
	run := func(k string) *Stats {
		if s := L[k]; s != nil {
			return &Stats{ID: s.ID, Key: k, Slot: c, T: s.T, Body: s.Body}
		}
		if x := series[k]; x != nil {
			return x.Eff(c)
		}
		return nil
	}
	runCone := func(k string) int64 {
		seen := map[string]bool{k: true}
		todo := []string{k}
		for len(todo) > 0 {
			z := todo[len(todo)-1]
			todo = todo[:len(todo)-1]
			r := run(z)
			for _, y := range Keys(r.Body["cust"]) {
				if seen[y] || q.Exclude[y] {
					continue
				}
				f, ok := q.Founded[y]
				if !ok || fed.Div(c, fed.Day)-f < fed.NewcomerDays {
					continue
				}
				ye := run(y)
				if ye == nil || ye.mode() != "normal" || !slices.Contains(Keys(ye.Body["up"]), z) || !BothWays(r, y) || !BothWays(ye, z) {
					continue
				}
				seen[y] = true
				todo = append(todo, y)
			}
		}
		return int64(len(seen) - 1)
	}
	// sample is a key's value in the running slot, when its live state is in normal mode.
	sample := func(k string) (int64, int64, bool) {
		s := L[k]
		if s == nil || s.mode() != "normal" {
			return 0, 0, false
		}
		r := &Stats{ID: s.ID, Key: k, Slot: c, T: s.T, Body: s.Body}
		switch q.Board {
		case "pops":
			return popsAt(r), 0, true
		case "pies":
			return toInt(r.Body["pies"]), 0, true
		case "total":
			return toInt(r.Body["total"]), 0, true
		case "cone":
			return runCone(k), 0, true
		}
		var in, out int64
		list, _ := r.Body["traffic"].([]any)
		for _, e := range list {
			m, _ := e.(map[string]any)
			y, _ := m["key"].(string)
			xin, xout := toInt(m["in"]), toInt(m["out"])
			if q.Exclude[y] {
				continue
			}
			ye := run(y)
			if region != nil && (ye == nil || ye.mode() != "normal" || popsIn(ye, region) == 0) {
				continue
			}
			switch {
			case ye == nil:
				in += xin
				out += xout
			case ye.mode() != "normal":
			default:
				yin, yout := report(ye, k)
				in += min(xin, yout)
				out += min(xout, yin)
			}
		}
		return in, out, true
	}
	total := func(k string, from, to int64) (int64, bool) {
		x := series[k]
		// The current window ends with the running slot (10.13): one more sample, the latest.
		sin, sout, ok := int64(0), int64(0), false
		if to == curTo {
			sin, sout, ok = sample(k)
		}
		switch q.Board {
		case "pops", "pies":
			if ok {
				return sin, true
			}
			// The value at the latest slot of the window where the key has one.
			for s := to; s >= from; s -= fed.SlotLen {
				r := x.Value(s)
				if r == nil {
					continue
				}
				if q.Board == "pops" {
					return popsAt(r), true
				}
				return toInt(r.Body["pies"]), true
			}
			return 0, false
		case "traffic":
			var ins, outs []int64
			for s := from; s <= to; s += fed.SlotLen {
				r := x.Value(s)
				if r == nil {
					continue
				}
				in, out := traffic(q, region, series, k, r, s)
				ins = append(ins, in)
				outs = append(outs, out)
			}
			if ok {
				ins, outs = append(ins, sin), append(outs, sout)
			}
			if len(ins) == 0 {
				return 0, false
			}
			return max(p95(ins), p95(outs)), true
		case "total", "cone":
			var v []int64
			for s := from; s <= to; s += fed.SlotLen {
				if r := x.Value(s); r != nil {
					if q.Board == "cone" {
						v = append(v, Cone(q.Exclude, q.Founded, series, k, s))
					} else {
						v = append(v, toInt(r.Body["total"]))
					}
				}
			}
			if ok {
				v = append(v, sin)
			}
			if len(v) == 0 {
				return 0, false
			}
			return p95(v), true
		}
		return 0, false
	}
	floor := map[string]int64{"pops": 10, "pies": 100, "traffic": 1000, "total": 1000, "cone": 10}[q.Board]
	var rows []Row
	for k, x := range series {
		if q.Exclude[k] {
			continue
		}
		last := x.Value(curTo)
		if last == nil {
			continue
		}
		// With a region filter, every board lists only networks with a POP in the region (10.3).
		if region != nil && popsAt(last) == 0 {
			continue
		}
		if _, ok := last.Body["pies"]; q.Board == "pies" && !ok {
			continue
		}
		_, ai := last.Body["ai"]
		if q.Division == "ai" && !ai || q.Division == "human" && ai {
			continue
		}
		cur, _ := total(k, curFrom, curTo)
		if q.Measure != "growth" {
			rows = append(rows, Row{k, cur})
			continue
		}
		if x.Value(prevFrom) == nil {
			continue
		}
		prev, _ := total(k, prevFrom, prevTo)
		rows = append(rows, Row{k, fed.Div((cur-prev)*10000, max(prev, floor))})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Value != rows[j].Value {
			return rows[i].Value > rows[j].Value
		}
		return rows[i].Key < rows[j].Key
	})
	return rows
}

// traffic returns IN(s) and OUT(s) for key k whose effective record is r (10.4). With a region, only partners
// that have a value at s with a POP in the region count.
func traffic(q Query, region map[string]bool, series map[string]*Series, k string, r *Stats, s int64) (int64, int64) {
	var in, out int64
	list, _ := r.Body["traffic"].([]any)
	for _, e := range list {
		m, _ := e.(map[string]any)
		y, _ := m["key"].(string)
		xin, xout := toInt(m["in"]), toInt(m["out"])
		if q.Exclude[y] {
			continue
		}
		ys := series[y]
		var yeff *Stats
		if ys != nil {
			yeff = ys.Eff(s)
		}
		if region != nil && (yeff == nil || yeff.mode() != "normal" || popsIn(yeff, region) == 0) {
			continue
		}
		switch {
		case yeff == nil:
			in += xin
			out += xout
		case yeff.mode() != "normal":
		default:
			yin, yout := report(yeff, k)
			in += min(xin, yout)
			out += min(xout, yin)
		}
	}
	return in, out
}

// Cone is the size of k's customer cone at slot s (10.4): the networks reachable from k over
// counted transit edges, k itself not counted. X -> Y counts at s when both have a value at s
// (so both were heard within the 7 days before s), neither is excluded, eff(X, s).cust lists Y,
// eff(Y, s).up lists X, each reports traffic with the other both ways (in > 0 and out > 0), and Y
// is established: its newest announce has founded at least 30 days before s (founded: key ->
// founded of its newest announce; without one, never).
func Cone(ex map[string]bool, founded map[string]int64, series map[string]*Series, k string, s int64) int64 {
	seen := map[string]bool{k: true}
	todo := []string{k}
	for len(todo) > 0 {
		z := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		r := series[z].Value(s)
		for _, y := range Keys(r.Body["cust"]) {
			if seen[y] || ex[y] || series[y] == nil {
				continue
			}
			f, ok := founded[y]
			if !ok || fed.Div(s, fed.Day)-f < fed.NewcomerDays {
				continue
			}
			ye := series[y].Value(s)
			if ye == nil || !slices.Contains(Keys(ye.Body["up"]), z) || !BothWays(r, y) || !BothWays(ye, z) {
				continue
			}
			seen[y] = true
			todo = append(todo, y)
		}
	}
	return int64(len(seen) - 1)
}

// BothWays reports whether r lists traffic with k in both directions.
func BothWays(r *Stats, k string) bool {
	in, out := report(r, k)
	return in > 0 && out > 0
}

// Keys reads a list of keys (cust, up); absent is none.
func Keys(v any) []string {
	a, _ := v.([]any)
	out := make([]string, 0, len(a))
	for _, e := range a {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// popsIn is the number of POPs a record has in a region.
func popsIn(r *Stats, region map[string]bool) int64 {
	m, _ := r.Body["pops"].(map[string]any)
	var n int64
	for c, v := range m {
		if region[c] {
			n += toInt(v)
		}
	}
	return n
}

// report is what r says about key k: in and out, or 0 and 0.
func report(r *Stats, k string) (int64, int64) {
	list, _ := r.Body["traffic"].([]any)
	for _, e := range list {
		m, _ := e.(map[string]any)
		if m["key"] == k {
			return toInt(m["in"]), toInt(m["out"])
		}
	}
	return 0, 0
}

func p95(v []int64) int64 {
	a := append([]int64(nil), v...)
	sort.Slice(a, func(i, j int) bool { return a[i] < a[j] })
	n := int64(len(a))
	k := fed.Div(n*5, 100)
	return a[n-1-k]
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

// Quiet is 10.6: the state and demand factor of a network last heard at lastHeard.
func Quiet(now, lastHeard int64) (string, int64) {
	age := now - lastHeard
	switch {
	case age < fed.QuietFading:
		return "active", 1000
	case age < fed.QuietDark:
		return "fading", 1000 - fed.Div((age-fed.QuietFading)*1000, 2592000)
	case age < fed.QuietForgotten:
		return "dark", 0
	}
	return "forgotten", 0
}

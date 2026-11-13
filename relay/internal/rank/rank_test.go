package rank

import (
	"context"
	"fmt"
	"maps"
	"math/rand/v2"
	"slices"
	"sync"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/boards"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

const t0 = int64(1767398410)

// coneSeen counts cone rows above 0 the random streams compared: they must not all be empty.
var coneSeen int

var cities = []string{"fra", "ams", "lon", "nyc"}

// randStats makes a stats body: mode, POPs, pies, total, AI, Tier 1, traffic with some keys.
func randBody(rng *rand.Rand, self string, keys []string) map[string]any {
	modes := []string{"normal", "normal", "normal", "normal", "sandbox"}
	pops := map[string]any{}
	for _, c := range cities {
		if rng.IntN(2) == 0 {
			pops[c] = int64(1 + rng.IntN(3))
		}
	}
	var tr []any
	// Now and then a network of the biggest numbers the checks allow (10^9 each way): its slot
	// sums pass what 32 bits hold, and the aggregate must move them to 64 bits.
	big := rng.IntN(3) == 0
	mb := func() int64 {
		if big && rng.IntN(4) != 0 {
			return int64(1e9 - rng.IntN(3)*1000)
		}
		return int64(rng.IntN(5) * 1000)
	}
	for _, k := range keys {
		if k != self && rng.IntN(2) == 0 {
			tr = append(tr, map[string]any{"key": k, "in": mb(), "out": mb()})
		}
	}
	if tr == nil {
		tr = []any{}
	}
	b := map[string]any{"mode": modes[rng.IntN(len(modes))], "pops": pops, "traffic": tr, "tier1": rng.IntN(4) == 0,
		"shareCountry": false, "total": int64(rng.IntN(8) * 500)}
	if rng.IntN(2) == 0 {
		b["pies"] = int64(rng.IntN(300))
	}
	if rng.IntN(3) == 0 {
		b["ai"] = map[string]any{"model": "m" + fmt.Sprint(rng.IntN(2)), "harness": "h"}
	}
	// Transit customers and upstreams (the cone board): often, so that edges confirm each other.
	for _, f := range []string{"cust", "up"} {
		if rng.IntN(3) == 0 {
			continue
		}
		l := []any{}
		for _, k := range keys {
			if k != self && rng.IntN(2) == 0 {
				l = append(l, k)
			}
		}
		if len(l) > 0 || rng.IntN(2) == 0 {
			b[f] = l
		}
	}
	b["tier2"] = rng.IntN(2) == 0
	return b
}

type held map[string]*boards.Stats

func (h held) list() []*boards.Stats {
	out := make([]*boards.Stats, 0, len(h))
	for _, s := range h {
		out = append(out, s)
	}
	return out
}

func keysOf(h held) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range h {
		if !seen[s.Key] {
			seen[s.Key] = true
			out = append(out, s.Key)
		}
	}
	slices.Sort(out)
	return out
}

func rowOf(rows []boards.Row, k string) (int64, bool) {
	for _, r := range rows {
		if r.Key == k {
			return r.Value, true
		}
	}
	return 0, false
}

func compare(t *testing.T, a *Agg, h held, states []*boards.State, now int64, ex map[string]bool, founded map[string]int64, label string) {
	t.Helper()
	recs := h.list()
	for _, b := range Boards {
		for _, m := range []string{"total", "growth"} {
			for _, d := range []string{"all", "human", "ai"} {
				for _, cs := range [][]string{nil, {"fra"}, {"ams", "fra"}} {
					want := boards.Compute(boards.Query{Now: now, Board: b, Measure: m, Division: d, Exclude: ex, Founded: founded, Cities: cs, States: states}, recs)
					ans, err := a.Rank(context.Background(), &Slice{Board: b, Measure: m, Division: d, Cities: cs}, now, "", -1)
					if err != nil {
						t.Fatal(err)
					}
					got := make([]boards.Row, len(ans.Rows))
					for i, r := range ans.Rows {
						got[i] = boards.Row{Key: r.Key, Value: r.Value}
					}
					if want == nil {
						want = []boards.Row{}
					}
					if !slices.Equal(got, want) {
						t.Fatalf("%s: %s %s %s %v:\n got %v\nwant %v", label, b, m, d, cs, got, want)
					}
					if b == "cone" {
						for _, r := range want {
							if r.Value > 0 {
								coneSeen++
							}
						}
					}
					if d != "all" {
						continue
					}
					// rankwhy: the records it names are enough to work out each network's value alone.
					for _, k := range keysOf(h) {
						ids, anns, ls, _, at, err := a.Why(&Slice{Board: b, Measure: m, Division: d, Cities: cs}, k, now, ans.At)
						if err != nil || at != ans.At {
							t.Fatal(err, at, ans.At)
						}
						var sts []*boards.State
						for _, l := range ls {
							sts = append(sts, byID(states, l.ID))
						}
						// Only the announces it names: their founded must be enough.
						fd := map[string]int64{}
						for _, x := range anns {
							if f, ok := founded[x]; ok {
								fd[x] = f
							}
						}
						var sub []*boards.Stats
						for _, id := range ids {
							sub = append(sub, h[id])
						}
						alone := boards.Compute(boards.Query{Now: now, Board: b, Measure: m, Division: d, Exclude: ex, Founded: fd, Cities: cs, States: sts}, sub)
						wv, wok := rowOf(want, k)
						gv, gok := rowOf(alone, k)
						if wv != gv || wok != gok {
							t.Fatalf("%s: rankwhy %s %s %v for %s: alone %d %v, on the board %d %v", label, b, m, cs, k, gv, gok, wv, wok)
						}
					}
				}
			}
		}
	}
}

// The aggregate gives exactly the reference results over many random streams of records:
// records arriving in any order (late ones in past slots too), replaced in a slot, removed,
// networks excluded and let back, the windows moving on.
func TestRandomStreamsMatchReference(t *testing.T) {
	streams := 40
	if testing.Short() {
		streams = 8
	}
	for seed := range streams {
		rng := rand.New(rand.NewPCG(uint64(seed), 7))
		a := New(2)
		a.Load(nil, nil, nil, nil)
		h := held{}
		K := 3 + rng.IntN(8)
		keys := make([]string, K)
		for i := range keys {
			keys[i] = fmt.Sprintf("k%02d", i)
		}
		partners := append(slices.Clone(keys), "ghost1", "ghost2")
		now := t0 + int64(rng.IntN(300))
		ex := map[string]bool{}
		// Announces: when each network joined, some long ago, some days before the windows' slots
		// (established part way through them), some not at all.
		founded := map[string]int64{}
		announce := func(k string) {
			if rng.IntN(5) == 0 {
				delete(founded, k)
				a.Announce(k, nil)
				return
			}
			founded[k] = fed.Div(now, fed.Day) - int64(25+rng.IntN(15))
			a.Announce(k, &Ann{Name: k, Founded: founded[k]})
		}
		for _, k := range keys {
			announce(k)
		}
		nid := 0
		var states []*boards.State
		for step := range 6 {
			c := fed.Slot(now)
			lo := c - N*fed.SlotLen - fed.CarryForward - 3*fed.SlotLen
			for range 30 + rng.IntN(60) {
				switch op := rng.IntN(10); {
				case op < 7 || len(h) == 0:
					k := keys[rng.IntN(K)]
					var slot int64
					if rng.IntN(4) == 0 {
						slot = c + int64(rng.IntN(300)) // the running slot
					} else {
						slot = lo + int64(rng.IntN(int(c-lo)/fed.SlotLen))*fed.SlotLen + int64(rng.IntN(3))*100
					}
					if rng.IntN(5) == 0 && len(h) > 0 { // same board slot as another record of the key
						// In id order, not map order (Go randomises it): every run builds the same stream.
						for _, id := range slices.Sorted(maps.Keys(h)) {
							if s := h[id]; s.Key == k {
								slot = s.Slot
								break
							}
						}
					}
					nid++
					id := fmt.Sprintf("r%05d", nid)
					s := &boards.Stats{ID: id, Key: k, Slot: slot, T: slot + int64(rng.IntN(3)), Body: randBody(rng, k, partners)}
					h[id] = s
					a.Stats(s.ID, s.Key, s.Slot, s.T, s.Body, "")
				case op < 8 && rng.IntN(3) == 0:
					announce(keys[rng.IntN(K)])
				case op < 9:
					// A record picked by the stream's own random numbers, never by map order.
					ids := slices.Sorted(maps.Keys(h))
					id := ids[rng.IntN(len(ids))]
					delete(h, id)
					a.Drop(id)
				default:
					k := keys[rng.IntN(K)]
					if ex[k] {
						delete(ex, k)
					} else {
						ex[k] = true
					}
					a.Exclude(ex, nil)
				}
				if rng.IntN(8) == 0 {
					a.flush()
					if rng.IntN(2) == 0 {
						a.window(c) // sums worked out between arrivals
					}
				}
			}
			// Live states: the running slot of the current window (10.13).
			for range rng.IntN(2 * K) {
				k := keys[rng.IntN(K)]
				nid++
				st := &boards.State{ID: fmt.Sprintf("s%05d", nid), Key: k, T: now - int64([]int{0, 3, 60, 890}[rng.IntN(4)]), Body: randBody(rng, k, partners)}
				states = append(states, st)
				a.State(st.ID, st.Key, st.T, st.Body, []byte(st.ID), now)
			}
			compare(t, a, h, states, now, ex, founded, fmt.Sprintf("seed %d step %d", seed, step))
			// The windows move on: a slot, a few, or a long gap (the running slot's snapshot after
			// winEvery seconds at most: a few seconds is past it).
			now += []int64{fed.SlotLen, 3 * fed.SlotLen, winEvery + 1, 400 * fed.SlotLen, 2000 * fed.SlotLen}[rng.IntN(5)]
		}
		a.Close()
	}
	if coneSeen < 20 {
		t.Fatalf("only %d cone rows above 0: the streams hardly test the cone board", coneSeen)
	}
	if widened.Load() == 0 {
		t.Fatal("no slot sums passed 32 bits: the streams do not test the wide sums")
	}
	t.Logf("%d cone rows above 0 compared, %d slot sums widened to 64 bits", coneSeen, widened.Load())
}

// Filters, n, own row and names behave as the spec says.
func TestSliceFiltersAndMe(t *testing.T) {
	a := New(1)
	defer a.Close()
	c := fed.Slot(t0)
	s := c - 10*fed.SlotLen
	body := func(pops int64, ai bool, tier1 bool) map[string]any {
		b := map[string]any{"mode": "normal", "pops": map[string]any{"fra": pops}, "traffic": []any{}, "tier1": tier1, "shareCountry": true}
		if ai {
			b["ai"] = map[string]any{"model": "mx", "harness": "hx"}
		}
		return b
	}
	raws := []Raw{
		{ID: "r1", Key: "kA", Slot: s, T: s, Body: body(5, false, true), CC: "DE"},
		{ID: "r2", Key: "kB", Slot: s, T: s, Body: body(4, true, false), CC: "FR"},
		{ID: "r3", Key: "kC", Slot: s, T: s, Body: body(3, false, false)},
		{ID: "r4", Key: "kD", Slot: s, T: s, Body: body(2, false, false)},
	}
	anns := map[string]*Ann{"kA": {Name: "Alpha", Home: "DE", Policy: "open", Founded: fed.Div(t0, fed.Day) - 3, Day: 40},
		"kB": {Name: "Beta", Home: "FR", Policy: "selective", Founded: fed.Div(t0, fed.Day) - 100, Day: 2000}}
	a.Load(raws, anns, map[string]bool{"kD": true}, map[string]bool{"kB": true})
	rk := func(q Slice, me string, n int) *Answer {
		if q.Board == "" {
			q.Board, q.Measure, q.Division = "pops", "total", "all"
		}
		ans, err := a.Rank(context.Background(), &q, t0, me, n)
		if err != nil {
			t.Fatal(err)
		}
		return ans
	}
	keys := func(ans *Answer) []string {
		var k []string
		for _, r := range ans.Rows {
			k = append(k, r.Key)
		}
		return k
	}
	all := rk(Slice{}, "kC", 50)
	if got := keys(all); !slices.Equal(got, []string{"kA", "kB", "kC"}) || all.N != 3 || all.Me == nil || *all.Me.Rank != 3 {
		t.Fatalf("all: %v n=%d me=%+v", got, all.N, all.Me)
	}
	if all.Rows[0].Name != "Alpha" || all.Rows[1].Name != "" || all.Rows[1].Home != "FR" || all.Rows[0].CC != "DE" || !all.Rows[1].AI {
		t.Fatalf("rows: %+v", all.Rows)
	}
	if got := rk(Slice{}, "", 2); len(got.Rows) != 2 || got.N != 3 || got.Me != nil {
		t.Fatalf("n: %+v", got)
	}
	str := func(s string) *string { return &s }
	i64 := func(n int64) *int64 { return &n }
	tru := true
	for _, c := range []struct {
		q    Slice
		want []string
	}{
		{Slice{Board: "pops", Measure: "total", Division: "ai"}, []string{"kB"}},
		{Slice{Board: "pops", Measure: "total", Division: "human"}, []string{"kA", "kC"}},
		{Slice{Model: str("mx")}, []string{"kB"}},
		{Slice{Harness: str("other")}, nil},
		{Slice{Tier1: &tru}, []string{"kA"}},
		{Slice{From: str("FR")}, []string{"kB"}},
		{Slice{Home: str("DE")}, []string{"kA"}},
		{Slice{Policy: str("selective")}, []string{"kB"}},
		{Slice{AgeMax: i64(6)}, []string{"kA"}},
		{Slice{AgeMin: i64(91)}, []string{"kB"}},
		{Slice{DayMin: i64(1000)}, []string{"kB"}},
		{Slice{Keys: []string{"kC", "kD"}}, []string{"kC"}},
		{Slice{Board: "pops", Measure: "total", Division: "all", Cities: []string{"nyc"}}, nil},
	} {
		if got := keys(rk(c.q, "", 50)); !slices.Equal(got, c.want) {
			t.Errorf("%+v: %v, want %v", c.q, got, c.want)
		}
	}
	// Left out by the filters: own row without a rank; not on the board at all: none.
	if m := rk(Slice{Home: str("FR")}, "kA", 50).Me; m == nil || m.Rank != nil || m.Value != 5 {
		t.Fatalf("me filtered: %+v", m)
	}
	if m := rk(Slice{}, "kD", 50).Me; m != nil {
		t.Fatalf("excluded me: %+v", m)
	}
	f, err := a.Facets(context.Background(), t0)
	if err != nil || !slices.Equal(f.Models, []string{"mx"}) || !slices.Equal(f.From, []string{"DE", "FR"}) || !slices.Equal(f.Homes, []string{"DE", "FR"}) {
		t.Fatalf("facets: %+v %v", f, err)
	}
}

// A new announce leaves slices that do not read announces cached (their names still follow),
// and works out again those that do, which then see the new home.
func TestAnnounceKeepsSlices(t *testing.T) {
	a := New(1)
	defer a.Close()
	s := fed.Slot(t0) - 10*fed.SlotLen
	body := map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(2)}, "traffic": []any{}, "tier1": false, "shareCountry": false}
	a.Load([]Raw{{ID: "r1", Key: "kA", Slot: s, T: s, Body: body}}, map[string]*Ann{"kA": {Name: "Alpha", Home: "DE", Policy: "open"}}, nil, nil)
	rk := func(q Slice) *Answer {
		q.Board, q.Measure, q.Division = "pops", "total", "human"
		ans, err := a.Rank(context.Background(), &q, t0, "", 50)
		if err != nil {
			t.Fatal(err)
		}
		return ans
	}
	de := "DE"
	if rk(Slice{}).Cached || rk(Slice{Home: &de}).Cached {
		t.Fatal("first asks were cached")
	}
	a.Announce("kA", &Ann{Name: "Alpha Two", Home: "FR", Policy: "open"})
	plain := rk(Slice{})
	if !plain.Cached || plain.Rows[0].Name != "Alpha Two" || plain.Rows[0].Home != "FR" {
		t.Fatalf("plain slice after an announce: cached %v rows %+v", plain.Cached, plain.Rows)
	}
	if home := rk(Slice{Home: &de}); home.Cached || home.N != 0 {
		t.Fatalf("home slice after the home changed: cached %v n %d", home.Cached, home.N)
	}
}

func TestNotReadyAndNets(t *testing.T) {
	a := New(1)
	defer a.Close()
	if _, err := a.Rank(context.Background(), &Slice{Board: "pops", Measure: "total", Division: "all"}, t0, "", 50); err != ErrNotReady {
		t.Fatalf("before Load: %v", err)
	}
	s := fed.Slot(t0) - fed.SlotLen
	a.Stats("r1", "kA", s, s, map[string]any{"mode": "normal", "pops": map[string]any{}, "traffic": []any{map[string]any{"key": "me", "in": int64(5), "out": int64(7)}}, "tier1": true}, "")
	a.Load(nil, nil, nil, nil)
	nets, reps := a.Nets([]string{"kA", "kZ"}, "me")
	if len(nets) != 1 || !nets[0].Tier1 || len(reps) != 1 || reps[0] != (Report{"kA", 5, 7}) {
		t.Fatalf("nets %+v reports %+v", nets, reps)
	}
	// What a mentor's game reads of a newcomer: Tier 2, POPs, transit customers, from the newest record.
	a.Stats("r2", "kA", s+fed.SlotLen, s+fed.SlotLen, map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(1), "ams": int64(1)},
		"traffic": []any{}, "tier1": false, "tier2": true, "cust": []any{"kB", "kC"}}, "")
	nets, _ = a.Nets([]string{"kA"}, "")
	if len(nets) != 1 || nets[0] != (Net{Key: "kA", Tier2: true, Pops: 2, Cust: 2, Slot: s + fed.SlotLen}) {
		t.Fatalf("nets %+v", nets)
	}
}

// The cone board on a small federation: a chain, a cycle, an edge only one side confirms, a
// young member, an edge with traffic one way only, and an excluded network cutting the chain.
func TestConeShapes(t *testing.T) {
	c := fed.Slot(t0)
	s := c - 10*fed.SlotLen
	l := func(k ...string) []any {
		out := []any{}
		for _, x := range k {
			out = append(out, x)
		}
		return out
	}
	// tr: traffic both ways with each of these; oneway: only received from them.
	body := func(cust, up []any, tr []string, oneway ...string) map[string]any {
		t := []any{}
		for _, k := range tr {
			t = append(t, map[string]any{"key": k, "in": int64(100), "out": int64(100)})
		}
		for _, k := range oneway {
			t = append(t, map[string]any{"key": k, "in": int64(100), "out": int64(0)})
		}
		return map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(1)}, "traffic": t, "tier1": false, "shareCountry": false,
			"cust": cust, "up": up}
	}
	raws := []Raw{
		{ID: "a", Key: "kA", Slot: s, T: s, Body: body(l("kB", "kE", "kF"), l(), []string{"kB", "kE", "kF"})}, // A sells to B; E never confirms; F is young
		{ID: "b", Key: "kB", Slot: s, T: s, Body: body(l("kC", "kG"), l("kA"), []string{"kA", "kC"}, "kG")},   // B sells to C; G's traffic goes one way
		{ID: "c", Key: "kC", Slot: s, T: s, Body: body(l("kD"), l("kB", "kD"), []string{"kB", "kD"})},         // C and D sell to each other
		{ID: "d", Key: "kD", Slot: s, T: s, Body: body(l("kC"), l("kC"), []string{"kC"})},
		{ID: "e", Key: "kE", Slot: s, T: s, Body: body(l(), l(), []string{"kA"})},
		{ID: "f", Key: "kF", Slot: s, T: s, Body: body(l(), l("kA"), []string{"kA"})},
		{ID: "g", Key: "kG", Slot: s, T: s, Body: body(l(), l("kB"), []string{"kB"})},
	}
	day := fed.Div(t0, fed.Day)
	anns := map[string]*Ann{}
	for _, k := range []string{"kA", "kB", "kC", "kD", "kE", "kG"} {
		anns[k] = &Ann{Name: k, Founded: day - 40}
	}
	anns["kF"] = &Ann{Name: "kF", Founded: day - 29}
	want := map[string]int64{"kA": 3, "kB": 2, "kC": 1, "kD": 1, "kE": 0, "kF": 0, "kG": 0}
	for _, ex := range []map[string]bool{nil, {"kC": true}} {
		a := New(1)
		a.Load(raws, anns, ex, nil)
		ans, err := a.Rank(context.Background(), &Slice{Board: "cone", Measure: "total", Division: "all"}, t0, "", -1)
		if err != nil {
			t.Fatal(err)
		}
		got := map[string]int64{}
		for _, r := range ans.Rows {
			got[r.Key] = r.Value
		}
		w := want
		if ex != nil {
			w = map[string]int64{"kA": 1, "kB": 0, "kD": 0, "kE": 0, "kF": 0, "kG": 0}
		}
		if !maps.Equal(got, w) {
			t.Errorf("excluded %v: %v, want %v", ex, got, w)
		}
		a.Close()
	}
}

// Records arriving while many rankings are asked for: the race detector watches the locks.
func TestConcurrentFeedAndRank(t *testing.T) {
	a := New(4)
	defer a.Close()
	a.Load(nil, nil, nil, nil)
	rng := rand.New(rand.NewPCG(3, 4))
	keys := []string{"k0", "k1", "k2", "k3", "k4"}
	c := fed.Slot(t0)
	bodies := make([]map[string]any, 200)
	for i := range bodies {
		bodies[i] = randBody(rng, keys[i%5], keys)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i, b := range bodies {
			s := c - int64(i%300)*fed.SlotLen
			a.Stats(fmt.Sprint("r", i), keys[i%5], s, s, b, "")
			if i%20 == 0 {
				a.Drop(fmt.Sprint("r", i-10))
				a.Exclude(map[string]bool{keys[i%5]: true}, nil)
			}
		}
	}()
	var wg sync.WaitGroup
	for j := range 16 {
		wg.Go(func() {
			for i := range 20 {
				q := &Slice{Board: []string{"traffic", "total", "pops", "pies"}[(i+j)%4], Measure: "total", Division: "all"}
				if _, err := a.Rank(context.Background(), q, t0+int64(i%2)*fed.SlotLen, "k1", 50); err != nil && err != ErrBusy {
					t.Error(err)
				}
				a.Nets(keys, "k2")
			}
		})
	}
	wg.Wait()
	<-done
}

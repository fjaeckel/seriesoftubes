package rank

import (
	"context"
	"fmt"
	"math/rand/v2"
	"slices"
	"sync"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/boards"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

const t0 = int64(1767398410)

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
	for _, k := range keys {
		if k != self && rng.IntN(3) == 0 {
			tr = append(tr, map[string]any{"key": k, "in": int64(rng.IntN(5) * 1000), "out": int64(rng.IntN(5) * 1000)})
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

func compare(t *testing.T, a *Agg, h held, now int64, ex map[string]bool, label string) {
	t.Helper()
	recs := h.list()
	for _, b := range []string{"traffic", "total", "pops", "pies"} {
		for _, m := range []string{"total", "growth"} {
			for _, d := range []string{"all", "human", "ai"} {
				for _, cs := range [][]string{nil, {"fra"}, {"ams", "fra"}} {
					want := boards.Compute(boards.Query{Now: now, Board: b, Measure: m, Division: d, Exclude: ex, Cities: cs}, recs)
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
		nid := 0
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
						for _, s := range h {
							if s.Key == k {
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
				case op < 9:
					for id := range h {
						delete(h, id)
						a.Drop(id)
						break
					}
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
			compare(t, a, h, now, ex, fmt.Sprintf("seed %d step %d", seed, step))
			// The windows move on: a slot, a few, or a long gap.
			now += []int64{fed.SlotLen, 3 * fed.SlotLen, 7, 400 * fed.SlotLen, 2000 * fed.SlotLen}[rng.IntN(5)]
		}
		a.Close()
	}
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

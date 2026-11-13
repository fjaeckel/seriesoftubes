package rank

import (
	"context"
	"fmt"
	"math/rand/v2"
	"slices"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/boards"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

var nowConeSeen int

// compareNow holds every board of now (each division, three regions) to the reference, and each
// key's rankwhy answer to being enough to work its value out alone.
func compareNow(t *testing.T, a *Agg, states []*boards.State, now int64, ex map[string]bool, founded map[string]int64, label string) {
	t.Helper()
	for _, b := range Boards {
		for _, d := range []string{"all", "human", "ai"} {
			for _, cs := range [][]string{nil, {"fra"}, {"ams", "fra"}} {
				q := boards.NowQuery{Now: now, Board: b, Division: d, Exclude: ex, Founded: founded, Cities: cs}
				want := boards.ComputeNow(q, states)
				ans, err := a.Rank(context.Background(), &Slice{Board: b, Measure: "now", Division: d, Cities: cs}, now, "", -1)
				if err != nil {
					t.Fatal(err)
				}
				if ans.At != now {
					t.Fatalf("%s: answer at %d, asked at %d", label, ans.At, now)
				}
				got := make([]boards.Row, len(ans.Rows))
				for i, r := range ans.Rows {
					got[i] = boards.Row{Key: r.Key, Value: r.Value}
				}
				if !slices.Equal(got, want) {
					t.Fatalf("%s: %s now %s %v:\n got %v\nwant %v", label, b, d, cs, got, want)
				}
				if b == "cone" {
					for _, r := range want {
						if r.Value > 0 {
							nowConeSeen++
						}
					}
				}
				if d != "all" {
					continue
				}
				for _, k := range []string{"k00", "k01", "k02", "k03", "k04"} {
					ls, _, anns, at, err := a.WhyNow(&Slice{Board: b, Measure: "now", Division: d, Cities: cs}, k, now, ans.At)
					if err != nil || at != ans.At {
						t.Fatalf("%s: rankwhy now: %v at %d", label, err, at)
					}
					fd := map[string]int64{}
					for _, x := range anns {
						if f, ok := founded[x]; ok {
							fd[x] = f
						}
					}
					var sub []*boards.State
					for _, l := range ls {
						sub = append(sub, byID(states, l.ID))
					}
					q.Founded = fd
					alone := boards.ComputeNow(q, sub)
					wv, wok := rowOf(want, k)
					gv, gok := rowOf(alone, k)
					if wv != gv || wok != gok {
						t.Fatalf("%s: rankwhy now %s %v for %s: alone %d %v, on the board %d %v", label, b, cs, k, gv, gok, wv, wok)
					}
				}
			}
		}
	}
}

func byID(l []*boards.State, id string) *boards.State {
	for _, s := range l {
		if s.ID == id {
			return s
		}
	}
	return nil
}

// The boards of now give exactly the reference results over random streams of live states:
// states arriving out of order (older ones change nothing), keys going quiet and expiring,
// networks excluded and let back, announces changing who is established.
func TestRandomLiveStatesMatchReference(t *testing.T) {
	streams := 30
	if testing.Short() {
		streams = 6
	}
	for seed := range streams {
		rng := rand.New(rand.NewPCG(uint64(seed), 11))
		a := New(2)
		a.Load(nil, nil, nil, nil)
		K := 3 + rng.IntN(8)
		keys := make([]string, K)
		for i := range keys {
			keys[i] = fmt.Sprintf("k%02d", i)
		}
		partners := append(slices.Clone(keys), "ghost1")
		now := t0 + int64(rng.IntN(300))
		ex := map[string]bool{}
		founded := map[string]int64{}
		for _, k := range keys {
			if rng.IntN(5) != 0 {
				founded[k] = fed.Div(now, fed.Day) - int64(25+rng.IntN(15))
				a.Announce(k, &Ann{Name: k, Founded: founded[k]})
			}
		}
		var states []*boards.State
		nid := 0
		for step := range 8 {
			for range 10 + rng.IntN(30) {
				switch op := rng.IntN(10); {
				case op < 8:
					k := keys[rng.IntN(K)]
					nid++
					// Mostly fresh, sometimes older than what is held, sometimes about to expire.
					t := now - int64([]int{0, 0, 0, 5, 60, 400, 890}[rng.IntN(7)])
					s := &boards.State{ID: fmt.Sprintf("s%05d", nid), Key: k, T: t, Body: randBody(rng, k, partners)}
					states = append(states, s)
					a.State(s.ID, s.Key, s.T, s.Body, []byte(s.ID), now)
				case op < 9:
					k := keys[rng.IntN(K)]
					if ex[k] {
						delete(ex, k)
					} else {
						ex[k] = true
					}
					a.Exclude(ex, nil)
				default:
					k := keys[rng.IntN(K)]
					founded[k] = fed.Div(now, fed.Day) - int64(25+rng.IntN(15))
					a.Announce(k, &Ann{Name: k, Founded: founded[k]})
				}
			}
			compareNow(t, a, states, now, ex, founded, fmt.Sprintf("seed %d step %d", seed, step))
			// Time goes on: past the snapshot's age, and now and then past a state's life.
			now += []int64{snapEvery, 30, 300, fed.StateLife - 100}[rng.IntN(4)]
			if rng.IntN(3) == 0 {
				a.ExpireStates(now)
			}
		}
		a.Close()
	}
	if nowConeSeen < 10 {
		t.Fatalf("only %d cone rows above 0: the streams hardly test the cone board of now", nowConeSeen)
	}
	t.Logf("%d cone rows above 0 compared", nowConeSeen)
}

// One state per key, the newest; older and stale ones change nothing; the bound refuses new keys
// until quiet ones expire; a snapshot is reused for snapEvery seconds and kept for spot checks.
func TestLiveStateKeeping(t *testing.T) {
	a := New(1)
	defer a.Close()
	a.Load(nil, nil, nil, nil)
	body := func(n int64) map[string]any {
		return map[string]any{"mode": "normal", "pops": map[string]any{"fra": n}, "traffic": []any{}, "tier1": false, "shareCountry": false}
	}
	now := t0
	if r := a.State("b", "k1", now, body(2), []byte("xx"), now); r != StateNew {
		t.Fatal("first state", r)
	}
	if r := a.State("c", "k1", now-1, body(9), []byte("xx"), now); r != StateOld {
		t.Fatal("older state", r)
	}
	if r := a.State("c", "k1", now, body(9), []byte("xx"), now); r != StateOld {
		t.Fatal("same t, higher id", r)
	}
	if r := a.State("a", "k1", now, body(3), []byte("xx"), now); r != StateNew {
		t.Fatal("same t, lower id", r)
	}
	if r := a.State("d", "k2", now-fed.StateLife, body(1), []byte("xx"), now); r != StateStale {
		t.Fatal("stale state", r)
	}
	a.SetLiveCap(2, 0)
	if r := a.State("e", "k2", now-fed.StateLife+10, body(1), []byte("xx"), now); r != StateNew {
		t.Fatal("second key", r)
	}
	if r := a.State("f", "k3", now, body(1), []byte("xx"), now); r != StateFull {
		t.Fatal("over the bound", r)
	}
	ans, err := a.Rank(context.Background(), &Slice{Board: "pops", Measure: "now", Division: "all"}, now, "k1", 10)
	if err != nil || ans.N != 2 || ans.Rows[0].Key != "k1" || ans.Rows[0].Value != 3 || ans.Me == nil || *ans.Me.Rank != 1 {
		t.Fatalf("ranking %+v %v", ans, err)
	}
	// A state that arrives now shows in the next snapshot, snapEvery seconds on.
	a.State("g", "k1", now+1, body(7), []byte("xx"), now+1)
	ans, _ = a.Rank(context.Background(), &Slice{Board: "pops", Measure: "now", Division: "all"}, now+1, "", 10)
	if ans.At != now || ans.Rows[0].Value != 3 {
		t.Fatalf("within snapEvery the snapshot stays: %+v", ans)
	}
	ans, _ = a.Rank(context.Background(), &Slice{Board: "pops", Measure: "now", Division: "all"}, now+snapEvery, "", 10)
	if ans.At != now+snapEvery || ans.Rows[0].Value != 7 {
		t.Fatalf("a new snapshot: %+v", ans)
	}
	// The spot check of the first answer still gets the states it was worked out from.
	ls, _, _, at, err := a.WhyNow(&Slice{Board: "pops", Measure: "now", Division: "all"}, "k1", now+snapEvery, now)
	if err != nil || at != now || len(ls) != 1 || ls[0].ID != "a" {
		t.Fatalf("rankwhy of a kept snapshot: %v %d %v", ls, at, err)
	}
	// k2 goes quiet: gone from the boards, and its room is free again.
	later := now - 10 + fed.StateLife
	ans, _ = a.Rank(context.Background(), &Slice{Board: "pops", Measure: "now", Division: "all"}, later, "", 10)
	if ans.N != 1 {
		t.Fatalf("a quiet key stays on the board: %+v", ans)
	}
	if r := a.State("h", "k3", later, body(1), []byte("xx"), later); r != StateNew {
		t.Fatal("room after expiry", r)
	}
	if n, b := a.LiveStats(); n != 2 || b != 4 {
		t.Fatal("held", n, b)
	}
	a.DropState("k3")
	if n, _ := a.LiveStats(); n != 1 {
		t.Fatal("dropped", n)
	}
}

// Nothing worked out is served once it is older than flightMaxAge, whatever the measure: the same
// slice in the same state is worked out again.
func TestNoAnswerOlderThanMaxAge(t *testing.T) {
	old := flightMaxAge
	flightMaxAge = 50 * time.Millisecond
	defer func() { flightMaxAge = old }()
	a := New(1)
	defer a.Close()
	a.Load(nil, nil, nil, nil)
	a.Stats("r1", "k1", fed.Slot(t0)-fed.SlotLen, t0-300, map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(1)}, "traffic": []any{}, "tier1": false, "shareCountry": false}, "")
	for _, m := range Measures {
		q := &Slice{Board: "pops", Measure: m, Division: "all"}
		first, _ := a.Rank(context.Background(), q, t0, "", 10)
		again, _ := a.Rank(context.Background(), q, t0, "", 10)
		time.Sleep(80 * time.Millisecond)
		later, _ := a.Rank(context.Background(), q, t0, "", 10)
		if first.Cached || !again.Cached || later.Cached {
			t.Fatalf("%s: cached %v %v %v (want false, true, false)", m, first.Cached, again.Cached, later.Cached)
		}
	}
}

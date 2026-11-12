package rank

import (
	"context"
	"fmt"
	"math/rand/v2"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// A big federation: nets networks with a record every two hours over the windows and the carry
// reach before them, each reporting traffic with five others; a fifth of them AI.
func bigFed(nets int) ([]Raw, map[string]*Ann) {
	rng := rand.New(rand.NewPCG(1, 2))
	c := fed.Slot(t0)
	from := c - N*fed.SlotLen - 6*3600
	var raws []Raw
	anns := map[string]*Ann{}
	key := func(i int) string { return fmt.Sprintf("net%06d", i) }
	for i := range nets {
		k := key(i)
		anns[k] = &Ann{Name: k, Home: []string{"DE", "FR", "US", "JP"}[i%4], Policy: "open", Founded: fed.Div(t0, fed.Day) - 40 - int64(i%200), Day: int64(i % 2000)}
		for s := from + int64(rng.IntN(7200)); s < c; s += 7200 {
			tr := make([]any, 0, 10)
			for j := range 5 {
				tr = append(tr, map[string]any{"key": key((i + 1 + j*97) % nets), "in": int64(rng.IntN(10000)), "out": int64(rng.IntN(10000))})
			}
			// Traffic both ways with its transit parent and children (the cone counts only those edges).
			for _, j := range []int{(i - 1) / 4, 4*i + 1, 4*i + 2, 4*i + 3, 4*i + 4} {
				if j != i && j < nets && (j != (i-1)/4 || i > 0) {
					tr = append(tr, map[string]any{"key": key(j), "in": int64(1 + rng.IntN(1000)), "out": int64(1 + rng.IntN(1000))})
				}
			}
			b := map[string]any{"mode": "normal", "pops": map[string]any{cities[i%4]: int64(1), cities[(i+1)%4]: int64(1)}, "traffic": tr,
				"tier1": i%50 == 0, "shareCountry": true, "total": int64(rng.IntN(100000)), "pies": int64(rng.IntN(500))}
			// Transit: a tree of sellers, each network buying from its parent (i-1)/4 and selling to
			// its children 4i+1..4i+4, both sides confirming: cones up to all 10000 at the root.
			var cust []any
			for j := 4*i + 1; j <= 4*i+4 && j < nets; j++ {
				cust = append(cust, key(j))
			}
			if cust != nil {
				b["cust"] = cust
			}
			if i > 0 {
				b["up"] = []any{key((i - 1) / 4)}
			}
			if i%5 == 0 {
				b["ai"] = map[string]any{"model": fmt.Sprint("model-", i%7), "harness": "h"}
			}
			raws = append(raws, Raw{ID: fmt.Sprintf("%s-%d", k, s), Key: k, Slot: s, T: s, Body: b, CC: []string{"DE", "FR", "US"}[i%3]})
		}
	}
	return raws, anns
}

// slicesMix are the slices players ask for: every board and measure, divisions, regions, filters.
func slicesMix() []*Slice {
	str := func(s string) *string { return &s }
	var out []*Slice
	for _, b := range Boards {
		for _, m := range []string{"total", "growth"} {
			out = append(out, &Slice{Board: b, Measure: m, Division: "all"}, &Slice{Board: b, Measure: m, Division: "ai"})
		}
	}
	out = append(out, &Slice{Board: "traffic", Measure: "total", Division: "all", Cities: []string{"fra"}},
		&Slice{Board: "pops", Measure: "total", Division: "human", Home: str("DE")},
		&Slice{Board: "total", Measure: "total", Division: "all", From: str("FR")},
		&Slice{Board: "traffic", Measure: "total", Division: "ai", Model: str("model-3")})
	return out
}

func loaded(b *testing.B, nets int) *Agg {
	raws, anns := bigFed(nets)
	runtime.GC()
	var m0, m1 runtime.MemStats
	runtime.ReadMemStats(&m0)
	a := New(0)
	t := time.Now()
	a.Load(raws, anns, nil, nil)
	a.window(fed.Slot(t0))
	load := time.Since(t)
	runtime.GC()
	runtime.ReadMemStats(&m1)
	runtime.KeepAlive(raws)
	b.Logf("%d networks, %d records: load %v, heap %d B per network", nets, len(raws), load, (int64(m1.HeapAlloc)-int64(m0.HeapAlloc))/int64(nets))
	return a
}

// 100 concurrent rank requests across slices, every ranking worked out afresh (a record landing
// in a past slot invalidates them all each round), and answered from the caches.
func benchRank(b *testing.B, cold bool) {
	const nets, clients = 10000, 100
	a := loaded(b, nets)
	defer a.Close()
	qs := slicesMix()
	var peak atomic.Int64
	stop := make(chan struct{})
	go func() {
		for {
			select {
			case <-stop:
				return
			default:
			}
			if n := int64(runtime.NumGoroutine()); n > peak.Load() {
				peak.Store(n)
			}
			time.Sleep(200 * time.Microsecond)
		}
	}()
	base := int64(runtime.NumGoroutine())
	b.ReportAllocs()
	b.ResetTimer()
	for i := range b.N {
		if cold {
			s := fed.Slot(t0) - 100*fed.SlotLen
			a.Stats(fmt.Sprint("bump", i), "net000001", s, s+int64(i), map[string]any{"mode": "normal", "pops": map[string]any{}, "traffic": []any{}}, "")
			a.flush()
		}
		var wg sync.WaitGroup
		for j := range clients {
			wg.Go(func() {
				q := qs[(i*7+j)%len(qs)]
				for {
					_, err := a.Rank(context.Background(), q, t0, fmt.Sprintf("net%06d", j), 50)
					if err != ErrBusy {
						if err != nil {
							b.Error(err)
						}
						return
					}
					time.Sleep(time.Millisecond)
				}
			})
		}
		wg.Wait()
	}
	b.StopTimer()
	close(stop)
	// Beyond the clients themselves: what the aggregate starts (its workers and applier run all along).
	b.ReportMetric(float64(peak.Load()-base-clients), "extra-goroutines")
	b.ReportMetric(float64(base), "base-goroutines")
}

func BenchmarkRank100Cold(b *testing.B) { benchRank(b, true) }

// The cone board alone on 10000 networks (a tree of transit: cones up to 9999), worked out afresh
// each time (a record lands in a past slot first), then answered from the cache.
func BenchmarkConeBoard(b *testing.B) {
	a := loaded(b, 10000)
	defer a.Close()
	q := &Slice{Board: "cone", Measure: "total", Division: "all"}
	for _, cold := range []bool{true, false} {
		name := "warm"
		if cold {
			name = "cold"
		}
		b.Run(name, func(b *testing.B) {
			b.ReportAllocs()
			for i := range b.N {
				if cold {
					s := fed.Slot(t0) - 100*fed.SlotLen
					a.Stats(fmt.Sprint("cone", i), "net000001", s, s+int64(i), map[string]any{"mode": "normal", "pops": map[string]any{}, "traffic": []any{}}, "")
					a.flush()
				}
				ans, err := a.Rank(context.Background(), q, t0, "net000000", 50)
				if err != nil {
					b.Fatal(err)
				}
				if i == 0 && cold && ans.Rows[0].Value < 9000 {
					b.Fatalf("root cone %d", ans.Rows[0].Value)
				}
			}
		})
	}
}
func BenchmarkRank100Warm(b *testing.B) { benchRank(b, false) }

// One stats record arriving: in the running slot (most of them), and late, in a past slot.
func BenchmarkUpdate(b *testing.B) {
	a := loaded(b, 10000)
	defer a.Close()
	c := fed.Slot(t0)
	body := map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(1)}, "tier1": false,
		"traffic": []any{map[string]any{"key": "net000002", "in": int64(5), "out": int64(5)}}}
	b.Run("running", func(b *testing.B) {
		b.ReportAllocs()
		for i := range b.N {
			a.mu.Lock()
			a.apply(event{op: 's', id: fmt.Sprint("u", i), key: fmt.Sprintf("net%06d", i%10000), slot: c + 10, t: int64(i), body: body})
			a.mu.Unlock()
		}
	})
	b.Run("past", func(b *testing.B) {
		b.ReportAllocs()
		for i := range b.N {
			a.mu.Lock()
			a.apply(event{op: 's', id: fmt.Sprint("p", i), key: fmt.Sprintf("net%06d", i%10000), slot: c - 200*fed.SlotLen + int64(i%7), t: int64(i), body: body})
			a.mu.Unlock()
		}
	})
	b.Run("shift", func(b *testing.B) {
		b.ReportAllocs()
		for i := range b.N {
			a.mu.Lock()
			a.shift(c + int64(i+1)*fed.SlotLen)
			a.mu.Unlock()
		}
	})
}

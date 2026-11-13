package node_test

import (
	"fmt"
	"os"
	"runtime"
	"runtime/pprof"
	"sync"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

var folders sync.Map // spec -> dir, made once per run

func folder(b *testing.B, f rt.FolderSpec) (string, map[string]int) {
	type made struct {
		dir string
		n   map[string]int
	}
	k := fmt.Sprint(f)
	if v, ok := folders.Load(k); ok {
		return v.(made).dir, v.(made).n
	}
	dir, err := os.MkdirTemp("", "relaymem")
	if err != nil {
		b.Fatal(err)
	}
	n, err := rt.Folder(dir, f)
	if err != nil {
		b.Fatal(err)
	}
	folders.Store(k, made{dir, n})
	return dir, n
}

func heap() uint64 {
	runtime.GC()
	runtime.GC()
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return m.HeapAlloc
}

// BenchmarkMemory loads a data folder of a busy server (networks with stats every hour or every
// slot over 72 hours, a week of daily announces, ten answered offers each) and reports the Go heap
// it takes: the store alone, and the whole relay (store, its indexes and the leaderboards), per
// record and per network. RELAY_MEM_NETS changes the networks (default 1000; 300 for every slot).
func BenchmarkMemory(b *testing.B) {
	for _, every := range []int64{3600, 300} {
		nets := 1000
		if every == 300 {
			nets = 300
		}
		if v := os.Getenv("RELAY_MEM_NETS"); v != "" {
			fmt.Sscan(v, &nets)
		}
		spec := rt.FolderSpec{Nets: nets, Every: every, Hours: 72, Now: rt.Start, Offers: 10, Anns: 7}
		b.Run(fmt.Sprintf("nets=%d/every=%ds", nets, every), func(b *testing.B) {
			dir, n := folder(b, spec)
			recs := 0
			for _, c := range n {
				recs += c
			}
			var storeB, allB uint64
			for range b.N {
				h0 := heap()
				st, err := store.Open(dir)
				if err != nil {
					b.Fatal(err)
				}
				storeB = heap() - h0
				st.Close()
				h0 = heap()
				clock := rt.NewClock(rt.Start)
				r, err := node.New(node.Options{Dir: dir, Node: rt.Key("folder node"), Clock: clock.Now})
				if err != nil {
					b.Fatal(err)
				}
				for !r.RankReady() {
					time.Sleep(10 * time.Millisecond)
				}
				// The windows' per-slot sums are worked out by the first ranking.
				if _, err := r.Board("traffic", "total", "all"); err != nil {
					b.Fatal(err)
				}
				allB = heap() - h0
				if p := os.Getenv("RELAY_MEM_PROFILE"); p != "" {
					if f, err := os.Create(fmt.Sprintf("%s-%d.pprof", p, every)); err == nil {
						pprof.WriteHeapProfile(f)
						f.Close()
					}
				}
				r.Close()
			}
			b.ReportMetric(float64(recs), "records")
			b.ReportMetric(float64(storeB)/float64(recs), "store-B/record")
			b.ReportMetric(float64(allB)/float64(recs), "relay-B/record")
			b.ReportMetric(float64(allB)/float64(nets), "relay-B/network")
			b.ReportMetric(float64(st(dir))/float64(nets), "disk-B/network")
		})
	}
}

func st(dir string) int64 {
	s, err := store.Open(dir)
	if err != nil {
		return 0
	}
	defer s.Close()
	return s.Size()
}

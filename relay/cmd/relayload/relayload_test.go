package main

import (
	"fmt"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// The smoke test runs relays as children of the test binary, which then plays their part.
func TestMain(m *testing.M) {
	if len(os.Args) > 1 && os.Args[1] == "node" {
		if err := runNode(os.Args[2:]); err != nil {
			os.Exit(1)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// The ring with chords gives every server 3 or 4 neighbours and several hops; the full mesh one.
func TestTopology(t *testing.T) {
	adj := topology(20, "ring", 5)
	for i, l := range adj {
		if len(l) < 3 || len(l) > 4 {
			t.Fatalf("server %d has %d neighbours", i, len(l))
		}
	}
	d := hops(adj)
	most := 0
	for a := range d {
		for b := range d[a] {
			if d[a][b] < 0 {
				t.Fatalf("%d cannot reach %d", a, b)
			}
			most = max(most, d[a][b])
		}
	}
	if most < 3 {
		t.Fatalf("longest path %d hops: records should cross several", most)
	}
	full := hops(topology(6, "full", 0))
	if full[0][5] != 1 || len(topology(6, "full", 0)[2]) != 5 {
		t.Fatal("full mesh")
	}
	if small := topology(3, "ring", 0); len(small[0]) != 2 {
		t.Fatalf("three servers: %v", small)
	}
}

// The registry mesh is the graph every relay computes (10.9): all pairs up to the cap, each link
// seen from both ends.
func TestRegistryGraph(t *testing.T) {
	if topology(20, "registry", 0) != nil {
		t.Fatal("the registry mesh is worked out once the identities are known")
	}
	for _, n := range []int{3, 20, 100} {
		var relays []*relayProc
		for i := range n {
			relays = append(relays, &relayProc{i: i, id: fmt.Sprintf("id-%03d", (i*37)%n)})
		}
		adj := registryGraph(relays)
		for i, l := range adj {
			if n <= 65 && len(l) != n-1 {
				t.Fatalf("n=%d: server %d has %d peers", n, i, len(l))
			}
			for _, j := range l {
				if !slices.Contains(adj[j], i) {
					t.Fatalf("n=%d: %d-%d one way only", n, i, j)
				}
			}
		}
		for _, row := range hops(adj) {
			for _, h := range row {
				if h < 0 || h > 2 {
					t.Fatalf("n=%d: %d hops", n, h)
				}
			}
		}
	}
}

// Players are spread round-robin, or skewed towards the first servers, and all placed.
func TestAssign(t *testing.T) {
	count := make([]int, 20)
	for i := range 1000 {
		count[assign(i, 1000, 20, "skewed")]++
	}
	if count[0] <= count[1] || count[1] <= count[19] || count[19] == 0 {
		t.Fatalf("skewed: %v", count)
	}
	if assign(41, 1000, 20, "round-robin") != 1 {
		t.Fatal("round-robin")
	}
}

// A sealed offer opens for its counterparty, and for nobody else.
func TestSealOpen(t *testing.T) {
	sa, sb, sc := seedFor(9, 1), seedFor(9, 2), seedFor(9, 3)
	a, _ := fed.NewSigner(sa)
	b, _ := fed.NewSigner(sb)
	ba, bb, bc := boxKey(sa), boxKey(sb), boxKey(sc)
	pub := func(k interface{ Bytes() []byte }) string { return fed.Encode(k.Bytes()) }
	rec, err := sealed(a, ba, "offer", time.Now().Unix(), map[string]any{"to": b.Key},
		map[string]any{"deal": "peering", "terms": map[string]any{"at": []any{"fra"}, "via": "ix"}}, b.Key, pub(bb.PublicKey()))
	if err != nil {
		t.Fatal(err)
	}
	if _, code := fed.CheckValue(rec, time.Now().Unix(), fed.Opts{}); code != "" {
		t.Fatalf("relay check: %s", code)
	}
	v, err := open(bb, b.Key, rec, pub(ba.PublicKey()))
	if err != nil || v.(map[string]any)["deal"] != "peering" {
		t.Fatalf("open: %v %v", v, err)
	}
	if _, err := open(bc, b.Key, rec, pub(ba.PublicKey())); err == nil {
		t.Fatal("a third box key opened it")
	}
}

func TestCPUTime(t *testing.T) {
	for in, want := range map[string]float64{"0:01.50": 1.5, "12:00.00": 720, "1:02:03": 3723, "2-00:00:01": 172801} {
		if got := cpuTime(in); got != want {
			t.Errorf("cpuTime(%q) = %v, want %v", in, got, want)
		}
	}
	if d := dist([]float64{5, 1, 4, 2, 3}); d.P50 != 3 || d.Max != 5 || d.N != 5 {
		t.Fatalf("dist: %+v", d)
	}
}

// A small run end to end: three relay processes, a dozen players, every assertion of a quick run.
func TestSmallRun(t *testing.T) {
	if testing.Short() {
		t.Skip("starts relay processes and plays for half a minute")
	}
	o := parseFlags([]string{"--quick", "--servers", "3", "--clients", "12", "--duration", "25s", "--ramp", "2s",
		"--rank-every", "5s", "--nets-every", "10s", "--deal-every", "5s", "--announce-every", "10s", "--reconnect-every", "15s"})
	if code := run(o); code != 0 {
		t.Fatalf("exit %d", code)
	}
}

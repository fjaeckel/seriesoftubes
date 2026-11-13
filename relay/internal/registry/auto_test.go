package registry_test

import (
	"fmt"
	"slices"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	. "github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	"github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/shun"
)

func TestAutoEligible(t *testing.T) {
	now := int64(relaytest.Start)
	asOf := now / fed.Day * fed.Day
	listed := asOf - 31*fed.Day
	old := asOf - 15*fed.Day
	edge := asOf - fed.VoterAnswered
	files := map[string][]byte{}
	want := []string{}
	add := func(name, sync string, listed, answered *int64, ok bool) {
		op := relaytest.Key("op " + name)
		nk := relaytest.Key("node " + name)
		id, b := relaytest.FileSync(name, sync, op, nk, "wss://"+name+".example.org/fed", now-40*fed.Day, listed, answered, true)
		files[id+".json"] = b
		if ok {
			want = append(want, id)
		}
	}
	add("live", "open", &listed, &asOf, true)
	add("edge", "open", &listed, &edge, true)
	add("quiet", "open", &listed, &old, false)
	// Never answered: live from `listed` for 14 days, as long as the weekly job keeps the file.
	add("never", "open", &listed, nil, false)
	add("today", "open", &asOf, nil, true)
	add("listededge", "open", &edge, nil, true)
	add("listedold", "open", &old, nil, false)
	// No stamps at all: merged since the last weekly run, after its pull request passed the live check.
	add("fresh", "open", nil, nil, true)
	add("picky", "selective", &listed, &asOf, false)
	add("alone", "standalone", &listed, &asOf, false)
	b, skipped := Build(files, now)
	if len(skipped) > 0 {
		t.Fatal(skipped)
	}
	snap, err := ReadSnapshot(b, now)
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(want)
	if got := AutoEligible(snap); !slices.Equal(got, want) {
		t.Fatalf("eligible %v, want %v", got, want)
	}
	// Live for automatic sync is not a vote (10.7): of all these only the servers listed 31 days
	// ago that answered within 14 days vote, never one without both stamps.
	reg := shun.Registry{AsOf: snap.AsOf}
	for _, e := range snap.Entries {
		reg.Servers = append(reg.Servers, shun.Server{ID: e.ID, Operators: e.State.Operators, Listed: e.Listed, Answered: e.Answered})
	}
	voters := map[string]bool{}
	for _, v := range reg.Voters() {
		voters[v.ID] = true
	}
	for _, e := range snap.Entries {
		vote := e.Listed != nil && e.Answered != nil && *e.Listed == listed && *e.Answered >= edge
		if voters[e.ID] != vote {
			t.Fatalf("%s (listed %v, answered %v): voter %v", e.Name(), e.Listed, e.Answered, voters[e.ID])
		}
	}
	if len(voters) != 4 {
		t.Fatalf("%d voters, want live, edge, picky and alone", len(voters))
	}
}

func ids(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("s%04d", i)
	}
	return out
}

func TestAutoPeersAllUnderTheCap(t *testing.T) {
	list := ids(65)
	for _, self := range list {
		p := AutoPeers(list, self, 64)
		if len(p) != 64 || slices.Contains(p, self) {
			t.Fatalf("%s: %d peers", self, len(p))
		}
	}
	if AutoPeers(list, "nobody", 64) != nil {
		t.Fatal("a server not in the list has peers")
	}
	if AutoPeers([]string{"s"}, "s", 64) != nil {
		t.Fatal("a lone server has peers")
	}
}

// graph is every server's own view, as each computes it alone.
func graph(list []string, cap int) map[string][]string {
	g := map[string][]string{}
	for _, s := range list {
		g[s] = AutoPeers(list, s, cap)
	}
	return g
}

func diameter(t *testing.T, list []string, g map[string][]string) int {
	// The graph is circulant: every server sees the same distances, so a sample of sources does.
	d, step := 0, max(1, len(list)/40)
	for i := 0; i < len(list); i += step {
		s := list[i]
		dist := map[string]int{s: 0}
		q := []string{s}
		for len(q) > 0 {
			x := q[0]
			q = q[1:]
			for _, y := range g[x] {
				if _, ok := dist[y]; !ok {
					dist[y] = dist[x] + 1
					q = append(q, y)
				}
			}
		}
		if len(dist) != len(list) {
			t.Fatalf("not connected: %s reaches %d of %d", s, len(dist), len(list))
		}
		for _, v := range dist {
			d = max(d, v)
		}
	}
	return d
}

func TestAutoPeersOverTheCap(t *testing.T) {
	for _, c := range []struct{ n, cap, diam int }{{66, 64, 2}, {200, 64, 2}, {1000, 64, 3}, {5000, 64, 4}, {12, 8, 4}, {300, 24, 6}} {
		list := ids(c.n)
		g := graph(list, c.cap)
		for s, peers := range g {
			if len(peers) > c.cap || len(peers) == 0 {
				t.Fatalf("n=%d: %s has %d peers (cap %d)", c.n, s, len(peers), c.cap)
			}
			for _, p := range peers {
				// Both ends agree on every link, so exactly one of them dials it.
				if !slices.Contains(g[p], s) {
					t.Fatalf("n=%d: %s lists %s but not the other way", c.n, s, p)
				}
			}
		}
		_, l := AutoBase(c.n, c.cap)
		if d := diameter(t, list, g); d > l || d > c.diam {
			t.Fatalf("n=%d cap=%d: diameter %d (L %d, want at most %d)", c.n, c.cap, d, l, c.diam)
		}
	}
	if b, l := AutoBase(200, 64); b != 17 || l != 2 {
		t.Fatalf("base for 200: %d, %d", b, l)
	}
	if b, l := AutoBase(12, 8); b != 2 || l != 4 {
		t.Fatalf("base for 12 under 8: %d, %d", b, l)
	}
	// A cap too small even for base 2 still gets base 2: connected comes before the cap.
	if b, l := AutoBase(300, 16); b != 2 || l != 9 {
		t.Fatalf("base for 300 under 16: %d, %d", b, l)
	}
	// The worked example of the vector (federation/vectors/sync/003-auto-peers.json).
	if got := AutoPeers(ids(12), "s0000", 8); !slices.Equal(got, []string{"s0001", "s0002", "s0004", "s0008", "s0010", "s0011"}) {
		t.Fatalf("12 under 8: %v", got)
	}
	if !Dials("a", "b") || Dials("b", "a") {
		t.Fatal("the lower identity dials")
	}
}

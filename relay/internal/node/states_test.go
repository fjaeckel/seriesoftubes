package node_test

import (
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// stateRec is a signed live state (5.11): the fields of a stats record.
func stateRec(k *fed.Signer, t, pops int64, traffic ...map[string]any) map[string]any {
	tr := []any{}
	for _, e := range traffic {
		tr = append(tr, e)
	}
	return k.Seal("state", t, map[string]any{"mode": "normal", "pops": map[string]any{"fra": pops}, "traffic": tr, "tier1": false, "shareCountry": false})
}

func sendState(t *testing.T, c *client.Client, rec map[string]any) (*wire.Frame, error) {
	t.Helper()
	return c.Request(ctx(t), map[string]any{"m": "state", "rec": rec})
}

// nowBoard asks a board of now; it gives the rows as key -> value, in order, and the answer.
func nowBoard(t *testing.T, c *client.Client, board string) ([]string, *wire.Frame) {
	t.Helper()
	f := ask(t, c, map[string]any{"m": "rank", "board": board, "measure": "now", "division": "all"})
	var out []string
	rows, _ := f.Raw["rows"].([]any)
	for _, r := range rows {
		m := r.(map[string]any)
		v, _ := wire.Int(m["value"])
		out = append(out, fmt.Sprintf("%s=%d", m["key"].(string)[:4], v))
	}
	return out, f
}

// A node takes live states (feats says so), keeps the newest of each key in memory only, answers
// boards of now from them (the traffic board with the min() rule, a partner without a state
// counting 0), refuses what is not a state, rate-limits each connection, forgets quiet keys,
// and loses everything on a restart: nothing is stored.
func TestLiveStates(t *testing.T) {
	n := rt.New(t)
	s := n.Found("live", "open")
	x := s.Nodes[0]
	alice, bob, carol := rt.Key("alice"), rt.Key("bob"), rt.Key("carol")
	c := x.Client(nil)
	if !slices.Contains(c.Welcome.Feats, "state") {
		t.Fatalf("welcome does not list the state feature: %v", c.Welcome.Feats)
	}
	now := n.Clock.Unix()
	a1 := stateRec(alice, now, 3, map[string]any{"key": bob.Key, "in": int64(900), "out": int64(400)}, map[string]any{"key": carol.Key, "in": int64(50), "out": int64(70)})
	f, err := sendState(t, c, a1)
	if err != nil || f.M != "ack" || f.Raw["dup"] != false {
		t.Fatalf("state: %v %v", f, err)
	}
	// Bob reports less than Alice in one direction: min() takes it. Carol sends no state: 0.
	cb := x.Client(nil)
	if _, err := sendState(t, cb, stateRec(bob, now, 5, map[string]any{"key": alice.Key, "in": int64(300), "out": int64(2000)})); err != nil {
		t.Fatal(err)
	}
	// Past the snapshot the node may have taken as it started (it warms its boards).
	n.Clock.Add(3 * time.Second)
	rows, f := nowBoard(t, c, "pops")
	if fmt.Sprint(rows) != fmt.Sprint([]string{bob.Key[:4] + "=5", alice.Key[:4] + "=3"}) {
		t.Fatalf("pops now: %v", rows)
	}
	if at, _ := wire.Int(f.Raw["at"]); at != now+3 {
		t.Fatalf("ranks at: %v", f.Raw)
	}
	n.Clock.Add(3 * time.Second) // past the snapshot
	rows, f = nowBoard(t, c, "traffic")
	// Alice: in min(900, 2000) = 900, out min(400, 300) = 300 -> 900. Bob: in min(300, 400), out min(2000, 900) -> 900.
	if fmt.Sprint(rows) != fmt.Sprint([]string{alice.Key[:4] + "=900", bob.Key[:4] + "=900"}) && fmt.Sprint(rows) != fmt.Sprint([]string{bob.Key[:4] + "=900", alice.Key[:4] + "=900"}) {
		t.Fatalf("traffic now: %v", rows)
	}
	at, _ := wire.Int(f.Raw["at"])
	// rankwhy for now: Alice's state and her partner Bob's, from the same snapshot; no receipts.
	why, err := c.Collect(ctx(t), map[string]any{"m": "rankwhy", "board": "traffic", "measure": "now", "division": "all", "key": alice.Key, "at": at})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, it := range why {
		r := it["rec"].(map[string]any)
		got[r["kind"].(string)+" "+r["key"].(string)[:4]] = true
	}
	if len(why) != 2 || !got["state "+alice.Key[:4]] || !got["state "+bob.Key[:4]] {
		t.Fatalf("rankwhy now: %v", got)
	}
	// An older state changes nothing; the second right after is fine, the third rate limited.
	if f, err := sendState(t, c, stateRec(alice, now-5, 9)); err != nil || f.Raw["dup"] != true {
		t.Fatalf("older state: %v %v", f, err)
	}
	if _, err := sendState(t, c, stateRec(alice, now+1, 4)); code(err) != fed.RateLimited {
		t.Fatalf("third state at once: %v", err)
	}
	cc := x.Client(nil)
	// Not a state, a state that is too old, a state as a record to store.
	if _, err := sendState(t, cc, rt.Stats(carol, now, 1, false)); code(err) != fed.BadKind {
		t.Fatalf("stats in a state frame: %v", err)
	}
	if _, err := sendState(t, cc, stateRec(carol, now-fed.StateLife-1, 1)); code(err) != fed.TooOld {
		t.Fatalf("old state: %v", err)
	}
	cd := x.Client(nil)
	if _, err := cd.Put(ctx(t), stateRec(carol, now, 1)); code(err) != fed.BadKind {
		t.Fatalf("a state put as a record: %v", err)
	}
	if x.Count("state") != 0 {
		t.Fatal("a state was stored")
	}
	// Carol goes quiet after one state: gone from the board once StateLife has passed.
	if _, err := sendState(t, cd, stateRec(carol, now, 1)); err != nil {
		t.Fatal(err)
	}
	n.Clock.Add(3 * time.Second)
	if rows, _ := nowBoard(t, c, "pops"); len(rows) != 3 {
		t.Fatalf("three live: %v", rows)
	}
	n.Clock.Add(fed.StateLife * time.Second)
	if _, err := sendState(t, cb, stateRec(bob, n.Clock.Unix(), 6)); err != nil {
		t.Fatal(err)
	}
	if rows, _ := nowBoard(t, c, "pops"); fmt.Sprint(rows) != fmt.Sprint([]string{bob.Key[:4] + "=6"}) {
		t.Fatalf("quiet keys stay: %v", rows)
	}
	// A restart forgets every state: nothing was written.
	x.Restart()
	c = x.Client(nil)
	if rows, _ := nowBoard(t, c, "pops"); len(rows) != 0 {
		t.Fatalf("states after a restart: %v", rows)
	}
}

// Live states reach the other nodes of the server and the servers it syncs players with within a
// few seconds, two hops on; a state already known is not passed on again.
func TestLiveStatesPropagate(t *testing.T) {
	defer node.SetStatesEvery(200 * time.Millisecond)()
	n := rt.New(t)
	a := n.Found("state-a", "open")
	b := n.Found("state-b", "open")
	d := n.Found("state-d", "open")
	neighbours(a, b)
	neighbours(b, d)
	// The sessions are up when an announce has crossed both hops.
	id := announce(t, a, "ay")
	rt.Eventually(t, "records reach the second hop", func() bool { return d.Nodes[0].Has(id) })
	alice := rt.Key("alice")
	c := a.Nodes[0].Client(nil)
	now := n.Clock.Unix()
	if _, err := sendState(t, c, stateRec(alice, now, 4)); err != nil {
		t.Fatal(err)
	}
	cd := d.Nodes[0].Client(nil)
	start := time.Now()
	rt.Eventually(t, "a state reaches a server two hops away", func() bool {
		n.Clock.Add(2 * time.Second) // a new snapshot each time
		rows, _ := nowBoard(t, cd, "pops")
		return fmt.Sprint(rows) == fmt.Sprint([]string{alice.Key[:4] + "=4"})
	})
	t.Logf("two hops in %v", time.Since(start).Round(time.Millisecond))
	// A newer state replaces it everywhere.
	c2 := a.Nodes[0].Client(nil)
	if _, err := sendState(t, c2, stateRec(alice, n.Clock.Unix(), 7)); err != nil {
		t.Fatal(err)
	}
	rt.Eventually(t, "the newer state replaces it", func() bool {
		n.Clock.Add(2 * time.Second)
		rows, _ := nowBoard(t, cd, "pops")
		return fmt.Sprint(rows) == fmt.Sprint([]string{alice.Key[:4] + "=7"})
	})
	// Each server took Alice's two states once, whatever came back the other way.
	time.Sleep(500 * time.Millisecond)
	if got := b.Nodes[0].Metrics.Get("relay_states_total", "node"); got != 2 {
		t.Fatalf("the middle server took %v states from nodes, want 2", got)
	}
	if got := a.Nodes[0].Metrics.Get("relay_states_total", "node"); got != 0 {
		t.Fatalf("the first server took back %v of its own states", got)
	}
}

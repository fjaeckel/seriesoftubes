package node_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// ask sends a leaderboard request, waiting out rate_limited while the node builds its boards.
func ask(t *testing.T, c *client.Client, m map[string]any) *wire.Frame {
	t.Helper()
	for i := 0; ; i++ {
		f, err := c.Request(ctx(t), m)
		var e *client.ErrFrame
		if errors.As(err, &e) && e.Code == fed.RateLimited && i < 100 {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		if err != nil {
			t.Fatalf("%v: %v", m, err)
		}
		return f
	}
}

func rowKeys(f *wire.Frame) []string {
	var out []string
	rows, _ := f.Raw["rows"].([]any)
	for _, r := range rows {
		out = append(out, r.(map[string]any)["key"].(string))
	}
	return out
}

// The node ranks: the top rows of the slice asked for, the asker's own row with its rank, names
// from announces, hidden and excluded networks left out, the filters, facets and nets.
func TestRankAnswers(t *testing.T) {
	n := rt.New(t)
	s := n.Found("ranking", "open")
	x := s.Nodes[0]
	t0 := n.Clock.Unix()
	keys := []*fed.Signer{rt.Key("alice"), rt.Key("bob"), rt.Key("carol"), rt.Key("dave")}
	for i, k := range keys {
		if i != 2 {
			x.MustPut(rt.Stats(k, t0, int64(10-i), false))
		}
		x.MustPut(rt.Announce(k, t0, fmt.Sprint("Net ", i)))
	}
	// Carol reports traffic with Alice.
	x.MustPut(keys[2].Seal("stats", t0, map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(8)}, "traffic": []any{map[string]any{"key": keys[0].Key, "in": int64(5), "out": int64(9)}}, "tier1": true, "shareCountry": false}))
	// Dave is hidden by the server, his name too.
	x.MustPut(s.Op.Seal("hide", t0, map[string]any{"server": s.ID, "hide": []any{keys[3].Key}, "names": []any{keys[1].Key}, "refuse": []any{}}))
	n.Clock.Add(10 * time.Minute)
	c := x.Client(nil)
	if _, err := c.Auth(ctx(t), keys[1], n.Clock.Unix()); err != nil {
		t.Fatal(err)
	}
	f := ask(t, c, map[string]any{"m": "rank", "board": "pops", "measure": "total", "division": "all"})
	if f.M != "ranks" || fmt.Sprint(rowKeys(f)) != fmt.Sprint([]string{keys[0].Key, keys[1].Key, keys[2].Key}) {
		t.Fatalf("ranks: %v", f.Raw)
	}
	if n, _ := wire.Int(f.Raw["n"]); n != 3 {
		t.Fatalf("n: %d", n)
	}
	rows := f.Raw["rows"].([]any)
	if r := rows[0].(map[string]any); r["name"] != "Net 0" || r["home"] != "DE" {
		t.Fatalf("row: %v", r)
	}
	if _, named := rows[1].(map[string]any)["name"]; named {
		t.Fatal("a name the server hides was sent")
	}
	me := f.Raw["me"].(map[string]any)
	if rk, _ := wire.Int(me["rank"]); rk != 2 {
		t.Fatalf("me: %v", me)
	}
	// One row, a filter that leaves the asker out, a bad filter.
	f = ask(t, c, map[string]any{"m": "rank", "board": "pops", "measure": "total", "division": "all", "n": 1,
		"filters": map[string]any{"tier1": true}})
	if fmt.Sprint(rowKeys(f)) != fmt.Sprint([]string{keys[2].Key}) || f.Raw["me"].(map[string]any)["rank"] != nil {
		t.Fatalf("tier1: %v", f.Raw)
	}
	if _, err := c.Request(ctx(t), map[string]any{"m": "rank", "board": "pops", "measure": "total", "division": "all", "filters": map[string]any{"from": "germany"}}); code(err) != fed.BadField {
		t.Fatalf("bad filter: %v", err)
	}
	if _, err := c.Request(ctx(t), map[string]any{"m": "rank", "board": "money", "measure": "total", "division": "all"}); code(err) != fed.BadField {
		t.Fatalf("bad board: %v", err)
	}
	f = ask(t, c, map[string]any{"m": "facets"})
	if homes := f.Raw["homes"].([]any); len(homes) != 1 || homes[0] != "DE" {
		t.Fatalf("facets: %v", f.Raw)
	}
	// Nets: Alice asks what Carol says about her.
	ca := x.Client(nil)
	if _, err := ca.Auth(ctx(t), keys[0], n.Clock.Unix()); err != nil {
		t.Fatal(err)
	}
	f = ask(t, ca, map[string]any{"m": "nets", "keys": []any{keys[2].Key, keys[3].Key}})
	nets, reps := f.Raw["nets"].([]any), f.Raw["reports"].([]any)
	if len(nets) != 1 || nets[0].(map[string]any)["tier1"] != true || len(reps) != 1 || reps[0].(map[string]any)["key"] != keys[2].Key {
		t.Fatalf("nets: %v", f.Raw)
	}
	// rankwhy: Carol's records and announce, and on the traffic board those of the network she reports (Alice).
	why, err := c.Collect(ctx(t), map[string]any{"m": "rankwhy", "board": "traffic", "measure": "total", "division": "all", "key": keys[2].Key})
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]int{}
	for _, it := range why {
		r := it["rec"].(map[string]any)
		kinds[r["kind"].(string)+" "+r["key"].(string)[:4]]++
		if len(it["rcpt"].([]any)) == 0 {
			t.Fatal("a record without its receipt")
		}
	}
	if kinds["stats "+keys[2].Key[:4]] != 1 || kinds["stats "+keys[0].Key[:4]] != 1 || kinds["announce "+keys[2].Key[:4]] != 1 || len(why) != 3 {
		t.Fatalf("rankwhy: %v", kinds)
	}
	if _, err := c.Request(ctx(t), map[string]any{"m": "rankwhy", "board": "pops", "measure": "total", "division": "all", "key": "nope"}); code(err) != fed.BadKey {
		t.Fatalf("rankwhy bad key: %v", err)
	}
	// The status command ranks the same.
	all, err := x.R.Board("pops", "total", "all")
	if err != nil || len(all) != 3 || all[0].Key != keys[0].Key {
		t.Fatalf("status board: %v %v", all, err)
	}
	// A burst from one connection is rate limited, not answered at any cost.
	limited := 0
	for range 12 {
		if _, err := c.Request(ctx(t), map[string]any{"m": "rank", "board": "traffic", "measure": "growth", "division": "ai"}); code(err) == fed.RateLimited {
			limited++
		}
	}
	if limited == 0 {
		t.Fatal("twelve rankings at once were not rate limited")
	}
}

// The node counts rankings answered from a slice already worked out (relay_rank_answers_total):
// the first ask of a slice in a state is a miss, the same slice asked again a hit.
func TestRankCacheMetric(t *testing.T) {
	n := rt.New(t)
	s := n.Found("cached", "open")
	x := s.Nodes[0]
	x.MustPut(rt.Stats(rt.Key("alice"), n.Clock.Unix(), 3, false))
	n.Clock.Add(10 * time.Minute)
	q := map[string]any{"m": "rank", "board": "pops", "measure": "total", "division": "human"}
	ask(t, x.Client(nil), q)
	if hit, miss := x.Metrics.Get("relay_rank_answers_total", "hit"), x.Metrics.Get("relay_rank_answers_total", "miss"); hit != 0 || miss != 1 {
		t.Fatalf("first ask: hit %v miss %v", hit, miss)
	}
	ask(t, x.Client(nil), q)
	if hit, miss := x.Metrics.Get("relay_rank_answers_total", "hit"), x.Metrics.Get("relay_rank_answers_total", "miss"); hit != 1 || miss != 1 {
		t.Fatalf("second ask: hit %v miss %v", hit, miss)
	}
}

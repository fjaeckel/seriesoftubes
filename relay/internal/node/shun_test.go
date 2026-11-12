package node_test

import (
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

func vote(n *rt.Net, l rt.Listed, target string, reason string) map[string]any {
	st := &ops.State{Server: l.ID}
	rec, _ := ops.Shun(st, l.Op, target, reason, n.Clock.Unix())
	return rec
}

func TestShunning(t *testing.T) {
	n := rt.New(t)
	a := n.Found("shunner", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	asOf := now - now%fed.Day
	reg, voters := rt.Registry(6, asOf, now)
	if err := x.R.SetRegistry(reg); err != nil {
		t.Fatal(err)
	}
	mallory := rt.Key("mallory")
	old := rt.Announce(mallory, now, "Spam Spam")
	x.MustPut(old)
	c := x.Client(nil)

	// Four registered votes: below the minimum of five. A vote of a server nobody knows could
	// never count, so it is refused rather than stored and passed on (8.3).
	for _, v := range voters[:4] {
		x.MustPut(vote(n, v, mallory.Key, "spam"))
	}
	stranger := rt.Listed{ID: rt.ID(rt.Announce(rt.Key("x"), now, "x")), Op: rt.Key("stranger op")}
	if code := x.Put(vote(n, stranger, mallory.Key, "spam")); code != fed.UnknownSrv {
		t.Fatalf("vote of an unknown server: %q", code)
	}
	// A vote for a known server signed by someone who is not its operator is refused (8.3).
	if code := x.Put(vote(n, rt.Listed{ID: voters[5].ID, Op: rt.Key("not their op")}, mallory.Key, "spam")); code != fed.NotOperator {
		t.Fatalf("vote by a non-operator: %q", code)
	}
	if res := x.R.Tally(mallory.Key); res.Shunned || res.Votes != 4 || res.Voters != 6 || res.Need != 5 {
		t.Fatalf("tally %+v", res)
	}
	n.Clock.Add(time.Second)
	if _, err := c.Put(ctx(t), rt.Stats(mallory, n.Clock.Unix(), 1, false)); err != nil {
		t.Fatalf("not yet shunned: %v", err)
	}
	// The fifth registered server votes: shunned everywhere this server reaches.
	x.MustPut(vote(n, voters[4], mallory.Key, "offensive_name"))
	res := x.R.Tally(mallory.Key)
	if !res.Shunned || res.Reasons["spam"] != 4 || res.Reasons["offensive_name"] != 1 {
		t.Fatalf("tally %+v", res)
	}
	n.Clock.Add(5 * time.Minute)
	if _, err := c.Put(ctx(t), rt.Stats(mallory, n.Clock.Unix(), 2, false)); code(err) != fed.Shunned {
		t.Fatalf("shunned key's record: %v", err)
	}
	items, _ := c.Collect(ctx(t), map[string]any{"m": "fetch", "ids": []any{rt.ID(old)}})
	if len(items) != 0 {
		t.Fatal("a shunned key's old record is still passed on")
	}
	// One server withdraws: below the threshold, but the shun only lifts after 7 days below.
	x.MustPut(vote(n, voters[4], mallory.Key, ""))
	if !x.R.Tally(mallory.Key).Shunned {
		t.Fatal("lifted at once")
	}
	n.Clock.Add(7*24*time.Hour - time.Second)
	if !x.R.Tally(mallory.Key).Shunned {
		t.Fatal("lifted before 7 days")
	}
	n.Clock.Add(time.Second)
	if x.R.Tally(mallory.Key).Shunned {
		t.Fatal("not lifted after 7 days below the threshold")
	}
	// Votes expire after 90 days.
	for _, v := range voters[:5] {
		x.MustPut(vote(n, v, mallory.Key, "spam"))
	}
	if !x.R.Tally(mallory.Key).Shunned {
		t.Fatal("five votes again")
	}
	n.Clock.Add(90*24*time.Hour + 7*24*time.Hour)
	if x.R.Tally(mallory.Key).Shunned {
		t.Fatal("votes did not expire")
	}
}

func TestShunVotesAlwaysTravel(t *testing.T) {
	n := rt.New(t)
	now := n.Clock.Unix()
	a := n.Found("voting", "open")
	b := n.Found("listening", "open")
	// b keeps votes of registry servers only (8.3): a is registered.
	asOf := now - now%fed.Day
	listed := asOf - 31*fed.Day
	id, file := rt.FileFor("voting", a.Op, a.Nodes[0].Key, a.Nodes[0].URL, now, &listed, &asOf, true)
	if id != a.ID {
		t.Fatal("registry file of another server")
	}
	snap, skipped := registry.Build(map[string][]byte{id + ".json": file}, now)
	if len(skipped) > 0 {
		t.Fatal(skipped)
	}
	// b takes nothing but the catalog from a: shun votes still arrive, player records do not.
	bx := b.Nodes[0]
	if err := bx.R.SetRegistry(snap); err != nil {
		t.Fatal(err)
	}
	bc := *bx.Cfg
	bc.Neighbours = []config.Neighbour{{URL: a.Nodes[0].URL, Take: []string{"catalog"}}}
	bx.Cfg = &bc
	bx.R.Reload(&bc)
	rec, _ := ops.Shun(a.Nodes[0].State(), a.Op, rt.Key("mallory").Key, "abuse", n.Clock.Unix())
	a.Nodes[0].MustPut(rec)
	ann := announce(t, a, "player")
	rt.Eventually(t, "the vote reaches b", func() bool { return bx.Has(rt.ID(rec)) })
	time.Sleep(300 * time.Millisecond)
	if bx.Has(ann) {
		t.Fatal("b took a player record it does not take")
	}
}

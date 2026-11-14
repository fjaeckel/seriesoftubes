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

func report(k *fed.Signer, t int64, server, target, reason string) map[string]any {
	return k.Seal("report", t, map[string]any{"server": server, "target": target, "reason": reason})
}

// A player's report reaches only the sessions that proved an operator key of its server (5.10,
// 9.3): live, in a sub's backlog and by fetch. Neither the reporter nor anyone else gets it.
func TestReportsOnlyToOperators(t *testing.T) {
	n := rt.New(t)
	a := n.Found("watchful", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	bob, mallory := rt.Key("bob"), rt.Key("mallory")
	x.MustPut(rt.Announce(bob, now, "Bob Net"))

	type who struct {
		name string
		c    *client.Client
		recs <-chan *wire.Frame
	}
	join := func(name string, k *fed.Signer) who {
		t.Helper()
		c := x.Client(nil)
		if k != nil {
			if _, err := c.Auth(ctx(t), k, now); err != nil {
				t.Fatal(err)
			}
		}
		_, ch, err := c.Start(ctx(t), map[string]any{"m": "sub", "kinds": []any{"report", "announce"}, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		for done := false; !done; { // the backlog (Bob's announce)
			select {
			case f := <-ch:
				done = f.Raw["more"] != true
			case <-time.After(5 * time.Second):
				t.Fatal("no backlog")
			}
		}
		return who{name, c, ch}
	}
	op, rep, other, anon := join("operator", a.Op), join("bob", bob), join("mallory", mallory), join("nobody", nil)

	rec := report(bob, now, a.ID, mallory.Key, "spam")
	if _, err := rep.c.Put(ctx(t), rec); err != nil {
		t.Fatalf("report: %v", err)
	}
	x.MustPut(rt.Announce(rt.Key("carol"), now, "Carol Net")) // public: everyone gets it after the report
	kinds := func(w who) []string {
		t.Helper()
		var got []string
		deadline := time.After(5 * time.Second)
		for !slices.Contains(got, "announce") {
			select {
			case f := <-w.recs:
				for _, it := range f.Raw["items"].([]any) {
					got = append(got, it.(map[string]any)["rec"].(map[string]any)["kind"].(string))
				}
			case <-deadline:
				t.Fatalf("%s: no marker, got %v", w.name, got)
			}
		}
		return got
	}
	if got := kinds(op); !slices.Equal(got, []string{"report", "announce"}) {
		t.Fatalf("operator live: %v", got)
	}
	for _, w := range []who{rep, other, anon} {
		if got := kinds(w); !slices.Equal(got, []string{"announce"}) {
			t.Fatalf("%s live: %v", w.name, got)
		}
		fetched, err := w.c.Collect(ctx(t), map[string]any{"m": "fetch", "ids": []any{rt.ID(rec)}})
		if err != nil || len(fetched) != 0 {
			t.Fatalf("%s fetch: %d %v", w.name, len(fetched), err)
		}
		backlog, err := w.c.Collect(ctx(t), map[string]any{"m": "sub", "kinds": []any{"report"}, "since": ""})
		if err != nil || len(backlog) != 0 {
			t.Fatalf("%s backlog: %d %v", w.name, len(backlog), err)
		}
	}
	fetched, err := op.c.Collect(ctx(t), map[string]any{"m": "fetch", "ids": []any{rt.ID(rec)}})
	if err != nil || len(fetched) != 1 {
		t.Fatalf("operator fetch: %d %v", len(fetched), err)
	}
	backlog, err := op.c.Collect(ctx(t), map[string]any{"m": "sub", "kinds": []any{"report"}, "since": ""})
	if err != nil || len(backlog) != 1 {
		t.Fatalf("operator backlog: %d %v", len(backlog), err)
	}
}

// Reports travel between the nodes of their server, and never to another server, whatever its
// sync policy; a report naming another server is not taken (5.10, 9.4).
func TestReportsStayOnTheirServer(t *testing.T) {
	n := rt.New(t)
	a := n.Found("home", "open")
	a2 := n.AddNode(a, "home2")
	b := n.Found("away", "open")
	neighbours(b, a)
	x := a.Nodes[0]
	now := n.Clock.Unix()
	bob, mallory := rt.Key("bob"), rt.Key("mallory")
	x.MustPut(rt.Announce(bob, now, "Bob Net"))
	rec := report(bob, now, a.ID, mallory.Key, "abuse")
	x.MustPut(rec)
	if code := x.Put(report(bob, now, b.ID, mallory.Key, "abuse")); code != fed.NotNode {
		t.Fatalf("a report for another server: %q", code)
	}
	if code := b.Nodes[0].Put(report(bob, now, a.ID, rt.Key("eve").Key, "abuse")); code != fed.NotNode {
		t.Fatalf("a report for another server, there: %q", code)
	}
	rt.Eventually(t, "the report at the second node", func() bool { return a2.Has(rt.ID(rec)) })
	marker := announce(t, a, "after")
	rt.Eventually(t, "a later record at the other server", func() bool { return b.Nodes[0].Has(marker) })
	time.Sleep(300 * time.Millisecond)
	if b.Nodes[0].Count("report") != 0 {
		t.Fatal("a report reached another server")
	}
}

// What a node keeps: one report per reporter and target (the newest), at most so many new ones per
// reporter and day and in all, only from networks it knows, 30 days (5.10, 13).
func TestReportLimitsAndRetention(t *testing.T) {
	defer node.SetReportLimits(3, 5)()
	defer node.SetReportRoom(0, int64(7*fed.Day), 60)() // no room set aside: these limits alone
	n := rt.New(t)
	a := n.Found("careful", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	bob, mallory, eve := rt.Key("bob"), rt.Key("mallory"), rt.Key("eve")
	if code := x.Put(report(bob, now, a.ID, mallory.Key, "spam")); code != fed.Refused {
		t.Fatalf("a report from a network this node never heard: %q", code)
	}
	x.MustPut(rt.Announce(bob, now, "Bob Net"))
	if code := x.Put(report(bob, now, a.ID, bob.Key, "spam")); code != fed.BadField {
		t.Fatalf("a report about oneself: %q", code)
	}
	if code := x.Put(bob.Seal("report", now, map[string]any{"server": a.ID, "target": mallory.Key, "reason": "spam", "note": "rude"})); code != fed.UnknownField {
		t.Fatalf("free text: %q", code)
	}
	if code := x.Put(report(bob, now, a.ID, mallory.Key, "rude")); code != fed.BadField {
		t.Fatalf("a reason not on the list: %q", code)
	}
	first := report(bob, now, a.ID, mallory.Key, "spam")
	x.MustPut(first)
	newer := report(bob, now+5, a.ID, mallory.Key, "offensive_name")
	x.MustPut(newer)
	if x.Has(rt.ID(first)) || x.Count("report") != 1 {
		t.Fatal("the older report of the same target stayed")
	}
	if code := x.Put(report(bob, now+1, a.ID, mallory.Key, "cheating")); code != fed.Refused {
		t.Fatalf("an older report than the one kept: %q", code)
	}
	x.MustPut(report(bob, now, a.ID, eve.Key, "spam"))
	x.MustPut(report(bob, now, a.ID, rt.Key("t3").Key, "spam"))
	if code := x.Put(report(bob, now, a.ID, rt.Key("t4").Key, "spam")); code != fed.TooMany {
		t.Fatalf("a fourth target in a day: %q", code)
	}
	// Replacing one already kept is not a new report.
	x.MustPut(report(bob, now+6, a.ID, mallory.Key, "abuse"))
	// A day on, the reporter may report again, until the node keeps as many as it will.
	n.Clock.Add(fed.Day*time.Second + time.Second)
	later := n.Clock.Unix()
	x.MustPut(report(bob, later, a.ID, rt.Key("t4").Key, "spam"))
	x.MustPut(report(bob, later, a.ID, rt.Key("t5").Key, "spam"))
	if code := x.Put(report(bob, later, a.ID, rt.Key("t6").Key, "spam")); code != fed.TooMany {
		t.Fatalf("over the node's total: %q", code)
	}
	if x.Count("report") != 5 {
		t.Fatalf("kept %d reports", x.Count("report"))
	}
	// Kept 30 days, also across a restart.
	x.Restart()
	if x.Count("report") != 5 {
		t.Fatalf("after a restart: %d", x.Count("report"))
	}
	n.Clock.Add(29 * fed.Day * time.Second)
	x.R.GC()
	if x.Count("report") != 3 { // the newest about mallory, and the two of the second day
		t.Fatalf("after 30 days of the first: %d left", x.Count("report"))
	}
	n.Clock.Add(2 * fed.Day * time.Second)
	x.R.GC()
	if x.Count("report") != 0 {
		t.Fatalf("after 30 days of the last: %d left", x.Count("report"))
	}
}

// Keys cost nothing to make: reporters without history here cannot fill the reports a node keeps.
// Room is kept for reporters with history, who take the place of the newest key's oldest report.
func TestReportsKeepRoomForReportersWithHistory(t *testing.T) {
	defer node.SetReportLimits(20, 4)()
	defer node.SetReportRoom(1, int64(7*fed.Day), 60)()
	n := rt.New(t)
	a := n.Found("busy", "open")
	x := a.Nodes[0]
	elder := rt.Key("elder")
	x.MustPut(rt.Announce(elder, n.Clock.Unix(), "Old Net"))
	n.Clock.Add(8 * fed.Day * time.Second)
	now := n.Clock.Unix()
	fresh := []*fed.Signer{rt.Key("fresh 1"), rt.Key("fresh 2")}
	for _, k := range fresh {
		x.MustPut(rt.Announce(k, now, "New"))
	}
	var first map[string]any
	for i := range 3 {
		rec := report(fresh[i%2], now+int64(i), a.ID, rt.Key(fmt.Sprint("target ", i)).Key, "spam")
		if i == 0 {
			first = rec
		}
		x.MustPut(rec)
	}
	if code := x.Put(report(fresh[1], now, a.ID, rt.Key("target 9").Key, "spam")); code != fed.TooMany {
		t.Fatalf("new keys past their share: %q", code)
	}
	x.MustPut(report(elder, now, a.ID, rt.Key("target 10").Key, "spam"))
	x.MustPut(report(elder, now, a.ID, rt.Key("target 11").Key, "spam")) // full: a new key's report makes way
	if x.Count("report") != 4 {
		t.Fatalf("kept %d reports, want 4", x.Count("report"))
	}
	if x.Has(rt.ID(first)) == x.Has(rt.ID(report(fresh[1], now+1, a.ID, rt.Key("target 1").Key, "spam"))) {
		t.Fatal("exactly one new key's report should have made way")
	}
}

// A game's reports also count by its address.
func TestReportsPerAddress(t *testing.T) {
	defer node.SetReportRoom(-1, int64(7*fed.Day), 2)()
	n := rt.New(t)
	a := n.Found("addr", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	for i := range 3 {
		k := rt.Key(fmt.Sprint("reporter ", i))
		x.MustPut(rt.Announce(k, now, "Net"))
		_, err := x.Client(from("203.0.113.5")).Put(ctx(t), report(k, now, a.ID, rt.Key("target").Key, "spam"))
		if i < 2 && err != nil || i == 2 && code(err) != fed.RateLimited {
			t.Fatalf("report %d from one address: %v", i, err)
		}
	}
}

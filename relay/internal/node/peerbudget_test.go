package node_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// Records a made-up server brings to an honest registry server V and that V passes on to W carry
// V's receipt: W does not charge them to V again, so V's own players are never refused at W
// because of what V merely forwarded.
func TestForwardedRecordsDoNotDrainNeighbourBudget(t *testing.T) {
	n := rt.New(t)
	v := n.Found("honest-v", "open")
	w := n.Found("honest-w", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{v, w}), v, w)
	budgets(w.Nodes[0], func(b *config.Budgets) { b.NewKeysPerPeer = 5 })
	neighbours(v, w)
	a := n.Found("made-up", "open")
	neighbours(a, v)
	now := n.Clock.Unix()
	for i := range 5 {
		a.Nodes[0].MustPut(rt.Announce(rt.Key(fmt.Sprint("junk", i)), now, "Junk"))
	}
	rt.Eventually(t, "junk reached W", func() bool { return w.Nodes[0].Count("announce") >= 5 })
	honest := rt.Announce(rt.Key("honest player"), now, "Honest")
	if _, err := v.Nodes[0].Client(from("198.51.100.20")).Put(ctx(t), honest); err != nil {
		t.Fatal(err)
	}
	rt.Eventually(t, "W holds V's player", func() bool { return w.Nodes[0].Has(rt.ID(honest)) })
}

// Servers outside the registry share one budget (their identities cost nothing to make up); what
// a budget refused is asked for again once it has refilled.
func TestUnlistedServersShareOneBudgetAndRetry(t *testing.T) {
	defer node.SetRetryEvery(100 * time.Millisecond)()
	n := rt.New(t)
	w := n.Found("w", "open")
	wx := w.Nodes[0]
	budgets(wx, func(b *config.Budgets) { b.NewKeysPerPeer = 3 })
	a1 := n.Found("made-up-1", "open")
	a2 := n.Found("made-up-2", "open")
	neighbours(a1, w)
	now := n.Clock.Unix()
	for i := range 3 {
		a1.Nodes[0].MustPut(rt.Announce(rt.Key(fmt.Sprint("a1 junk", i)), now, "Junk"))
	}
	rt.Eventually(t, "a1's records reached W", func() bool { return wx.Count("announce") >= 3 })
	late := rt.Announce(rt.Key("a2 player"), now, "Late")
	a2.Nodes[0].MustPut(late)
	neighbours(a2, w)
	rt.Eventually(t, "the shared budget refused a2's record", func() bool {
		return wx.Metrics.Get("relay_budget_refused_total", "peer_keys") >= 1
	})
	if wx.Has(rt.ID(late)) {
		t.Fatal("a second made-up server had a budget of its own")
	}
	n.Clock.Add(time.Hour) // the budget refills
	rt.Eventually(t, "the refused record asked for again", func() bool { return wx.Has(rt.ID(late)) })
}

// A peer verified by its own entry that the catalog had no room to keep is still a server this
// node does not know: it counts against the sessions such servers may have.
func TestVerifiedButUnknownPeersBounded(t *testing.T) {
	defer node.SetCatalogLimits(0, 512)()
	defer node.SetMaxUnverified(1)()
	n := rt.New(t)
	w := n.Found("w", "open")
	a1 := n.Found("made-up-1", "open")
	a2 := n.Found("made-up-2", "open")
	neighbours(a1, w)
	rt.Eventually(t, "a1 has a session", func() bool { return w.Nodes[0].R.NodeSessions() == 1 })
	time.Sleep(300 * time.Millisecond) // a1 verified by its entry
	neighbours(a2, w)
	time.Sleep(2 * time.Second)
	if got := w.Nodes[0].R.NodeSessions(); got != 1 {
		t.Fatalf("%d sessions with servers W does not know, want 1", got)
	}
}

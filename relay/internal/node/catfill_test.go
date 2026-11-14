package node_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// Servers outside the registry cost nothing to make up: their entries never keep a registry
// server's out of a full catalog (the oldest of theirs makes way), and they have a bound of their own.
func TestCatalogFullOfUnlistedTakesRegistryServer(t *testing.T) {
	t.Cleanup(node.SetCatalogLimits(3, 512))
	n := rt.New(t)
	v := n.Found("victim", "open")
	var made []*rt.Server
	for i := range 3 {
		n.Clock.Add(time.Second) // seen in this order
		m := n.Found(fmt.Sprint("made-up ", i), "open")
		made = append(made, m)
		neighbours(m, v)
		rt.Eventually(t, "made-up entry kept", func() bool { return v.Nodes[0].R.InCatalog(m.ID) })
	}
	l := n.Found("listed", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{v, l}), v, l)
	neighbours(l, v)
	rt.Eventually(t, "the registry server's entry kept", func() bool { return v.Nodes[0].R.InCatalog(l.ID) })
	if v.Nodes[0].R.InCatalog(made[0].ID) {
		t.Fatal("the oldest made-up entry was not the one dropped")
	}
}

func TestCatalogBoundsUnlistedEntries(t *testing.T) {
	t.Cleanup(node.SetCatalogUnlisted(2))
	n := rt.New(t)
	v := n.Found("victim", "open")
	var made []*rt.Server
	for i := range 3 {
		m := n.Found(fmt.Sprint("made-up ", i), "open")
		made = append(made, m)
		neighbours(m, v)
		if i < 2 {
			rt.Eventually(t, "made-up entry kept", func() bool { return v.Nodes[0].R.InCatalog(m.ID) })
		}
	}
	rt.Eventually(t, "every made-up server has a session", func() bool { return v.Nodes[0].R.NodeSessions() == 3 })
	l := n.Found("listed", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{v, l}), v, l)
	neighbours(l, v)
	rt.Eventually(t, "the registry server's entry kept", func() bool { return v.Nodes[0].R.InCatalog(l.ID) })
	if v.Nodes[0].R.InCatalog(made[2].ID) {
		t.Fatal("more unlisted entries than their bound were kept")
	}
}

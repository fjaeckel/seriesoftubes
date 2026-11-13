package node_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// neighbours points a server's first node at other servers' first nodes.
func neighbours(s *rt.Server, to ...*rt.Server) {
	x := s.Nodes[0]
	c := *x.Cfg
	c.Neighbours = nil
	for _, o := range to {
		c.Neighbours = append(c.Neighbours, config.Neighbour{URL: o.Nodes[0].URL})
	}
	x.Cfg = &c
	x.R.Reload(&c)
}

func announce(t *testing.T, s *rt.Server, name string) string {
	k := rt.Key(name)
	rec := rt.Announce(k, s.Nodes[0].Net.Clock.Unix(), name)
	s.Nodes[0].MustPut(rec)
	return rt.ID(rec)
}

func TestSyncPolicies(t *testing.T) {
	n := rt.New(t)
	a := n.Found("open-a", "open")
	b := n.Found("open-b", "open")
	c := n.Found("lonely", "standalone")
	d := n.Found("picky", "selective")
	e := n.Found("pickier", "selective")
	// d lists a; e lists nobody.
	dc := *d.Nodes[0].Cfg
	dc.Selective = []string{a.ID}
	d.Nodes[0].Cfg = &dc
	d.Nodes[0].R.Reload(&dc)
	neighbours(a, b, c, d, e)

	fromB, fromC, fromD, fromE := announce(t, b, "bee"), announce(t, c, "sea"), announce(t, d, "dee"), announce(t, e, "eee")
	fromA := announce(t, a, "ay")
	rt.Eventually(t, "open servers sync both ways", func() bool { return a.Nodes[0].Has(fromB) && b.Nodes[0].Has(fromA) })
	rt.Eventually(t, "selective server that lists a syncs", func() bool { return a.Nodes[0].Has(fromD) && d.Nodes[0].Has(fromA) })
	// Give the refused sessions time to have happened, then check nothing crossed.
	time.Sleep(500 * time.Millisecond)
	if a.Nodes[0].Has(fromC) || c.Nodes[0].Has(fromA) {
		t.Fatal("a standalone server took or sent records")
	}
	if a.Nodes[0].Has(fromE) || e.Nodes[0].Has(fromA) {
		t.Fatal("a selective server synced with a server not on its list")
	}
	if !strings.Contains(c.Nodes[0].Log.String(), "refused by policy") || !strings.Contains(a.Nodes[0].Log.String(), "code=policy") {
		t.Fatalf("standalone refusal not seen in the logs:\n%s", c.Nodes[0].Log.String())
	}
	// An open server that is told the other side is standalone does not even keep trying it.
}

func TestRecordThroughTwoPathsStoredOnce(t *testing.T) {
	n := rt.New(t)
	a := n.Found("path-a", "open")
	b := n.Found("path-b", "open")
	c := n.Found("path-c", "open")
	neighbours(a, b, c)
	neighbours(b, c)
	id := announce(t, a, "twice")
	rt.Eventually(t, "record at c", func() bool { return c.Nodes[0].Has(id) })
	rt.Eventually(t, "record at b", func() bool { return b.Nodes[0].Has(id) })
	time.Sleep(300 * time.Millisecond)
	lines := 0
	files, _ := filepath.Glob(filepath.Join(c.Nodes[0].Dir, "log", "*.jsonl"))
	for _, f := range files {
		data, _ := os.ReadFile(f)
		lines += strings.Count(string(data), id)
	}
	if lines != 1 {
		t.Fatalf("record written %d times at c", lines)
	}
}

// Two servers that list each other as neighbours keep one session (found by scripts/fed-e2e.js: they had one each
// way, and records were pushed twice), the one the lower identity dialled. A node's classes for a neighbour hold on
// it whichever side dialled, not the defaults for servers that are not neighbours.
func TestNeighbourClassesHoldBothWays(t *testing.T) {
	n := rt.New(t)
	a := n.Found("both-a", "open")
	b := n.Found("both-b", "open")
	ax := a.Nodes[0]
	ac := *ax.Cfg
	ac.Neighbours = []config.Neighbour{{URL: b.Nodes[0].URL, Send: []string{"catalog"}}}
	ax.Cfg = &ac
	ax.R.Reload(&ac)
	neighbours(b, a)
	fromB := announce(t, b, "bee")
	rt.Eventually(t, "a takes b's players (it takes every class)", func() bool { return ax.Has(fromB) })
	onePair(t, a, b)
	fromA := announce(t, a, "ay")
	time.Sleep(500 * time.Millisecond)
	if b.Nodes[0].Has(fromA) {
		t.Fatal("a sent a player record to its neighbour b, which it sends only the catalog")
	}
}

func TestCatalogGossip(t *testing.T) {
	n := rt.New(t)
	a := n.Found("gossip-a", "open")
	b := n.Found("gossip-b", "open")
	c := n.Found("gossip-c", "open")
	// A chain a - b - c: c hears of a only through b.
	neighbours(a, b)
	neighbours(b, c)
	rt.Eventually(t, "c knows a through b", func() bool {
		for _, s := range c.Nodes[0].R.Servers() {
			if s.ID == a.ID && s.Source == "gossip" && len(s.Path) == 2 && s.Path[0] == a.ID && s.Path[1] == b.ID {
				return true
			}
		}
		return false
	})
	// Loops are dropped: a never stores its own entry coming back.
	time.Sleep(300 * time.Millisecond)
	for _, s := range a.Nodes[0].R.Servers() {
		if s.ID == a.ID && len(s.Path) != 1 {
			t.Fatalf("a stored its own entry with path %v", s.Path)
		}
	}
	// A server that does not send the catalog class to a neighbour passes nothing on.
	d := n.Found("gossip-d", "open")
	e := n.Found("gossip-e", "open")
	x := e.Nodes[0]
	ec := *x.Cfg
	ec.Neighbours = []config.Neighbour{{URL: d.Nodes[0].URL}, {URL: b.Nodes[0].URL, Send: []string{"players"}}}
	x.Cfg = &ec
	x.R.Reload(&ec)
	rt.Eventually(t, "e knows d", func() bool { return knows(e, d.ID) })
	time.Sleep(500 * time.Millisecond)
	if knows(b, d.ID) {
		t.Fatal("e passed on gossip to a neighbour it sends only players to")
	}
}

func knows(s *rt.Server, id string) bool {
	for _, m := range s.Nodes[0].R.Servers() {
		if m.ID == id {
			return true
		}
	}
	return false
}

package node_test

import (
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// sessions counts the sessions any node of s has with nodes of server other, and how many of
// them s's side dialled.
func sessions(s *rt.Server, other string) (n, dialled int) {
	for _, x := range s.Nodes {
		if x.R == nil || x.Stopped() {
			continue
		}
		for _, p := range x.R.Status()["peers"].([]map[string]any) {
			if p["server"] == other {
				n++
				if p["dialled"] == true {
					dialled++
				}
			}
		}
	}
	return
}

// onePair waits for one synced session between a and b, dialled by the lower identity, and checks
// it stays one.
func onePair(t *testing.T, a, b *rt.Server) {
	t.Helper()
	lo, hi := a, b
	if b.ID < a.ID {
		lo, hi = b, a
	}
	check := func() bool {
		n1, d1 := sessions(lo, hi.ID)
		n2, d2 := sessions(hi, lo.ID)
		return n1 == 1 && d1 == 1 && n2 == 1 && d2 == 0
	}
	rt.Eventually(t, "one session between "+a.Nodes[0].Name+" and "+b.Nodes[0].Name+", dialled by the lower", check)
	time.Sleep(400 * time.Millisecond)
	if !check() {
		n1, d1 := sessions(lo, hi.ID)
		n2, d2 := sessions(hi, lo.ID)
		t.Fatalf("not one session: lower %d (%d dialled), higher %d (%d dialled)", n1, d1, n2, d2)
	}
}

func none(t *testing.T, a, b *rt.Server) {
	t.Helper()
	rt.Eventually(t, "no session between "+a.Nodes[0].Name+" and "+b.Nodes[0].Name, func() bool {
		n1, _ := sessions(a, b.ID)
		n2, _ := sessions(b, a.ID)
		return n1 == 0 && n2 == 0
	})
}

func autoOf(x *rt.Node) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, p := range x.R.Status()["auto"].([]map[string]any) {
		out[p["server"].(string)] = p
	}
	return out
}

// Open servers in the registry sync with one another without any neighbour configured: one
// session per pair. Selective, standalone and dead servers are left out.
func TestAutoSyncAmongRegistryServers(t *testing.T) {
	n := rt.New(t)
	a := n.Found("auto-a", "open")
	b := n.Found("auto-b", "open")
	c := n.Found("auto-c", "open")
	sel := n.Found("auto-picky", "selective")
	alone := n.Found("auto-alone", "standalone")
	dead := n.Found("auto-dead", "open")
	all := []*rt.Server{a, b, c, sel, alone, dead}
	snap := n.Snapshot([]*rt.Server{a, b, c, sel, alone}, dead)
	rt.SetRegistry(t, snap, all...)

	onePair(t, a, b)
	onePair(t, a, c)
	onePair(t, b, c)
	fromA, fromC := announce(t, a, "ay"), announce(t, c, "sea")
	rt.Eventually(t, "records cross", func() bool { return b.Nodes[0].Has(fromA) && b.Nodes[0].Has(fromC) && c.Nodes[0].Has(fromA) })

	st := autoOf(a.Nodes[0])
	if len(st) != 2 || st[b.ID] == nil || st[c.ID] == nil {
		t.Fatalf("a's automatic peers: %v", st)
	}
	for id, p := range st {
		want := "peer"
		if a.ID < id {
			want = "this node"
		}
		if p["dials"] != want || p["up"] != true || p["name"] == "" {
			t.Fatalf("a's status for %s: %v", id, p)
		}
	}
	for _, p := range a.Nodes[0].R.Status()["peers"].([]map[string]any) {
		if p["auto"] != true {
			t.Fatalf("a peer of a not marked automatic: %v", p)
		}
	}
	time.Sleep(300 * time.Millisecond)
	for _, s := range []*rt.Server{sel, alone, dead} {
		if len(autoOf(s.Nodes[0])) != 0 {
			t.Fatalf("%s has automatic peers", s.Nodes[0].Name)
		}
		for _, o := range []*rt.Server{a, b, c} {
			if k, _ := sessions(o, s.ID); k != 0 {
				t.Fatalf("%s has a session with %s", o.Nodes[0].Name, s.Nodes[0].Name)
			}
		}
	}
}

// A new snapshot is applied at once: a server that left (or went quiet) loses its sessions,
// a new one gets them.
func TestAutoSyncFollowsTheRegistry(t *testing.T) {
	n := rt.New(t)
	a := n.Found("follow-a", "open")
	b := n.Found("follow-b", "open")
	c := n.Found("follow-c", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{a, b, c}), a, b, c)
	onePair(t, a, b)
	onePair(t, a, c)
	onePair(t, b, c)

	// c stops answering the weekly challenge: out of the liveness window.
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{a, b}, c), a, b, c)
	none(t, a, c)
	none(t, b, c)
	onePair(t, a, b)

	// c is removed and d is listed.
	d := n.Found("follow-d", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{a, b, d}), a, b, c, d)
	onePair(t, a, d)
	onePair(t, b, d)
	none(t, a, c)
}

// A neighbour configured by hand that is also an automatic peer has the one session, with the
// configured classes, whichever side dials.
func TestAutoPeerConfiguredAsNeighbour(t *testing.T) {
	n := rt.New(t)
	a := n.Found("conf-a", "open")
	b := n.Found("conf-b", "open")
	ax := a.Nodes[0]
	ac := *ax.Cfg
	ac.Neighbours = []config.Neighbour{{URL: b.Nodes[0].URL, Send: []string{"catalog"}}}
	ax.Cfg = &ac
	ax.R.Reload(&ac)
	neighbours(b, a)
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{a, b}), a, b)
	onePair(t, a, b)
	fromB := announce(t, b, "bee")
	rt.Eventually(t, "a takes b's players", func() bool { return ax.Has(fromB) })
	fromA := announce(t, a, "ay")
	time.Sleep(500 * time.Millisecond)
	if b.Nodes[0].Has(fromA) {
		t.Fatal("a sent players to b, which it sends only the catalog")
	}
}

// autoSync: false keeps a node from dialling: two such servers stay apart.
func TestAutoSyncOff(t *testing.T) {
	n := rt.New(t)
	a := n.Found("off-a", "open")
	b := n.Found("off-b", "open")
	off := false
	for _, s := range []*rt.Server{a, b} {
		c := *s.Nodes[0].Cfg
		c.AutoSync = &off
		s.Nodes[0].Cfg = &c
		s.Nodes[0].R.Reload(&c)
	}
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{a, b}), a, b)
	time.Sleep(500 * time.Millisecond)
	if k, _ := sessions(a, b.ID); k != 0 || len(autoOf(a.Nodes[0])) != 0 {
		t.Fatal("a server with autoSync off synced automatically")
	}
}

// Automatic peers have room of their own: servers that dial in unasked cannot take it.
func TestAutoPeersKeepTheirRoom(t *testing.T) {
	n := rt.New(t)
	a := n.Found("room-a", "open")
	b := n.Found("room-b", "open")
	stranger := n.Found("room-stranger", "open")
	ax := a.Nodes[0]
	ac := *ax.Cfg
	ac.Limits.MaxNodes = 1
	ax.Cfg = &ac
	ax.R.Reload(&ac)
	neighbours(stranger, a)
	rt.Eventually(t, "the stranger takes a's one slot", func() bool { k, _ := sessions(a, stranger.ID); return k == 1 })
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{a, b}), a, b)
	onePair(t, a, b)
	if k, _ := sessions(a, stranger.ID); k != 1 {
		t.Fatal("the stranger lost its session")
	}
}

// Two servers of two nodes each: one node of the lower server dials one node of the higher. When
// the dialling node goes, its sibling takes over; when the node dialled goes, the next one of the
// peer is dialled.
func TestAutoSyncMultiNodeFailover(t *testing.T) {
	n := rt.New(t)
	x := n.Found("multi-x", "open")
	y := n.Found("multi-y", "open")
	n.AddNode(x, "multi-x2")
	n.AddNode(y, "multi-y2")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{x, y}), x, y)
	onePair(t, x, y)
	// Only one node of each server has the session; the other learns the peer's catalog entry
	// from its sibling (players tell which servers sync from the paths).
	for _, s := range []*rt.Server{x, y} {
		for _, nd := range s.Nodes {
			rt.Eventually(t, nd.Name+" hears the other server's entry", func() bool { return nd.R.Status()["catalog"] == 1 })
		}
	}
	lo, hi := x, y
	if y.ID < x.ID {
		lo, hi = y, x
	}
	holder := func(s *rt.Server, other string) *rt.Node {
		for _, nd := range s.Nodes {
			if nd.Stopped() {
				continue
			}
			for _, p := range nd.R.Status()["peers"].([]map[string]any) {
				if p["server"] == other {
					return nd
				}
			}
		}
		return nil
	}
	first := holder(lo, hi.ID)
	if first == nil || first.Key.Key > otherNode(lo, first).Key.Key {
		t.Fatalf("the dialling node is not the lower key of its server")
	}
	first.Stop()
	onePair(t, lo, hi)
	second := holder(lo, hi.ID)
	if second == nil || second == first {
		t.Fatal("the sibling did not take over")
	}
	id := announce(t, hi, "after-failover")
	rt.Eventually(t, "records cross after the failover", func() bool { return second.Has(id) })

	dialled := holder(hi, lo.ID)
	dialled.Stop()
	onePair(t, lo, hi)
	if now := holder(hi, lo.ID); now == nil || now == dialled {
		t.Fatal("the peer's other node was not dialled")
	}
}

func otherNode(s *rt.Server, x *rt.Node) *rt.Node {
	for _, o := range s.Nodes {
		if o != x {
			return o
		}
	}
	return nil
}

// lowHigh orders two servers by identity (byte order).
func lowHigh(a, b *rt.Server) (lo, hi *rt.Server) {
	if b.ID < a.ID {
		return b, a
	}
	return a, b
}

func setAutoSync(s *rt.Server, on bool) {
	for _, x := range s.Nodes {
		c := *x.Cfg
		c.AutoSync = &on
		x.Cfg = &c
		x.R.Reload(&c)
	}
}

// grace is fed.AutoFallback as a duration.
const grace = fed.AutoFallback * time.Second

// The lower server never dials (autoSync off here; an older relay in the wild): after fed.AutoFallback
// seconds without a session, by the relay's clock, the higher one dials, and keeps that one session.
func TestAutoFallbackDial(t *testing.T) {
	n := rt.New(t)
	lo, hi := lowHigh(n.Found("fall-a", "open"), n.Found("fall-b", "open"))
	setAutoSync(lo, false)
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{lo, hi}), lo, hi)
	time.Sleep(600 * time.Millisecond)
	if k, _ := sessions(hi, lo.ID); k != 0 {
		t.Fatal("the higher server dialled at once")
	}
	if p := autoOf(hi.Nodes[0])[lo.ID]; p == nil || p["dials"] != "peer" {
		t.Fatalf("the higher server's status before the grace: %v", p)
	}
	n.Clock.Add(grace - time.Minute)
	time.Sleep(600 * time.Millisecond)
	if k, _ := sessions(hi, lo.ID); k != 0 {
		t.Fatal("the higher server dialled before the grace")
	}
	n.Clock.Add(2 * time.Minute)
	check := func() bool {
		n1, d1 := sessions(hi, lo.ID)
		n2, d2 := sessions(lo, hi.ID)
		return n1 == 1 && d1 == 1 && n2 == 1 && d2 == 0
	}
	rt.Eventually(t, "the higher server dials after the grace", check)
	if p := autoOf(hi.Nodes[0])[lo.ID]; p["dials"] != "this node (fallback)" || p["up"] != true {
		t.Fatalf("the higher server's status: %v", p)
	}
	time.Sleep(600 * time.Millisecond)
	if !check() {
		t.Fatal("the fallback session did not stay")
	}
	fromLo := announce(t, lo, "low")
	rt.Eventually(t, "records cross on the fallback session", func() bool { return hi.Nodes[0].Has(fromLo) })
}

// Both sides dial at about the same moment (the lower one is back just as the grace runs out): one
// session per pair remains.
func TestAutoFallbackBothDial(t *testing.T) {
	n := rt.New(t)
	lo, hi := lowHigh(n.Found("both-a", "open"), n.Found("both-b", "open"))
	setAutoSync(lo, false)
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{lo, hi}), lo, hi)
	time.Sleep(400 * time.Millisecond)
	n.Clock.Add(grace + time.Minute)
	setAutoSync(lo, true)
	check := func() bool {
		n1, d1 := sessions(hi, lo.ID)
		n2, d2 := sessions(lo, hi.ID)
		return n1 == 1 && n2 == 1 && d1+d2 == 1
	}
	rt.Eventually(t, "one session between the two", check)
	for range 4 {
		time.Sleep(300 * time.Millisecond)
		if !check() {
			n1, d1 := sessions(hi, lo.ID)
			n2, d2 := sessions(lo, hi.ID)
			t.Fatalf("not one session: higher %d (%d dialled), lower %d (%d dialled)", n1, d1, n2, d2)
		}
	}
}

// A normal pair: the lower server dials within the grace, and the higher one never does, however
// long the session lasts.
func TestAutoFallbackNotNeeded(t *testing.T) {
	n := rt.New(t)
	lo, hi := lowHigh(n.Found("calm-a", "open"), n.Found("calm-b", "open"))
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{lo, hi}), lo, hi)
	onePair(t, lo, hi)
	n.Clock.Add(3 * grace)
	time.Sleep(600 * time.Millisecond)
	onePair(t, lo, hi)
	if p := autoOf(hi.Nodes[0])[lo.ID]; p["dials"] != "peer" {
		t.Fatalf("the higher server's status: %v", p)
	}
}

package node_test

import (
	"context"
	"strings"
	"testing"
	"time"

	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// A session whose dialer stopped during the handshake never comes up: nothing would close it later,
// and it would sit beside the session of the dialer that replaced it.
func TestStoppedDialerSessionStaysDown(t *testing.T) {
	n := rt.New(t)
	a := n.Found("stop-a", "open")
	b := n.Found("stop-b", "open")
	c := n.Found("stop-c", "open")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	go a.Nodes[0].R.DialNodeFor(ctx, ctx, c.Nodes[0].URL)
	rt.Eventually(t, "a live dialer's session comes up", func() bool { k, _ := sessions(a, c.ID); return k == 1 })

	gone, stop := context.WithCancel(ctx)
	stop()
	if err := a.Nodes[0].R.DialNodeFor(ctx, gone, b.Nodes[0].URL); err != nil {
		t.Fatalf("handshake: %v", err)
	}
	if k, _ := sessions(a, b.ID); k != 0 {
		t.Fatal("a stopped dialer's session came up")
	}
	rt.Eventually(t, "b drops it too", func() bool { k, _ := sessions(b, a.ID); return k == 0 })
}

// A configured neighbour that becomes an automatic peer this node dials keeps its session: the
// registry arriving does not drop it and dial again.
func TestNeighbourBecomingAutoKeepsItsSession(t *testing.T) {
	n := rt.New(t)
	a := n.Found("keep-a", "open")
	b := n.Found("keep-b", "open")
	neighbours(a, b)
	neighbours(b, a)
	lo, hi := a, b
	if b.ID < a.ID {
		lo, hi = b, a
	}
	settled := func() bool {
		n1, d1 := sessions(lo, hi.ID)
		n2, d2 := sessions(hi, lo.ID)
		return n1 == 1 && d1 == 1 && n2 == 1 && d2 == 0
	}
	rt.Eventually(t, "the lower's configured session wins", settled)
	time.Sleep(300 * time.Millisecond)
	if !settled() {
		t.Fatal("configured sessions did not settle")
	}
	downs := strings.Count(lo.Nodes[0].Log.String(), "sync: session down")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{a, b}), a, b)
	time.Sleep(300 * time.Millisecond)
	if strings.Count(lo.Nodes[0].Log.String(), "sync: session down") != downs || !settled() {
		t.Fatal("the registry dropped the configured session")
	}
	if p := autoOf(lo.Nodes[0])[hi.ID]; p["dials"] != "this node" || p["up"] != true {
		t.Fatalf("the kept session is not the automatic one: %v", p)
	}
}

package node_test

import (
	"fmt"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// hideOf is a hide record of s's operator listing n keys.
func hideOf(s *rt.Server, t int64, n int) map[string]any {
	keys := []any{}
	for i := range n {
		keys = append(keys, rt.Key(fmt.Sprint("hidden ", i)).Key)
	}
	return s.Op.Seal("hide", t, map[string]any{"server": s.ID, "hide": keys, "names": []any{}, "refuse": []any{}})
}

// A server known from gossip alone costs nothing to make up: its hides are neither kept nor
// passed on, however its operator sends them.
func TestHideOfGossipOnlyServerRefused(t *testing.T) {
	n := rt.New(t)
	v := n.Found("victim", "open")
	a := n.Found("made-up", "open")
	neighbours(a, v)
	vx := v.Nodes[0]
	rt.Eventually(t, "victim knows the made-up server", func() bool { return vx.R.Knows(a.ID) })
	c := vx.Client(from("203.0.113.9"))
	now := n.Clock.Unix()
	for i := range 5 {
		if _, err := c.Put(ctx(t), hideOf(a, now-int64(i), 500)); code(err) != fed.UnknownSrv {
			t.Fatalf("hide %d of a gossip-only server: %v, want %s", i, err, fed.UnknownSrv)
		}
	}
	if got := vx.Count("hide"); got != 0 {
		t.Fatalf("%d hides kept", got)
	}
}

// Of a registry server, one hide is kept: an older one is refused, a newer one replaces it at once.
func TestHideNewestPerServer(t *testing.T) {
	n := rt.New(t)
	v := n.Found("victim", "open")
	l := n.Found("listed", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{v, l}), v)
	vx := v.Nodes[0]
	c := vx.Client(from("203.0.113.9"))
	now := n.Clock.Unix()
	first := hideOf(l, now-10, 3)
	if _, err := c.Put(ctx(t), first); err != nil {
		t.Fatal(err)
	}
	for i := range 5 {
		if _, err := c.Put(ctx(t), hideOf(l, now-11-int64(i), 3)); code(err) != fed.Refused {
			t.Fatalf("older hide %d: %v, want %s", i, err, fed.Refused)
		}
	}
	newest := hideOf(l, now, 3)
	if _, err := c.Put(ctx(t), newest); err != nil {
		t.Fatal(err)
	}
	if got := vx.Count("hide"); got != 1 || !vx.Has(rt.ID(newest)) {
		t.Fatalf("%d hides kept (newest held: %v), want only the newest", got, vx.Has(rt.ID(newest)))
	}
}

// A hide from a client or another server counts against the growth budgets like any record.
func TestHideChargedToBudgets(t *testing.T) {
	n := rt.New(t)
	v := n.Found("victim", "open")
	l := n.Found("listed", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{v, l}), v)
	vx := v.Nodes[0]
	budgets(vx, func(b *config.Budgets) { b.BytesPerConn = 100 })
	c := vx.Client(from("203.0.113.9"))
	now := n.Clock.Unix()
	if _, err := c.Put(ctx(t), hideOf(l, now-1, 300)); err != nil {
		t.Fatal(err) // bytes may go into debt by one record
	}
	if _, err := c.Put(ctx(t), hideOf(l, now, 300)); code(err) != fed.RateLimited {
		t.Fatalf("second hide past the byte budget: %v, want %s", err, fed.RateLimited)
	}
}

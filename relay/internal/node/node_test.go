package node_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

func ctx(t *testing.T) context.Context {
	c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return c
}

func code(err error) string {
	var e *client.ErrFrame
	if errors.As(err, &e) {
		return e.Code
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func TestClientPutReceiptAndFetch(t *testing.T) {
	n := rt.New(t)
	s := n.Found("alpha", "open")
	c := s.Nodes[0].Client(nil)
	if c.Welcome.Server != s.ID || c.Welcome.Node != s.Nodes[0].Key.Key || c.Welcome.Ver != 1 {
		t.Fatalf("welcome: %+v", c.Welcome)
	}
	alice := rt.Key("alice")
	rec := rt.Stats(alice, n.Clock.Unix(), 3, false)
	ack, err := c.Put(ctx(t), rec)
	if err != nil {
		t.Fatal(err)
	}
	if rid, _ := ack.Str("rid"); rid != rt.ID(rec) {
		t.Fatalf("rid %q", rid)
	}
	rcpt, _ := ack.Raw["rcpt"].(map[string]any)
	body, _ := rcpt["body"].(map[string]any)
	if body["rec"] != rt.ID(rec) || body["server"] != s.ID {
		t.Fatalf("receipt %v", rcpt)
	}
	// The same record again: a duplicate, no new receipt.
	ack, err = c.Put(ctx(t), rec)
	if err != nil || ack.Raw["dup"] != true || ack.Raw["rcpt"] != nil {
		t.Fatalf("duplicate: %v %v", err, ack.Raw)
	}
	// A second stats in the same slot: rate limited, with the seconds to the next slot.
	_, err = c.Put(ctx(t), rt.Stats(alice, n.Clock.Unix()+1, 4, false))
	if code(err) != fed.RateLimited {
		t.Fatalf("second stats: %v", err)
	}
	var ef *client.ErrFrame
	errors.As(err, &ef)
	if ef.Retry != 290 {
		t.Fatalf("retry %d", ef.Retry)
	}
	// A record that does not check is refused with its code and the connection stays.
	bad := rt.Stats(alice, n.Clock.Unix()+1, 4, false)
	bad["sig"] = rec["sig"]
	if _, err := c.Put(ctx(t), bad); code(err) != fed.BadSig {
		t.Fatalf("bad sig: %v", err)
	}
	items, err := c.Collect(ctx(t), map[string]any{"m": "fetch", "ids": []any{rt.ID(rec), "nope"}})
	if err != nil || len(items) != 1 {
		t.Fatalf("fetch: %v %d", err, len(items))
	}
	// A receipt is not a record.
	if _, err := c.Put(ctx(t), map[string]any{"v": int64(1), "kind": "receipt"}); code(err) != fed.BadKind {
		t.Fatalf("receipt put: %v", err)
	}
}

func TestTwoNodesOfOneServerStayInSync(t *testing.T) {
	n := rt.New(t)
	s := n.Found("beta", "standalone")
	n2 := n.AddNode(s, "beta2")
	n1 := s.Nodes[0]
	alice, bob := rt.Key("alice"), rt.Key("bob")
	a := rt.Announce(alice, n.Clock.Unix(), "Ping Floyd")
	if _, err := n1.Client(nil).Put(ctx(t), a); err != nil {
		t.Fatal(err)
	}
	rt.Eventually(t, "announce on node 2", func() bool { return n2.Has(rt.ID(a)) })
	b := rt.Announce(bob, n.Clock.Unix(), "Hop Shop")
	if _, err := n2.Client(nil).Put(ctx(t), b); err != nil {
		t.Fatal(err)
	}
	rt.Eventually(t, "announce on node 1", func() bool { return n1.Has(rt.ID(b)) })

	// A client moves to the other node and finds everything with its cursor.
	c := n2.Client(nil)
	items, err := c.Collect(ctx(t), map[string]any{"m": "sub", "kinds": []any{"announce"}, "since": ""})
	if err != nil || len(items) != 2 {
		t.Fatalf("sub on node 2: %v %d", err, len(items))
	}
	// Node 2 restarts: records reload from disk, and it catches up on what it missed.
	n2.Stop()
	carol := rt.Key("carol")
	cr := rt.Announce(carol, n.Clock.Unix(), "Carol Net")
	n1.MustPut(cr)
	n2.Restart()
	if !n2.Has(rt.ID(a)) {
		t.Fatal("records lost on restart")
	}
	rt.Eventually(t, "catch-up after restart", func() bool { return n2.Has(rt.ID(cr)) })
}

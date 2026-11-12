package node_test

import (
	"slices"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// excluded waits for an excluded frame (gathered over its pages) that satisfies ok.
func excluded(t *testing.T, c *client.Client, ok func(keys, reasons []string) bool) ([]string, []string) {
	t.Helper()
	var keys, reasons []string
	deadline := time.After(5 * time.Second)
	for {
		select {
		case f, open := <-c.Others():
			if !open {
				t.Fatal("connection closed")
			}
			if f.M != "excluded" {
				continue
			}
			if _, has := f.Raw["id"]; has {
				t.Fatal("excluded carries an id")
			}
			k, _ := f.Strs("keys")
			keys = append(keys, k...)
			if r, has := f.Strs("reasons"); has {
				reasons = append(reasons, r...)
			}
			if more, _ := f.Raw["more"].(bool); more {
				continue
			}
			if ok(keys, reasons) {
				return keys, reasons
			}
			keys, reasons = nil, nil
		case <-deadline:
			t.Fatal("no matching excluded frame")
		}
	}
}

func TestAuth(t *testing.T) {
	n := rt.New(t)
	a := n.Found("proving", "open")
	x := a.Nodes[0]
	c := x.Client(nil)
	now := n.Clock.Unix()
	if op, err := c.Auth(ctx(t), a.Op, now); err != nil || !op {
		t.Fatalf("operator key: %v %v", op, err)
	}
	if op, err := c.Auth(ctx(t), rt.Key("alice"), now+600); err != nil || op {
		t.Fatalf("a player's key, 600 s ahead: %v %v", op, err)
	}
	if _, err := c.Auth(ctx(t), rt.Key("bob"), now-600); err != nil {
		t.Fatalf("600 s behind: %v", err)
	}
	bad := func(m map[string]any, want string) {
		t.Helper()
		m["m"] = "auth"
		if _, err := c.Request(ctx(t), m); code(err) != want {
			t.Fatalf("%v: %v, want %s", m, err, want)
		}
	}
	k := rt.Key("carol")
	sig := func(node, server string, t int64) string { return k.Auth(node, server, t) }
	bad(map[string]any{"key": k.Key, "t": now - 601, "sig": sig(x.Key.Key, a.ID, now-601)}, fed.TooOld)
	bad(map[string]any{"key": k.Key, "t": now + 601, "sig": sig(x.Key.Key, a.ID, now+601)}, fed.TooNew)
	bad(map[string]any{"key": k.Key, "t": now, "sig": sig(x.Key.Key, rt.ID(rt.Announce(k, now, "x")), now)}, fed.BadSig)
	bad(map[string]any{"key": k.Key, "t": now, "sig": sig(rt.Key("other node").Key, a.ID, now)}, fed.BadSig)
	bad(map[string]any{"key": k.Key, "t": now + 1, "sig": sig(x.Key.Key, a.ID, now)}, fed.BadSig)
	bad(map[string]any{"key": rt.Key("dan").Key, "t": now, "sig": sig(x.Key.Key, a.ID, now)}, fed.BadSig)
	bad(map[string]any{"key": "nope", "t": now, "sig": sig(x.Key.Key, a.ID, now)}, fed.BadKey)
	// A session proves at most four keys (the same key again costs nothing).
	if _, err := c.Auth(ctx(t), a.Op, now); err != nil {
		t.Fatalf("the same key again: %v", err)
	}
	if _, err := c.Auth(ctx(t), k, now); err != nil {
		t.Fatalf("a fourth key: %v", err)
	}
	if _, err := c.Auth(ctx(t), rt.Key("dan"), now); code(err) != fed.TooMany {
		t.Fatalf("a fifth key: %v", err)
	}
	// A frame without its signature is not a frame.
	if _, err := c.Request(ctx(t), map[string]any{"m": "auth", "key": k.Key, "t": now}); err == nil {
		t.Fatal("auth without sig answered")
	}
}

// Shun votes reach only the server's operators; every client learns which networks are excluded,
// and the excluded network itself which reasons were given, never counts or voters.
func TestVotesOnlyToOperators(t *testing.T) {
	n := rt.New(t)
	a := n.Found("private", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	asOf := now - now%fed.Day
	reg, voters := rt.Registry(6, asOf, now)
	if err := x.R.SetRegistry(reg); err != nil {
		t.Fatal(err)
	}
	mallory := rt.Key("mallory")
	x.MustPut(rt.Announce(mallory, now, "Spam Spam"))

	type who struct {
		c    *client.Client
		recs <-chan *wire.Frame
	}
	join := func(k *fed.Signer, wantOp bool) who {
		t.Helper()
		c := x.Client(nil)
		if k != nil {
			if op, err := c.Auth(ctx(t), k, now); err != nil || op != wantOp {
				t.Fatalf("auth %v: %v", op, err)
			}
		}
		_, ch, err := c.Start(ctx(t), map[string]any{"m": "sub", "kinds": []any{"announce", "shun", "unshun"}, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		excluded(t, c, func(keys, _ []string) bool { return len(keys) == 0 })
		return who{c, ch}
	}
	plain, bob, op, mal := join(nil, false), join(rt.Key("bob"), false), join(a.Op, true), join(mallory, false)

	var ids []any
	for i, v := range voters[:5] {
		why := "spam"
		if i == 4 {
			why = "offensive_name"
		}
		rec := vote(n, v, mallory.Key, why)
		ids = append(ids, rt.ID(rec))
		x.MustPut(rec)
	}
	// Everyone learns the outcome; only the excluded network gets the reasons, as a set.
	for _, w := range []who{plain, bob, op} {
		keys, reasons := excluded(t, w.c, func(keys, _ []string) bool { return len(keys) == 1 })
		if keys[0] != mallory.Key || reasons != nil {
			t.Fatalf("excluded %v reasons %v", keys, reasons)
		}
	}
	if _, reasons := excluded(t, mal.c, func(keys, _ []string) bool { return len(keys) == 1 }); !slices.Equal(reasons, []string{"offensive_name", "spam"}) {
		t.Fatalf("the excluded network's reasons: %v", reasons)
	}
	// The operator's sub carries the five votes; nobody else's carries any.
	got := 0
	for got < 5 {
		select {
		case f := <-op.recs:
			got += len(f.Raw["items"].([]any))
		case <-time.After(5 * time.Second):
			t.Fatalf("the operator got %d votes", got)
		}
	}
	time.Sleep(200 * time.Millisecond)
	for _, w := range []who{plain, bob, mal} {
		for len(w.recs) > 0 {
			f := <-w.recs
			for _, it := range f.Raw["items"].([]any) {
				if k := it.(map[string]any)["rec"].(map[string]any)["kind"]; k == "shun" || k == "unshun" {
					t.Fatal("a vote reached a client that is not an operator")
				}
			}
		}
	}
	// Fetch by id, and a later sub's backlog: the same.
	for _, w := range []who{plain, bob, mal, op} {
		items, err := w.c.Collect(ctx(t), map[string]any{"m": "fetch", "ids": ids})
		if err != nil {
			t.Fatal(err)
		}
		backlog, err := w.c.Collect(ctx(t), map[string]any{"m": "sub", "kinds": []any{"shun", "unshun"}, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		want := 0
		if w == op {
			want = 5
		}
		if len(items) != want || len(backlog) != want {
			t.Fatalf("fetch gave %d, sub %d votes, want %d", len(items), len(backlog), want)
		}
	}
	// A withdrawal does not lift the shun at once, but the reasons follow the votes at now.
	n.Clock.Add(time.Minute)
	x.MustPut(vote(n, voters[4], mallory.Key, ""))
	if _, reasons := excluded(t, mal.c, func(keys, r []string) bool { return len(keys) == 1 && len(r) == 1 }); reasons[0] != "spam" {
		t.Fatalf("reasons after a withdrawal: %v", reasons)
	}
	// Seven days below the threshold: lifted, and every follower hears it.
	n.Clock.Add(7*24*time.Hour + time.Minute)
	x.MustPut(rt.Announce(rt.Key("alice"), n.Clock.Unix(), "Alice")) // any record makes the node count again
	for _, w := range []who{plain, bob, op, mal} {
		excluded(t, w.c, func(keys, _ []string) bool { return len(keys) == 0 })
	}
}

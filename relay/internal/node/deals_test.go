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

// Offers, accepts and declines reach only the two parties (9.3); an open consortium project and
// the answers to it reach everyone. Live, in a sub's backlog and by fetch alike.
func TestDealsOnlyToTheirParties(t *testing.T) {
	n := rt.New(t)
	a := n.Found("discreet", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	alice, bob, carol := rt.Key("alice"), rt.Key("bob"), rt.Key("carol")
	kinds := []any{"offer", "accept", "decline"}

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
		_, ch, err := c.Start(ctx(t), map[string]any{"m": "sub", "kinds": kinds, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		select { // the (empty) backlog
		case <-ch:
		case <-time.After(5 * time.Second):
			t.Fatal("no backlog")
		}
		return who{name, c, ch}
	}
	ws := []who{join("alice", alice), join("bob", bob), join("carol", carol), join("nobody", nil)}

	offer := rt.Offer(alice, now, bob.Key)
	accept := bob.Seal("accept", now+1, map[string]any{"offer": rt.ID(offer), "to": alice.Key})
	decline := bob.Seal("decline", now+2, map[string]any{"offer": rt.ID(offer), "to": alice.Key, "enc": rt.Enc(now, 24)})
	cons := carol.Seal("offer", now+3, map[string]any{"deal": "consortium", "terms": map[string]any{"name": "North Sea Noodle",
		"a": "ams", "b": "osl", "members": int64(3), "share": int64(1000000), "pairs": int64(2)}})
	joins := alice.Seal("accept", now+4, map[string]any{"offer": rt.ID(cons), "to": carol.Key})
	all := []map[string]any{offer, accept, decline, cons, joins}
	var ids []any
	for _, r := range all {
		x.MustPut(r)
		ids = append(ids, rt.ID(r))
	}
	public := []string{cons["sig"].(string), joins["sig"].(string)}
	want := map[string][]string{"alice": nil, "bob": nil, "carol": public, "nobody": public}
	for _, r := range all {
		want["alice"] = append(want["alice"], r["sig"].(string))
		want["bob"] = append(want["bob"], r["sig"].(string))
	}
	idsOf := func(items []map[string]any) []string {
		var out []string
		for _, it := range items {
			out = append(out, it["rec"].(map[string]any)["sig"].(string))
		}
		slices.Sort(out)
		return out
	}
	same := func(w who, how string, got []map[string]any) {
		t.Helper()
		exp := slices.Clone(want[w.name])
		slices.Sort(exp)
		if g := idsOf(got); !slices.Equal(g, exp) {
			t.Fatalf("%s %s: %d records, want %d", w.name, how, len(g), len(exp))
		}
	}
	for _, w := range ws {
		var live []map[string]any
		deadline := time.After(5 * time.Second)
		for len(live) < len(want[w.name]) {
			select {
			case f := <-w.recs:
				for _, it := range f.Raw["items"].([]any) {
					live = append(live, it.(map[string]any))
				}
			case <-deadline:
				t.Fatalf("%s got %d live records", w.name, len(live))
			}
		}
		time.Sleep(100 * time.Millisecond)
		for len(w.recs) > 0 {
			f := <-w.recs
			for _, it := range f.Raw["items"].([]any) {
				live = append(live, it.(map[string]any))
			}
		}
		same(w, "live", live)
		fetched, err := w.c.Collect(ctx(t), map[string]any{"m": "fetch", "ids": ids})
		if err != nil {
			t.Fatal(err)
		}
		same(w, "fetch", fetched)
		backlog, err := w.c.Collect(ctx(t), map[string]any{"m": "sub", "kinds": kinds, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		same(w, "backlog", backlog)
	}
}

// The relay takes a sealed offer and decline by their shape only: to and the box in clear, nothing
// else, a 12-byte nonce, a ciphertext with its tag (5.3).
func TestSealedDealsShape(t *testing.T) {
	n := rt.New(t)
	a := n.Found("shapes", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	alice, bob := rt.Key("alice"), rt.Key("bob")
	x.MustPut(rt.Offer(alice, now, bob.Key))
	enc := func(nb, cb int) map[string]any {
		e := rt.Enc(now, 64)
		e["n"] = fed.Encode(make([]byte, nb))
		e["c"] = fed.Encode(make([]byte, cb))
		return e
	}
	off := func(body map[string]any) map[string]any { return alice.Seal("offer", now, body) }
	cases := []struct {
		name string
		rec  map[string]any
		want string
	}{
		{"no box", off(map[string]any{"to": bob.Key}), fed.MissingField},
		{"terms in clear", off(map[string]any{"to": bob.Key, "enc": rt.Enc(now, 64), "deal": "peering"}), fed.UnknownField},
		{"to self", off(map[string]any{"to": alice.Key, "enc": rt.Enc(now, 64)}), fed.BadField},
		{"short nonce", off(map[string]any{"to": bob.Key, "enc": enc(11, 64)}), fed.BadField},
		{"no tag", off(map[string]any{"to": bob.Key, "enc": enc(12, 16)}), fed.BadField},
		{"box too big", off(map[string]any{"to": bob.Key, "enc": enc(12, 2049)}), fed.BadField},
		{"box with more", off(map[string]any{"to": bob.Key, "enc": map[string]any{"n": enc(12, 20)["n"], "c": enc(12, 20)["c"], "x": true}}), fed.UnknownField},
		{"clear reason", bob.Seal("decline", now, map[string]any{"offer": rt.ID(rt.Offer(alice, now, bob.Key)), "to": alice.Key, "enc": rt.Enc(now, 20), "reason": "declined"}), fed.UnknownField},
		{"private offer in clear", off(map[string]any{"to": bob.Key, "deal": "swap", "terms": map[string]any{}, "enc": rt.Enc(now, 64)}), fed.UnknownField},
	}
	for _, c := range cases {
		if got := x.Put(c.rec); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
	if got := x.Put(bob.Seal("decline", now, map[string]any{"offer": rt.ID(rt.Offer(alice, now, bob.Key)), "to": alice.Key, "enc": rt.Enc(now, 20)})); got != "" {
		t.Fatalf("a sealed decline: %s", got)
	}
}

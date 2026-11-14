package node_test

import (
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// A carry walks the whole store: it is answered once per session, however often a peer sends it.
func TestCarryAnsweredOncePerSession(t *testing.T) {
	n := rt.New(t)
	a := n.Found("victim", "open")
	b := n.Found("peer", "open")
	neighbours(b, a)
	rt.Eventually(t, "a knows b", func() bool { return a.Nodes[0].R.Knows(b.ID) })
	neighbours(b)
	rt.Eventually(t, "b's session ends", func() bool { return a.Nodes[0].R.NodeSessions() == 0 })
	for i := range 3 {
		announce(t, a, "player "+string(rune('a'+i)))
	}
	bkey := b.Nodes[0].Key
	w := dialWS(t, n, a.Nodes[0].URL)
	w.send(map[string]any{"m": "hello", "vers": []any{int64(fed.Version)}, "role": "node", "server": b.ID, "node": bkey.Key,
		"nonce": fed.Encode(make([]byte, 32)), "feats": []any{fed.FeatBind}})
	f := w.next()
	if f == nil || f.M != "welcome" {
		t.Fatalf("no welcome: %+v", f)
	}
	theirs, _ := f.Str("nonce")
	w.send(map[string]any{"m": "proof", "proof": bkey.MakeBoundProof(theirs, b.ID, a.Nodes[0].Key.Key, fed.RoleCall, n.Clock.Unix())})
	for range 20 {
		w.send(map[string]any{"m": "carry", "classes": []any{"players"}, "since": int64(0)})
	}
	w.send(map[string]any{"m": "ping", "id": int64(7)})
	invs := 0
	for {
		_, buf, err := w.c.Read(w.ctx)
		if err != nil {
			t.Fatal(err)
		}
		v, _ := canon.Parse(buf)
		m, _ := v.(map[string]any)
		if m["m"] == "inv" {
			invs++
		}
		if m["m"] == "pong" {
			break
		}
	}
	if invs != 1 {
		t.Fatalf("%d inventories for 20 carries, want 1", invs)
	}
}

package node_test

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// A server known from gossip alone costs nothing to make up, so its receipts never set a board
// slot (6.1): a pushed record gets this node's own receipt instead. And no receipt may date a
// record before its own time, from any server.
func TestReceiptsOfGossipServersDoNotCount(t *testing.T) {
	n := rt.New(t)
	a := n.Found("boards", "open")
	b := n.Found("madeup", "open")
	neighbours(b, a)
	good := announce(t, b, "honest")
	rt.Eventually(t, "a hears of b", func() bool { return a.Nodes[0].Has(good) })
	neighbours(b)
	rt.Eventually(t, "b's session ends", func() bool { return len(a.Nodes[0].R.Status()["peers"].([]map[string]any)) == 0 })
	n.Clock.Add(time.Hour)
	now := n.Clock.Unix()
	slot := fed.Slot(now)

	bkey := b.Nodes[0].Key
	r, err := dialRaw(t, a.Nodes[0], []string{fed.Subprotocol})
	if err != nil {
		t.Fatal(err)
	}
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node",
		"server": b.ID, "node": bkey.Key, "nonce": fed.Encode(bytes.Repeat([]byte{9}, 32)), "feats": []any{fed.FeatBind}}))
	cx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, wb, err := r.c.Read(cx)
	if err != nil {
		t.Fatal(err)
	}
	w, _ := wire.Parse(wb, fed.NodeFrame)
	theirs, _ := w.Str("nonce")
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "proof", "proof": bkey.MakeBoundProof(theirs, b.ID, a.Nodes[0].Key.Key, fed.RoleCall, now)}))
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "carry", "classes": []any{"players"}, "since": int64(0)}))

	// Within the time bound, but from a gossip-only server; and 8 days before its record.
	near := rt.Stats(rt.Key("near"), now, 2, false)
	old := rt.Stats(rt.Key("old"), now, 3, false)
	item := func(rec map[string]any, t int64) map[string]any {
		rc := bkey.Seal("receipt", t, map[string]any{"rec": rt.ID(rec), "server": b.ID})
		return map[string]any{"rec": rec, "rcpt": []any{rc}}
	}
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "push", "items": []any{
		item(near, slot-fed.SlotLen), item(old, slot-8*fed.Day)}}))
	x := a.Nodes[0]
	rt.Eventually(t, "both records are kept", func() bool { return x.Has(rt.ID(near)) && x.Has(rt.ID(old)) })
	for _, rec := range []map[string]any{near, old} {
		if got := x.R.SlotOf(rt.ID(rec)); got != slot {
			t.Fatalf("board slot %d, want this node's own %d", got, slot)
		}
	}
}

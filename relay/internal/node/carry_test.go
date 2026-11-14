package node_test

import (
	"strings"
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
	w := asNodeOf(t, n, a, b)
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

// asNodeOf opens a session with a's node as b's node (bound proof), as b would.
func asNodeOf(t *testing.T, n *rt.Net, a, b *rt.Server) *wsConn {
	t.Helper()
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
	return w
}

// A peer's err code reaches the log cut to 32 bytes.
func TestPeerErrCodeLogBounded(t *testing.T) {
	n := rt.New(t)
	a := n.Found("victim", "open")
	b := n.Found("peer", "open")
	neighbours(b, a)
	rt.Eventually(t, "a knows b", func() bool { return a.Nodes[0].R.Knows(b.ID) })
	neighbours(b)
	rt.Eventually(t, "b's session ends", func() bool { return a.Nodes[0].R.NodeSessions() == 0 })
	w := asNodeOf(t, n, a, b)
	long := strings.Repeat("x", 4000)
	w.send(map[string]any{"m": "err", "code": long})
	w.send(map[string]any{"m": "ping", "id": int64(3)})
	for f := w.next(); f != nil && f.M != "pong"; f = w.next() {
	}
	log := a.Nodes[0].Log.String()
	if !strings.Contains(log, strings.Repeat("x", 32)) || strings.Contains(log, strings.Repeat("x", 33)) {
		t.Fatal("the peer's err code was not logged cut to 32 bytes")
	}
}

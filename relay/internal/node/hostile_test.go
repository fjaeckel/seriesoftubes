package node_test

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// raw is a bare WebSocket to a node, for sending what no well-behaved client sends.
type raw struct {
	t *testing.T
	c *websocket.Conn
}

func dialRaw(t *testing.T, x *rt.Node, proto []string) (*raw, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, x.URL, &websocket.DialOptions{HTTPClient: x.Net.HTTP, Subprotocols: proto})
	if err != nil {
		return nil, err
	}
	c.SetReadLimit(-1)
	t.Cleanup(func() { c.CloseNow() })
	return &raw{t, c}, nil
}

func (r *raw) send(typ websocket.MessageType, b []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = r.c.Write(ctx, typ, b)
}

// next returns the next frame's error code ("" for a non-err frame) and whether the connection is still open.
func (r *raw) next() (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, b, err := r.c.Read(ctx)
	if err != nil {
		return "", false
	}
	f, werr := wire.Parse(b, fed.NodeFrame)
	if werr != nil {
		r.t.Fatalf("node sent a bad frame: %s", b)
	}
	code, _ := f.Str("code")
	return code, true
}

func (r *raw) closed() bool {
	_, open := r.next()
	if open {
		_, open = r.next()
	}
	return !open
}

func hello(r *raw) {
	r.send(websocket.MessageText, []byte(`{"m":"hello","vers":[1],"role":"client"}`))
	if code, _ := r.next(); code != "" {
		r.t.Fatalf("hello refused: %s", code)
	}
}

func TestHostileClients(t *testing.T) {
	n := rt.New(t)
	s := n.Found("tough", "open")
	x := s.Nodes[0]
	proto := []string{fed.Subprotocol}

	if _, err := dialRaw(t, x, []string{"chat"}); err == nil {
		t.Fatal("a connection without the subprotocol was accepted")
	}
	r, _ := dialRaw(t, x, proto)
	r.send(websocket.MessageText, []byte(`{"m":"put","id":1,"rec":{}}`))
	if code, _ := r.next(); code != fed.NotReady || !r.closed() {
		t.Fatalf("before hello: %s", code)
	}
	r, _ = dialRaw(t, x, proto)
	hello(r)
	r.send(websocket.MessageBinary, []byte{1, 2, 3})
	if !r.closed() {
		t.Fatal("a binary frame did not close the connection")
	}
	r, _ = dialRaw(t, x, proto)
	hello(r)
	r.send(websocket.MessageText, bytes.Repeat([]byte("x"), fed.ClientFrame+1))
	if code, _ := r.next(); code != fed.TooBig || !r.closed() {
		t.Fatalf("oversized frame: %s", code)
	}
	r, _ = dialRaw(t, x, proto)
	hello(r)
	r.send(websocket.MessageText, []byte(`{"m":"put","id":1`))
	if code, _ := r.next(); code != fed.BadJSON || !r.closed() {
		t.Fatalf("bad json: %s", code)
	}
	// Faults inside a record do not close the connection.
	r, _ = dialRaw(t, x, proto)
	hello(r)
	deep := `{"m":"put","id":2,"rec":` + strings.Repeat("[", 5000) + strings.Repeat("]", 5000) + `}`
	r.send(websocket.MessageText, []byte(deep))
	if code, open := r.next(); code != fed.BadField && code != fed.TooDeep || !open {
		t.Fatalf("deep record: %q %v", code, open)
	}
	r.send(websocket.MessageText, []byte(`{"m":"put","id":3,"rec":{"v":1,"kind":"stats","x":"\ud800"}}`))
	if code, open := r.next(); code != fed.BadString || !open {
		t.Fatalf("lone surrogate: %q", code)
	}
	r.send(websocket.MessageText, []byte(`{"m":"fetch","id":4,"ids":[`+strings.Repeat(`"a",`, 300)+`"a"]}`))
	if code, open := r.next(); code != fed.TooMany || !open {
		t.Fatalf("fetch of 301: %q", code)
	}
	// The node is still fine for everyone else.
	c := x.Client(nil)
	if _, err := c.Put(ctx(t), rt.Announce(rt.Key("ok"), n.Clock.Unix(), "Still Here")); err != nil {
		t.Fatal(err)
	}
}

func TestHostilePushesAreDropped(t *testing.T) {
	n := rt.New(t)
	a := n.Found("victim", "open")
	b := n.Found("liar", "open")
	neighbours(b, a)
	good := announce(t, b, "honest")
	rt.Eventually(t, "honest record crosses", func() bool { return a.Nodes[0].Has(good) })
	// One session per pair of servers: b's own goes first, or a would close the second one.
	neighbours(b)
	rt.Eventually(t, "b's session ends", func() bool { return len(a.Nodes[0].R.Status()["peers"].([]map[string]any)) == 0 })
	// Speak as b's node directly and push garbage next to one real record.
	bkey := b.Nodes[0].Key
	r, err := dialRaw(t, a.Nodes[0], []string{fed.Subprotocol})
	if err != nil {
		t.Fatal(err)
	}
	mine := fed.Encode(bytes.Repeat([]byte{7}, 32))
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node",
		"server": b.ID, "node": bkey.Key, "nonce": mine}))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, wb, err := r.c.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	w, _ := wire.Parse(wb, fed.NodeFrame)
	theirs, _ := w.Str("nonce")
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "proof", "proof": bkey.MakeProof(theirs, b.ID, n.Clock.Unix())}))
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "carry", "classes": []any{"players"}, "since": int64(0)}))
	forged := rt.Announce(rt.Key("forged"), n.Clock.Unix(), "Forged")
	forged["sig"] = rt.Announce(rt.Key("other"), n.Clock.Unix(), "x")["sig"]
	fine := rt.Announce(rt.Key("fine"), n.Clock.Unix(), "Fine")
	chainRec := map[string]any{"rec": rt.Announce(rt.Key("y"), n.Clock.Unix(), "y"), "rcpt": "not a list"}
	push := `{"m":"push","items":[` +
		`{"rec":` + string(canon.Encode(forged)) + `},` +
		`{"rec":[1,2,3]},` +
		`"not an item",` +
		`{"rec":{"v":1,"kind":"stats","body":` + strings.Repeat("[", 50) + strings.Repeat("]", 50) + `}},` +
		`{"rec":{"v":1,"kind":"stats","body":{"x":1e400}}},` +
		string(canon.Encode(chainRec)) + `,` +
		`{"rec":` + string(canon.Encode(fine)) + `,"rcpt":[{"kind":"receipt","v":1}]}]}`
	r.send(websocket.MessageText, []byte(push))
	rt.Eventually(t, "the fine record is kept", func() bool { return a.Nodes[0].Has(rt.ID(fine)) })
	if a.Nodes[0].Has(rt.ID(forged)) {
		t.Fatal("a forged record was stored")
	}
	if !a.Nodes[0].Has(rt.ID(chainRec["rec"].(map[string]any))) {
		t.Fatal("a valid record with junk receipts was lost (it should get this node's own receipt)")
	}
	// The session survives garbage records: a ping is still answered.
	r.send(websocket.MessageText, []byte(`{"m":"ping","id":9}`))
	for {
		_, b, err := r.c.Read(ctx)
		if err != nil {
			t.Fatalf("session closed: %v", err)
		}
		if f, _ := wire.Parse(b, fed.NodeFrame); f != nil && f.M == "pong" {
			break
		}
	}
	if !strings.Contains(a.Nodes[0].Log.String(), "sync: dropped record") {
		t.Fatal("dropped records are not logged by code")
	}
}

func TestRetention(t *testing.T) {
	n := rt.New(t)
	s := n.Found("keeper", "open")
	x := s.Nodes[0]
	alice, bob := rt.Key("alice"), rt.Key("bob")
	start := n.Clock.Unix()
	oldStats := rt.Stats(alice, start, 1, false)
	x.MustPut(oldStats)
	n.Clock.Add(5 * time.Minute)
	newest := rt.Stats(alice, n.Clock.Unix(), 2, false)
	x.MustPut(newest)
	bobStats := rt.Stats(bob, n.Clock.Unix(), 1, false)
	x.MustPut(bobStats)
	offer := rt.Offer(alice, n.Clock.Unix(), bob.Key)
	x.MustPut(offer)
	// Four days later: stats older than 72 hours go, except each key's newest (carried forward).
	n.Clock.Add(4 * 24 * time.Hour)
	x.R.GC()
	if x.Has(rt.ID(oldStats)) || !x.Has(rt.ID(newest)) || !x.Has(rt.ID(bobStats)) {
		t.Fatal("stats retention")
	}
	// After the carry-forward reach the newest goes too; offers after 30 days.
	n.Clock.Add(30 * 24 * time.Hour)
	x.R.GC()
	if x.Has(rt.ID(newest)) || x.Has(rt.ID(offer)) {
		t.Fatal("old records kept")
	}
	// A leave drops the network's older records at once and refuses older ones after.
	carol := rt.Key("carol")
	ann := rt.Announce(carol, n.Clock.Unix(), "Carol")
	x.MustPut(ann)
	n.Clock.Add(time.Second)
	x.MustPut(carol.Seal("leave", n.Clock.Unix(), map[string]any{}))
	if x.Has(rt.ID(ann)) {
		t.Fatal("leave did not drop older records")
	}
	if code := x.Put(rt.Announce(carol, n.Clock.Unix()-1, "Carol again")); code != fed.Refused {
		t.Fatalf("older record after leave: %q", code)
	}
	n.Clock.Add(time.Second)
	x.MustPut(rt.Announce(carol, n.Clock.Unix(), "Carol is back"))
	// The files hold only what is kept, and a restart reloads exactly that.
	n.Clock.Add(24 * time.Hour)
	x.R.GC()
	before := x.R.Status()["records"]
	x.Restart()
	if x.R.Status()["records"] != before {
		t.Fatalf("records after restart %v, before %v", x.R.Status()["records"], before)
	}
}

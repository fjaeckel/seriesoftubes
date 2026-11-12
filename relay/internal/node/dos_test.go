package node_test

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// multi seals a multi-signer record signed by every one of signers.
func multi(author *fed.Signer, signers []*fed.Signer, kind string, t int64, body map[string]any) map[string]any {
	m := map[string]any{"v": int64(1), "kind": kind, "key": author.Key, "t": t, "body": body}
	msg := canon.Encode(m)
	var sigs []any
	for _, s := range signers {
		sigs = append(sigs, map[string]any{"key": s.Key, "sig": s.Sign(msg)})
	}
	slices.SortFunc(sigs, func(a, b any) int {
		return strings.Compare(a.(map[string]any)["key"].(string), b.(map[string]any)["key"].(string))
	})
	m["sigs"] = sigs
	return m
}

// bloat gives a fake server a valid entry far over a client frame: 40 chain records of 16 signers.
func bloat(t *testing.T, n *rt.Net, m *fakeServer, name string) {
	op, k1 := rt.Key("op "+name), rt.Key("k1 "+name)
	var pad []*fed.Signer
	for i := 0; i < 14; i++ {
		pad = append(pad, rt.Key(fmt.Sprint("pad", i)))
	}
	now := n.Clock.Unix()
	head := m.ID
	var ch []any
	for i := 0; i < 40; i++ {
		action := "add_operator"
		if i%2 == 1 {
			action = "remove_operator"
		}
		rec := multi(op, append([]*fed.Signer{op, k1}, pad...), "operators", now, map[string]any{"server": m.ID, "prev": head, "action": action, "target": k1.Key})
		ch = append(ch, rec)
		head = rt.ID(rec)
	}
	st := &ops.State{Server: m.ID, Head: head, Operators: []string{op.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{m.Node.Key, "wss://" + strings.ReplaceAll(name, " ", "-") + ".example.net/fed"})
	m.entry["chain"] = ch
	m.entry["server"] = ops.ServerRecord(st, op, ops.ServerFields{Name: name, Sync: "open", NoLogs: true, Langs: []string{"en"}}, now)
	if size := len(canon.Encode(m.entry)); size <= fed.ClientFrame {
		t.Fatalf("entry of %d bytes is not bloated", size)
	}
}

// An entry that could never fit a client's catalog frame is refused, from gossip and from the
// catalog file, and `servers` keeps answering in frames a client can read.
func TestBloatedCatalogEntryIsRefused(t *testing.T) {
	n := rt.New(t)
	a := n.Found("victim", "open")
	x := a.Nodes[0]
	m := makeServer(t, n, "bloat")
	bloat(t, n, m, "bloat")
	r := connectAs(t, x, m)
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{m.entry}}))
	refused := false
	for i := 0; i < 10 && !refused; i++ {
		code, open := r.next()
		if !open {
			t.Fatal("the session closed over one refused entry")
		}
		refused = code == fed.TooBig
	}
	if !refused {
		t.Fatal("the bloated entry was not refused")
	}
	servers := func() {
		t.Helper()
		items, err := x.Client(nil).Collect(ctx(t), map[string]any{"m": "servers"})
		if err != nil {
			t.Fatalf("servers: %v", err)
		}
		list, _ := items[0]["entries"].([]any)
		for _, e := range list {
			if v, _ := canon.Check(e); len(canon.Encode(v)) > fed.ClientFrame-1024 {
				t.Fatal("servers sent an entry no client frame holds")
			}
			srv, _ := e.(map[string]any)["server"].(map[string]any)
			if body, _ := srv["body"].(map[string]any); body["server"] == m.ID {
				t.Fatal("the bloated entry was kept")
			}
		}
	}
	servers()
	// A catalog file written before the bound holds it: it is not loaded.
	x.Stop()
	file := canon.Encode(map[string]any{"entries": []any{m.entry}})
	if err := os.WriteFile(filepath.Join(x.Dir, "catalog.json"), file, 0o600); err != nil {
		t.Fatal(err)
	}
	x.Restart()
	servers()
}

// A peer of an unknown server that never sends its own entry is dropped after the verify time,
// pings or not; the frames it may have held meanwhile are bounded by bytes.
func TestUnverifiedPeersAreBounded(t *testing.T) {
	t.Cleanup(node.SetVerifyTimeout(time.Second))
	n := rt.New(t)
	a := n.Found("slots", "open")
	x := a.Nodes[0]
	r := connectAs(t, x, makeServer(t, n, "squatter"))
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "carry", "classes": []any{"players"}, "since": int64(0)}))
	closed := make(chan bool, 1)
	go func() {
		for {
			if _, open := r.next(); !open {
				closed <- true
				return
			}
		}
	}()
	for i := 0; ; i++ {
		select {
		case <-closed:
			if i < 3 {
				t.Fatalf("closed after %d pings", i)
			}
			goto held
		case <-time.After(300 * time.Millisecond):
		}
		if i > 15 {
			t.Fatal("an unverified peer that only pings was kept past the verify time")
		}
		r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "ping", "id": int64(i + 1)}))
	}
held:
	// Two frames of 600 KB to hold: more than 1 MB held ends the session at once.
	r2 := connectAs(t, x, makeServer(t, n, "hoarder"))
	pad := strings.Repeat("x", 600<<10)
	for i := 0; i < 2; i++ {
		r2.send(websocket.MessageText, canon.Encode(map[string]any{"m": "push", "items": []any{map[string]any{"rec": map[string]any{"pad": pad}}}}))
	}
	start := time.Now()
	for {
		code, open := r2.next()
		if !open || code == fed.NotNode {
			break
		}
	}
	if time.Since(start) > 900*time.Millisecond {
		t.Fatal("held frames were not bounded by bytes")
	}
}

// Sessions of servers nobody knows cannot take the slots this server's own nodes sync through.
func TestOwnNodesKeepTheirSlots(t *testing.T) {
	n := rt.New(t)
	s := n.Found("crowded", "open")
	x := s.Nodes[0]
	cfg := *x.Cfg
	cfg.Limits.MaxNodes = 2
	x.Cfg = &cfg
	x.R.Reload(&cfg)
	for i := 0; i < 3; i++ {
		connectAs(t, x, makeServer(t, n, fmt.Sprint("squatter ", i)))
	}
	time.Sleep(100 * time.Millisecond)
	// Of two nodes, the one with the lower key dials: the new node must be the one that dials x.
	name := ""
	for i := 0; name == ""; i++ {
		if c := fmt.Sprint("crowded", i); rt.Key("node "+c).Key < x.Key.Key {
			name = c
		}
	}
	y := n.AddNode(s, name)
	ann := rt.Announce(rt.Key("alice"), n.Clock.Unix(), "Alice")
	y.MustPut(ann)
	rt.Eventually(t, "the second node's record on the first", func() bool { return x.Has(rt.ID(ann)) })
	ann2 := rt.Announce(rt.Key("bob"), n.Clock.Unix(), "Bob")
	x.MustPut(ann2)
	rt.Eventually(t, "the first node's record on the second", func() bool { return y.Has(rt.ID(ann2)) })
}

// Votes count only from registry servers (10.7): a server known from gossip alone, which costs
// nothing to make up, cannot fill the store and the tally with votes. A registry server's votes
// are bounded too.
func TestVotesOfGossipOnlyServersAreRefused(t *testing.T) {
	t.Cleanup(node.SetAuthorLimits(3, 4096, 128))
	n := rt.New(t)
	a := n.Found("victim", "open")
	x := a.Nodes[0]
	m := makeServer(t, n, "sockpuppet")
	r := connectAs(t, x, m)
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{m.entry}}))
	rt.Eventually(t, "fake server in catalog", func() bool { return catalogIDs(t, x)[m.ID] })
	op := rt.Key("op sockpuppet")
	now := n.Clock.Unix()
	for i := 0; i < 20; i++ {
		v := op.Seal("shun", now, map[string]any{"server": m.ID, "target": rt.Key(fmt.Sprint("victim", i)).Key, "reason": "spam"})
		if code := x.Put(v); code != fed.UnknownSrv {
			t.Fatalf("vote of a gossip-only server: %q", code)
		}
	}
	if x.Count("shun") != 0 {
		t.Fatal("votes of a gossip-only server were stored")
	}
	reg, voters := rt.Registry(6, now-now%fed.Day, now)
	if err := x.R.SetRegistry(reg); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		x.MustPut(vote(n, voters[0], rt.Key(fmt.Sprint("target", i)).Key, "spam"))
	}
	if code := x.Put(vote(n, voters[0], rt.Key("one too many").Key, "spam")); code != fed.TooMany {
		t.Fatalf("a vote over the per-server bound: %q", code)
	}
	x.MustPut(vote(n, voters[1], rt.Key("one too many").Key, "spam"))
}

// One key keeps one announce per slot, the newest; offers are bounded per key and pair.
func TestAnnouncesAndOffersPerKeyAreBounded(t *testing.T) {
	t.Cleanup(node.SetAuthorLimits(8192, 6, 3))
	n := rt.New(t)
	s := n.Found("flood", "open")
	x := s.Nodes[0]
	k := rt.Key("mallory")
	c := x.Client(nil)
	now := n.Clock.Unix()
	var newest map[string]any
	for i := 0; i < 30; i++ {
		newest = rt.Announce(k, now-30+int64(i), fmt.Sprint("Spam ", i))
		f, err := c.Request(ctx(t), map[string]any{"m": "put", "rec": newest})
		if err != nil || f.M != "ack" {
			t.Fatalf("announce %d: %v %v", i, err, f.Raw)
		}
	}
	if got := x.Count("announce"); got != 1 || !x.Has(rt.ID(newest)) {
		t.Fatalf("one key keeps %d announces in one slot", got)
	}
	// An older announce of the same slot is not stored over the newest.
	if code := x.Put(rt.Announce(k, now-100, "Older")); code != fed.Refused {
		t.Fatalf("older announce in the same slot: %q", code)
	}
	// The next slot keeps its own.
	n.Clock.Add(5 * time.Minute)
	x.MustPut(rt.Announce(k, n.Clock.Unix(), "Later"))
	if got := x.Count("announce"); got != 2 {
		t.Fatalf("%d announces over two slots", got)
	}
	now = n.Clock.Unix()
	bob, carol := rt.Key("bob").Key, rt.Key("carol").Key
	for i := 0; i < 3; i++ {
		x.MustPut(rt.Offer(k, now-int64(i), bob))
	}
	if code := x.Put(rt.Offer(k, now-10, bob)); code != fed.TooMany {
		t.Fatalf("an offer over the per-pair bound: %q", code)
	}
	for i := 0; i < 3; i++ {
		x.MustPut(rt.Offer(k, now-int64(i), carol))
	}
	if code := x.Put(rt.Offer(k, now-10, rt.Key("dave").Key)); code != fed.TooMany {
		t.Fatalf("an offer over the per-key bound: %q", code)
	}
}

// A sub backlog page visits a bounded number of records: records an anonymous session may not
// see are skipped a page at a time, with the cursor moving on.
func TestBacklogScanIsBoundedPerPage(t *testing.T) {
	t.Cleanup(node.SetMaxScan(64))
	n := rt.New(t)
	s := n.Found("offers", "open")
	x := s.Nodes[0]
	now := n.Clock.Unix()
	for i := 0; i < 300; i++ {
		x.MustPut(rt.Offer(rt.Key(fmt.Sprint("from", i)), now-int64(i%100), rt.Key(fmt.Sprint("to", i)).Key))
	}
	c := x.Client(nil)
	_, ch, err := c.Start(ctx(t), map[string]any{"m": "sub", "kinds": []any{"offer"}, "since": ""})
	if err != nil {
		t.Fatal(err)
	}
	frames, cursors := 0, map[string]bool{}
	for {
		f := <-ch
		if f == nil || f.M != "recs" {
			t.Fatalf("frame %v", f)
		}
		frames++
		if items, _ := f.Raw["items"].([]any); len(items) != 0 {
			t.Fatal("an anonymous session got private offers")
		}
		cur, _ := f.Str("cursor")
		cursors[cur] = true
		if more, _ := f.Raw["more"].(bool); !more {
			break
		}
	}
	if frames < 300/64 || len(cursors) != frames {
		t.Fatalf("%d frames, %d cursors: the scan was not paged", frames, len(cursors))
	}
}

// A sub of no kind this node knows gets nothing, not every kind.
func TestSubOfNoKindsGetsNothing(t *testing.T) {
	n := rt.New(t)
	s := n.Found("kinds", "open")
	x := s.Nodes[0]
	now := n.Clock.Unix()
	x.MustPut(rt.Announce(rt.Key("a"), now, "Alpha"))
	x.MustPut(rt.Stats(rt.Key("a"), now, 1, false))
	c := x.Client(nil)
	for _, kinds := range [][]any{{}, {"no_such_kind"}} {
		items, err := c.Collect(ctx(t), map[string]any{"m": "sub", "kinds": kinds, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 0 {
			t.Fatalf("sub of kinds %v returned %d records", kinds, len(items))
		}
	}
}

// The ids remembered as refused stay bounded between retention runs.
func TestRefusedIdsAreBounded(t *testing.T) {
	n := rt.New(t)
	x := n.Found("refuser", "open").Nodes[0]
	for i := 0; i < node.MaxRefused()+100; i++ {
		x.R.Refuse(fmt.Sprint(i))
	}
	if got := x.R.RefusedLen(); got > node.MaxRefused() {
		t.Fatalf("%d refused ids held", got)
	}
}

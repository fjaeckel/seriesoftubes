package node_test

// Bounds on what strangers can make a node store or do: signature padding, votes of unknown
// servers, catalog entries from unverified or chatty peers, backlogs bigger than a queue.

import (
	"bytes"
	"context"
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
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// padded is a copy of a stored multi-signer record with signatures of n strangers added.
func padded(t *testing.T, x *rt.Node, id string, n int, prefix string, also ...*fed.Signer) map[string]any {
	stored := x.R.Get(id)
	sigs := slices.Clone(stored["sigs"].([]any))
	signers := also
	for i := 0; i < n; i++ {
		signers = append(signers, rt.Key(fmt.Sprintf("%s%d", prefix, i)))
	}
	for _, sk := range signers {
		k, sig := sign(t, x, id, sk)
		sigs = append(sigs, map[string]any{"key": k, "sig": sig})
	}
	slices.SortFunc(sigs, func(a, b any) int {
		return strings.Compare(a.(map[string]any)["key"].(string), b.(map[string]any)["key"].(string))
	})
	cp := map[string]any{}
	for k, v := range stored {
		cp[k] = v
	}
	cp["sigs"] = sigs
	return cp
}

func TestSignaturePaddingIsRefused(t *testing.T) {
	n := rt.New(t)
	s := n.Found("stuffed", "open")
	x := s.Nodes[0]
	ben, cleo := rt.Key("ben"), rt.Key("cleo")
	p, _ := ops.Propose(x.State(), s.Op, "add-operator", ben.Key, "", n.Clock.Unix())
	x.MustPut(p)
	p2, _ := ops.Propose(x.State(), s.Op, "add-operator", cleo.Key, "", n.Clock.Unix())
	x.MustPut(p2)
	id := rt.ID(p2)
	c := x.Client(nil)
	// A stranger's put of the pending proposal with 15 junk signatures is refused whole.
	if _, err := c.Put(ctx(t), padded(t, x, id, 15, "junk")); code(err) != fed.NotOperator {
		t.Fatalf("padded proposal: %v", err)
	}
	if got := len(x.R.Get(id)["sigs"].([]any)); got != 1 {
		t.Fatalf("stored signatures after a padded put: %d", got)
	}
	// So the real operator's cosign still fits.
	k, sig := sign(t, x, id, ben)
	if _, err := c.Request(ctx(t), map[string]any{"m": "cosign", "rid": id, "key": k, "sig": sig}); err != nil {
		t.Fatalf("operator cosign: %v", err)
	}
	// Same for a server record.
	srv := s.Describe(x, s.Op)
	x.MustPut(srv)
	if _, err := c.Put(ctx(t), padded(t, x, rt.ID(srv), 3, "pad")); code(err) != fed.NotOperator {
		t.Fatalf("padded server record: %v", err)
	}
}

func TestMergedSignaturesKeepOperatorsOnly(t *testing.T) {
	// Two copies padded within the 16 each: their union would pass 16 and make every peer
	// refuse the record. Copies from this server's own nodes merge, so the store filters.
	n := rt.New(t)
	s := n.Found("merge", "open")
	x := s.Nodes[0]
	ben := rt.Key("ben")
	p, _ := ops.Propose(x.State(), s.Op, "add-operator", ben.Key, "", n.Clock.Unix())
	x.MustPut(p)
	p2, _ := ops.Propose(x.State(), s.Op, "add-operator", rt.Key("cleo").Key, "", n.Clock.Unix())
	x.MustPut(p2)
	id := rt.ID(p2)
	a, b := padded(t, x, id, 12, "a"), padded(t, x, id, 12, "b", ben)
	x.R.Lock()
	for _, v := range []map[string]any{a, b} {
		rec, code := fed.CheckValue(v, n.Clock.Unix(), fed.Opts{})
		if code != "" {
			x.R.Unlock()
			t.Fatal(code)
		}
		if _, _, err := x.R.Store().Put(rec, nil, 0, 0); err != nil {
			x.R.Unlock()
			t.Fatal(err)
		}
	}
	st := x.R.Store()
	got := st.Rec(st.Get(id)).Signers()
	x.R.Unlock()
	if len(got) != 2 || !slices.Contains(got, s.Op.Key) || !slices.Contains(got, ben.Key) {
		t.Fatalf("merged signers %d: want the author and the operator only", len(got))
	}
}

func TestVotesOfUnknownServersAreRefused(t *testing.T) {
	n := rt.New(t)
	s := n.Found("tally", "open")
	x := s.Nodes[0]
	now := n.Clock.Unix()
	reg, voters := rt.Registry(6, now-now%fed.Day, now)
	if err := x.R.SetRegistry(reg); err != nil {
		t.Fatal(err)
	}
	// A flood of votes from made-up servers: each refused, nothing stored, nothing to tally.
	start := time.Now()
	for i := 0; i < 500; i++ {
		v := vote(n, rt.Listed{ID: rt.ID(rt.Announce(rt.Key(fmt.Sprint("srv", i)), now, "x")), Op: rt.Key(fmt.Sprint("op", i))},
			rt.Key(fmt.Sprint("target", i)).Key, "spam")
		if code := x.Put(v); code != fed.UnknownSrv {
			t.Fatalf("vote %d of an unknown server: %q", i, code)
		}
	}
	if x.Count("shun") != 0 {
		t.Fatal("votes of unknown servers were stored")
	}
	// A registered server's vote by one of its operators still counts.
	x.MustPut(vote(n, voters[0], rt.Key("mallory").Key, "spam"))
	if res := x.R.Tally(rt.Key("mallory").Key); res.Votes != 1 {
		t.Fatalf("tally %+v", res)
	}
	t.Logf("500 refused votes in %v", time.Since(start))
}

// fakeServer is a server that exists only as signed records: its own catalog entry and a node key.
type fakeServer struct {
	ID    string
	Node  *fed.Signer
	entry map[string]any
}

func makeServer(t *testing.T, n *rt.Net, name string) *fakeServer {
	op, nk := rt.Key("op "+name), rt.Key("node "+name)
	now := n.Clock.Unix()
	url := "wss://" + strings.ReplaceAll(name, " ", "-") + ".example.net/fed"
	g := op.Seal("genesis", now, map[string]any{"name": name, "node": map[string]any{"key": nk.Key, "url": url}})
	gid := rt.ID(g)
	st := &ops.State{Server: gid, Head: gid, Operators: []string{op.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{nk.Key, url})
	srv := ops.ServerRecord(st, op, ops.ServerFields{Name: name, Sync: "open", NoLogs: true, Langs: []string{"en"}}, now)
	return &fakeServer{ID: gid, Node: nk, entry: map[string]any{"genesis": g, "chain": []any{}, "server": srv,
		"path": []any{gid}, "seen": now}}
}

// via is the entry as a neighbour passes it on.
func (f *fakeServer) via(path ...string) map[string]any {
	e := map[string]any{}
	for k, v := range f.entry {
		e[k] = v
	}
	p := []any{f.ID}
	for _, x := range path {
		p = append(p, x)
	}
	e["path"] = p
	return e
}

// connectAs opens a node session to x as the fake server's node and finishes the handshake.
func connectAs(t *testing.T, x *rt.Node, f *fakeServer) *raw {
	r, err := dialRaw(t, x, []string{fed.Subprotocol})
	if err != nil {
		t.Fatal(err)
	}
	mine := fed.Encode(bytes.Repeat([]byte{9}, 32))
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node",
		"server": f.ID, "node": f.Node.Key, "nonce": mine}))
	c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, wb, err := r.c.Read(c)
	if err != nil {
		t.Fatal(err)
	}
	w, _ := wire.Parse(wb, fed.NodeFrame)
	theirs, _ := w.Str("nonce")
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "proof", "proof": f.Node.MakeProof(theirs, f.ID, x.Net.Clock.Unix())}))
	return r
}

func catalogIDs(t *testing.T, x *rt.Node) map[string]bool {
	items, err := x.Client(nil).Collect(ctx(t), map[string]any{"m": "servers"})
	if err != nil || len(items) != 1 {
		t.Fatalf("servers: %v", err)
	}
	out := map[string]bool{}
	list, _ := items[0]["entries"].([]any)
	for _, e := range list {
		srv, _ := e.(map[string]any)["server"].(map[string]any)
		body, _ := srv["body"].(map[string]any)
		id, _ := body["server"].(string)
		out[id] = true
	}
	return out
}

func TestCatalogFromUnverifiedAndChattyPeers(t *testing.T) {
	restore := node.SetCatalogLimits(4096, 3)
	t.Cleanup(restore) // registered before the net, so it runs after the nodes stop
	n := rt.New(t)
	a := n.Found("gossip victim", "open")
	x := a.Nodes[0]
	m := makeServer(t, n, "chatty")
	var others []*fakeServer
	for i := 0; i < 6; i++ {
		others = append(others, makeServer(t, n, fmt.Sprint("listed elsewhere ", i)))
	}
	has := func(f *fakeServer) bool { return catalogIDs(t, x)[f.ID] }
	r := connectAs(t, x, m)
	// Before its own entry, nothing a peer says about other servers is read; after it, at most
	// three entries (its own included) come through this one neighbour.
	frame := []any{others[0].via(m.ID), m.entry}
	for _, o := range others[1:] {
		frame = append(frame, o.via(m.ID))
	}
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": frame}))
	rt.Eventually(t, "the peer's own entry", func() bool { return has(m) && has(others[2]) })
	time.Sleep(100 * time.Millisecond)
	if has(others[0]) {
		t.Fatal("an entry sent before the peer was verified was stored")
	}
	for _, o := range others[3:] {
		if has(o) {
			t.Fatal("more entries than the per-neighbour bound were stored")
		}
	}
	// The catalog file is written later, not once per entry; a stop writes it.
	if _, err := os.Stat(filepath.Join(x.Dir, "catalog.json")); err == nil {
		t.Fatal("the catalog file was written at once")
	}
	x.Restart()
	if !has(m) || !has(others[2]) {
		t.Fatal("the catalog was not saved on stop")
	}
}

func TestBacklogsArePagedWithTheirOwnCursors(t *testing.T) {
	n := rt.New(t)
	s := n.Found("busy", "open")
	x := s.Nodes[0]
	// An epoch with '-' in it, as a random one has about one start in eight: cursors must still read back.
	x.R.SetEpoch("ab-cd_ef")
	// About 5.6 MB of stats in the window: more than a client's queue may hold at once.
	const players = 200
	t0 := n.Clock.Unix()
	pops := map[string]any{}
	for j := 0; j < 512; j++ {
		pops[fmt.Sprintf("c%07d", j)] = int64(1000)
	}
	var traffic []any
	for j := 0; j < 256; j++ {
		traffic = append(traffic, map[string]any{"key": rt.Key(fmt.Sprint("peer ", j)).Key, "in": int64(100000), "out": int64(100000)})
	}
	for i := 0; i < players; i++ {
		k := rt.Key(fmt.Sprint("player ", i))
		x.MustPut(k.Seal("stats", t0, map[string]any{"mode": "normal", "pops": pops, "traffic": traffic, "tier1": false, "shareCountry": false}))
	}
	n.Clock.Add(10 * time.Minute)
	long, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	c := x.Client(nil)
	// The node ranks them all and sends the top rows only.
	f := ask(t, c, map[string]any{"m": "rank", "board": "traffic", "measure": "total", "division": "all"})
	if n, _ := wire.Int(f.Raw["n"]); n != players || len(rowKeys(f)) != 50 {
		t.Fatalf("rank: %d of %d rows", len(rowKeys(f)), n)
	}
	// A sub's backlog: every page carries the cursor of what it covers.
	id, ch, err := c.Start(long, map[string]any{"m": "sub", "kinds": []any{"stats"}, "since": ""})
	if err != nil {
		t.Fatal(err)
	}
	var cursors []string
	var counts []int
	for {
		f := <-ch
		if f == nil || f.M != "recs" {
			t.Fatalf("sub: %v", f)
		}
		list, _ := f.Raw["items"].([]any)
		cur, _ := f.Str("cursor")
		cursors, counts = append(cursors, cur), append(counts, len(list))
		if more, _ := f.Raw["more"].(bool); !more {
			break
		}
	}
	c.Stop(id)
	total := 0
	for _, k := range counts {
		total += k
	}
	if total != players || len(cursors) < 3 {
		t.Fatalf("sub backlog: %d items in %d pages", total, len(cursors))
	}
	for i := 1; i < len(cursors); i++ {
		if cursors[i] == cursors[i-1] {
			t.Fatal("pages share a cursor: a drop mid-backlog would skip the rest")
		}
	}
	// A client that dropped after the second page resumes with that page's cursor.
	rest, err := x.Client(nil).Collect(long, map[string]any{"m": "sub", "kinds": []any{"stats"}, "since": cursors[1]})
	if err != nil || len(rest) != players-counts[0]-counts[1] {
		t.Fatalf("resume: %d items, want %d (%v)", len(rest), players-counts[0]-counts[1], err)
	}
	// Whole-store requests are throttled per connection.
	var chans []<-chan *wire.Frame
	for i := 0; i < 12; i++ {
		_, ch, err := c.Start(long, map[string]any{"m": "servers"})
		if err != nil {
			t.Fatal(err)
		}
		chans = append(chans, ch)
	}
	limited := 0
	for _, ch := range chans {
		if f := <-ch; f != nil && f.M == "err" {
			if code, _ := f.Str("code"); code == fed.RateLimited {
				limited++
			}
		}
	}
	if limited == 0 {
		t.Fatal("twelve catalogs at once were not rate limited")
	}
}

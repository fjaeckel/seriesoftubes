package node_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

func TestGenesisIsTheServerIdentity(t *testing.T) {
	n := rt.New(t)
	s := n.Found("ident", "open")
	x := s.Nodes[0]
	st := x.State()
	if st.Server != s.ID || st.Head != s.ID {
		t.Fatalf("state %+v", st)
	}
	g, code := fed.CheckValue(x.R.Get(s.ID), n.Clock.Unix(), fed.Opts{})
	if code != "" || g.Kind != "genesis" || fed.Hash(g.Canon()) != s.ID {
		t.Fatalf("genesis %v %s", g, code)
	}
	// The registry file the operators submit passes the registry checks (steps 1 to 7).
	b, err := x.R.RegistryFile()
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{s.ID + ".json": b}
	if f := registry.Check(s.ID+".json", files, nil, n.Clock.Unix(), nil); f != nil {
		t.Fatal(f)
	}
}

// sign cosigns a stored record as op.
func sign(t *testing.T, x *rt.Node, id string, op *fed.Signer) (string, string) {
	sig, err := ops.Cosign(x.R.Get(id), op)
	if err != nil {
		t.Fatal(err)
	}
	return op.Key, sig
}

func TestProposalsNeedAMajorityAndExpire(t *testing.T) {
	n := rt.New(t)
	s := n.Found("ops", "open")
	x := s.Nodes[0]
	ben, cleo, dan := rt.Key("ben"), rt.Key("cleo"), rt.Key("dan")
	// One of one: adding ben takes effect at once.
	p, _ := ops.Propose(x.State(), s.Op, "add-operator", ben.Key, "", n.Clock.Unix())
	x.MustPut(p)
	if st := x.State(); len(st.Operators) != 2 {
		t.Fatalf("operators %v", st.Operators)
	}
	// One of two is not a majority: pending, over the local socket as the command line does it.
	p2, _ := ops.Propose(x.State(), s.Op, "add-operator", cleo.Key, "", n.Clock.Unix())
	resp, err := ops.Call(x.Dir, ops.Request{Cmd: "put", Rec: canon.Encode(p2)})
	if err != nil || !resp.OK {
		t.Fatalf("socket put: %v %+v", err, resp)
	}
	if st := x.State(); len(st.Operators) != 2 {
		t.Fatal("applied without a majority")
	}
	if len(x.R.Pending()) != 1 {
		t.Fatalf("pending %v", x.R.Pending())
	}
	// A key that is not an operator cannot sign it in, over wss.
	c := x.Client(nil)
	k, sig := sign(t, x, rt.ID(p2), dan)
	if _, err := c.Request(ctx(t), map[string]any{"m": "cosign", "rid": rt.ID(p2), "key": k, "sig": sig}); code(err) != fed.NotOperator {
		t.Fatalf("cosign by a non-operator: %v", err)
	}
	// A bad signature by an operator is refused as a whole.
	if _, err := c.Request(ctx(t), map[string]any{"m": "cosign", "rid": rt.ID(p2), "key": ben.Key, "sig": sig}); code(err) != fed.BadSig {
		t.Fatalf("cosign with a bad signature: %v", err)
	}
	// Ben signs over wss: two of two, applied.
	k, sig = sign(t, x, rt.ID(p2), ben)
	if _, err := c.Request(ctx(t), map[string]any{"m": "cosign", "rid": rt.ID(p2), "key": k, "sig": sig}); err != nil {
		t.Fatal(err)
	}
	if st := x.State(); len(st.Operators) != 3 || st.Head != rt.ID(p2) {
		t.Fatalf("not applied: %+v", st)
	}
	// A third proposal waits for two of three, and expires after 14 days.
	p3, _ := ops.Propose(x.State(), s.Op, "add-operator", dan.Key, "", n.Clock.Unix())
	x.MustPut(p3)
	n.Clock.Add(14*24*time.Hour - time.Second)
	if len(x.R.Pending()) != 1 {
		t.Fatal("expired early")
	}
	n.Clock.Add(time.Second)
	if len(x.R.Pending()) != 0 {
		t.Fatal("still pending after 14 days")
	}
	k, sig = sign(t, x, rt.ID(p3), ben)
	if _, err := c.Request(ctx(t), map[string]any{"m": "cosign", "rid": rt.ID(p3), "key": k, "sig": sig}); code(err) != fed.TooOld {
		t.Fatalf("cosign after expiry: %v", err)
	}
	// Expiry does not undo what was applied.
	if st := x.State(); len(st.Operators) != 3 {
		t.Fatal("expiry undid an applied proposal")
	}
}

func TestOperatorActionsCheckedOnBothPaths(t *testing.T) {
	n := rt.New(t)
	s := n.Found("mod", "open")
	x := s.Nodes[0]
	mallory := rt.Key("mallory")
	victim := rt.Key("victim")
	st := x.State()
	bad, _ := ops.Hide(st, mallory, "refuse", victim.Key, true, n.Clock.Unix())
	// Over the local socket.
	resp, err := ops.Call(x.Dir, ops.Request{Cmd: "put", Rec: canon.Encode(bad)})
	if err != nil || resp.Error != fed.NotOperator {
		t.Fatalf("socket: %v %+v", err, resp)
	}
	// Over wss.
	c := x.Client(nil)
	if _, err := c.Put(ctx(t), bad); code(err) != fed.NotOperator {
		t.Fatalf("wss: %v", err)
	}
	// The operator's own refusal works on both, and refuses the network's new records.
	good, _ := ops.Hide(st, s.Op, "refuse", victim.Key, true, n.Clock.Unix())
	if _, err := c.Put(ctx(t), good); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Put(ctx(t), rt.Stats(victim, n.Clock.Unix(), 1, false)); code(err) != fed.Refused {
		t.Fatalf("refused key: %v", err)
	}
	shun, _ := ops.Shun(x.State(), mallory, victim.Key, "spam", n.Clock.Unix())
	if _, err := c.Put(ctx(t), shun); code(err) != fed.NotOperator {
		t.Fatalf("shun by a non-operator: %v", err)
	}
	// The socket refuses everyone but the owner of the data folder.
	fi, err := os.Stat(filepath.Join(x.Dir, ops.SocketName))
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("socket mode %v %v", fi.Mode(), err)
	}
}

func TestNodeNotOnTheListRefused(t *testing.T) {
	n := rt.New(t)
	s := n.Found("closed", "open")
	x := s.Nodes[0]
	intruder := rt.Key("intruder")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, x.URL, &websocket.DialOptions{HTTPClient: n.HTTP, Subprotocols: []string{fed.Subprotocol}})
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	send := func(m map[string]any) {
		if err := c.Write(ctx, websocket.MessageText, canon.Encode(m)); err != nil {
			t.Fatal(err)
		}
	}
	read := func() *wire.Frame {
		_, b, err := c.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		f, werr := wire.Parse(b, fed.NodeFrame)
		if werr != nil {
			t.Fatal(werr.Code)
		}
		return f
	}
	mine := fed.Encode(make([]byte, 32))
	send(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node", "server": s.ID, "node": intruder.Key, "nonce": mine})
	w := read()
	theirs, _ := w.Str("nonce")
	pv, _ := canon.Check(w.Raw["proof"])
	if code := fed.CheckProof(pv, mine, s.ID, x.Key.Key, n.Clock.Unix()); code != "" {
		t.Fatalf("node's proof: %s", code)
	}
	send(map[string]any{"m": "proof", "proof": intruder.MakeProof(theirs, s.ID, n.Clock.Unix())})
	for {
		f := read()
		if f.M == "err" {
			if c, _ := f.Str("code"); c != fed.NotNode {
				t.Fatalf("got %s", c)
			}
			return
		}
	}
}

func TestDataMigratedOnStart(t *testing.T) {
	// A folder from before versioning: stamped and loaded.
	dir := rt.Dir(t)
	alice := rt.Key("alice")
	st, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	rec, _ := fed.CheckValue(rt.Announce(alice, rt.Start, "Alice"), rt.Start, fed.Opts{})
	if _, _, err := st.Put(rec, nil, fed.Slot(rt.Start), rt.Start/fed.Day); err != nil {
		t.Fatal(err)
	}
	st.Close()
	os.Remove(filepath.Join(dir, "VERSION"))
	st, err = store.Open(dir)
	if err != nil || st.Get(rec.ID) == nil {
		t.Fatalf("unversioned folder: %v", err)
	}
	st.Close()
	if b, _ := os.ReadFile(filepath.Join(dir, "VERSION")); !strings.Contains(string(b), `"v":1`) {
		t.Fatalf("VERSION %q", b)
	}
	// An upgrade runs each migration in turn and stamps the new version.
	ran := false
	store.Migrations[1] = func(d string) error { ran = d == dir; return nil }
	store.DataVersion = 2
	defer func() { store.DataVersion = 1; delete(store.Migrations, 1) }()
	st, err = store.Open(dir)
	if err != nil || !ran || st.Get(rec.ID) == nil {
		t.Fatalf("migration: %v %v", err, ran)
	}
	st.Close()
	// A folder from a newer relay is refused rather than misread.
	store.DataVersion = 1
	if _, err := node.New(node.Options{Dir: dir, Node: rt.Key("n")}); err == nil || !strings.Contains(err.Error(), "upgrade the relay") {
		t.Fatalf("newer folder: %v", err)
	}
}

func TestTwoProtocolVersionsTalk(t *testing.T) {
	n := rt.New(t)
	s := n.Found("versions", "open")
	x := s.Nodes[0]
	// A client that speaks 1 and a future 2 is answered in 1.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, err := client.Dial(ctx, x.URL, client.Options{HTTPClient: n.HTTP, Versions: []int64{1, 2}})
	if err != nil || c.Welcome.Ver != 1 {
		t.Fatalf("1+2 against 1: %v %+v", err, c)
	}
	c.Close()
	// One that speaks only 2 is unsupported.
	if _, err := client.Dial(ctx, x.URL, client.Options{HTTPClient: n.HTTP, Versions: []int64{2}}); code(err) != fed.Unsupported {
		t.Fatalf("2 against 1: %v", err)
	}
	// Two nodes, one of them already speaking a newer version too, sync in version 1.
	y := n.Listen("versions2")
	cfg := config.Default()
	cfg.Server, cfg.URL, cfg.Seeds, cfg.Registry = s.ID, y.URL, []string{x.URL}, ""
	y.Versions = []int64{1, 2}
	y.Start(rt.Dir(t), cfg)
	p, _ := ops.Propose(x.State(), s.Op, "add-node", y.Key.Key, y.URL, n.Clock.Unix())
	x.MustPut(p)
	x.MustPut(s.Describe(x, s.Op))
	id := announce(t, s, "versioned")
	rt.Eventually(t, "sync between versions", func() bool { return y.Has(id) })
	for _, p := range x.R.Status()["peers"].([]map[string]any) {
		if p["node"] == y.Key.Key && p["ver"] != int64(1) {
			t.Fatalf("session version %v", p["ver"])
		}
	}
}

func TestStatusOverTheSocket(t *testing.T) {
	n := rt.New(t)
	s := n.Found("status", "open")
	x := s.Nodes[0]
	announce(t, s, "someone")
	for _, cmd := range []string{"status", "servers", "players", "nodes", "pending", "state"} {
		resp, err := ops.Call(x.Dir, ops.Request{Cmd: cmd})
		if err != nil || !resp.OK {
			t.Fatalf("%s: %v %+v", cmd, err, resp)
		}
		b, _ := json.Marshal(resp.Result)
		if cmd == "players" && !strings.Contains(string(b), "someone") {
			t.Fatalf("players: %s", b)
		}
	}
	out := filepath.Join(rt.Dir(t), "backup.tar.gz")
	resp, err := ops.Call(x.Dir, ops.Request{Cmd: "backup", Path: out})
	if err != nil || !resp.OK {
		t.Fatalf("backup: %v %+v", err, resp)
	}
	if fi, err := os.Stat(out); err != nil || fi.Size() == 0 || fi.Mode().Perm() != 0o600 {
		t.Fatalf("backup file: %v %v", fi, err)
	}
}

package main

import (
	"bytes"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// edit rewrites a registry file's JSON through f.
func edit(t *testing.T, b []byte, f func(m map[string]any)) []byte {
	var m map[string]any
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if err := d.Decode(&m); err != nil {
		t.Fatal(err)
	}
	f(m)
	out, _ := json.Marshal(m)
	return out
}

func check(t *testing.T, dir, name string, live *rt.Net) string {
	var out bytes.Buffer
	var ch registry.Challenger
	if live != nil {
		ch = liveChallenge(live.HTTP, live.Clock.Unix)
	}
	checkFiles([]string{filepath.Join(dir, name)}, "", ch, &out)
	return strings.TrimSpace(out.String())
}

func TestCheckRegistry(t *testing.T) {
	n := rt.New(t)
	s := n.Found("Listed Server", "open")
	b, err := s.Nodes[0].R.RegistryFile()
	if err != nil {
		t.Fatal(err)
	}
	dir := rt.Dir(t)
	name := s.ID + ".json"
	write := func(n string, b []byte) {
		if err := os.WriteFile(filepath.Join(dir, n), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(name, b)
	// Signed, and its node answers the challenge: accepted.
	if got := check(t, dir, name, n); !strings.HasSuffix(got, ": ok") {
		t.Fatalf("valid file: %s", got)
	}
	// No node answers: refused at step 9 (offline skips the step).
	s.Nodes[0].Stop()
	if got := check(t, dir, name, n); !strings.HasSuffix(got, "step 9: no_answer") {
		t.Fatalf("no answer: %s", got)
	}
	if got := check(t, dir, name, nil); !strings.HasSuffix(got, ": ok") {
		t.Fatalf("offline: %s", got)
	}
	cases := []struct {
		what string
		b    []byte
		want string
	}{
		{"unsigned", edit(t, b, func(m map[string]any) { delete(m["server"].(map[string]any), "sigs") }), "step 2: missing_field"},
		{"wrongly signed", edit(t, b, func(m map[string]any) {
			m["server"].(map[string]any)["body"].(map[string]any)["desc"] = "changed after signing"
		}), "step 2: bad_sig"},
		{"oversized", append(b[:len(b)-2], []byte(strings.Repeat(" ", 70000)+"}")...), "step 1: too_big"},
		{"without noLogs", nil, "step 6: no_logs"},
		{"stamped by the operator", edit(t, b, func(m map[string]any) { m["listed"] = 1764633600 }), ""},
	}
	op := s.Op
	st := s.Nodes[0]
	_ = st
	// A server record with noLogs false, properly signed.
	cases[3].b = edit(t, b, func(m map[string]any) {
		srv := m["server"].(map[string]any)
		srv["body"].(map[string]any)["noLogs"] = false
		resign(t, srv, op)
	})
	for _, c := range cases[:4] {
		write(name, c.b)
		if got := check(t, dir, name, nil); !strings.Contains(got, ": "+c.want) {
			t.Errorf("%s: got %q, want %q", c.what, got, c.want)
		}
	}
	// listed and answered are only the weekly job's to change (step 8 against the base).
	write(name, cases[4].b)
	var out bytes.Buffer
	baseDir := rt.Dir(t)
	os.WriteFile(filepath.Join(baseDir, name), b, 0o644)
	files, _ := registry.ReadFolder(dir)
	baseFiles, _ := registry.ReadFolder(baseDir)
	if f := registry.Check(name, files, baseFiles[name], n.Clock.Unix(), nil); f == nil || f.Step != 8 {
		t.Fatalf("stamp changed: %v", f)
	}
	_ = out
	// A second server with the same name, letters in another case.
	write(name, b)
	other := rt.Key("other op")
	oid, ob := rt.FileFor("LISTED SERVER", other, rt.Key("other node"), "wss://other.example.org/fed", n.Clock.Unix(), nil, nil, true)
	write(oid+".json", ob)
	if got := check(t, dir, oid+".json", nil); !strings.Contains(got, ": step 7: name_taken") {
		t.Fatalf("duplicate name: %s", got)
	}
	// A file not named after its genesis id.
	write("Wrongname.json", b)
	if got := check(t, dir, "Wrongname.json", nil); !strings.Contains(got, "step 3: id_mismatch") {
		t.Fatalf("file name: %s", got)
	}
}

// resign replaces a multi-signer record's sigs with one by op.
func resign(t *testing.T, rec map[string]any, op *fed.Signer) {
	delete(rec, "sigs")
	b, _ := json.Marshal(rec)
	v, code := canon.ParseStrict(b)
	if code != "" {
		t.Fatal(code)
	}
	rec["sigs"] = []any{map[string]any{"key": op.Key, "sig": op.Sign(canon.Encode(v))}}
}

func TestCheckRegistryChainNeedsMajority(t *testing.T) {
	n := rt.New(t)
	s := n.Found("Majority", "open")
	x := s.Nodes[0]
	ben := rt.Key("ben")
	p, _ := ops.Propose(x.State(), s.Op, "add-operator", ben.Key, "", n.Clock.Unix())
	x.MustPut(p)
	// Now two operators: a proposal signed by one of them is only pending...
	cleo := rt.Key("cleo")
	p2, _ := ops.Propose(x.State(), s.Op, "add-operator", cleo.Key, "", n.Clock.Unix())
	x.MustPut(p2)
	x.MustPut(s.Describe(x, s.Op)) // a server record at the head, signed by one of two: not valid
	b, err := x.R.RegistryFile()
	if err == nil {
		t.Fatalf("a registry file without a majority-signed server record: %s", b)
	}
	// Ben cosigns the server record: two of two.
	srv := x.R.Pending()
	var sid string
	for _, p := range srv {
		if p["kind"] == "server" {
			sid = p["id"].(string)
		}
	}
	sig, _ := ops.Cosign(x.R.Get(sid), ben)
	if _, code := x.R.Cosign(sid, ben.Key, sig); code != "" {
		t.Fatal(code)
	}
	b, err = x.R.RegistryFile()
	if err != nil {
		t.Fatal(err)
	}
	dir := rt.Dir(t)
	os.WriteFile(filepath.Join(dir, s.ID+".json"), b, 0o644)
	if got := check(t, dir, s.ID+".json", n); !strings.HasSuffix(got, ": ok") {
		t.Fatalf("two operators: %s", got)
	}
	// Smuggling the pending proposal into the chain: refused for want of a majority.
	bad := edit(t, b, func(m map[string]any) {
		var pv any
		pb, _ := json.Marshal(x.R.Get(rt.ID(p2)))
		json.Unmarshal(pb, &pv)
		m["chain"] = append(m["chain"].([]any), pv)
	})
	os.WriteFile(filepath.Join(dir, s.ID+".json"), bad, 0o644)
	if got := check(t, dir, s.ID+".json", nil); !strings.HasSuffix(got, "step 4: no_majority") {
		t.Fatalf("chain without majority: %s", got)
	}
}

// The flow docs/RELAY.md describes: a second operator joins, then their node.
func TestSecondOperatorAndNode(t *testing.T) {
	n := rt.New(t)
	s := n.Found("Duo", "open")
	first := s.Nodes[0]
	ben := rt.Key("ben")
	p, _ := ops.Propose(first.State(), s.Op, "add-operator", ben.Key, "", n.Clock.Unix())
	first.MustPut(p) // one of one: applied
	// Ben's node joins and waits; it is not on the list yet.
	second := n.Listen("duo2")
	cfg := *first.Cfg
	cfg.URL, cfg.Seeds, cfg.Neighbours = second.URL, []string{first.URL}, nil
	second.Start(rt.Dir(t), &cfg)
	add, _ := ops.Propose(first.State(), s.Op, "add-node", second.Key.Key, second.URL, n.Clock.Unix())
	first.MustPut(add)
	if len(first.R.Pending()) != 1 {
		t.Fatal("adding the node should wait for ben")
	}
	// Ben signs from his own machine, over wss.
	if err := cosignOver(first.URL, rt.ID(add), ben, n.HTTP); err != nil {
		t.Fatal(err)
	}
	rt.Eventually(t, "ben's node serving", func() bool { return second.R.State()["serving"] == true })
	// The server is described again and both sign.
	srv := s.Describe(first, s.Op)
	first.MustPut(srv)
	rt.Eventually(t, "the new server record on ben's node", func() bool { return second.Has(rt.ID(srv)) })
	if err := cosignOver(second.URL, rt.ID(srv), ben, n.HTTP); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if t.Failed() {
			_, e1 := first.R.RegistryFile()
			_, e2 := second.R.RegistryFile()
			t.Logf("first: %v %v\nsecond: %v %v\nfirst status %v\nsecond status %v", e1, first.R.Pending(), e2, second.R.Pending(), first.R.Status(), second.R.Status())
		}
	}()
	rt.Eventually(t, "both nodes hold the signed server record", func() bool {
		_, e1 := first.R.RegistryFile()
		_, e2 := second.R.RegistryFile()
		return e1 == nil && e2 == nil
	})
	b, _ := second.R.RegistryFile()
	dir := rt.Dir(t)
	os.WriteFile(filepath.Join(dir, s.ID+".json"), b, 0o644)
	// The registry check passes while either node answers.
	first.Stop()
	if got := check(t, dir, s.ID+".json", n); !strings.HasSuffix(got, ": ok") {
		t.Fatalf("check with one node down: %s", got)
	}
}

func TestBuildServersJSON(t *testing.T) {
	dir := rt.Dir(t)
	out := filepath.Join(rt.Dir(t), "site", "federation", "servers.json")
	// An empty or missing folder gives an empty list.
	if err := cmdBuild([]string{filepath.Join(dir, "missing"), out}); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(out); string(b) != "{\"asOf\":0,\"servers\":[],\"v\":1}\n" {
		t.Fatalf("empty: %q", b)
	}
	listed, answered := int64(1764633600), int64(1767225600)
	id1, f1 := rt.FileFor("One", rt.Key("op1"), rt.Key("n1"), "wss://one.example.org/fed", rt.Start, &listed, &answered, true)
	id2, f2 := rt.FileFor("Two", rt.Key("op2"), rt.Key("n2"), "wss://two.example.org/fed", rt.Start, nil, nil, true)
	_, f3 := rt.FileFor("Three", rt.Key("op3"), rt.Key("n3"), "wss://three.example.org/fed", rt.Start, nil, nil, false)
	os.WriteFile(filepath.Join(dir, id1+".json"), f1, 0o644)
	os.WriteFile(filepath.Join(dir, id2+".json"), f2, 0o644)
	os.WriteFile(filepath.Join(dir, "nologs.json"), f3, 0o644)
	os.WriteFile(filepath.Join(dir, "README.md"), []byte("# not a server"), 0o644)
	if err := cmdBuild([]string{dir, out}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(out)
	if !bytes.HasSuffix(b, []byte("}\n")) || bytes.Count(b, []byte("\n")) != 1 {
		t.Fatalf("not canonical plus one newline: %q", b[len(b)-10:])
	}
	v, code := canon.ParseStrict(b[:len(b)-1])
	if code != "" || string(canon.Encode(v)) != string(b[:len(b)-1]) {
		t.Fatal("output is not canonical JSON")
	}
	m := v.(map[string]any)
	list := m["servers"].([]any)
	if m["asOf"] != answered || len(list) != 2 {
		t.Fatalf("asOf %v, %d servers", m["asOf"], len(list))
	}
	first, second := list[0].(map[string]any)["id"].(string), list[1].(map[string]any)["id"].(string)
	if first > second {
		t.Fatal("not sorted by id")
	}
}

func TestInitGenesisRegistryFile(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "data")
	if err := cmdInit([]string{"--data", dir, "--url", "wss://relay.example.net/fed"}); err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"node.key", "operator.key", "config.json"} {
		fi, err := os.Stat(filepath.Join(dir, f))
		if err != nil || fi.Mode().Perm() != 0o600 {
			t.Fatalf("%s: %v %v", f, fi, err)
		}
	}
	if err := cmdInit([]string{"--data", dir}); err == nil {
		t.Fatal("init twice")
	}
	if err := cmdGenesis([]string{"--data", dir, "--name", "Packet Lunch", "--langs", "en,de"}); err != nil {
		t.Fatal(err)
	}
	if err := cmdGenesis([]string{"--data", dir, "--name", "Again"}); err == nil {
		t.Fatal("genesis twice")
	}
	// registry-file prints a file that passes the offline checks.
	old := os.Stdout
	rd, wr, _ := os.Pipe()
	os.Stdout = wr
	err := cmdRegistryFile([]string{"--data", dir})
	wr.Close()
	os.Stdout = old
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	buf.ReadFrom(rd)
	e, f := registry.Parse("x.json", buf.Bytes(), rt.Start+400*86400)
	if f == nil || f.Code != fed.IDMismatch {
		t.Fatalf("expected only the name to be wrong: %v", f)
	}
	_ = e

	// --from keeps the stamps of the existing file, so step 8 passes on the replacement.
	fresh := buf.Bytes()
	listed, answered := int64(20400*86400), int64(20450*86400)
	existing := edit(t, fresh, func(m map[string]any) { m["listed"] = listed; m["answered"] = answered })
	exPath := filepath.Join(rt.Dir(t), "existing.json")
	os.WriteFile(exPath, existing, 0o644)
	rd, wr, _ = os.Pipe()
	os.Stdout = wr
	err = cmdRegistryFile([]string{"--data", dir, "--from", exPath})
	wr.Close()
	os.Stdout = old
	if err != nil {
		t.Fatal(err)
	}
	var kept bytes.Buffer
	kept.ReadFrom(rd)
	c, err := config.Load(cfgPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	name := c.Server + ".json"
	now := int64(rt.Start + 400*86400)
	if f := registry.Check(name, map[string][]byte{name: kept.Bytes()}, existing, now, nil); f != nil {
		t.Fatalf("replacement refused: %v", f)
	}
	if f := registry.Check(name, map[string][]byte{name: fresh}, existing, now, nil); f == nil || f.Step != 8 {
		t.Fatalf("without --from step 8 should refuse: %v", f)
	}
	if !bytes.Contains(kept.Bytes(), []byte(`"answered":1766880000,`)) || !bytes.Contains(kept.Bytes(), []byte(`"listed":1762560000,`)) {
		t.Fatalf("stamps missing: %s", kept.Bytes())
	}
	// A file of another server is refused rather than mixed in.
	other := edit(t, fresh, func(m map[string]any) { m["genesis"] = map[string]any{"v": 1} })
	if _, err := registry.KeepStamps(fresh, other); err == nil {
		t.Fatal("stamps taken from another server's file")
	}
}

func TestReleasesURLOverride(t *testing.T) {
	for u, ok := range map[string]bool{"https://api.example.com/latest": true, "http://127.0.0.1:9/latest": true,
		"http://localhost:9/x": true, "http://[::1]:9/x": true, "http://api.example.com/latest": false,
		"https://u:p@api.example.com/": false, "file:///etc/passwd": false, "latest": false} {
		if testReleasesURL(u) != ok {
			t.Errorf("%s: %v", u, !ok)
		}
	}
}

// An identity or key may start with "-" (one in 64 does); found when `relay join -8_s… --from …` stopped at
// "flag provided but not defined" in scripts/fed-e2e.js.
func TestParseDashIdentity(t *testing.T) {
	id := "-8_spjIs7Fckh259SdqD_hDVb8lCMOroqontVSyDwXU"
	if !fed.IsID(id) {
		t.Fatal("not an identity")
	}
	fs, dir := flags("join")
	from := fs.String("from", "", "")
	pos := parse(fs, []string{"--data", "d", id, "--from", "wss://a.example/fed"})
	if len(pos) != 1 || pos[0] != id || *from != "wss://a.example/fed" || *dir != "d" {
		t.Fatalf("join: %q from %q data %q", pos, *from, *dir)
	}
	fs, _ = flags("ops propose")
	url := fs.String("url", "", "")
	pos = parse(fs, []string{"propose", "--data", "d", "add-node", id, "--url", "wss://b.example/fed", id[1:] + "A"})
	if strings.Join(pos, " ") != "propose add-node "+id+" "+id[1:]+"A" || *url != "wss://b.example/fed" {
		t.Fatalf("ops: %q url %q", pos, *url)
	}
	// The value of a flag stays its value, even shaped like an identity; a bool flag takes none.
	fs, _ = flags("genesis")
	desc := fs.String("desc", "", "")
	noLogs := fs.Bool("no-logs", true, "")
	pos = parse(fs, []string{"--desc", id, "--no-logs", id})
	if *desc != id || len(pos) != 1 || pos[0] != id || !*noLogs {
		t.Fatalf("genesis: desc %q pos %q", *desc, pos)
	}
}

// RELAY_TEST_ROOTS: a run's self-signed certificate is trusted for outgoing connections, and only given that file.
func TestTestRootsClient(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
	defer srv.Close()
	if _, err := http.DefaultClient.Get(srv.URL); err == nil {
		t.Fatal("the default client trusted a self-signed certificate")
	}
	dir := t.TempDir()
	f := filepath.Join(dir, "roots.pem")
	if err := os.WriteFile(f, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw}), 0o600); err != nil {
		t.Fatal(err)
	}
	hc, err := testRootsClient(f)
	if err != nil {
		t.Fatal(err)
	}
	res, err := hc.Get(srv.URL)
	if err != nil {
		t.Fatalf("with the file: %v", err)
	}
	res.Body.Close()
	if res.StatusCode != 204 {
		t.Fatalf("status %d", res.StatusCode)
	}
	bad := filepath.Join(dir, "none.pem")
	if err := os.WriteFile(bad, []byte("not a certificate"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := testRootsClient(bad); err == nil {
		t.Fatal("a file without certificates was taken")
	}
	if _, err := testRootsClient(filepath.Join(dir, "missing.pem")); err == nil {
		t.Fatal("a missing file was taken")
	}
}

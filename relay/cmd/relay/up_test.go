package main

import (
	"bytes"
	"crypto/tls"
	"encoding/pem"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/certs"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// syncBuf is the log, written by the relay's goroutines while the test reads it.
type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

func upSet(dir string) upSettings {
	return upSettings{dir: dir, url: "wss://relay.example.net/fed", name: "Packet Lunch", sync: "open", langs: "en,de",
		listen: "127.0.0.1:0", initCfg: func(c *config.Config) { c.Registry = "" }}
}

// running is a relay up in the background.
type running struct {
	stop  chan struct{}
	done  chan error
	ready chan net.Addr
}

func startUp(t *testing.T, s upSettings, out *syncBuf, interval time.Duration) *running {
	t.Helper()
	r := &running{stop: make(chan struct{}), done: make(chan error, 1), ready: make(chan net.Addr, 1)}
	go func() {
		r.done <- up(upOpts{s: s, out: out, stop: r.stop, ready: func(a net.Addr) { r.ready <- a },
			wait: [2]time.Duration{10 * time.Millisecond, 40 * time.Millisecond}, certInterval: interval})
	}()
	return r
}

func (r *running) addr(t *testing.T, out *syncBuf) net.Addr {
	t.Helper()
	select {
	case a := <-r.ready:
		return a
	case err := <-r.done:
		t.Fatalf("up ended: %v\n%s", err, out)
	case <-time.After(20 * time.Second):
		t.Fatalf("up did not start serving:\n%s", out)
	}
	return nil
}

func (r *running) halt(t *testing.T) {
	t.Helper()
	close(r.stop)
	select {
	case err := <-r.done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(20 * time.Second):
		t.Fatal("up did not stop")
	}
}

// noSecrets: neither key file's content shows up in what relay up printed or logged.
func noSecrets(t *testing.T, dir, out string) {
	t.Helper()
	for _, f := range []string{"operator.key", "node.key"} {
		b, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			t.Fatal(err)
		}
		if seed := strings.TrimSpace(string(b)); seed == "" || strings.Contains(out, seed) {
			t.Fatalf("%s's private key is in the output", f)
		}
	}
}

// First start: init, genesis, the notice, serving. Second start: serving only; the settings that
// follow the environment are applied, the others reported with how to change them.
func TestUpFoundsThenServes(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "data")
	s := upSet(dir)
	out := &syncBuf{}
	r := startUp(t, s, out, 0)
	r.addr(t, out)
	c, err := config.Load(cfgPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	op, _ := ops.LoadKey(filepath.Join(dir, "operator.key"))
	if v, err := call(dir, ops.Request{Cmd: "status"}); err != nil || v == nil {
		t.Fatalf("status over the socket: %v", err)
	}
	r.halt(t)
	got := out.String()
	for _, want := range []string{`Server "Packet Lunch" founded. Its identity: ` + c.Server, op.Key, "BACK UP THE OPERATOR KEY NOW",
		"docker compose cp relay:" + filepath.Join(dir, "operator.key") + " ./operator.key", "https://seriesoftub.es/#join=wss://relay.example.net/fed", "relay serving"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
	noSecrets(t, dir, got)

	// Again, with other settings: the same server, no notice; proxies and the webhook follow.
	s.name, s.sync = "Other Name", "selective"
	proxies, notify := "172.30.0.0/24", "https://hooks.example.net/relay"
	s.proxies, s.notifyURL = &proxies, &notify
	out2 := &syncBuf{}
	r = startUp(t, s, out2, 0)
	r.addr(t, out2)
	r.halt(t)
	got = out2.String()
	c2, _ := config.Load(cfgPath(dir))
	if c2.Server != c.Server || !contains(c2.TrustedProxies, "172.30.0.0/24") || c2.NotifyURL != notify {
		t.Fatalf("config after the second start: %+v", c2)
	}
	if strings.Contains(got, "BACK UP") || strings.Contains(got, "founded") {
		t.Fatalf("set up again:\n%s", got)
	}
	for _, want := range []string{"trustedProxies updated", "sync selective (server: open)", `ops server --name \"Other Name\" --sync selective`} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
	noSecrets(t, dir, got)
}

// A second node of an existing server: init and join, the add-node line for its operators.
func TestUpJoins(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "data")
	s := upSet(dir)
	s.url = "wss://second.example.net/fed"
	id := fed.Encode(bytes.Repeat([]byte{7}, 32))
	s.join, s.joinFrom = id, "wss://relay.example.net/fed"
	if !fed.IsID(id) {
		t.Skip("test identity format")
	}
	var out bytes.Buffer
	if err := setUp(s, &out, newLogger(&out, false), nil, [2]time.Duration{}); err != nil {
		t.Fatal(err)
	}
	c, _ := config.Load(cfgPath(dir))
	nk, _ := ops.LoadKey(filepath.Join(dir, "node.key"))
	if c.Server != id || len(c.Seeds) != 1 || c.Seeds[0] != s.joinFrom {
		t.Fatalf("config %+v", c)
	}
	if !strings.Contains(out.String(), "relay ops propose add-node "+nk.Key+" --url wss://second.example.net/fed") || !strings.Contains(out.String(), "BACK UP") {
		t.Fatalf("notice:\n%s", out.String())
	}
	noSecrets(t, dir, out.String())
	// Without a registry (offline), joining needs where from.
	s2 := upSet(filepath.Join(rt.Dir(t), "d2"))
	s2.join = id
	if err := setUp(s2, &out, newLogger(&out, false), nil, [2]time.Duration{}); err == nil || !strings.Contains(err.Error(), "RELAY_JOIN_FROM") {
		t.Fatalf("join without a node to join from: %v", err)
	}
}

// Stopped halfway: keys without a config (inside init), a config without a server (between init
// and genesis). The next start carries on with the same keys.
func TestUpResumes(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "data")
	os.MkdirAll(dir, 0o700)
	nk, _ := ops.NewKey(filepath.Join(dir, "node.key"))
	op, _ := ops.NewKey(filepath.Join(dir, "operator.key"))
	var out bytes.Buffer
	if err := setUp(upSet(dir), &out, newLogger(&out, false), nil, [2]time.Duration{}); err != nil {
		t.Fatal(err)
	}
	c, nk2, _ := loadAll(dir)
	op2, _ := ops.LoadKey(filepath.Join(dir, "operator.key"))
	if c.Server == "" || nk2.Key != nk.Key || op2.Key != op.Key {
		t.Fatal("keys replaced or no server")
	}

	dir = filepath.Join(rt.Dir(t), "data2")
	if _, _, _, err := initData(dir, "", func(c *config.Config) { c.URL = "wss://relay.example.net/fed"; c.Registry = "" }); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	if err := setUp(upSet(dir), &out, newLogger(&out, false), nil, [2]time.Duration{}); err != nil {
		t.Fatal(err)
	}
	if c, _ := config.Load(cfgPath(dir)); c.Server == "" || !strings.Contains(out.String(), "founded") {
		t.Fatalf("not founded on resume:\n%s", out.String())
	}
	// Nothing to found without a name.
	s := upSet(filepath.Join(rt.Dir(t), "data3"))
	s.name = ""
	if err := setUp(s, &out, newLogger(&out, false), nil, [2]time.Duration{}); err == nil || !strings.Contains(err.Error(), "RELAY_NAME") {
		t.Fatalf("founded without a name: %v", err)
	}
}

// The certbot setup: the relay starts before the certificate exists, waits, serves it once it
// appears and picks up a renewal without a restart.
func TestUpWaitsForCertificate(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "data")
	certDir := rt.Dir(t)
	s := upSet(dir)
	s.tlsCert, s.tlsKey = filepath.Join(certDir, "fullchain.pem"), filepath.Join(certDir, "privkey.pem")
	out := &syncBuf{}
	r := startUp(t, s, out, time.Nanosecond)
	deadline := time.Now().Add(10 * time.Second)
	for !strings.Contains(out.String(), "waiting for the TLS certificate") {
		if time.Now().After(deadline) {
			t.Fatalf("no waiting line:\n%s", out)
		}
		time.Sleep(10 * time.Millisecond)
	}
	select {
	case <-r.ready:
		t.Fatal("serving without a certificate")
	case <-time.After(100 * time.Millisecond):
	}
	// The hook's way: both files under temporary names, then renamed.
	put := func(mod time.Time) []byte {
		cp, kp, err := certs.SelfSigned(certs.Names{DNS: []string{"relay.example.net"}}, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		for _, f := range []struct {
			p string
			b []byte
		}{{s.tlsKey, kp}, {s.tlsCert, cp}} {
			os.WriteFile(f.p+".new", f.b, 0o600)
			os.Chtimes(f.p+".new", mod, mod)
			os.Rename(f.p+".new", f.p)
		}
		b, _ := pem.Decode(cp)
		return b.Bytes
	}
	first := put(time.Now().Add(-time.Hour))
	a := r.addr(t, out)
	served := func() []byte {
		c, err := tls.Dial("tcp", a.String(), &tls.Config{InsecureSkipVerify: true})
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		return c.ConnectionState().PeerCertificates[0].Raw
	}
	if !bytes.Equal(served(), first) {
		t.Fatal("not the certificate that appeared")
	}
	second := put(time.Now())
	if !bytes.Equal(served(), second) {
		t.Fatal("the renewal was not picked up")
	}
	r.halt(t)
	noSecrets(t, dir, out.String())
	if strings.Contains(out.String(), "PRIVATE KEY") {
		t.Fatal("a TLS key in the output")
	}

	// Stopped while waiting: a clean stop.
	os.Remove(s.tlsCert)
	out2 := &syncBuf{}
	r = startUp(t, s, out2, 0)
	time.Sleep(50 * time.Millisecond)
	r.halt(t)
}

// A crash after the founding records were stored but before the config was saved: the next start finishes that
// same server from the pending file instead of founding a second one; a pending file of another operator is ignored.
func TestFoundResumesFromPending(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "data")
	if _, _, _, err := initData(dir, "", func(c *config.Config) { c.URL = "wss://relay.example.net/fed"; c.Registry = "" }); err != nil {
		t.Fatal(err)
	}
	f := ops.ServerFields{Name: "Ping Floyd", Sync: "open", Langs: []string{"en"}}
	first, err := found(dir, "", f)
	if err != nil {
		t.Fatal(err)
	}
	pending := filepath.Join(dir, "genesis.pending.json")
	if _, err := os.Stat(pending); !os.IsNotExist(err) {
		t.Fatal("the pending file stays after a finished founding")
	}
	// Simulate the crash: the records are stored, the config never got the server, the pending file is there.
	c, nk, _ := loadAll(dir)
	op, _ := ops.LoadKey(filepath.Join(dir, "operator.key"))
	now := time.Now().Unix()
	// Another name than the first founding, so the two can be told apart (signatures are deterministic).
	g := op.Seal("genesis", now, map[string]any{"name": "Pending Floyd", "node": map[string]any{"key": nk.Key, "url": c.URL}})
	gr, _ := fed.CheckValue(g, now, fed.Opts{})
	st := &ops.State{Server: gr.ID, Head: gr.ID, Operators: []string{op.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{nk.Key, c.URL})
	srv := ops.ServerRecord(st, op, f, now)
	if err := writeAtomic(pending, canon.Encode(map[string]any{"genesis": g, "server": srv}), 0o600); err != nil {
		t.Fatal(err)
	}
	c.Server = ""
	if err := c.Save(cfgPath(dir)); err != nil {
		t.Fatal(err)
	}
	again, err := found(dir, "", f)
	if err != nil {
		t.Fatal(err)
	}
	if again != gr.ID || again == first {
		t.Fatalf("resumed as %s, want the pending server %s (first founding %s)", again, gr.ID, first)
	}
	if _, err := os.Stat(pending); !os.IsNotExist(err) {
		t.Fatal("the pending file stays after resuming")
	}
	// Another operator's pending file is not used.
	other := rt.Key("someone else")
	writeAtomic(pending, canon.Encode(map[string]any{"genesis": other.Seal("genesis", now, map[string]any{"name": "x", "node": map[string]any{"key": nk.Key, "url": c.URL}}), "server": srv}), 0o600)
	if g2, s2 := pendingFounding(pending, op.Key, nk.Key); g2 != nil || s2 != nil {
		t.Fatal("used another operator's founding records")
	}
}

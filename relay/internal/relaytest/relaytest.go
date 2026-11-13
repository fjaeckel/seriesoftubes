// Package relaytest starts relays in-process for tests: TLS on loopback, host names under
// example.com resolved to 127.0.0.1, an injected clock and captured logs. No other network.
package relaytest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/metrics"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/privacy"
)

// Clock is a settable clock.
type Clock struct {
	mu sync.Mutex
	t  time.Time
}

// NewClock starts at t.
func NewClock(t int64) *Clock { return &Clock{t: time.Unix(t, 0)} }

// Now reads the clock.
func (c *Clock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }

// Unix reads the clock in seconds.
func (c *Clock) Unix() int64 { return c.Now().Unix() }

// Add moves the clock.
func (c *Clock) Add(d time.Duration) { c.mu.Lock(); c.t = c.t.Add(d); c.mu.Unlock() }

// Start is the clock all tests begin at (2026-01-02, a slot boundary plus 10 s).
const Start = 1767312010

// Key makes a deterministic key from a name.
func Key(name string) *fed.Signer {
	h := sha256.Sum256([]byte("relaytest " + name))
	s, _ := fed.NewSigner(h[:])
	return s
}

// SyncBuffer is a goroutine-safe log sink.
type SyncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *SyncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

// String returns everything logged.
func (s *SyncBuffer) String() string { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

// Countries is a fake country database that remembers nothing but a count.
type Countries struct {
	mu    sync.Mutex
	m     map[string]string
	Calls int
}

// NewCountries maps addresses to countries.
func NewCountries(m map[string]string) *Countries { return &Countries{m: m} }

// Country looks an address up.
func (c *Countries) Country(a netip.Addr) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Calls++
	return c.m[a.String()]
}

// Asked is how many lookups were made.
func (c *Countries) Asked() int { c.mu.Lock(); defer c.mu.Unlock(); return c.Calls }

// Net is a set of relays that can reach each other.
type Net struct {
	T       testing.TB
	Clock   *Clock
	HTTP    *http.Client
	mu      sync.Mutex
	nodes   []*Node
	ports   map[string]string // host -> 127.0.0.1:port
	n       int
	Country privacy.Countries
	// Release is the relay version nodes made from now on run ("": a development build).
	Release string
	// ReleasesURL stands in for GitHub's releases API for nodes started from now on ("": the
	// real one, which this net cannot reach).
	ReleasesURL string
}

// Serve runs an https:// endpoint the relays can reach (a webhook, a site); it returns its URL.
func (n *Net) Serve(name string, h http.Handler) string {
	srv := httptest.NewUnstartedServer(h)
	srv.Config.ErrorLog = nil
	srv.StartTLS()
	n.T.Cleanup(srv.Close)
	hp := fmt.Sprintf("%s.example.com:%d", hostLabel(name), srv.Listener.Addr().(*net.TCPAddr).Port)
	n.mu.Lock()
	n.ports[hp] = srv.Listener.Addr().String()
	n.mu.Unlock()
	return "https://" + hp
}

// New makes an empty net.
func New(t testing.TB) *Net {
	n := &Net{T: t, Clock: NewClock(Start), ports: map[string]string{}}
	pool := x509.NewCertPool()
	probe := httptest.NewTLSServer(http.NotFoundHandler())
	pool.AddCert(probe.Certificate())
	probe.Close()
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{RootCAs: pool},
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			n.mu.Lock()
			target, ok := n.ports[addr]
			n.mu.Unlock()
			if !ok {
				return nil, fmt.Errorf("relaytest: no such host %s", addr)
			}
			var d net.Dialer
			return d.DialContext(ctx, network, target)
		},
	}
	n.HTTP = &http.Client{Transport: tr}
	t.Cleanup(func() {
		n.mu.Lock()
		nodes := append([]*Node(nil), n.nodes...)
		n.mu.Unlock()
		for _, x := range nodes {
			x.Stop()
		}
		tr.CloseIdleConnections()
	})
	return n
}

// Node is one running relay.
type Node struct {
	Net     *Net
	Name    string
	Dir     string
	URL     string
	Key     *fed.Signer
	Cfg     *config.Config
	R       *node.Relay
	Log     *SyncBuffer
	Metrics *metrics.M
	// Versions spoken (nil: the relay's default).
	Versions []int64
	// Release is the relay software version it runs ("": a development build).
	Release string
	srv     *httptest.Server
	handler *handler
	sock    net.Listener
	stopped bool
}

type handler struct {
	mu sync.Mutex
	h  http.Handler
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	x := h.h
	h.mu.Unlock()
	if x == nil {
		http.Error(w, "starting", http.StatusServiceUnavailable)
		return
	}
	x.ServeHTTP(w, r)
}

// Listen reserves a URL for a new node (its server runs before its relay exists).
func (n *Net) Listen(name string) *Node {
	n.mu.Lock()
	n.n++
	n.mu.Unlock()
	h := &handler{}
	srv := httptest.NewUnstartedServer(h)
	srv.Config.ErrorLog = nil
	srv.StartTLS()
	host := hostLabel(name) + ".example.com"
	port := srv.Listener.Addr().(*net.TCPAddr).Port
	hp := fmt.Sprintf("%s:%d", host, port)
	n.mu.Lock()
	n.ports[hp] = srv.Listener.Addr().String()
	n.mu.Unlock()
	x := &Node{Net: n, Name: name, URL: "wss://" + hp + "/fed", Key: Key("node " + name), srv: srv, handler: h,
		Log: &SyncBuffer{}, Metrics: metrics.New(), Release: n.Release}
	n.mu.Lock()
	n.nodes = append(n.nodes, x)
	n.mu.Unlock()
	return x
}

// Start opens the relay on a data folder with a config and runs it.
func (x *Node) Start(dir string, cfg *config.Config) {
	t := x.Net.T
	t.Helper()
	x.Dir, x.Cfg = dir, cfg
	r, err := node.New(x.options())
	if err != nil {
		t.Fatal(err)
	}
	x.R = r
	x.handler.mu.Lock()
	x.handler.h = r.Handler()
	x.handler.mu.Unlock()
	sock, err := ops.Serve(dir, r)
	if err != nil {
		t.Fatal(err)
	}
	x.sock = sock
	r.Run()
}

func (x *Node) options() node.Options {
	return node.Options{Dir: x.Dir, Config: x.Cfg, Node: x.Key, Clock: x.Net.Clock.Now,
		Log:        slog.New(slog.NewTextHandler(x.Log, &slog.HandlerOptions{Level: slog.LevelDebug})),
		HTTPClient: x.Net.HTTP, Countries: x.Net.Country, Metrics: x.Metrics,
		BootstrapEvery: 200 * time.Millisecond, DialBase: 50 * time.Millisecond, Versions: x.Versions, Version: x.Release,
		ReleasesURL: x.Net.ReleasesURL}
}

// Stop stops the relay (its URL stays reserved but answers 503).
func (x *Node) Stop() {
	if x.stopped || x.R == nil {
		return
	}
	x.stopped = true
	x.handler.mu.Lock()
	x.handler.h = nil
	x.handler.mu.Unlock()
	if x.sock != nil {
		x.sock.Close()
	}
	x.R.Close()
	x.srv.CloseClientConnections()
}

// Stopped reports whether Stop was called (and no Restart since).
func (x *Node) Stopped() bool { return x.stopped }

// Restart starts the relay again on the same folder.
func (x *Node) Restart() {
	x.Stop()
	x.stopped = false
	x.Start(x.Dir, x.Cfg)
}

// Server is a founded server.
type Server struct {
	ID    string
	Op    *fed.Signer
	Nodes []*Node
	Sync  string
}

// Found starts a node and founds a server on it with one operator.
func (n *Net) Found(name, sync string) *Server {
	t := n.T
	t.Helper()
	x := n.Listen(name + "1")
	op := Key("operator " + name)
	now := n.Clock.Unix()
	g := op.Seal("genesis", now, map[string]any{"name": name, "node": map[string]any{"key": x.Key.Key, "url": x.URL}})
	gr, code := fed.CheckValue(g, now, fed.Opts{})
	if code != "" {
		t.Fatalf("genesis: %s", code)
	}
	st := &ops.State{Server: gr.ID, Head: gr.ID, Operators: []string{op.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{x.Key.Key, x.URL})
	srv := ops.ServerRecord(st, op, ops.ServerFields{Name: name, Sync: sync, NoLogs: true, Langs: []string{"en"}}, now)
	cfg := config.Default()
	cfg.Server, cfg.URL, cfg.Registry = gr.ID, x.URL, ""
	dir := Dir(t)
	x.Start(dir, cfg)
	for _, rec := range []map[string]any{g, srv} {
		if _, code := x.R.ImportOwn(rec); code != "" {
			t.Fatalf("found: %s", code)
		}
	}
	x.R.Reload(cfg)
	return &Server{ID: gr.ID, Op: op, Nodes: []*Node{x}, Sync: sync}
}

// Client connects to a node as a game would.
func (x *Node) Client(header http.Header) *client.Client {
	t := x.Net.T
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, err := client.Dial(ctx, x.URL, client.Options{HTTPClient: x.Net.HTTP, Header: header})
	if err != nil {
		t.Fatalf("dial %s: %v", x.Name, err)
	}
	t.Cleanup(c.Close)
	return c
}

// Eventually waits for cond, failing after a few seconds.
func Eventually(t testing.TB, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// Has reports whether a node stores a record.
func (x *Node) Has(id string) bool {
	x.R.Lock()
	defer x.R.Unlock()
	return x.R.Store().Get(id) != nil
}

// Count counts a node's records of a kind.
func (x *Node) Count(kind string) int {
	x.R.Lock()
	defer x.R.Unlock()
	return x.R.Store().Count(kind)
}

// Stats makes a signed stats record for a network key.
func Stats(k *fed.Signer, t int64, pops int64, share bool) map[string]any {
	return k.Seal("stats", t, map[string]any{"mode": "normal", "pops": map[string]any{"fra": pops},
		"traffic": []any{}, "tier1": false, "shareCountry": share})
}

// Announce makes a signed announce for a network key.
func Announce(k *fed.Signer, t int64, name string) map[string]any {
	asn, _ := fed.ASN(k.Key)
	// box: any Key does for a relay, which never opens a deal (the games derive theirs, 5.1).
	return k.Seal("announce", t, map[string]any{"name": name, "asn": asn, "box": k.Key, "home": "DE", "day": int64(1),
		"founded": t / 86400, "pops": []any{"fra"}, "ix": []any{}, "cust": int64(1),
		"mix":     map[string]any{"content": int64(0), "eyeball": int64(1000), "enterprise": int64(0)},
		"traffic": map[string]any{"in": int64(0), "out": int64(0)}, "policy": "open", "rates": map[string]any{},
		"auto": map[string]any{"peering": "auto", "transit": "decline", "pni": "decline", "swap": "decline", "consortium": "decline", "port": "decline"}})
}

// Enc is a box (5.3) of n ciphertext bytes, as a relay sees one: it checks only the shape.
func Enc(t int64, n int) map[string]any {
	c := make([]byte, n)
	for i := range c {
		c[i] = byte(int(t) + i)
	}
	return map[string]any{"n": fed.Encode(c[:12]), "c": fed.Encode(c)}
}

// Offer makes a sealed offer from k to the key to (5.3).
func Offer(k *fed.Signer, t int64, to string) map[string]any {
	return k.Seal("offer", t, map[string]any{"to": to, "enc": Enc(t, 64)})
}

// ID is a record's id.
func ID(rec map[string]any) string {
	r, code := fed.CheckValue(rec, Start+1e9, fed.Opts{Trusted: true})
	if code != "" {
		panic(code)
	}
	return r.ID
}

// hostLabel turns a name into a DNS label.
func hostLabel(name string) string {
	var b strings.Builder
	for _, c := range strings.ToLower(name) {
		if c >= 'a' && c <= 'z' || c >= '0' && c <= '9' {
			b.WriteRune(c)
		} else {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

// Dir makes a data folder short enough for the operator socket: t.TempDir() nests the test name
// under macOS's long temporary folder and passes the Unix socket path limit.
func Dir(t testing.TB) string {
	t.Helper()
	d, err := os.MkdirTemp("", "relay")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(d) })
	return d
}

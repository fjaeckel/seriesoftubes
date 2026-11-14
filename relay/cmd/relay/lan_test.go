package main

import (
	"bytes"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// relay lan in one step: a standalone server, a certificate for the machine's names and LAN
// addresses, invites for each; the next party reuses both; another relay's folder is left alone.
func TestLanPrepare(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "lan")
	s := lanSetup{dir: dir, name: "LAN Before Time", listen: ":8443", hostname: "Freds-Laptop",
		addrs: []netip.Addr{netip.MustParseAddr("192.168.1.20"), netip.MustParseAddr("fd12:3456::1")}, now: time.Now()}
	var out bytes.Buffer
	page, cert, err := s.prepare(&out)
	if err != nil {
		t.Fatal(err)
	}
	if page == nil {
		t.Fatal("no page")
	}
	for _, want := range []string{
		"https://freds-laptop.local:8443/",
		"https://192.168.1.20:8443/",
		"https://[fd12:3456::1]:8443/",
		"https://seriesoftub.es/#join=wss://freds-laptop.local:8443/fed",
		"https://seriesoftub.es/#join=wss://192.168.1.20:8443/fed",
		"https://seriesoftub.es/#join=wss://[fd12:3456::1]:8443/fed",
		"A new self-signed certificate",
	} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("missing %q in:\n%s", want, out.String())
		}
	}
	leaf := cert.Leaf
	if !contains(leaf.DNSNames, "freds-laptop.local") || !contains(leaf.DNSNames, "localhost") || len(leaf.IPAddresses) != 4 {
		t.Fatalf("certificate names %v %v", leaf.DNSNames, leaf.IPAddresses)
	}
	c, err := config.Load(cfgPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if c.URL != "wss://freds-laptop.local:8443/fed" || c.Registry != "" || c.Listen != ":8443" || c.TLSCert != filepath.Join(dir, lanCert) {
		t.Fatalf("config %+v", c)
	}
	// A standalone server whose file the registry refuses: LAN servers are never listed.
	b, err := registryFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(b, []byte(`"sync":"standalone"`)) {
		t.Fatalf("not standalone: %s", b)
	}
	name := c.Server + ".json"
	if f := registry.Check(name, map[string][]byte{name: b}, nil, time.Now().Unix(), nil); f == nil || !strings.Contains(f.Error(), "local_url") {
		t.Fatalf("the registry accepted a LAN server: %v", f)
	}

	// The next party: same server, same certificate, a new port.
	s.listen = ":9443"
	out.Reset()
	_, cert2, err := s.prepare(&out)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(cert.Certificate[0], cert2.Certificate[0]) || !strings.Contains(out.String(), "Same certificate") {
		t.Fatalf("certificate replaced:\n%s", out.String())
	}
	if c2, _ := config.Load(cfgPath(dir)); c2.Server != c.Server || c2.Listen != ":9443" {
		t.Fatalf("config %+v", c2)
	}

	// Loopback only (the end-to-end test): one address, the one that works.
	s.listen = "127.0.0.1:9443"
	out.Reset()
	if _, _, err := s.prepare(&out); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "192.168.1.20") || !strings.Contains(out.String(), "#join=wss://127.0.0.1:9443/fed") {
		t.Fatalf("invites for addresses it does not listen on:\n%s", out.String())
	}

	// A normal relay's folder is not taken over.
	other := filepath.Join(rt.Dir(t), "relay")
	if _, _, _, err := initData(other, "", func(c *config.Config) { c.URL = "wss://relay.example.net/fed" }); err != nil {
		t.Fatal(err)
	}
	s.dir = other
	if _, _, err := s.prepare(&out); err == nil || !strings.Contains(err.Error(), "not a LAN server") {
		t.Fatalf("took over another relay's folder: %v", err)
	}
}

// relay init as the container image runs it: listen, metrics and the proxy network from flags or
// the image's environment; nothing is written when a setting is refused.
func TestInitFlags(t *testing.T) {
	dir := filepath.Join(rt.Dir(t), "d")
	t.Setenv("RELAY_LISTEN", "0.0.0.0:8080")
	t.Setenv("RELAY_METRICS", "0.0.0.0:9100")
	t.Setenv("RELAY_METRICS_PUBLIC", "true")
	if err := cmdInit([]string{"--data", dir, "--url", "wss://relay.example.net/fed", "--trusted-proxies", "172.30.0.0/24"}); err != nil {
		t.Fatal(err)
	}
	c, err := config.Load(cfgPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if c.Listen != "0.0.0.0:8080" || c.Metrics != "0.0.0.0:9100" || !c.MetricsPublic || !contains(c.TrustedProxies, "172.30.0.0/24") || !contains(c.TrustedProxies, "127.0.0.0/8") {
		t.Fatalf("config %+v", c)
	}
	bad := filepath.Join(rt.Dir(t), "bad")
	t.Setenv("RELAY_METRICS_PUBLIC", "")
	if err := cmdInit([]string{"--data", bad}); err == nil {
		t.Fatal("metrics on 0.0.0.0 without the opt-in accepted")
	}
	if _, err := os.Stat(filepath.Join(bad, "node.key")); err == nil {
		t.Fatal("keys made for a refused config")
	}
	if err := cmdInit([]string{"--data", bad, "--metrics", "127.0.0.1:9100", "--tls-cert", "/certs/fullchain.pem"}); err == nil {
		t.Fatal("a certificate without its key accepted")
	}
}

// fakeListener hands out pipe ends that claim the given remote addresses.
type fakeListener struct{ conns chan net.Conn }

func (f fakeListener) Accept() (net.Conn, error) {
	c, ok := <-f.conns
	if !ok {
		return nil, net.ErrClosed
	}
	return c, nil
}
func (f fakeListener) Close() error   { return nil }
func (f fakeListener) Addr() net.Addr { return &net.TCPAddr{} }

type fromConn struct {
	net.Conn
	from net.Addr
}

func (c fromConn) RemoteAddr() net.Addr { return c.from }

// relay lan answers devices on the local network only: a peer from a public IPv4 or global IPv6 address is closed.
func TestLanListenerRefusesInternetPeers(t *testing.T) {
	fl := fakeListener{conns: make(chan net.Conn, 16)}
	froms := []string{"203.0.113.7:5000", "[2001:db8::1]:5000", "192.168.1.20:5000", "8.8.8.8:1", "127.0.0.1:5000",
		"[fd00::5]:5000", "10.0.0.3:5000", "[fe80::1%eth0]:5000", "[2606:4700::1]:443", "172.20.0.2:5000"}
	var far []net.Conn
	for _, f := range froms {
		ap := netip.MustParseAddrPort(f)
		a, b := net.Pipe()
		far = append(far, b)
		fl.conns <- fromConn{a, net.TCPAddrFromAddrPort(ap)}
	}
	close(fl.conns)
	ln := lanListener{fl}
	var got []string
	for {
		c, err := ln.Accept()
		if err != nil {
			break
		}
		got = append(got, c.RemoteAddr().String())
	}
	want := []string{"192.168.1.20:5000", "127.0.0.1:5000", "[fd00::5]:5000", "10.0.0.3:5000", "[fe80::1%eth0]:5000", "172.20.0.2:5000"}
	if !slices.Equal(got, want) {
		t.Fatalf("accepted %v, want %v", got, want)
	}
	// The refused ones were closed.
	for i, f := range froms {
		if contains(want, f) {
			continue
		}
		if _, err := far[i].Write([]byte("x")); err == nil {
			t.Errorf("%s: connection left open", f)
		}
	}
}

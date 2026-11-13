package main

import (
	"bytes"
	"net/netip"
	"os"
	"path/filepath"
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

package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCheck(t *testing.T) {
	ok := Default()
	ok.URL = "wss://relay.example.net/fed"
	ok.Metrics = "127.0.0.1:9464"
	if err := ok.Check(); err != nil {
		t.Fatal(err)
	}
	bad := []func(c *Config){
		func(c *Config) { c.Metrics = "0.0.0.0:9464" }, // metrics on localhost only
		func(c *Config) { c.Metrics = "[::]:9464" },
		func(c *Config) { c.URL = "ws://relay.example.net/fed" },
		func(c *Config) { c.URL = "wss://192.0.2.1/fed" },
		func(c *Config) {
			c.Neighbours = []Neighbour{{URL: "wss://x.example.org", Send: []string{"everything"}}}
		},
		func(c *Config) { c.Selective = []string{"not-an-id"} },
		func(c *Config) { c.TrustedProxies = []string{"nonsense"} },
	}
	for i, f := range bad {
		c := Default()
		f(c)
		if c.Check() == nil {
			t.Errorf("case %d accepted", i)
		}
	}
}

// Listening beyond loopback behind a proxy trusted on loopback only (a container) warns: every
// player would share the proxy's address and one connection limit.
func TestProxyWarning(t *testing.T) {
	c := Default()
	if w := c.ProxyWarning(); w != "" {
		t.Fatalf("loopback listen warned: %s", w)
	}
	c.Listen = "0.0.0.0:8080"
	if c.ProxyWarning() == "" {
		t.Fatal("a container's listen with loopback-only proxies did not warn")
	}
	c.TrustedProxies = append(c.TrustedProxies, "172.16.0.0/12")
	if w := c.ProxyWarning(); w != "" {
		t.Fatalf("a trusted container network warned: %s", w)
	}
	c = Default()
	c.Listen, c.TLSCert, c.TLSKey = ":443", "cert.pem", "key.pem"
	if w := c.ProxyWarning(); w != "" {
		t.Fatalf("serving TLS itself (no proxy) warned: %s", w)
	}
}

func TestLoadRefusesUnknownFields(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.json")
	os.WriteFile(p, []byte(`{"listen":"127.0.0.1:8080","logAddresses":true}`), 0o600)
	if _, err := Load(p); err == nil {
		t.Fatal("an unknown setting was accepted")
	}
	c := Default()
	if err := c.Save(p); err != nil {
		t.Fatal(err)
	}
	if fi, _ := os.Stat(p); fi.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v", fi.Mode())
	}
	if _, err := Load(p); err != nil {
		t.Fatal(err)
	}
}

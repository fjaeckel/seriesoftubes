package certs

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"io"
	"log/slog"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var names = Names{DNS: []string{"freds-laptop.local", "localhost"},
	IPs: []netip.Addr{netip.MustParseAddr("192.168.1.20"), netip.MustParseAddr("fd12:3456::1"), netip.MustParseAddr("127.0.0.1")}}

func parse(t *testing.T, p []byte) *x509.Certificate {
	t.Helper()
	b, _ := pem.Decode(p)
	c, err := x509.ParseCertificate(b.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestSelfSigned(t *testing.T) {
	now := time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC)
	cp, kp, err := SelfSigned(names, now)
	if err != nil {
		t.Fatal(err)
	}
	c := parse(t, cp)
	if !names.Covers(c) {
		t.Fatalf("names missing: %v %v", c.DNSNames, c.IPAddresses)
	}
	if !c.NotBefore.Before(now) || c.NotAfter.Sub(now) != SelfSignedDays*24*time.Hour {
		t.Fatalf("validity %v .. %v", c.NotBefore, c.NotAfter)
	}
	if c.IsCA || len(c.ExtKeyUsage) != 1 || c.ExtKeyUsage[0] != x509.ExtKeyUsageServerAuth {
		t.Fatal("not a plain server certificate")
	}
	// It verifies for each name when trusted (what accepting the browser's warning amounts to).
	pool := x509.NewCertPool()
	pool.AddCert(c)
	for _, n := range []string{"freds-laptop.local", "localhost", "192.168.1.20", "fd12:3456::1", "127.0.0.1"} {
		if _, err := c.Verify(x509.VerifyOptions{DNSName: n, Roots: pool, CurrentTime: now}); err != nil {
			t.Errorf("%s: %v", n, err)
		}
	}
	if _, err := c.Verify(x509.VerifyOptions{DNSName: "192.168.1.21", Roots: pool, CurrentTime: now}); err == nil {
		t.Error("an address it was not made for verified")
	}
	if _, err := tls.X509KeyPair(cp, kp); err != nil {
		t.Fatal(err)
	}
}

func TestEnsureSelfSignedKeepsAndReplaces(t *testing.T) {
	dir := t.TempDir()
	cp, kp := filepath.Join(dir, "lan-cert.pem"), filepath.Join(dir, "lan-key.pem")
	now := time.Now()
	c1, made, err := EnsureSelfSigned(cp, kp, names, now)
	if err != nil || !made {
		t.Fatal(made, err)
	}
	if fi, _ := os.Stat(kp); fi.Mode().Perm() != 0o600 {
		t.Fatalf("key mode %v", fi.Mode())
	}
	// Same names, next party: the same certificate, so nobody accepts a warning again.
	c2, made, err := EnsureSelfSigned(cp, kp, Names{DNS: names.DNS[:1], IPs: names.IPs[:1]}, now.Add(24*time.Hour))
	if err != nil || made || !bytes.Equal(c1.Certificate[0], c2.Certificate[0]) {
		t.Fatal("a certificate that still fits was replaced", made, err)
	}
	// A new address (DHCP gave another one): replaced.
	more := names
	more.IPs = append([]netip.Addr{netip.MustParseAddr("10.0.0.7")}, names.IPs...)
	if _, made, err = EnsureSelfSigned(cp, kp, more, now); err != nil || !made {
		t.Fatal("a new address did not make a new certificate", err)
	}
	// Close to its end: replaced.
	if _, made, _ = EnsureSelfSigned(cp, kp, more, now.Add((SelfSignedDays-3)*24*time.Hour)); !made {
		t.Fatal("a certificate about to expire was kept")
	}
}

// Renewals: the next handshake after the files change serves the new pair; a broken pair keeps
// the old one in service.
func TestReloader(t *testing.T) {
	dir := t.TempDir()
	cp, kp := filepath.Join(dir, "fullchain.pem"), filepath.Join(dir, "privkey.pem")
	write := func(c, k []byte, mod time.Time) {
		t.Helper()
		os.WriteFile(cp, c, 0o644)
		os.WriteFile(kp, k, 0o600)
		os.Chtimes(cp, mod, mod)
		os.Chtimes(kp, mod, mod)
	}
	start := time.Now()
	c1, k1, _ := SelfSigned(Names{DNS: []string{"relay.example.net"}}, start)
	write(c1, k1, start.Add(-time.Hour))
	var logs bytes.Buffer
	r, err := NewReloader(cp, kp, slog.New(slog.NewTextHandler(&logs, nil)))
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Now() // after the first load
	r.Now = func() time.Time { return clock }

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				s := tls.Server(c, &tls.Config{GetCertificate: r.GetCertificate})
				s.Handshake()
				io.Copy(io.Discard, s)
				s.Close()
			}()
		}
	}()
	served := func() []byte {
		t.Helper()
		c, err := tls.Dial("tcp", ln.Addr().String(), &tls.Config{InsecureSkipVerify: true})
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		return c.ConnectionState().PeerCertificates[0].Raw
	}
	der := func(p []byte) []byte { b, _ := pem.Decode(p); return b.Bytes }

	if !bytes.Equal(served(), der(c1)) {
		t.Fatal("not the first certificate")
	}
	c2, k2, _ := SelfSigned(Names{DNS: []string{"relay.example.net"}}, start)
	write(c2, k2, start)
	if !bytes.Equal(served(), der(c1)) {
		t.Fatal("reread before a minute passed")
	}
	clock = clock.Add(time.Minute)
	if !bytes.Equal(served(), der(c2)) {
		t.Fatal("the renewed certificate is not served")
	}
	if !bytes.Contains(logs.Bytes(), []byte("TLS certificate reloaded")) {
		t.Fatalf("reload not logged: %s", logs.String())
	}

	// A renewal caught halfway: new certificate, old key. The pair in service stays.
	c3, _, _ := SelfSigned(Names{DNS: []string{"relay.example.net"}}, start)
	write(c3, k2, start.Add(time.Hour))
	for range 3 {
		clock = clock.Add(time.Minute)
		if !bytes.Equal(served(), der(c2)) {
			t.Fatal("a broken pair replaced the working one")
		}
	}
	if n := bytes.Count(logs.Bytes(), []byte("keeping the one in service")); n != 1 {
		t.Fatalf("the broken pair was logged %d times, want once", n)
	}
}

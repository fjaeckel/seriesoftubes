package certs

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"net/netip"
	"slices"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

// SelfSignedDays is how long a LAN certificate is valid. Browsers only cap the lifetime of
// publicly trusted certificates; a year means players accept it once for many LAN parties.
const SelfSignedDays = 365

// renewBefore: a certificate this close to its end is replaced at start rather than expiring
// in the middle of a party.
const renewBefore = 7 * 24 * time.Hour

// Names are what a LAN certificate covers.
type Names struct {
	DNS []string
	IPs []netip.Addr
}

// Covers reports whether a certificate is for every one of the names.
func (n Names) Covers(c *x509.Certificate) bool {
	for _, d := range n.DNS {
		if !slices.Contains(c.DNSNames, d) {
			return false
		}
	}
	for _, a := range n.IPs {
		if !slices.ContainsFunc(c.IPAddresses, func(ip net.IP) bool { b, ok := netip.AddrFromSlice(ip); return ok && b.Unmap() == a }) {
			return false
		}
	}
	return true
}

// SelfSigned makes a self-signed ECDSA P-256 server certificate for the names, valid from an
// hour ago (clocks at a party disagree) for SelfSignedDays. It returns the PEM of each.
func SelfSigned(n Names, now time.Time) (certPEM, keyPEM []byte, err error) {
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 127))
	if err != nil {
		return nil, nil, err
	}
	cn := "Series of Tubes LAN relay"
	if len(n.DNS) > 0 {
		cn = n.DNS[0]
	}
	t := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: cn, Organization: []string{"Series of Tubes LAN relay (self-signed)"}},
		NotBefore:             now.Add(-time.Hour),
		NotAfter:              now.Add(SelfSignedDays * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              n.DNS,
	}
	for _, a := range n.IPs {
		t.IPAddresses = append(t.IPAddresses, net.IP(a.AsSlice()))
	}
	der, err := x509.CreateCertificate(rand.Reader, t, t, &k.PublicKey, k)
	if err != nil {
		return nil, nil, err
	}
	kd, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return nil, nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
		pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: kd}), nil
}

// EnsureSelfSigned keeps the pair at certPath and keyPath when it loads, covers the names and is
// valid for another week; otherwise it writes a new one (key 0600). made tells whether it did, as
// players then accept the new certificate once more.
func EnsureSelfSigned(certPath, keyPath string, n Names, now time.Time) (c *tls.Certificate, made bool, err error) {
	if old, err := load(certPath, keyPath); err == nil && n.Covers(old.Leaf) &&
		now.After(old.Leaf.NotBefore) && now.Add(renewBefore).Before(old.Leaf.NotAfter) {
		return old, false, nil
	}
	cp, kp, err := SelfSigned(n, now)
	if err != nil {
		return nil, false, err
	}
	if err := store.WriteAtomic(keyPath, kp, 0o600); err != nil {
		return nil, false, err
	}
	if err := store.WriteAtomic(certPath, cp, 0o644); err != nil {
		return nil, false, err
	}
	if c, err = load(certPath, keyPath); err != nil {
		return nil, false, fmt.Errorf("the new certificate does not load: %w", err)
	}
	return c, true, nil
}

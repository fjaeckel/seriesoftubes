// Package netguard makes the HTTP clients of outgoing federation traffic: they never follow a
// redirect, and for URLs that came from the registry, the catalog or a peer (not from the
// operator) they connect only to public addresses, checked on the address actually dialled, so a
// name that resolves to an internal address (or is rebound to one) is refused too.
package netguard

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"syscall"
	"time"
)

// ErrInternal is the error of a connection refused because its address is not public.
var ErrInternal = errors.New("netguard: refusing to connect to an internal address")

var blocked = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),      // "this network"
	netip.MustParsePrefix("100.64.0.0/10"),  // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),   // IETF protocol assignments
	netip.MustParsePrefix("198.18.0.0/15"),  // benchmarking
	netip.MustParsePrefix("240.0.0.0/4"),    // reserved, broadcast
	netip.MustParsePrefix("64:ff9b:1::/48"), // local-use NAT64
	netip.MustParsePrefix("2001::/32"),      // Teredo: reaches an IPv4 address it hides
	netip.MustParsePrefix("fec0::/10"),      // site-local (deprecated, still routed inside some networks)
}

// Prefixes whose addresses carry an IPv4 address, at the given byte offset: it is checked too.
var embeds = []struct {
	p  netip.Prefix
	at int
}{
	{netip.MustParsePrefix("::/96"), 12},        // IPv4-compatible
	{netip.MustParsePrefix("64:ff9b::/96"), 12}, // well-known NAT64
	{netip.MustParsePrefix("2002::/16"), 2},     // 6to4
}

// Internal reports whether a is not a public unicast address: loopback, private (RFC 1918, ULA),
// link-local, carrier-grade NAT, unspecified, multicast or reserved, or an IPv6 address that
// carries an IPv4 address that is one of those (IPv4-compatible, NAT64, 6to4) or hides one (Teredo).
func Internal(a netip.Addr) bool {
	a = a.Unmap()
	if !a.IsValid() || !a.IsGlobalUnicast() || a.IsPrivate() {
		return true
	}
	for _, p := range blocked {
		if p.Contains(a) {
			return true
		}
	}
	if a.Is6() {
		b := a.As16()
		for _, e := range embeds {
			if e.p.Contains(a) && Internal(netip.AddrFrom4([4]byte(b[e.at:e.at+4]))) {
				return true
			}
		}
	}
	return false
}

func checkAddr(address string) error {
	ap, err := netip.ParseAddrPort(address)
	if err != nil {
		return fmt.Errorf("%w: %s", ErrInternal, address)
	}
	if Internal(ap.Addr()) {
		return fmt.Errorf("%w: %s", ErrInternal, ap.Addr())
	}
	return nil
}

func control(_, address string, _ syscall.RawConn) error { return checkAddr(address) }

// noRedirect keeps the redirect as the answer: a node URL is dialled as given, never elsewhere.
func noRedirect(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

// Client is a copy of base (nil: http.DefaultClient) that never follows redirects. With
// publicOnly it connects only to public addresses, and not through a proxy from the
// environment (the proxy would connect for it, unchecked).
func Client(base *http.Client, publicOnly bool) *http.Client {
	if base == nil {
		base = http.DefaultClient
	}
	c := *base
	c.CheckRedirect = noRedirect
	if !publicOnly {
		return &c
	}
	rt := c.Transport
	if rt == nil {
		rt = http.DefaultTransport
	}
	t, ok := rt.(*http.Transport)
	if !ok {
		c.Transport = refuse{}
		return &c
	}
	std := rt == http.DefaultTransport
	t = t.Clone()
	t.Proxy = nil
	if std || t.DialContext == nil && t.DialTLSContext == nil {
		// Checked before connecting: nothing is sent to an internal address, not even a SYN.
		d := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second, Control: control}
		t.DialContext = d.DialContext
	} else {
		// A dialer of the caller's (tests map names to ports): checked on the address it reached.
		if dc := t.DialContext; dc != nil {
			t.DialContext = checked(dc)
		}
		if dc := t.DialTLSContext; dc != nil {
			t.DialTLSContext = checked(dc)
		}
	}
	c.Transport = t
	return &c
}

type dialFunc = func(ctx context.Context, network, addr string) (net.Conn, error)

func checked(dc dialFunc) dialFunc {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		nc, err := dc(ctx, network, addr)
		if err != nil {
			return nil, err
		}
		if err := checkAddr(nc.RemoteAddr().String()); err != nil {
			nc.Close()
			return nil, err
		}
		return nc, nil
	}
}

// refuse is the transport of a public-only client whose base transport cannot be checked.
type refuse struct{}

func (refuse) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.Body != nil {
		r.Body.Close()
	}
	return nil, fmt.Errorf("%w: transport cannot be checked", ErrInternal)
}

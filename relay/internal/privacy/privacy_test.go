package privacy

import (
	"net/http"
	"net/netip"
	"testing"
)

func TestClientAddr(t *testing.T) {
	loop := []netip.Prefix{netip.MustParsePrefix("127.0.0.0/8")}
	r := &http.Request{RemoteAddr: "127.0.0.1:5555", Header: http.Header{}}
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 203.0.113.9")
	if a := ClientAddr(r, loop); a.String() != "203.0.113.9" {
		t.Fatalf("behind a trusted proxy: %v", a)
	}
	// The header is ignored from anyone who is not a trusted proxy.
	r.RemoteAddr = "198.51.100.1:5555"
	if a := ClientAddr(r, loop); a.String() != "198.51.100.1" {
		t.Fatalf("untrusted peer: %v", a)
	}
}

func TestLimiterForgets(t *testing.T) {
	l := NewLimiter(2, 300)
	a := netip.MustParseAddr("203.0.113.9")
	if !l.Allow(a, 1000) || !l.Allow(a, 1001) || l.Allow(a, 1002) {
		t.Fatal("limit")
	}
	if !l.Allow(netip.MustParseAddr("203.0.113.10"), 1002) {
		t.Fatal("another address")
	}
	if !l.Allow(a, 1301) {
		t.Fatal("window")
	}
	l.Allow(netip.MustParseAddr("198.51.100.1"), 1700)
	if l.Len() != 1 {
		t.Fatalf("held %d addresses after the window", l.Len())
	}
}

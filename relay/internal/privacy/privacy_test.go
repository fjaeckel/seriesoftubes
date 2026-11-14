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

func ip(s string) netip.Addr { return netip.MustParseAddr(s) }

// New connections are a token bucket: a burst, then the refill rate, with the wait to retry.
func TestLimiterBurstAndRefill(t *testing.T) {
	l := NewLimiter(Limits{Open: 100, Burst: 3, Rate: 0.5})
	a := ip("203.0.113.9")
	for i := range 3 {
		if ok, _ := l.Acquire(a, 1000); !ok {
			t.Fatalf("connection %d of the burst refused", i+1)
		}
	}
	ok, retry := l.Acquire(a, 1000)
	if ok || retry != 2 {
		t.Fatalf("past the burst: ok %v, retry %d (want 2 s at half a connection a second)", ok, retry)
	}
	if ok, _ := l.Acquire(ip("203.0.113.10"), 1000); !ok {
		t.Fatal("another address")
	}
	if ok, _ := l.Acquire(a, 1002); !ok {
		t.Fatal("refilled after 2 s")
	}
}

// Connections open at once are capped per address; one that ends makes room.
func TestLimiterOpenCap(t *testing.T) {
	l := NewLimiter(Limits{Open: 2, Burst: 100, Rate: 1})
	a := ip("203.0.113.9")
	l.Acquire(a, 1000)
	l.Acquire(a, 1000)
	if ok, retry := l.Acquire(a, 1000); ok || retry <= 0 {
		t.Fatal("a third open connection was let in")
	}
	l.Release(a, 1001)
	if ok, _ := l.Acquire(a, 1001); !ok {
		t.Fatal("refused after one ended")
	}
}

// IPv6 counts per /64, and also per /56 (twice the room) and /48 (four times): a /48 holds
// 65536 /64s, which must not each get the room of a subscriber.
func TestLimiterIPv6Prefixes(t *testing.T) {
	l := NewLimiter(Limits{Open: 1, Burst: 100, Rate: 1})
	if ok, _ := l.Acquire(ip("2001:db8:1:2::1"), 1000); !ok {
		t.Fatal("first")
	}
	if ok, _ := l.Acquire(ip("2001:db8:1:2::ffff"), 1000); ok {
		t.Fatal("a second open connection from the same /64 was let in")
	}
	if ok, _ := l.Acquire(ip("2001:db8:1:3::1"), 1000); !ok {
		t.Fatal("another /64 of the /56")
	}
	if ok, _ := l.Acquire(ip("2001:db8:1:4::1"), 1000); ok {
		t.Fatal("a third /64 of one /56 was let in")
	}
	n := 2
	for i := 1; i < 256; i++ { // other /56s of the /48
		if ok, _ := l.Acquire(netip.AddrFrom16([16]byte{0x20, 0x01, 0x0d, 0xb8, 0, 1, byte(i), 0, 15: 1}), 1000); ok {
			n++
		}
	}
	if n != 4 {
		t.Fatalf("one /48 held %d connections, want 4", n)
	}
	if ok, _ := l.Acquire(ip("2001:db8:2::1"), 1000); !ok {
		t.Fatal("another /48")
	}
}

// Entries are forgotten once nothing is open and their bucket has refilled.
func TestLimiterForgets(t *testing.T) {
	l := NewLimiter(Limits{Open: 10, Burst: 2, Rate: 0.01})
	a := ip("203.0.113.9")
	l.Acquire(a, 1000)
	l.Acquire(a, 1000)
	if ok, _ := l.Acquire(a, 1000); ok {
		t.Fatal("limit")
	}
	l.Release(a, 1000)
	l.Release(a, 1000)
	l.Acquire(ip("198.51.100.1"), 1100)
	if l.Len(1100) != 2 {
		t.Fatalf("held %d, want both while a's bucket refills", l.Len(1100))
	}
	l.Release(ip("198.51.100.1"), 1100)
	l.Acquire(ip("198.51.100.2"), 1200)
	if l.Len(1200) != 1 {
		t.Fatalf("held %d addresses after their buckets refilled", l.Len(1200))
	}
}

// A full table makes room by forgetting the least recently used idle entries, and when every
// entry has connections open it refuses new addresses (it used to let them in uncounted).
func TestLimiterFullFailsClosed(t *testing.T) {
	old := MaxSeen
	MaxSeen = 16
	defer func() { MaxSeen = old }()
	l := NewLimiter(Limits{Open: 10, Burst: 10, Rate: 0.001})
	addr := func(i int) netip.Addr { return netip.AddrFrom4([4]byte{198, 51, 100, byte(i)}) }
	for i := range 16 {
		if ok, _ := l.Acquire(addr(i), 1000); !ok {
			t.Fatal(i)
		}
	}
	if ok, _ := l.Acquire(addr(100), 1000); ok {
		t.Fatal("a new address was let in uncounted while the table is full of open connections")
	}
	if ok, _ := l.Acquire(addr(3), 1000); !ok {
		t.Fatal("an address already held was refused")
	}
	l.Release(addr(5), 1001)
	l.Release(addr(7), 1002)
	if ok, _ := l.Acquire(addr(100), 1003); !ok {
		t.Fatal("refused although an idle entry could be forgotten")
	}
	if l.Len(1000) > MaxSeen {
		t.Fatalf("held %d entries, bound %d", l.Len(1000), MaxSeen)
	}
	l.Release(addr(100), 1003)
	for i := 200; i < 300; i++ {
		l.Acquire(addr(i), 1004)
	}
	if l.Len(1000) > MaxSeen {
		t.Fatalf("held %d entries, bound %d", l.Len(1000), MaxSeen)
	}
}

// Package privacy handles the one thing the relay may do with a connection's address
// (spec 12): look up a country, and count connections per address for a few minutes.
// Addresses live only in memory here; nothing in this package writes or logs them.
package privacy

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"

	"github.com/oschwald/maxminddb-golang/v2"
)

// Countries maps an address to a two-letter country code, or "".
type Countries interface {
	Country(netip.Addr) string
}

// MMDB reads a country-only MaxMind-format database (GeoLite2-Country, DB-IP country lite...).
type MMDB struct{ r *maxminddb.Reader }

// OpenMMDB opens a database file.
func OpenMMDB(path string) (*MMDB, error) {
	r, err := maxminddb.Open(path)
	if err != nil {
		return nil, err
	}
	return &MMDB{r: r}, nil
}

// Country looks up the ISO code; only the country is ever read.
func (m *MMDB) Country(a netip.Addr) string {
	var cc string
	if err := m.r.Lookup(a.Unmap()).DecodePath(&cc, "country", "iso_code"); err != nil {
		return ""
	}
	if len(cc) != 2 || cc[0] < 'A' || cc[0] > 'Z' || cc[1] < 'A' || cc[1] > 'Z' {
		return ""
	}
	return cc
}

// Close closes the database.
func (m *MMDB) Close() error { return m.r.Close() }

// ClientAddr is the connecting address: the peer, or the last X-Forwarded-For hop when the
// peer is a trusted proxy (the one the proxy itself appended).
func ClientAddr(r *http.Request, trusted []netip.Prefix) netip.Addr {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}
	}
	peer = peer.Unmap()
	for _, p := range trusted {
		if !p.Contains(peer) {
			continue
		}
		xff := r.Header.Values("X-Forwarded-For")
		if len(xff) == 0 {
			break
		}
		parts := strings.Split(xff[len(xff)-1], ",")
		if a, err := netip.ParseAddr(strings.TrimSpace(parts[len(parts)-1])); err == nil {
			return a.Unmap()
		}
		break
	}
	return peer
}

// Limiter counts new connections per address over a window, in memory only.
type Limiter struct {
	mu     sync.Mutex
	window int64
	max    int
	seen   map[netip.Addr][]int64
	sweep  int64
}

// NewLimiter allows max connections per address per window seconds.
func NewLimiter(max int, window int64) *Limiter {
	return &Limiter{max: max, window: window, seen: map[netip.Addr][]int64{}}
}

// MaxSeen bounds the addresses a Limiter holds (a var for tests).
var MaxSeen = 1 << 16

// limitKey is what connections are counted by: an IPv4 address, or an IPv6 address's /64 (one
// subscriber's usual share, which hands out addresses without end).
func limitKey(a netip.Addr) netip.Addr {
	a = a.Unmap()
	if a.Is6() {
		if p, err := a.Prefix(64); err == nil {
			return p.Addr()
		}
	}
	return a
}

// Allow records a connection at now and reports whether it is within the limit.
func (l *Limiter) Allow(a netip.Addr, now int64) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	a = limitKey(a)
	// Swept once a window, and at most once a second while full.
	if now-l.sweep >= l.window || len(l.seen) >= MaxSeen && l.seen[a] == nil && now != l.sweep {
		for k, ts := range l.seen {
			if len(ts) == 0 || now-ts[len(ts)-1] >= l.window {
				delete(l.seen, k)
			}
		}
		l.sweep = now
	}
	if len(l.seen) >= MaxSeen && l.seen[a] == nil {
		// Full of addresses seen within the window: this one is let through uncounted rather
		// than held, so memory stays bounded and nobody is locked out by others' addresses.
		return true
	}
	ts := l.seen[a]
	i := 0
	for i < len(ts) && now-ts[i] >= l.window {
		i++
	}
	ts = ts[i:]
	if len(ts) >= l.max {
		l.seen[a] = ts
		return false
	}
	l.seen[a] = append(ts, now)
	return true
}

// Set changes the limit (config reload).
func (l *Limiter) Set(max int, window int64) {
	l.mu.Lock()
	l.max, l.window = max, window
	l.mu.Unlock()
}

// Len is the number of addresses held (tests check it empties).
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.seen)
}

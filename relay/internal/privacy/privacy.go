// Package privacy handles the one thing the relay may do with a connection's address
// (spec 12): look up a country, and count connections per address while they are open and for a few minutes after.
// Addresses live only in memory here; nothing in this package writes or logs them.
package privacy

import (
	"container/list"
	"math"
	"net"
	"net/http"
	"net/netip"
	"slices"
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

// Limits is what one address may do: open connections at once (Open), and new connections, a
// token bucket of Burst refilled at Rate a second. IPv6 is counted per /64 (one subscriber's
// usual share) and also per /56 and /48 (a site's), with twice and four times as much room.
type Limits struct {
	Open  int
	Burst int
	Rate  float64
}

// levels: the prefixes an address is counted under, and how much room each has. IPv4 is
// counted per address only: many players share one behind NAT, and agents run in hundreds.
var levels = []struct {
	bits int
	mul  float64
}{{64, 1}, {56, 2}, {48, 4}}

type entry struct {
	key    netip.Prefix
	tokens float64
	at     int64 // when tokens was last brought up to date
	open   int
	el     *list.Element // in idle (open == 0) or nil
}

// Limiter counts connections per address in memory only: those open now, and a token bucket
// for new ones. An entry is forgotten once nothing from it is open and its bucket is full again.
type Limiter struct {
	mu   sync.Mutex
	lim  Limits
	m    map[netip.Prefix]*entry
	idle *list.List // entries with nothing open, least recently used at the back
}

// NewLimiter makes a limiter.
func NewLimiter(l Limits) *Limiter {
	return &Limiter{lim: norm(l), m: map[netip.Prefix]*entry{}, idle: list.New()}
}

func norm(l Limits) Limits {
	l.Open = max(l.Open, 1)
	l.Burst = max(l.Burst, 1)
	if !(l.Rate > 0) {
		l.Rate = 1
	}
	return l
}

// MaxSeen bounds the entries a Limiter holds (a var for tests). When it is full of entries with
// connections open, new addresses are refused rather than let through uncounted.
var MaxSeen = 1 << 16

// keys are the prefixes a is counted under, with each one's share of the limits.
func keys(a netip.Addr) ([]netip.Prefix, []float64) {
	a = a.Unmap()
	if !a.Is6() {
		return []netip.Prefix{netip.PrefixFrom(a, a.BitLen())}, []float64{1}
	}
	var ks []netip.Prefix
	var ms []float64
	for _, lv := range levels {
		if p, err := a.Prefix(lv.bits); err == nil {
			ks = append(ks, p)
			ms = append(ms, lv.mul)
		}
	}
	return ks, ms
}

// full is how long an idle entry takes to refill: after that it is the same as no entry.
func (l *Limiter) full() int64 { return int64(math.Ceil(float64(l.lim.Burst) / l.lim.Rate)) }

// forget drops idle entries whose buckets have refilled, oldest first: once the oldest is
// younger than a whole refill, so are the rest.
func (l *Limiter) forget(now int64) {
	f := l.full()
	for e := l.idle.Back(); e != nil; {
		x, prev := e.Value.(*entry), e.Prev()
		if now-x.at < f && !l.refilled(x, now) {
			return
		}
		l.idle.Remove(e)
		delete(l.m, x.key)
		e = prev
	}
}

// refilled reports whether an idle entry's bucket is full again by now: it then says nothing
// a missing entry would not.
func (l *Limiter) refilled(x *entry, now int64) bool {
	mul := 1.0
	if x.key.Addr().Is6() {
		for _, lv := range levels {
			if lv.bits == x.key.Bits() {
				mul = lv.mul
			}
		}
	}
	return x.tokens+float64(max(0, now-x.at))*l.lim.Rate*mul >= float64(l.lim.Burst)*mul
}

func (l *Limiter) refill(x *entry, mul float64, now int64) {
	if now > x.at {
		x.tokens = min(float64(l.lim.Burst)*mul, x.tokens+float64(now-x.at)*l.lim.Rate*mul)
		x.at = now
	}
}

// Acquire records a new connection from a at now. ok: it may go ahead, and Release must be
// called with a when it ends. Otherwise retry is the seconds after which trying again makes sense.
func (l *Limiter) Acquire(a netip.Addr, now int64) (ok bool, retry int64) {
	ks, ms := keys(a)
	l.mu.Lock()
	defer l.mu.Unlock()
	l.forget(now)
	xs := make([]*entry, len(ks))
	for i, k := range ks {
		x := l.m[k]
		if x == nil {
			continue
		}
		l.refill(x, ms[i], now)
		xs[i] = x
		if x.open >= int(float64(l.lim.Open)*ms[i]) {
			return false, 10
		}
		if x.tokens < 1 {
			return false, max(1, int64(math.Ceil((1-x.tokens)/(l.lim.Rate*ms[i]))))
		}
	}
	// Room for the entries still missing: make it by forgetting the least recently used idle
	// ones; when every entry has a connection open, refuse (memory stays bounded either way).
	need := 0
	for _, x := range xs {
		if x == nil {
			need++
		}
	}
	for e := l.idle.Back(); len(l.m)+need > MaxSeen; {
		if e == nil {
			return false, 10
		}
		x, prev := e.Value.(*entry), e.Prev()
		if !slices.Contains(xs, x) { // never one of this address's own
			l.idle.Remove(e)
			delete(l.m, x.key)
		}
		e = prev
	}
	for i, k := range ks {
		x := xs[i]
		if x == nil {
			x = &entry{key: k, tokens: float64(l.lim.Burst) * ms[i], at: now}
			l.m[k] = x
		}
		x.tokens--
		x.open++
		if x.el != nil {
			l.idle.Remove(x.el)
			x.el = nil
		}
	}
	return true, 0
}

// Release ends a connection Acquire let through.
func (l *Limiter) Release(a netip.Addr, now int64) {
	ks, ms := keys(a)
	l.mu.Lock()
	defer l.mu.Unlock()
	for i, k := range ks {
		x := l.m[k]
		if x == nil || x.open == 0 {
			continue
		}
		x.open--
		if x.open == 0 {
			l.refill(x, ms[i], now)
			if l.refilled(x, now) {
				delete(l.m, k)
				continue
			}
			x.el = l.idle.PushFront(x)
		}
	}
}

// Set changes the limits (config reload).
func (l *Limiter) Set(lim Limits) {
	l.mu.Lock()
	l.lim = norm(lim)
	l.mu.Unlock()
}

// Len is the number of prefixes held at now (tests check it empties).
func (l *Limiter) Len(now int64) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.forget(now)
	return len(l.m)
}

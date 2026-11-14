package node

import (
	"math"
	"net/netip"
	"runtime/debug"
	"runtime/metrics"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

/* Growth budgets. Keys cost nothing to make, so without bounds one address could have a node keep
   a new network's records many times a second, and every federated server with it. What is new is
   counted by the hour in token buckets: keys this node has no record of, bytes of new records, and
   live-state keys without an announce here. One bucket per connection, per address (an IPv6 /64)
   and per other server; addresses live in memory only, like the connection limiter's, and a full
   bucket is forgotten. Another server's identity costs nothing to make up, so only registry servers
   and configured neighbours have a bucket of their own: all other servers share one, and a
   session with one of them is also counted by the address it came from, as a game's is. A record another server
   passes on that carries a receipt of a registry server (or of this server) was counted where
   that server took it: it is not counted again, so a neighbour never pays for what it forwards. Past a high-water mark (records, bytes kept, heap, free disk) only networks
   that already have an announce here may put: players keep playing, newcomers wait. Records from
   nodes of this server, bootstrapping and the operator's command line are not counted. */

// budget is a token bucket that refills to its hourly amount in an hour.
type budget struct {
	n  float64
	at int64
	on bool
}

// left refills the bucket to now and gives what is left of per, the hourly amount.
func (b *budget) left(now int64, per float64) float64 {
	if !b.on {
		b.n, b.at, b.on = per, now, true
	}
	if now > b.at {
		b.n = min(per, b.n+float64(now-b.at)*per/3600)
		b.at = now
	}
	return b.n
}

// quota is the budgets of one connection, address or other server.
type quota struct{ keys, bytes, live, reports budget }

// idle reports whether every budget of q is full again (it can be forgotten).
func (q *quota) idle(now int64, keys, bytes, live float64) bool {
	rep := float64(maxReportsPerAddr)
	return q.keys.left(now, keys) >= keys && q.bytes.left(now, bytes) >= bytes && q.live.left(now, live) >= live &&
		q.reports.left(now, rep) >= rep
}

// quotaRef is one bucket set that a record or state is counted against, with its hourly amounts.
type quotaRef struct {
	q                 *quota
	keys, bytes, live float64
	name              string // conn, addr or peer: the metric's label prefix
}

// maxQuotas bounds the addresses and servers with buckets held (a var for tests); past it, idle
// ones are forgotten first, and a new one is let through uncounted, as the connection limiter does.
var maxQuotas = 1 << 16

// addrKey is what an address is counted by: an IPv4 address, or an IPv6 address's /64.
func addrKey(a netip.Addr) netip.Addr {
	a = a.Unmap()
	if a.Is6() {
		if p, err := a.Prefix(64); err == nil {
			return p.Addr()
		}
	}
	return a
}

// quotaOf finds or makes the buckets of k in m (lock held); nil when m is full of busy ones.
func quotaOf[K comparable](r *Relay, m map[K]*quota, k K, now int64) *quota {
	if q := m[k]; q != nil {
		return q
	}
	if len(m) >= maxQuotas {
		r.sweepQuotas(now)
		if len(m) >= maxQuotas {
			return nil
		}
	}
	q := &quota{}
	m[k] = q
	return q
}

// quotas lists the buckets a record or state from o is counted against (lock held): none for this
// server's own nodes, bootstrapping and the command line.
func (r *Relay) quotas(o origin, now int64) []quotaRef {
	b := r.cfg.Budgets
	var out []quotaRef
	switch {
	case o.sess != nil:
		out = append(out, quotaRef{&o.sess.q, float64(b.NewKeysPerConn), float64(b.BytesPerConn), float64(b.LiveKeysPerConn), "conn"})
		if o.sess.addr.IsValid() {
			if q := quotaOf(r, r.addrQ, o.sess.addr, now); q != nil {
				out = append(out, quotaRef{q, float64(b.NewKeysPerAddr), float64(b.BytesPerAddr), float64(b.LiveKeysPerAddr), "addr"})
			}
		}
	case o.peer != nil && !o.same:
		// Registry servers and configured neighbours have a bucket each; every other server, which
		// may be made up by the thousand, shares one ("" never is a server id).
		id := o.peer.peerServer
		own := r.regs[id] != nil || o.peer.neighbour
		if !own {
			id = ""
		}
		if q := quotaOf(r, r.peerQ, id, now); q != nil {
			out = append(out, quotaRef{q, float64(b.NewKeysPerPeer), float64(b.BytesPerPeer), float64(b.LiveKeysPerPeer), "peer"})
		}
		if !own && o.peer.addr.IsValid() {
			// And by the address it came from, as a game's connection is: speaking as a node does
			// not get around the address's budget.
			if q := quotaOf(r, r.addrQ, o.peer.addr, now); q != nil {
				out = append(out, quotaRef{q, float64(b.NewKeysPerAddr), float64(b.BytesPerAddr), float64(b.LiveKeysPerAddr), "addr"})
			}
		}
	}
	return out
}

// vouched reports whether a record from another server carries a receipt that counts here (rcpts,
// already checked): a registry server or a node of this server took it and counted it against its
// own budgets then, so the server passing it on is not charged for it again.
func vouched(o origin, rcpts []map[string]any) bool {
	return o.peer != nil && !o.same && len(rcpts) > 0
}

// stranger reports whether a record comes from someone the budgets and the high-water mark apply
// to: a client connection or another server.
func (o origin) stranger() bool { return o.sess != nil || o.peer != nil && !o.same }

// growthCheck is the check of a new record against the budgets and the high-water mark (lock
// held). It gives the buckets to charge once the record is stored, whether its key is new here,
// and "" or rate_limited.
func (r *Relay) growthCheck(rec *fed.Record, now int64, o origin, rcpts []map[string]any) ([]quotaRef, bool, string) {
	// Hides count like any record (one is kept per server, 5.7, but it may be some 30 KB and
	// replaced at will); other operator records are bounded by their chains and vote caps.
	if !o.stranger() || operatorKinds[rec.Kind] && rec.Kind != "hide" || r.st.Get(rec.ID) != nil {
		return nil, false, ""
	}
	// This server's own hide passes the high-water mark: operators moderate most when it is busy.
	ownHide := rec.Kind == "hide" && r.own != nil && rec.Str("server") == r.own.ID
	if r.ann[rec.Key] == nil && !ownHide && r.highWater(now) {
		r.o.Metrics.Inc("relay_budget_refused_total", "high_water")
		return nil, false, fed.RateLimited
	}
	if vouched(o, rcpts) {
		return nil, false, ""
	}
	refs := r.quotas(o, now)
	newKey := !r.st.HasKey(rec.Key)
	for _, x := range refs {
		if newKey && x.q.keys.left(now, x.keys) < 1 {
			r.o.Metrics.Inc("relay_budget_refused_total", x.name+"_keys")
			return nil, false, fed.RateLimited
		}
		// Bytes may go into debt by one record: its size is known once it is stored.
		if x.q.bytes.left(now, x.bytes) <= 0 {
			r.o.Metrics.Inc("relay_budget_refused_total", x.name+"_bytes")
			return nil, false, fed.RateLimited
		}
	}
	return refs, newKey, ""
}

// charge counts a stored record against its buckets (lock held).
func charge(refs []quotaRef, newKey bool, e *store.Entry) {
	for _, x := range refs {
		if newKey {
			x.q.keys.n--
		}
		x.q.bytes.n -= float64(e.Size())
	}
}

// liveCheck is the check of a live state of a key this node holds no state of and has no announce
// of (lock held): it counts against the live budgets. It gives a func that charges them once the
// state is kept, and "" or rate_limited.
func (r *Relay) liveCheck(key string, now int64, o origin) (func(), string) {
	if !o.stranger() || r.ann[key] != nil || r.rank.LiveOf(key) != nil {
		return func() {}, ""
	}
	refs := r.quotas(o, now)
	for _, x := range refs {
		if x.q.live.left(now, x.live) < 1 {
			r.o.Metrics.Inc("relay_budget_refused_total", "live_"+x.name)
			return nil, fed.RateLimited
		}
	}
	return func() {
		for _, x := range refs {
			x.q.live.n--
		}
	}, ""
}

// sweepQuotas forgets the buckets of addresses and servers that are full again (lock held).
func (r *Relay) sweepQuotas(now int64) {
	b := r.cfg.Budgets
	for k, q := range r.addrQ {
		if q.idle(now, float64(b.NewKeysPerAddr), float64(b.BytesPerAddr), float64(b.LiveKeysPerAddr)) {
			delete(r.addrQ, k)
		}
	}
	for k, q := range r.peerQ {
		if q.idle(now, float64(b.NewKeysPerPeer), float64(b.BytesPerPeer), float64(b.LiveKeysPerPeer)) {
			delete(r.peerQ, k)
		}
	}
}

// pressureEvery is how often the heap and the free disk are read again, in seconds.
const pressureEvery = 5

// highWater reports whether this node is past its high-water mark (lock held): records or bytes
// kept, the Go heap in use, or the free disk.
func (r *Relay) highWater(now int64) bool {
	b := r.cfg.Budgets
	if r.st.Len() >= b.MaxRecords || r.st.Bytes() >= b.MaxStoreBytes {
		return true
	}
	if r.hwAt == 0 || now-r.hwAt >= pressureEvery || now < r.hwAt {
		r.hwAt, r.heap, r.free = now, heapInUse(), r.st.FreeDisk()
	}
	return r.heap >= heapMark(b.MaxHeapBytes) || r.free >= 0 && r.free < b.MinFreeDisk
}

// heapMark is the heap high-water mark: the configured one, or four fifths of the Go memory limit
// (GOMEMLIMIT) when that is lower.
func heapMark(conf int64) int64 {
	if lim := debug.SetMemoryLimit(-1); lim < math.MaxInt64 {
		return min(conf, lim/5*4)
	}
	return conf
}

// heapInUse is the bytes of live and not yet swept heap objects (cheap: no stop of the world).
func heapInUse() int64 {
	s := []metrics.Sample{{Name: "/memory/classes/heap/objects:bytes"}}
	metrics.Read(s)
	if s[0].Value.Kind() != metrics.KindUint64 {
		return 0
	}
	return int64(s[0].Value.Uint64())
}

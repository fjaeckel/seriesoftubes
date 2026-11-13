package main

import (
	"math"
	"net"
	"slices"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// meter collects what the simulated players observe: latencies by operation, errors by operation
// and code, and plain counts.
type meter struct {
	mu     sync.Mutex
	lat    map[string][]float64 // milliseconds
	errs   map[string]map[string]int64
	counts map[string]int64

	framesOut, framesIn atomic.Int64
	bytesOut, bytesIn   atomic.Int64
}

func newMeter() *meter {
	return &meter{lat: map[string][]float64{}, errs: map[string]map[string]int64{}, counts: map[string]int64{}}
}

func (m *meter) obs(op string, d time.Duration) {
	m.mu.Lock()
	m.lat[op] = append(m.lat[op], float64(d)/float64(time.Millisecond))
	m.mu.Unlock()
}

func (m *meter) err(op, code string) {
	m.mu.Lock()
	if m.errs[op] == nil {
		m.errs[op] = map[string]int64{}
	}
	m.errs[op][code]++
	m.mu.Unlock()
}

func (m *meter) add(name string, n int64) {
	m.mu.Lock()
	m.counts[name] += n
	m.mu.Unlock()
}

func (m *meter) count(name string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.counts[name]
}

// Dist is a latency distribution in milliseconds.
type Dist struct {
	N   int     `json:"n"`
	P50 float64 `json:"p50"`
	P95 float64 `json:"p95"`
	P99 float64 `json:"p99"`
	Max float64 `json:"max"`
}

// dist summarises samples (nearest rank).
func dist(v []float64) Dist {
	if len(v) == 0 {
		return Dist{}
	}
	s := slices.Clone(v)
	sort.Float64s(s)
	q := func(p float64) float64 {
		i := int(math.Ceil(p*float64(len(s)))) - 1
		return s[max(0, min(i, len(s)-1))]
	}
	return Dist{N: len(s), P50: q(0.50), P95: q(0.95), P99: q(0.99), Max: s[len(s)-1]}
}

// counted wraps a connection to count the bytes it carries (TLS records, as on the wire).
type counted struct {
	net.Conn
	m *meter
}

func (c counted) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	c.m.bytesIn.Add(int64(n))
	return n, err
}

func (c counted) Write(b []byte) (int, error) {
	n, err := c.Conn.Write(b)
	c.m.bytesOut.Add(int64(n))
	return n, err
}

// propagation follows each announce from the server it was put on to the first subscriber on
// every other server that receives it.
type propagation struct {
	mu   sync.Mutex
	recs map[string]*propRec
	hops map[int][]float64 // hop count -> delays, ms
	all  []float64
	dist [][]int
	n    int
}

type propRec struct {
	at   time.Time
	srv  int
	seen []time.Duration // per server; -1 not yet, -2 no live subscriber when it was put
}

func newPropagation(dist [][]int) *propagation {
	return &propagation{recs: map[string]*propRec{}, hops: map[int][]float64{}, dist: dist, n: len(dist)}
}

// put notes an announce (by author key and t) about to be put on server srv. live says which
// servers have a subscriber past its backlog now: only those can see it at once, so only they count.
func (p *propagation) put(id string, srv int, at time.Time, live []bool) {
	r := &propRec{at: at, srv: srv, seen: make([]time.Duration, p.n)}
	for i := range r.seen {
		r.seen[i] = -1
		if !live[i] {
			r.seen[i] = -2
		}
	}
	p.mu.Lock()
	p.recs[id] = r
	p.mu.Unlock()
}

// saw notes that a subscriber on server srv received the announce.
func (p *propagation) saw(id string, srv int, at time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	r := p.recs[id]
	if r == nil || r.srv == srv || r.seen[srv] != -1 {
		return
	}
	d := max(at.Sub(r.at), 0)
	r.seen[srv] = d
	ms := float64(d) / float64(time.Millisecond)
	h := p.dist[r.srv][srv]
	p.hops[h] = append(p.hops[h], ms)
	p.all = append(p.all, ms)
}

// PropReport is the propagation part of the report.
type PropReport struct {
	All      Dist         `json:"all"`
	ByHops   map[int]Dist `json:"byHops"`
	Expected int          `json:"expected"`  // (announce, other server) pairs put at least 60 s before the end
	Within10 float64      `json:"within10s"` // fraction of Expected seen within 10 s
	Within60 float64      `json:"within60s"`
	Never    int          `json:"never"` // of Expected, never seen
}

func (p *propagation) report(end time.Time) PropReport {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := PropReport{All: dist(p.all), ByHops: map[int]Dist{}}
	for h, v := range p.hops {
		out.ByHops[h] = dist(v)
	}
	var in10, in60 int
	for _, r := range p.recs {
		if end.Sub(r.at) < time.Minute {
			continue
		}
		for s, d := range r.seen {
			if s == r.srv || d == -2 {
				continue
			}
			out.Expected++
			switch {
			case d < 0:
				out.Never++
			case d <= 10*time.Second:
				in10++
				in60++
			case d <= time.Minute:
				in60++
			}
		}
	}
	if out.Expected > 0 {
		out.Within10 = float64(in10) / float64(out.Expected)
		out.Within60 = float64(in60) / float64(out.Expected)
	}
	return out
}

// dealBook follows sealed offers from their author to the answer coming back.
type dealBook struct {
	mu     sync.Mutex
	offers map[string]*offerRec // offer id -> offer
	leaks  atomic.Int64         // deal records a session received that were not its own
	lat    map[bool][]float64   // cross-server? -> offer put to answer seen, ms
}

type offerRec struct {
	from, to  int
	at        time.Time
	cross     bool
	answered  bool
	accepted  bool
	delivered bool // the counterparty received it
}

func newDealBook() *dealBook {
	return &dealBook{offers: map[string]*offerRec{}, lat: map[bool][]float64{}}
}

func (d *dealBook) offered(id string, from, to int, cross bool, at time.Time) {
	d.mu.Lock()
	d.offers[id] = &offerRec{from: from, to: to, at: at, cross: cross}
	d.mu.Unlock()
}

// delivered notes the counterparty received the offer; false when it already had or it is unknown.
func (d *dealBook) delivered(id string, to int) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	o := d.offers[id]
	if o == nil || o.to != to || o.delivered {
		return false
	}
	o.delivered = true
	return true
}

// answered notes that the author saw the answer to its offer.
func (d *dealBook) answered(id string, from int, accepted bool, at time.Time) {
	d.mu.Lock()
	defer d.mu.Unlock()
	o := d.offers[id]
	if o == nil || o.from != from || o.answered {
		return
	}
	o.answered, o.accepted = true, accepted
	d.lat[o.cross] = append(d.lat[o.cross], float64(at.Sub(o.at))/float64(time.Millisecond))
}

// DealReport is the sealed deals part of the report.
type DealReport struct {
	Offers      int     `json:"offers"` // put at least 60 s before the end
	Cross       int     `json:"crossServer"`
	CrossDone   int     `json:"crossAnswered"`
	SameDone    int     `json:"sameAnswered"`
	CrossRate   float64 `json:"crossSuccess"`
	SameRate    float64 `json:"sameSuccess"`
	Accepted    int     `json:"accepted"`
	Declined    int     `json:"declined"`
	Undelivered int     `json:"undelivered"`
	CrossLat    Dist    `json:"crossLatency"`
	SameLat     Dist    `json:"sameLatency"`
	Leaks       int64   `json:"leaks"`
}

func (d *dealBook) report(end time.Time) DealReport {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := DealReport{CrossLat: dist(d.lat[true]), SameLat: dist(d.lat[false]), Leaks: d.leaks.Load()}
	for _, o := range d.offers {
		if end.Sub(o.at) < time.Minute {
			continue
		}
		out.Offers++
		if o.cross {
			out.Cross++
		}
		if !o.delivered {
			out.Undelivered++
		}
		if o.answered {
			if o.cross {
				out.CrossDone++
			} else {
				out.SameDone++
			}
			if o.accepted {
				out.Accepted++
			} else {
				out.Declined++
			}
		}
	}
	if out.Cross > 0 {
		out.CrossRate = float64(out.CrossDone) / float64(out.Cross)
	}
	if same := out.Offers - out.Cross; same > 0 {
		out.SameRate = float64(out.SameDone) / float64(same)
	}
	return out
}

package rank

import (
	"context"
	"maps"
	"slices"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

/* Live states (spec 5.11) and the boards of the measure now (10.13).

   A live state is a network's current numbers, signed, sent every few seconds while its game is
   open. It is never stored: the aggregate keeps the newest one of each key in memory, bounded,
   and forgets a key StateLife seconds after its newest state's t. Rankings of now are worked out
   from a snapshot of that map: a copy of the pointers taken at most every snapEvery seconds when
   someone asks, kept snapKeep seconds so a spot check (rankwhy) is answered from the same states
   the ranking used. A ranking is cached for its snapshot and its slice (singleflight, like the
   other boards), so the work is at most one ranking per slice every snapEvery seconds. */

// Live is one network's newest live state. Never changed once published.
type Live struct {
	ID, Key string
	T       int64
	Raw     []byte // the canonical text, as signed: what is passed on and shown
	asn     int64
	s       *stat
}

// Results of State.
const (
	StateNew   = iota // kept: newer than what was held (pass it on)
	StateOld          // not newer than the state held: nothing changes
	StateFull         // a key not held, and the map is at its bound
	StateStale        // t is StateLife seconds old or more: never live
)

// Bounds of the live map (reference relay): keys and bytes of canonical text, and the snapshots.
const (
	LiveMax      = 50000
	LiveMaxBytes = 128 << 20
	snapEvery    = 2  // seconds: a ranking of now is at most this old
	winEvery     = 10 // seconds: a ranking over the windows (its running slot, 10.13) is at most this old
	snapKeep     = 30 // seconds a snapshot is kept for spot checks
	snapMax      = 16
)

type snap struct {
	at int64
	m  map[string]*Live
}

// live returns k's state when it is live at the snapshot's time.
func (sn *snap) live(k string) *Live {
	if l := sn.m[k]; l != nil && l.T > sn.at-fed.StateLife {
		return l
	}
	return nil
}

// newerLive reports whether a state (t, id) wins over l: greater t, then lower id.
func newerLive(t int64, id string, l *Live) bool { return t > l.T || t == l.T && id < l.ID }

// SetLiveCap changes the bounds of the live map (tests; 0 keeps a bound).
func (a *Agg) SetLiveCap(keys, bytes int) {
	a.lmu.Lock()
	defer a.lmu.Unlock()
	if keys > 0 {
		a.lmax = keys
	}
	if bytes > 0 {
		a.lmaxB = bytes
	}
}

// Fresher reports whether a state of key at t may be newer than the one held (a check before its
// signature is verified: a copy that came by another path costs nothing).
func (a *Agg) Fresher(key string, t int64) bool {
	a.lmu.RLock()
	defer a.lmu.RUnlock()
	l := a.lm[key]
	return l == nil || t >= l.T
}

// State keeps a checked live state when it is newer than the one held (the body as checked,
// raw its canonical text). now: this node's clock.
func (a *Agg) State(id, key string, t int64, body map[string]any, raw []byte, now int64) int {
	if now-t >= fed.StateLife {
		return StateStale
	}
	if !a.Fresher(key, t) {
		return StateOld
	}
	s := parse(id, key, 0, t, body, "")
	asn, _ := fed.ASN(key)
	l := &Live{ID: id, Key: key, T: t, Raw: raw, asn: asn, s: s}
	a.lmu.Lock()
	defer a.lmu.Unlock()
	cur := a.lm[key]
	if cur != nil && !newerLive(t, id, cur) {
		return StateOld
	}
	if cur == nil && (len(a.lm) >= a.lmax || a.lbytes+len(raw) > a.lmaxB) {
		a.expireLocked(now)
		if len(a.lm) >= a.lmax || a.lbytes+len(raw) > a.lmaxB {
			return StateFull
		}
	}
	if cur != nil {
		a.lbytes -= len(cur.Raw)
	}
	a.lm[key] = l
	a.lbytes += len(raw)
	return StateNew
}

// DropState forgets a key's live state (it left, or is shunned).
func (a *Agg) DropState(key string) {
	a.lmu.Lock()
	defer a.lmu.Unlock()
	if l := a.lm[key]; l != nil {
		a.lbytes -= len(l.Raw)
		delete(a.lm, key)
	}
}

// ExpireStates forgets the keys that went quiet (no state for StateLife seconds) and the snapshots
// no spot check asks for any more. It gives how many keys are held.
func (a *Agg) ExpireStates(now int64) int {
	a.lmu.Lock()
	defer a.lmu.Unlock()
	a.expireLocked(now)
	return len(a.lm)
}

func (a *Agg) expireLocked(now int64) {
	for k, l := range a.lm {
		if now-l.T >= fed.StateLife {
			a.lbytes -= len(l.Raw)
			delete(a.lm, k)
		}
	}
	a.snaps = slices.DeleteFunc(a.snaps, func(s *snap) bool { return now-s.at > snapKeep })
}

// LiveOf is key's state held, or nil.
func (a *Agg) LiveOf(key string) *Live {
	a.lmu.RLock()
	defer a.lmu.RUnlock()
	return a.lm[key]
}

// LiveStates lists every state held (for a node session that starts: its peer gets them all).
func (a *Agg) LiveStates() []*Live {
	a.lmu.RLock()
	defer a.lmu.RUnlock()
	return slices.Collect(maps.Values(a.lm))
}

// LiveStats gives the keys and bytes of canonical text held.
func (a *Agg) LiveStats() (int, int) {
	a.lmu.RLock()
	defer a.lmu.RUnlock()
	return len(a.lm), a.lbytes
}

// snapshot gives the snapshot a ranking at now uses: the newest when it is under every seconds old
// and in the same slot, else a new one.
func (a *Agg) snapshot(now, every int64) *snap {
	a.lmu.Lock()
	defer a.lmu.Unlock()
	if n := len(a.snaps); n > 0 {
		if s := a.snaps[n-1]; now >= s.at && now-s.at < every && fed.Slot(s.at) == fed.Slot(now) {
			return s
		}
	}
	m := make(map[string]*Live, len(a.lm))
	for k, l := range a.lm {
		if l.T > now-fed.StateLife {
			m[k] = l
		}
	}
	s := &snap{at: now, m: m}
	a.snaps = append(a.snaps, s)
	a.snaps = slices.DeleteFunc(a.snaps, func(x *snap) bool { return now-x.at > snapKeep })
	if len(a.snaps) > snapMax {
		a.snaps = a.snaps[len(a.snaps)-snapMax:]
	}
	return s
}

// snapAt is the kept snapshot made at at, or nil.
func (a *Agg) snapAt(at int64) *snap {
	a.lmu.RLock()
	defer a.lmu.RUnlock()
	for _, s := range a.snaps {
		if s.at == at {
			return s
		}
	}
	return nil
}

// rankNow answers a slice of the measure now (10.13).
func (a *Agg) rankNow(ctx context.Context, q *Slice, now int64, me string, n int) (*Answer, error) {
	c := a.prepare(now)
	sn := a.snapshot(now, snapEvery)
	k := a.nowStamp(sn) + "|" + itoa(int64(a.meta.Load())) + "|" + q.key()
	f, owner := a.flightFor(a.nowSlices, k)
	if owner {
		select {
		case a.jobs <- func() { a.sliceNow(f, q, sn, c); a.land(a.nowSlices, k, f) }:
		default:
			f.err = ErrBusy
			a.land(a.nowSlices, k, f)
		}
	}
	if err := wait(ctx, f); err != nil {
		return nil, err
	}
	ans := a.answer(f, now, me, n)
	ans.At = sn.at
	ans.Cached = !owner
	return ans, nil
}

// nowStamp names the state a ranking of now is worked out from: the snapshot and the exclusions.
func (a *Agg) nowStamp(sn *snap) string {
	return "now|" + itoa(sn.at) + "|" + itoa(int64(a.xgen.Load()))
}

// sliceNow is slice for the measure now, on a worker.
func (a *Agg) sliceNow(f *flight, q *Slice, sn *snap, c int64) {
	k := a.nowStamp(sn) + "|" + q.baseKey()
	if q.Board == "cone" {
		k += "|" + itoa(int64(a.meta.Load()))
	}
	b, owner := a.flightFor(a.nowBases, k)
	if owner {
		b.rows = a.computeNow(q.Board, q.Cities, sn)
		b.slot = c
		a.land(a.nowBases, k, b)
	}
	if f.err = wait(context.Background(), b); f.err != nil {
		return
	}
	var keys map[string]bool
	if q.Keys != nil {
		keys = make(map[string]bool, len(q.Keys))
		for _, x := range q.Keys {
			keys[x] = true
		}
	}
	day := fed.Div(sn.at, fed.Day)
	a.mu.RLock()
	idx := make([]int32, 0, len(b.rows))
	for i, r := range b.rows {
		if keep(q, r, day, keys) {
			idx = append(idx, int32(i))
		}
	}
	a.mu.RUnlock()
	f.idx, f.rows, f.slot = idx, b.rows, c
}

// computeNow is 10.13 for one board and region over a snapshot (read lock).
func (a *Agg) computeNow(board string, cities []string, sn *snap) []brow {
	a.mu.RLock()
	defer a.mu.RUnlock()
	var rg *region
	if cities != nil {
		rg = &region{cities: make(map[string]bool, len(cities)), in: map[*stat]bool{}}
		for _, c := range cities {
			rg.cities[c] = true
		}
	}
	var cone map[string]int32
	if board == "cone" {
		cone = a.coneNow(sn)
	}
	rows := make([]brow, 0, len(sn.m))
	for k := range sn.m {
		l := sn.live(k)
		if l == nil || !l.s.normal || a.ex[k] {
			continue
		}
		s := l.s
		if board == "pies" && !s.hasPies || rg != nil && !rg.has(s) {
			continue
		}
		var v int64
		switch board {
		case "pops":
			v = s.popsIn(rg.set())
		case "pies":
			v = int64(s.pies)
		case "total":
			v = int64(s.total)
		case "traffic":
			in, out := a.trafficNow(k, s, sn, rg)
			v = max(in, out)
		case "cone":
			v = int64(cone[k])
		}
		x := a.nets[k]
		if x == nil {
			x = &net{key: k, asn: l.asn}
		}
		// The country a row shows, and the from filter reads, is its newest stats record's (5.11).
		last := s
		if r := x.newest(); r != nil && r.cc != "" {
			cp := *s
			cp.cc = r.cc
			last = &cp
		}
		rows = append(rows, brow{x, last, v})
	}
	slices.SortFunc(rows, func(p, q brow) int {
		if p.v != q.v {
			return cmp64(q.v, p.v)
		}
		return strings.Compare(p.x.key, q.x.key)
	})
	return rows
}

// trafficNow is IN and OUT of k now (10.13): min() of both sides' live states; a partner without
// a live state, or not in normal mode, or excluded, counts 0.
func (a *Agg) trafficNow(k string, s *stat, sn *snap, rg *region) (int64, int64) {
	var in, out int64
	for _, e := range s.tr {
		if a.ex[e.key] {
			continue
		}
		y := sn.live(e.key)
		if y == nil || !y.s.normal || rg != nil && !rg.has(y.s) {
			continue
		}
		yi, yo := y.s.report(k)
		in += min(int64(e.in), yo)
		out += min(int64(e.out), yi)
	}
	return in, out
}

// coneNow is every live network's cone size now (10.13; read lock): one graph of the counted
// edges between live states, worked out like one slot of the cone board.
func (a *Agg) coneNow(sn *snap) map[string]int32 {
	day := fed.Div(sn.at, fed.Day)
	var cand []string
	for k := range sn.m {
		if l := sn.live(k); l != nil && l.s.normal && l.s.lists() && !a.ex[k] {
			cand = append(cand, k)
		}
	}
	slices.Sort(cand)
	idx := make(map[string]uint32, len(cand))
	for i, k := range cand {
		idx[k] = uint32(i)
	}
	edges := map[uint64]int32{}
	for zi, z := range cand {
		for _, y := range sn.m[z].s.custOK() {
			yi, ok := idx[y]
			if !ok || y == z {
				continue
			}
			ye := sn.m[y]
			if !ye.s.hasUp(z) {
				continue
			}
			x := a.nets[y]
			if x == nil || x.ann == nil || day-x.ann.Founded < fed.NewcomerDays {
				continue
			}
			edges[uint64(zi)<<32|uint64(yi)] = 1
		}
	}
	out := map[string]int32{}
	if len(edges) == 0 {
		return out
	}
	for _, r := range coneGraph(edges) {
		out[cand[r.node]] = r.size
	}
	return out
}

// WhyNow gives what a client needs to work out key's value on a board of now (9.5 rankwhy): the
// live states of the snapshot at at (the newest when it is not kept, or at is 0) behind the row,
// the ids of the stats records whose receipt gives the country (the key's newest), the keys
// whose newest announce goes with them, and the snapshot's time.
func (a *Agg) WhyNow(q *Slice, key string, now, at int64) ([]*Live, []string, []string, int64, error) {
	if !a.ready.Load() {
		return nil, nil, nil, 0, ErrNotReady
	}
	a.prepare(now)
	var sn *snap
	if at != 0 {
		sn = a.snapAt(at)
	}
	if sn == nil {
		sn = a.snapshot(now, snapEvery)
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	var states []*Live
	var ids []string
	anns := []string{key}
	if x := a.nets[key]; x != nil {
		if r := x.newest(); r != nil {
			ids = append(ids, r.id)
		}
	}
	l := sn.live(key)
	if l == nil {
		return states, ids, anns, sn.at, nil
	}
	states = append(states, l)
	var ps []string
	switch q.Board {
	case "traffic":
		for _, e := range l.s.tr {
			if e.key != key && !a.ex[e.key] && sn.live(e.key) != nil {
				ps = append(ps, e.key)
			}
		}
	case "cone":
		// The networks the key's live state lists as customers, theirs, and so on.
		seen := map[string]bool{key: true}
		todo := []*Live{l}
		for len(todo) > 0 {
			z := todo[len(todo)-1]
			todo = todo[:len(todo)-1]
			for _, k := range z.s.cust() {
				if seen[k] || a.ex[k] {
					continue
				}
				seen[k] = true
				if y := sn.live(k); y != nil {
					ps = append(ps, k)
					todo = append(todo, y)
				}
			}
		}
		slices.Sort(ps)
		anns = append(anns, ps...)
	}
	if len(ps) > WhyPartners {
		return nil, nil, nil, sn.at, ErrTooMany
	}
	for _, k := range ps {
		states = append(states, sn.live(k))
	}
	return states, ids, anns, sn.at, nil
}

// snapKey names a snapshot in a cache key ("-" for none).
func snapKey(sn *snap) string {
	if sn == nil {
		return "-"
	}
	return itoa(sn.at)
}

// sample is a key's value in the running slot (10.13, running slot): in (and out for traffic).
type sample struct {
	in, out int64
	ok      bool
}

// runOf is what a key reports in the running slot c: its live state in the snapshot, else its
// effective stats record at c (10.2, records of the running slot included), else nil (read lock).
func (a *Agg) runOf(k string, sn *snap, c int64) *stat {
	if l := sn.live(k); l != nil {
		return l.s
	}
	if x := a.nets[k]; x != nil {
		return x.eff(c)
	}
	return nil
}

// runSample is key's sample in the running slot of the current window: only a key with a live
// state in normal mode has one (read lock). coneRun: the cone sizes of the running slot.
func (a *Agg) runSample(k, board string, sn *snap, c int64, rg *region, coneRun map[string]int32) sample {
	if sn == nil {
		return sample{}
	}
	l := sn.live(k)
	if l == nil || !l.s.normal {
		return sample{}
	}
	s := l.s
	switch board {
	case "pops":
		return sample{in: s.popsIn(rg.set()), ok: true}
	case "pies":
		return sample{in: int64(s.pies), ok: true}
	case "total":
		return sample{in: int64(s.total), ok: true}
	case "cone":
		return sample{in: int64(coneRun[k]), ok: true}
	}
	var in, out int64
	for _, e := range s.tr {
		if a.ex[e.key] {
			continue
		}
		y := a.runOf(e.key, sn, c)
		if rg != nil && (y == nil || !y.normal || !rg.has(y)) {
			continue
		}
		switch {
		case y == nil:
			in += int64(e.in)
			out += int64(e.out)
		case !y.normal:
		default:
			yi, yo := y.report(k)
			in += min(int64(e.in), yo)
			out += min(int64(e.out), yi)
		}
	}
	return sample{in: in, out: out, ok: true}
}

// coneRun is every key's cone size in the running slot c (read lock): the graph of what each key
// reports there (runOf), established counted at c.
func (a *Agg) coneRun(sn *snap, c int64) map[string]int32 {
	day := fed.Div(c, fed.Day)
	seen := map[string]bool{}
	var cand []string
	add := func(k string) {
		if seen[k] {
			return
		}
		seen[k] = true
		if r := a.runOf(k, sn, c); r != nil && r.normal && r.lists() && !a.ex[k] {
			cand = append(cand, k)
		}
	}
	for k := range sn.m {
		add(k)
	}
	for k, x := range a.nets {
		if x.withCn > 0 {
			add(k)
		}
	}
	slices.Sort(cand)
	idx := make(map[string]uint32, len(cand))
	for i, k := range cand {
		idx[k] = uint32(i)
	}
	edges := map[uint64]int32{}
	for zi, z := range cand {
		for _, y := range a.runOf(z, sn, c).custOK() {
			yi, ok := idx[y]
			if !ok || y == z || !a.runOf(y, sn, c).hasUp(z) {
				continue
			}
			x := a.nets[y]
			if x == nil || x.ann == nil || day-x.ann.Founded < fed.NewcomerDays {
				continue
			}
			edges[uint64(zi)<<32|uint64(yi)] = 1
		}
	}
	out := map[string]int32{}
	if len(edges) == 0 {
		return out
	}
	for _, r := range coneGraph(edges) {
		out[cand[r.node]] = r.size
	}
	return out
}

package rank

import (
	"errors"
	"slices"
)

// Bounds of a rankwhy answer (9.3): the partners whose records are sent, and records in all.
const (
	WhyPartners = 512
	WhyRecords  = 20000
)

// ErrTooMany is a rankwhy answer over its bounds.
var ErrTooMany = errors.New("rank: too many records to show")

// Why gives what a client needs to work out key's value in the slice at now (10.2 to 10.5, 10.12,
// 10.13): the ids of every held stats record of the key, and on the traffic board of each network
// its records or its live state list (whose reports the min() rule reads, and whose POPs a region
// asks about); on the cone board, of each network the key's cone can reach over the customers its
// records and live states list, theirs, and so on. The keys whose newest announce goes with them
// (the filters read the key's, the cone board the members' founded). And, for the running slot
// (10.13), the live states of the snapshot made at at (the newest when it is not kept, or at is 0)
// of the key and of those networks, the running slot c and the snapshot's time. Excluded networks'
// records are not needed: traffic with them counts 0, and no edge leads to them.
func (a *Agg) Why(q *Slice, key string, now, at int64) ([]string, []string, []*Live, int64, int64, error) {
	if !a.ready.Load() {
		return nil, nil, nil, 0, 0, ErrNotReady
	}
	c := a.prepare(now)
	var sn *snap
	if at != 0 {
		sn = a.snapAt(at)
	}
	if sn == nil {
		sn = a.snapshot(now, winEvery)
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	x := a.nets[key]
	lk := sn.live(key)
	var ids []string
	var states []*Live
	if x != nil {
		for _, s := range x.all {
			ids = append(ids, s.id)
		}
	}
	if lk != nil {
		states = append(states, lk)
	}
	anns := []string{key}
	var ps []string
	switch q.Board {
	case "cone":
		// The networks any held record or live state of the cone lists as a customer, transitively.
		seen := map[string]bool{key: true}
		todo := []string{key}
		for len(todo) > 0 {
			z := todo[len(todo)-1]
			todo = todo[:len(todo)-1]
			var lists [][]string
			if y := a.nets[z]; y != nil {
				for _, s := range y.all {
					lists = append(lists, s.cust())
				}
			}
			if l := sn.live(z); l != nil {
				lists = append(lists, l.s.cust())
			}
			for _, l := range lists {
				for _, k := range l {
					if seen[k] || a.ex[k] {
						continue
					}
					seen[k] = true
					ps = append(ps, k)
					if len(ps) > WhyPartners {
						return nil, nil, nil, c, sn.at, ErrTooMany
					}
					todo = append(todo, k)
				}
			}
		}
		slices.Sort(ps)
		anns = append(anns, ps...) // their founded says who is established
	case "traffic":
		seen := map[string]bool{}
		var all []tentry
		if x != nil {
			for _, s := range x.all {
				all = append(all, s.tr...)
			}
		}
		if lk != nil {
			all = append(all, lk.s.tr...)
		}
		for _, e := range all {
			if e.key != key && !a.ex[e.key] && !seen[e.key] {
				seen[e.key] = true
				ps = append(ps, e.key)
			}
		}
		if len(ps) > WhyPartners {
			return nil, nil, nil, c, sn.at, ErrTooMany
		}
		slices.Sort(ps)
	}
	for _, k := range ps {
		if y := a.nets[k]; y != nil {
			for _, s := range y.all {
				ids = append(ids, s.id)
			}
		}
		if l := sn.live(k); l != nil && lk != nil {
			states = append(states, l)
		}
	}
	if ids == nil {
		ids = []string{}
	}
	if len(ids)+len(states) > WhyRecords {
		return nil, nil, nil, c, sn.at, ErrTooMany
	}
	return ids, anns, states, c, sn.at, nil
}

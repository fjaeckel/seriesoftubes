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

// Why gives the ids of the stats records a client needs to work out key's value in the slice
// at now (10.2 to 10.5, 10.12) and the running slot they are for: every held stats record of
// the key, and on the traffic board every held stats record of each network its records list
// (whose reports the min() rule reads, and whose POPs a region asks about). The key's newest
// announce, which the filters read, the node adds. Excluded networks' records are not needed:
// traffic with them counts 0.
func (a *Agg) Why(q *Slice, key string, now int64) ([]string, int64, error) {
	if !a.ready.Load() {
		return nil, 0, ErrNotReady
	}
	c := a.prepare(now)
	a.mu.RLock()
	defer a.mu.RUnlock()
	x := a.nets[key]
	if x == nil {
		return []string{}, c, nil
	}
	ids := make([]string, 0, len(x.all))
	for _, s := range x.all {
		ids = append(ids, s.id)
	}
	if q.Board == "traffic" {
		seen := map[string]bool{}
		for _, s := range x.all {
			for _, e := range s.tr {
				if e.key != key && !a.ex[e.key] {
					seen[e.key] = true
				}
			}
		}
		if len(seen) > WhyPartners {
			return nil, c, ErrTooMany
		}
		ps := make([]string, 0, len(seen))
		for k := range seen {
			ps = append(ps, k)
		}
		slices.Sort(ps)
		for _, k := range ps {
			if y := a.nets[k]; y != nil {
				for _, s := range y.all {
					ids = append(ids, s.id)
				}
			}
		}
	}
	if len(ids) > WhyRecords {
		return nil, c, ErrTooMany
	}
	return ids, c, nil
}

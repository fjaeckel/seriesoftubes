package registry

import (
	"slices"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Live reports whether a registry server answered the weekly challenge within the voters'
// window (10.7), counted against the snapshot's asOf like the shun tally.
func Live(e *Entry, asOf int64) bool {
	return e.Answered != nil && *e.Answered >= asOf-fed.VoterAnswered
}

// AutoLive reports whether a registry server is live for automatic sync (10.9 "Who connects"):
// its last answer to the weekly challenge, or, when it has none yet, its `listed` stamp, or, when
// it has neither (merged since the last weekly run: its listing pull request passed the live
// challenge), asOf itself, is at most 14 days before asOf. The same dates as the weekly job's
// removals (11.3), so a server is live for automatic sync while it is kept in the registry. Not
// for voters: they need both stamps (10.7).
func AutoLive(asOf int64, listed, answered *int64) bool {
	last := asOf
	if answered != nil {
		last = *answered
	} else if listed != nil {
		last = *listed
	}
	return last >= asOf-fed.VoterAnswered
}

// AutoEligible lists, sorted by id (byte order), the snapshot's servers that sync automatically
// with one another (10.9 "Who connects"): sync policy open, and live for automatic sync.
func AutoEligible(s *Snapshot) []string {
	if s == nil {
		return nil
	}
	var list []Candidate
	for _, e := range s.Entries {
		list = append(list, Candidate{ID: e.ID, Sync: e.Server.Str("sync"), Listed: e.Listed, Answered: e.Answered})
	}
	return Eligible(s.AsOf, list)
}

// Candidate is what eligibility reads of a registry server.
type Candidate struct {
	ID, Sync         string
	Listed, Answered *int64
}

// Eligible is AutoEligible over candidates.
func Eligible(asOf int64, list []Candidate) []string {
	var ids []string
	for _, c := range list {
		if c.Sync == "open" && AutoLive(asOf, c.Listed, c.Answered) {
			ids = append(ids, c.ID)
		}
	}
	slices.Sort(ids)
	return slices.Compact(ids)
}

// AutoBase is the base of the chord offsets for n servers under a cap (10.9): the largest b in
// [2, n] with 2*(b-1)*L <= cap, where L is the least L >= 1 with b^L >= n; 2 when there is none.
// It returns b and L. Integers only, so every implementation agrees.
func AutoBase(n, cap int) (int, int) {
	digits := func(b int) int {
		l, p := 1, b
		for p < n {
			p *= b
			l++
		}
		return l
	}
	for b := n; b >= 2; b-- {
		if l := digits(b); 2*(b-1)*l <= cap {
			return b, l
		}
	}
	return 2, digits(2)
}

// AutoPeers is the servers `self` syncs with automatically among the sorted eligible ids (10.9):
// every other one when there are at most cap of them, else its neighbours in the circulant graph
// whose offsets are c*b^j (1 <= c < b, 0 <= j < L, b and L from AutoBase), both ways round the
// ring. Every server computes the same graph; its diameter is at most L. The result is sorted.
// Nil when self is not among the ids.
func AutoPeers(ids []string, self string, cap int) []string {
	i, ok := slices.BinarySearch(ids, self)
	if !ok {
		return nil
	}
	n := len(ids)
	var out []string
	if n-1 <= cap {
		for _, id := range ids {
			if id != self {
				out = append(out, id)
			}
		}
		return out
	}
	b, l := AutoBase(n, cap)
	seen := map[int]bool{i: true}
	p := 1
	for j := 0; j < l; j++ {
		for c := 1; c < b; c++ {
			d := (c * p) % n
			for _, k := range []int{(i + d) % n, (i - d + n) % n} {
				if !seen[k] {
					seen[k] = true
					out = append(out, ids[k])
				}
			}
		}
		p *= b
	}
	slices.Sort(out)
	return out
}

// Dials reports whether self is the side that dials an automatic peer: the lower identity
// (byte order) dials, the higher one accepts (and dials only as a fallback, after
// fed.AutoFallback seconds without a session; the node package keeps that time).
func Dials(self, peer string) bool { return self < peer }

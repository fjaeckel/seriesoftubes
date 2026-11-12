// Package shun counts shun votes against the registry snapshot (spec 10.7).
package shun

import (
	"sort"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Server is a registry entry as the tally needs it.
type Server struct {
	ID        string
	Operators []string
	Listed    *int64
	Answered  *int64
}

// Registry is a servers.json snapshot.
type Registry struct {
	AsOf    int64
	Servers []Server
}

// Vote is a shun or unshun record.
type Vote struct {
	ID     string
	Kind   string // shun or unshun
	Key    string
	T      int64
	Server string
	Target string
	Reason string
}

// Result of a tally at now.
type Result struct {
	Voters  int            `json:"voters"`
	Need    int            `json:"need"`
	Votes   int            `json:"votes"`
	Shunned bool           `json:"shunned"`
	Reasons map[string]int `json:"reasons"`
}

// Voters returns the servers that may vote.
func (reg Registry) Voters() []Server {
	var out []Server
	for _, s := range reg.Servers {
		if s.Listed == nil || s.Answered == nil {
			continue
		}
		if *s.Listed <= reg.AsOf-fed.VoterListed && *s.Answered >= reg.AsOf-fed.VoterAnswered {
			out = append(out, s)
		}
	}
	return out
}

// Need is the threshold for V voters.
func Need(v int) int { return max(5, int(fed.Div(int64(v)+3, 4))) }

// Counter tallies against one registry snapshot; build it once with Prepare and reuse it.
type Counter struct {
	n    int                        // V, the number of voters
	need int                        // the threshold
	ops  map[string]map[string]bool // voter id -> its registry operators
	idx  map[string]int             // voter id -> its place
}

// Prepare indexes a snapshot's voters.
func Prepare(reg Registry) *Counter {
	voters := reg.Voters()
	c := &Counter{n: len(voters), need: Need(len(voters)), ops: map[string]map[string]bool{}, idx: map[string]int{}}
	for i, s := range voters {
		set := map[string]bool{}
		for _, k := range s.Operators {
			set[k] = true
		}
		c.ops[s.ID], c.idx[s.ID] = set, i
	}
	return c
}

// Counts reports whether a vote is one the tally counts: by a voter, signed by one of its operators.
func (c *Counter) Counts(v Vote) bool {
	return (v.Kind == "shun" || v.Kind == "unshun") && c.ops[v.Server][v.Key]
}

// Tally works out whether target is shunned at now, from the votes for that target (others are
// ignored). It costs the votes given, times the moments they make, never the number of voters.
func (c *Counter) Tally(votes []Vote, target string, now int64) Result {
	per := map[int][]Vote{}
	moments := []int64{now - fed.ShunLift}
	for _, v := range votes {
		if v.Target != target || !c.Counts(v) {
			continue
		}
		i := c.idx[v.Server]
		per[i] = append(per[i], v)
		for _, x := range []int64{v.T, v.T + fed.VoteLife} {
			if x > now-fed.ShunLift && x <= now {
				moments = append(moments, x)
			}
		}
	}
	at := func(x int64) (int, map[string]int) {
		n := 0
		reasons := map[string]int{}
		for _, list := range per {
			var d *Vote
			for j := range list {
				v := &list[j]
				if v.T > x {
					continue
				}
				if d == nil || v.T > d.T || v.T == d.T && v.ID < d.ID {
					d = v
				}
			}
			if d != nil && d.Kind == "shun" && x < d.T+fed.VoteLife {
				n++
				reasons[d.Reason]++
			}
		}
		return n, reasons
	}
	shunned := false
	if len(per) >= c.need {
		sort.Slice(moments, func(i, j int) bool { return moments[i] < moments[j] })
		for _, x := range moments {
			if n, _ := at(x); n >= c.need {
				shunned = true
				break
			}
		}
	}
	n, reasons := at(now)
	return Result{Voters: c.n, Need: c.need, Votes: n, Shunned: shunned, Reasons: reasons}
}

// Tally works out whether target is shunned at now.
func Tally(reg Registry, votes []Vote, target string, now int64) Result {
	return Prepare(reg).Tally(votes, target, now)
}

// FromRecord turns a checked shun or unshun record into a vote.
func FromRecord(r *fed.Record) Vote {
	return Vote{ID: r.ID, Kind: r.Kind, Key: r.Key, T: r.T, Server: r.Str("server"), Target: r.Str("target"), Reason: r.Str("reason")}
}

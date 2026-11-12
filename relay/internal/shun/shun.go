// Package shun counts shun votes against the registry snapshot (spec 10.7).
package shun

import (
	"slices"
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

// Tally works out whether target is shunned at now.
func Tally(reg Registry, votes []Vote, target string, now int64) Result {
	voters := reg.Voters()
	need := Need(len(voters))
	// Each voter's records for target, signed by one of its registry operators.
	per := make([][]Vote, len(voters))
	moments := []int64{now - fed.ShunLift}
	for i, s := range voters {
		for _, v := range votes {
			if v.Target != target || v.Server != s.ID || !slices.Contains(s.Operators, v.Key) {
				continue
			}
			if v.Kind != "shun" && v.Kind != "unshun" {
				continue
			}
			per[i] = append(per[i], v)
			for _, x := range []int64{v.T, v.T + fed.VoteLife} {
				if x > now-fed.ShunLift && x <= now {
					moments = append(moments, x)
				}
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
	sort.Slice(moments, func(i, j int) bool { return moments[i] < moments[j] })
	shunned := false
	for _, x := range moments {
		if n, _ := at(x); n >= need {
			shunned = true
			break
		}
	}
	n, reasons := at(now)
	return Result{Voters: len(voters), Need: need, Votes: n, Shunned: shunned, Reasons: reasons}
}

// FromRecord turns a checked shun or unshun record into a vote.
func FromRecord(r *fed.Record) Vote {
	return Vote{ID: r.ID, Kind: r.Kind, Key: r.Key, T: r.T, Server: r.Str("server"), Target: r.Str("target"), Reason: r.Str("reason")}
}

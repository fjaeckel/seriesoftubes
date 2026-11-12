// Package chain works out a server's operator and node lists from its genesis and
// operators records (spec section 8): applied proposals, pending ones, server records.
package chain

import (
	"slices"
	"sort"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Node is one node of a server.
type Node struct {
	Key string `json:"key"`
	URL string `json:"url"`
}

// Lists are the operators and nodes at one head, sorted by key.
type Lists struct {
	Operators []string
	Nodes     []Node
}

func (l Lists) clone() Lists {
	return Lists{Operators: slices.Clone(l.Operators), Nodes: slices.Clone(l.Nodes)}
}

// IsOperator reports whether k is an operator.
func (l Lists) IsOperator(k string) bool { return slices.Contains(l.Operators, k) }

// IsNode reports whether k is a node key.
func (l Lists) IsNode(k string) bool {
	for _, n := range l.Nodes {
		if n.Key == k {
			return true
		}
	}
	return false
}

// NodeKeys returns the node keys.
func (l Lists) NodeKeys() []string {
	out := make([]string, len(l.Nodes))
	for i, n := range l.Nodes {
		out[i] = n.Key
	}
	return out
}

// Majority is the strict majority rule: signers * 2 > operators.
func Majority(operators, signers int) bool { return signers*2 > operators }

// State is a server's chain worked out from a set of records.
type State struct {
	ID      string // the server identity (genesis id)
	Genesis *fed.Record
	Head    string
	Lists
	Applied []*fed.Record    // in order
	At      map[string]Lists // lists at every head (genesis and each applied proposal)
	cands   []*fed.Record    // every operators record for this server
}

// Start is the state of a genesis record alone.
func Start(g *fed.Record) *State {
	n, _ := g.Body["node"].(map[string]any)
	key, _ := n["key"].(string)
	url, _ := n["url"].(string)
	s := &State{ID: g.ID, Genesis: g, Head: g.ID,
		Lists: Lists{Operators: []string{g.Key}, Nodes: []Node{{key, url}}},
		At:    map[string]Lists{}}
	s.At[g.ID] = s.Lists.clone()
	return s
}

// Compute applies every operators record for this server (8.1). The order of ops does not matter.
func Compute(g *fed.Record, ops []*fed.Record) *State {
	s := Start(g)
	for _, r := range ops {
		if r.Kind == "operators" && r.Str("server") == g.ID {
			s.cands = append(s.cands, r)
		}
	}
	for {
		var best *fed.Record
		for _, r := range s.cands {
			if r.Str("prev") != s.Head || !s.IsOperator(r.Key) || !s.Applicable(r) || !s.HasMajority(r) {
				continue
			}
			if best == nil || r.ID < best.ID {
				best = r
			}
		}
		if best == nil {
			return s
		}
		s.apply(best)
	}
}

// Applicable is rule 2 of 8.1 against the current lists.
func (s *State) Applicable(r *fed.Record) bool {
	return applicable(s.Lists, r)
}

func applicable(l Lists, r *fed.Record) bool {
	target := r.Str("target")
	switch r.Str("action") {
	case "add_operator":
		return !l.IsOperator(target) && len(l.Operators) < 16
	case "remove_operator":
		return l.IsOperator(target) && len(l.Operators) >= 2
	case "set_node":
		return l.IsNode(target) || len(l.Nodes) < 16
	case "remove_node":
		return l.IsNode(target) && len(l.Nodes) >= 2
	}
	return false
}

// HasMajority counts the sigs that are current operators.
func (s *State) HasMajority(r *fed.Record) bool { return majorityAt(s.Lists, r) }

func majorityAt(l Lists, r *fed.Record) bool {
	n := 0
	for _, k := range r.Signers() {
		if l.IsOperator(k) {
			n++
		}
	}
	return Majority(len(l.Operators), n)
}

func (s *State) apply(r *fed.Record) {
	l := s.Lists.clone()
	target := r.Str("target")
	switch r.Str("action") {
	case "add_operator":
		l.Operators = append(l.Operators, target)
		sort.Strings(l.Operators)
	case "remove_operator":
		l.Operators = slices.DeleteFunc(l.Operators, func(k string) bool { return k == target })
	case "set_node":
		found := false
		for i := range l.Nodes {
			if l.Nodes[i].Key == target {
				l.Nodes[i].URL = r.Str("url")
				found = true
			}
		}
		if !found {
			l.Nodes = append(l.Nodes, Node{target, r.Str("url")})
			sort.Slice(l.Nodes, func(i, j int) bool { return l.Nodes[i].Key < l.Nodes[j].Key })
		}
	case "remove_node":
		l.Nodes = slices.DeleteFunc(l.Nodes, func(n Node) bool { return n.Key == target })
	}
	s.Lists = l
	s.Head = r.ID
	s.Applied = append(s.Applied, r)
	s.At[r.ID] = l.clone()
}

// Pending lists proposals waiting for signatures at now (8.1), sorted by id.
func (s *State) Pending(now int64) []*fed.Record {
	var out []*fed.Record
	for _, r := range s.cands {
		if r.Str("prev") == s.Head && s.IsOperator(r.Key) && s.Applicable(r) && !s.HasMajority(r) &&
			now < r.T+fed.PendingLife {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Proposal checks a new proposal for this server's current head: "" when it may be stored.
func (s *State) Proposal(r *fed.Record, now int64) string {
	if r.Str("server") != s.ID {
		return fed.UnknownSrv
	}
	if !s.IsOperator(r.Key) {
		return fed.NotOperator
	}
	if r.Str("prev") != s.Head || !s.Applicable(r) {
		return fed.BadChain
	}
	if !s.HasMajority(r) && now >= r.T+fed.PendingLife {
		return fed.TooOld
	}
	return ""
}

// ServerShape checks a server record against the chain except for the majority:
// its head is known and its lists match the lists at that head (8.2).
func (s *State) ServerShape(r *fed.Record) string {
	if r.Str("server") != s.ID {
		return fed.UnknownSrv
	}
	l, ok := s.At[r.Str("head")]
	if !ok {
		return fed.BadChain
	}
	ops := r.StrList("operators")
	if !slices.Equal(ops, l.Operators) {
		return fed.BadChain
	}
	nodes, _ := r.Body["nodes"].([]any)
	if len(nodes) != len(l.Nodes) {
		return fed.BadChain
	}
	for i, n := range nodes {
		m, _ := n.(map[string]any)
		if m["key"] != l.Nodes[i].Key || m["url"] != l.Nodes[i].URL {
			return fed.BadChain
		}
	}
	return ""
}

// CheckServer is 8.2: "" when the server record is valid.
func (s *State) CheckServer(r *fed.Record) string {
	if code := s.ServerShape(r); code != "" {
		return code
	}
	if !majorityAt(s.At[r.Str("head")], r) {
		return fed.NoMajority
	}
	return ""
}

// Current picks the current server record among candidates: valid, greatest t, then lowest id.
func (s *State) Current(recs []*fed.Record) *fed.Record {
	var best *fed.Record
	for _, r := range recs {
		if r.Kind != "server" || s.CheckServer(r) != "" {
			continue
		}
		if best == nil || r.T > best.T || r.T == best.T && r.ID < best.ID {
			best = r
		}
	}
	return best
}

// CheckSequence checks an ordered chain as the registry holds it (11.2 step 4).
func CheckSequence(g *fed.Record, list []*fed.Record) (*State, string) {
	s := Start(g)
	for _, r := range list {
		if r.Kind != "operators" || r.Str("server") != g.ID || r.Str("prev") != s.Head {
			return nil, fed.BadChain
		}
		if !s.IsOperator(r.Key) || !s.Applicable(r) {
			return nil, fed.BadChain
		}
		if !s.HasMajority(r) {
			return nil, fed.NoMajority
		}
		s.cands = append(s.cands, r)
		s.apply(r)
	}
	return s, ""
}

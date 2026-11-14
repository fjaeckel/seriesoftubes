// Package catalog implements catalog gossip (spec 10.8): receiving entries and merging
// what a viewer knows from the registry and from gossip.
package catalog

import (
	"slices"
	"sort"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Decision of receiving an entry.
type Decision struct {
	Action  string   `json:"action"` // store, drop, refuse
	Forward []string `json:"forward,omitempty"`
	Why     string   `json:"why,omitempty"`
	Error   string   `json:"error,omitempty"`
}

// Receive decides on an entry for server id with path and seen, after its records checked.
// Forward is nil when passing it on would make the path longer than 16.
func Receive(now int64, self, id string, path []string, seen int64) Decision {
	if len(path) == 0 || path[0] != id {
		return Decision{Action: "refuse", Error: fed.BadField}
	}
	if len(path) > fed.MaxPath {
		return Decision{Action: "refuse", Error: fed.TooMany}
	}
	set := map[string]bool{}
	for _, p := range path {
		if set[p] {
			return Decision{Action: "refuse", Error: fed.Duplicate}
		}
		set[p] = true
	}
	if seen > now+fed.Skew {
		return Decision{Action: "refuse", Error: fed.TooNew}
	}
	if set[self] {
		return Decision{Action: "drop", Why: "loop"}
	}
	if now >= seen+fed.GossipExpiry {
		return Decision{Action: "drop", Why: "expired"}
	}
	d := Decision{Action: "store"}
	if len(path) < fed.MaxPath {
		d.Forward = append(slices.Clone(path), self)
	}
	return d
}

// Summary is a server record as merging needs it.
type Summary struct {
	RID       string   `json:"rid"`
	T         int64    `json:"t"`
	Name      string   `json:"name"`
	Nodes     []string `json:"nodes"`
	Operators []string `json:"operators"`
	// Chain is the ids of the entry's applied operators records, in order (none: genesis only).
	Chain []string `json:"chain,omitempty"`
}

// Known is a server in the registry.
type Known struct {
	ID     string
	Server Summary
}

// Heard is one gossip entry.
type Heard struct {
	ID     string
	Server Summary
	Path   []string
	Seen   int64
}

// Merged is what a viewer knows about one server.
type Merged struct {
	ID        string   `json:"id"`
	Source    string   `json:"source"` // registry or gossip
	RID       string   `json:"rid"`
	Name      string   `json:"name"`
	Nodes     []string `json:"nodes"`
	Operators []string `json:"operators"`
	Seen      *int64   `json:"seen"`
	Path      []string `json:"path"`
	// Index of the gossip entry that gave the records (gossip only), -1 otherwise.
	From int `json:"-"`
}

// Merge combines registry and gossip, sorted by id.
//
// A server's chain only grows (8.1). For a server in the registry, its chain is the registry's.
// For one known by gossip alone, the entries are taken in the order given (the order they
// arrived): the chain of the first, then of each later one that extends it. Entries whose chain
// forks from it (signed by keys that were operators once) never count; among those at its final
// head, the newest server record gives the records. seen and path come from the entries whose
// chain agrees with it (is a prefix of it, or extends a registry chain).
func Merge(now int64, registry []Known, gossip []Heard) []Merged {
	live := map[string][]int{}
	for i, h := range gossip {
		if now >= h.Seen+fed.GossipExpiry {
			continue
		}
		live[h.ID] = append(live[h.ID], i)
	}
	out := map[string]*Merged{}
	held := map[string][]string{}
	for _, k := range registry {
		out[k.ID] = &Merged{ID: k.ID, Source: "registry", RID: k.Server.RID, Name: k.Server.Name,
			Nodes: k.Server.Nodes, Operators: k.Server.Operators, From: -1}
		held[k.ID] = k.Server.Chain
	}
	for id, idx := range live {
		m := out[id]
		cur := held[id]
		if m == nil {
			cur = gossip[idx[0]].Server.Chain
			for _, i := range idx[1:] {
				if c := gossip[i].Server.Chain; hasPrefix(c, cur) {
					cur = c
				}
			}
			best := -1
			for _, i := range idx {
				if !slices.Equal(gossip[i].Server.Chain, cur) {
					continue
				}
				if best < 0 {
					best = i
					continue
				}
				a, b := gossip[i].Server, gossip[best].Server
				if a.T > b.T || a.T == b.T && a.RID < b.RID {
					best = i
				}
			}
			s := gossip[best].Server
			m = &Merged{ID: id, Source: "gossip", RID: s.RID, Name: s.Name, Nodes: s.Nodes, Operators: s.Operators, From: best}
			out[id] = m
		}
		bi := -1
		for _, i := range idx {
			c := gossip[i].Server.Chain
			if !hasPrefix(c, cur) && !hasPrefix(cur, c) {
				continue // a fork
			}
			if a := gossip[i]; bi < 0 || a.Seen > gossip[bi].Seen || a.Seen == gossip[bi].Seen && pathLess(a.Path, gossip[bi].Path) {
				bi = i
			}
		}
		if bi < 0 {
			continue
		}
		seen := gossip[bi].Seen
		m.Seen = &seen
		m.Path = gossip[bi].Path
	}
	list := make([]Merged, 0, len(out))
	for _, m := range out {
		list = append(list, *m)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	return list
}

// hasPrefix reports whether chain c starts with p (c extends p, or is p).
func hasPrefix(c, p []string) bool { return len(c) >= len(p) && slices.Equal(c[:len(p)], p) }

// pathLess: the shorter path, then the lower one element by element.
func pathLess(a, b []string) bool {
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] < b[i]
		}
	}
	return false
}

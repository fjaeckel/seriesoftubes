package boards

import (
	"slices"
	"sort"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// State is one live state as the boards of now see it (5.11).
type State struct {
	ID   string
	Key  string
	T    int64
	Body map[string]any
}

func (s *State) mode() string { m, _ := s.Body["mode"].(string); return m }

// NowQuery describes one board of the measure now (10.13).
type NowQuery struct {
	Now      int64 // the time of the snapshot
	Board    string
	Division string
	Exclude  map[string]bool
	Founded  map[string]int64 // cone board: key -> founded of its newest announce
	Cities   []string
}

// Latest is each key's live state at now (10.13): the newest (greatest t, then lowest id) when
// its t is less than StateLife seconds before now; keys without one are left out.
func Latest(now int64, states []*State) map[string]*State {
	out := map[string]*State{}
	for _, s := range states {
		if now-s.T >= fed.StateLife {
			continue
		}
		if o := out[s.Key]; o == nil || s.T > o.T || s.T == o.T && s.ID < o.ID {
			out[s.Key] = s
		}
	}
	return out
}

// ComputeNow ranks a board of now (10.13): the plain reference.
func ComputeNow(q NowQuery, states []*State) []Row {
	L := Latest(q.Now, states)
	var region map[string]bool
	if q.Cities != nil {
		region = map[string]bool{}
		for _, c := range q.Cities {
			region[c] = true
		}
	}
	// has is a key's live state when it counts: in normal mode and not excluded.
	has := func(k string) *State {
		s := L[k]
		if s == nil || s.mode() != "normal" || q.Exclude[k] {
			return nil
		}
		return s
	}
	inRegion := func(s *State) bool { return region == nil || popsIn(&Stats{Body: s.Body}, region) > 0 }
	rows := []Row{}
	for k := range L {
		s := has(k)
		if s == nil || !inRegion(s) {
			continue
		}
		if _, ok := s.Body["pies"]; q.Board == "pies" && !ok {
			continue
		}
		_, ai := s.Body["ai"]
		if q.Division == "ai" && !ai || q.Division == "human" && ai {
			continue
		}
		var v int64
		switch q.Board {
		case "pops":
			m, _ := s.Body["pops"].(map[string]any)
			for c, n := range m {
				if region == nil || region[c] {
					v += toInt(n)
				}
			}
		case "pies":
			v = toInt(s.Body["pies"])
		case "total":
			v = toInt(s.Body["total"])
		case "traffic":
			var in, out int64
			list, _ := s.Body["traffic"].([]any)
			for _, e := range list {
				m, _ := e.(map[string]any)
				y, _ := m["key"].(string)
				ys := has(y)
				if ys == nil || !inRegion(ys) {
					continue // a partner without a live state counts 0
				}
				yin, yout := report(&Stats{Body: ys.Body}, k)
				in += min(toInt(m["in"]), yout)
				out += min(toInt(m["out"]), yin)
			}
			v = max(in, out)
		case "cone":
			v = coneNow(q, has, k)
		}
		rows = append(rows, Row{k, v})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Value != rows[j].Value {
			return rows[i].Value > rows[j].Value
		}
		return rows[i].Key < rows[j].Key
	})
	return rows
}

// coneNow is k's customer cone now: the cone of 10.4 over the live states, with established
// counted at now.
func coneNow(q NowQuery, has func(string) *State, k string) int64 {
	seen := map[string]bool{k: true}
	todo := []string{k}
	for len(todo) > 0 {
		z := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		r := &Stats{Body: has(z).Body}
		for _, y := range Keys(r.Body["cust"]) {
			ys := has(y)
			if seen[y] || ys == nil {
				continue
			}
			f, ok := q.Founded[y]
			if !ok || fed.Div(q.Now, fed.Day)-f < fed.NewcomerDays {
				continue
			}
			ye := &Stats{Body: ys.Body}
			if !slices.Contains(Keys(ye.Body["up"]), z) || !BothWays(r, y) || !BothWays(ye, z) {
				continue
			}
			seen[y] = true
			todo = append(todo, y)
		}
	}
	return int64(len(seen) - 1)
}

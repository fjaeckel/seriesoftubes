package node

import (
	"context"
	"errors"
	"slices"
	"time"
	"unicode/utf8"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/rank"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// Limits of the leaderboard requests (9.3, 9.5).
const (
	rankRows    = 50  // rows of a ranks answer unless n says otherwise
	rankRowsMax = 100 // the most n may ask
	rankKeysMax = 256 // keys in the keys filter
	netsKeysMax = 64  // keys of a nets request
	rankWait    = 10 * time.Second
)

// parseSlice reads a rank request (9.3) into a slice and the rows asked for; a value that is
// not allowed gives bad_field.
func parseSlice(f *wire.Frame) (*rank.Slice, int, string) {
	q := &rank.Slice{}
	q.Board, _ = f.Str("board")
	q.Measure, _ = f.Str("measure")
	q.Division, _ = f.Str("division")
	if !slices.Contains([]string{"traffic", "total", "pops", "pies"}, q.Board) || !slices.Contains([]string{"total", "growth"}, q.Measure) ||
		!slices.Contains([]string{"all", "human", "ai"}, q.Division) {
		return nil, 0, fed.BadField
	}
	n := rankRows
	if v, ok := f.Raw["n"]; ok {
		x, ok := wire.Int(v)
		if !ok || x < 1 || x > rankRowsMax {
			return nil, 0, fed.BadField
		}
		n = int(x)
	}
	fl, ok := f.Raw["filters"]
	if !ok {
		return q, n, ""
	}
	m, ok := fl.(map[string]any)
	if !ok {
		return nil, 0, fed.BadField
	}
	strs := func(k string, max int, ok func(string) bool) ([]string, bool) {
		v, has := m[k]
		if !has {
			return nil, true
		}
		a, isList := v.([]any)
		if !isList || len(a) > max {
			return nil, false
		}
		out := make([]string, 0, len(a))
		for _, e := range a {
			s, isStr := e.(string)
			if !isStr || !ok(s) || slices.Contains(out, s) {
				return nil, false
			}
			out = append(out, s)
		}
		slices.Sort(out)
		return out, true
	}
	str := func(k string, ok func(string) bool) (*string, bool) {
		v, has := m[k]
		if !has {
			return nil, true
		}
		s, isStr := v.(string)
		if !isStr || !ok(s) {
			return nil, false
		}
		return &s, true
	}
	count := func(k string) (*int64, bool) {
		v, has := m[k]
		if !has {
			return nil, true
		}
		x, isInt := wire.Int(v)
		if !isInt || x < 0 || x > 10000000 {
			return nil, false
		}
		return &x, true
	}
	label := func(s string) bool { n := utf8.RuneCountInString(s); return n >= 1 && n <= 64 }
	cc := func(s string) bool { return len(s) == 2 && s[0] >= 'A' && s[0] <= 'Z' && s[1] >= 'A' && s[1] <= 'Z' }
	policy := func(s string) bool { return s == "open" || s == "selective" || s == "restrictive" }
	var good [12]bool
	q.Cities, good[0] = strs("cities", 512, fed.IsCity)
	q.Keys, good[1] = strs("keys", rankKeysMax, fed.IsKey)
	q.Model, good[2] = str("model", label)
	q.Harness, good[3] = str("harness", label)
	q.From, good[4] = str("from", cc)
	q.Home, good[5] = str("home", cc)
	q.Policy, good[6] = str("policy", policy)
	q.AgeMin, good[7] = count("ageMin")
	q.AgeMax, good[8] = count("ageMax")
	q.DayMin, good[9] = count("dayMin")
	q.DayMax, good[10] = count("dayMax")
	good[11] = true
	if v, has := m["tier1"]; has {
		b, isBool := v.(bool)
		q.Tier1, good[11] = &b, isBool
	}
	for _, g := range good {
		if !g {
			return nil, 0, fed.BadField
		}
	}
	return q, n, ""
}

// ownRow is the key the session's own row is for: the first key it proved that is not an
// operator of this server, else the first one ("" when none).
func (r *Relay) ownRow(s *session) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, k := range s.proved {
		if r.own == nil || !r.own.IsOperator(k) {
			return k
		}
	}
	if len(s.proved) > 0 {
		return s.proved[0]
	}
	return ""
}

// rankFail answers a ranking that could not be had now: rate_limited with a retry.
func (s *session) rankFail(id int64, err error) {
	retry := int64(1)
	if errors.Is(err, rank.ErrNotReady) {
		retry = 5
	}
	s.fail(id, fed.RateLimited, retry)
}

// rankFrame answers rank, facets and nets (9.3, 9.5). The answer is worked out on the ranking
// workers; this session's reader waits for it (at most rankWait), no goroutine is started here.
func (r *Relay) rankFrame(s *session, f *wire.Frame) {
	ctx, cancel := context.WithTimeout(s.ctx, rankWait)
	defer cancel()
	now := r.now()
	switch f.M {
	case "rank":
		q, n, code := parseSlice(f)
		if code != "" {
			s.fail(f.ID, code, 0)
			return
		}
		ans, err := r.rank.Rank(ctx, q, now, r.ownRow(s), n)
		if err != nil {
			s.rankFail(f.ID, err)
			return
		}
		rows := make([]any, len(ans.Rows))
		for i, x := range ans.Rows {
			row := map[string]any{"rank": int64(x.Rank), "key": x.Key, "value": x.Value, "asn": x.ASN, "ai": x.AI}
			if x.Name != "" {
				row["name"] = x.Name
			}
			if x.Home != "" {
				row["home"] = x.Home
			}
			if x.CC != "" {
				row["cc"] = x.CC
			}
			rows[i] = row
		}
		var me any = canon.Raw("null")
		if ans.Me != nil {
			var rk any = canon.Raw("null")
			if ans.Me.Rank != nil {
				rk = int64(*ans.Me.Rank)
			}
			me = map[string]any{"rank": rk, "value": ans.Me.Value}
		}
		s.enqueue(map[string]any{"m": "ranks", "id": f.ID, "slot": ans.Slot, "n": int64(ans.N), "rows": rows, "me": me})
	case "facets":
		fc, err := r.rank.Facets(ctx, now)
		if err != nil {
			s.rankFail(f.ID, err)
			return
		}
		list := func(l []string) []any {
			out := make([]any, len(l))
			for i, v := range l {
				out[i] = v
			}
			return out
		}
		s.enqueue(map[string]any{"m": "facets", "id": f.ID, "slot": fc.Slot, "models": list(fc.Models),
			"harnesses": list(fc.Harnesses), "from": list(fc.From), "homes": list(fc.Homes)})
	case "nets":
		keys, _ := f.Strs("keys")
		if len(keys) > netsKeysMax {
			s.fail(f.ID, fed.TooMany, 0)
			return
		}
		if !r.rank.Ready() {
			s.rankFail(f.ID, rank.ErrNotReady)
			return
		}
		nets, reps := r.rank.Nets(keys, r.ownRow(s))
		ns, rs := make([]any, len(nets)), make([]any, len(reps))
		for i, x := range nets {
			ns[i] = map[string]any{"key": x.Key, "ai": x.AI, "tier1": x.Tier1}
		}
		for i, x := range reps {
			rs[i] = map[string]any{"key": x.Key, "in": x.In, "out": x.Out}
		}
		s.enqueue(map[string]any{"m": "nets", "id": f.ID, "nets": ns, "reports": rs})
	}
}

package rank

import (
	"slices"
	"unicode/utf8"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// Boards are the leaderboards a rank request may ask for (9.5).
var Boards = []string{"traffic", "total", "pops", "pies", "cone"}

// Measures a rank request may ask for (9.5): over the window, its growth, and now (10.13).
var Measures = []string{"total", "growth", "now"}

// Limits of a rank request (9.3, 9.5).
const (
	Rows    = 50  // rows of a ranks answer unless n says otherwise
	RowsMax = 100 // the most n may ask
	KeysMax = 256 // keys in the keys filter
)

// ParseRequest reads a rank request (9.3) into a slice and the rows asked for; a value that is
// not allowed gives bad_field.
func ParseRequest(f *wire.Frame) (*Slice, int, string) {
	q := &Slice{}
	q.Board, _ = f.Str("board")
	q.Measure, _ = f.Str("measure")
	q.Division, _ = f.Str("division")
	if !slices.Contains(Boards, q.Board) || !slices.Contains(Measures, q.Measure) ||
		!slices.Contains([]string{"all", "human", "ai"}, q.Division) {
		return nil, 0, fed.BadField
	}
	n := Rows
	if v, ok := f.Raw["n"]; ok {
		x, ok := wire.Int(v)
		if !ok || x < 1 || x > RowsMax {
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
	q.Keys, good[1] = strs("keys", KeysMax, fed.IsKey)
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

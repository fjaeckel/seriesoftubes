package fed

import (
	"regexp"
	"slices"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
)

// AuthorityMax bounds the authority file (11.5, 13.2).
const AuthorityMax = 524288

// RelayMinGrace is how long after a relayMin release older relays still count (13.1).
const RelayMinGrace = 604800

// BanReasons are the reasons the authority gives (11.5).
var BanReasons = []string{"cheating", "offensive_name", "spam", "abuse", "legal"}

var relayMinRe = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

// sortedByStr: a list of objects whose string field f is strictly ascending in byte order; an equal neighbour is
// duplicate, a smaller one bad_field, checked in list order (as the game does).
func sortedByStr(of check, hi int, f string) check {
	inner := list(of, 0, hi, false)
	return func(v any) string {
		if code := inner(v); code != "" {
			return code
		}
		a := v.([]any)
		for i := 1; i < len(a); i++ {
			x, y := a[i-1].(map[string]any)[f].(string), a[i].(map[string]any)[f].(string)
			if x == y {
				return Duplicate
			}
			if y < x {
				return BadField
			}
		}
		return ""
	}
}

var banWhy = oneOf(BanReasons...)

func authorityBody(r *Record) string {
	_, min := r.Body["relayMin"]
	_, from := r.Body["relayMinFrom"]
	code := object(r.Body, []field{
		opt("relayMin", func(v any) string {
			if s, ok := v.(string); ok && len(s) <= 40 && relayMinRe.MatchString(s) {
				return ""
			}
			return BadField
		}),
		opt("relayMinFrom", intIn(Earliest, 9007199254740991)),
		req("nets", sortedByStr(obj(req("key", keyCheck), req("reason", banWhy)), 4096, "key")),
		req("servers", sortedByStr(obj(req("id", idCheck), req("reason", banWhy)), 1024, "id")),
	})
	switch {
	case code != "":
		return code
	case min && !from:
		return MissingField
	case from && !min:
		return BadField
	}
	return ""
}

// CheckAuthority checks the authority file (11.5) against the pinned keys: the steps of 7.1 for kind authority,
// with not_authority before the signature.
func CheckAuthority(text []byte, keys []string, now int64) (*Record, string) {
	if len(text) > AuthorityMax {
		return nil, TooBig
	}
	v, code := canon.ParseStrict(text)
	if code != "" {
		return nil, code
	}
	r, code := envelope(v, Opts{Allow: func(k string) bool { return k == "authority" }})
	if code != "" {
		return nil, code
	}
	if len(r.Canon()) > AuthorityMax {
		return nil, TooBig
	}
	if code := checkBody(r); code != "" {
		return nil, code
	}
	if !slices.Contains(keys, r.Key) {
		return nil, NotAuthority
	}
	if code := checkSigs(r); code != "" {
		return nil, code
	}
	if code := checkTime(r, now); code != "" {
		return nil, code
	}
	return r, ""
}

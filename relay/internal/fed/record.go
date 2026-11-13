package fed

import (
	"slices"
	"sort"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
)

// Kind properties (13.2): signers, max bytes, max age (0: none).
type kindInfo struct {
	multi  bool
	max    int
	maxAge int64
}

var kinds = map[string]kindInfo{
	"announce":  {false, 16384, 0},
	"stats":     {false, 40960, 777600},
	"offer":     {false, 4096, 2592000},
	"accept":    {false, 1024, 2592000},
	"decline":   {false, 1024, 2592000},
	"genesis":   {false, 2048, 0},
	"operators": {true, 8192, 0},
	"server":    {true, 16384, 0},
	"hide":      {false, 32768, 0},
	"shun":      {false, 1024, 7776000},
	"unshun":    {false, 1024, 7776000},
	"leave":     {false, 512, 0},
	"report":    {false, 1024, 2592000},
	"state":     {false, 40960, StateLife},
	"receipt":   {false, 1024, 0},
	"proof":     {false, 1024, 0},
}

// RecordKinds are the kinds a put may carry (section 5).
var RecordKinds = []string{"announce", "stats", "offer", "accept", "decline", "genesis", "operators", "server", "hide", "shun", "unshun", "leave", "report"}

// IsRecordKind reports whether k is a section 5 kind (stored records: never a live state).
func IsRecordKind(k string) bool {
	switch k {
	case "receipt", "proof", "state":
		return false
	}
	_, ok := kinds[k]
	return ok
}

// IsMulti reports whether a kind carries sigs.
func IsMulti(k string) bool { return kinds[k].multi }

// SigEntry is one entry of sigs.
type SigEntry struct{ Key, Sig string }

// Record is a checked signed object.
type Record struct {
	Kind string
	Key  string
	T    int64
	Body map[string]any
	Sig  string
	Sigs []SigEntry
	ID   string
	// Value is the strict tree of the whole object (with sig or sigs).
	Value map[string]any
}

// Canon is the canonical text of the whole object.
func (r *Record) Canon() []byte { return canon.Encode(r.Value) }

// Signed is the text the signature(s) cover.
func (r *Record) Signed() []byte {
	m := make(map[string]any, 5)
	for k, v := range r.Value {
		if k != "sig" && k != "sigs" {
			m[k] = v
		}
	}
	return canon.Encode(m)
}

// Signers returns the keys in sigs, or the author for single-signer kinds.
func (r *Record) Signers() []string {
	if r.Sigs == nil {
		return []string{r.Key}
	}
	out := make([]string, len(r.Sigs))
	for i, s := range r.Sigs {
		out[i] = s.Key
	}
	return out
}

// Str, Int and List read body fields of a checked record.
func (r *Record) Str(name string) string { s, _ := r.Body[name].(string); return s }
func (r *Record) Int(name string) int64  { n, _ := r.Body[name].(int64); return n }
func (r *Record) Bool(name string) bool  { b, _ := r.Body[name].(bool); return b }
func (r *Record) Has(name string) bool   { _, ok := r.Body[name]; return ok }

// StrList reads a list of strings from a body field.
func (r *Record) StrList(name string) []string { return strs(r.Body[name]) }

func strs(v any) []string {
	a, _ := v.([]any)
	out := make([]string, 0, len(a))
	for _, e := range a {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// Opts adjust checking.
type Opts struct {
	// Kinds allowed; nil means the record kinds of section 5.
	Allow func(kind string) bool
	// Trusted skips signatures and time: records read back from this node's own disk.
	Trusted bool
}

// IsState allows only live states (5.11) where a record is checked.
func IsState(k string) bool { return k == "state" }

// CheckState checks a live state from a frame (5.11): the steps of 7.1 for kind state alone.
func CheckState(v any, now int64) (*Record, string) {
	return CheckLoose(v, now, Opts{Allow: IsState})
}

// ParseRecord checks record text, steps 2 to 8 of 7.1.
func ParseRecord(text []byte, now int64, o Opts) (*Record, string) {
	v, code := canon.ParseStrict(text)
	if code != "" {
		return nil, code
	}
	return CheckValue(v, now, o)
}

// CheckLoose checks a value from a loose tree (inside a frame): value rules, then steps 4 to 8.
func CheckLoose(v any, now int64, o Opts) (*Record, string) {
	if canonHasLone(v) {
		return nil, BadString
	}
	s, code := canon.Check(v)
	if code != "" {
		return nil, code
	}
	return CheckValue(s, now, o)
}

func canonHasLone(v any) bool {
	switch x := v.(type) {
	case canon.Lone:
		return true
	case map[string]any:
		for _, e := range x {
			if canonHasLone(e) {
				return true
			}
		}
	case []any:
		for _, e := range x {
			if canonHasLone(e) {
				return true
			}
		}
	}
	return false
}

// CheckValue checks a strict value, steps 4 to 8 of 7.1.
func CheckValue(v any, now int64, o Opts) (*Record, string) {
	r, code := envelope(v, o)
	if code != "" {
		return nil, code
	}
	info := kinds[r.Kind]
	if len(r.Canon()) > info.max {
		return nil, TooBig
	}
	if code := checkBody(r); code != "" {
		return nil, code
	}
	if !o.Trusted {
		if code := checkSigs(r); code != "" {
			return nil, code
		}
		if code := checkTime(r, now); code != "" {
			return nil, code
		}
	}
	return r, ""
}

func envelope(v any, o Opts) (*Record, string) {
	m, ok := v.(map[string]any)
	if !ok {
		return nil, BadField
	}
	ver, ok := m["v"]
	if !ok {
		return nil, MissingField
	}
	if n, isInt := ver.(int64); !isInt || n != Version {
		return nil, BadVersion
	}
	kv, ok := m["kind"]
	if !ok {
		return nil, MissingField
	}
	kind, _ := kv.(string)
	info, known := kinds[kind]
	allow := o.Allow
	if allow == nil {
		allow = IsRecordKind
	}
	if !known || !allow(kind) {
		return nil, BadKind
	}
	sigField := "sig"
	if info.multi {
		sigField = "sigs"
	}
	for _, f := range []string{"key", "t", "body", sigField} {
		if _, ok := m[f]; !ok {
			return nil, MissingField
		}
	}
	for f := range m {
		switch f {
		case "v", "kind", "key", "t", "body", sigField:
		default:
			return nil, UnknownField
		}
	}
	key, _ := m["key"].(string)
	if !IsKey(key) {
		return nil, BadKey
	}
	t, ok := m["t"].(int64)
	if !ok {
		return nil, BadField
	}
	body, ok := m["body"].(map[string]any)
	if !ok {
		return nil, BadField
	}
	r := &Record{Kind: kind, Key: key, T: t, Body: body, Value: m}
	if !info.multi {
		sig, _ := m["sig"].(string)
		if !IsSig(sig) {
			return nil, BadSig
		}
		r.Sig = sig
		r.ID = Hash(r.Canon())
		return r, ""
	}
	list, ok := m["sigs"].([]any)
	if !ok || len(list) == 0 {
		return nil, BadField
	}
	if len(list) > MaxSigners {
		return nil, TooMany
	}
	for i, e := range list {
		em, ok := e.(map[string]any)
		if !ok || len(em) != 2 {
			return nil, BadField
		}
		k, kok := em["key"]
		s, sok := em["sig"]
		if !kok || !sok {
			return nil, BadField
		}
		ks, _ := k.(string)
		if !IsKey(ks) {
			return nil, BadKey
		}
		ss, _ := s.(string)
		if !IsSig(ss) {
			return nil, BadSig
		}
		if i > 0 {
			prev := r.Sigs[i-1].Key
			if ks == prev {
				return nil, Duplicate
			}
			if ks < prev {
				return nil, BadField
			}
		}
		r.Sigs = append(r.Sigs, SigEntry{ks, ss})
	}
	r.ID = Hash(r.Signed())
	return r, ""
}

func checkSigs(r *Record) string {
	msg := r.Signed()
	if r.Sigs == nil {
		if !Verify(r.Key, r.Sig, msg) {
			return BadSig
		}
		return ""
	}
	author := false
	for _, s := range r.Sigs {
		if !Verify(s.Key, s.Sig, msg) {
			return BadSig
		}
		if s.Key == r.Key {
			author = true
		}
	}
	if !author {
		return BadField
	}
	return ""
}

func checkTime(r *Record, now int64) string {
	if r.T < Earliest {
		return TooOld
	}
	if r.T > now+Skew {
		return TooNew
	}
	if age := kinds[r.Kind].maxAge; age > 0 && now-r.T > age {
		return TooOld
	}
	return ""
}

// WithSigs returns a copy of a multi-signer record with the given sigs (sorted by key).
func (r *Record) WithSigs(sigs []SigEntry) *Record {
	sort.Slice(sigs, func(i, j int) bool { return sigs[i].Key < sigs[j].Key })
	m := make(map[string]any, len(r.Value))
	for k, v := range r.Value {
		m[k] = v
	}
	list := make([]any, len(sigs))
	for i, s := range sigs {
		list[i] = map[string]any{"key": s.Key, "sig": s.Sig}
	}
	m["sigs"] = list
	c := *r
	c.Value = m
	c.Sigs = sigs
	return &c
}

// MergeSigs returns the union of two sig lists (sorted) and whether b added any.
func MergeSigs(a, b []SigEntry) ([]SigEntry, bool) {
	have := map[string]bool{}
	out := append([]SigEntry(nil), a...)
	for _, s := range a {
		have[s.Key] = true
	}
	added := false
	for _, s := range b {
		if !have[s.Key] {
			have[s.Key] = true
			out = append(out, s)
			added = true
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, added
}

// KeepSigs is what a merged multi-signer record keeps (10.11): the author's signature, then the
// signatures of keys keep accepts (nil: any), in key order, at most MaxSigners in all. The result is
// sorted by key.
func KeepSigs(author string, sigs []SigEntry, keep func(string) bool) []SigEntry {
	var out []SigEntry
	for _, s := range sigs {
		if s.Key == author {
			out = append(out, s)
			break
		}
	}
	sorted := slices.Clone(sigs)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Key < sorted[j].Key })
	for _, s := range sorted {
		if len(out) >= MaxSigners {
			break
		}
		if s.Key != author && (keep == nil || keep(s.Key)) {
			out = append(out, s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

// SameSigs reports whether two sorted signature lists hold the same keys.
func SameSigs(a, b []SigEntry) bool {
	return slices.EqualFunc(a, b, func(x, y SigEntry) bool { return x.Key == y.Key })
}

// Package wire reads and checks frames (spec 9.1 to 9.4), negotiates versions (9.2)
// and decides sync policy (10.9). Frames are lenient about extra members; records inside are not.
package wire

import (
	"slices"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
)

// Frame is a parsed frame: its type and its members (a loose tree).
type Frame struct {
	M   string
	ID  int64 // 0 when absent
	Raw map[string]any
}

// Error is a frame-level refusal; Close says whether the connection ends.
type Error struct {
	Code  string
	Close bool
}

func bad(code string) *Error { return &Error{code, closes(code)} }

func closes(code string) bool {
	switch code {
	case fed.BadFrame, fed.TooBig, fed.BadJSON, fed.Unsupported, fed.NotReady, fed.Policy, fed.BadChallenge, fed.NotNode:
		return true
	}
	return false
}

// Closes reports whether an error code closes the connection.
func Closes(code string) bool { return closes(code) }

// Role-specific message sets.
var (
	clientMsgs = map[string]bool{"hello": true, "auth": true, "challenge": true, "put": true, "cosign": true, "sub": true,
		"unsub": true, "fetch": true, "rank": true, "rankwhy": true, "facets": true, "nets": true, "servers": true, "ping": true, "pong": true, "err": true, "state": true}
	nodeMsgs = map[string]bool{"hello": true, "welcome": true, "proof": true, "carry": true, "inv": true,
		"want": true, "push": true, "catalog": true, "err": true, "ping": true, "pong": true, "states": true}
	// Requests carry an id.
	requests = map[string]bool{"auth": true, "challenge": true, "put": true, "cosign": true, "sub": true, "unsub": true,
		"fetch": true, "rank": true, "rankwhy": true, "facets": true, "nets": true, "servers": true, "ping": true, "pong": true}
)

// Parse reads frame text, checking the size limit, JSON and the frame's shape.
func Parse(text []byte, limit int) (*Frame, *Error) {
	if len(text) > limit {
		return nil, bad(fed.TooBig)
	}
	v, code := canon.Parse(text)
	if code != "" {
		return nil, bad(fed.BadJSON)
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, bad(fed.BadFrame)
	}
	t, ok := m["m"].(string)
	if !ok {
		return nil, bad(fed.BadFrame)
	}
	f := &Frame{M: t, Raw: m}
	if idv, ok := m["id"]; ok {
		n, ok := Int(idv)
		if !ok || n < 1 || n > 2147483647 {
			return nil, bad(fed.BadFrame)
		}
		f.ID = n
	}
	return f, nil
}

// Int reads an integer member of a loose tree.
func Int(v any) (int64, bool) {
	n, ok := v.(canon.Num)
	if !ok {
		return 0, false
	}
	return canon.Int(n)
}

// Str reads a string member.
func (f *Frame) Str(k string) (string, bool) { s, ok := f.Raw[k].(string); return s, ok }

// Strs reads a list of strings.
func (f *Frame) Strs(k string) ([]string, bool) {
	a, ok := f.Raw[k].([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, len(a))
	for i, e := range a {
		s, ok := e.(string)
		if !ok {
			return nil, false
		}
		out[i] = s
	}
	return out, true
}

// Vers reads and checks a vers list: integers, ascending, unique, at least one.
func Vers(v any) ([]int64, bool) {
	a, ok := v.([]any)
	if !ok || len(a) == 0 {
		return nil, false
	}
	out := make([]int64, len(a))
	for i, e := range a {
		n, ok := Int(e)
		if !ok || i > 0 && n <= out[i-1] {
			return nil, false
		}
		out[i] = n
	}
	return out, true
}

// Negotiate picks the highest version both speak.
func Negotiate(a, b []int64) (int64, bool) {
	for i := len(a) - 1; i >= 0; i-- {
		if slices.Contains(b, a[i]) {
			return a[i], true
		}
	}
	return 0, false
}

// Hello is a checked hello.
type Hello struct {
	Role   string
	Ver    int64
	Server string // node role
	Node   string
	Nonce  string
	Impl   *update.Impl // node role: what the caller runs (informational, nil when absent or malformed)
	Feats  []string     // node role: optional messages the caller takes (9.4 feats)
}

// Feat is the one optional feature of this version: live states (5.11), the client's state and the
// nodes' states messages, and the measure now (9.5).
const Feat = "state"

// Feats reads a feats member (9.3, 9.4): the strings of a list, anything else none. It is
// informational: a side sends an optional message only to a peer that listed it.
func Feats(v any) []string {
	a, _ := v.([]any)
	var out []string
	for _, e := range a[:min(len(a), 16)] {
		if s, ok := e.(string); ok && len(s) <= 32 {
			out = append(out, s)
		}
	}
	return out
}

// CheckHello checks a hello frame against the versions this side speaks.
func CheckHello(f *Frame, speaks []int64) (*Hello, *Error) {
	vers, ok := Vers(f.Raw["vers"])
	if !ok {
		return nil, bad(fed.BadFrame)
	}
	role, _ := f.Str("role")
	h := &Hello{Role: role}
	switch role {
	case "client":
	case "node":
		var ok1, ok2, ok3 bool
		h.Server, ok1 = f.Str("server")
		h.Node, ok2 = f.Str("node")
		h.Nonce, ok3 = f.Str("nonce")
		if !ok1 || !ok2 || !ok3 || !fed.IsID(h.Server) || !fed.IsKey(h.Node) || !fed.IsID(h.Nonce) {
			return nil, bad(fed.BadFrame)
		}
		h.Impl = update.ReadImpl(f.Raw["impl"])
		h.Feats = Feats(f.Raw["feats"])
	default:
		return nil, bad(fed.BadFrame)
	}
	v, ok := Negotiate(vers, speaks)
	if !ok {
		return nil, bad(fed.Unsupported)
	}
	h.Ver = v
	return h, nil
}

// CheckClient checks a client's frame in state "new" (before hello) or "ready" (9.1, 9.3).
// It returns the hello when the frame is one.
func CheckClient(f *Frame, ready bool, speaks []int64) (*Hello, *Error) {
	if !clientMsgs[f.M] {
		return nil, bad(fed.BadFrame)
	}
	if !ready {
		if f.M != "hello" {
			return nil, bad(fed.NotReady)
		}
		return CheckHello(f, speaks)
	}
	if f.M == "hello" {
		return nil, bad(fed.BadFrame)
	}
	if requests[f.M] && f.ID == 0 {
		return nil, bad(fed.BadFrame)
	}
	okStr := func(k string) bool { _, ok := f.Str(k); return ok }
	okStrs := func(k string) bool { _, ok := f.Strs(k); return ok }
	switch f.M {
	case "challenge":
		if !okStr("nonce") {
			return nil, bad(fed.BadFrame)
		}
	case "auth":
		if _, ok := Int(f.Raw["t"]); !ok || !okStr("key") || !okStr("sig") {
			return nil, bad(fed.BadFrame)
		}
	case "put", "state":
		if _, ok := f.Raw["rec"]; !ok {
			return nil, bad(fed.BadFrame)
		}
	case "cosign":
		if !okStr("rid") || !okStr("key") || !okStr("sig") {
			return nil, bad(fed.BadFrame)
		}
	case "sub":
		if !okStrs("kinds") || !okStr("since") {
			return nil, bad(fed.BadFrame)
		}
	case "fetch":
		if !okStrs("ids") {
			return nil, bad(fed.BadFrame)
		}
	case "rank":
		if !okStr("board") || !okStr("measure") || !okStr("division") {
			return nil, bad(fed.BadFrame)
		}
	case "rankwhy":
		if !okStr("board") || !okStr("measure") || !okStr("division") || !okStr("key") {
			return nil, bad(fed.BadFrame)
		}
	case "nets":
		if !okStrs("keys") {
			return nil, bad(fed.BadFrame)
		}
	}
	return nil, nil
}

// CheckNode checks a node session's frame once the handshake is done.
func CheckNode(f *Frame) *Error {
	if !nodeMsgs[f.M] || f.M == "hello" || f.M == "welcome" || f.M == "proof" {
		return bad(fed.BadFrame)
	}
	switch f.M {
	case "carry":
		if _, ok := f.Strs("classes"); !ok {
			return bad(fed.BadFrame)
		}
		if n, ok := Int(f.Raw["since"]); !ok || n < 0 {
			return bad(fed.BadFrame)
		}
	case "inv":
		ids, ok := f.Strs("ids")
		if !ok || len(ids) > fed.MaxInv {
			return bad(fed.BadFrame)
		}
	case "want":
		ids, ok := f.Strs("ids")
		if !ok || len(ids) > fed.MaxInv {
			return bad(fed.BadFrame)
		}
	case "push", "states":
		a, ok := f.Raw["items"].([]any)
		if !ok || len(a) > fed.MaxItems {
			return bad(fed.BadFrame)
		}
	case "catalog":
		if _, ok := f.Raw["entries"].([]any); !ok {
			return bad(fed.BadFrame)
		}
	case "ping":
		if f.ID == 0 {
			return bad(fed.BadFrame)
		}
	}
	return nil
}

// Allows is 10.9: whether two servers sync. Nodes of one server always do.
func Allows(same bool, aID, aSync string, aList []string, bID, bSync string, bList []string) bool {
	if same {
		return true
	}
	return allows(aSync, aList, bID, bSync) && allows(bSync, bList, aID, aSync)
}

func allows(sync string, list []string, other, otherSync string) bool {
	switch sync {
	case "selective":
		return slices.Contains(list, other)
	case "open":
		return otherSync != "standalone"
	}
	return false
}

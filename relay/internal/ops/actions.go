package ops

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"sort"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

// NewKey writes a fresh Ed25519 seed (base64url) to path, mode 0600; it never overwrites.
func NewKey(path string) (*fed.Signer, error) {
	if _, err := os.Stat(path); err == nil {
		return nil, fmt.Errorf("%s already exists", path)
	}
	var seed [32]byte
	if _, err := rand.Read(seed[:]); err != nil {
		return nil, err
	}
	if err := store.WriteAtomic(path, []byte(fed.Encode(seed[:])+"\n"), 0o600); err != nil {
		return nil, err
	}
	return fed.NewSigner(seed[:])
}

// LoadKey reads a seed file.
func LoadKey(path string) (*fed.Signer, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	seed, ok := fed.Decode(strings.TrimSpace(string(b)), 32)
	if !ok {
		return nil, fmt.Errorf("%s does not hold a 32-byte base64url seed", path)
	}
	return fed.NewSigner(seed)
}

// State is the server as the running relay reports it.
type State struct {
	Server    string                      `json:"server"`
	Head      string                      `json:"head"`
	Operators []string                    `json:"operators"`
	Nodes     []struct{ Key, URL string } `json:"nodes"`
	Sync      string                      `json:"sync"`
	Hide      json.RawMessage             `json:"hide"`
	Record    json.RawMessage             `json:"serverRecord"`
	Genesis   json.RawMessage             `json:"genesis"`
}

// ReadState decodes a state result.
func ReadState(v any) (*State, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var s State
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	if s.Server == "" || s.Head == "" {
		return nil, errors.New("this node does not know its server yet")
	}
	return &s, nil
}

func body(raw json.RawMessage) map[string]any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	v, code := canon.ParseStrict(raw)
	if code != "" {
		return nil
	}
	m, _ := v.(map[string]any)
	b, _ := m["body"].(map[string]any)
	return b
}

func keyList(v any) []string {
	a, _ := v.([]any)
	out := []string{}
	for _, x := range a {
		if s, ok := x.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// Hide builds the next hide record: the current lists with key added to or removed from one list.
func Hide(st *State, op *fed.Signer, list, key string, add bool, now int64) (map[string]any, error) {
	if !fed.IsKey(key) {
		return nil, errors.New("not a network key")
	}
	cur := body(st.Hide)
	lists := map[string][]string{"hide": {}, "names": {}, "refuse": {}}
	for k := range lists {
		if cur != nil {
			lists[k] = keyList(cur[k])
		}
	}
	if _, ok := lists[list]; !ok {
		return nil, errors.New("list is hide, names or refuse")
	}
	if add {
		if !slices.Contains(lists[list], key) {
			lists[list] = append(lists[list], key)
		}
	} else {
		for k := range lists {
			lists[k] = slices.DeleteFunc(lists[k], func(x string) bool { return x == key })
		}
	}
	b := map[string]any{"server": st.Server}
	for k, l := range lists {
		sort.Strings(l)
		b[k] = toAny(l)
	}
	return op.Seal("hide", now, b), nil
}

func toAny(l []string) []any {
	out := make([]any, len(l))
	for i, s := range l {
		out[i] = s
	}
	return out
}

// Shun builds a vote; reason "" makes an unshun.
func Shun(st *State, op *fed.Signer, target, reason string, now int64) (map[string]any, error) {
	if !fed.IsKey(target) {
		return nil, errors.New("not a network key")
	}
	if reason == "" {
		return op.Seal("unshun", now, map[string]any{"server": st.Server, "target": target}), nil
	}
	return op.Seal("shun", now, map[string]any{"server": st.Server, "target": target, "reason": reason}), nil
}

// Propose builds an operators proposal at the current head, signed by this operator.
func Propose(st *State, op *fed.Signer, action, target, url string, now int64) (map[string]any, error) {
	actions := map[string]string{"add-operator": "add_operator", "remove-operator": "remove_operator",
		"add-node": "set_node", "set-node": "set_node", "remove-node": "remove_node"}
	a, ok := actions[action]
	if !ok {
		return nil, errors.New("action is add-operator, remove-operator, add-node, set-node or remove-node")
	}
	if !fed.IsKey(target) {
		return nil, errors.New("not a key")
	}
	b := map[string]any{"server": st.Server, "prev": st.Head, "action": a, "target": target}
	if a == "set_node" {
		if !fed.URLOK(url) {
			return nil, errors.New("add-node needs --url wss://host/path")
		}
		b["url"] = url
	}
	return op.SealMulti("operators", now, b), nil
}

// ServerFields are the descriptive fields of a server record.
type ServerFields struct {
	Name   string
	Sync   string
	NoLogs bool
	Langs  []string
	Desc   string
}

// ServerRecord builds a server record at the current head with the chain's lists.
func ServerRecord(st *State, op *fed.Signer, f ServerFields, now int64) map[string]any {
	nodes := make([]any, len(st.Nodes))
	for i, n := range st.Nodes {
		nodes[i] = map[string]any{"key": n.Key, "url": n.URL}
	}
	return op.SealMulti("server", now, map[string]any{"server": st.Server, "head": st.Head, "name": f.Name,
		"nodes": nodes, "operators": toAny(st.Operators), "sync": f.Sync, "noLogs": f.NoLogs,
		"langs": toAny(f.Langs), "desc": f.Desc})
}

// CurrentFields reads the descriptive fields of the current server record (or genesis).
func CurrentFields(st *State) ServerFields {
	f := ServerFields{Sync: "standalone", NoLogs: true, Langs: []string{}}
	if b := body(st.Record); b != nil {
		f.Name, _ = b["name"].(string)
		f.Sync, _ = b["sync"].(string)
		f.NoLogs, _ = b["noLogs"].(bool)
		f.Langs = keyList(b["langs"])
		f.Desc, _ = b["desc"].(string)
	} else if g := body(st.Genesis); g != nil {
		f.Name, _ = g["name"].(string)
	}
	return f
}

// Cosign signs a stored multi-signer record's text.
func Cosign(rec any, op *fed.Signer) (string, error) {
	r, code := fed.CheckValue(rec, 0, fed.Opts{Trusted: true})
	if code != "" {
		return "", errors.New(code)
	}
	return op.Sign(r.Signed()), nil
}

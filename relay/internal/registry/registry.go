// Package registry checks registry files (spec 11.2) and builds servers.json (11.3).
// CI and the site build call this through `relay check-registry` and
// `relay build-servers-json`, so there is one implementation of "is this server valid".
package registry

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// Failure is a failed check: the step of 11.2 and the code.
type Failure struct {
	Step   int
	Code   string
	Detail string
}

func (f *Failure) Error() string {
	s := fmt.Sprintf("step %d: %s", f.Step, f.Code)
	if f.Detail != "" {
		s += ": " + f.Detail
	}
	return s
}

func fail(step int, code, detail string) *Failure { return &Failure{step, code, detail} }

// Entry is a checked registry file.
type Entry struct {
	ID       string
	Genesis  *fed.Record
	Chain    []*fed.Record
	Server   *fed.Record
	State    *chain.State
	Listed   *int64
	Answered *int64
}

// Name is the server's name from its server record.
func (e *Entry) Name() string { return e.Server.Str("name") }

// Parse runs steps 1 to 5 of 11.2 on one file's bytes (name is the file name).
func Parse(name string, data []byte, now int64) (*Entry, *Failure) {
	if len(data) > fed.RegistryFileMax {
		return nil, fail(1, fed.TooBig, "")
	}
	v, code := canon.Parse(data)
	if code != "" {
		return nil, fail(1, fed.BadJSON, "")
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, fail(1, fed.BadField, "not an object")
	}
	for _, f := range []string{"v", "genesis", "chain", "server"} {
		if _, ok := m[f]; !ok {
			return nil, fail(1, fed.MissingField, f)
		}
	}
	for f := range m {
		switch f {
		case "v", "genesis", "chain", "server", "listed", "answered":
		default:
			return nil, fail(1, fed.UnknownField, f)
		}
	}
	if n, ok := wire.Int(m["v"]); !ok || n != 1 {
		return nil, fail(1, fed.BadField, "v")
	}
	list, ok := m["chain"].([]any)
	if !ok {
		return nil, fail(1, fed.BadField, "chain")
	}
	if len(list) > fed.MaxChain {
		return nil, fail(1, fed.TooMany, "chain")
	}
	e := &Entry{}
	stamp := func(f string) (*int64, *Failure) {
		x, ok := m[f]
		if !ok {
			return nil, nil
		}
		n, ok := wire.Int(x)
		if !ok || n < 0 || n%fed.Day != 0 {
			return nil, fail(1, fed.BadField, f)
		}
		return &n, nil
	}
	var f *Failure
	if e.Listed, f = stamp("listed"); f != nil {
		return nil, f
	}
	if e.Answered, f = stamp("answered"); f != nil {
		return nil, f
	}
	kindOf := func(x any) string { mm, _ := x.(map[string]any); k, _ := mm["kind"].(string); return k }
	if kindOf(m["genesis"]) != "genesis" {
		return nil, fail(1, fed.BadField, "genesis")
	}
	if kindOf(m["server"]) != "server" {
		return nil, fail(1, fed.BadField, "server")
	}
	for _, x := range list {
		if kindOf(x) != "operators" {
			return nil, fail(1, fed.BadField, "chain")
		}
	}
	rec := func(x any, what string) (*fed.Record, *Failure) {
		r, code := fed.CheckLoose(x, now, fed.Opts{})
		if code != "" {
			return nil, fail(2, code, what)
		}
		return r, nil
	}
	if e.Genesis, f = rec(m["genesis"], "genesis"); f != nil {
		return nil, f
	}
	for i, x := range list {
		r, f := rec(x, fmt.Sprintf("chain[%d]", i))
		if f != nil {
			return nil, f
		}
		e.Chain = append(e.Chain, r)
	}
	if e.Server, f = rec(m["server"], "server"); f != nil {
		return nil, f
	}
	e.ID = e.Genesis.ID
	if name != e.ID+".json" {
		return nil, fail(3, fed.IDMismatch, "expected "+e.ID+".json")
	}
	st, code := chain.CheckSequence(e.Genesis, e.Chain)
	if code != "" {
		return nil, fail(4, code, "")
	}
	e.State = st
	if code := st.CheckServer(e.Server); code != "" {
		return nil, fail(5, code, "")
	}
	if e.Server.Str("head") != st.Head {
		return nil, fail(5, fed.BadChain, "server record is not at the chain's last head")
	}
	return e, nil
}

// ChallengeTimeout is the time each node gets to answer (11.2 step 9).
const ChallengeTimeout = 10 * time.Second

// Challenger asks one node to prove its key; nil error means it answered.
type Challenger func(ctx context.Context, url, server, node string) error

// Check runs every step of 11.2 for the file `name` among `files` (the whole folder, name
// included). base is the file on the base branch (nil when new). A nil challenger skips step 9.
func Check(name string, files map[string][]byte, base []byte, now int64, challenge Challenger) *Failure {
	e, f := Parse(name, files[name], now)
	if f != nil {
		return f
	}
	if !e.Server.Bool("noLogs") {
		return fail(6, fed.NoLogs, "")
	}
	if u := localURL(e); u != "" {
		return fail(6, fed.LocalURL, u)
	}
	if f := nameTaken(name, e, files); f != nil {
		return f
	}
	if base != nil {
		if f := stampsKept(files[name], base); f != nil {
			return f
		}
	}
	if challenge == nil {
		return nil
	}
	for _, n := range e.State.Nodes {
		ctx, cancel := context.WithTimeout(context.Background(), ChallengeTimeout)
		err := challenge(ctx, n.URL, e.ID, n.Key)
		cancel()
		if err == nil {
			return nil
		}
	}
	return fail(9, fed.NoAnswer, "")
}

func lowerASCII(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

// localURL is the first node URL in the file that names an IP address or a .local host, or "":
// LAN servers are fine to join by invite, but the registry lists servers the internet can reach.
func localURL(e *Entry) string {
	var urls []string
	if n, ok := e.Genesis.Body["node"].(map[string]any); ok {
		u, _ := n["url"].(string)
		urls = append(urls, u)
	}
	for _, p := range e.Chain {
		if p.Has("url") {
			urls = append(urls, p.Str("url"))
		}
	}
	if list, ok := e.Server.Body["nodes"].([]any); ok {
		for _, x := range list {
			n, _ := x.(map[string]any)
			u, _ := n["url"].(string)
			urls = append(urls, u)
		}
	}
	for _, u := range urls {
		if !fed.PublicURL(u) {
			return u
		}
	}
	return ""
}

func nameTaken(name string, e *Entry, files map[string][]byte) *Failure {
	mine := lowerASCII(e.Name())
	for other, data := range files {
		if other == name {
			continue
		}
		v, code := canon.Parse(data)
		if code != "" {
			continue
		}
		m, _ := v.(map[string]any)
		srv, _ := m["server"].(map[string]any)
		body, _ := srv["body"].(map[string]any)
		if n, ok := body["name"].(string); ok && lowerASCII(n) == mine {
			return fail(7, fed.NameTaken, "same name as "+other)
		}
	}
	return nil
}

func stampsKept(data, base []byte) *Failure {
	get := func(b []byte) map[string]any {
		v, _ := canon.Parse(b)
		m, _ := v.(map[string]any)
		return m
	}
	a, b := get(data), get(base)
	for _, f := range []string{"listed", "answered"} {
		x, xok := a[f]
		y, yok := b[f]
		xn, _ := wire.Int(x)
		yn, _ := wire.Int(y)
		if xok != yok || xn != yn {
			return fail(8, fed.BadField, f+" changed")
		}
	}
	return nil
}

// ReadFolder reads every *.json file of a folder by name; a missing folder is empty.
func ReadFolder(dir string) (map[string][]byte, error) {
	out := map[string][]byte{}
	list, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	for _, de := range list {
		if de.IsDir() || !strings.HasSuffix(de.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, de.Name()))
		if err != nil {
			return nil, err
		}
		out[de.Name()] = b
	}
	return out, nil
}

// Build makes servers.json (11.3) from the files that pass steps 1 to 7; skipped files are returned.
func Build(files map[string][]byte, now int64) ([]byte, map[string]*Failure) {
	names := make([]string, 0, len(files))
	for n := range files {
		names = append(names, n)
	}
	sort.Strings(names)
	skipped := map[string]*Failure{}
	var asOf int64
	var servers []any
	var entries []*Entry
	for _, n := range names {
		if f := Check(n, files, nil, now, nil); f != nil {
			skipped[n] = f
			continue
		}
		e, _ := Parse(n, files[n], now)
		entries = append(entries, e)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].ID < entries[j].ID })
	for _, e := range entries {
		ch := make([]any, len(e.Chain))
		for i, r := range e.Chain {
			ch[i] = r.Value
		}
		s := map[string]any{"id": e.ID, "genesis": e.Genesis.Value, "chain": ch, "server": e.Server.Value}
		if e.Listed != nil {
			s["listed"] = *e.Listed
		}
		if e.Answered != nil {
			s["answered"] = *e.Answered
			asOf = max(asOf, *e.Answered)
		}
		servers = append(servers, s)
	}
	if servers == nil {
		servers = []any{}
	}
	out := canon.Encode(map[string]any{"v": int64(1), "asOf": asOf, "servers": servers})
	return append(out, '\n'), skipped
}

// File makes a registry file (11.1) for a server: genesis, applied chain, current server record.
func File(g *fed.Record, applied []*fed.Record, server *fed.Record) []byte {
	ch := make([]any, len(applied))
	for i, r := range applied {
		ch[i] = r.Value
	}
	return append(canon.Encode(map[string]any{"v": int64(1), "genesis": g.Value, "chain": ch, "server": server.Value}), '\n')
}

// KeepStamps copies `listed` and `answered` from the server's existing registry file into a
// freshly made one, so a replacement keeps the weekly job's stamps (11.2 step 8).
func KeepStamps(file, existing []byte) ([]byte, error) {
	nv, code := canon.ParseStrict(file)
	nm, _ := nv.(map[string]any)
	if code != "" || nm == nil {
		return nil, fmt.Errorf("new registry file: not a JSON object (%s)", code)
	}
	ov, code := canon.ParseStrict(existing)
	om, _ := ov.(map[string]any)
	if code != "" || om == nil {
		return nil, fmt.Errorf("existing registry file: not a JSON object (%s)", code)
	}
	if nm["genesis"] == nil || !bytes.Equal(canon.Encode(nm["genesis"]), canon.Encode(om["genesis"])) {
		return nil, fmt.Errorf("the existing registry file is for another server")
	}
	for _, f := range []string{"listed", "answered"} {
		x, ok := om[f]
		if !ok {
			continue
		}
		n, ok := x.(int64)
		if !ok || n < 0 || n%fed.Day != 0 {
			return nil, fmt.Errorf("existing registry file: bad %s", f)
		}
		nm[f] = n
	}
	return append(canon.Encode(nm), '\n'), nil
}

// Snapshot is a parsed servers.json.
type Snapshot struct {
	AsOf    int64
	Entries []*Entry
}

// ReadSnapshot reads servers.json, keeping the entries that check (records and chain).
func ReadSnapshot(data []byte, now int64) (*Snapshot, error) {
	v, code := canon.Parse(data)
	if code != "" {
		return nil, fmt.Errorf("servers.json: %s", code)
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("servers.json: not an object")
	}
	s := &Snapshot{}
	s.AsOf, _ = wire.Int(m["asOf"])
	list, _ := m["servers"].([]any)
	for _, x := range list {
		sm, ok := x.(map[string]any)
		if !ok {
			continue
		}
		id, _ := sm["id"].(string)
		file := map[string]any{"v": canon.Num("1"), "genesis": sm["genesis"], "chain": sm["chain"], "server": sm["server"]}
		for _, f := range []string{"listed", "answered"} {
			if y, ok := sm[f]; ok {
				file[f] = y
			}
		}
		b, err := encodeLoose(file)
		if err != nil {
			continue
		}
		e, f := Parse(id+".json", b, now)
		if f != nil {
			continue
		}
		s.Entries = append(s.Entries, e)
	}
	return s, nil
}

// encodeLoose writes a loose tree back as JSON text (numbers as written).
func encodeLoose(v any) ([]byte, error) {
	var buf bytes.Buffer
	var w func(v any) error
	w = func(v any) error {
		switch x := v.(type) {
		case map[string]any:
			buf.WriteByte('{')
			keys := make([]string, 0, len(x))
			for k := range x {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for i, k := range keys {
				if i > 0 {
					buf.WriteByte(',')
				}
				buf.Write(jsonString(k))
				buf.WriteByte(':')
				if err := w(x[k]); err != nil {
					return err
				}
			}
			buf.WriteByte('}')
		case []any:
			buf.WriteByte('[')
			for i, e := range x {
				if i > 0 {
					buf.WriteByte(',')
				}
				if err := w(e); err != nil {
					return err
				}
			}
			buf.WriteByte(']')
		case string:
			buf.Write(jsonString(x))
		case canon.Num:
			buf.WriteString(string(x))
		case bool:
			if x {
				buf.WriteString("true")
			} else {
				buf.WriteString("false")
			}
		case nil:
			buf.WriteString("null")
		default:
			return fmt.Errorf("cannot encode %T", v)
		}
		return nil
	}
	err := w(v)
	return buf.Bytes(), err
}

// jsonString escapes for JSON text (control characters too), unlike canonical output.
func jsonString(s string) []byte {
	var b bytes.Buffer
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"' || r == '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case r < 0x20:
			fmt.Fprintf(&b, "\\u%04x", r)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.Bytes()
}

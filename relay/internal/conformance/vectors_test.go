// Package conformance runs every shared vector in federation/vectors against the relay's code.
package conformance

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

const dir = "../../../federation/vectors"

type vcase struct {
	Input  json.RawMessage `json:"input"`
	Expect json.RawMessage `json:"expect"`
}

type vfile struct {
	Description string          `json:"description"`
	Input       json.RawMessage `json:"input"`
	Expect      json.RawMessage `json:"expect"`
	Cases       []vcase         `json:"cases"`
}

// runner checks one case and returns what the relay computed, as a JSON-comparable value.
type runner func(t *testing.T, in json.RawMessage, expect json.RawMessage) any

// areas maps every vector folder to its runner. A folder missing here fails the test.
var areas = map[string]runner{}

func TestVectors(t *testing.T) {
	folders, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, f := range folders {
		if !f.IsDir() {
			continue
		}
		run, ok := areas[f.Name()]
		if !ok {
			t.Errorf("vector folder %q has no runner", f.Name())
			continue
		}
		files, _ := filepath.Glob(filepath.Join(dir, f.Name(), "*.json"))
		if len(files) == 0 {
			t.Errorf("vector folder %q is empty", f.Name())
		}
		for _, file := range files {
			b, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var vf vfile
			if err := json.Unmarshal(b, &vf); err != nil {
				t.Fatalf("%s: %v", file, err)
			}
			cases := vf.Cases
			if cases == nil {
				cases = []vcase{{vf.Input, vf.Expect}}
			}
			name := f.Name() + "/" + filepath.Base(file)
			t.Run(name, func(t *testing.T) {
				for i, c := range cases {
					got := run(t, c.Input, c.Expect)
					if got == nil {
						continue
					}
					if !sameJSON(t, got, c.Expect) {
						gb, _ := json.Marshal(got)
						t.Errorf("case %d: got %s, want %s", i, gb, compact(c.Expect))
					}
					n++
				}
			})
		}
	}
	t.Logf("%d vector cases", n)
}

func compact(b []byte) string {
	var buf bytes.Buffer
	_ = json.Compact(&buf, b)
	return buf.String()
}

func sameJSON(t *testing.T, got any, want json.RawMessage) bool {
	gb, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	var a, b any
	_ = json.Unmarshal(gb, &a)
	_ = json.Unmarshal(want, &b)
	return reflect.DeepEqual(a, b)
}

func decode[T any](t *testing.T, raw json.RawMessage) T {
	var v T
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	if err := d.Decode(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

func errOr(code string, ok map[string]any) map[string]any {
	if code != "" {
		return map[string]any{"ok": false, "error": code}
	}
	return ok
}

// strict parses raw vector JSON into a strict protocol value.
func strict(t *testing.T, raw json.RawMessage) any {
	v, code := canon.ParseStrict(raw)
	if code != "" {
		t.Fatalf("vector value does not parse: %s", code)
	}
	return v
}

func init() {
	areas["canonical"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Text *string `json:"text"`
			Hex  string  `json:"hex"`
		}](t, in)
		var b []byte
		if x.Text != nil {
			b = []byte(*x.Text)
		} else {
			var err error
			if b, err = hex.DecodeString(x.Hex); err != nil {
				t.Fatal(err)
			}
		}
		v, code := canon.ParseStrict(b)
		if code != "" {
			return map[string]any{"error": code}
		}
		return map[string]any{"canonical": string(canon.Encode(v))}
	}

	areas["signing"] = func(t *testing.T, in, expect json.RawMessage) any {
		x := decode[struct {
			Seeds    map[string]string `json:"seeds"`
			Seed     string            `json:"seed"`
			Unsigned json.RawMessage   `json:"unsigned"`
		}](t, in)
		signer := func(h string) *fed.Signer {
			b, err := hex.DecodeString(h)
			if err != nil {
				t.Fatal(err)
			}
			s, err := fed.NewSigner(b)
			if err != nil {
				t.Fatal(err)
			}
			return s
		}
		if x.Unsigned == nil {
			keys := map[string]any{}
			for name, h := range x.Seeds {
				keys[name] = signer(h).Key
			}
			return map[string]any{"keys": keys}
		}
		u := strict(t, x.Unsigned).(map[string]any)
		text := canon.Encode(u)
		out := map[string]any{"signed_text": string(text)}
		var want map[string]any
		_ = json.Unmarshal(expect, &want)
		rec := map[string]any{}
		for k, v := range u {
			rec[k] = v
		}
		if x.Seed != "" {
			sig := signer(x.Seed).Sign(text)
			out["sig"] = sig
			rec["sig"] = sig
			out["id"] = fed.Hash(canon.Encode(rec))
		} else {
			var sigs []fed.SigEntry
			for _, h := range x.Seeds {
				s := signer(h)
				sigs = append(sigs, fed.SigEntry{Key: s.Key, Sig: s.Sign(text)})
			}
			sort.Slice(sigs, func(i, j int) bool { return sigs[i].Key < sigs[j].Key })
			list := []any{}
			for _, s := range sigs {
				list = append(list, map[string]any{"key": s.Key, "sig": s.Sig})
			}
			out["sigs"] = list
			rec["sigs"] = list
			out["id"] = fed.Hash(text)
		}
		if _, ok := want["record"]; ok {
			out["record"] = rec
		}
		// The relay must also accept what it signed.
		if _, code := fed.CheckValue(rec, 1767312100, fed.Opts{}); code != "" {
			t.Errorf("signed record refused: %s", code)
		}
		return out
	}

	areas["asn"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct{ Key string }](t, in)
		n, _ := fed.ASN(x.Key)
		return map[string]any{"asn": n}
	}

	areas["records"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now    int64           `json:"now"`
			Record json.RawMessage `json:"record"`
			Text   *string         `json:"text"`
			As     string          `json:"as"` // "state": where a live state is expected (5.11)
		}](t, in)
		o := fed.Opts{}
		if x.As == "state" {
			o.Allow = fed.IsState
		}
		var r *fed.Record
		var code string
		if x.Text != nil {
			if len(*x.Text) > fed.ClientFrame {
				code = fed.TooBig // step 1: the frame limit
			} else {
				r, code = fed.ParseRecord([]byte(*x.Text), x.Now, o)
			}
		} else {
			r, code = fed.ParseRecord(x.Record, x.Now, o)
		}
		if code != "" {
			return errOr(code, nil)
		}
		return map[string]any{"ok": true, "kind": r.Kind, "id": r.ID}
	}

	areas["receipts"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now     int64           `json:"now"`
			Server  string          `json:"server"`
			Nodes   []string        `json:"nodes"`
			Record  json.RawMessage `json:"record"`
			Receipt json.RawMessage `json:"receipt"`
		}](t, in)
		rec, code := fed.ParseRecord(x.Record, x.Now, fed.Opts{})
		if code != "" {
			t.Fatalf("record refused: %s", code)
		}
		_, code = fed.CheckReceipt(strict(t, x.Receipt), rec, x.Server, x.Nodes, x.Now)
		return errOr(code, map[string]any{"ok": true})
	}

	areas["proofs"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now    int64           `json:"now"`
			Nonce  string          `json:"nonce"`
			Server string          `json:"server"`
			Node   string          `json:"node"`
			Proof  json.RawMessage `json:"proof"`
		}](t, in)
		code := fed.CheckProof(strict(t, x.Proof), x.Nonce, x.Server, x.Node, x.Now)
		return errOr(code, map[string]any{"ok": true})
	}

	areas["auth"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now    int64           `json:"now"`
			Node   string          `json:"node"`
			Server string          `json:"server"`
			Auth   json.RawMessage `json:"auth"`
		}](t, in)
		f, werr := wire.Parse(x.Auth, fed.ClientFrame)
		if werr != nil {
			t.Fatalf("auth frame: %s", werr.Code)
		}
		if _, werr := wire.CheckClient(f, true, []int64{1}); werr != nil {
			t.Fatalf("auth frame: %s", werr.Code)
		}
		key, _ := f.Str("key")
		sig, _ := f.Str("sig")
		ts, _ := wire.Int(f.Raw["t"])
		return errOr(fed.CheckAuth(key, ts, sig, x.Node, x.Server, x.Now), map[string]any{"ok": true})
	}
}

var _ = strings.TrimSpace

func mustRecord(t *testing.T, raw json.RawMessage, now int64) *fed.Record {
	r, code := fed.ParseRecord(raw, now, fed.Opts{})
	if code != "" {
		t.Fatalf("vector record refused: %s", code)
	}
	return r
}

func init() {
	areas["operators"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now     int64             `json:"now"`
			Genesis json.RawMessage   `json:"genesis"`
			Records []json.RawMessage `json:"records"`
			Server  json.RawMessage   `json:"server"`
		}](t, in)
		g := mustRecord(t, x.Genesis, x.Now)
		var ops []*fed.Record
		for _, r := range x.Records {
			ops = append(ops, mustRecord(t, r, x.Now))
		}
		s := chain.Compute(g, ops)
		if x.Server != nil {
			code := s.CheckServer(mustRecord(t, x.Server, x.Now))
			return errOr(code, map[string]any{"ok": true})
		}
		pending := []string{}
		for _, p := range s.Pending(x.Now) {
			pending = append(pending, p.ID)
		}
		return map[string]any{"head": s.Head, "operators": s.Operators, "nodes": s.Nodes, "pending": pending}
	}

	areas["majority"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct{ Operators, Signers int }](t, in)
		return map[string]any{"majority": chain.Majority(x.Operators, x.Signers)}
	}
}

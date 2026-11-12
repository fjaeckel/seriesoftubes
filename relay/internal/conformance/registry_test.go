package conformance

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

// fileBytes turns a vector's file (an object, or {text}) into file bytes.
func fileBytes(t *testing.T, raw json.RawMessage) []byte {
	var probe map[string]json.RawMessage
	if json.Unmarshal(raw, &probe) == nil {
		if txt, ok := probe["text"]; ok && len(probe) == 1 {
			var s string
			if err := json.Unmarshal(txt, &s); err != nil {
				t.Fatal(err)
			}
			return []byte(s)
		}
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func init() {
	// The registry vectors carry no "now": records are checked against the time of the
	// check, as CI does. Step 9 (a node answering) is live and not part of the vectors.
	areas["registry"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Files map[string]json.RawMessage `json:"files"`
			Check string                     `json:"check"`
			Base  json.RawMessage            `json:"base"`
		}](t, in)
		files := map[string][]byte{}
		for n, raw := range x.Files {
			files[n] = fileBytes(t, raw)
		}
		now := time.Now().Unix()
		if x.Check == "" {
			out, _ := registry.Build(files, now)
			var v any
			if err := json.Unmarshal(out, &v); err != nil {
				t.Fatal(err)
			}
			return map[string]any{"servers_json": v}
		}
		var base []byte
		if x.Base != nil {
			base = fileBytes(t, x.Base)
		}
		if f := registry.Check(x.Check, files, base, now, nil); f != nil {
			return map[string]any{"ok": false, "error": f.Code}
		}
		return map[string]any{"ok": true}
	}
}

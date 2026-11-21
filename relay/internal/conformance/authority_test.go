package conformance

import (
	"encoding/json"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/authority"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
)

// The authority file (11.5): its checks, and when a node is out of date.
func init() {
	areas["authority"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now  int64    `json:"now"`
			Keys []string `json:"keys"`
			Text string   `json:"text"`
		}](t, in)
		a, code := authority.Parse([]byte(x.Text), x.Keys, x.Now)
		if code != "" {
			return map[string]any{"ok": false, "error": code}
		}
		nets, servers := map[string]any{}, map[string]any{}
		for k, why := range a.Nets {
			nets[k] = why
		}
		for k, why := range a.Servers {
			servers[k] = why
		}
		out := map[string]any{"ok": true, "t": a.T, "relayMin": nil, "relayMinFrom": nil, "nets": nets, "servers": servers}
		if a.RelayMin != "" {
			out["relayMin"], out["relayMinFrom"] = a.RelayMin, a.From
		}
		return out
	}

	areas["relaymin"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			RelayMin     *string      `json:"relayMin"`
			RelayMinFrom *int64       `json:"relayMinFrom"`
			Now          int64        `json:"now"`
			Impl         *update.Impl `json:"impl"`
		}](t, in)
		a := &authority.Authority{}
		if x.RelayMin != nil {
			a.RelayMin, a.From = *x.RelayMin, *x.RelayMinFrom
		}
		return map[string]any{"outdated": a.OutOfDate(x.Impl, x.Now)}
	}
}

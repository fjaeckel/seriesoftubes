package conformance

import (
	"encoding/json"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

func init() {
	areas["autosync"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			AsOf    int64  `json:"asOf"`
			Cap     int    `json:"cap"`
			Self    string `json:"self"`
			Servers []struct {
				ID       string `json:"id"`
				Sync     string `json:"sync"`
				Listed   *int64 `json:"listed"`
				Answered *int64 `json:"answered"`
			} `json:"servers"`
		}](t, in)
		var list []registry.Candidate
		for _, s := range x.Servers {
			list = append(list, registry.Candidate{ID: s.ID, Sync: s.Sync, Listed: s.Listed, Answered: s.Answered})
		}
		el := registry.Eligible(x.AsOf, list)
		peers := registry.AutoPeers(el, x.Self, x.Cap)
		dials := []string{}
		for _, p := range peers {
			if registry.Dials(x.Self, p) {
				dials = append(dials, p)
			}
		}
		if el == nil {
			el = []string{}
		}
		if peers == nil {
			peers = []string{}
		}
		return map[string]any{"eligible": el, "peers": peers, "dials": dials}
	}
}

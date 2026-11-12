package boards

import (
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// With a region filter every board lists only networks with a POP in the region (10.3), the total traffic board
// included, whose value stays the whole network's.
func TestRegionListsOnEveryBoard(t *testing.T) {
	now := int64(1767398410)
	_, curTo, _, _ := Windows(now)
	s := curTo - 10*fed.SlotLen
	rec := func(id, key string, pops map[string]any) *Stats {
		return &Stats{ID: id, Key: key, Slot: s, T: s + 20, Body: map[string]any{
			"mode": "normal", "pops": pops, "traffic": []any{}, "tier1": false, "shareCountry": false,
			"pies": int64(5), "total": int64(7000)}}
	}
	recs := []*Stats{rec("r1", "kA", map[string]any{"fra": int64(1), "nyc": int64(1)}), rec("r2", "kB", map[string]any{"nyc": int64(2)})}
	for _, b := range []string{"pops", "pies", "traffic", "total"} {
		rows := Compute(Query{Now: now, Board: b, Measure: "total", Division: "all", Cities: []string{"fra"}}, recs)
		if len(rows) != 1 || rows[0].Key != "kA" {
			t.Errorf("%s: %v, want only kA", b, rows)
		}
		if b == "total" && rows[0].Value != 7000 {
			t.Errorf("total: %d, want 7000", rows[0].Value)
		}
	}
}

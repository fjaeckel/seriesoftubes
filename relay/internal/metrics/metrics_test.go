package metrics

import (
	"strings"
	"testing"
)

func TestExposition(t *testing.T) {
	m := New()
	m.Inc("relay_records_in_total", "stats")
	m.Add("relay_records_in_total", "stats", 2)
	m.Inc("relay_refused_total", "bad_sig")
	m.Inc("relay_unknown_metric", "x") // undeclared names are ignored
	m.Gauge("relay_clients", "Open client connections.", func() float64 { return 7 })
	var b strings.Builder
	m.Write(&b)
	out := b.String()
	for _, want := range []string{
		"# TYPE relay_records_in_total counter",
		`relay_records_in_total{kind="stats"} 3`,
		`relay_refused_total{code="bad_sig"} 1`,
		"relay_clients 7",
		"relay_syncs_total 0",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in\n%s", want, out)
		}
	}
	if strings.Contains(out, "relay_unknown_metric") {
		t.Error("an undeclared metric was written")
	}
}

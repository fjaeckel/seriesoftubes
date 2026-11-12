package metrics

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExposition(t *testing.T) {
	m := New()
	m.Inc("relay_records_in_total", "stats")
	m.Add("relay_records_in_total", "stats", 2)
	m.Inc("relay_refused_total", "bad_sig")
	m.Inc("relay_unknown_metric", "x") // undeclared names are ignored
	m.Add("relay_records_out_total", "", 4)
	m.Gauge("relay_clients", "Open client connections.", func() float64 { return 5 })
	m.Gauge("relay_clients", "Open client connections.", func() float64 { return 7 }) // replaces
	var b strings.Builder
	if err := m.Write(&b); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	for _, want := range []string{
		"# TYPE relay_records_in_total counter",
		`relay_records_in_total{kind="stats"} 3`,
		`relay_refused_total{code="bad_sig"} 1`,
		`relay_connections_total{role="client"} 0`,
		"relay_records_out_total 4",
		"# TYPE relay_clients gauge",
		"relay_clients 7",
		"relay_syncs_total 0",
		"go_goroutines ",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in\n%s", want, out)
		}
	}
	if strings.Contains(out, "relay_unknown_metric") {
		t.Error("an undeclared metric was written")
	}
	if got := m.Get("relay_records_in_total", "stats"); got != 3 {
		t.Errorf("Get = %v, want 3", got)
	}
	if got := m.Get("relay_syncs_total", ""); got != 0 {
		t.Errorf("Get = %v, want 0", got)
	}
}

func TestHandler(t *testing.T) {
	m := New()
	m.Inc("relay_syncs_total", "")
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	body, _ := io.ReadAll(rec.Body)
	if rec.Code != 200 || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/plain") {
		t.Fatalf("status %d, type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	if !strings.Contains(string(body), "relay_syncs_total 1") {
		t.Errorf("missing sync count in\n%s", body)
	}
}

func TestNil(t *testing.T) {
	var m *M
	m.Inc("relay_syncs_total", "")
	m.Gauge("relay_clients", "x", func() float64 { return 1 })
}

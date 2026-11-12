// Package metrics keeps counts for an optional localhost-only /metrics endpoint in the
// Prometheus text format. Counts only: no label ever holds an address, key or name.
package metrics

import (
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
)

// M holds counters and gauges, each with at most one label (a kind, a code or a role).
type M struct {
	mu      sync.Mutex
	help    map[string]string
	typ     map[string]string
	vals    map[string]map[string]float64 // name -> label value -> value
	labels  map[string]string             // name -> label name
	gauges  map[string]func() float64
}

// New makes an empty set with the relay's metrics declared.
func New() *M {
	m := &M{help: map[string]string{}, typ: map[string]string{}, vals: map[string]map[string]float64{},
		labels: map[string]string{}, gauges: map[string]func() float64{}}
	m.declare("relay_connections_total", "counter", "role", "Connections accepted, by role.")
	m.declare("relay_records_in_total", "counter", "kind", "Records stored, by kind.")
	m.declare("relay_records_out_total", "counter", "", "Records sent to clients and nodes.")
	m.declare("relay_refused_total", "counter", "code", "Records and frames refused, by error code.")
	m.declare("relay_syncs_total", "counter", "", "Node sync sessions started.")
	return m
}

func (m *M) declare(name, typ, label, help string) {
	m.help[name], m.typ[name], m.labels[name] = help, typ, label
	m.vals[name] = map[string]float64{}
}

// Add adds to a counter.
func (m *M) Add(name, label string, v float64) {
	if m == nil {
		return
	}
	m.mu.Lock()
	if vals, ok := m.vals[name]; ok {
		vals[label] += v
	}
	m.mu.Unlock()
}

// Inc adds one.
func (m *M) Inc(name, label string) { m.Add(name, label, 1) }

// Gauge registers a gauge read at scrape time.
func (m *M) Gauge(name, help string, f func() float64) {
	if m == nil {
		return
	}
	m.mu.Lock()
	m.help[name], m.typ[name] = help, "gauge"
	m.gauges[name] = f
	m.mu.Unlock()
}

// Get reads a counter (tests).
func (m *M) Get(name, label string) float64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.vals[name][label]
}

// Write writes the text exposition format.
func (m *M) Write(w io.Writer) {
	m.mu.Lock()
	names := make([]string, 0, len(m.help))
	for n := range m.help {
		names = append(names, n)
	}
	sort.Strings(names)
	var b strings.Builder
	gauges := map[string]func() float64{}
	for n, f := range m.gauges {
		gauges[n] = f
	}
	for _, n := range names {
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s %s\n", n, m.help[n], n, m.typ[n])
		if f, ok := gauges[n]; ok {
			m.mu.Unlock()
			v := f()
			m.mu.Lock()
			fmt.Fprintf(&b, "%s %g\n", n, v)
			continue
		}
		vals := m.vals[n]
		keys := make([]string, 0, len(vals))
		for k := range vals {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		if len(keys) == 0 {
			fmt.Fprintf(&b, "%s 0\n", n)
		}
		for _, k := range keys {
			if m.labels[n] == "" || k == "" {
				fmt.Fprintf(&b, "%s %g\n", n, vals[k])
			} else {
				fmt.Fprintf(&b, "%s{%s=%q} %g\n", n, m.labels[n], k, vals[k])
			}
		}
	}
	m.mu.Unlock()
	io.WriteString(w, b.String())
}

// Handler serves /metrics.
func (m *M) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		m.Write(w)
	})
}

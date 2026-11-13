// Package metrics keeps counts for an optional localhost-only /metrics endpoint, using the
// Prometheus client library on a private registry. Counts only: no label ever holds an
// address, key or name, just a kind, an error code or a role.
package metrics

import (
	"io"
	"net/http"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	dto "github.com/prometheus/client_model/go"
	"github.com/prometheus/common/expfmt"
)

// M holds the relay's counters (each with at most one label) and its scrape-time gauges.
// A nil *M is valid and records nothing.
type M struct {
	reg    *prometheus.Registry
	mu     sync.Mutex
	plain  map[string]prometheus.Counter
	vecs   map[string]*prometheus.CounterVec
	gauges map[string]prometheus.Collector
	labels map[string]*prometheus.GaugeVec
}

// New makes a private registry with the relay's metrics and the Go runtime and process
// collectors declared. Nothing is registered globally.
func New() *M {
	m := &M{reg: prometheus.NewRegistry(), plain: map[string]prometheus.Counter{},
		vecs: map[string]*prometheus.CounterVec{}, gauges: map[string]prometheus.Collector{},
		labels: map[string]*prometheus.GaugeVec{}}
	m.reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	m.counter("relay_connections_total", "role", "Connections accepted, by role.", "client", "node")
	m.counter("relay_records_in_total", "kind", "Records stored, by kind.")
	m.counter("relay_records_out_total", "", "Records sent to clients and nodes.")
	m.counter("relay_refused_total", "code", "Records and frames refused, by error code.")
	m.counter("relay_syncs_total", "", "Node sync sessions started.")
	m.counter("relay_states_total", "how", "Live states (never stored): taken from clients and nodes, sent to nodes.", "client", "node", "sent")
	m.counter("relay_rank_answers_total", "cache", "Rankings answered, by whether the slice was already worked out for the current state (hit) or not (miss).", "hit", "miss")
	return m
}

// counter declares a counter; with a label, the listed values start at zero so they show
// before the first event.
func (m *M) counter(name, label, help string, zero ...string) {
	opts := prometheus.CounterOpts{Name: name, Help: help}
	if label == "" {
		c := prometheus.NewCounter(opts)
		m.reg.MustRegister(c)
		m.plain[name] = c
		return
	}
	v := prometheus.NewCounterVec(opts, []string{label})
	m.reg.MustRegister(v)
	for _, z := range zero {
		v.WithLabelValues(z)
	}
	m.vecs[name] = v
}

// Add adds to a counter. Undeclared names are ignored; the label is ignored on an
// unlabelled counter.
func (m *M) Add(name, label string, v float64) {
	if m == nil || v < 0 {
		return
	}
	if c, ok := m.plain[name]; ok {
		c.Add(v)
	} else if c, ok := m.vecs[name]; ok {
		c.WithLabelValues(label).Add(v)
	}
}

// Inc adds one.
func (m *M) Inc(name, label string) { m.Add(name, label, 1) }

// Gauge registers a gauge read at scrape time, replacing one of the same name.
func (m *M) Gauge(name, help string, f func() float64) {
	if m == nil {
		return
	}
	g := prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: name, Help: help}, f)
	m.mu.Lock()
	defer m.mu.Unlock()
	if old, ok := m.gauges[name]; ok {
		m.reg.Unregister(old)
	}
	if m.reg.Register(g) == nil {
		m.gauges[name] = g
	}
}

// Set replaces every series of a gauge with one label (an info metric such as a version, or a
// flag such as security): the label values given, nothing else. The label never holds an
// address, key or name.
func (m *M) Set(name, help, label string, values map[string]float64) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.labels[name]
	if !ok {
		v = prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: name, Help: help}, []string{label})
		if m.reg.Register(v) != nil {
			return
		}
		m.labels[name] = v
	}
	v.Reset()
	for l, x := range values {
		v.WithLabelValues(l).Set(x)
	}
}

// Get reads a counter (tests).
func (m *M) Get(name, label string) float64 {
	var c prometheus.Counter
	if p, ok := m.plain[name]; ok {
		c = p
	} else if v, ok := m.vecs[name]; ok {
		c = v.WithLabelValues(label)
	} else {
		return 0
	}
	var d dto.Metric
	if c.Write(&d) != nil {
		return 0
	}
	return d.GetCounter().GetValue()
}

// Write writes everything in the Prometheus text exposition format.
func (m *M) Write(w io.Writer) error {
	mfs, err := m.reg.Gather()
	enc := expfmt.NewEncoder(w, expfmt.NewFormat(expfmt.TypeTextPlain))
	for _, mf := range mfs {
		if e := enc.Encode(mf); e != nil {
			return e
		}
	}
	return err
}

// Handler serves /metrics from the private registry, with no error log (nothing a scrape
// fails on should reach the relay's own log).
func (m *M) Handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{ErrorHandling: promhttp.ContinueOnError})
}

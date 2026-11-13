package relaytest

import (
	"fmt"
	"slices"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

// Listed is a registry server made for a test: its id and operator.
type Listed struct {
	ID string
	Op *fed.Signer
}

// FileFor makes a registry file for a one-operator server; listed and answered are optional.
func FileFor(name string, op, nodeKey *fed.Signer, url string, t int64, listed, answered *int64, noLogs bool) (string, []byte) {
	return FileSync(name, "open", op, nodeKey, url, t, listed, answered, noLogs)
}

// FileSync is FileFor with a sync policy.
func FileSync(name, sync string, op, nodeKey *fed.Signer, url string, t int64, listed, answered *int64, noLogs bool) (string, []byte) {
	g := op.Seal("genesis", t, map[string]any{"name": name, "node": map[string]any{"key": nodeKey.Key, "url": url}})
	gr, code := fed.CheckValue(g, t, fed.Opts{})
	if code != "" {
		panic(code)
	}
	st := &ops.State{Server: gr.ID, Head: gr.ID, Operators: []string{op.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{nodeKey.Key, url})
	srv := ops.ServerRecord(st, op, ops.ServerFields{Name: name, Sync: sync, NoLogs: noLogs, Langs: []string{"en"}}, t)
	f := map[string]any{"v": int64(1), "genesis": g, "chain": []any{}, "server": srv}
	if listed != nil {
		f["listed"] = *listed
	}
	if answered != nil {
		f["answered"] = *answered
	}
	return gr.ID, canon.Encode(f)
}

// Registry builds servers.json with n voters (listed 31 days before asOf, answered at asOf).
func Registry(n int, asOf int64, now int64) ([]byte, []Listed) {
	files := map[string][]byte{}
	var out []Listed
	listed := asOf - 31*fed.Day
	for i := 0; i < n; i++ {
		op := Key(fmt.Sprintf("voter op %d", i))
		nk := Key(fmt.Sprintf("voter node %d", i))
		id, b := FileFor(fmt.Sprintf("Voter %d", i), op, nk, fmt.Sprintf("wss://voter%d.example.org/fed", i), now-40*fed.Day, &listed, &asOf, true)
		files[id+".json"] = b
		out = append(out, Listed{ID: id, Op: op})
	}
	b, skipped := registry.Build(files, now)
	if len(skipped) > 0 {
		panic(fmt.Sprint(skipped))
	}
	return b, out
}

// Snapshot builds servers.json listing running servers (their first node's registry file),
// listed 31 days before asOf (today's day start) and answered at asOf: live. The dead ones last
// answered 15 days before, out of the liveness window.
func (n *Net) Snapshot(servers []*Server, dead ...*Server) []byte {
	n.T.Helper()
	now := n.Clock.Unix()
	asOf := now / fed.Day * fed.Day
	listed := asOf - 31*fed.Day
	files := map[string][]byte{}
	for _, s := range append(slices.Clone(servers), dead...) {
		b, err := s.Nodes[0].R.RegistryFile()
		if err != nil {
			n.T.Fatal(err)
		}
		answered := asOf
		if slices.Contains(dead, s) {
			answered = asOf - 15*fed.Day
		}
		v, _ := canon.ParseStrict(b)
		m := v.(map[string]any)
		m["listed"], m["answered"] = listed, answered
		files[s.ID+".json"] = canon.Encode(m)
	}
	b, skipped := registry.Build(files, now)
	if len(skipped) > 0 {
		n.T.Fatal(fmt.Sprint(skipped))
	}
	return b
}

// SetRegistry gives every node of the servers the same servers.json.
func SetRegistry(t testing.TB, b []byte, servers ...*Server) {
	t.Helper()
	for _, s := range servers {
		for _, x := range s.Nodes {
			if err := x.R.SetRegistry(b); err != nil {
				t.Fatal(err)
			}
		}
	}
}

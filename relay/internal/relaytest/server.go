package relaytest

import (
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
)

// State reads a node's view of its server.
func (x *Node) State() *ops.State {
	st, err := ops.ReadState(x.R.State())
	if err != nil {
		x.Net.T.Fatal(err)
	}
	return st
}

// Put stores a record through the node's command-line path; it returns the error code.
func (x *Node) Put(rec map[string]any) string {
	_, code := x.R.PutValue(rec)
	return code
}

// MustPut stores a record or fails the test.
func (x *Node) MustPut(rec map[string]any) {
	x.Net.T.Helper()
	if code := x.Put(rec); code != "" {
		x.Net.T.Fatalf("put %v on %s: %s", rec["kind"], x.Name, code)
	}
}

// Describe signs a fresh server record at the current head (one operator signs).
func (s *Server) Describe(x *Node, op *fed.Signer) map[string]any {
	x.Net.Clock.Add(time.Second) // a later record, as when an operator runs the command
	st := x.State()
	f := ops.CurrentFields(st)
	return ops.ServerRecord(st, op, f, x.Net.Clock.Unix())
}

// AddNode starts a node that joins the server through its first node, and has the
// (single) operator add it and describe the server again.
func (n *Net) AddNode(s *Server, name string) *Node {
	t := n.T
	t.Helper()
	first := s.Nodes[0]
	x := n.Listen(name)
	cfg := config.Default()
	cfg.Server, cfg.URL, cfg.Seeds, cfg.Registry = s.ID, x.URL, []string{first.URL}, ""
	x.Start(Dir(t), cfg)
	rec, err := ops.Propose(first.State(), s.Op, "add-node", x.Key.Key, x.URL, n.Clock.Unix())
	if err != nil {
		t.Fatal(err)
	}
	first.MustPut(rec)
	first.MustPut(s.Describe(first, s.Op))
	s.Nodes = append(s.Nodes, x)
	Eventually(t, name+" serving", func() bool {
		st, _ := ops.ReadState(x.R.State())
		return st != nil && st.Head == first.State().Head && x.R.State()["serving"] == true
	})
	return x
}

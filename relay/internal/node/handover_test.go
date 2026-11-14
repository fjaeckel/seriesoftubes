package node_test

import (
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// A founder hands the server over: adds ben, then both remove the founder's key. That key (say it
// leaked) was the only operator at genesis, so it can still sign a valid server record there. It
// must neither be taken as a new record nor become the current one (8.2).
func TestRemovedOperatorCannotRedescribeTheServer(t *testing.T) {
	n := rt.New(t)
	s := n.Found("handover", "open")
	x := s.Nodes[0]
	ben := rt.Key("ben")
	p1, _ := ops.Propose(x.State(), s.Op, "add-operator", ben.Key, "", n.Clock.Unix())
	x.MustPut(p1)
	p2 := multi(ben, []*fed.Signer{s.Op, ben}, "operators", n.Clock.Unix(), map[string]any{
		"server": s.ID, "prev": rt.ID(p1), "action": "remove_operator", "target": s.Op.Key})
	x.MustPut(p2)
	x.MustPut(s.Describe(x, ben))
	if st := x.State(); len(st.Operators) != 1 || st.Operators[0] != ben.Key {
		t.Fatalf("operators %v", st.Operators)
	}
	// The old key signs at the genesis head, later than every honest record.
	n.Clock.Add(time.Minute)
	gst := &ops.State{Server: s.ID, Head: s.ID, Operators: []string{s.Op.Key}}
	gst.Nodes = append(gst.Nodes, struct{ Key, URL string }{x.Key.Key, x.URL})
	evil := ops.ServerRecord(gst, s.Op, ops.ServerFields{Name: "Taken", Sync: "standalone", NoLogs: false, Langs: []string{"en"}}, n.Clock.Unix())
	if _, err := x.Client(nil).Put(ctx(t), evil); code(err) != fed.BadChain {
		t.Fatalf("a server record at an old head over wss: %v", err)
	}
	if c := x.Put(evil); c != fed.BadChain {
		t.Fatalf("a server record at an old head from the command line: %q", c)
	}
	if f := ops.CurrentFields(x.State()); f.Name != "handover" || f.Sync != "open" {
		t.Fatalf("current server record taken over: %+v", f)
	}
}

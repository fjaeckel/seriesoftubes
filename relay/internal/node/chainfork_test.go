package node_test

import (
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// A former operator (here the 1-of-1 founder, removed since) signs a fork from genesis that adds
// its own node and gossips it with a fresh server record. Relays that know the server by gossip
// keep the chain they hold; an honest extension is still taken.
func TestCatalogKeepsTheChainItHolds(t *testing.T) {
	n := rt.New(t)
	a := n.Found("listener", "open")
	x := a.Nodes[0]
	carrier := makeServer(t, n, "carrier")
	r := connectAs(t, x, carrier)
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{carrier.entry}}))

	// The server heard about by gossip: anna founds it, adds ben, both remove anna.
	v := makeServer(t, n, "victim")
	anna, ben := rt.Key("op victim"), rt.Key("ben")
	now := n.Clock.Unix()
	url := "wss://victim.example.net/fed"
	p1 := multi(anna, []*fed.Signer{anna}, "operators", now, map[string]any{"server": v.ID, "prev": v.ID, "action": "add_operator", "target": ben.Key})
	p2 := multi(ben, []*fed.Signer{anna, ben}, "operators", now, map[string]any{"server": v.ID, "prev": rt.ID(p1), "action": "remove_operator", "target": anna.Key})
	st := &ops.State{Server: v.ID, Head: rt.ID(p2), Operators: []string{ben.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{v.Node.Key, url})
	entry := func(ch []any, srv map[string]any, seen int64) map[string]any {
		return map[string]any{"genesis": v.entry["genesis"], "chain": ch, "server": srv, "path": []any{v.ID, carrier.ID}, "seen": seen}
	}
	honest := ops.ServerRecord(st, ben, ops.ServerFields{Name: "victim", Sync: "open", NoLogs: true, Langs: []string{"en"}}, now)
	send := func(e map[string]any) {
		r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{e}}))
	}
	nodes := func() []string {
		t.Helper()
		items, err := x.Client(nil).Collect(ctx(t), map[string]any{"m": "servers"})
		if err != nil {
			t.Fatal(err)
		}
		list, _ := items[0]["entries"].([]any)
		for _, e := range list {
			srv, _ := e.(map[string]any)["server"].(map[string]any)
			body, _ := srv["body"].(map[string]any)
			if body["server"] != v.ID {
				continue
			}
			var out []string
			for _, nd := range body["nodes"].([]any) {
				out = append(out, nd.(map[string]any)["url"].(string))
			}
			return out
		}
		return nil
	}
	send(entry([]any{p1, p2}, honest, now))
	rt.Eventually(t, "the honest entry", func() bool { return len(nodes()) == 1 })

	// The fork: anna, operator alone at genesis, adds a node of hers there, with a later record.
	n.Clock.Add(time.Minute)
	later := n.Clock.Unix()
	evilNode := rt.Key("evil node")
	f1 := multi(anna, []*fed.Signer{anna}, "operators", later, map[string]any{"server": v.ID, "prev": v.ID, "action": "set_node", "target": evilNode.Key, "url": "wss://evil.example.net/fed"})
	fst := &ops.State{Server: v.ID, Head: rt.ID(f1), Operators: []string{anna.Key}}
	fst.Nodes = append(fst.Nodes, struct{ Key, URL string }{v.Node.Key, url})
	fst.Nodes = append(fst.Nodes, struct{ Key, URL string }{evilNode.Key, "wss://evil.example.net/fed"})
	if evilNode.Key < v.Node.Key {
		fst.Nodes[0], fst.Nodes[1] = fst.Nodes[1], fst.Nodes[0]
	}
	forged := ops.ServerRecord(fst, anna, ops.ServerFields{Name: "victim", Sync: "open", NoLogs: true, Langs: []string{"en"}}, later)
	send(entry([]any{f1}, forged, later))
	// Frames are handled in order: once an entry sent after the fork is in, the fork was handled.
	marker := makeServer(t, n, "marker")
	send(marker.via(carrier.ID))
	rt.Eventually(t, "the entry after the fork", func() bool { return catalogIDs(t, x)[marker.ID] })
	if got := nodes(); len(got) != 1 || got[0] != url {
		t.Fatalf("the fork replaced the chain held: nodes %v", got)
	}
	if x.R.Status()["catalogForks"] != 1 {
		t.Fatalf("forks counted: %v", x.R.Status()["catalogForks"])
	}
	// The honest operators extend the chain: that is taken.
	n.Clock.Add(time.Minute)
	p3 := multi(ben, []*fed.Signer{ben}, "operators", n.Clock.Unix(), map[string]any{"server": v.ID, "prev": rt.ID(p2), "action": "set_node", "target": v.Node.Key, "url": "wss://victim2.example.net/fed"})
	st.Head = rt.ID(p3)
	st.Nodes[0].URL = "wss://victim2.example.net/fed"
	send(entry([]any{p1, p2, p3}, ops.ServerRecord(st, ben, ops.ServerFields{Name: "victim", Sync: "open", NoLogs: true, Langs: []string{"en"}}, n.Clock.Unix()), n.Clock.Unix()))
	rt.Eventually(t, "the extension", func() bool { got := nodes(); return len(got) == 1 && got[0] == "wss://victim2.example.net/fed" })
	// The previous entry again (a prefix of the chain held), however fresh, changes nothing.
	n.Clock.Add(time.Minute)
	send(entry([]any{p1, p2}, ops.ServerRecord(&ops.State{Server: v.ID, Head: rt.ID(p2), Operators: []string{ben.Key},
		Nodes: []struct{ Key, URL string }{{v.Node.Key, url}}}, ben, ops.ServerFields{Name: "victim", Sync: "open", NoLogs: true, Langs: []string{"en"}}, n.Clock.Unix()), n.Clock.Unix()))
	marker2 := makeServer(t, n, "marker 2")
	send(marker2.via(carrier.ID))
	rt.Eventually(t, "the entry after the old one", func() bool { return catalogIDs(t, x)[marker2.ID] })
	if got := nodes(); len(got) != 1 || got[0] != "wss://victim2.example.net/fed" {
		t.Fatalf("an older chain replaced the one held: nodes %v", got)
	}
}

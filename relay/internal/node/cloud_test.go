package node_test

import (
	"slices"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// An announce with cloud fields (5.1): a Hyperscaler's on-ramp card and how it takes on-ramp requests.
func cloudAnnounce(k *fed.Signer, t int64, name string) map[string]any {
	a := rt.Announce(k, t, name)
	body := a["body"].(map[string]any)
	body["rates"] = map[string]any{"onramp": map[string]any{
		"at": []any{"fra"}, "ports": []any{map[string]any{"mbps": int64(10000), "monthly": int64(2500)}}, "term": int64(90)}}
	body["auto"].(map[string]any)["onramp"] = "auto"
	return k.Seal("announce", t, body)
}

// Records with cloud fields go only to games and nodes that list cloud in feats (9.3, 9.4), by fetch
// and in a backlog alike; a game that lists ix2 alone (before cloud deals) still gets the rest.
func TestCloudOnlyToThoseWhoTakeIt(t *testing.T) {
	n := rt.New(t)
	s := n.Found("clouds", "open")
	x := s.Nodes[0]
	now := n.Clock.Unix()
	alice, bob := rt.Key("alice"), rt.Key("bob")
	newer, older := x.Client(nil), x.ClientFeats(nil, []string{wire.FeatIx2})
	if !slices.Contains(newer.Welcome.Feats, wire.FeatCloud) {
		t.Fatalf("welcome feats %v, want cloud", newer.Welcome.Feats)
	}
	ramp, plain := cloudAnnounce(alice, now, "Cloudy McCloudface"), rt.Announce(bob, now, "Hop Shop")
	if !fed.Cloud(mustRecord(t, ramp)) || fed.Cloud(mustRecord(t, plain)) || fed.Ix2(mustRecord(t, ramp)) {
		t.Fatal("Cloud tells them apart")
	}
	x.MustPut(ramp)
	x.MustPut(plain)
	sigs := func(items []map[string]any) []string {
		var out []string
		for _, it := range items {
			out = append(out, it["rec"].(map[string]any)["sig"].(string))
		}
		slices.Sort(out)
		return out
	}
	both, onlyPlain := sigs([]map[string]any{{"rec": ramp}, {"rec": plain}}), sigs([]map[string]any{{"rec": plain}})
	for _, c := range []struct {
		name string
		want []string
		get  func(m map[string]any) ([]map[string]any, error)
	}{{"newer", both, func(m map[string]any) ([]map[string]any, error) { return newer.Collect(ctx(t), m) }},
		{"older", onlyPlain, func(m map[string]any) ([]map[string]any, error) { return older.Collect(ctx(t), m) }}} {
		got, err := c.get(map[string]any{"m": "fetch", "ids": []any{rt.ID(ramp), rt.ID(plain)}})
		if err != nil {
			t.Fatal(err)
		}
		if g := sigs(got); !slices.Equal(g, c.want) {
			t.Fatalf("%s fetch: %d records", c.name, len(g))
		}
		got, err = c.get(map[string]any{"m": "sub", "kinds": []any{"announce"}, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		if g := sigs(got); !slices.Equal(g, c.want) {
			t.Fatalf("%s backlog: %d records", c.name, len(g))
		}
	}
}

// Between nodes the same: a node that lists ix2 but not cloud (an older relay of the same server, in
// a rolling upgrade) never gets a record with cloud fields.
func TestCloudBetweenNodes(t *testing.T) {
	n := rt.New(t)
	s := n.Found("rolling", "standalone")
	n1 := s.Nodes[0]
	n.Feats = []string{wire.Feat, wire.FeatIx2}
	old := n.AddNode(s, "rolling-old")
	n.Feats = nil
	cur := n.AddNode(s, "rolling-new")
	now := n.Clock.Unix()
	ramp, plain := cloudAnnounce(rt.Key("alice"), now, "Cloudy McCloudface"), rt.Announce(rt.Key("bob"), now, "Hop Shop")
	n1.MustPut(ramp)
	n1.MustPut(plain)
	rt.Eventually(t, "the plain announce on the older node", func() bool { return old.Has(rt.ID(plain)) })
	rt.Eventually(t, "both on the newer node", func() bool { return cur.Has(rt.ID(plain)) && cur.Has(rt.ID(ramp)) })
	time.Sleep(300 * time.Millisecond)
	if old.Has(rt.ID(ramp)) {
		t.Fatal("the older node got a record with cloud fields")
	}
}

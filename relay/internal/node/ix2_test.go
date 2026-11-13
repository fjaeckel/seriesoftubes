package node_test

import (
	"slices"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// An announce with ix2 fields (5.1): an exchange's members and auto.cofound.
func ix2Announce(k *fed.Signer, t int64, name string) map[string]any {
	a := rt.Announce(k, t, name)
	body := a["body"].(map[string]any)
	body["ix"] = []any{"fra"}
	body["rates"] = map[string]any{"ix": map[string]any{
		"ports": []any{map[string]any{"mbps": int64(1000), "monthly": int64(200)}}, "join": "anyone", "at": []any{"fra"},
		"members": []any{map[string]any{"at": "fra", "nets": []any{"cog", "ntt"}, "players": int64(2)}}}}
	body["auto"].(map[string]any)["cofound"] = "review"
	body["auto"].(map[string]any)["port"] = "auto"
	return k.Seal("announce", t, body)
}

// Records with ix2 fields go only to games and nodes that list ix2 in feats (9.3, 9.4): an older
// game or relay refuses those fields, so it never gets them, live, by fetch or in a backlog. What
// it can read still reaches it.
func TestIx2OnlyToThoseWhoTakeIt(t *testing.T) {
	n := rt.New(t)
	s := n.Found("rollout", "open")
	x := s.Nodes[0]
	now := n.Clock.Unix()
	alice, bob := rt.Key("alice"), rt.Key("bob")

	newer, older := x.Client(nil), x.ClientFeats(nil, []string{})
	if !slices.Contains(newer.Welcome.Feats, wire.FeatIx2) || !slices.Contains(newer.Welcome.Feats, wire.Feat) {
		t.Fatalf("welcome feats %v, want state and ix2", newer.Welcome.Feats)
	}
	kinds := []any{"announce"}
	_, newCh, err := newer.Start(ctx(t), map[string]any{"m": "sub", "kinds": kinds, "since": ""})
	if err != nil {
		t.Fatal(err)
	}
	_, oldCh, err := older.Start(ctx(t), map[string]any{"m": "sub", "kinds": kinds, "since": ""})
	if err != nil {
		t.Fatal(err)
	}
	for _, ch := range []<-chan *wire.Frame{newCh, oldCh} {
		select { // the (empty) backlog
		case <-ch:
		case <-time.After(5 * time.Second):
			t.Fatal("no backlog")
		}
	}

	members := ix2Announce(alice, now, "Ping Floyd")
	plain := rt.Announce(bob, now, "Hop Shop")
	if !fed.Ix2(mustRecord(t, members)) || fed.Ix2(mustRecord(t, plain)) {
		t.Fatal("Ix2 tells them apart")
	}
	x.MustPut(members)
	x.MustPut(plain)
	ids := []any{rt.ID(members), rt.ID(plain)}

	sigs := func(items []map[string]any) []string {
		var out []string
		for _, it := range items {
			out = append(out, it["rec"].(map[string]any)["sig"].(string))
		}
		slices.Sort(out)
		return out
	}
	both, onlyPlain := sigs([]map[string]any{{"rec": members}, {"rec": plain}}), sigs([]map[string]any{{"rec": plain}})
	live := func(ch <-chan *wire.Frame, want int) []map[string]any {
		t.Helper()
		var got []map[string]any
		deadline := time.After(5 * time.Second)
		for len(got) < want {
			select {
			case f := <-ch:
				for _, it := range f.Raw["items"].([]any) {
					got = append(got, it.(map[string]any))
				}
			case <-deadline:
				t.Fatalf("got %d live records, want %d", len(got), want)
			}
		}
		time.Sleep(100 * time.Millisecond)
		for len(ch) > 0 {
			for _, it := range (<-ch).Raw["items"].([]any) {
				got = append(got, it.(map[string]any))
			}
		}
		return got
	}
	if g := sigs(live(newCh, 2)); !slices.Equal(g, both) {
		t.Fatalf("a game that takes ix2 got %d live records, want both", len(g))
	}
	if g := sigs(live(oldCh, 1)); !slices.Equal(g, onlyPlain) {
		t.Fatalf("an older game got %d live records, want only the plain announce", len(g))
	}
	for _, c := range []struct {
		name string
		want []string
		get  func(m map[string]any) ([]map[string]any, error)
	}{{"newer", both, func(m map[string]any) ([]map[string]any, error) { return newer.Collect(ctx(t), m) }},
		{"older", onlyPlain, func(m map[string]any) ([]map[string]any, error) { return older.Collect(ctx(t), m) }}} {
		got, err := c.get(map[string]any{"m": "fetch", "ids": ids})
		if err != nil {
			t.Fatal(err)
		}
		if g := sigs(got); !slices.Equal(g, c.want) {
			t.Fatalf("%s fetch: %d records", c.name, len(g))
		}
		got, err = c.get(map[string]any{"m": "sub", "kinds": kinds, "since": ""})
		if err != nil {
			t.Fatal(err)
		}
		if g := sigs(got); !slices.Equal(g, c.want) {
			t.Fatalf("%s backlog: %d records", c.name, len(g))
		}
	}
}

// Between nodes the same: a node that does not list ix2 (a 4.0 relay, here of the same server, as
// in a rolling upgrade) gets neither inventory nor pushes of ix2 records; a node that lists it gets
// everything.
func TestIx2BetweenNodes(t *testing.T) {
	n := rt.New(t)
	s := n.Found("rolling", "standalone")
	n1 := s.Nodes[0]
	n.Feats = []string{wire.Feat}
	old := n.AddNode(s, "rolling-old")
	n.Feats = nil
	cur := n.AddNode(s, "rolling-new")
	now := n.Clock.Unix()
	alice, bob := rt.Key("alice"), rt.Key("bob")
	members, plain := ix2Announce(alice, now, "Ping Floyd"), rt.Announce(bob, now, "Hop Shop")
	n1.MustPut(members)
	n1.MustPut(plain)
	rt.Eventually(t, "the plain announce on the older node", func() bool { return old.Has(rt.ID(plain)) })
	rt.Eventually(t, "both on the newer node", func() bool { return cur.Has(rt.ID(plain)) && cur.Has(rt.ID(members)) })
	time.Sleep(300 * time.Millisecond)
	if old.Has(rt.ID(members)) {
		t.Fatal("the older node got a record with ix2 fields")
	}
}

func mustRecord(t *testing.T, m map[string]any) *fed.Record {
	t.Helper()
	r, code := fed.CheckValue(m, rt.Start+1e9, fed.Opts{Trusted: true})
	if code != "" {
		t.Fatal(code)
	}
	return r
}

package node_test

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// The authority (FEDERATION-PROTOCOL.md 11.5, ADR 0006): seriesoftub.es's signed bans and the oldest relay allowed.

var authKey = rt.Key("seriesoftub.es authority")

// authFile is an authority file signed at t: nets and servers banned for abuse, relayMin from from ("" for none).
func authFile(t int64, relayMin string, from int64, nets, servers []string) []byte {
	slices.Sort(nets)
	slices.Sort(servers)
	n, s := []any{}, []any{}
	for _, k := range nets {
		n = append(n, map[string]any{"key": k, "reason": "abuse"})
	}
	for _, id := range servers {
		s = append(s, map[string]any{"id": id, "reason": "legal"})
	}
	body := map[string]any{"nets": n, "servers": s}
	if relayMin != "" {
		body["relayMin"], body["relayMinFrom"] = relayMin, from
	}
	return canon.Encode(authKey.Seal("authority", t, body))
}

func authNet(t *testing.T) *rt.Net {
	n := rt.New(t)
	n.AuthorityKeys = []string{authKey.Key}
	return n
}

func TestAuthorityBansNetwork(t *testing.T) {
	n := authNet(t)
	a := n.Found("banner", "open")
	x := a.Nodes[0]
	mallory, alice := rt.Key("mallory"), rt.Key("alice")
	now := n.Clock.Unix()
	old := rt.Announce(mallory, now, "Spam Spam")
	x.MustPut(old)
	x.MustPut(rt.Announce(alice, now, "Alice"))
	c := x.Client(nil)
	if _, err := c.Auth(ctx(t), mallory, now); err != nil {
		t.Fatalf("auth before the ban: %v", err)
	}

	// A file signed by a key that is not pinned changes nothing.
	if x.R.SetAuthority(canon.Encode(rt.Key("impostor").Seal("authority", now, map[string]any{"nets": []any{map[string]any{"key": mallory.Key, "reason": "abuse"}}, "servers": []any{}}))) {
		t.Fatal("took a file from an unpinned key")
	}
	if x.Count("announce") != 2 {
		t.Fatal("an unpinned file removed records")
	}

	if !x.R.SetAuthority(authFile(now, "", 0, []string{mallory.Key}, nil)) {
		t.Fatal("authority not taken")
	}
	rt.Eventually(t, "the banned network's session is closed", func() bool { _, err := c.Collect(ctx(t), map[string]any{"m": "servers"}); return err != nil })
	if x.Has(rt.ID(old)) || x.Count("announce") != 1 {
		t.Fatal("the banned network's records are still held")
	}
	n.Clock.Add(time.Second)
	if code := x.Put(rt.Announce(mallory, n.Clock.Unix(), "Back again")); code != fed.Banned {
		t.Fatalf("banned network's new record: %q", code)
	}
	if code := x.Put(rt.Stats(alice, n.Clock.Unix(), 1, false)); code != "" {
		t.Fatalf("someone else's record: %q", code)
	}
	if st := x.R.Status()["authority"].(map[string]any); st["nets"] != 1 {
		t.Fatalf("status: %v", st)
	}

	// An older file never undoes a newer one; the file is kept across a restart.
	if x.R.SetAuthority(authFile(now-60, "", 0, nil, nil)) {
		t.Fatal("an older file replaced a newer one")
	}
	if b, err := os.ReadFile(filepath.Join(x.Dir, "authority.json")); err != nil || !bytes.Contains(b, []byte(mallory.Key)) {
		t.Fatalf("authority.json not kept: %v", err)
	}
	x.Restart()
	n.Clock.Add(time.Second)
	if code := x.Put(rt.Announce(mallory, n.Clock.Unix(), "After restart")); code != fed.Banned {
		t.Fatalf("after a restart: %q", code)
	}
}

func TestAuthorityFileBesideRegistry(t *testing.T) {
	n := authNet(t)
	a := n.Found("reader", "open")
	x := a.Nodes[0]
	mallory := rt.Key("mallory")
	dir := withFeed(t, x, "", nil)
	if err := os.WriteFile(filepath.Join(dir, "authority.json"), authFile(n.Clock.Unix(), "", 0, []string{mallory.Key}, nil), 0o600); err != nil {
		t.Fatal(err)
	}
	x.R.CheckUpdate()
	if code := x.Put(rt.Announce(mallory, n.Clock.Unix(), "Mallory")); code != fed.Banned {
		t.Fatalf("authority.json beside the registry not read: %q", code)
	}
}

func TestAuthorityCutsBannedAndOutdatedServers(t *testing.T) {
	n := authNet(t)
	n.Release = "5.2.0"
	a := n.Found("current-a", "open")
	b := n.Found("current-b", "open")
	n.Release = "5.1.0"
	c := n.Found("behind", "open")
	neighbours(a, b, c)
	fromB, fromC := announce(t, b, "bee"), announce(t, c, "sea")
	rt.Eventually(t, "everyone syncs before the authority", func() bool { return a.Nodes[0].Has(fromB) && a.Nodes[0].Has(fromC) })

	// relayMin 5.2.0 from a minute ahead: nothing changes yet.
	now := n.Clock.Unix()
	file := authFile(now, "5.2.0", now+60, nil, []string{b.ID})
	for _, s := range []*rt.Server{a, b, c} {
		s.Nodes[0].R.SetAuthority(file)
	}
	peers := func(s *rt.Server) []string {
		var out []string
		for _, p := range s.Nodes[0].R.Status()["peers"].([]map[string]any) {
			out = append(out, p["server"].(string))
		}
		return out
	}
	rt.Eventually(t, "the banned server is cut off at once", func() bool { return !slices.Contains(peers(a), b.ID) })
	if !slices.Contains(peers(a), c.ID) {
		t.Fatal("an older relay was cut off before relayMinFrom")
	}
	// The clock passes relayMinFrom; the next check of the file applies it.
	n.Clock.Add(2 * time.Minute)
	a.Nodes[0].R.SetAuthority(file)
	rt.Eventually(t, "the out-of-date relay is cut off", func() bool { return !slices.Contains(peers(a), c.ID) })
	n.Clock.Add(time.Second)
	later := announce(t, c, "sea again")
	time.Sleep(500 * time.Millisecond)
	if a.Nodes[0].Has(later) {
		t.Fatal("an out-of-date relay's records still arrive")
	}
	if cat, _ := json.Marshal(catalogOf(t, a.Nodes[0])); bytes.Contains(cat, []byte(b.ID)) {
		t.Fatal("the banned server is still in the catalog")
	}
	if !strings.Contains(c.Nodes[0].Log.String(), "relay out of date") {
		t.Fatalf("the out-of-date relay's operators were not told:\n%s", c.Nodes[0].Log.String())
	}
	if says, _ := c.Nodes[0].R.Status()["authority"].(map[string]any)["says"].(string); !strings.Contains(says, "Update it") {
		t.Fatalf("status of the out-of-date relay: %q", says)
	}
}

// The pinned keys the relay embeds are federation/authority-keys.json.
func TestAuthorityKeysMatchFederation(t *testing.T) {
	a, err := os.ReadFile(filepath.Join("..", "..", "..", "federation", "authority-keys.json"))
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join("..", "authority", "keys.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("relay/internal/authority/keys.json differs from federation/authority-keys.json: run node scripts/authority.js --keygen, never edit one alone")
	}
}

// Relays pass the authority file to each other (11.5): a ban pushed into one relay reaches relays two hops away in
// seconds, without the site. A relay that does not list the authority feature is never sent it.
func TestAuthorityTravelsBetweenRelays(t *testing.T) {
	n := authNet(t)
	a := n.Found("first", "open")
	b := n.Found("middle", "open")
	c := n.Found("far", "open")
	n.Feats = []string{wire.Feat, wire.FeatIx2, wire.FeatCloud} // an older relay: no authority feature
	old := n.Found("older", "open")
	n.Feats = nil
	neighbours(a, b)
	neighbours(b, c, old)
	fromC, fromOld := announce(t, c, "sea"), announce(t, old, "old")
	rt.Eventually(t, "the chain syncs", func() bool { return a.Nodes[0].Has(fromC) && a.Nodes[0].Has(fromOld) })

	mallory := rt.Key("mallory")
	taken, code := a.Nodes[0].R.PushAuthority(authFile(n.Clock.Unix(), "", 0, []string{mallory.Key}, nil))
	if !taken || code != "" {
		t.Fatalf("push: %v %q", taken, code)
	}
	rt.Eventually(t, "two hops away, the ban arrived", func() bool {
		return c.Nodes[0].Put(rt.Announce(mallory, n.Clock.Unix(), "Mallory")) == fed.Banned
	})
	if _, err := os.Stat(filepath.Join(c.Nodes[0].Dir, "authority.json")); err != nil {
		t.Fatalf("kept two hops away: %v", err)
	}
	time.Sleep(300 * time.Millisecond)
	if _, err := os.Stat(filepath.Join(old.Nodes[0].Dir, "authority.json")); err == nil {
		t.Fatal("sent to a relay that does not take it")
	}
	if strings.Contains(b.Nodes[0].Log.String(), "code=bad_frame") || strings.Contains(old.Nodes[0].Log.String(), "code=bad_frame") {
		t.Fatal("the authority message broke a session")
	}
	// The same file again changes nothing and goes nowhere.
	if taken, code := a.Nodes[0].R.PushAuthority(authFile(n.Clock.Unix(), "", 0, []string{mallory.Key}, nil)); taken || code != "not_newer" {
		t.Fatalf("same file: %v %q", taken, code)
	}
	// A relay that starts later gets it when its session with a holder comes up.
	d := n.Found("late", "open")
	neighbours(d, c)
	ok := false
	for i := 0; i < 100 && !ok; i++ {
		ok = d.Nodes[0].Put(rt.Announce(mallory, n.Clock.Unix(), "Mallory")) == fed.Banned
		time.Sleep(100 * time.Millisecond)
	}
	if !ok {
		t.Fatalf("a late relay did not get it on connect:\n%s", d.Nodes[0].Log.String())
	}
}

// Anyone may hand any relay the file over wss:// (relay authority push --via): the signature is the authority.
func TestAuthorityPushedByAClient(t *testing.T) {
	n := authNet(t)
	a := n.Found("open-door", "open")
	x := a.Nodes[0]
	mallory := rt.Key("mallory")
	c := x.Client(nil)
	f, err := c.Request(ctx(t), map[string]any{"m": "authority", "file": string(authFile(n.Clock.Unix(), "", 0, []string{mallory.Key}, nil))})
	if err != nil || f.Raw["taken"] != true {
		t.Fatalf("push: %v %v", err, f)
	}
	if code := x.Put(rt.Announce(mallory, n.Clock.Unix(), "Mallory")); code != fed.Banned {
		t.Fatalf("after a client's push: %q", code)
	}
	forged := canon.Encode(rt.Key("impostor").Seal("authority", n.Clock.Unix()+1, map[string]any{"nets": []any{}, "servers": []any{}}))
	if _, err := c.Request(ctx(t), map[string]any{"m": "authority", "file": string(forged)}); code(err) != fed.NotAuthority {
		t.Fatalf("an impostor's file: %v", err)
	}
	if code := x.Put(rt.Announce(mallory, n.Clock.Unix(), "Mallory")); code != fed.Banned {
		t.Fatal("an impostor's file undid the ban")
	}
}

// The site's file ends in a newline: a frame's string cannot carry it, so relays trim it before keeping or passing it.
func TestAuthorityWithTrailingNewlineTravels(t *testing.T) {
	n := authNet(t)
	a := n.Found("first", "open")
	b := n.Found("far", "open")
	neighbours(a, b)
	from := announce(t, b, "sea")
	rt.Eventually(t, "the pair syncs", func() bool { return a.Nodes[0].Has(from) })

	mallory := rt.Key("mallory")
	file := append(authFile(n.Clock.Unix(), "", 0, []string{mallory.Key}, nil), '\n')
	if taken, code := a.Nodes[0].R.PushAuthority(file); !taken || code != "" {
		t.Fatalf("push: %v %q", taken, code)
	}
	rt.Eventually(t, "the ban arrived", func() bool {
		return b.Nodes[0].Put(rt.Announce(mallory, n.Clock.Unix(), "Mallory")) == fed.Banned
	})
	time.Sleep(300 * time.Millisecond)
	for _, x := range []*rt.Node{a.Nodes[0], b.Nodes[0]} {
		if l := x.Log.String(); strings.Contains(l, "bad_json") || strings.Contains(l, "session down") {
			t.Fatalf("the authority message broke a session:\n%s", l)
		}
	}
	if taken, code := a.Nodes[0].R.PushAuthority(file); taken || code != "not_newer" {
		t.Fatalf("same file: %v %q", taken, code)
	}
}

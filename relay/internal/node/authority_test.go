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

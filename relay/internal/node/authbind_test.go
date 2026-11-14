package node_test

import (
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// A bound auth (9.3) names the session's welcome nonce and the URL the game dialled, so a server a
// game talks to cannot pass its auth on to another server's node.
func TestBoundAuth(t *testing.T) {
	n := rt.New(t)
	a := n.Found("victim", "open")
	m := n.Found("middle", "open")
	x, y := a.Nodes[0], m.Nodes[0]
	c, other := x.Client(nil), x.Client(nil)
	if c.Welcome.Nonce == "" || other.Welcome.Nonce == "" || c.Welcome.Nonce == other.Welcome.Nonce {
		t.Fatalf("welcome nonces %q %q: each client session gets its own", c.Welcome.Nonce, other.Welcome.Nonce)
	}
	now := n.Clock.Unix()
	k := rt.Key("carol")
	bad := func(nonce, url, want string) {
		t.Helper()
		m := map[string]any{"m": "auth", "key": k.Key, "t": now, "url": url, "sig": k.AuthBound(x.Key.Key, a.ID, now, nonce, url)}
		if _, err := c.Request(ctx(t), m); code(err) != want {
			t.Fatalf("nonce %q url %q: %v, want %s", nonce, url, err, want)
		}
	}
	// Relayed: signed with this session's nonce but for the middle server's URL, which the game dialled.
	bad(c.Welcome.Nonce, y.URL, fed.BadSig)
	// Replayed from another session.
	bad(other.Welcome.Nonce, x.URL, fed.BadSig)
	bad(c.Welcome.Nonce, x.URL, "")
	if _, err := c.Auth(ctx(t), rt.Key("dave"), now); err != nil {
		t.Fatalf("the client's own bound auth: %v", err)
	}
	// legacyAuth (default on) still takes the older form; switched off, only bound auth is taken.
	legacy := map[string]any{"m": "auth", "key": k.Key, "t": now, "sig": k.Auth(x.Key.Key, a.ID, now)}
	if _, err := other.Request(ctx(t), legacy); err != nil {
		t.Fatalf("legacy auth: %v", err)
	}
	off := false
	cfg := *x.Cfg
	cfg.LegacyAuth = &off
	x.Cfg = &cfg
	x.R.Reload(&cfg)
	if _, err := other.Request(ctx(t), legacy); code(err) != fed.BadSig {
		t.Fatalf("legacy auth with legacyAuth off: %v", err)
	}
	if _, err := other.Auth(ctx(t), k, now); err != nil {
		t.Fatalf("bound auth with legacyAuth off: %v", err)
	}
}

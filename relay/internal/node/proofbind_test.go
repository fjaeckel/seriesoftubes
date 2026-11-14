package node_test

import (
	"context"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// wsConn is a raw connection to a node, for handshakes the client package never makes.
type wsConn struct {
	t   *testing.T
	ctx context.Context
	c   *websocket.Conn
}

func dialWS(t *testing.T, n *rt.Net, url string) *wsConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	c, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPClient: n.HTTP, Subprotocols: []string{fed.Subprotocol}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.CloseNow() })
	return &wsConn{t, ctx, c}
}

func (w *wsConn) send(m map[string]any) {
	if err := w.c.Write(w.ctx, websocket.MessageText, canon.Encode(m)); err != nil {
		w.t.Fatal(err)
	}
}

// next reads frames until one that is not a ping (or the connection ends: nil).
func (w *wsConn) next() *wire.Frame {
	for {
		_, b, err := w.c.Read(w.ctx)
		if err != nil {
			return nil
		}
		f, werr := wire.Parse(b, fed.NodeFrame)
		if werr != nil {
			w.t.Fatal(werr.Code)
		}
		if f.M != "ping" {
			return f
		}
	}
}

// refused reads until an err frame or the end, and reports the error code ("" when the session
// went on: something other than err arrived).
func (w *wsConn) refused() (string, bool) {
	for {
		f := w.next()
		if f == nil {
			return "closed", true
		}
		if f.M == "err" {
			c, _ := f.Str("code")
			return c, true
		}
		if f.M == "carry" || f.M == "catalog" || f.M == "inv" {
			return "", false
		}
	}
}

// A node's proofs must be no good for passing as that node (6.2): an attacker who claims to be a
// node of the server, then has a real node sign the challenge (as a client's challenge, or in a
// welcome), must be refused.
func TestHandshakeProofsCannotBeRelayed(t *testing.T) {
	n := rt.New(t)
	s := n.Found("bound", "open")
	x := s.Nodes[0]
	own := s.ID

	// An unbound hello that claims this server is refused before any proof is made.
	a := dialWS(t, n, x.URL)
	a.send(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node", "server": own, "node": x.Key.Key, "nonce": fed.Encode(make([]byte, 32))})
	if code, _ := a.refused(); code != fed.BadChallenge {
		t.Fatalf("unbound sibling hello: %q", code)
	}

	relay := func(t *testing.T, get func(nonce string) any) {
		t.Helper()
		v := dialWS(t, n, x.URL)
		v.send(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node", "server": own, "node": x.Key.Key,
			"nonce": fed.Encode(make([]byte, 32)), "feats": []any{fed.FeatBind}})
		w := v.next()
		if w == nil || w.M != "welcome" {
			t.Fatalf("no welcome: %+v", w)
		}
		theirs, _ := w.Str("nonce")
		v.send(map[string]any{"m": "proof", "proof": get(theirs)})
		if code, refused := v.refused(); !refused || code == "" {
			t.Fatalf("a relayed proof was taken")
		}
	}

	t.Run("client challenge", func(t *testing.T) {
		relay(t, func(nonce string) any {
			c := dialWS(t, n, x.URL)
			c.send(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "client"})
			if w := c.next(); w == nil || w.M != "welcome" {
				t.Fatalf("client welcome: %+v", w)
			}
			c.send(map[string]any{"m": "challenge", "id": int64(1), "nonce": nonce})
			for {
				f := c.next()
				if f == nil {
					t.Fatal("no proof")
				}
				if f.M == "proof" {
					v, _ := canon.Check(f.Raw["proof"])
					return v
				}
			}
		})
	})
	t.Run("welcome of another handshake", func(t *testing.T) {
		relay(t, func(nonce string) any {
			c := dialWS(t, n, x.URL)
			// Claim to be the very node the first session claims, so the welcome is bound to it.
			c.send(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node", "server": own, "node": x.Key.Key,
				"nonce": nonce, "feats": []any{fed.FeatBind}})
			w := c.next()
			if w == nil || w.M != "welcome" {
				t.Fatalf("no welcome: %+v", w)
			}
			v, _ := canon.Check(w.Raw["proof"])
			return v
		})
	})
}

func TestBoundProofs(t *testing.T) {
	k, other := rt.Key("node"), rt.Key("other")
	srv := fed.Encode(make([]byte, 32))
	nonce := fed.Encode([]byte("0123456789abcdef0123456789abcdef"))
	now := int64(1767225600)
	enc := func(m map[string]any) any { p, _ := canon.Parse(canon.Encode(m)); v, _ := canon.Check(p); return v }
	bound := enc(k.MakeBoundProof(nonce, srv, other.Key, fed.RoleCall, now))
	plain := enc(k.MakeProof(nonce, srv, now))
	cases := []struct {
		name string
		got  string
		want string
	}{
		{"bound, right checker and role", fed.CheckNodeProof(bound, nonce, srv, k.Key, now, other.Key, fed.RoleCall, false), ""},
		{"bound, other role", fed.CheckNodeProof(bound, nonce, srv, k.Key, now, other.Key, fed.RoleAnswer, true), fed.BadChallenge},
		{"bound, other checker", fed.CheckNodeProof(bound, nonce, srv, k.Key, now, k.Key, fed.RoleCall, true), fed.BadChallenge},
		{"bound, as a client challenge", fed.CheckProof(bound, nonce, srv, k.Key, now), fed.BadChallenge},
		{"unbound where binding is required", fed.CheckNodeProof(plain, nonce, srv, k.Key, now, other.Key, fed.RoleCall, false), fed.BadChallenge},
		{"unbound from a legacy peer", fed.CheckNodeProof(plain, nonce, srv, k.Key, now, other.Key, fed.RoleCall, true), ""},
		{"unbound client challenge", fed.CheckProof(plain, nonce, srv, k.Key, now), ""},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, c.got, c.want)
		}
	}
}

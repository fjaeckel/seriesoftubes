package node_test

import (
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// impersonate claims to be s's first node at x with an unbound (legacy) hello, and has the real
// node sign x's nonce as a game's challenge. It returns the connection, or nil and the code when
// x refused before the proof.
func impersonate(t *testing.T, n *rt.Net, x *rt.Node, s *rt.Server) (*wsConn, string) {
	t.Helper()
	sx := s.Nodes[0]
	w := dialWS(t, n, x.URL)
	w.send(map[string]any{"m": "hello", "vers": []any{int64(fed.Version)}, "role": "node", "server": s.ID, "node": sx.Key.Key,
		"nonce": fed.Encode(make([]byte, 32))})
	f := w.next()
	if f == nil {
		return nil, "closed"
	}
	if f.M == "err" {
		c, _ := f.Str("code")
		return nil, c
	}
	theirs, _ := f.Str("nonce")
	pf, err := sx.Client(nil).Request(ctx(t), map[string]any{"m": "challenge", "nonce": theirs})
	if err != nil {
		t.Fatal(err)
	}
	pv, _ := canon.Check(pf.Raw["proof"])
	w.send(map[string]any{"m": "proof", "proof": pv})
	return w, ""
}

// An unbound proof is refused for a registry server's node: every relay that can be listed binds.
func TestUnboundProofRefusedForRegistryServer(t *testing.T) {
	n := rt.New(t)
	v := n.Found("victim", "open")
	s := n.Found("honest", "open")
	rt.SetRegistry(t, n.Snapshot([]*rt.Server{v, s}), v)
	if w, code := impersonate(t, n, v.Nodes[0], s); w != nil || code != fed.BadChallenge {
		t.Fatalf("unbound hello for a registry server: %q, want %s", code, fed.BadChallenge)
	}
	if v.Nodes[0].R.UnboundSessions(s.ID) != 0 {
		t.Fatal("the impersonator has a session")
	}
}

// Once a server's nodes have bound their proofs in a session, an unbound proof is refused for it.
func TestUnboundProofRefusedOnceServerBound(t *testing.T) {
	n := rt.New(t)
	v := n.Found("victim", "open")
	s := n.Found("honest", "open")
	neighbours(s, v)
	rt.Eventually(t, "a bound session", func() bool { up, b := v.Nodes[0].R.PeerSession(s.ID, s.Nodes[0].Key.Key); return up && b })
	if w, code := impersonate(t, n, v.Nodes[0], s); w != nil || code != fed.BadChallenge {
		t.Fatalf("unbound hello for a server that binds: %q, want %s", code, fed.BadChallenge)
	}
}

// A session proved with an unbound proof never keeps the real server out: this node still dials
// it, and the bound session closes the unbound one.
func TestUnboundSessionGivesWayToBound(t *testing.T) {
	n := rt.New(t)
	v := n.Found("victim", "open")
	s := n.Found("honest", "open")
	m := n.Found("middle", "open")
	// v learns s from gossip only, through m.
	neighbours(s, m)
	neighbours(m, v)
	rt.Eventually(t, "v knows s", func() bool { return v.Nodes[0].R.Knows(s.ID) })
	if w, code := impersonate(t, n, v.Nodes[0], s); w == nil {
		t.Fatalf("legacy hello refused: %s", code)
	}
	sk := s.Nodes[0].Key.Key
	rt.Eventually(t, "the impersonator is verified", func() bool { up, b := v.Nodes[0].R.PeerSession(s.ID, sk); return up && !b })
	neighbours(v, m, s)
	rt.Eventually(t, "the real server's bound session replaced it", func() bool {
		up, b := v.Nodes[0].R.PeerSession(s.ID, sk)
		return up && b
	})
	rt.Eventually(t, "the unbound session closed", func() bool { return v.Nodes[0].R.UnboundSessions(s.ID) == 0 })
}

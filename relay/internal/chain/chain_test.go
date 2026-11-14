package chain_test

import (
	"crypto/sha256"
	"slices"
	"strings"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

const now = int64(1767312010)

func key(name string) *fed.Signer {
	h := sha256.Sum256([]byte("chain test " + name))
	s, _ := fed.NewSigner(h[:])
	return s
}

func check(t *testing.T, v map[string]any) *fed.Record {
	t.Helper()
	r, code := fed.CheckValue(v, now, fed.Opts{})
	if code != "" {
		t.Fatalf("%v: %s", v["kind"], code)
	}
	return r
}

func multi(t *testing.T, author *fed.Signer, signers []*fed.Signer, kind string, at int64, body map[string]any) *fed.Record {
	m := map[string]any{"v": int64(1), "kind": kind, "key": author.Key, "t": at, "body": body}
	msg := canon.Encode(m)
	var sigs []any
	for _, s := range signers {
		sigs = append(sigs, map[string]any{"key": s.Key, "sig": s.Sign(msg)})
	}
	slices.SortFunc(sigs, func(a, b any) int {
		return strings.Compare(a.(map[string]any)["key"].(string), b.(map[string]any)["key"].(string))
	})
	m["sigs"] = sigs
	return check(t, m)
}

const url = "wss://node.example.net/fed"

// A founder (anna) adds ben, then both remove anna: anna's key is no operator any more.
func handedOver(t *testing.T) (anna, ben, nk *fed.Signer, g *fed.Record, st *chain.State) {
	anna, ben, nk = key("anna"), key("ben"), key("node")
	g = check(t, anna.Seal("genesis", now-100*86400, map[string]any{"name": "Packet Lunch", "node": map[string]any{"key": nk.Key, "url": url}}))
	p1 := multi(t, anna, []*fed.Signer{anna}, "operators", now-90*86400, map[string]any{"server": g.ID, "prev": g.ID, "action": "add_operator", "target": ben.Key})
	p2 := multi(t, ben, []*fed.Signer{anna, ben}, "operators", now-80*86400, map[string]any{"server": g.ID, "prev": p1.ID, "action": "remove_operator", "target": anna.Key})
	st, code := chain.CheckSequence(g, []*fed.Record{p1, p2})
	if code != "" {
		t.Fatal(code)
	}
	return
}

func srvAt(t *testing.T, author *fed.Signer, signers []*fed.Signer, at int64, server, head string, ops []string, nodes []any, sync string) *fed.Record {
	opsv := make([]any, len(ops))
	for i, o := range ops {
		opsv[i] = o
	}
	return multi(t, author, signers, "server", at, map[string]any{"server": server, "head": head, "name": "Packet Lunch",
		"nodes": nodes, "operators": opsv, "sync": sync, "noLogs": true, "langs": []any{"en"}, "desc": ""})
}

// A key removed from the chain can still sign a valid server record at the genesis head, where it
// was the only operator. With a later t it must not become the current record (8.2).
func TestCurrentIsAtTheFinalHead(t *testing.T) {
	anna, ben, nk, g, st := handedOver(t)
	nodes := []any{map[string]any{"key": nk.Key, "url": url}}
	good := srvAt(t, ben, []*fed.Signer{ben}, now-70*86400, g.ID, st.Head, []string{ben.Key}, nodes, "open")
	stale := srvAt(t, anna, []*fed.Signer{anna}, now-60, g.ID, g.ID, []string{anna.Key}, nodes, "standalone")
	if code := st.CheckServer(stale); code != "" {
		t.Fatalf("the stale record should be valid at its head: %s", code)
	}
	if c := st.Current([]*fed.Record{stale, good}); c != good {
		t.Fatalf("current is the record at an old head (sync %q)", c.Str("sync"))
	}
	// With none at the final head yet, the latest head that has one serves.
	if c := st.Current([]*fed.Record{stale}); c != stale {
		t.Fatal("no fallback to an earlier head")
	}
}

// Extends: a chain extends its prefixes and itself, never a fork.
func TestExtends(t *testing.T) {
	anna, _, nk, g, st := handedOver(t)
	base := chain.Start(g)
	fork, code := chain.CheckSequence(g, []*fed.Record{multi(t, anna, []*fed.Signer{anna}, "operators", now-60, map[string]any{
		"server": g.ID, "prev": g.ID, "action": "set_node", "target": nk.Key, "url": "wss://evil.example.net/fed"})})
	if code != "" {
		t.Fatal(code)
	}
	if !st.Extends(base) || !st.Extends(st) || base.Extends(st) {
		t.Fatal("prefix")
	}
	if !fork.Extends(base) || st.Extends(fork) || fork.Extends(st) {
		t.Fatal("fork")
	}
}

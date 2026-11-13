package main

import (
	"bytes"
	"context"
	"errors"
	"net"
	"net/http"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// serveRegistry publishes servers.json listing s, as the site does; the first `fails` requests get a 503.
func serveRegistry(t *testing.T, n *rt.Net, s *rt.Server, fails int32) (string, *atomic.Int32) {
	t.Helper()
	f, err := s.Nodes[0].R.RegistryFile()
	if err != nil {
		t.Fatal(err)
	}
	b, skipped := registry.Build(map[string][]byte{s.ID + ".json": f}, n.Clock.Unix())
	if len(skipped) > 0 {
		t.Fatalf("registry file skipped: %v", skipped)
	}
	hits := &atomic.Int32{}
	u := n.Serve("site", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hits.Add(1) <= fails {
			http.Error(w, "busy", http.StatusServiceUnavailable)
			return
		}
		w.Write(b)
	}))
	return u + "/federation/servers.json", hits
}

func joinData(t *testing.T, url, reg string) string {
	t.Helper()
	dir := filepath.Join(rt.Dir(t), "data")
	if _, _, _, err := initData(dir, "", func(c *config.Config) { c.URL, c.Registry = url, reg }); err != nil {
		t.Fatal(err)
	}
	return dir
}

// relay join without --from: the server's nodes come from the registry, this node's own URL left out, the first
// that answers first; a server the registry does not list needs --from; --from wins.
func TestJoinFindsNodesInRegistry(t *testing.T) {
	n := rt.New(t)
	s := n.Found("Duo", "open")
	first := s.Nodes[0]
	second := n.AddNode(s, "duo2")
	reg, hits := serveRegistry(t, n, s, 0)
	jn := joinNet{http: n.HTTP, now: n.Clock.Unix}
	ctx := context.Background()

	// From the config's registry.
	dir := joinData(t, "wss://third.example.com/fed", reg)
	var out bytes.Buffer
	if err := join(dir, s.ID, "", "", "", jn, &out); err != nil {
		t.Fatal(err)
	}
	c, _ := config.Load(cfgPath(dir))
	nk, _ := ops.LoadKey(filepath.Join(dir, "node.key"))
	if c.Server != s.ID || !slices.Equal(c.Seeds, []string{first.URL, second.URL}) {
		t.Fatalf("server %s seeds %v", c.Server, c.Seeds)
	}
	if !strings.Contains(out.String(), first.URL+" answered") || !strings.Contains(out.String(), "relay ops propose add-node "+nk.Key+" --url wss://third.example.com/fed") {
		t.Fatalf("output:\n%s", out.String())
	}

	// This node's own URL is never a seed.
	if urls, err := registryNodes(ctx, reg, s.ID, second.URL, jn); err != nil || !slices.Equal(urls, []string{first.URL}) {
		t.Fatalf("own URL: %v %v", urls, err)
	}

	// The first node down: the second answers and goes first.
	first.Stop()
	if seeds, err := findSeeds(ctx, reg, s.ID, "wss://third.example.com/fed", jn); err != nil || !slices.Equal(seeds, []string{second.URL, first.URL}) {
		t.Fatalf("first down: %v %v", seeds, err)
	}

	// Not in the registry: say how to join anyway.
	other := fed.Encode(bytes.Repeat([]byte{9}, 32))
	dir2 := joinData(t, "wss://fourth.example.com/fed", "")
	err := join(dir2, other, "", reg, "", jn, &out)
	var fj fatalJoin
	if err == nil || !errors.As(err, &fj) || !strings.Contains(err.Error(), "not in the registry") ||
		!strings.Contains(err.Error(), "--from") || !strings.Contains(err.Error(), "RELAY_JOIN_FROM") {
		t.Fatalf("unlisted server: %v", err)
	}
	if c, _ := config.Load(cfgPath(dir2)); c.Server != "" {
		t.Fatal("a failed join wrote the server")
	}
	// No registry at all: the same advice.
	if err := join(dir2, s.ID, "", "", "", jn, &out); err == nil || !strings.Contains(err.Error(), "RELAY_JOIN_FROM") {
		t.Fatalf("no registry: %v", err)
	}

	// --from wins: the registry is not even read.
	before := hits.Load()
	if err := join(dir2, s.ID, "wss://elsewhere.example.net/fed", reg, "", jn, &out); err != nil {
		t.Fatal(err)
	}
	if c, _ := config.Load(cfgPath(dir2)); !slices.Equal(c.Seeds, []string{"wss://elsewhere.example.net/fed"}) || hits.Load() != before {
		t.Fatalf("--from: seeds %v, registry read %d times", c.Seeds, hits.Load()-before)
	}
}

// relay up with RELAY_JOIN only: it waits for the registry, finds the server's node there, serves and logs the
// add-node line until the operators sign it, then the node is on the list and syncs.
func TestUpJoinsFromRegistryOnceAdded(t *testing.T) {
	n := rt.New(t)
	s := n.Found("Solo", "open")
	first := s.Nodes[0]
	reg, _ := serveRegistry(t, n, s, 2)
	dir := filepath.Join(rt.Dir(t), "data")
	st := upSet(dir)
	st.url, st.name, st.langs, st.join, st.registry = "wss://joiner.example.com:1/fed", "", "en", s.ID, reg
	st.jn = joinNet{http: n.HTTP, now: n.Clock.Unix}
	st.nodeOpts = func(o *node.Options) {
		o.HTTPClient, o.Clock, o.BootstrapEvery, o.DialBase = n.HTTP, n.Clock.Now, 200*time.Millisecond, 50*time.Millisecond
	}
	out := &syncBuf{}
	r := &running{stop: make(chan struct{}), done: make(chan error, 1), ready: make(chan net.Addr, 1)}
	go func() {
		r.done <- up(upOpts{s: st, out: out, stop: r.stop, ready: func(a net.Addr) { r.ready <- a },
			joinWait: [2]time.Duration{10 * time.Millisecond, 100 * time.Millisecond}})
	}()
	r.addr(t, out)
	if !strings.Contains(out.String(), "looking for the server's nodes in the registry") {
		t.Fatalf("no retry while the registry was down:\n%s", out)
	}
	rt.Eventually(t, "the add-node line in the log", func() bool {
		return strings.Contains(out.String(), "waiting for the server's operators to add this node")
	})
	c, _ := config.Load(cfgPath(dir))
	if c.Server != s.ID || !slices.Equal(c.Seeds, []string{first.URL}) {
		t.Fatalf("server %s seeds %v", c.Server, c.Seeds)
	}
	nk, _ := ops.LoadKey(filepath.Join(dir, "node.key"))
	if !strings.Contains(out.String(), "relay ops propose add-node "+nk.Key+" --url "+st.url) {
		t.Fatalf("no add-node line:\n%s", out)
	}
	add, err := ops.Propose(first.State(), s.Op, "add-node", nk.Key, st.url, n.Clock.Unix())
	if err != nil {
		t.Fatal(err)
	}
	first.MustPut(add)
	rt.Eventually(t, "the node on its server's list", func() bool {
		return strings.Contains(out.String(), "this node is on the server's list now")
	})
	noSecrets(t, dir, out.String())
	r.halt(t)

	// A server the registry does not list: relay up stops with the advice instead of waiting.
	st2 := upSet(filepath.Join(rt.Dir(t), "d2"))
	st2.url, st2.join, st2.registry, st2.jn = "wss://other.example.com/fed", fed.Encode(bytes.Repeat([]byte{9}, 32)), reg, st.jn
	var buf bytes.Buffer
	if err := setUp(st2, &buf, newLogger(&buf, false), nil, [2]time.Duration{time.Millisecond, time.Millisecond}); err == nil || !strings.Contains(err.Error(), "RELAY_JOIN_FROM") {
		t.Fatalf("unlisted server under relay up: %v", err)
	}
}

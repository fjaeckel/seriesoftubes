package node_test

// Growth budgets (growth.go): what new keys can make a node keep, per connection, address and
// other server, the high-water mark, the live-state map, and duplicate subscriptions.

import (
	"fmt"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// budgets applies changes to a node's growth budgets.
func budgets(x *rt.Node, f func(b *config.Budgets)) {
	c := *x.Cfg
	f(&c.Budgets)
	x.Cfg = &c
	x.R.Reload(&c)
}

// A player running many games (agents) from one address, each on its own connection with a
// network of its own, is never refused with the default budgets.
func TestManyAgentsPutFromOneAddress(t *testing.T) {
	n := rt.New(t)
	x := n.Found("agents", "open").Nodes[0]
	now := n.Clock.Unix()
	for i := range 100 {
		c := x.Client(from("198.51.100.7"))
		// More than one network per connection: games started over, saves switched.
		for j := range 2 {
			k := rt.Key(fmt.Sprintf("agent %d/%d", i, j))
			for _, rec := range []map[string]any{rt.Announce(k, now, fmt.Sprintf("Agent %d %d", i, j)), rt.Stats(k, now, 3, false)} {
				if _, err := c.Put(ctx(t), rec); err != nil {
					t.Fatalf("agent %d network %d: %v", i, j, err)
				}
			}
		}
		if _, err := sendState(t, c, stateRec(rt.Key(fmt.Sprintf("agent %d/0", i)), now, 3)); err != nil {
			t.Fatalf("agent %d state: %v", i, err)
		}
		c.Close()
	}
	if got := x.Count("announce"); got != 200 {
		t.Fatalf("%d announces kept", got)
	}
}

// New keys and record bytes are counted per connection and per address, by the hour; records
// of keys already known cost no new key, and the budgets fill again with time.
func TestNewKeyBudgets(t *testing.T) {
	n := rt.New(t)
	x := n.Found("budgets", "open").Nodes[0]
	budgets(x, func(b *config.Budgets) { b.NewKeysPerConn, b.NewKeysPerAddr = 3, 5 })
	now := n.Clock.Unix()
	put := func(c *client.Client, k *fed.Signer) error {
		_, err := c.Put(ctx(t), rt.Announce(k, now, "N"))
		return err
	}
	c1 := x.Client(from("203.0.113.1"))
	for i := range 3 {
		if err := put(c1, rt.Key(fmt.Sprint("one ", i))); err != nil {
			t.Fatal(i, err)
		}
	}
	if err := put(c1, rt.Key("one 3")); code(err) != fed.RateLimited {
		t.Fatalf("a fourth new key on one connection: %v", err)
	}
	// A key already known costs no new key.
	if _, err := c1.Put(ctx(t), rt.Stats(rt.Key("one 0"), now, 1, false)); err != nil {
		t.Fatalf("stats of a known key: %v", err)
	}
	// Another connection from the same address: two more, then the address is spent.
	c2 := x.Client(from("203.0.113.1"))
	for i := range 2 {
		if err := put(c2, rt.Key(fmt.Sprint("two ", i))); err != nil {
			t.Fatal(i, err)
		}
	}
	if err := put(c2, rt.Key("two 2")); code(err) != fed.RateLimited {
		t.Fatalf("past the address's budget: %v", err)
	}
	// An IPv6 address is counted by its /64.
	c6 := x.Client(from("2001:db8:1:2::1"))
	c6b := x.Client(from("2001:db8:1:2::ffff"))
	for i := range 5 {
		c := c6
		if i >= 3 {
			c = c6b
		}
		if err := put(c, rt.Key(fmt.Sprint("six ", i))); err != nil {
			t.Fatal(i, err)
		}
	}
	if err := put(c6b, rt.Key("six 5")); code(err) != fed.RateLimited {
		t.Fatalf("another address in the same /64: %v", err)
	}
	// Another address has its own budget.
	if err := put(x.Client(from("203.0.113.2")), rt.Key("three 0")); err != nil {
		t.Fatalf("another address: %v", err)
	}
	if x.Metrics.Get("relay_budget_refused_total", "conn_keys") != 1 || x.Metrics.Get("relay_budget_refused_total", "addr_keys") != 2 {
		t.Fatal("budget refusals not counted")
	}
	// An hour on, the address has its budget back.
	n.Clock.Add(time.Hour)
	now = n.Clock.Unix()
	if err := put(c2, rt.Key("two 2")); err != nil {
		t.Fatalf("an hour later: %v", err)
	}

	// Bytes: one announce is about 1 KB; a connection with 2 KB an hour gets two or three in.
	budgets(x, func(b *config.Budgets) { b.NewKeysPerConn, b.NewKeysPerAddr, b.BytesPerConn = 100, 100, 2000 })
	c4 := x.Client(from("203.0.113.4"))
	ok := 0
	for i := range 10 {
		err := put(c4, rt.Key(fmt.Sprint("bytes ", i)))
		if err == nil {
			ok++
			continue
		}
		if code(err) != fed.RateLimited {
			t.Fatal(err)
		}
	}
	if ok < 1 || ok > 3 {
		t.Fatalf("%d announces past a 2 KB budget", ok)
	}
}

// Past the high-water mark only networks with an announce may put: players keep playing,
// records of new keys are refused rate_limited.
func TestHighWaterMark(t *testing.T) {
	n := rt.New(t)
	x := n.Found("full", "open").Nodes[0]
	now := n.Clock.Unix()
	c := x.Client(from("192.0.2.1"))
	alice := rt.Key("alice")
	if _, err := c.Put(ctx(t), rt.Announce(alice, now, "Alice")); err != nil {
		t.Fatal(err)
	}
	x.R.Lock()
	held := x.R.Store().Len()
	x.R.Unlock()
	budgets(x, func(b *config.Budgets) { b.MaxRecords = held })
	if _, err := c.Put(ctx(t), rt.Announce(rt.Key("newcomer"), now, "New")); code(err) != fed.RateLimited {
		t.Fatalf("a new network past the high-water mark: %v", err)
	}
	if _, err := c.Put(ctx(t), rt.Stats(rt.Key("stranger"), now, 1, false)); code(err) != fed.RateLimited {
		t.Fatalf("stats of a key without an announce past the high-water mark: %v", err)
	}
	if _, err := c.Put(ctx(t), rt.Stats(alice, now, 2, false)); err != nil {
		t.Fatalf("a player past the high-water mark: %v", err)
	}
	if x.Metrics.Get("relay_budget_refused_total", "high_water") != 2 {
		t.Fatal("high-water refusals not counted")
	}
	// Bytes kept count too.
	budgets(x, func(b *config.Budgets) { b.MaxRecords, b.MaxStoreBytes = 1<<30, 1 })
	if _, err := c.Put(ctx(t), rt.Announce(rt.Key("newcomer"), now, "New")); code(err) != fed.RateLimited {
		t.Fatalf("a new network past the bytes high-water mark: %v", err)
	}
	budgets(x, func(b *config.Budgets) { b.MaxStoreBytes = 1 << 40 })
	if _, err := c.Put(ctx(t), rt.Announce(rt.Key("newcomer"), now, "New")); err != nil {
		t.Fatalf("below the mark again: %v", err)
	}
}

// Another server can bring only so many new keys an hour; what it pushes past that is not
// remembered as refused, so it comes again in a later session.
func TestPeerNewKeyBudget(t *testing.T) {
	n := rt.New(t)
	a := n.Found("chatty", "open")
	b := n.Found("calm", "open")
	budgets(b.Nodes[0], func(bg *config.Budgets) { bg.NewKeysPerPeer = 3 })
	now := n.Clock.Unix()
	var ids []string
	for i := range 10 {
		rec := rt.Announce(rt.Key(fmt.Sprint("made up ", i)), now, "M")
		ids = append(ids, rt.ID(rec))
		a.Nodes[0].MustPut(rec)
	}
	neighbours(b, a)
	rt.Eventually(t, "b takes three", func() bool { return b.Nodes[0].Count("announce") >= 3 })
	time.Sleep(500 * time.Millisecond)
	if got := b.Nodes[0].Count("announce"); got != 3 {
		t.Fatalf("b took %d new keys from one server", got)
	}
	for _, id := range ids {
		if b.Nodes[0].R.IsRefused(id) {
			t.Fatal("a record past the budget was remembered as refused")
		}
	}
	if b.Nodes[0].Metrics.Get("relay_budget_refused_total", "peer_keys") == 0 {
		t.Fatal("peer refusals not counted")
	}
}

// The live-state map at its bound: made-up keys without an announce no longer keep a player out,
// and new live keys without an announce are counted per address.
func TestLiveStatesPreferPlayers(t *testing.T) {
	n := rt.New(t)
	x := n.Found("nowboard", "open").Nodes[0]
	now := n.Clock.Unix()
	x.R.SetLiveCap(3)
	for i := range 3 {
		c := x.Client(from(fmt.Sprintf("192.0.2.%d", 10+i)))
		if _, err := sendState(t, c, stateRec(rt.Key(fmt.Sprint("junk ", i)), now+fed.Skew, 1)); err != nil {
			t.Fatal(err)
		}
	}
	alice := rt.Key("alice")
	c := x.Client(from("192.0.2.1"))
	if _, err := c.Put(ctx(t), rt.Announce(alice, now, "Alice")); err != nil {
		t.Fatal(err)
	}
	if _, err := sendState(t, c, stateRec(alice, now, 5)); err != nil {
		t.Fatalf("a player's state with the map full of made-up keys: %v", err)
	}
	if !x.R.LiveHeld(alice.Key) {
		t.Fatal("the player's state is not held")
	}

	// Per address: two live keys without an announce an hour, then rate_limited; with an
	// announce, no limit.
	budgets(x, func(b *config.Budgets) { b.LiveKeysPerAddr = 2 })
	x.R.SetLiveCap(1000)
	for i := range 3 {
		c := x.Client(from("192.0.2.99"))
		_, err := sendState(t, c, stateRec(rt.Key(fmt.Sprint("nobody ", i)), now, 1))
		if i == 2 && code(err) != fed.RateLimited || i < 2 && err != nil {
			t.Fatalf("live key %d without an announce from one address: %v", i, err)
		}
	}
	bob := rt.Key("bob")
	cb := x.Client(from("192.0.2.99"))
	if _, err := cb.Put(ctx(t), rt.Announce(bob, now, "Bob")); err != nil {
		t.Fatal(err)
	}
	if _, err := sendState(t, cb, stateRec(bob, now, 1)); err != nil {
		t.Fatalf("a player with an announce from a spent address: %v", err)
	}
}

// Another server's states of keys without an announce are counted against its own budget.
func TestPeerLiveBudget(t *testing.T) {
	defer node.SetStatesEvery(50 * time.Millisecond)()
	n := rt.New(t)
	a := n.Found("live-a", "open")
	b := n.Found("live-b", "open")
	budgets(b.Nodes[0], func(bg *config.Budgets) { bg.LiveKeysPerPeer = 2 })
	neighbours(b, a)
	now := n.Clock.Unix()
	probe := announce(t, a, "probe")
	rt.Eventually(t, "sync", func() bool { return b.Nodes[0].Has(probe) })
	var keys []string
	for i := range 5 {
		k := rt.Key(fmt.Sprint("ghost ", i))
		keys = append(keys, k.Key)
		if _, err := sendState(t, a.Nodes[0].Client(from(fmt.Sprintf("192.0.2.%d", 50+i))), stateRec(k, now, 1)); err != nil {
			t.Fatal(err)
		}
	}
	held := func() int {
		m := 0
		for _, k := range keys {
			if b.Nodes[0].R.LiveHeld(k) {
				m++
			}
		}
		return m
	}
	rt.Eventually(t, "b holds two", func() bool { return held() >= 2 })
	time.Sleep(400 * time.Millisecond)
	if got := held(); got != 2 {
		t.Fatalf("b holds %d states of keys without an announce from one server", got)
	}
}

// A leave's key is forgotten once the leave is no longer kept.
func TestLeftIsBounded(t *testing.T) {
	n := rt.New(t)
	x := n.Found("leavers", "open").Nodes[0]
	for i := range 5 {
		x.MustPut(rt.Key(fmt.Sprint("leaver ", i)).Seal("leave", n.Clock.Unix(), map[string]any{}))
	}
	if x.R.LeftLen() != 5 {
		t.Fatal("leaves not remembered")
	}
	n.Clock.Add(time.Duration(fed.LeaveKept+fed.Day) * time.Second)
	x.R.GC()
	if got := x.R.LeftLen(); got != 0 {
		t.Fatalf("%d leaves remembered past their keeping time", got)
	}
}

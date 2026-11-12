package node_test

import (
	"bytes"
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// Addresses the test clients connect "from" (through the trusted loopback proxy header).
var testAddrs = []string{"203.0.113.77", "2001:db8::77", "198.51.100.23"}

func from(addr string) http.Header {
	h := http.Header{}
	h.Set("X-Forwarded-For", "10.9.8.7, "+addr) // the proxy appends the real peer last
	return h
}

func TestPrivacy(t *testing.T) {
	n := rt.New(t)
	countries := rt.NewCountries(map[string]string{"203.0.113.77": "DE", "2001:db8::77": "FR"})
	n.Country = countries
	a := n.Found("private", "open")
	a2 := n.AddNode(a, "private2")
	b := n.Found("elsewhere", "open")
	neighbours(b, a)

	alice, bob, carol := rt.Key("alice"), rt.Key("bob"), rt.Key("carol")
	// Alice shares her country, Bob does not, Carol shares but has no country on record.
	ca := a.Nodes[0].Client(from(testAddrs[0]))
	ack, err := ca.Put(ctx(t), rt.Stats(alice, n.Clock.Unix(), 2, true))
	if err != nil {
		t.Fatal(err)
	}
	if cc := receiptBody(ack.Raw["rcpt"])["cc"]; cc != "DE" {
		t.Fatalf("shared country: %v", cc)
	}
	if _, err := ca.Put(ctx(t), rt.Announce(alice, n.Clock.Unix(), "Alice Net")); err != nil {
		t.Fatal(err)
	}
	cb := a2.Client(from(testAddrs[1]))
	ack, err = cb.Put(ctx(t), rt.Stats(bob, n.Clock.Unix(), 1, false))
	if err != nil {
		t.Fatal(err)
	}
	rb := receiptBody(ack.Raw["rcpt"])
	if _, ok := rb["cc"]; ok {
		t.Fatal("country attached though not shared")
	}
	cc := b.Nodes[0].Client(from(testAddrs[2]))
	ack, err = cc.Put(ctx(t), rt.Stats(carol, n.Clock.Unix(), 1, true))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := receiptBody(ack.Raw["rcpt"])["cc"]; ok {
		t.Fatal("country attached without one found")
	}
	// Receipt times are slots, never the exact time (the clock is 10 s into its slot).
	rc := ack.Raw["rcpt"].(map[string]any)
	rcT, _ := wire.Int(rc["t"])
	if rcT%300 != 0 || rcT != fed.Slot(n.Clock.Unix()) {
		t.Fatalf("receipt time %d not the slot", rcT)
	}
	if countries.Asked() == 0 {
		t.Fatal("the country database was never asked")
	}
	// Let everything sync everywhere, then look for the addresses in everything written.
	defer func() {
		if t.Failed() {
			t.Logf("counts a1=%d a2=%d b=%d\nA1 LOG:\n%s\nA2 LOG:\n%s\nB LOG:\n%s", a.Nodes[0].Count("stats"), a2.Count("stats"), b.Nodes[0].Count("stats"),
				a.Nodes[0].Log.String(), a2.Log.String(), b.Nodes[0].Log.String())
		}
	}()
	rt.Eventually(t, "records synced", func() bool {
		return a2.Count("stats") == 3 && a.Nodes[0].Count("stats") == 3 && b.Nodes[0].Count("stats") == 3
	})
	ca.Close()
	cb.Close()
	cc.Close()
	nodes := []*rt.Node{a.Nodes[0], a2, b.Nodes[0]}
	for _, x := range nodes {
		x.R.GC()
		var metrics bytes.Buffer
		x.Metrics.Write(&metrics)
		x.Stop()
		blobs := map[string]string{"log of " + x.Name: x.Log.String(), "metrics of " + x.Name: metrics.String()}
		_ = filepath.Walk(x.Dir, func(p string, fi os.FileInfo, err error) error {
			if err == nil && fi.Mode().IsRegular() {
				b, _ := os.ReadFile(p)
				blobs[p] = string(b)
			}
			return nil
		})
		for where, text := range blobs {
			for _, addr := range append(testAddrs, "10.9.8.7", "127.0.0.1", "X-Forwarded-For", "Go-http-client") {
				if strings.Contains(text, addr) {
					t.Errorf("%q found in %s", addr, where)
				}
			}
		}
		if !strings.Contains(x.Log.String(), "sync: session up") {
			t.Errorf("%s logged nothing; the scan would prove little", x.Name)
		}
	}
}

func TestAddressesOnlyInMemoryForMinutes(t *testing.T) {
	n := rt.New(t)
	a := n.Found("limits", "open")
	x := a.Nodes[0]
	c := *x.Cfg
	c.Limits.ConnsPerAddr = 3
	x.Cfg = &c
	x.R.Reload(&c)
	for i := 0; i < 3; i++ {
		x.Client(from(testAddrs[0]))
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := client.Dial(ctx, x.URL, client.Options{HTTPClient: n.HTTP, Header: from(testAddrs[0])}); err == nil {
		t.Fatal("a fourth connection from one address within the window was accepted")
	}
	// Another address is not affected.
	x.Client(from(testAddrs[1]))
	if x.R.AddressesHeld() != 2 {
		t.Fatalf("held %d addresses", x.R.AddressesHeld())
	}
	// After the window the addresses are forgotten.
	n.Clock.Add(5*time.Minute + time.Second)
	x.Client(from(testAddrs[2]))
	if x.R.AddressesHeld() != 1 {
		t.Fatalf("still holding %d addresses after the window", x.R.AddressesHeld())
	}
}

func receiptBody(v any) map[string]any {
	m, _ := v.(map[string]any)
	b, _ := m["body"].(map[string]any)
	return b
}

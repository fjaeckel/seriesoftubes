package node_test

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// dialHdr opens a WebSocket with these headers and reports the HTTP answer when refused.
func dialHdr(t *testing.T, n *rt.Net, url string, h http.Header) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, resp, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPClient: n.HTTP, HTTPHeader: h, Subprotocols: []string{fed.Subprotocol}})
	if c != nil {
		t.Cleanup(func() { c.CloseNow() })
	}
	return c, resp, err
}

func reload(x *rt.Node, f func(c *config.Config)) {
	c := *x.Cfg
	f(&c)
	x.Cfg = &c
	x.R.Reload(&c)
}

// Many AI agents run side by side behind one address: a hundred connecting at once are all let in
// under the default limits (the old limit refused the 31st for five minutes).
func TestManyAgentsFromOneAddress(t *testing.T) {
	n := rt.New(t)
	x := n.Found("agents", "open").Nodes[0]
	var wg sync.WaitGroup
	errs := make(chan error, 100)
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			c, err := client.Dial(ctx, x.URL, client.Options{HTTPClient: n.HTTP, Header: from(testAddrs[0])})
			if err != nil {
				errs <- err
				return
			}
			t.Cleanup(func() { c.Close() })
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("one of 100 parallel connections from one address was refused: %v", err)
	}
}

// One address may hold only so many connections open at once, and is told when to come back.
func TestOpenPerAddrAndRetryAfter(t *testing.T) {
	n := rt.New(t)
	x := n.Found("open", "open").Nodes[0]
	reload(x, func(c *config.Config) { c.Limits.OpenPerAddr = 3 })
	var cs []*client.Client
	for range 3 {
		cs = append(cs, x.Client(from(testAddrs[0])))
	}
	_, resp, err := dialHdr(t, n, x.URL, from(testAddrs[0]))
	if err == nil || resp == nil || resp.StatusCode != http.StatusTooManyRequests || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("a fourth open connection: %v %+v", err, resp)
	}
	x.Client(from(testAddrs[1])) // another address is not affected
	cs[0].Close()
	rt.Eventually(t, "room after one closed", func() bool {
		c, _, err := dialHdr(t, n, x.URL, from(testAddrs[0]))
		if c != nil {
			c.CloseNow()
		}
		return err == nil
	})

	// New connections: a burst, then the refill rate, with Retry-After on the refusal.
	reload(x, func(c *config.Config) { c.Limits.OpenPerAddr, c.Limits.ConnBurst, c.Limits.ConnsPerSec = 100, 2, 0.1 })
	x.Client(from(testAddrs[2]))
	x.Client(from(testAddrs[2]))
	_, resp, err = dialHdr(t, n, x.URL, from(testAddrs[2]))
	if err == nil || resp == nil || resp.StatusCode != http.StatusTooManyRequests || resp.Header.Get("Retry-After") != "10" {
		t.Fatalf("past the burst: %v %+v", err, resp)
	}
	n.Clock.Add(10 * time.Second)
	x.Client(from(testAddrs[2]))
}

// Before the proof, a session that says it is a node is held to a client's frame size; and only a
// few such handshakes may wait at once.
func TestNodeBoundsOnlyAfterProof(t *testing.T) {
	n := rt.New(t)
	x := n.Found("proof", "open").Nodes[0]
	hello := func(w *wsConn, i int) {
		w.send(map[string]any{"m": "hello", "vers": []any{int64(1)}, "role": "node", "server": rt.Key("made-up").Key,
			"node": rt.Key("mallory" + strings.Repeat("x", i)).Key, "nonce": fed.Encode(make([]byte, 32)), "feats": []any{fed.FeatBind}})
	}
	w := dialWS(t, n, x.URL)
	hello(w, 0)
	if f := w.next(); f == nil || f.M != "welcome" {
		t.Fatalf("no welcome: %+v", f)
	}
	w.send(map[string]any{"m": "proof", "proof": strings.Repeat("a", fed.ClientFrame+1000)})
	if code, _ := w.refused(); code != fed.TooBig {
		t.Fatalf("a node-sized frame before the proof: %q, want %s", code, fed.TooBig)
	}

	var waiting []*wsConn
	for i := range 16 {
		w := dialWS(t, n, x.URL)
		hello(w, i+1)
		if f := w.next(); f == nil || f.M != "welcome" {
			t.Fatalf("handshake %d: %+v", i+1, f)
		}
		waiting = append(waiting, w)
	}
	w = dialWS(t, n, x.URL)
	hello(w, 99)
	if code, _ := w.refused(); code != fed.NotReady {
		t.Fatalf("a 17th node handshake waiting: %q", code)
	}
	waiting[0].c.CloseNow()
	rt.Eventually(t, "room after one ended", func() bool {
		w := dialWS(t, n, x.URL)
		hello(w, 100)
		f := w.next()
		return f != nil && f.M == "welcome"
	})
}

// Connections that have not said hello yet count against MaxClients.
func TestHandshakesCountAgainstMaxClients(t *testing.T) {
	n := rt.New(t)
	x := n.Found("hands", "open").Nodes[0]
	reload(x, func(c *config.Config) { c.Limits.MaxClients, c.Limits.MaxNodes = 2, 1 })
	for i := range 3 {
		if _, _, err := dialHdr(t, n, x.URL, from(testAddrs[i%3])); err != nil {
			t.Fatal(err)
		}
	}
	_, resp, err := dialHdr(t, n, x.URL, from("192.0.2.1"))
	if err == nil || resp == nil || resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("a fourth silent connection with room for three: %v %+v", err, resp)
	}
}

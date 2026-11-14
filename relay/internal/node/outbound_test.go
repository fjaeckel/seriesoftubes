package node_test

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/netguard"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// target stands for an internal service (a cloud metadata address, say); it counts the connections it gets.
func target(t *testing.T) (*httptest.Server, *atomic.Int32) {
	var n atomic.Int32
	s := httptest.NewUnstartedServer(http.NotFoundHandler())
	s.Config.ConnState = func(_ net.Conn, st http.ConnState) {
		if st == http.StateNew {
			n.Add(1)
		}
	}
	s.Start()
	t.Cleanup(s.Close)
	return s, &n
}

func plainRelay(t *testing.T) *node.Relay {
	r, err := node.New(node.Options{Dir: rt.Dir(t), Node: rt.Key("outbound")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { r.Close() })
	return r
}

// A node URL that answers with a redirect is a failed dial, not a request to wherever it points.
func TestDialDoesNotFollowRedirects(t *testing.T) {
	r := plainRelay(t)
	tg, hits := target(t)
	redir := httptest.NewServer(http.RedirectHandler(tg.URL+"/latest/meta-data/", http.StatusFound))
	defer redir.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.DialNode(ctx, strings.Replace(redir.URL, "http://", "ws://", 1), false); err == nil {
		t.Fatal("dial through a redirect succeeded")
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("the redirect was followed: %d connection(s) to its target", n)
	}
}

// URLs of automatic peers come from the registry or the catalog: they may not reach internal addresses;
// URLs the operator configured (neighbours, seeds, LAN) may.
func TestAutoPeerDialRefusesInternalAddresses(t *testing.T) {
	r := plainRelay(t)
	tg, hits := target(t)
	u := strings.Replace(tg.URL, "http://", "ws://", 1)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.DialNode(ctx, u, true); !errors.Is(err, netguard.ErrInternal) {
		t.Fatalf("automatic peer on loopback: err %v, want netguard.ErrInternal", err)
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("%d connection(s) reached the internal address", n)
	}
	if err := r.DialNode(ctx, u, false); err == nil || errors.Is(err, netguard.ErrInternal) {
		t.Fatalf("neighbour on loopback: err %v, want a failed handshake", err)
	}
	if hits.Load() == 0 {
		t.Fatal("neighbour on loopback: not dialled")
	}
}

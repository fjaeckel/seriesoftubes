package client

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// A node URL that answers with a redirect is a failed dial, not a request to wherever it points.
func TestDialDoesNotFollowRedirects(t *testing.T) {
	var hits atomic.Int32
	tg := httptest.NewUnstartedServer(http.NotFoundHandler())
	tg.Config.ConnState = func(_ net.Conn, st http.ConnState) {
		if st == http.StateNew {
			hits.Add(1)
		}
	}
	tg.Start()
	defer tg.Close()
	redir := httptest.NewServer(http.RedirectHandler(tg.URL+"/latest/meta-data/", http.StatusFound))
	defer redir.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := Dial(ctx, strings.Replace(redir.URL, "http://", "ws://", 1), Options{}); err == nil {
		t.Fatal("dial through a redirect succeeded")
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("the redirect was followed: %d connection(s) to its target", n)
	}
}

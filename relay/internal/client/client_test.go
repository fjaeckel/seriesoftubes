package client

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

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
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

// endless is a node that answers every request with recs frames saying more, forever.
func endless(t *testing.T, items int) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{fed.Subprotocol}})
		if err != nil {
			return
		}
		defer c.CloseNow()
		ctx := r.Context()
		if _, _, err := c.Read(ctx); err != nil {
			return
		}
		_ = c.Write(ctx, websocket.MessageText, canon.Encode(map[string]any{"m": "welcome", "ver": int64(1), "server": "s", "node": "n", "now": int64(1)}))
		_, b, err := c.Read(ctx)
		if err != nil {
			return
		}
		f, _ := wire.Parse(b, fed.ClientFrame)
		list := make([]any, items)
		for i := range list {
			list[i] = map[string]any{"rec": map[string]any{"x": int64(i)}}
		}
		frame := canon.Encode(map[string]any{"m": "recs", "id": f.ID, "items": list, "cursor": "", "more": true})
		for {
			if err := c.Write(ctx, websocket.MessageText, frame); err != nil {
				return
			}
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestCollectIsBounded(t *testing.T) {
	for _, tc := range []struct {
		name          string
		items, frames int
		per           int
	}{
		{"by items", 1000, 1 << 20, 50},
		{"by frames", 1 << 20, 30, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mi, mf := maxCollectItems, maxCollectFrames
			maxCollectItems, maxCollectFrames = tc.items, tc.frames
			t.Cleanup(func() { maxCollectItems, maxCollectFrames = mi, mf })
			srv := endless(t, tc.per)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			cl, err := Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), Options{})
			if err != nil {
				t.Fatal(err)
			}
			defer cl.c.CloseNow() // the endless node never reads a close frame
			items, err := cl.Collect(ctx, map[string]any{"m": "sub", "kinds": []any{"server"}, "since": ""})
			if !errors.Is(err, ErrTooLong) {
				t.Fatalf("an endless answer ended with %v, want ErrTooLong", err)
			}
			if len(items) > tc.items+tc.per || len(items) > tc.frames*tc.per {
				t.Fatalf("%d items collected past the bounds", len(items))
			}
		})
	}
}

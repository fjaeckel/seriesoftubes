package main

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// Idle keep-alive connections are closed, headers are bounded, and WebSockets (hijacked from the
// server) are not cut by the idle timeout.
func TestHTTPServerTimeouts(t *testing.T) {
	old := idleTimeout
	idleTimeout = 300 * time.Millisecond
	defer func() { idleTimeout = old }()
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "ok") })
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.CloseNow()
		for {
			typ, b, err := c.Read(r.Context())
			if err != nil {
				return
			}
			if c.Write(r.Context(), typ, b) != nil {
				return
			}
		}
	})
	srv := httpServer("127.0.0.1:0", mux)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = srv.Serve(ln) }()
	defer srv.Close()
	addr := ln.Addr().String()

	// An idle keep-alive connection is closed.
	nc, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer nc.Close()
	_, _ = io.WriteString(nc, "GET / HTTP/1.1\r\nHost: x\r\n\r\n")
	br := bufio.NewReader(nc)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	_ = nc.SetReadDeadline(time.Now().Add(5 * time.Second))
	if _, err := br.ReadByte(); !errors.Is(err, io.EOF) {
		t.Fatalf("an idle keep-alive connection was kept open: %v", err)
	}

	// Headers are bounded.
	req, _ := http.NewRequest("GET", "http://"+addr+"/", nil)
	req.Header.Set("X-Big", strings.Repeat("a", 64<<10))
	if resp, err := http.DefaultClient.Do(req); err != nil || resp.StatusCode != http.StatusRequestHeaderFieldsTooLarge {
		t.Fatalf("64 KiB of headers: %v %v", err, resp)
	}

	// A WebSocket outlives the idle timeout.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws://"+addr+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	time.Sleep(3 * idleTimeout)
	if err := c.Write(ctx, websocket.MessageText, []byte("hi")); err != nil {
		t.Fatal(err)
	}
	if _, b, err := c.Read(ctx); err != nil || string(b) != "hi" {
		t.Fatalf("the WebSocket after the idle timeout: %q %v", b, err)
	}
}

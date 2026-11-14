package netguard

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"sync/atomic"
	"testing"
)

func TestInternal(t *testing.T) {
	for _, s := range []string{"127.0.0.1", "::1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254",
		"fe80::1", "fd00::1", "100.64.0.1", "0.0.0.0", "::", "224.0.0.1", "ff02::1", "::ffff:127.0.0.1",
		"::ffff:169.254.169.254", "0.1.2.3", "255.255.255.255"} {
		if !Internal(netip.MustParseAddr(s)) {
			t.Errorf("%s: not internal", s)
		}
	}
	for _, s := range []string{"1.1.1.1", "8.8.8.8", "2606:4700::1111", "100.128.0.1", "172.32.0.1"} {
		if Internal(netip.MustParseAddr(s)) {
			t.Errorf("%s: internal", s)
		}
	}
}

// counting serves 200 and counts the connections it accepts.
func counting(t *testing.T) (*httptest.Server, *atomic.Int32) {
	var n atomic.Int32
	s := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	s.Config.ConnState = func(_ net.Conn, st http.ConnState) {
		if st == http.StateNew {
			n.Add(1)
		}
	}
	s.Start()
	t.Cleanup(s.Close)
	return s, &n
}

func get(t *testing.T, c *http.Client, url string) (*http.Response, error) {
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	resp, err := c.Do(req)
	if err == nil {
		resp.Body.Close()
	}
	return resp, err
}

func TestNoRedirect(t *testing.T) {
	target, hits := counting(t)
	redir := httptest.NewServer(http.RedirectHandler(target.URL+"/latest/meta-data/", http.StatusFound))
	defer redir.Close()
	// (Operator URLs: a public-only client could not reach these test servers on loopback at all.)
	resp, err := get(t, Client(nil, false), redir.URL)
	if err != nil || resp.StatusCode != http.StatusFound {
		t.Fatalf("%v %v, want the 302 itself", resp, err)
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("redirect followed: target got %d connections", n)
	}
}

func TestPublicOnlyRefusesLoopback(t *testing.T) {
	s, hits := counting(t)
	if _, err := get(t, Client(nil, true), s.URL); !errors.Is(err, ErrInternal) {
		t.Fatalf("err %v, want ErrInternal", err)
	}
	// A dialer of the caller's that reaches an internal address is refused too.
	tr := &http.Transport{DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, network, s.Listener.Addr().String())
	}}
	if _, err := get(t, Client(&http.Client{Transport: tr}, true), "http://public.example.com/"); !errors.Is(err, ErrInternal) {
		t.Fatalf("custom dialer: err %v, want ErrInternal", err)
	}
	if _, err := get(t, Client(&http.Client{Transport: roundTripper{}}, true), s.URL); !errors.Is(err, ErrInternal) {
		t.Fatalf("unknown transport: err %v, want ErrInternal", err)
	}
	if n := hits.Load(); n > 1 { // only the custom dialer's connection, closed at once
		t.Fatalf("%d connections reached the server", n)
	}
	// Operator-configured URLs may be internal.
	if resp, err := get(t, Client(nil, false), s.URL); err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("operator URL: %v %v", resp, err)
	}
}

type roundTripper struct{}

func (roundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("unused")
}

// The default transport is checked before it connects, so not even a connection reaches the address.
func TestPublicOnlyDefaultTransportDoesNotConnect(t *testing.T) {
	s, hits := counting(t)
	for _, c := range []*http.Client{Client(nil, true), Client(&http.Client{}, true), Client(&http.Client{Transport: &http.Transport{}}, true)} {
		if _, err := get(t, c, s.URL); !errors.Is(err, ErrInternal) {
			t.Fatalf("err %v, want ErrInternal", err)
		}
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("%d connection(s) reached the server", n)
	}
}

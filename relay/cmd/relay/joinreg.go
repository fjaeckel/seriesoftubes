package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

// Joining a server without --from: its nodes' addresses come from the registry (servers.json, published from
// federation/servers/). The registry gives addresses only; the chain the node then fetches is checked as always.

// joinNet is how a join reaches the registry and the server's nodes; tests replace both.
type joinNet struct {
	http *http.Client // nil: the default (RELAY_TEST_ROOTS honoured)
	now  func() int64 // nil: the system clock
}

func (j joinNet) client() *http.Client {
	if j.http != nil {
		return j.http
	}
	if p := os.Getenv("RELAY_TEST_ROOTS"); p != "" {
		if hc, err := testRootsClient(p); err == nil {
			return hc
		}
	}
	return http.DefaultClient
}

func (j joinNet) unix() int64 {
	if j.now != nil {
		return j.now()
	}
	return time.Now().Unix()
}

// fatalJoin is a lookup that waiting will not fix (the server is not listed, no registry is set).
type fatalJoin struct{ error }

func (e fatalJoin) Unwrap() error { return e.error }

func needFrom(why string) error {
	return fatalJoin{errors.New(why + ". Give the wss:// URL of one of its running nodes: relay join --from, or RELAY_JOIN_FROM with relay up")}
}

// readRegistry reads servers.json from an https:// URL or a file.
func readRegistry(ctx context.Context, src string, hc *http.Client) ([]byte, error) {
	if !strings.HasPrefix(src, "https://") {
		return os.ReadFile(src)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return nil, err
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New(resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 16<<20))
}

// registryNodes lists the node URLs the registry has for server, in its order, own excluded.
func registryNodes(ctx context.Context, src, server, own string, j joinNet) ([]string, error) {
	if src == "" {
		return nil, needFrom("no registry to look the server's nodes up in (config.json's registry is empty)")
	}
	b, err := readRegistry(ctx, src, j.client())
	if err != nil {
		return nil, fmt.Errorf("registry %s: %w", src, err)
	}
	snap, err := registry.ReadSnapshot(b, j.unix())
	if err != nil {
		return nil, fmt.Errorf("registry %s: %w", src, err)
	}
	for _, e := range snap.Entries {
		if e.ID != server {
			continue
		}
		var urls []string
		for _, n := range e.State.Nodes {
			if n.URL != own && fed.URLOK(n.URL) {
				urls = append(urls, n.URL)
			}
		}
		if len(urls) == 0 {
			return nil, needFrom(fmt.Sprintf("the registry lists no node of server %s besides this one", server))
		}
		return urls, nil
	}
	return nil, needFrom(fmt.Sprintf("server %s is not in the registry (%s): a new, unlisted, private or LAN server", server, src))
}

// findSeeds: the server's nodes from the registry, each tried in turn; the first that answers as that server comes
// first, the others stay as fallbacks for the node's own bootstrap.
func findSeeds(ctx context.Context, src, server, own string, j joinNet) ([]string, error) {
	urls, err := registryNodes(ctx, src, server, own, j)
	if err != nil {
		return nil, err
	}
	var why []string
	for i, u := range urls {
		dctx, cancel := context.WithTimeout(ctx, 15*time.Second)
		cl, err := client.Dial(dctx, u, client.Options{HTTPClient: j.client()})
		cancel()
		if err != nil {
			why = append(why, u+": no answer")
			continue
		}
		other := cl.Welcome.Server != server
		cl.Close()
		if other {
			why = append(why, u+": answers as another server")
			continue
		}
		return append([]string{u}, append(urls[:i:i], urls[i+1:]...)...), nil
	}
	return nil, fmt.Errorf("none of the %d node(s) of server %s in the registry answered (%s)", len(urls), server, strings.Join(why, "; "))
}

// waitSeeds is findSeeds for relay up: what may pass (the registry or the nodes not reachable yet) is tried again
// with pauses doubling from wait[0] to wait[1], until stop.
func waitSeeds(src, server, own string, j joinNet, log *slog.Logger, stop <-chan struct{}, wait [2]time.Duration, addNode string) ([]string, error) {
	d := wait[0]
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		seeds, err := findSeeds(ctx, src, server, own, j)
		cancel()
		if err == nil {
			return seeds, nil
		}
		var f fatalJoin
		if errors.As(err, &f) {
			return nil, err
		}
		log.Info("looking for the server's nodes in the registry", "why", err.Error(), "next_try_in", d.String(),
			"meanwhile", "ask its operators to run: "+addNode)
		select {
		case <-stop:
			return nil, errStopped
		case <-time.After(d):
		}
		if d *= 2; d > wait[1] {
			d = wait[1]
		}
	}
}

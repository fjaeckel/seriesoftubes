package main

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

/* Live states (protocol 5.11): each player sends its current numbers every --state-every while it
   plays, when they changed (a --state-change fraction of the ticks) or the keepalive is due, as a
   game does. Their propagation is measured as players see it, on the boards of now: now and then a
   player's state carries a marker (an unusual pies value), and a prober session on every server
   asks the pies board of now for that player until the marker shows. */

// stateKeep is the keepalive of a game's live state when nothing changed (5.11).
const stateKeep = 180 * time.Second

// probeN numbers the probes' markers.
var probeN atomic.Int64

// state sends this player's live state when it changed (change) or the keepalive is due.
func (p *player) state(ctx context.Context, change bool) {
	w := p.w
	p.mu.Lock()
	if change || p.stBody == nil {
		p.stBody = p.body()
	}
	body := p.stBody
	if p.marker != 0 {
		body = maps.Clone(body)
		body["pies"] = p.marker
	}
	due := change || time.Since(p.stAt) >= stateKeep
	p.mu.Unlock()
	if !due {
		w.m.add("states_unchanged", 1)
		return
	}
	if p.sendState(ctx, body) {
		p.mu.Lock()
		p.stAt = time.Now()
		p.mu.Unlock()
	}
}

func (p *player) sendState(ctx context.Context, body map[string]any) bool {
	f := p.request(ctx, "state", map[string]any{"m": "state", "rec": p.key.Seal("state", time.Now().Unix(), body)})
	if f != nil {
		p.w.m.add("states", 1)
	}
	return f != nil
}

// probeStates runs one probe at a time until ctx ends: a random connected player sends a state
// with a new marker; a prober on every other server polls the pies board of now for that player.
func probeStates(ctx context.Context, w *world) {
	cls := make([]*client.Client, len(w.c.relays))
	defer func() {
		for _, c := range cls {
			if c != nil {
				c.Close()
			}
		}
	}()
	dial := func(i int) *client.Client {
		if cls[i] != nil {
			return cls[i]
		}
		h := http.Header{}
		h.Set("X-Forwarded-For", fmt.Sprintf("10.253.%d.%d", i/256, i%256))
		dctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		c, err := client.Dial(dctx, w.c.relays[i].url, client.Options{HTTPClient: w.hc, Header: h})
		if err != nil {
			return nil
		}
		cls[i] = c
		return c
	}
	for k := 0; ctx.Err() == nil; k++ {
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
		p := w.players[(k*7919)%len(w.players)]
		if !p.connected.Load() || p.client() == nil {
			continue
		}
		marker := int64(9000000 + probeN.Add(1))
		p.mu.Lock()
		p.marker = marker
		if p.stBody == nil {
			p.stBody = p.body()
		}
		body := maps.Clone(p.stBody)
		p.mu.Unlock()
		body["pies"] = marker
		id := fmt.Sprintf("state %d", marker)
		at := time.Now()
		all := make([]bool, len(w.c.relays))
		for i := range all {
			all[i] = true
		}
		w.sprop.put(id, p.srv, at, all)
		if !p.sendState(ctx, body) {
			continue
		}
		done := make(chan struct{}, len(w.c.relays))
		for i := range w.c.relays {
			if i == p.srv {
				done <- struct{}{}
				continue
			}
			go func() {
				defer func() { done <- struct{}{} }()
				deadline := at.Add(30 * time.Second)
				for time.Now().Before(deadline) && ctx.Err() == nil {
					if seen(ctx, dial(i), p.key.Key, marker) {
						w.sprop.saw(id, i, time.Now())
						return
					}
					time.Sleep(500 * time.Millisecond)
				}
			}()
		}
		for range w.c.relays {
			<-done
		}
	}
}

// seen asks a server's pies board of now whether key shows the marker.
func seen(ctx context.Context, c *client.Client, key string, marker int64) bool {
	if c == nil {
		return false
	}
	rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	f, err := c.Request(rctx, map[string]any{"m": "rank", "board": "pies", "measure": "now", "division": "all", "n": int64(1),
		"filters": map[string]any{"keys": []any{key}}})
	if err != nil {
		return false
	}
	rows, _ := f.Raw["rows"].([]any)
	if len(rows) == 0 {
		return false
	}
	v, _ := wire.Int(rows[0].(map[string]any)["value"])
	return v == marker
}

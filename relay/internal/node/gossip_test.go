package node_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// recSize is the bytes an entry's records count against the catalog's byte bounds.
func recSize(f *fakeServer) int {
	return len(canon.Encode([]any{f.entry["genesis"], f.entry["chain"], f.entry["server"]}))
}

// withServerAt is the fake's entry with a server record made at t, seen at seen.
func withServerAt(n *rt.Net, f *fakeServer, name string, t, seen int64) map[string]any {
	op, nk := rt.Key("op "+name), rt.Key("node "+name)
	url := "wss://" + strings.ReplaceAll(name, " ", "-") + ".example.net/fed"
	st := &ops.State{Server: f.ID, Head: f.ID, Operators: []string{op.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{nk.Key, url})
	e := map[string]any{}
	for k, v := range f.entry {
		e[k] = v
	}
	e["server"] = ops.ServerRecord(st, op, ops.ServerFields{Name: name, Sync: "open", NoLogs: true, Langs: []string{"en"}}, t)
	e["seen"] = seen
	return e
}

// listen reads a session's frames in the background (a read that times out would close it).
type listener struct {
	t      *testing.T
	frames chan *wire.Frame
}

func listen(t *testing.T, r *raw) *listener {
	l := &listener{t, make(chan *wire.Frame, 1<<14)}
	go func() {
		defer close(l.frames)
		for {
			_, b, err := r.c.Read(context.Background())
			if err != nil {
				return
			}
			f, werr := wire.Parse(b, fed.NodeFrame)
			if werr != nil {
				return
			}
			l.frames <- f
		}
	}()
	return l
}

// catalogFrames takes frames for d (or until carry, when untilCarry) and counts, per server id,
// the catalog entries about it; carry reports whether a carry came, open whether the session stayed open.
func (l *listener) catalogFrames(d time.Duration, untilCarry bool) (seen map[string]int, carry, open bool) {
	seen = map[string]int{}
	end := time.After(d)
	for {
		select {
		case f, ok := <-l.frames:
			if !ok {
				return seen, carry, false
			}
			switch f.M {
			case "carry":
				carry = true
				if untilCarry {
					return seen, carry, true
				}
			case "catalog":
				list, _ := f.Raw["entries"].([]any)
				for _, e := range list {
					srv, _ := e.(map[string]any)["server"].(map[string]any)
					body, _ := srv["body"].(map[string]any)
					id, _ := body["server"].(string)
					seen[id]++
				}
			}
		case <-end:
			return seen, carry, true
		}
	}
}

// The catalog is bounded by bytes too, not only by entries: per neighbour, and smaller for
// servers the registry does not list (anyone can make one).
func TestCatalogIsBoundedByBytes(t *testing.T) {
	n := rt.New(t)
	probe := makeServer(t, n, "size probe")
	size := recSize(probe)
	t.Run("per neighbour", func(t *testing.T) {
		t.Cleanup(node.SetCatalogBytes(64<<20, 3*size+size/2, 64<<20))
		x := n.Found("bytes victim", "open").Nodes[0]
		m := makeServer(t, n, "bytes chatty")
		var others []*fakeServer
		for i := 0; i < 5; i++ {
			others = append(others, makeServer(t, n, fmt.Sprint("bytes other ", i)))
		}
		r := connectAs(t, x, m)
		frame := []any{m.entry}
		for _, o := range others {
			frame = append(frame, o.via(m.ID))
		}
		r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": frame}))
		rt.Eventually(t, "the first entries", func() bool { ids := catalogIDs(t, x); return ids[m.ID] && ids[others[1].ID] })
		time.Sleep(100 * time.Millisecond)
		ids := catalogIDs(t, x)
		for _, o := range others[2:] {
			if ids[o.ID] {
				t.Fatal("more bytes than the per-neighbour bound were stored")
			}
		}
	})
	t.Run("unlisted", func(t *testing.T) {
		t.Cleanup(node.SetCatalogBytes(64<<20, 64<<20, 2*size+size/2))
		x := n.Found("unlisted victim", "open").Nodes[0]
		m := makeServer(t, n, "unlisted chatty")
		var others []*fakeServer
		for i := 0; i < 4; i++ {
			others = append(others, makeServer(t, n, fmt.Sprint("unlisted other ", i)))
		}
		r := connectAs(t, x, m)
		frame := []any{m.entry}
		for _, o := range others {
			frame = append(frame, o.via(m.ID))
		}
		r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": frame}))
		rt.Eventually(t, "the first entries", func() bool { ids := catalogIDs(t, x); return ids[m.ID] && ids[others[0].ID] })
		time.Sleep(100 * time.Millisecond)
		ids := catalogIDs(t, x)
		for _, o := range others[1:] {
			if ids[o.ID] {
				t.Fatal("more bytes of unlisted servers than their budget were stored")
			}
		}
	})
}

// A catalog larger than a node session's queue is paged as the peer reads: the session lives,
// hears every entry and then carry.
func TestLargeCatalogIsPagedToNewSessions(t *testing.T) {
	t.Cleanup(node.SetNodeQueue(96<<10, 32<<10))
	n := rt.New(t)
	x := n.Found("big catalog", "open").Nodes[0]
	var list []any
	var ids []string
	for i := 0; i < 600; i++ {
		f := makeServer(t, n, fmt.Sprint("paged ", i))
		list = append(list, f.entry)
		ids = append(ids, f.ID)
	}
	x.Stop()
	if err := os.WriteFile(filepath.Join(x.Dir, "catalog.json"), canon.Encode(map[string]any{"entries": list}), 0o600); err != nil {
		t.Fatal(err)
	}
	x.Restart()
	if len(catalogIDs(t, x)) < len(ids) {
		t.Fatal("the catalog file was not loaded")
	}
	m := makeServer(t, n, "newcomer")
	r := connectAs(t, x, m)
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{m.entry}}))
	got, carry, open := listen(t, r).catalogFrames(5*time.Second, true)
	if !open {
		t.Fatal("the session closed: the catalog was queued at once")
	}
	for _, id := range ids {
		if got[id] == 0 {
			t.Fatalf("an entry of the catalog was not sent: %d ids, carry %v", len(got), carry)
		}
	}
	if !carry {
		t.Fatal("carry did not follow the catalog")
	}
}

// An entry heard again unchanged does not make the catalog file due again.
func TestUnchangedEntryDoesNotDirtyTheCatalog(t *testing.T) {
	n := rt.New(t)
	x := n.Found("quiet file", "open").Nodes[0]
	m := makeServer(t, n, "steady")
	r := connectAs(t, x, m)
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{m.entry}}))
	rt.Eventually(t, "the entry", func() bool { return catalogIDs(t, x)[m.ID] })
	x.R.FlushCatalog()
	if x.R.CatalogDirty() {
		t.Fatal("the flush left the catalog due")
	}
	for i := 0; i < 3; i++ {
		r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{m.entry}}))
	}
	l := listen(t, r)
	r.send(websocket.MessageText, []byte(`{"m":"ping","id":7}`))
	for f := range l.frames {
		if f.M == "pong" {
			break
		}
	}
	if x.R.CatalogDirty() {
		t.Fatal("the same entry again made the catalog file due")
	}
}

// An older entry replayed is not passed on (what is kept did not change), and a server's entry
// is passed on at most once a minute however often it changes.
func TestReplayedEntriesAreNotForwarded(t *testing.T) {
	n := rt.New(t)
	x := n.Found("relay victim", "open").Nodes[0]
	a, b := makeServer(t, n, "replayer"), makeServer(t, n, "listener")
	ra := connectAs(t, x, a)
	ra.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{a.entry}}))
	rb := connectAs(t, x, b)
	lb := listen(t, rb)
	rb.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{b.entry}}))
	lb.catalogFrames(5*time.Second, true) // what b hears when it comes

	const name = "flapper"
	f := makeServer(t, n, name)
	now := n.Clock.Unix()
	older := withServerAt(n, f, name, now-10, now)
	newer := withServerAt(n, f, name, now, now)
	newer["path"] = []any{f.ID, a.ID}
	ra.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{newer}}))
	got, _, _ := lb.catalogFrames(300*time.Millisecond, false)
	if got[f.ID] != 1 {
		t.Fatalf("the new entry was passed on %d times, want once", got[f.ID])
	}
	n.Clock.Add(2 * time.Minute)
	for i := 0; i < 10; i++ {
		e := map[string]any{}
		for k, v := range older {
			e[k] = v
		}
		e["path"] = []any{f.ID, a.ID}
		e["seen"] = n.Clock.Unix() - int64(i)
		ra.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{e}}))
	}
	got, _, _ = lb.catalogFrames(300*time.Millisecond, false)
	if got[f.ID] != 0 {
		t.Fatalf("a replayed older entry was passed on %d times", got[f.ID])
	}
	// Newer server records, one after the other within a minute: at most one goes on.
	n.Clock.Add(10 * time.Minute)
	for i := 0; i < 5; i++ {
		e := withServerAt(n, f, name, n.Clock.Unix()+int64(i), n.Clock.Unix())
		e["path"] = []any{f.ID, a.ID}
		ra.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{e}}))
	}
	got, _, _ = lb.catalogFrames(300*time.Millisecond, false)
	if got[f.ID] != 1 {
		t.Fatalf("changes within a minute were passed on %d times, want once", got[f.ID])
	}
}

// Every element of a path must be a server id, not only the first.
func TestCatalogPathElementsAreIDs(t *testing.T) {
	n := rt.New(t)
	x := n.Found("path victim", "open").Nodes[0]
	m, o := makeServer(t, n, "path sender"), makeServer(t, n, "path other")
	r := connectAs(t, x, m)
	r.send(websocket.MessageText, canon.Encode(map[string]any{"m": "catalog", "entries": []any{m.entry, o.via("not a server id")}}))
	refused := false
	for i := 0; i < 10 && !refused; i++ {
		code, open := r.next()
		if !open {
			t.Fatal("the session closed")
		}
		refused = code == fed.BadField
	}
	if !refused || catalogIDs(t, x)[o.ID] {
		t.Fatal("an entry with a path element that is no server id was kept")
	}
}

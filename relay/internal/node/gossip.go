package node

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/catalog"
	"github.com/fjaeckel/seriesoftubes/relay/internal/chain"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// catEntry is what gossip told this node about one server (10.8).
type catEntry struct {
	ID      string
	Genesis *fed.Record
	Chain   []*fed.Record
	Server  *fed.Record
	State   *chain.State
	Path    []string
	Seen    int64
	sent    int64 // when it was last passed on
}

func (c *catEntry) value(path []string) map[string]any {
	ch := make([]any, len(c.Chain))
	for i, r := range c.Chain {
		ch[i] = r.Value
	}
	return map[string]any{"genesis": c.Genesis.Value, "chain": ch, "server": c.Server.Value, "path": strList(path), "seen": c.Seen}
}

// ownEntry is this server's own entry, or nil while its server record is not at the head.
func (r *Relay) ownEntry(now int64) map[string]any {
	if r.own == nil || r.ownSrv == nil || r.ownSrv.Str("head") != r.own.Head || len(r.own.Applied) > fed.MaxChain {
		return nil
	}
	c := &catEntry{Genesis: r.own.Genesis, Chain: r.own.Applied, Server: r.ownSrv, Seen: now}
	return c.value([]string{r.own.ID})
}

func (r *Relay) ownEntryID() string {
	if r.own == nil || r.ownSrv == nil {
		return ""
	}
	return r.own.Head + r.ownSrv.ID
}

// sendOwnEntry gossips this server's entry to sessions with other servers (lock held).
func (r *Relay) sendOwnEntry(now int64) {
	e := r.ownEntry(now)
	if e == nil {
		return
	}
	r.gossip = now
	for s := range r.nodes {
		if !s.same && s.verified {
			s.enqueue(map[string]any{"m": "catalog", "entries": []any{e}})
		}
	}
}

// receiveEntry checks and stores one gossip entry, passing it on when it is new.
func (r *Relay) receiveEntry(from *session, x any, now int64) string {
	m, ok := x.(map[string]any)
	if !ok {
		return fed.BadField
	}
	g, code := fed.CheckLoose(m["genesis"], now, fed.Opts{Allow: func(k string) bool { return k == "genesis" }})
	if code != "" {
		return code
	}
	list, ok := m["chain"].([]any)
	if !ok {
		return fed.BadField
	}
	if len(list) > fed.MaxChain {
		return fed.TooMany
	}
	var ch []*fed.Record
	for _, y := range list {
		rec, code := fed.CheckLoose(y, now, fed.Opts{Allow: func(k string) bool { return k == "operators" }})
		if code != "" {
			return code
		}
		ch = append(ch, rec)
	}
	srv, code := fed.CheckLoose(m["server"], now, fed.Opts{Allow: func(k string) bool { return k == "server" }})
	if code != "" {
		return code
	}
	st, code := chain.CheckSequence(g, ch)
	if code != "" {
		return code
	}
	if code := st.CheckServer(srv); code != "" {
		return code
	}
	if srv.Str("head") != st.Head {
		return fed.BadChain
	}
	var path []string
	pl, ok := m["path"].([]any)
	if !ok {
		return fed.BadField
	}
	for _, p := range pl {
		ps, ok := p.(string)
		if !ok {
			return fed.BadField
		}
		path = append(path, ps)
	}
	seen, ok := wire.Int(m["seen"])
	if !ok {
		return fed.BadField
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	self := ""
	if r.own != nil {
		self = r.own.ID
	}
	d := catalog.Receive(now, self, g.ID, path, seen)
	switch d.Action {
	case "refuse":
		return d.Error
	case "drop":
		return ""
	}
	old := r.cat[g.ID]
	c := &catEntry{ID: g.ID, Genesis: g, Chain: ch, Server: srv, State: st, Path: path, Seen: seen}
	changed := old == nil || old.Server.ID != srv.ID
	if old != nil {
		// Records from the newest server record; seen and path from the freshest entry.
		if srv.T < old.Server.T || srv.T == old.Server.T && srv.ID > old.Server.ID {
			c.Genesis, c.Chain, c.Server, c.State = old.Genesis, old.Chain, old.Server, old.State
		}
		if seen < old.Seen || seen == old.Seen && !shorter(path, old.Path) {
			c.Path, c.Seen = old.Path, old.Seen
		}
		c.sent = old.sent
	}
	r.cat[g.ID] = c
	if from != nil && from.peerServer == g.ID && !from.verified {
		if !st.IsNode(from.peerNode) {
			from.fail(0, fed.NotNode, 0)
			return ""
		}
		from.verified = true
		r.startSync(from)
	}
	r.saveCatalog()
	if d.Forward != nil && (changed || now-c.sent >= 600) {
		c.sent = now
		fw := c.value(d.Forward)
		fw["seen"] = seen
		for s := range r.nodes {
			if s != from && !s.same && s.verified && hasClass(s.send, "catalog") {
				s.enqueue(map[string]any{"m": "catalog", "entries": []any{fw}})
			}
		}
	}
	return ""
}

func hasClass(list []string, c string) bool {
	for _, x := range list {
		if x == c {
			return true
		}
	}
	return false
}

func shorter(a, b []string) bool {
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] < b[i]
		}
	}
	return false
}

// sendCatalog answers servers: this server's entry and the live gossip entries (lock held).
// Entries are split over several catalog frames when one would pass the client frame limit.
func (r *Relay) sendCatalog(s *session, id int64, now int64) {
	var entries []map[string]any
	if e := r.ownEntry(now); e != nil {
		entries = append(entries, e)
	}
	for _, k := range sortedKeys(r.cat) {
		c := r.cat[k]
		if now < c.Seen+fed.GossipExpiry {
			entries = append(entries, c.value(c.Path))
		}
	}
	pages := pageItems(entries, fed.MaxItems, fed.ClientFrame-1024)
	for i, p := range pages {
		s.enqueue(map[string]any{"m": "catalog", "id": id, "entries": p, "more": i < len(pages)-1})
	}
}

// Catalog file: the gossip entries this node keeps, rewritten on change.
func (r *Relay) catalogPath() string { return filepath.Join(r.o.Dir, "catalog.json") }

func (r *Relay) saveCatalog() {
	var list []any
	for _, k := range sortedKeys(r.cat) {
		list = append(list, r.cat[k].value(r.cat[k].Path))
	}
	if list == nil {
		list = []any{}
	}
	if err := store.WriteAtomic(r.catalogPath(), append(canon.Encode(map[string]any{"entries": list}), '\n'), 0o600); err != nil {
		r.o.Log.Error("catalog: write failed", "err", err)
	}
}

func (r *Relay) loadCatalog() {
	b, err := os.ReadFile(r.catalogPath())
	if err != nil {
		return
	}
	v, code := canon.Parse(b)
	if code != "" {
		return
	}
	m, _ := v.(map[string]any)
	list, _ := m["entries"].([]any)
	now := r.now()
	r.mu.Unlock()
	for _, x := range list {
		r.receiveStored(x, now)
	}
	r.mu.Lock()
}

// receiveStored loads an entry from disk without passing it on.
func (r *Relay) receiveStored(x any, now int64) {
	m, ok := x.(map[string]any)
	if !ok {
		return
	}
	// Loaded entries keep their path; this node is not appended twice.
	_ = r.receiveEntry(nil, m, now)
}

// Registry snapshot (servers.json): read from a file or fetched over https, cached on disk.

func (r *Relay) registryCache() string { return filepath.Join(r.o.Dir, "servers.json") }

func (r *Relay) loadRegistryCache() {
	if b, err := os.ReadFile(r.registryCache()); err == nil {
		r.setRegistryLocked(b)
	}
}

// SetRegistry installs a servers.json snapshot (tests, and after each refresh).
func (r *Relay) SetRegistry(b []byte) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.setRegistryLocked(b)
}

func (r *Relay) setRegistryLocked(b []byte) error {
	snap, err := registry.ReadSnapshot(b, r.now())
	if err != nil {
		return err
	}
	r.reg = snap
	r.regs = map[string]*registry.Entry{}
	for _, e := range snap.Entries {
		r.regs[e.ID] = e
	}
	r.shunAt = 0
	return nil
}

func (r *Relay) refreshRegistry() {
	r.mu.Lock()
	src := r.cfg.Registry
	r.mu.Unlock()
	if src == "" {
		return
	}
	var b []byte
	var err error
	if strings.HasPrefix(src, "https://") {
		b, err = r.fetch(src)
	} else {
		b, err = os.ReadFile(src)
	}
	if err != nil {
		r.o.Log.Info("registry: not refreshed", "err", err)
		return
	}
	if err := r.SetRegistry(b); err != nil {
		r.o.Log.Info("registry: not usable", "err", err)
		return
	}
	_ = store.WriteAtomic(r.registryCache(), b, 0o600)
}

func (r *Relay) fetch(url string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(r.ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	c := r.o.HTTPClient
	if c == nil {
		c = http.DefaultClient
	}
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, &json.UnsupportedValueError{Str: resp.Status}
	}
	return io.ReadAll(io.LimitReader(resp.Body, 16<<20))
}

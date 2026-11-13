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
	"github.com/fjaeckel/seriesoftubes/relay/internal/shun"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
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
	Impl    map[string]*update.Impl // what its nodes run, as the entry with Seen said (informational)
	sent    int64                   // when it was last passed on
	via     string                  // the neighbour server it first came from ("" from disk)
	hash    string                  // of the records as checked: the same records again are not checked again
}

// Bounds of the catalog: in all, and learned through any one neighbour (10.8 allows them).
// Vars so tests can lower them.
var (
	maxCatalog    = 4096
	maxCatalogVia = 512
)

const catalogSaveDelay = 10 * time.Second

// maxEntry bounds a catalog entry's canonical JSON. Every entry kept then fits one client catalog
// frame (65536 bytes) with room for the frame and a path grown by passing it on, so a `servers`
// answer always pages; a registry file, which holds the same records, is at most 65536 bytes too.
const maxEntry = fed.ClientFrame - 4096

// forget drops a catalog entry (lock held).
func (r *Relay) forget(id string) {
	if c := r.cat[id]; c != nil {
		if r.catVia[c.via]--; r.catVia[c.via] <= 0 {
			delete(r.catVia, c.via)
		}
		delete(r.cat, id)
		r.markCatalog()
	}
}

// entryOf reports whether a catalog entry is the given server's own (by its server record), without checking it.
func entryOf(x any, server string) bool {
	m, _ := x.(map[string]any)
	srv, _ := m["server"].(map[string]any)
	body, _ := srv["body"].(map[string]any)
	id, _ := body["server"].(string)
	return id == server
}

func (c *catEntry) value(path []string) map[string]any {
	ch := make([]any, len(c.Chain))
	for i, r := range c.Chain {
		ch[i] = r.Value
	}
	m := map[string]any{"genesis": c.Genesis.Value, "chain": ch, "server": c.Server.Value, "path": strList(path), "seen": c.Seen}
	if v := implsValue(c.Impl); v != nil {
		m["impl"] = v
	}
	return m
}

// implsValue is an entry's impl member: [{node, name, version}] sorted by node; nil when there
// is none. (A list: member names of canonical JSON are at most 32 characters, node keys longer.)
func implsValue(im map[string]*update.Impl) []any {
	if len(im) == 0 {
		return nil
	}
	out := make([]any, 0, len(im))
	for _, k := range sortedKeys(im) {
		v := im[k].Value()
		v["node"] = k
		out = append(out, v)
	}
	return out
}

// readImpls reads an entry's impl member (10.8) for the entry's server's nodes.
func readImpls(v any, st *chain.State) map[string]*update.Impl { return update.ReadImpls(v, st.IsNode) }

// ownEntry is this server's own entry, or nil while its server record is not at the head.
func (r *Relay) ownEntry(now int64) map[string]any {
	if r.own == nil || r.headSrv == nil || len(r.own.Applied) > fed.MaxChain {
		return nil
	}
	c := &catEntry{Genesis: r.own.Genesis, Chain: r.own.Applied, Server: r.headSrv, Seen: now, Impl: r.ownImpls()}
	return c.value([]string{r.own.ID})
}

func (r *Relay) ownEntryID() string {
	if r.own == nil || r.headSrv == nil {
		return ""
	}
	return r.own.Head + r.headSrv.ID
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
	// Shape and size first, signatures last: nothing costly is done for an entry not kept.
	gv, code := canon.Check(m["genesis"])
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
	chv := make([]any, len(list))
	for i, y := range list {
		if chv[i], code = canon.Check(y); code != "" {
			return code
		}
	}
	sv, code := canon.Check(m["server"])
	if code != "" {
		return code
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
	if len(canon.Encode(map[string]any{"genesis": gv, "chain": chv, "server": sv, "path": path, "seen": seen})) > maxEntry {
		return fed.TooBig
	}
	isGenesis := func(k string) bool { return k == "genesis" }
	// The genesis id without its signature, to find what this node already checked.
	g, code := fed.CheckValue(gv, now, fed.Opts{Allow: isGenesis, Trusted: true})
	if code != "" {
		return code
	}
	hash := fed.Hash(canon.Encode([]any{gv, chv, sv}))
	r.mu.Lock()
	old := r.cat[g.ID]
	r.mu.Unlock()
	var ch []*fed.Record
	var srv *fed.Record
	var st *chain.State
	if old != nil && old.hash == hash {
		g, ch, srv, st = old.Genesis, old.Chain, old.Server, old.State
	} else {
		if g, code = fed.CheckValue(gv, now, fed.Opts{Allow: isGenesis}); code != "" {
			return code
		}
		for _, y := range chv {
			rec, code := fed.CheckValue(y, now, fed.Opts{Allow: func(k string) bool { return k == "operators" }})
			if code != "" {
				return code
			}
			ch = append(ch, rec)
		}
		if srv, code = fed.CheckValue(sv, now, fed.Opts{Allow: func(k string) bool { return k == "server" }}); code != "" {
			return code
		}
		if st, code = chain.CheckSequence(g, ch); code != "" {
			return code
		}
		if code := st.CheckServer(srv); code != "" {
			return code
		}
		if srv.Str("head") != st.Head {
			return fed.BadChain
		}
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
	if from != nil && from.peerServer == g.ID && !from.verified {
		// The peer's own entry: it tells who its nodes are and its policy (9.4, 10.9).
		if !st.IsNode(from.peerNode) {
			from.fail(0, fed.NotNode, 0)
			return ""
		}
		if !allowsOne(r.ownSync(), r.cfg.Selective, g.ID, srv.Str("sync")) {
			from.fail(0, fed.Policy, 0)
			return ""
		}
		from.verified = true
		if !r.dedupe(from) {
			return ""
		}
		r.setClasses(from, st)
		r.startSync(from)
	}
	old = r.cat[g.ID]
	via := ""
	if from != nil {
		via = from.peerServer
	}
	// A node of this server is no neighbour to bound: it passes on what other servers told it.
	sibling := from != nil && from.same
	if old == nil && (len(r.cat) >= maxCatalog || !sibling && r.catVia[via] >= maxCatalogVia) {
		return "" // full: entries already kept still update, new ones wait for room
	}
	impl := readImpls(m["impl"], st)
	c := &catEntry{ID: g.ID, Genesis: g, Chain: ch, Server: srv, State: st, Path: path, Seen: seen, Impl: impl, via: via, hash: hash}
	changed := old == nil || old.Server.ID != srv.ID
	if old != nil {
		// Records from the newest server record; seen and path from the freshest entry.
		if srv.T < old.Server.T || srv.T == old.Server.T && srv.ID > old.Server.ID {
			c.Genesis, c.Chain, c.Server, c.State, c.hash = old.Genesis, old.Chain, old.Server, old.State, old.hash
		}
		if seen < old.Seen || seen == old.Seen && !shorter(path, old.Path) {
			c.Path, c.Seen, c.Impl = old.Path, old.Seen, old.Impl
		}
		c.sent, c.via = old.sent, old.via
	} else {
		r.catVia[via]++
	}
	r.cat[g.ID] = c
	r.markCatalog()
	if d.Forward != nil && (changed || now-c.sent >= 600) {
		c.sent = now
		fw := c.value(d.Forward)
		fw["seen"] = seen
		if v := implsValue(impl); v != nil {
			fw["impl"] = v
		} else {
			delete(fw, "impl")
		}
		// This server's other nodes get it as it came (they are the same server, not a hop):
		// with one session per pair of servers, often only one of them has one with its server.
		var sib map[string]any
		if from != nil && !from.same {
			sib = c.value(path)
			sib["seen"] = seen
			if v := implsValue(impl); v != nil {
				sib["impl"] = v
			} else {
				delete(sib, "impl")
			}
		}
		for s := range r.nodes {
			if s == from || !s.verified || !hasClass(s.send, "catalog") {
				continue
			}
			if !s.same {
				s.enqueue(map[string]any{"m": "catalog", "entries": []any{fw}})
			} else if sib != nil {
				s.enqueue(map[string]any{"m": "catalog", "entries": []any{sib}})
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

// catalogEntries is the answer to servers: this server's entry and the live gossip entries
// (lock held). They are paged over several catalog frames when one would pass the frame limit.
func (r *Relay) catalogEntries(now int64) []map[string]any {
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
	return entries
}

// Catalog file: the gossip entries this node keeps, rewritten at most every catalogSaveDelay
// after a change (and on close), never once per entry.
func (r *Relay) catalogPath() string { return filepath.Join(r.o.Dir, "catalog.json") }

// markCatalog schedules a write of the catalog file (lock held).
func (r *Relay) markCatalog() {
	if r.catDirty || r.loading {
		r.catDirty = true
		return
	}
	r.catDirty = true
	time.AfterFunc(catalogSaveDelay, func() {
		if r.ctx.Err() == nil {
			r.flushCatalog()
		}
	})
}

// flushCatalog writes the catalog file if it changed; the file is written outside the lock.
func (r *Relay) flushCatalog() {
	r.catWrite.Lock()
	defer r.catWrite.Unlock()
	r.mu.Lock()
	if !r.catDirty {
		r.mu.Unlock()
		return
	}
	r.catDirty = false
	list := []any{}
	for _, k := range sortedKeys(r.cat) {
		list = append(list, r.cat[k].value(r.cat[k].Path))
	}
	b := append(canon.Encode(map[string]any{"entries": list}), '\n')
	r.mu.Unlock()
	if err := store.WriteAtomic(r.catalogPath(), b, 0o600); err != nil {
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
	r.loading = true
	r.mu.Unlock()
	for _, x := range list {
		r.receiveStored(x, now)
	}
	r.mu.Lock()
	r.loading, r.catDirty = false, false
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
	if err := r.setRegistryLocked(b); err != nil {
		return err
	}
	// Automatic peers follow the snapshot: new ones dialled, ones gone or no longer eligible closed.
	r.reconcileLocked()
	return nil
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
	reg := shun.Registry{AsOf: snap.AsOf}
	for _, e := range snap.Entries {
		reg.Servers = append(reg.Servers, shun.Server{ID: e.ID, Operators: e.State.Operators, Listed: e.Listed, Answered: e.Answered})
	}
	r.counter = shun.Prepare(reg)
	r.shunAt = 0
	return nil
}

func (r *Relay) refreshRegistry() {
	// relay.json lives beside servers.json and is read on the same schedule (docs/RELAY.md).
	defer r.checkUpdate()
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

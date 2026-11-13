package node

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/boards"
	"github.com/fjaeckel/seriesoftubes/relay/internal/catalog"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/rank"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

// What the command line sees through the local socket. Nothing here holds an address.

// PutValue checks and stores a record from the command line, like a client's put.
func (r *Relay) PutValue(v any) (map[string]any, string) {
	rec, code := fed.CheckValue(v, r.now(), fed.Opts{})
	if code != "" {
		return nil, code
	}
	res, _, code := r.ingest(rec, nil, origin{client: true})
	if code != "" {
		return nil, code
	}
	return map[string]any{"rid": rec.ID, "result": res}, ""
}

// Get returns a stored record.
func (r *Relay) Get(id string) map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	if e := r.st.Get(id); e != nil {
		if rec := r.st.Rec(e); rec != nil {
			return rec.Value
		}
	}
	return nil
}

// State is the server as this node sees it: lists, head and current records.
func (r *Relay) State() map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := map[string]any{"server": r.cfg.Server, "node": r.Key(), "serving": r.serving()}
	if r.own != nil {
		out["head"] = r.own.Head
		out["operators"] = r.own.Operators
		out["nodes"] = r.own.Nodes
		out["genesis"] = r.own.Genesis.Value
		out["sync"] = r.ownSync()
	}
	if r.ownSrv != nil {
		out["serverRecord"] = r.ownSrv.Value
	}
	if r.hide != nil {
		out["hide"] = r.hide.Value
	}
	return out
}

// Pending lists proposals and server records waiting for signatures.
func (r *Relay) Pending() []map[string]any {
	now := r.now()
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []map[string]any
	if r.own == nil {
		return out
	}
	for _, p := range r.own.Pending(now) {
		out = append(out, map[string]any{"id": p.ID, "kind": p.Kind, "action": p.Str("action"), "target": p.Str("target"),
			"url": p.Str("url"), "t": p.T, "signers": p.Signers(), "expires": p.T + fed.PendingLife, "record": p.Value})
	}
	for e := range r.st.Kind("server") {
		s := r.st.Rec(e)
		if s == r.ownSrv || s.Str("server") != r.own.ID || r.own.ServerShape(s) != "" || r.own.CheckServer(s) == "" || now >= s.T+fed.PendingLife {
			continue
		}
		out = append(out, map[string]any{"id": s.ID, "kind": "server", "head": s.Str("head"), "t": s.T,
			"signers": s.Signers(), "expires": s.T + fed.PendingLife, "record": s.Value})
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["id"].(string) < out[j]["id"].(string) })
	return out
}

// Status counts what this node holds; counts and keys only.
func (r *Relay) Status() map[string]any {
	now := r.now()
	r.mu.Lock()
	defer r.mu.Unlock()
	kinds := map[string]int{}
	for _, k := range fed.RecordKinds {
		kinds[k] = r.st.Count(k)
	}
	peers := []map[string]any{}
	for s := range r.nodes {
		p := map[string]any{"server": s.peerServer, "node": s.peerNode, "same": s.same, "synced": s.synced, "ver": s.ver,
			"auto": !s.same && r.auto[s.peerServer], "dialled": s.dialURL != ""}
		if s.impl != nil {
			p["relay"] = s.impl.Version
		}
		peers = append(peers, p)
	}
	sort.Slice(peers, func(i, j int) bool { return peers[i]["node"].(string) < peers[j]["node"].(string) })
	r.tally(now)
	out := map[string]any{"server": r.cfg.Server, "node": r.Key(), "serving": r.serving(), "sync": r.ownSync(),
		"clients": len(r.clients), "peers": peers, "records": r.st.Len(), "kinds": kinds,
		"diskBytes": r.st.Size(), "shunned": len(r.shunned), "catalog": len(r.cat), "registry": len(r.regs),
		"version": r.impl.Version, "auto": r.autoStatus()}
	if h := r.upd.hint; h != nil {
		out["update"] = map[string]any{"says": h.Text(), "version": h.Version, "security": h.Security, "notes": h.Notes, "source": h.Source}
	} else if f := r.latest(); f != nil {
		out["latest"] = f.Version
	}
	if r.own != nil {
		out["head"] = r.own.Head
		out["operators"] = len(r.own.Operators)
		out["nodes"] = len(r.own.Nodes)
		out["pending"] = len(r.own.Pending(now))
	}
	if r.ownSrv != nil {
		out["name"] = r.ownSrv.Str("name")
	} else if r.own != nil {
		out["name"] = r.own.Genesis.Str("name")
	}
	return out
}

// Servers merges the registry and gossip (10.8), this server included.
func (r *Relay) Servers() []catalog.Merged {
	now := r.now()
	r.mu.Lock()
	defer r.mu.Unlock()
	var reg []catalog.Known
	for _, e := range r.regs {
		reg = append(reg, catalog.Known{ID: e.ID, Server: summary(e.Server)})
	}
	var gos []catalog.Heard
	for _, c := range r.cat {
		gos = append(gos, catalog.Heard{ID: c.ID, Server: summary(c.Server), Path: c.Path, Seen: c.Seen})
	}
	if r.own != nil && r.ownSrv != nil {
		if _, ok := r.regs[r.own.ID]; !ok {
			gos = append(gos, catalog.Heard{ID: r.own.ID, Server: summary(r.ownSrv), Path: []string{r.own.ID}, Seen: now})
		}
	}
	return catalog.Merge(now, reg, gos)
}

func summary(s *fed.Record) catalog.Summary {
	var nodes []string
	list, _ := s.Body["nodes"].([]any)
	for _, n := range list {
		m, _ := n.(map[string]any)
		u, _ := m["url"].(string)
		nodes = append(nodes, u)
	}
	return catalog.Summary{RID: s.ID, T: s.T, Name: s.Str("name"), Nodes: nodes, Operators: s.StrList("operators")}
}

// Players lists the networks with an announce: name, ASN, quiet state, flags.
func (r *Relay) Players() []map[string]any {
	now := r.now()
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tally(now)
	var out []map[string]any
	for key, recs := range r.byKeyKind("announce") {
		sort.Slice(recs, func(i, j int) bool { return recs[i].T > recs[j].T })
		a := r.st.Rec(recs[0])
		if a == nil {
			continue
		}
		heard := r.lastHeard(key)
		state, _ := boards.Quiet(now, heard)
		out = append(out, map[string]any{"key": key, "name": a.Str("name"), "asn": a.Int("asn"), "lastHeard": heard,
			"state": state, "hidden": r.hidden(key), "refused": r.refusesKey(key), "shunned": r.shunned[key]})
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["key"].(string) < out[j]["key"].(string) })
	return out
}

// Board is one whole board as this node ranks it for players (9.5), every row: the status command.
func (r *Relay) Board(board, measure, division string) ([]rank.Row, error) {
	ans, err := r.rank.Rank(context.Background(), &rank.Slice{Board: board, Measure: measure, Division: division}, r.now(), "", -1)
	if err != nil {
		return nil, err
	}
	return ans.Rows, nil
}

// Nodes lists this server's nodes and whether a session with each is up.
func (r *Relay) Nodes() []map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []map[string]any
	if r.own == nil {
		return out
	}
	up := map[string]bool{}
	for s := range r.nodes {
		if s.same {
			up[s.peerNode] = true
		}
	}
	for _, n := range r.own.Nodes {
		out = append(out, map[string]any{"key": n.Key, "url": n.URL, "self": n.Key == r.Key(), "up": up[n.Key] || n.Key == r.Key()})
	}
	return out
}

// Backup writes a gzipped tar of the data folder (records, catalog, config, node key).
// The operator key is left out: it is backed up separately, and on purpose by hand.
// Under the lock it only opens every file and notes its size: files are appended to or replaced
// by a rename, so what was there then stays readable, and the copy is written without the lock.
func (r *Relay) Backup(path string) error {
	type snap struct {
		f   *os.File
		hdr *tar.Header
	}
	var files []snap
	defer func() {
		for _, s := range files {
			s.f.Close()
		}
	}()
	r.mu.Lock()
	err := filepath.Walk(r.o.Dir, func(p string, fi os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(r.o.Dir, p)
		base := filepath.Base(p)
		if fi.IsDir() || !fi.Mode().IsRegular() || base == "operator.key" || base == store.LockName || strings.HasPrefix(base, ".tmp-") {
			return nil
		}
		src, err := os.Open(p)
		if err != nil {
			return err
		}
		if fi, err = src.Stat(); err != nil {
			src.Close()
			return err
		}
		hdr, err := tar.FileInfoHeader(fi, "")
		if err != nil {
			src.Close()
			return err
		}
		hdr.Name = filepath.ToSlash(rel)
		files = append(files, snap{src, hdr})
		return nil
	})
	r.mu.Unlock()
	if err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	for _, s := range files {
		if err := tw.WriteHeader(s.hdr); err != nil {
			return err
		}
		if _, err := io.CopyN(tw, s.f, s.hdr.Size); err != nil {
			return fmt.Errorf("backup: %s changed while copied: %w", s.hdr.Name, err)
		}
	}
	if err := tw.Close(); err != nil {
		return err
	}
	return gz.Close()
}

// Store exposes the record store to tests in this module.
func (r *Relay) Store() *store.Store { return r.st }

// Lock and Unlock let tests read the store safely.
func (r *Relay) Lock()   { r.mu.Lock() }
func (r *Relay) Unlock() { r.mu.Unlock() }

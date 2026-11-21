package node

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/authority"
	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
)

// The authority file (FEDERATION-PROTOCOL.md 11.5, ADR 0006): read beside the registry like relay.json, kept in the
// data directory so its bans outlast the site being unreachable, the newest (greatest t) winning.

func (r *Relay) authorityPath() string { return filepath.Join(r.o.Dir, "authority.json") }

func (r *Relay) authorityKeys() []string {
	if r.o.AuthorityKeys != nil {
		return r.o.AuthorityKeys
	}
	return authority.Keys()
}

// loadAuthority reads the file kept from an earlier run (start, before serving).
func (r *Relay) loadAuthority() {
	b, err := os.ReadFile(r.authorityPath())
	if err != nil {
		return
	}
	if a, code := authority.Parse(b, r.authorityKeys(), r.now()); code == "" {
		r.auth = a
	} else {
		r.o.Log.Info("authority: kept file not used", "code", code)
	}
}

// checkAuthority reads authority.json beside the registry and takes it when it is newer.
func (r *Relay) checkAuthority() {
	r.mu.Lock()
	src := update.FileBeside(r.cfg.Registry, "authority.json")
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
		r.o.Log.Info("authority: not read", "err", err)
		r.mu.Lock()
		r.applyAuthority(r.now())
		r.mu.Unlock()
		return
	}
	r.SetAuthority(b)
}

// SetAuthority takes an authority file when it checks and is newer than the one held; it reports whether it did.
func (r *Relay) SetAuthority(b []byte) bool {
	now := r.now()
	a, code := authority.Parse(b, r.authorityKeys(), now)
	r.mu.Lock()
	defer r.mu.Unlock()
	if code != "" {
		r.o.Log.Info("authority: not used", "code", code)
		r.applyAuthority(now)
		return false
	}
	if !authority.Newer(r.auth, a) {
		r.applyAuthority(now) // the clock may have made relayMin due
		return false
	}
	r.auth = a
	if err := store.WriteAtomic(r.authorityPath(), a.Raw, 0o600); err != nil {
		r.o.Log.Warn("authority: not kept", "err", err)
	}
	r.o.Log.Info("authority: taken", "t", a.T, "nets", len(a.Nets), "servers", len(a.Servers), "relayMin", a.RelayMin)
	r.applyAuthority(now)
	return true
}

// bannedNet reports whether the authority bans a network (lock held).
func (r *Relay) bannedNet(key string) bool { return r.auth.BansNet(key) }

// nodeRefusal is the code a node session of server running impl is refused with at now, "" when none (lock held).
func (r *Relay) nodeRefusal(server string, impl *update.Impl, now int64) string {
	switch {
	case r.auth.BansServer(server):
		return fed.Banned
	case r.auth.OutOfDate(impl, now):
		return fed.Outdated
	}
	return ""
}

// catRefused reports whether a catalog entry is left out: its server is banned, or every node it lists is out of
// date (an entry without impl stays: the handshake decides then) (lock held).
func (r *Relay) catRefused(id string, impl map[string]*update.Impl, now int64) bool {
	if r.auth.BansServer(id) {
		return true
	}
	if len(impl) == 0 || !r.auth.Applies(now) {
		return false
	}
	for _, im := range impl {
		if !r.auth.OutOfDate(im, now) {
			return false
		}
	}
	return true
}

// applyAuthority makes the held file true now (lock held): banned networks' records go and their sessions close,
// banned and out-of-date servers' sessions close and their catalog entries go, and the excluded lists and boards
// follow. It also warns this relay's operators when this relay is or will be out of date.
func (r *Relay) applyAuthority(now int64) {
	a := r.auth
	if a == nil {
		return
	}
	var drop []string
	for key := range a.Nets {
		for e := range r.st.Key(key) {
			drop = append(drop, e.ID)
		}
	}
	if len(drop) > 0 {
		slices.Sort(drop)
		r.remove(slices.Compact(drop))
	}
	for s := range r.clients {
		if slices.ContainsFunc(s.proved, a.BansNet) {
			s.failClose(fed.Banned)
		}
	}
	for s := range r.nodes {
		if s.peerServer == "" {
			continue
		}
		if code := r.nodeRefusal(s.peerServer, s.impl, now); code != "" {
			s.failClose(code)
		}
	}
	for id, c := range r.cat {
		if r.catRefused(id, c.Impl, now) {
			r.forget(id)
		}
	}
	r.exclChanged(now, "")
	r.rankExcluded()
	own := r.impl
	if a.RelayMin != "" && a.OutOfDate(own, max(now, a.From)) && now-r.authWarned >= warnEvery {
		r.authWarned = now
		when := "now"
		if now < a.From {
			when = "from " + fmtUnix(a.From)
		}
		r.o.Log.Warn("relay out of date: other relays and games stop syncing with this one", "running", r.version(), "relayMin", a.RelayMin, "when", when)
	}
}

// failClose sends err code and closes the session once it is written, whatever the code (a record refused as
// banned is answered without closing; a banned session is closed).
func (s *session) failClose(code string) {
	if s.ending.Load() {
		return
	}
	s.r.o.Metrics.Inc("relay_refused_total", code)
	s.ending.Store(true)
	select {
	case s.out <- encodeErr(code):
	default:
	}
	select {
	case s.out <- nil:
	default:
		s.close(code)
	}
}

func encodeErr(code string) []byte { return canon.Encode(map[string]any{"m": "err", "code": code}) }

func fmtUnix(t int64) string { return time.Unix(t, 0).UTC().Format(time.RFC3339) }

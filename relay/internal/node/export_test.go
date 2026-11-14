package node

import (
	"context"
	"time"
)

// SetEpoch fixes a relay's cursor epoch for a test.
func (r *Relay) SetEpoch(e string) { r.mu.Lock(); r.epoch = e; r.mu.Unlock() }

// SetCatalogLimits lowers the catalog bounds for a test; the returned func restores them.
func SetCatalogLimits(total, via int) func() {
	t, v := maxCatalog, maxCatalogVia
	maxCatalog, maxCatalogVia = total, via
	return func() { maxCatalog, maxCatalogVia = t, v }
}

// SetCatalogBytes lowers the catalog's byte bounds (in all, per neighbour, servers not in the
// registry); the returned func restores them.
func SetCatalogBytes(total, via, unlisted int) func() {
	t, v, u := maxCatalogBytes, maxCatalogViaBytes, maxCatalogUnlisted
	maxCatalogBytes, maxCatalogViaBytes, maxCatalogUnlisted = total, via, unlisted
	return func() { maxCatalogBytes, maxCatalogViaBytes, maxCatalogUnlisted = t, v, u }
}

// SetNodeQueue lowers a node session's queue bound and low water; it returns the restore.
func SetNodeQueue(max, low int64) func() {
	m, l := nodeQueue, nodeLow
	nodeQueue, nodeLow = max, low
	return func() { nodeQueue, nodeLow = m, l }
}

// CatalogDirty reports whether the catalog file is behind (a write is due).
func (r *Relay) CatalogDirty() bool { r.mu.Lock(); defer r.mu.Unlock(); return r.catDirty }

// FlushCatalog writes the catalog file now.
func (r *Relay) FlushCatalog() { r.flushCatalog() }

// SetVerifyTimeout shortens the time an unknown peer has to send its entry; it returns the restore.
func SetVerifyTimeout(d time.Duration) func() {
	old := verifyTimeout
	verifyTimeout = d
	return func() { verifyTimeout = old }
}

// SetMaxScan lowers the records a backlog page visits; it returns the restore.
func SetMaxScan(n int) func() {
	old := maxScan
	maxScan = n
	return func() { maxScan = old }
}

// SetAuthorLimits lowers the votes per server and offers per key and pair; it returns the restore.
func SetAuthorLimits(votes, offers, pair int) func() {
	v, o, p := maxVotesPerServer, maxOffersPerKey, maxOffersPerPair
	maxVotesPerServer, maxOffersPerKey, maxOffersPerPair = votes, offers, pair
	return func() { maxVotesPerServer, maxOffersPerKey, maxOffersPerPair = v, o, p }
}

// Refuse remembers an id as refused, as a pushed record that did not check is.
func (r *Relay) Refuse(id string) { r.mu.Lock(); r.refuse(id); r.mu.Unlock() }

// RefusedLen is how many refused ids the relay remembers.
func (r *Relay) RefusedLen() int { r.mu.Lock(); defer r.mu.Unlock(); return len(r.refused) }

// MaxRefused is the bound of RefusedLen.
func MaxRefused() int { return maxRefused }

// SetReportLimits lowers the reports per reporter and day and the reports kept; it returns the restore.
func SetReportLimits(day, total int) func() {
	d, t := maxReportsPerDay, maxReports
	maxReportsPerDay, maxReports = day, total
	return func() { maxReportsPerDay, maxReports = d, t }
}

// RankReady reports whether the leaderboards finished loading.
func (r *Relay) RankReady() bool { return r.rank.Ready() }

// SetStatesEvery changes how often live states go out to other nodes (set before the relays
// start); it returns the restore.
func SetStatesEvery(d time.Duration) func() {
	old := statesEvery
	statesEvery = d
	return func() { statesEvery = old }
}

// DialNode dials url as a configured neighbour does, or with auto as an automatic peer (a URL from the
// registry or the catalog) does, and returns when the session ends.
func (r *Relay) DialNode(ctx context.Context, url string, auto bool) error {
	key := url
	if auto {
		key = autoPrefix + "peer"
	}
	return r.dialNode(ctx, key, url)
}

// SetLiveCap lowers the bound of live states held, in keys.
func (r *Relay) SetLiveCap(keys int) { r.rank.SetLiveCap(keys, 0) }

// LiveHeld reports whether a live state of key is held.
func (r *Relay) LiveHeld(key string) bool { return r.rank.LiveOf(key) != nil }

// LeftLen is how many keys the relay remembers a leave of.
func (r *Relay) LeftLen() int { r.mu.Lock(); defer r.mu.Unlock(); return len(r.left) }

// IsRefused reports whether an id is remembered as refused.
func (r *Relay) IsRefused(id string) bool { r.mu.Lock(); defer r.mu.Unlock(); return r.refused[id] }

// SlotOf is the board slot a stored record has (its earliest counted receipt), or -1.
func (r *Relay) SlotOf(id string) int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	if e := r.st.Get(id); e != nil {
		return e.Slot
	}
	return -1
}

// Knows reports whether the relay knows a server's lists (its own, the registry's or gossip's).
func (r *Relay) Knows(id string) bool { r.mu.Lock(); defer r.mu.Unlock(); return r.lookup(id) != nil }

// SetRetryEvery changes how often a session asks again for records a budget refused; it returns the restore.
func SetRetryEvery(d time.Duration) func() {
	old := retryEvery
	retryEvery = d
	return func() { retryEvery = old }
}

// SetMaxUnverified lowers the sessions with servers this node does not know; it returns the restore.
func SetMaxUnverified(n int) func() {
	old := maxUnverified
	maxUnverified = n
	return func() { maxUnverified = old }
}

// NodeSessions is how many node sessions are up.
func (r *Relay) NodeSessions() int { return r.count(true) }

// PeerSession reports whether a verified session with node of server is up, and whether its proof was bound.
func (r *Relay) PeerSession(server, node string) (up, bound bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for s := range r.nodes {
		if s.peerServer == server && s.peerNode == node && s.verified {
			return true, !s.unbound
		}
	}
	return false, false
}

// UnboundSessions is how many verified sessions with nodes of server proved themselves unbound.
func (r *Relay) UnboundSessions(server string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for s := range r.nodes {
		if s.peerServer == server && s.verified && s.unbound {
			n++
		}
	}
	return n
}

// SetCatalogUnlisted lowers the catalog entries kept of servers the registry does not list; it returns the restore.
func SetCatalogUnlisted(n int) func() {
	old := maxCatalogUnlistedN
	maxCatalogUnlistedN = n
	return func() { maxCatalogUnlistedN = old }
}

// InCatalog reports whether the catalog holds a server's entry.
func (r *Relay) InCatalog(id string) bool { r.mu.Lock(); defer r.mu.Unlock(); return r.cat[id] != nil }

// SetReportRoom sets the reports kept for reporters with history, the age that gives history and
// the reports per address an hour; it returns the restore.
func SetReportRoom(reserve int, elder int64, perAddr int) func() {
	r, e, a := reportReserve, reportElder, maxReportsPerAddr
	reportReserve, reportElder, maxReportsPerAddr = reserve, elder, perAddr
	return func() { reportReserve, reportElder, maxReportsPerAddr = r, e, a }
}

// SetNodeSessionLimits lowers the inbound node sessions per address and per server outside the
// registry; it returns the restore.
func SetNodeSessionLimits(perAddr, perUnlisted int) func() {
	a, u := maxNodesPerAddr, maxNodesPerUnlisted
	maxNodesPerAddr, maxNodesPerUnlisted = perAddr, perUnlisted
	return func() { maxNodesPerAddr, maxNodesPerUnlisted = a, u }
}

// SetMaxQuotas lowers the addresses and servers with growth buckets held; it returns the restore.
func SetMaxQuotas(n int) func() {
	old := maxQuotas
	maxQuotas = n
	return func() { maxQuotas = old }
}

package node

import "time"

// SetEpoch fixes a relay's cursor epoch for a test.
func (r *Relay) SetEpoch(e string) { r.mu.Lock(); r.epoch = e; r.mu.Unlock() }

// SetCatalogLimits lowers the catalog bounds for a test; the returned func restores them.
func SetCatalogLimits(total, via int) func() {
	t, v := maxCatalog, maxCatalogVia
	maxCatalog, maxCatalogVia = total, via
	return func() { maxCatalog, maxCatalogVia = t, v }
}

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

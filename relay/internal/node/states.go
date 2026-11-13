package node

import (
	"math"
	"slices"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/rank"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

/* Live states (spec 5.11, 9.3 state, 9.4 states): a network's current numbers, sent by its game
   every few seconds while it plays, ranked on the boards of now (10.13). They are never stored:
   the leaderboards' aggregate keeps the newest of each key in memory (rank/live.go), never on
   disk, never in a sub backlog, and forgets a key that has sent nothing for fed.StateLife seconds.

   Between nodes: a state that is newer than the one held is passed on to every node session that
   takes the players class and said it takes states (feats), the ones it came from excepted. Each
   session collects the keys whose state changed and sends their newest states every statesEvery,
   in states frames (at most 256 states each), so a key that changes several times between two
   sends costs one. Only newer states are kept and passed on, so a state stops where it is already
   known, whatever loops the sync graph has. */

// statesEvery is how often changed states go out to each node session (a var for tests).
var statesEvery = 2 * time.Second

// stateRate and stateBurst bound a client session's states: one every 4 seconds, two at once.
const (
	stateRate  = 0.25
	stateBurst = 2.0
)

// feats is what this side lists in hello and welcome (9.3, 9.4): the optional messages it takes.
func feats() []any { return []any{wire.Feat} }

// stateAllow is a client session's own token bucket for states; ok, or the seconds to wait.
func (s *session) stateAllow() (bool, int64) {
	now := time.Now()
	if s.stAt.IsZero() {
		s.stTok = stateBurst
	} else {
		s.stTok = min(stateBurst, s.stTok+now.Sub(s.stAt).Seconds()*stateRate)
	}
	s.stAt = now
	if s.stTok < 1 {
		return false, int64(math.Ceil((1 - s.stTok) / stateRate))
	}
	s.stTok--
	return true, 0
}

// clientState answers a client's state frame (9.3): ack (dup when it was not newer) or err.
func (r *Relay) clientState(s *session, f *wire.Frame, now int64) {
	if ok, retry := s.stateAllow(); !ok {
		s.fail(f.ID, fed.RateLimited, retry)
		return
	}
	rec, code := fed.CheckState(f.Raw["rec"], now)
	if code == "" {
		var res int
		res, code = r.takeState(rec, nil, now)
		if code == "" {
			r.o.Metrics.Inc("relay_states_total", "client")
			if f.ID != 0 {
				s.enqueue(map[string]any{"m": "ack", "id": f.ID, "rid": rec.ID, "dup": res != rank.StateNew})
			}
			return
		}
	}
	retry := int64(0)
	if code == fed.RateLimited {
		retry = 60
	}
	s.fail(f.ID, code, retry)
}

// takeState keeps a checked state when it is newer than the one held, and passes it on to node
// sessions (from: the session it came from, nil for a client). It gives the aggregate's result
// and an error code: refused, shunned (as for records, 7.1 step 9), too_old, or rate_limited
// when the map is at its bound.
func (r *Relay) takeState(rec *fed.Record, from *session, now int64) (int, string) {
	r.mu.Lock()
	code := ""
	if t, ok := r.left[rec.Key]; ok && rec.T <= t {
		code = fed.Refused
	} else if r.isShunned(rec.Key) {
		code = fed.Shunned
	} else if r.refusesKey(rec.Key) {
		code = fed.Refused
	}
	r.mu.Unlock()
	if code != "" {
		return 0, code
	}
	res := r.rank.State(rec.ID, rec.Key, rec.T, rec.Body, rec.Canon(), now)
	switch res {
	case rank.StateFull:
		return res, fed.RateLimited
	case rank.StateStale:
		return res, fed.TooOld
	case rank.StateNew:
		r.mu.Lock()
		r.queueState(rec.Key, from)
		r.mu.Unlock()
	}
	return res, ""
}

// takesStates reports whether a node session is sent states (lock held).
func (s *session) takesStates() bool {
	return s.synced && slices.Contains(s.feats, wire.Feat) && s.sends("state")
}

// queueState marks key's state to go to every node session that takes states but from (lock held).
func (r *Relay) queueState(key string, from *session) {
	for s := range r.nodes {
		if s != from && s.takesStates() {
			if s.stPend == nil {
				s.stPend = map[string]bool{}
			}
			s.stPend[key] = true
		}
	}
}

// queueAllStates marks every state held to go to a node session that just started (lock held).
func (r *Relay) queueAllStates(s *session) {
	if !s.takesStates() {
		return
	}
	for _, l := range r.rank.LiveStates() {
		if s.stPend == nil {
			s.stPend = map[string]bool{}
		}
		s.stPend[l.Key] = true
	}
}

// flushStates sends each node session the newest states of the keys queued for it, in frames of
// at most fed.MaxItems states and about half a node frame. A session whose queue is still full
// of what was sent before waits for the next round: its keys stay queued, so nothing is lost and
// a slow peer only gets the newest state of each key later.
func (r *Relay) flushStates() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for s := range r.nodes {
		if len(s.stPend) == 0 || s.queued.Load() >= s.lowQ {
			continue
		}
		keys := s.stPend
		s.stPend = nil
		var page []any
		size, sent := 0, 0
		for k := range keys {
			l := r.rank.LiveOf(k)
			if l == nil {
				continue
			}
			if len(page) > 0 && (len(page) >= fed.MaxItems || size+len(l.Raw) > fed.NodeFrame/2) {
				s.enqueue(map[string]any{"m": "states", "items": page})
				page, size = nil, 0
			}
			page = append(page, canon.Raw(l.Raw))
			size += len(l.Raw) + 1
			sent++
		}
		if len(page) > 0 {
			s.enqueue(map[string]any{"m": "states", "items": page})
		}
		r.o.Metrics.Add("relay_states_total", "sent", float64(sent))
	}
}

// nodeStates takes a states frame from a node session (9.4): each state checked like a client's;
// only newer ones are kept and passed on. Invalid ones are dropped and counted, never answered.
func (r *Relay) nodeStates(s *session, f *wire.Frame, now int64) {
	r.mu.Lock()
	takes := s.same || slices.Contains(s.take, "players")
	r.mu.Unlock()
	if !takes {
		return
	}
	items, _ := f.Raw["items"].([]any)
	for _, x := range items {
		// A copy of a state already held (it came by another path) is not checked again.
		if m, ok := x.(map[string]any); ok {
			key, _ := m["key"].(string)
			t, ok := wire.Int(m["t"])
			if ok && fed.IsKey(key) && !r.rank.Fresher(key, t) {
				continue
			}
		}
		rec, code := fed.CheckState(x, now)
		res := 0
		if code == "" {
			res, code = r.takeState(rec, s, now)
		}
		if code != "" {
			r.o.Metrics.Inc("relay_refused_total", code)
			continue
		}
		if res == rank.StateNew {
			r.o.Metrics.Inc("relay_states_total", "node")
		}
	}
}

package node

import (
	"context"
	"errors"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/rank"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// Limits of the leaderboard requests (9.3, 9.5).
const (
	netsKeysMax = 64 // keys of a nets request
	rankWait    = 10 * time.Second
)

// ownRow is the key the session's own row is for: the first key it proved that is not an
// operator of this server, else the first one ("" when none).
func (r *Relay) ownRow(s *session) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, k := range s.proved {
		if r.own == nil || !r.own.IsOperator(k) {
			return k
		}
	}
	if len(s.proved) > 0 {
		return s.proved[0]
	}
	return ""
}

// rankFail answers a ranking that could not be had now: rate_limited with a retry.
func (s *session) rankFail(id int64, err error) {
	retry := int64(1)
	if errors.Is(err, rank.ErrNotReady) {
		retry = 5
	}
	s.fail(id, fed.RateLimited, retry)
}

// rankFrame answers rank, facets and nets (9.3, 9.5). The answer is worked out on the ranking
// workers; this session's reader waits for it (at most rankWait), no goroutine is started here.
func (r *Relay) rankFrame(s *session, f *wire.Frame) {
	ctx, cancel := context.WithTimeout(s.ctx, rankWait)
	defer cancel()
	now := r.now()
	switch f.M {
	case "rank":
		q, n, code := rank.ParseRequest(f)
		if code != "" {
			s.fail(f.ID, code, 0)
			return
		}
		ans, err := r.rank.Rank(ctx, q, now, r.ownRow(s), n)
		if err != nil {
			s.rankFail(f.ID, err)
			return
		}
		cache := "miss"
		if ans.Cached {
			cache = "hit"
		}
		r.o.Metrics.Inc("relay_rank_answers_total", cache)
		rows := make([]any, len(ans.Rows))
		for i, x := range ans.Rows {
			row := map[string]any{"rank": int64(x.Rank), "key": x.Key, "value": x.Value, "asn": x.ASN, "ai": x.AI}
			if x.Name != "" {
				row["name"] = x.Name
			}
			if x.Home != "" {
				row["home"] = x.Home
			}
			if x.CC != "" {
				row["cc"] = x.CC
			}
			rows[i] = row
		}
		var me any = canon.Raw("null")
		if ans.Me != nil {
			var rk any = canon.Raw("null")
			if ans.Me.Rank != nil {
				rk = int64(*ans.Me.Rank)
			}
			me = map[string]any{"rank": rk, "value": ans.Me.Value}
		}
		m := map[string]any{"m": "ranks", "id": f.ID, "slot": ans.Slot, "n": int64(ans.N), "rows": rows, "me": me}
		m["at"] = ans.At // the snapshot of live states it ranks (its running slot, 10.13)
		s.enqueue(m)
	case "rankwhy":
		q, _, code := rank.ParseRequest(f)
		key, _ := f.Str("key")
		if code == "" && !fed.IsKey(key) {
			code = fed.BadKey
		}
		if code != "" {
			s.fail(f.ID, code, 0)
			return
		}
		if q.Measure == "now" {
			r.whyNow(s, f, q, key, now)
			return
		}
		at, _ := wire.Int(f.Raw["at"])
		ids, anns, states, slot, at, err := r.rank.Why(q, key, now, at)
		if errors.Is(err, rank.ErrTooMany) {
			s.fail(f.ID, fed.TooMany, 0)
			return
		}
		if err != nil {
			s.rankFail(f.ID, err)
			return
		}
		r.mu.Lock()
		defer r.mu.Unlock()
		if !r.room(s, f.ID) {
			return
		}
		list := make([]*store.Entry, 0, len(ids)+len(anns))
		for _, id := range ids {
			if e := r.st.Get(id); e != nil {
				list = append(list, e)
			}
		}
		for _, k := range anns {
			if a := r.newestAnnEntry(k); a != nil {
				list = append(list, a)
			}
		}
		vals := make([]map[string]any, len(states))
		for i, l := range states {
			vals[i] = map[string]any{"rec": canon.Raw(l.Raw), "rcpt": []any{}}
		}
		r.later(s, &listPager{rid: f.ID, m: "recs", vals: vals, entries: list, slot: slot, at: at})
	case "facets":
		fc, err := r.rank.Facets(ctx, now)
		if err != nil {
			s.rankFail(f.ID, err)
			return
		}
		list := func(l []string) []any {
			out := make([]any, len(l))
			for i, v := range l {
				out[i] = v
			}
			return out
		}
		s.enqueue(map[string]any{"m": "facets", "id": f.ID, "slot": fc.Slot, "models": list(fc.Models),
			"harnesses": list(fc.Harnesses), "from": list(fc.From), "homes": list(fc.Homes)})
	case "nets":
		keys, _ := f.Strs("keys")
		if len(keys) > netsKeysMax {
			s.fail(f.ID, fed.TooMany, 0)
			return
		}
		if !r.rank.Ready() {
			s.rankFail(f.ID, rank.ErrNotReady)
			return
		}
		nets, reps := r.rank.Nets(keys, r.ownRow(s))
		ns, rs := make([]any, len(nets)), make([]any, len(reps))
		for i, x := range nets {
			ns[i] = map[string]any{"key": x.Key, "ai": x.AI, "tier1": x.Tier1, "tier2": x.Tier2, "pops": x.Pops, "cust": int64(x.Cust), "slot": x.Slot}
		}
		for i, x := range reps {
			rs[i] = map[string]any{"key": x.Key, "in": x.In, "out": x.Out}
		}
		s.enqueue(map[string]any{"m": "netstats", "id": f.ID, "nets": ns, "reports": rs})
	}
}

// whyNow answers a rankwhy for the measure now (9.5): the live states behind the row, from the
// snapshot the ranking at f's at used when it is still kept, with the key's newest stats record
// (its receipt gives the country) and the announces; recs frames carry slot and at.
func (r *Relay) whyNow(s *session, f *wire.Frame, q *rank.Slice, key string, now int64) {
	at, _ := wire.Int(f.Raw["at"])
	states, ids, anns, at, err := r.rank.WhyNow(q, key, now, at)
	if errors.Is(err, rank.ErrTooMany) {
		s.fail(f.ID, fed.TooMany, 0)
		return
	}
	if err != nil {
		s.rankFail(f.ID, err)
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.room(s, f.ID) {
		return
	}
	vals := make([]map[string]any, len(states))
	for i, l := range states {
		vals[i] = map[string]any{"rec": canon.Raw(l.Raw), "rcpt": []any{}}
	}
	list := make([]*store.Entry, 0, len(ids)+len(anns))
	for _, id := range ids {
		if e := r.st.Get(id); e != nil {
			list = append(list, e)
		}
	}
	for _, k := range anns {
		if a := r.newestAnnEntry(k); a != nil {
			list = append(list, a)
		}
	}
	r.later(s, &listPager{rid: f.ID, m: "recs", vals: vals, entries: list, slot: fed.Slot(now), at: at})
}

package rank

import (
	"context"
	"sync"
	"testing"
	"time"
)

// Two slices whose filters differ must never share a cache entry, whatever the strings hold.
func TestSliceKeysDoNotCollide(t *testing.T) {
	s := func(v string) *string { return &v }
	pairs := [][2]*Slice{
		{{Board: "pops", Measure: "total", Division: "all", Model: s("x|=y")},
			{Board: "pops", Measure: "total", Division: "all", Model: s("x"), Harness: s("y|")}},
		{{Board: "pops", Measure: "total", Division: "all", Cities: []string{"a,b"}},
			{Board: "pops", Measure: "total", Division: "all", Cities: []string{"a", "b"}}},
		{{Board: "pops", Measure: "total", Division: "all", Home: s("")},
			{Board: "pops", Measure: "total", Division: "all"}},
	}
	for _, p := range pairs {
		if p[0].key() == p[1].key() {
			t.Fatalf("two slices share a cache key: %q", p[0].key())
		}
	}
}

// A drop fed after a stats record is applied after it, even when a request's flush runs while
// the applier holds the stats record: a dropped record never stays ranked.
func TestFlushKeepsFeedOrder(t *testing.T) {
	a := New(1)
	defer a.Close()
	a.Load(nil, nil, nil, nil)
	now := t0
	c := now - now%300
	body := map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(3)}, "traffic": []any{}, "total": int64(5)}
	release := make(chan struct{})
	took := make(chan struct{})
	var once sync.Once
	flushHook = func(q []event) {
		if q[0].op == 's' {
			once.Do(func() { close(took) })
			<-release
		}
	}
	defer func() { flushHook = nil }()
	// The applier takes the stats event and stalls before applying it.
	a.Stats("id1", "kA", c-600, now-600, body, "")
	<-took
	// The record is dropped (retention, leave): a request's prepare flushes the drop meanwhile.
	a.Drop("id1")
	done := make(chan struct{})
	go func() { a.flush(); close(done) }()
	time.Sleep(20 * time.Millisecond)
	close(release)
	<-done
	a.flush()
	ans, err := a.Rank(context.Background(), &Slice{Board: "pops", Measure: "total", Division: "all"}, now, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if ans.N != 0 {
		t.Fatalf("dropped record still ranked: %+v", ans.Rows)
	}
}

// A ranking queued for slot c1 and worked out after another request moved the windows to the
// next slot is still the ranking of c1, the slot its answer is labelled with; and the windows
// never move back for it.
func TestRankAnswersTheSlotItWasAskedFor(t *testing.T) {
	a := New(1)
	defer a.Close()
	c1 := t0 - t0%300
	norm := map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(3)}, "traffic": []any{}, "total": int64(5)}
	sand := map[string]any{"mode": "sandbox", "pops": map[string]any{"fra": int64(3)}, "traffic": []any{}, "total": int64(5)}
	a.Load([]Raw{{ID: "r1", Key: "kA", Slot: c1 - 300, T: c1 - 300, Body: norm}, {ID: "r2", Key: "kA", Slot: c1, T: c1, Body: sand}}, nil, nil, nil)
	block := make(chan struct{})
	a.jobs <- func() { <-block }
	time.Sleep(10 * time.Millisecond)
	type res struct {
		ans *Answer
		err error
	}
	ch := make(chan res)
	go func() {
		ans, err := a.Rank(context.Background(), &Slice{Board: "pops", Measure: "total", Division: "all"}, c1+10, "", 10)
		ch <- res{ans, err}
	}()
	time.Sleep(20 * time.Millisecond) // its job is queued behind the blocker
	a.window(c1 + 300)                // another request, a moment later, in the next slot
	close(block)
	r := <-ch
	if r.err != nil {
		t.Fatal(r.err)
	}
	if r.ans.Slot != c1 || r.ans.N != 1 {
		t.Fatalf("answer for slot %d (asked %d): n=%d, want 1", r.ans.Slot, c1, r.ans.N)
	}
	a.window(c1)
	a.mu.RLock()
	got := a.c
	a.mu.RUnlock()
	if got != c1+300 {
		t.Fatalf("the windows moved back to %d", got)
	}
	// The traffic board of an older slot is worked out without the per-slot sums, and agrees.
	tr := map[string]any{"mode": "normal", "pops": map[string]any{"fra": int64(1)}, "total": int64(5),
		"traffic": []any{map[string]any{"key": "kC", "in": int64(4000), "out": int64(2000)}}}
	a.Stats("r3", "kB", c1-600, c1-600, tr, "")
	q := &Slice{Board: "traffic", Measure: "total", Division: "all"}
	old, err := a.Rank(context.Background(), q, c1+10, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	cur, err := a.Rank(context.Background(), q, c1+310, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if old.Slot != c1 || old.Rows[0].Key != "kB" || cur.Rows[0].Key != "kB" || old.Rows[0].Value != cur.Rows[0].Value || old.Rows[0].Value == 0 {
		t.Fatalf("older slot %+v, current %+v", old, cur)
	}
}

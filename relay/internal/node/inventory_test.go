package node

import (
	"fmt"
	"slices"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

// fullInventory is the carry answer worked out in one walk, as it was before chunking.
func fullInventory(r *Relay, s *session, since int64) []string {
	var ids []string
	for _, e := range r.st.All() {
		if e.Slot >= since && s.sends(e.Kind) && !r.shunned[e.Key] && classOrChain(e, r) {
			ids = append(ids, e.ID)
		}
	}
	return ids
}

// A carry on a big store lets the lock go between chunks, so writers are not stalled for the
// whole walk; what writers do meanwhile lands in the answer exactly as a later walk would see it.
func TestInventoryReleasesTheLockBetweenChunks(t *testing.T) {
	defer func(c int, p func()) { invChunk, invPause = c, p }(invChunk, invPause)
	r := &Relay{st: store.Memory(), shunned: map[string]bool{}}
	put := func(i int, kind string) {
		rec := &fed.Record{ID: fmt.Sprintf("r%06d", i), Kind: kind, Key: fmt.Sprintf("k%d", i%50), Value: map[string]any{}}
		r.st.Put(rec, nil, int64(i%7*fed.SlotLen), 0)
	}
	kinds := []string{"stats", "announce", "operators", "hide", "offer"}
	for i := range 5000 {
		put(i, kinds[i%len(kinds)])
	}
	r.shunned["k3"] = true
	s := &session{send: []string{"players"}}
	since := int64(2 * fed.SlotLen)

	invChunk = 300
	pauses, next := 0, 5000
	invPause = func() {
		pauses++
		if !r.mu.TryLock() {
			t.Fatal("the lock is held between chunks")
		}
		// A writer gets in: new records, removals behind and ahead of the walk.
		put(next, "stats")
		next++
		r.st.Remove([]string{fmt.Sprintf("r%06d", pauses*7), fmt.Sprintf("r%06d", 4999-pauses*11)})
		r.mu.Unlock()
	}
	got := r.inventory(s, since)
	if r.mu.TryLock() {
		t.Fatal("inventory must return with the lock held")
	}
	r.mu.Unlock()
	if pauses < 5000/300 {
		t.Fatalf("only %d pauses", pauses)
	}
	// Entries removed behind the walk were already listed; the rest equals a walk done now.
	want := fullInventory(r, s, since)
	for _, id := range got {
		if r.st.Get(id) == nil {
			continue
		}
		if len(want) == 0 || want[0] != id {
			t.Fatalf("got %s, want %v", id, want[:min(3, len(want))])
		}
		want = want[1:]
	}
	if len(want) > 0 {
		t.Fatalf("missing %d ids, first %s", len(want), want[0])
	}
	// Without writers, the chunked answer is exactly the one-walk answer.
	invPause = nil
	got = r.inventory(s, since)
	r.mu.Unlock()
	if want := fullInventory(r, s, since); !slices.Equal(got, want) || len(got) == 0 {
		t.Fatalf("chunked %d ids, full walk %d", len(got), len(want))
	}
}

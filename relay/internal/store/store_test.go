package store

import (
	"fmt"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

func rec(id, kind, key string, sigs ...string) *fed.Record {
	r := &fed.Record{ID: id, Kind: kind, Key: key, Value: map[string]any{}}
	for _, k := range sigs {
		r.Sigs = append(r.Sigs, fed.SigEntry{Key: k, Sig: "s" + k})
	}
	return r
}

// Two copies of a multi-signer record, each with 16 signers, never merge past 16, and the
// author's signature always stays (10.11).
func TestMergeNeverPassesSixteenSigners(t *testing.T) {
	s := Memory()
	var a, b []string
	a = append(a, "author")
	for i := 0; i < 15; i++ {
		a = append(a, fmt.Sprintf("a%02d", i))
		b = append(b, fmt.Sprintf("b%02d", i))
	}
	b = append(b, "author")
	s.Put(rec("x", "operators", "author", a...), nil, 0, 0)
	s.Put(rec("x", "operators", "author", b...), nil, 0, 0)
	got := s.Rec(s.Get("x")).Signers()
	if len(got) != fed.MaxSigners {
		t.Fatalf("%d signers", len(got))
	}
	found := false
	for _, k := range got {
		found = found || k == "author"
	}
	if !found {
		t.Fatal("the author's signature was dropped")
	}
	// With Keep, only the keys it accepts stay, from both copies.
	s = Memory()
	s.Keep = func(r *fed.Record, sigs []fed.SigEntry) []fed.SigEntry {
		return fed.KeepSigs(r.Key, sigs, func(k string) bool { return k == "a03" || k == "b07" })
	}
	s.Put(rec("y", "server", "author", a...), nil, 0, 0)
	if res, _, _ := s.Put(rec("y", "server", "author", b...), nil, 0, 0); res != Merged {
		t.Fatalf("second copy: %s", res)
	}
	if got := s.Rec(s.Get("y")).Signers(); fmt.Sprint(got) != "[a03 author b07]" {
		t.Fatalf("kept %v", got)
	}
	// A copy that brings nothing new is a duplicate.
	if res, _, _ := s.Put(rec("y", "server", "author", "author", "zz"), nil, 0, 0); res != Dup {
		t.Fatalf("junk-only copy: %s", res)
	}
}

// Scan visits only what follows the cursor, in storage order, of the kinds asked, and skips removed entries.
func TestScanByKindFromACursor(t *testing.T) {
	s := Memory()
	for i := 0; i < 3000; i++ {
		kind := []string{"stats", "announce", "offer"}[i%3]
		s.Put(&fed.Record{ID: fmt.Sprint("r", i), Kind: kind, Key: "k", Value: map[string]any{}}, nil, 0, 0)
	}
	s.Remove([]string{"r4", "r7"})
	var seqs []uint64
	s.Scan(2, []string{"announce", "stats", "announce"}, func(e *Entry) bool {
		seqs = append(seqs, e.Seq)
		return len(seqs) < 6
	})
	// Seq is i+1: after 2, stats are seq 1,4,7,10 and announces 2,5,8,11; r4 (seq 5) and r7 (seq 8) are gone.
	if fmt.Sprint(seqs) != "[4 7 10 11 13 14]" {
		t.Fatalf("scan %v", seqs)
	}
	// Removing most entries compacts the ordered lists; the rest still scan.
	var drop []string
	for i := 0; i < 2900; i++ {
		drop = append(drop, fmt.Sprint("r", i))
	}
	s.Remove(drop)
	if n := len(s.All()); n != 100 || len(s.order) != 100 {
		t.Fatalf("after compaction: %d live, %d in order", n, len(s.order))
	}
}

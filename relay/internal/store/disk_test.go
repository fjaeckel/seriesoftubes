package store_test

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

const t0 int64 = 1767312010 // a slot boundary plus 10 s
const day0 = t0 / fed.Day

func key(name string) *fed.Signer {
	h := sha256.Sum256([]byte("store test " + name))
	s, _ := fed.NewSigner(h[:])
	return s
}

func check(t testing.TB, m map[string]any) *fed.Record {
	t.Helper()
	r, code := fed.CheckValue(m, t0+30*fed.Day, fed.Opts{Trusted: true})
	if code != "" {
		t.Fatal(code)
	}
	return r
}

func stats(t testing.TB, k *fed.Signer, at int64) *fed.Record {
	return check(t, k.Seal("stats", at, map[string]any{"mode": "normal", "pops": map[string]any{"fra": 1 + at%7},
		"traffic": []any{}, "tier1": false, "shareCountry": true}))
}

var node = key("node")

func rcpt(r *fed.Record, at int64) []map[string]any {
	return []map[string]any{node.MakeReceipt(r, "srv", at, "DE")}
}

func open(t *testing.T, dir string) *store.Store {
	t.Helper()
	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// raws is every live record's text and receipts, in storage order.
func raws(t *testing.T, s *store.Store) []string {
	t.Helper()
	var out []string
	for _, e := range s.All() {
		rec, rc, err := s.Raw(e)
		if err != nil {
			t.Fatalf("%s: %v", e.ID, err)
		}
		out = append(out, e.Kind+" "+string(rec)+" "+string(rc))
	}
	return out
}

func put(t *testing.T, s *store.Store, r *fed.Record, at int64) *store.Entry {
	t.Helper()
	_, e, err := s.Put(r, rcpt(r, at), fed.Slot(at), at/fed.Day)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

// What is read back is exactly what was stored: from memory while recent, from the day files
// otherwise, and after a restart; in the same storage order, with the same fields.
func TestReadBackAndRestart(t *testing.T) {
	defer func(n int) { store.RecentBytes = n }(store.RecentBytes)
	store.RecentBytes = 2000 // a few lines: most entries are read from the files
	dir := t.TempDir()
	s := open(t, dir)
	var want []string
	keys := []*fed.Signer{key("a"), key("b"), key("c")}
	for i := range 60 {
		at := t0 + int64(i)*3*3600 // spread over a week of day files
		r := stats(t, keys[i%3], at)
		put(t, s, r, at)
		want = append(want, "stats "+string(r.Canon())+" "+string(canon.Encode(rcpt(r, at))))
	}
	if got := raws(t, s); !slices.Equal(got, want) {
		t.Fatalf("read back:\n%v\nwant\n%v", got, want)
	}
	if n := s.MemSize(); n > 4000 {
		t.Fatalf("%d bytes of lines in memory with RecentBytes 2000", n)
	}
	seqs := func(s *store.Store) (out []string) {
		for _, e := range s.All() {
			out = append(out, fmt.Sprint(e.Seq, e.ID, e.Key, e.Kind, e.T, e.Slot))
		}
		return
	}
	before := seqs(s)
	s.Close()
	s = open(t, dir)
	defer s.Close()
	if got := raws(t, s); !slices.Equal(got, want) {
		t.Fatal("read back after a restart differs")
	}
	if got := seqs(s); !slices.Equal(got, before) {
		t.Fatalf("entries after a restart:\n%v\nwant\n%v", got, before)
	}
	if s.MemSize() != 0 {
		t.Fatalf("%d bytes of lines in memory right after a restart", s.MemSize())
	}
	// Scan from a cursor of the first run gives the same records after the restart.
	var after []uint64
	s.Scan(before2seq(before[40]), []string{"stats"}, func(e *store.Entry) bool { after = append(after, e.Seq); return true })
	if len(after) != 19 || after[0] != 42 {
		t.Fatalf("scan after the restart %v", after)
	}
}

func before2seq(s string) uint64 {
	var n uint64
	fmt.Sscan(s, &n)
	return n
}

// Removed records leave the files at the next compaction, today's file included, and do not
// come back after a restart; the records kept are read back from their new places, and files
// that hold just what is kept are not rewritten.
func TestRemoveCompactRestart(t *testing.T) {
	defer func(n int) { store.RecentBytes = n }(store.RecentBytes)
	store.RecentBytes = 0
	dir := t.TempDir()
	s := open(t, dir)
	k := key("a")
	var ids []string
	for i := range 40 {
		at := t0 + int64(i)*6*3600 // ten days, four records a day
		ids = append(ids, put(t, s, stats(t, k, at), at).ID)
	}
	today := (t0 + 39*6*3600) / fed.Day
	if err := s.Compact(today); err != nil {
		t.Fatal(err)
	}
	keep := raws(t, s)
	// Untouched days are not rewritten.
	first := filepath.Join(dir, "log", fmt.Sprint(day0, ".jsonl"))
	fi1, _ := os.Stat(first)
	// Remove every other record of the first five days, and one of today's.
	var drop []string
	for i := 0; i < 20; i += 2 {
		drop = append(drop, ids[i])
	}
	drop = append(drop, ids[39])
	s.Remove(drop)
	kept := raws(t, s)
	if len(kept) != len(keep)-len(drop) {
		t.Fatalf("%d left of %d", len(kept), len(keep))
	}
	if err := s.Compact(today); err != nil {
		t.Fatal(err)
	}
	if got := raws(t, s); !slices.Equal(got, kept) {
		t.Fatal("records read back differently after compaction")
	}
	untouched := filepath.Join(dir, "log", fmt.Sprint(day0+7, ".jsonl"))
	fi2, _ := os.Stat(untouched)
	if err := s.Compact(today); err != nil {
		t.Fatal(err)
	}
	if fi3, _ := os.Stat(untouched); !fi3.ModTime().Equal(fi2.ModTime()) || !os.SameFile(fi2, fi3) {
		t.Fatal("a day file holding only kept records was rewritten")
	}
	if fi4, _ := os.Stat(first); os.SameFile(fi1, fi4) {
		t.Fatal("a day file with removed records was not rewritten")
	}
	// A record put after the compaction goes to today's (rewritten) file and is read back.
	at := t0 + 39*6*3600 + 60
	r := stats(t, key("b"), at)
	put(t, s, r, at)
	kept = append(kept, "stats "+string(r.Canon())+" "+string(canon.Encode(rcpt(r, at))))
	s.Close()
	s = open(t, dir)
	defer s.Close()
	if got := raws(t, s); !slices.Equal(got, kept) {
		t.Fatalf("after a restart:\n%d records\nwant %d", len(got), len(kept))
	}
	for _, id := range drop {
		if s.Get(id) != nil {
			t.Fatal("a removed record came back after a restart")
		}
	}
	if s.Bad != 0 {
		t.Fatalf("%d bad lines", s.Bad)
	}
}

// A line cut short by a crash is cut off before the next write, and the records after it are
// where their entries say.
func TestTornLineRepair(t *testing.T) {
	defer func(n int) { store.RecentBytes = n }(store.RecentBytes)
	store.RecentBytes = 0
	dir := t.TempDir()
	s := open(t, dir)
	a := stats(t, key("a"), t0)
	put(t, s, a, t0)
	s.Close()
	path := filepath.Join(dir, "log", fmt.Sprint(day0, ".jsonl"))
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	f.WriteString(`{"rcpt":[{"body":{"rec":"x`)
	f.Close()
	s = open(t, dir)
	if s.Bad != 1 {
		t.Fatalf("bad lines %d", s.Bad)
	}
	b := stats(t, key("b"), t0+60)
	put(t, s, b, t0+60)
	want := raws(t, s)
	s.Close()
	s = open(t, dir)
	defer s.Close()
	if got := raws(t, s); !slices.Equal(got, want) || len(got) != 2 || s.Bad != 0 {
		t.Fatalf("after the repair: %d records, %d bad", len(got), s.Bad)
	}
}

// Copies of a multi-signer record merge; the merged copy is what is read back and what a restart
// loads, and compaction keeps it.
func TestMergedCopyReadBack(t *testing.T) {
	dir := t.TempDir()
	s := open(t, dir)
	author, other := key("author"), key("other")
	body := map[string]any{"server": fed.Hash([]byte("s")), "prev": fed.Hash([]byte("p")), "action": "add_operator", "target": other.Key}
	one := author.SealMulti("operators", t0, body)
	r1 := check(t, one)
	put(t, s, r1, t0)
	sigs := []any{one["sigs"].([]any)[0], map[string]any{"key": other.Key, "sig": other.Sign(r1.Signed())}}
	if other.Key < author.Key {
		sigs[0], sigs[1] = sigs[1], sigs[0]
	}
	two := map[string]any{}
	for k, v := range one {
		two[k] = v
	}
	two["sigs"] = sigs
	r2 := check(t, two)
	at := t0 + fed.Day // the merged copy goes to the next day's file
	if res, _, err := s.Put(r2, nil, fed.Slot(at), at/fed.Day); err != nil || res != store.Merged {
		t.Fatalf("%s %v", res, err)
	}
	signers := func(s *store.Store) string { return fmt.Sprint(s.Rec(s.Get(r1.ID)).Signers()) }
	want := signers(s)
	if !strings.Contains(want, other.Key) {
		t.Fatal("not merged")
	}
	text := raws(t, s)
	s.Close()
	s = open(t, dir)
	if signers(s) != want || !slices.Equal(raws(t, s), text) {
		t.Fatal("the merged copy was not loaded")
	}
	if err := s.Compact(day0 + 5); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s = open(t, dir)
	defer s.Close()
	if signers(s) != want || !slices.Equal(raws(t, s), text) {
		t.Fatal("the merged copy was lost by compaction")
	}
	if _, err := os.Stat(filepath.Join(dir, "log", fmt.Sprint(day0, ".jsonl"))); err == nil {
		t.Fatal("the first copy's file holds nothing kept and should be gone")
	}
}

// Day files from the build that kept records parsed in memory are read as they are: lines written
// the way it wrote them are used in place; a line in another layout (here with spaces, or with a
// receipt that is not an object) is kept in memory as it should be and the next compaction writes
// it so.
func TestOlderLinesLoad(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "log"), 0o700)
	a, b := stats(t, key("a"), t0), stats(t, key("b"), t0+60)
	// The old encoder: canonical JSON of {rec, rcpt, slot}.
	old := canon.Encode(map[string]any{"rec": canon.Raw(a.Canon()), "rcpt": []any{rcpt(a, t0)[0]}, "slot": fed.Slot(t0)})
	odd := fmt.Sprintf(`{"slot": %d, "rec": %s, "rcpt": [%s, 7]}`, fed.Slot(t0), b.Canon(), canon.Encode(rcpt(b, t0+60)[0]))
	path := filepath.Join(dir, "log", fmt.Sprint(day0, ".jsonl"))
	os.WriteFile(path, []byte(string(old)+"\n"+odd+"\n"), 0o600)
	s := open(t, dir)
	want := []string{
		"stats " + string(a.Canon()) + " " + string(canon.Encode(rcpt(a, t0))),
		"stats " + string(b.Canon()) + " " + string(canon.Encode(rcpt(b, t0+60))),
	}
	if got := raws(t, s); !slices.Equal(got, want) || s.Bad != 0 {
		t.Fatalf("loaded %v (bad %d)", got, s.Bad)
	}
	if n := s.MemSize(); n == 0 || n > int64(len(odd)+100) {
		t.Fatalf("%d bytes in memory: only the odd line should be", n)
	}
	if err := s.Compact(day0); err != nil { // today's file: rewritten because a line was not as written now
		t.Fatal(err)
	}
	if s.MemSize() != 0 {
		t.Fatal("the line is still in memory after compaction")
	}
	got, _ := os.ReadFile(path)
	if !bytes.HasPrefix(got, append(old, '\n')) || bytes.Contains(got, []byte(" ")) {
		t.Fatalf("file after compaction:\n%s", got)
	}
	s.Close()
	s = open(t, dir)
	defer s.Close()
	if got := raws(t, s); !slices.Equal(got, want) || s.MemSize() != 0 {
		t.Fatal("after the rewrite")
	}
}

// A day file damaged under the relay (truncated by hand, a disk error) makes its records
// unreadable, not the relay: Raw and Rec say so, and compaction carries on.
func TestDamagedFile(t *testing.T) {
	defer func(n int) { store.RecentBytes = n }(store.RecentBytes)
	store.RecentBytes = 0
	dir := t.TempDir()
	s := open(t, dir)
	defer s.Close()
	a := put(t, s, stats(t, key("a"), t0), t0)
	b := put(t, s, stats(t, key("b"), t0+fed.Day), t0+fed.Day)
	os.Truncate(filepath.Join(dir, "log", fmt.Sprint(day0, ".jsonl")), 10)
	if _, _, err := s.Raw(a); err == nil {
		t.Fatal("a truncated line read back")
	}
	if s.Rec(a) != nil {
		t.Fatal("a truncated record parsed")
	}
	if err := s.Compact(day0 + 2); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Raw(b); err != nil {
		t.Fatal(err)
	}
}

// The folder is locked while open.
func TestLocked(t *testing.T) {
	dir := t.TempDir()
	s := open(t, dir)
	if _, err := store.Open(dir); err != store.ErrLocked {
		t.Fatalf("second open: %v", err)
	}
	s.Close()
	s = open(t, dir)
	s.Close()
}

// BenchmarkRaw reads records back: from the day files (what a backlog, fetch or push of an older
// record costs; the page cache holds them) and from memory (a recent one).
func BenchmarkRaw(b *testing.B) {
	for _, recent := range []int{0, 64 << 20} {
		b.Run(fmt.Sprint("inMemory=", recent > 0), func(b *testing.B) {
			defer func(n int) { store.RecentBytes = n }(store.RecentBytes)
			store.RecentBytes = recent
			s, err := store.Open(b.TempDir())
			if err != nil {
				b.Fatal(err)
			}
			defer s.Close()
			var es []*store.Entry
			for i := range 2000 {
				at := t0 + int64(i)*300
				r := stats(b, key(fmt.Sprint(i%50)), at)
				_, e, _ := s.Put(r, rcpt(r, at), fed.Slot(at), at/fed.Day)
				es = append(es, e)
			}
			b.ResetTimer()
			for i := range b.N {
				if _, _, err := s.Raw(es[(i*7919)%len(es)]); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

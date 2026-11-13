package store

import (
	"math"
	"os"
	"path/filepath"
	"testing"
)

// Days are kept as int32: Put refuses one outside that range instead of wrapping it around.
func TestPutRefusesADayOutsideInt32(t *testing.T) {
	s := Memory()
	for _, d := range []int64{-1, math.MaxInt32 + 1, math.MaxInt64} {
		if _, _, err := s.Put(rec("x", "announce", "k"), nil, 0, d); err == nil {
			t.Fatalf("day %d was taken", d)
		}
	}
	if s.Get("x") != nil {
		t.Fatal("a refused record was stored")
	}
	if _, _, err := s.Put(rec("x", "announce", "k"), nil, 0, math.MaxInt32); err != nil {
		t.Fatalf("the last int32 day: %v", err)
	}
}

// A file in the log folder whose name is not an int32 day is not ours: days() leaves it out instead of wrapping it.
func TestDaysIgnoresFilesOutsideInt32(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, logFolder), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"20000.jsonl", "99999999999.jsonl", "-5.jsonl", "2147483647.jsonl", "2147483648.jsonl"} {
		if err := os.WriteFile(filepath.Join(dir, logFolder, n), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	days, err := (&Store{dir: dir}).days()
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 2 || days[0] != 20000 || days[1] != math.MaxInt32 {
		t.Fatalf("days %v", days)
	}
}

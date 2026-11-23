package store_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

// Data version 2 calls the day files' folder records/, not log/ (#447): operators cleaning up "logs" deleted it.

// oldLayout writes one record, then makes the folder look as a version 1 relay left it.
func oldLayout(t *testing.T, dir string) string {
	t.Helper()
	s := open(t, dir)
	id := put(t, s, stats(t, key("a"), t0), t0).ID
	s.Close()
	if err := os.Rename(filepath.Join(dir, store.RecordsFolder), filepath.Join(dir, "log")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "VERSION"), []byte("{\"v\":1}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestLogFolderBecomesRecords(t *testing.T) {
	dir := t.TempDir()
	id := oldLayout(t, dir)
	s, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if s.Get(id) == nil {
		t.Fatal("the record did not survive the move")
	}
	if _, err := os.Stat(filepath.Join(dir, "log")); !os.IsNotExist(err) {
		t.Fatalf("log/ is still there: %v", err)
	}
	if files, _ := filepath.Glob(filepath.Join(dir, store.RecordsFolder, "*.jsonl")); len(files) != 1 {
		t.Fatalf("records/: %v", files)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "VERSION")); !strings.Contains(string(b), `"v":2`) {
		t.Fatalf("VERSION %q", b)
	}
}

// A folder with both names is not guessed at: the relay stops and says what to do, and nothing is moved.
func TestBothFoldersStopTheRelay(t *testing.T) {
	dir := t.TempDir()
	oldLayout(t, dir)
	if err := os.MkdirAll(filepath.Join(dir, store.RecordsFolder), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Open(dir); err == nil || !strings.Contains(err.Error(), "both log/ and records/ exist") {
		t.Fatalf("both folders: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "log")); err != nil {
		t.Fatal("log/ was touched")
	}
}

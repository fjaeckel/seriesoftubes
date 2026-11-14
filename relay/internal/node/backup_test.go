package node_test

import (
	"archive/tar"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

func backupNames(t *testing.T, path string) []string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	tr := tar.NewReader(gz)
	var names []string
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return names
		}
		if err != nil {
			t.Fatal(err)
		}
		names = append(names, h.Name)
	}
}

// A backup is a new 0600 file renamed into place: not an existing file's mode, not through a symlink. Backups written
// into the data folder (backups/, or any *.tar.gz) are not in later backups.
func TestBackupFile(t *testing.T) {
	n := rt.New(t)
	s := n.Found("backups", "open")
	x := s.Nodes[0]
	backup := func(path string) {
		t.Helper()
		if resp, err := ops.Call(x.Dir, ops.Request{Cmd: "backup", Path: path}); err != nil || !resp.OK {
			t.Fatalf("backup %s: %v %+v", path, err, resp)
		}
	}
	out := rt.Dir(t)

	// An existing world-readable file: replaced by a 0600 one.
	old := filepath.Join(out, "old.tar.gz")
	if err := os.WriteFile(old, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	backup(old)
	if fi, err := os.Stat(old); err != nil || fi.Mode().Perm() != 0o600 || fi.Size() < 100 {
		t.Fatalf("over an existing file: %v %v", fi, err)
	}

	// A symlink at the target: replaced, the file it points to untouched.
	if runtime.GOOS != "windows" {
		victim := filepath.Join(out, "victim")
		if err := os.WriteFile(victim, []byte("keep me"), 0o644); err != nil {
			t.Fatal(err)
		}
		link := filepath.Join(out, "link.tar.gz")
		if err := os.Symlink(victim, link); err != nil {
			t.Fatal(err)
		}
		backup(link)
		if b, _ := os.ReadFile(victim); string(b) != "keep me" {
			t.Fatal("backup written through a symlink")
		}
		if fi, err := os.Lstat(link); err != nil || !fi.Mode().IsRegular() || fi.Mode().Perm() != 0o600 {
			t.Fatalf("symlink target: %v %v", fi, err)
		}
	}

	// Into the data folder: backups/ (made when missing) and a .tar.gz at the top; neither is backed up again.
	backup(filepath.Join(x.Dir, "backups", "one.tar.gz"))
	backup(filepath.Join(x.Dir, "two.tar.gz"))
	third := filepath.Join(out, "third.tar.gz")
	backup(third)
	names := backupNames(t, third)
	if len(names) == 0 {
		t.Fatal("empty backup")
	}
	for _, nm := range names {
		if strings.HasPrefix(nm, "backups/") || strings.HasSuffix(nm, ".tar.gz") || strings.Contains(nm, ".tmp-") {
			t.Fatalf("a backup holds %s: %v", nm, names)
		}
	}
	if left, _ := filepath.Glob(filepath.Join(out, ".tmp-*")); len(left) != 0 {
		t.Fatalf("temporary files left: %v", left)
	}
}

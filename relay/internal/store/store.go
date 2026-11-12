// Package store keeps records as plain files in one data folder: one append-only file per
// real day (log/<day>.jsonl), each line a record with its receipts. Indexes live in memory
// and are rebuilt on start. Callers serialise access (the relay holds one lock).
package store

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// DataVersion is the version of the data folder's layout this build writes.
// A var so tests can play an upgrade through the migration chain.
var DataVersion = 1

// Entry is a stored record.
type Entry struct {
	Rec   *fed.Record
	Rcpts []map[string]any // receipts as received, strict values
	Slot  int64            // board slot: earliest valid receipt t
	Seq   uint64           // storage order, for cursors
	Day   int64            // real day of the file holding it
}

// Results of Put.
const (
	Stored    = "stored"
	Dup       = "duplicate"
	Merged    = "merged"
	maxLine   = 2 << 20
	logFolder = "log"
)

// Store is the record store. A zero dir keeps everything in memory (tests, vectors).
type Store struct {
	dir    string
	byID   map[string]*Entry
	byKind map[string]map[string]*Entry
	byKey  map[string]map[string]*Entry
	seq    uint64
	day    int64
	file   *os.File
	Loaded int // lines read on open
	Bad    int // lines that did not check on open
}

// Memory returns a store without files.
func Memory() *Store {
	return &Store{byID: map[string]*Entry{}, byKind: map[string]map[string]*Entry{}, byKey: map[string]map[string]*Entry{}}
}

// Open opens (and migrates) a data folder and loads every record.
func Open(dir string) (*Store, error) {
	if err := Migrate(dir); err != nil {
		return nil, err
	}
	s := Memory()
	s.dir = dir
	if err := os.MkdirAll(filepath.Join(dir, logFolder), 0o700); err != nil {
		return nil, err
	}
	days, err := s.days()
	if err != nil {
		return nil, err
	}
	for _, d := range days {
		if err := s.load(d); err != nil {
			return nil, err
		}
	}
	return s, nil
}

func (s *Store) path(day int64) string {
	return filepath.Join(s.dir, logFolder, strconv.FormatInt(day, 10)+".jsonl")
}

func (s *Store) days() ([]int64, error) {
	list, err := os.ReadDir(filepath.Join(s.dir, logFolder))
	if err != nil {
		return nil, err
	}
	var out []int64
	for _, e := range list {
		name, ok := strings.CutSuffix(e.Name(), ".jsonl")
		if !ok {
			continue
		}
		d, err := strconv.ParseInt(name, 10, 64)
		if err == nil {
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out, nil
}

type line struct {
	Rec  json.RawMessage   `json:"rec"`
	Rcpt []json.RawMessage `json:"rcpt"`
	Slot int64             `json:"slot"`
}

func (s *Store) load(day int64) error {
	f, err := os.Open(s.path(day))
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64<<10), maxLine)
	for sc.Scan() {
		b := sc.Bytes()
		if len(bytes.TrimSpace(b)) == 0 {
			continue
		}
		s.Loaded++
		var l line
		if json.Unmarshal(b, &l) != nil {
			s.Bad++
			continue
		}
		rec, code := fed.ParseRecord(l.Rec, 0, fed.Opts{Trusted: true})
		if code != "" {
			s.Bad++
			continue
		}
		var rcpts []map[string]any
		for _, r := range l.Rcpt {
			v, code := canon.ParseStrict(r)
			if m, ok := v.(map[string]any); code == "" && ok {
				rcpts = append(rcpts, m)
			}
		}
		s.insert(rec, rcpts, l.Slot, day)
	}
	return sc.Err()
}

// insert adds or merges in memory; it reports the result.
func (s *Store) insert(rec *fed.Record, rcpts []map[string]any, slot, day int64) (string, *Entry) {
	if e, ok := s.byID[rec.ID]; ok {
		if rec.Sigs == nil {
			return Dup, e
		}
		sigs, added := fed.MergeSigs(e.Rec.Sigs, rec.Sigs)
		if !added {
			return Dup, e
		}
		e.Rec = e.Rec.WithSigs(sigs)
		return Merged, e
	}
	s.seq++
	e := &Entry{Rec: rec, Rcpts: rcpts, Slot: slot, Seq: s.seq, Day: day}
	s.byID[rec.ID] = e
	add(s.byKind, rec.Kind, e)
	add(s.byKey, rec.Key, e)
	return Stored, e
}

func add(m map[string]map[string]*Entry, k string, e *Entry) {
	if m[k] == nil {
		m[k] = map[string]*Entry{}
	}
	m[k][e.Rec.ID] = e
}

// Put stores a checked record with its receipts, received on real day `day`.
func (s *Store) Put(rec *fed.Record, rcpts []map[string]any, slot, day int64) (string, *Entry, error) {
	res, e := s.insert(rec, rcpts, slot, day)
	if res == Dup {
		return res, e, nil
	}
	if res == Merged {
		// A merged copy goes into today's file; loading merges the lines again.
		e.Day = max(e.Day, day)
	}
	return res, e, s.write(e, day)
}

func (s *Store) write(e *Entry, day int64) error {
	if s.dir == "" {
		return nil
	}
	if s.file == nil || s.day != day {
		if s.file != nil {
			s.file.Close()
		}
		f, err := os.OpenFile(s.path(day), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			return err
		}
		s.file, s.day = f, day
	}
	_, err := s.file.Write(encodeLine(e))
	return err
}

func encodeLine(e *Entry) []byte {
	rc := make([]any, len(e.Rcpts))
	for i, r := range e.Rcpts {
		rc[i] = r
	}
	b := canon.Encode(map[string]any{"rec": canon.Raw(e.Rec.Canon()), "rcpt": rc, "slot": e.Slot})
	return append(b, '\n')
}

// SetReceipts replaces an entry's receipts (when one with no valid receipt gets this node's own).
func (s *Store) SetReceipts(e *Entry, rcpts []map[string]any, slot, day int64) error {
	e.Rcpts, e.Slot = rcpts, slot
	e.Day = max(e.Day, day)
	return s.write(e, day)
}

// Get returns an entry by id.
func (s *Store) Get(id string) *Entry { return s.byID[id] }

// Len is the number of records.
func (s *Store) Len() int { return len(s.byID) }

// Kind returns the entries of one kind (unordered).
func (s *Store) Kind(k string) map[string]*Entry { return s.byKind[k] }

// Key returns the entries by one author key (unordered).
func (s *Store) Key(k string) map[string]*Entry { return s.byKey[k] }

// Sorted returns entries in storage order.
func Sorted(m map[string]*Entry) []*Entry {
	out := make([]*Entry, 0, len(m))
	for _, e := range m {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Seq < out[j].Seq })
	return out
}

// All returns every entry in storage order.
func (s *Store) All() []*Entry { return Sorted(s.byID) }

// After returns entries with Seq > seq in storage order.
func (s *Store) After(seq uint64) []*Entry {
	all := s.All()
	i := sort.Search(len(all), func(i int) bool { return all[i].Seq > seq })
	return all[i:]
}

// Seq is the last storage number given.
func (s *Store) Seq() uint64 { return s.seq }

// Remove forgets entries in memory; Compact drops them from the files.
func (s *Store) Remove(ids []string) {
	for _, id := range ids {
		e := s.byID[id]
		if e == nil {
			continue
		}
		delete(s.byID, id)
		delete(s.byKind[e.Rec.Kind], id)
		delete(s.byKey[e.Rec.Key], id)
	}
}

// Compact rewrites or deletes day files so they hold only the entries still kept.
// Today's file stays append-only; older files are rewritten through a temporary file.
func (s *Store) Compact(today int64) error {
	if s.dir == "" {
		return nil
	}
	days, err := s.days()
	if err != nil {
		return err
	}
	byDay := map[int64][]*Entry{}
	for _, e := range s.byID {
		byDay[e.Day] = append(byDay[e.Day], e)
	}
	for _, d := range days {
		if d >= today {
			continue
		}
		kept := byDay[d]
		if len(kept) == 0 {
			if err := os.Remove(s.path(d)); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return err
			}
			continue
		}
		sort.Slice(kept, func(i, j int) bool { return kept[i].Seq < kept[j].Seq })
		var buf bytes.Buffer
		for _, e := range kept {
			buf.Write(encodeLine(e))
		}
		if old, err := os.ReadFile(s.path(d)); err == nil && bytes.Equal(old, buf.Bytes()) {
			continue
		}
		if err := WriteAtomic(s.path(d), buf.Bytes(), 0o600); err != nil {
			return err
		}
	}
	// Entries whose latest copy lives in a later file are now written there; nothing else to do.
	return nil
}

// Close closes the open file.
func (s *Store) Close() error {
	if s.file != nil {
		return s.file.Close()
	}
	return nil
}

// Size returns the bytes used by the log files.
func (s *Store) Size() int64 {
	if s.dir == "" {
		return 0
	}
	var n int64
	_ = filepath.WalkDir(filepath.Join(s.dir, logFolder), func(_ string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			if fi, err := d.Info(); err == nil {
				n += fi.Size()
			}
		}
		return nil
	})
	return n
}

// WriteAtomic writes a file through a temporary file and a rename.
func WriteAtomic(path string, b []byte, mode os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(name)
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(name)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(name)
		return err
	}
	if err := os.Chmod(name, mode); err != nil {
		os.Remove(name)
		return err
	}
	return os.Rename(name, path)
}

// Version file handling and migrations.

type versionFile struct {
	V int `json:"v"`
}

// Migrations[n] turns a version n folder into version n+1. A new layout adds one here.
var Migrations = map[int]func(dir string) error{
	0: migrate0,
}

// Migrate brings a data folder to DataVersion; it refuses folders from a newer build.
func Migrate(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	p := filepath.Join(dir, "VERSION")
	v := 0
	b, err := os.ReadFile(p)
	switch {
	case err == nil:
		var vf versionFile
		if json.Unmarshal(b, &vf) != nil {
			return fmt.Errorf("data folder: unreadable VERSION file")
		}
		v = vf.V
	case errors.Is(err, fs.ErrNotExist):
	default:
		return err
	}
	if v > DataVersion {
		return fmt.Errorf("data folder is version %d; this relay knows up to %d: upgrade the relay", v, DataVersion)
	}
	for v < DataVersion {
		fn, ok := Migrations[v]
		if !ok {
			return fmt.Errorf("no migration from data version %d", v)
		}
		if err := fn(dir); err != nil {
			return fmt.Errorf("migrating data from version %d: %w", v, err)
		}
		v++
		if err := WriteAtomic(p, fmt.Appendf(nil, "{\"v\":%d}\n", v), 0o600); err != nil {
			return err
		}
	}
	return nil
}

// migrate0: a folder without a VERSION file (made before the first release, or empty)
// already has the version 1 layout; it only gets stamped.
func migrate0(string) error { return nil }

// Package store keeps records as plain files in one data folder: one append-only file per
// real day (log/<day>.jsonl), each line a record with its receipts. Indexes live in memory
// and are rebuilt on start. Callers serialise access (the relay holds one lock).
//
// Memory holds a small fixed entry per record (id, author, kind, t, board slot, where its line
// is), not the record: the line is read back from its day file when the record is sent, and
// parsed only where a field of its body is needed. Recent lines stay in memory for a while (they
// are the ones fanned out, pushed and fetched most), and so do the few records the relay reads
// all the time (its server's chain and hide records), parsed.
package store

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"iter"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// DataVersion is the version of the data folder's layout this build writes.
// A var so tests can play an upgrade through the migration chain.
var DataVersion = 1

// Entry is a stored record: what the indexes and the hot paths need, and where its line is.
// Exported fields never change after Put.
type Entry struct {
	ID   string
	Key  string // the author (one string per key, shared by its entries)
	Kind string
	T    int64
	Slot int64  // board slot: earliest valid receipt t
	Seq  uint64 // storage order, for cursors

	deal *parties // a deal's (offer, accept, decline)
	off  int64    // where its latest line starts; -1: not on disk (held in memory)
	day  int32    // real day of the file holding that line
	n    int32    // the line's length, without the newline
	rc   int32    // the receipts' length (the line is {"rcpt":R,"rec":C,"slot":N})
	gone bool     // removed; still in the ordered lists until they are compacted
	x    *held    // what is kept in memory besides: nil for most entries
}

// The entry is kept small (112 bytes): there is one per record.
type parties struct{ to, offer string }

type held struct {
	mem []byte      // the line, while kept in memory
	rec *fed.Record // parsed, for the kinds kept parsed (pinned)
}

// To is a deal's to key ("" for an open offer, and for other kinds).
func (e *Entry) To() string {
	if e.deal == nil {
		return ""
	}
	return e.deal.to
}

// Offer is the offer an accept or decline answers ("" for other kinds).
func (e *Entry) Offer() string {
	if e.deal == nil {
		return ""
	}
	return e.deal.offer
}

func (e *Entry) mem() []byte {
	if e.x == nil {
		return nil
	}
	return e.x.mem
}

func (e *Entry) rec() *fed.Record {
	if e.x == nil {
		return nil
	}
	return e.x.rec
}

func (e *Entry) setMem(b []byte) {
	if b != nil && e.x == nil {
		e.x = &held{}
	}
	if e.x != nil {
		if e.x.mem = b; b == nil && e.x.rec == nil {
			e.x = nil
		}
	}
}

func (e *Entry) setRec(r *fed.Record) {
	if e.x == nil {
		e.x = &held{}
	}
	e.x.rec = r
}

// day64 is the real day of the file holding the entry's line.
func (e *Entry) day64() int64 { return int64(e.day) }

// Results of Put.
const (
	Stored    = "stored"
	Dup       = "duplicate"
	Merged    = "merged"
	maxLine   = 2 << 20
	logFolder = "log"
)

// The layout of a line (canonical JSON of {rec, rcpt, slot}: keys sorted, no spaces).
const (
	linePre = `{"rcpt":`
	lineRec = `,"rec":`
	lineSlo = `,"slot":`
)

// RecentBytes bounds the lines of recent records kept in memory (a var for tests).
var RecentBytes = 4 << 20

// maxOpen bounds the day files kept open for reading.
const maxOpen = 32

// keyList is one author's entries in storage order (removed ones until compacted).
type keyList struct {
	key  string
	ents []*Entry
	gone int
}

// Store is the record store. A zero dir keeps everything in memory (tests, vectors).
type Store struct {
	dir    string
	byID   map[string]*Entry
	byKey  map[string]*keyList
	count  map[string]int      // live entries per kind
	order  []*Entry            // every entry in storage order (removed ones until compacted)
	kinds  map[string][]*Entry // the same per kind
	gone   int                 // removed entries still in the ordered lists
	shrunk map[int64]bool      // days whose file holds records removed since (Compact rewrites them)
	seq    uint64
	day    int64
	file   *os.File // today's file, for appending
	end    int64    // its size
	open   map[int64]*os.File
	recent []*Entry // entries whose line was kept in memory when stored, oldest first
	recN   int      // bytes of those lines
	lock   *os.File // the data folder's lock, held while open
	Loaded int      // lines read on open
	Bad    int      // lines that did not check on open
	// Keep chooses the signatures a merged multi-signer record keeps (10.11); nil keeps the
	// author and the first others by key, at most fed.MaxSigners. Set by the relay, which knows
	// the chain; called with its lock held.
	Keep func(rec *fed.Record, sigs []fed.SigEntry) []fed.SigEntry
	// OnLoad, when set before records are loaded (OpenWith), sees each record read on open as it
	// is stored, parsed, with its receipts: what is built from records at start is built from
	// these, without reading them a second time.
	onLoad func(e *Entry, rec *fed.Record, rcpts []map[string]any)
}

// Memory returns a store without files.
func Memory() *Store {
	return &Store{byID: map[string]*Entry{}, byKey: map[string]*keyList{}, count: map[string]int{},
		kinds: map[string][]*Entry{}, shrunk: map[int64]bool{}, open: map[int64]*os.File{}}
}

// ErrLocked: another relay has the data folder open.
var ErrLocked = errors.New("the data folder is in use by another relay (relay serve already running?)")

// LockName is the data folder's lock file.
const LockName = "LOCK"

// Open opens (and migrates) a data folder and loads every record. The folder stays locked until
// Close: a second Open of it, in this process or another, fails with ErrLocked.
func Open(dir string) (*Store, error) { return OpenWith(dir, nil) }

// OpenWith is Open, calling onLoad for each record stored while loading (in storage order).
func OpenWith(dir string, onLoad func(e *Entry, rec *fed.Record, rcpts []map[string]any)) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	lock, err := lockDir(filepath.Join(dir, LockName))
	if err != nil {
		return nil, err
	}
	s, err := open(dir, onLoad)
	if err != nil {
		lock.Close()
		return nil, err
	}
	s.lock = lock
	return s, nil
}

func open(dir string, onLoad func(e *Entry, rec *fed.Record, rcpts []map[string]any)) (*Store, error) {
	if err := Migrate(dir); err != nil {
		return nil, err
	}
	s := Memory()
	s.dir, s.onLoad = dir, onLoad
	if err := os.MkdirAll(filepath.Join(dir, logFolder), 0o700); err != nil {
		return nil, err
	}
	days, err := s.days()
	if err != nil {
		return nil, err
	}
	for _, d := range days {
		if err := s.load(d); err != nil {
			s.closeFiles()
			return nil, err
		}
	}
	s.onLoad = nil
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
	Rec  json.RawMessage `json:"rec"`
	Rcpt json.RawMessage `json:"rcpt"`
	Slot int64           `json:"slot"`
}

func (s *Store) load(day int64) error {
	f, err := os.Open(s.path(day))
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64<<10), maxLine)
	var off int64
	for sc.Scan() {
		b := sc.Bytes()
		at := off
		off += int64(len(b)) + 1
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
		if v, code := canon.ParseStrict(l.Rcpt); code == "" {
			list, _ := v.([]any)
			for _, r := range list {
				if m, ok := r.(map[string]any); ok {
					rcpts = append(rcpts, m)
				}
			}
		}
		res, e := s.insert(rec, rcpts, l.Slot, day)
		if res == Dup {
			continue
		}
		// The entry points at this line when it is exactly what Put would write; otherwise (a
		// line from an older build, edited by hand, or junk receipts dropped) the line it should
		// be stays in memory and the next compaction writes it.
		if res == Merged {
			// The copy read last holds every signature kept: it is the one the files keep.
			rcpts = s.Rcpts(e)
		}
		want, rc := encodeLine(e.rec(), rec, encodeRcpts(rcpts), e.Slot)
		e.day, e.n, e.rc = int32(day), int32(len(want)), int32(rc)
		e.setMem(nil)
		if bytes.Equal(want, b) {
			e.off = at
		} else {
			e.off = -1
			e.setMem(want)
			s.shrunk[day] = true
		}
		if e.rec() != nil {
			e.setMem(want)
		}
		if res == Stored && s.onLoad != nil {
			s.onLoad(e, rec, rcpts)
		}
	}
	return sc.Err()
}

// pinned kinds stay parsed in memory: the server's chain and hide records, read all the time.
func pinned(kind string) bool {
	return fed.IsMulti(kind) || kind == "genesis" || kind == "hide"
}

func (s *Store) keep(rec *fed.Record, sigs []fed.SigEntry) []fed.SigEntry {
	if s.Keep != nil {
		return s.Keep(rec, sigs)
	}
	return fed.KeepSigs(rec.Key, sigs, nil)
}

var kindNames = func() map[string]string {
	m := map[string]string{}
	for _, k := range fed.RecordKinds {
		m[k] = k
	}
	return m
}()

// insert adds or merges in memory; it reports the result. Signatures of multi-signer records
// pass through Keep, so no copy, however padded, makes a stored record exceed 16 signers.
func (s *Store) insert(rec *fed.Record, rcpts []map[string]any, slot, day int64) (string, *Entry) {
	if e, ok := s.byID[rec.ID]; ok {
		old := e.rec()
		if rec.Sigs == nil || old == nil {
			return Dup, e
		}
		sigs, _ := fed.MergeSigs(old.Sigs, rec.Sigs)
		sigs = s.keep(old, sigs)
		if fed.SameSigs(sigs, old.Sigs) {
			return Dup, e
		}
		e.setRec(old.WithSigs(sigs))
		return Merged, e
	}
	if rec.Sigs != nil {
		if sigs := s.keep(rec, rec.Sigs); !fed.SameSigs(sigs, rec.Sigs) {
			rec = rec.WithSigs(sigs)
		}
	}
	s.seq++
	kind := rec.Kind
	if k, ok := kindNames[kind]; ok {
		kind = k
	}
	kl := s.byKey[rec.Key]
	if kl == nil {
		kl = &keyList{key: rec.Key}
		s.byKey[rec.Key] = kl
	}
	e := &Entry{ID: rec.ID, Key: kl.key, Kind: kind, T: rec.T, Slot: slot, Seq: s.seq, day: int32(day), off: -1}
	switch kind {
	case "offer", "accept", "decline":
		p := &parties{}
		if to, _ := rec.Body["to"].(string); to != "" {
			p.to = to
			if t := s.byKey[to]; t != nil {
				p.to = t.key
			}
		}
		p.offer, _ = rec.Body["offer"].(string)
		e.deal = p
	}
	if pinned(kind) {
		e.setRec(rec)
	}
	s.byID[e.ID] = e
	kl.ents = append(kl.ents, e)
	s.count[kind]++
	s.order = append(s.order, e)
	s.kinds[kind] = append(s.kinds[kind], e)
	return Stored, e
}

// Put stores a checked record with its receipts, received on real day `day`.
func (s *Store) Put(rec *fed.Record, rcpts []map[string]any, slot, day int64) (string, *Entry, error) {
	res, e := s.insert(rec, rcpts, slot, day)
	if res == Dup {
		return res, e, nil
	}
	// A merged copy goes into today's file, with the receipts and slot it was stored with;
	// loading merges the lines again.
	rj := encodeRcpts(rcpts)
	if res == Merged {
		if _, rj, _ = s.Raw(e); rj == nil {
			rj = []byte("[]")
		}
		slot = e.Slot
	}
	line, rc := encodeLine(e.rec(), rec, rj, slot)
	e.day, e.off, e.n, e.rc = int32(max(e.day64(), day)), -1, int32(len(line)), int32(rc)
	e.setMem(line)
	if s.dir == "" {
		return res, e, nil
	}
	off, err := s.write(line, e.day64())
	if err != nil {
		return res, e, err // the line stays in memory; the next compaction writes it
	}
	e.off = off
	if e.rec() == nil {
		s.recent = append(s.recent, e)
		s.recN += len(line)
		for s.recN > RecentBytes && len(s.recent) > 1 {
			old := s.recent[0]
			s.recent[0] = nil
			s.recent = s.recent[1:]
			s.recN -= int(old.n)
			if old.off >= 0 && old.rec() == nil {
				old.setMem(nil)
			}
		}
		if cap(s.recent) > 4*len(s.recent)+1024 {
			s.recent = slices.Clone(s.recent)
		}
	}
	return res, e, nil
}

// encodeLine is the line of a record: pinned holds the merged copy when there is one. It returns
// the line (without newline) and the receipts' length.
func encodeLine(pinned, rec *fed.Record, rcpts []byte, slot int64) ([]byte, int) {
	if pinned != nil {
		rec = pinned
	}
	b := make([]byte, 0, 1024)
	b = append(b, linePre...)
	b = append(b, rcpts...)
	rc := len(rcpts)
	b = append(b, lineRec...)
	b = canon.Append(b, rec.Value)
	b = append(b, lineSlo...)
	b = strconv.AppendInt(b, slot, 10)
	b = append(b, '}')
	return b, rc
}

// encodeRcpts is the canonical JSON array of receipts.
func encodeRcpts(rcpts []map[string]any) []byte {
	b := []byte{'['}
	for i, r := range rcpts {
		if i > 0 {
			b = append(b, ',')
		}
		b = canon.Append(b, r)
	}
	return append(b, ']')
}

// write appends a line to a day's file; it returns where the line starts.
func (s *Store) write(line []byte, day int64) (int64, error) {
	if s.file == nil || s.day != day {
		if s.file != nil {
			s.file.Close()
			s.file = nil
		}
		// A line cut short by a crash would glue the next record onto it: cut it off first.
		if err := repairTail(s.path(day)); err != nil {
			return -1, err
		}
		f, err := os.OpenFile(s.path(day), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			return -1, err
		}
		fi, err := f.Stat()
		if err != nil {
			f.Close()
			return -1, err
		}
		s.file, s.day, s.end = f, day, fi.Size()
	}
	at := s.end
	buf := make([]byte, 0, len(line)+1)
	if _, err := s.file.Write(append(append(buf, line...), '\n')); err != nil {
		// Part of the line may be written: reopen (and repair) before the next one.
		s.file.Close()
		s.file = nil
		return -1, err
	}
	s.end += int64(len(line)) + 1
	return at, nil
}

// repairTail cuts a file back to its last newline, dropping a line a crash left unfinished.
func repairTail(path string) error {
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return err
	}
	end := fi.Size()
	buf := make([]byte, 64<<10)
	for pos := end; pos > 0; {
		n := min(int64(len(buf)), pos)
		pos -= n
		if _, err := f.ReadAt(buf[:n], pos); err != nil {
			return err
		}
		if i := bytes.LastIndexByte(buf[:n], '\n'); i >= 0 {
			if cut := pos + int64(i) + 1; cut != end {
				return f.Truncate(cut)
			}
			return nil
		}
	}
	if end > 0 {
		return f.Truncate(0)
	}
	return nil
}

// reader is a day's file open for reading.
func (s *Store) reader(day int64) (*os.File, error) {
	if f := s.open[day]; f != nil {
		return f, nil
	}
	if len(s.open) >= maxOpen {
		for d, f := range s.open {
			f.Close()
			delete(s.open, d)
			break
		}
	}
	f, err := os.Open(s.path(day))
	if err != nil {
		return nil, err
	}
	s.open[day] = f
	return f, nil
}

func (s *Store) closeReader(day int64) {
	if f := s.open[day]; f != nil {
		f.Close()
		delete(s.open, day)
	}
}

// ErrUnreadable: a record's line could not be read back from its day file.
var ErrUnreadable = errors.New("store: a record's line could not be read back")

// line returns an entry's line: from memory, or read from its day file.
func (s *Store) line(e *Entry) ([]byte, error) {
	if m := e.mem(); m != nil {
		return m, nil
	}
	if e.gone || e.off < 0 {
		return nil, ErrUnreadable
	}
	f, err := s.reader(e.day64())
	if err != nil {
		return nil, err
	}
	b := make([]byte, e.n)
	if _, err := f.ReadAt(b, e.off); err != nil {
		s.closeReader(e.day64())
		return nil, err
	}
	if !bytes.HasPrefix(b, []byte(linePre)) {
		return nil, ErrUnreadable
	}
	return b, nil
}

// Raw returns a record's canonical text and its receipts as a canonical JSON array, as frames
// carry them (the slices share one buffer; callers do not change them).
func (s *Store) Raw(e *Entry) (rec, rcpt []byte, err error) {
	b, err := s.line(e)
	if err != nil {
		return nil, nil, err
	}
	p, rc := len(linePre), int(e.rc)
	start := p + rc + len(lineRec)
	end := bytes.LastIndex(b, []byte(lineSlo))
	if start > end || end < 0 || string(b[p+rc:start]) != lineRec {
		return nil, nil, ErrUnreadable
	}
	return b[start:end:end], b[p : p+rc : p+rc], nil
}

// Rec returns the record parsed, or nil when it cannot be read back. Only the server's chain and
// hide records stay parsed: for others this parses a copy, which callers may keep.
func (s *Store) Rec(e *Entry) *fed.Record {
	if r := e.rec(); r != nil {
		return r
	}
	b, _, err := s.Raw(e)
	if err != nil {
		return nil
	}
	rec, code := fed.ParseRecord(b, 0, fed.Opts{Trusted: true})
	if code != "" || rec.ID != e.ID {
		return nil
	}
	return rec
}

// Rcpts returns a record's receipts, parsed.
func (s *Store) Rcpts(e *Entry) []map[string]any {
	_, b, err := s.Raw(e)
	if err != nil {
		return nil
	}
	v, _ := canon.ParseStrict(b)
	list, _ := v.([]any)
	out := make([]map[string]any, 0, len(list))
	for _, r := range list {
		if m, ok := r.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

// Get returns an entry by id.
func (s *Store) Get(id string) *Entry { return s.byID[id] }

// Len is the number of records.
func (s *Store) Len() int { return len(s.byID) }

// Count is the number of records of one kind.
func (s *Store) Count(kind string) int { return s.count[kind] }

// Kind returns the entries of one kind, in storage order.
func (s *Store) Kind(k string) iter.Seq[*Entry] {
	return func(yield func(*Entry) bool) {
		for _, e := range s.kinds[k] {
			if !e.gone && !yield(e) {
				return
			}
		}
	}
}

// Key returns the entries by one author key, in storage order.
func (s *Store) Key(k string) iter.Seq[*Entry] {
	return func(yield func(*Entry) bool) {
		kl := s.byKey[k]
		if kl == nil {
			return
		}
		for _, e := range kl.ents {
			if !e.gone && !yield(e) {
				return
			}
		}
	}
}

// All returns every entry in storage order.
func (s *Store) All() []*Entry {
	out := make([]*Entry, 0, len(s.byID))
	s.Scan(0, nil, func(e *Entry) bool { out = append(out, e); return true })
	return out
}

// After returns entries with Seq > seq in storage order.
func (s *Store) After(seq uint64) []*Entry {
	var out []*Entry
	s.Scan(seq, nil, func(e *Entry) bool { out = append(out, e); return true })
	return out
}

// Scan calls fn for each entry with Seq > after, in storage order, of the given kinds (nil: all),
// until fn returns false. It costs the entries visited, not the size of the store.
func (s *Store) Scan(after uint64, kinds []string, fn func(*Entry) bool) {
	from := func(l []*Entry) int { return sort.Search(len(l), func(i int) bool { return l[i].Seq > after }) }
	if kinds == nil {
		for _, e := range s.order[from(s.order):] {
			if !e.gone && !fn(e) {
				return
			}
		}
		return
	}
	// Merge the per-kind lists, each already in storage order.
	lists := make([][]*Entry, 0, len(kinds))
	for i, k := range kinds {
		if l := s.kinds[k]; len(l) > 0 && !slices.Contains(kinds[:i], k) {
			lists = append(lists, l[from(l):])
		}
	}
	for {
		best := -1
		for i, l := range lists {
			if len(l) > 0 && (best < 0 || l[0].Seq < lists[best][0].Seq) {
				best = i
			}
		}
		if best < 0 {
			return
		}
		e := lists[best][0]
		lists[best] = lists[best][1:]
		if !e.gone && !fn(e) {
			return
		}
	}
}

// Seq is the last storage number given.
func (s *Store) Seq() uint64 { return s.seq }

// Remove forgets entries in memory; Compact drops them from the files.
func (s *Store) Remove(ids []string) {
	isGone := func(e *Entry) bool { return e.gone }
	for _, id := range ids {
		e := s.byID[id]
		if e == nil {
			continue
		}
		delete(s.byID, id)
		if s.count[e.Kind]--; s.count[e.Kind] <= 0 {
			delete(s.count, e.Kind)
		}
		e.gone = true
		e.setMem(nil)
		s.gone++
		s.shrunk[e.day64()] = true
		kl := s.byKey[e.Key]
		if kl.gone++; kl.gone == len(kl.ents) {
			delete(s.byKey, e.Key)
		} else if kl.gone > 8 && kl.gone*2 > len(kl.ents) {
			kl.ents = slices.DeleteFunc(kl.ents, isGone)
			kl.gone = 0
		}
	}
	if s.gone > 1024 && s.gone*2 > len(s.order) {
		s.order = slices.DeleteFunc(s.order, isGone)
		for k, l := range s.kinds {
			if l = slices.DeleteFunc(l, isGone); len(l) == 0 {
				delete(s.kinds, k)
			} else {
				s.kinds[k] = l
			}
		}
		s.gone = 0
		// The ring of recent lines may hold removed entries: they no longer count.
		s.recent = slices.DeleteFunc(s.recent, isGone)
		s.recN = 0
		for _, e := range s.recent {
			s.recN += int(e.n)
		}
	}
}

// Compact rewrites or deletes day files so they hold only the entries still kept, through a
// temporary file. Today's file (and a later one) is rewritten only when records in it were
// removed, so a removal is durable the same day and nothing comes back after a restart. A file
// that already holds exactly its kept lines, in order, is left alone.
func (s *Store) Compact(today int64) error {
	if s.dir == "" {
		return nil
	}
	days, err := s.days()
	if err != nil {
		return err
	}
	byDay := map[int64][]*Entry{}
	for _, e := range s.order {
		if !e.gone {
			byDay[e.day64()] = append(byDay[e.day64()], e)
		}
	}
	for _, d := range days {
		if d >= today && !s.shrunk[d] {
			continue
		}
		kept := byDay[d]
		if s.file != nil && s.day == d && (len(kept) == 0 || !s.intact(d, kept)) {
			s.file.Close() // reopened by the next write
			s.file = nil
		}
		if len(kept) == 0 {
			s.closeReader(d)
			if err := os.Remove(s.path(d)); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return err
			}
			continue
		}
		if s.intact(d, kept) {
			continue
		}
		if err := s.rewrite(d, kept); err != nil {
			return err
		}
	}
	clear(s.shrunk)
	return nil
}

// intact reports whether a day's file holds exactly the lines of kept (in storage order), each
// where its entry says, and nothing else.
func (s *Store) intact(d int64, kept []*Entry) bool {
	var at int64
	for _, e := range kept {
		if e.off != at {
			return false
		}
		at += int64(e.n) + 1
	}
	fi, err := os.Stat(s.path(d))
	return err == nil && fi.Size() == at
}

// rewrite writes a day's kept lines to a temporary file, renames it over the day's file and
// points the entries at their new places.
func (s *Store) rewrite(d int64, kept []*Entry) error {
	tmp, err := os.CreateTemp(filepath.Join(s.dir, logFolder), ".tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	fail := func(err error) error {
		tmp.Close()
		os.Remove(name)
		return err
	}
	w := bufio.NewWriterSize(tmp, 256<<10)
	offs := make([]int64, len(kept))
	var at int64
	for i, e := range kept {
		b, err := s.line(e)
		if err != nil {
			offs[i] = -1 // lost from the file already (a disk error, a hand edit): not written again
			continue
		}
		offs[i] = at
		w.Write(b)
		w.WriteByte('\n')
		at += int64(len(b)) + 1
	}
	if err := w.Flush(); err != nil {
		return fail(err)
	}
	if err := tmp.Sync(); err != nil {
		return fail(err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(name)
		return err
	}
	if err := os.Chmod(name, 0o600); err != nil {
		os.Remove(name)
		return err
	}
	if s.file != nil && s.day == d {
		s.file.Close()
		s.file = nil
	}
	if err := os.Rename(name, s.path(d)); err != nil {
		os.Remove(name)
		return err
	}
	s.closeReader(d)
	for i, e := range kept {
		e.off = offs[i]
		if e.off >= 0 && e.rec() == nil && !s.isRecent(e) {
			e.setMem(nil)
		}
	}
	return nil
}

func (s *Store) isRecent(e *Entry) bool {
	return len(s.recent) > 0 && e.Seq >= s.recent[0].Seq && e.mem() != nil
}

func (s *Store) closeFiles() {
	if s.file != nil {
		s.file.Close()
		s.file = nil
	}
	for d := range s.open {
		s.closeReader(d)
	}
}

// Close closes the open files and lets the folder go.
func (s *Store) Close() error {
	var err error
	if s.file != nil {
		err = s.file.Close()
		s.file = nil
	}
	s.closeFiles()
	if s.lock != nil {
		s.lock.Close()
		s.lock = nil
	}
	return err
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

// MemSize returns the bytes of record lines held in memory (recent and pinned records, lines
// waiting for a compaction).
func (s *Store) MemSize() int64 {
	var n int64
	for _, e := range s.byID {
		n += int64(len(e.mem()))
	}
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

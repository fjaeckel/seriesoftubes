package node_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
)

// Records a leave removed stay removed after a restart the same day, with or without a
// retention run in between, and after the leave's day files were compacted.
func TestLeaveSurvivesRestart(t *testing.T) {
	n := rt.New(t)
	s := n.Found("keeper", "open")
	x := s.Nodes[0]
	carol, dave := rt.Key("carol"), rt.Key("dave")
	annC := rt.Announce(carol, n.Clock.Unix(), "Carol")
	annD := rt.Announce(dave, n.Clock.Unix(), "Dave")
	x.MustPut(annC)
	x.MustPut(annD)
	n.Clock.Add(time.Second)
	x.MustPut(carol.Seal("leave", n.Clock.Unix(), map[string]any{}))
	x.MustPut(dave.Seal("leave", n.Clock.Unix(), map[string]any{}))
	x.R.GC() // carol's removal is written (today's file rewritten); dave's waits for the restart
	x.Restart()
	if x.Has(rt.ID(annC)) || x.Has(rt.ID(annD)) {
		t.Fatal("a record removed by leave came back after a restart")
	}
	n.Clock.Add(48 * time.Hour)
	x.R.GC()
	x.Restart()
	if x.Has(rt.ID(annC)) || x.Has(rt.ID(annD)) {
		t.Fatal("a record removed by leave came back after compaction")
	}
}

// A second relay on a data folder in use is refused before it touches anything (its socket,
// retention, compaction); once the first stops, the folder opens again.
func TestDataFolderIsLocked(t *testing.T) {
	n := rt.New(t)
	x := n.Found("keeper", "open").Nodes[0]
	if _, err := node.New(node.Options{Dir: x.Dir, Config: x.Cfg, Node: x.Key}); !errors.Is(err, store.ErrLocked) {
		t.Fatalf("a second relay on the folder: %v", err)
	}
	x.Stop()
	r, err := node.New(node.Options{Dir: x.Dir, Config: x.Cfg, Node: x.Key})
	if err != nil {
		t.Fatalf("the folder after the first relay stopped: %v", err)
	}
	r.Close()
}

// A line cut short by a crash does not take the next record with it.
func TestTornLineKeepsNextRecord(t *testing.T) {
	n := rt.New(t)
	s := n.Found("keeper", "open")
	x := s.Nodes[0]
	a := rt.Announce(rt.Key("alice"), n.Clock.Unix(), "Alice")
	x.MustPut(a)
	x.Stop()
	files, _ := filepath.Glob(filepath.Join(x.Dir, "log", "*.jsonl"))
	last := files[len(files)-1]
	f, err := os.OpenFile(last, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(`{"rec":{"kind":"anno`)
	f.Close()
	x.Restart()
	n.Clock.Add(time.Second)
	b := rt.Announce(rt.Key("bob"), n.Clock.Unix(), "Bob")
	x.MustPut(b)
	x.Restart()
	if !x.Has(rt.ID(a)) || !x.Has(rt.ID(b)) {
		t.Fatal("the first record stored after a torn line is lost on the next restart")
	}
}

// A network silent for more than 72 hours that posts again keeps the record that carries its
// value forward into the previous window (10.2): the boards still give it a value there.
func TestRetentionKeepsRecordEffectiveAtPreviousWindow(t *testing.T) {
	n := rt.New(t)
	s := n.Found("keeper", "open")
	x := s.Nodes[0]
	k := rt.Key("quiet")
	old := rt.Stats(k, n.Clock.Unix(), 3, false)
	x.MustPut(old)
	n.Clock.Add(4 * 24 * time.Hour) // silent four days: older than 72 h, within 7 days of the previous window
	x.MustPut(rt.Stats(k, n.Clock.Unix(), 4, false))
	x.R.GC()
	if !x.Has(rt.ID(old)) {
		t.Fatal("retention dropped the record effective at the previous window's start")
	}
	n.Clock.Add(7 * 24 * time.Hour) // now out of the carry-forward reach
	x.MustPut(rt.Stats(k, n.Clock.Unix(), 5, false))
	x.R.GC()
	if x.Has(rt.ID(old)) {
		t.Fatal("a record no window can reach was kept")
	}
}

// Votes are kept as long as they can count: 90 days, plus the 7 days a shun holds after the votes
// fell below the threshold (10.7 step 5).
func TestVotesKeptUntilShunCanLift(t *testing.T) {
	n := rt.New(t)
	s := n.Found("keeper", "open")
	x := s.Nodes[0]
	v := s.Op.Seal("shun", n.Clock.Unix(), map[string]any{"server": s.ID, "target": rt.Key("spammer").Key, "reason": "spam"})
	x.MustPut(v)
	n.Clock.Add(time.Duration(fed.VoteLife+fed.Day) * time.Second)
	x.R.GC()
	if !x.Has(rt.ID(v)) {
		t.Fatal("a vote that still holds a shun (7-day lift) was dropped at 90 days")
	}
	n.Clock.Add(time.Duration(fed.ShunLift) * time.Second)
	x.R.GC()
	if x.Has(rt.ID(v)) {
		t.Fatal("a vote that can no longer count was kept")
	}
}

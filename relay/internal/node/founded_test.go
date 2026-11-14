package node_test

import (
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	rt "github.com/fjaeckel/seriesoftubes/relay/internal/relaytest"
)

// A network's founded never changes (5.1): once a key has an announce here, an announce saying
// another founded day is refused, so a network cannot claim the newcomer price late, nor be an
// old network all of a sudden. The same founded, later, is taken.
func TestAnnounceFoundedIsFixed(t *testing.T) {
	n := rt.New(t)
	a := n.Found("fixed", "open")
	x := a.Nodes[0]
	now := n.Clock.Unix()
	k := rt.Key("alice")
	day := now / fed.Day
	x.MustPut(rt.AnnounceFounded(k, now, "Alice", day-100))
	if code := x.Put(rt.AnnounceFounded(k, now+10, "Alice", day-1)); code != fed.Refused {
		t.Fatalf("a later founded: %q, want refused", code)
	}
	if code := x.Put(rt.AnnounceFounded(k, now+20, "Alice", day-400)); code != fed.Refused {
		t.Fatalf("an earlier founded: %q, want refused", code)
	}
	x.MustPut(rt.AnnounceFounded(k, now+30, "Alice again", day-100))
	// Another key says what it likes on its first announce (only up to today, as the body rules say).
	x.MustPut(rt.AnnounceFounded(rt.Key("bob"), now, "Bob", day))
}

package shun

import (
	"fmt"
	"testing"
	"time"
)

// A tally costs the votes for its target, not every vote times every voter: 20000 votes for
// 20000 targets, counted target by target as the relay does, take milliseconds, not minutes.
func TestTallyCostsTheTargetsVotes(t *testing.T) {
	now := int64(1800000000)
	listed, answered := now-40*86400, now-86400
	reg := Registry{AsOf: now}
	for i := 0; i < 10; i++ {
		reg.Servers = append(reg.Servers, Server{ID: fmt.Sprint("s", i), Operators: []string{fmt.Sprint("op", i)}, Listed: &listed, Answered: &answered})
	}
	byTarget := map[string][]Vote{}
	for i := 0; i < 20000; i++ {
		v := Vote{ID: fmt.Sprint("v", i), Kind: "shun", Key: fmt.Sprint("x", i), T: now - 10, Server: fmt.Sprint("unknown", i), Target: fmt.Sprint("t", i), Reason: "spam"}
		byTarget[v.Target] = append(byTarget[v.Target], v)
	}
	// Five real voters against one target, mixed in.
	for i := 0; i < 5; i++ {
		v := Vote{ID: fmt.Sprint("real", i), Kind: "shun", Key: fmt.Sprint("op", i), T: now - 10, Server: fmt.Sprint("s", i), Target: "t7", Reason: "abuse"}
		byTarget["t7"] = append(byTarget["t7"], v)
	}
	c := Prepare(reg)
	start := time.Now()
	shunned := 0
	for tg, votes := range byTarget {
		if c.Tally(votes, tg, now).Shunned {
			shunned++
		}
	}
	took := time.Since(start)
	if shunned != 1 || !c.Tally(byTarget["t7"], "t7", now).Shunned {
		t.Fatalf("shunned %d targets, want only t7", shunned)
	}
	if took > 2*time.Second {
		t.Fatalf("tallying 20000 targets took %v", took)
	}
	// The one-shot form agrees, and ignores votes for other targets.
	all := append(byTarget["t7"], byTarget["t1"]...)
	if r := Tally(reg, all, "t7", now); !r.Shunned || r.Votes != 5 || r.Voters != 10 || r.Need != 5 {
		t.Fatalf("tally %+v", r)
	}
}

func BenchmarkTallyJunk(b *testing.B) {
	now := int64(1800000000)
	listed, answered := now-40*86400, now-86400
	reg := Registry{AsOf: now}
	for i := 0; i < 100; i++ {
		reg.Servers = append(reg.Servers, Server{ID: fmt.Sprint("s", i), Operators: []string{fmt.Sprint("op", i)}, Listed: &listed, Answered: &answered})
	}
	c := Prepare(reg)
	votes := []Vote{{ID: "v", Kind: "shun", Key: "x", T: now - 10, Server: "unknown", Target: "t", Reason: "spam"}}
	for b.Loop() {
		c.Tally(votes, "t", now)
	}
}

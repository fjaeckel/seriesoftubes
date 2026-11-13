// Command relayload is a load test for the relay (docs/RELAY.md, "Load test"): it starts many
// relays as processes of their own on loopback, each a founded server synced with its neighbours,
// and many simulated players spread across them, then measures what the players see and what the
// relays cost. A development tool: not part of the release archives or the container image.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

const usage = `relayload: a load test for the relay (docs/RELAY.md, "Load test")

  go run ./cmd/relayload [--quick] [--servers 20] [--clients 1000] [--duration 12m] [--json FILE]

Starts --servers relays as separate processes on loopback (real TLS with a certificate made for the
run, real stores in a temporary folder, each its own founded server, all in a generated registry as
voters, sync policy open) linked in a ring with chords (--mesh full: every pair; --mesh registry:
no neighbours configured, the servers find each other in the registry and sync automatically), and --clients
simulated players spread over them, each with its own keys, acting like a game on a busy evening.
It prints a markdown report (and JSON with --json) and exits 1 when an assertion fails.

Every player presents its own private address in X-Forwarded-For, which the relays believe from
loopback (their default trustedProxies), so the per-address connection limits apply per player as
in production; no limit is changed.

Open files: each player holds one connection (two descriptors on loopback, its end and the
relay's), so 1000 players need about 2500 descriptors across the processes. The tool raises its
own soft limit to the hard limit; if it reports EMFILE, raise the hard limit (ulimit -n) first.

Flags:
`

// options are the run's settings.
type options struct {
	servers, clients   int
	duration, ramp     time.Duration
	quick              bool
	mesh, spread       string
	chord              int
	jsonOut, dir       string
	keep               bool
	seed               uint64
	r                  rates
	minAcked, minDeals float64
	propP95, rankP95   time.Duration
	stateP95           time.Duration
	memGrowth          float64
	readyTimeout       time.Duration
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "node" {
		if err := runNode(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "relayload node:", err)
			os.Exit(1)
		}
		return
	}
	o := parseFlags(os.Args[1:])
	os.Exit(run(o))
}

func parseFlags(args []string) options {
	var o options
	fs := flag.NewFlagSet("relayload", flag.ExitOnError)
	fs.Usage = func() { fmt.Fprint(os.Stderr, usage); fs.PrintDefaults() }
	fs.IntVar(&o.servers, "servers", 20, "relays (each its own server)")
	fs.IntVar(&o.clients, "clients", 1000, "simulated players")
	fs.DurationVar(&o.duration, "duration", 12*time.Minute, "how long the players play, from the first connection (two slot boundaries need 11m)")
	fs.DurationVar(&o.ramp, "ramp", time.Minute, "players connect spread over this")
	fs.BoolVar(&o.quick, "quick", false, "a short run (2.5m, 20s ramp) without the board checks")
	fs.StringVar(&o.mesh, "mesh", "ring", "ring (a ring with chords, 3 or 4 neighbours each), full, or registry (automatic sync among the registry's open servers)")
	fs.IntVar(&o.chord, "chord", 0, "ring: each server also links the one this far along (0: servers/4)")
	fs.StringVar(&o.spread, "spread", "round-robin", "players over servers: round-robin or skewed (Zipf: the first servers get most)")
	fs.StringVar(&o.jsonOut, "json", "", "also write the report as JSON to this file")
	fs.StringVar(&o.dir, "dir", "", "where to make the run's temporary folder (default: the system's; keep it short, it holds Unix sockets)")
	fs.BoolVar(&o.keep, "keep", false, "keep the run's folder (relay data and logs)")
	fs.Uint64Var(&o.seed, "seed", 1, "seed for the players' keys and choices")
	fs.DurationVar(&o.r.announce, "announce-every", 15*time.Minute, "mean interval of a player's new announce")
	fs.DurationVar(&o.r.rank, "rank-every", 2*time.Minute, "mean interval of a player's leaderboard look")
	fs.DurationVar(&o.r.nets, "nets-every", 5*time.Minute, "mean interval of a player's nets request")
	fs.DurationVar(&o.r.facets, "facets-every", 15*time.Minute, "mean interval of a player's facets request")
	fs.DurationVar(&o.r.deal, "deal-every", 10*time.Minute, "mean interval of a player's offer")
	fs.DurationVar(&o.r.reconnect, "reconnect-every", 30*time.Minute, "mean interval of a player's dropped connection (resumed with its cursor)")
	fs.DurationVar(&o.r.state, "state-every", 10*time.Second, "a player's live state tick (0: no live states)")
	fs.Float64Var(&o.r.change, "state-change", 0.5, "fraction of state ticks whose numbers changed (the others send only the keepalive)")
	fs.DurationVar(&o.stateP95, "state-p95", 10*time.Second, "assert: a live state shows on every other server's board of now within this (p95)")
	fs.Float64Var(&o.r.rankwhy, "rankwhy", 0.25, "fraction of rank answers spot-checked with rankwhy")
	fs.Float64Var(&o.r.filtered, "filtered", 0.3, "fraction of rank requests with filters")
	fs.Float64Var(&o.r.cross, "cross", 0.8, "fraction of offers to a player on another server")
	fs.Float64Var(&o.r.accept, "accept", 0.7, "fraction of offers accepted (the rest declined, sealed)")
	fs.Float64Var(&o.minAcked, "min-acked", 0.99, "assert: fraction of puts acked")
	fs.Float64Var(&o.minDeals, "min-deals", 0.95, "assert: fraction of offers answered (each way of server)")
	fs.DurationVar(&o.propP95, "prop-p95", 10*time.Second, "assert: announce propagation p95 to every other server")
	fs.DurationVar(&o.rankP95, "rank-p95", time.Second, "assert: warm rank p95")
	fs.Float64Var(&o.memGrowth, "mem-growth", 1.5, "assert: a relay's RSS at the end at most this times mid-run (plus 32 MB)")
	fs.DurationVar(&o.readyTimeout, "ready-timeout", 2*time.Minute, "how long the relays may take to start and sync")
	_ = fs.Parse(args)
	if o.quick {
		set := map[string]bool{}
		fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
		if !set["duration"] {
			o.duration = 150 * time.Second
		}
		if !set["ramp"] {
			o.ramp = 20 * time.Second
		}
	}
	if o.chord == 0 {
		o.chord = o.servers / 4
	}
	if o.servers < 1 || o.clients < 2 {
		fmt.Fprintln(os.Stderr, "relayload: need at least one server and two clients")
		os.Exit(2)
	}
	return o
}

// sample is what the relays looked like at one moment.
type sample struct {
	label string
	at    time.Time
	ps    map[int]procStat
	m     []map[string]float64 // per relay; nil when the scrape failed
	load  [3]float64
	self  float64 // this process's CPU seconds
}

func selfCPU() float64 {
	var ru syscall.Rusage
	if syscall.Getrusage(syscall.RUSAGE_SELF, &ru) != nil {
		return 0
	}
	return float64(ru.Utime.Nano()+ru.Stime.Nano()) / 1e9
}

func (c *cluster) sample(ctx context.Context, label string) *sample {
	s := &sample{label: label, at: time.Now(), m: make([]map[string]float64, len(c.relays)), load: loadAvg(), self: selfCPU()}
	var pids []int
	for _, r := range c.relays {
		if r.cmd != nil && r.cmd.Process != nil {
			pids = append(pids, r.cmd.Process.Pid)
		}
	}
	s.ps, _ = psStats(pids)
	if s.ps == nil {
		s.ps = map[int]procStat{}
	}
	var wg sync.WaitGroup
	for i, r := range c.relays {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if m, err := scrape(ctx, r.mport); err == nil {
				s.m[i] = m
			}
		}()
	}
	wg.Wait()
	// The relay's own process metrics are finer than ps (whose CPU time macOS rounds): used when present.
	for i, r := range c.relays {
		if m := s.m[i]; m != nil && r.cmd != nil && r.cmd.Process != nil {
			cpu, ok1 := m["process_cpu_seconds_total"]
			rss, ok2 := m["process_resident_memory_bytes"]
			if ok1 && ok2 {
				s.ps[r.cmd.Process.Pid] = procStat{cpu: cpu, rss: rss, metrics: true}
			}
		}
	}
	return s
}

// raiseNoFile raises this process's soft limit of open files to its hard limit (the relays
// inherit it); it returns the limit in force.
func raiseNoFile() uint64 {
	var l syscall.Rlimit
	if syscall.Getrlimit(syscall.RLIMIT_NOFILE, &l) != nil {
		return 0
	}
	if l.Cur < l.Max {
		want := l
		want.Cur = l.Max
		if runtime.GOOS == "darwin" && want.Cur > 1<<20 {
			want.Cur = 1 << 20 // macOS refuses more than OPEN_MAX-ish values for the soft limit
		}
		if syscall.Setrlimit(syscall.RLIMIT_NOFILE, &want) == nil {
			l = want
		}
	}
	return l.Cur
}

func run(o options) int {
	start := time.Now()
	nofile := raiseNoFile()
	need := uint64(o.clients*2 + o.servers*64 + 256)
	if nofile > 0 && nofile < need {
		fmt.Fprintf(os.Stderr, "relayload: open files limit %d is below the %d this run needs; raise it (ulimit -n) or expect EMFILE\n", nofile, need)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	root, err := os.MkdirTemp(o.dir, "rl")
	if err != nil {
		fmt.Fprintln(os.Stderr, "relayload:", err)
		return 2
	}
	if o.keep {
		fmt.Fprintln(os.Stderr, "relayload: run folder", root)
	} else {
		defer os.RemoveAll(root)
	}
	logf := func(format string, a ...any) {
		fmt.Fprintf(os.Stderr, "[%6.1fs] %s\n", time.Since(start).Seconds(), fmt.Sprintf(format, a...))
	}
	adj := topology(o.servers, o.mesh, o.chord)
	logf("founding %d servers (%s) in %s", o.servers, o.mesh, root)
	c, err := setup(root, o.servers, adj)
	if err != nil {
		fmt.Fprintln(os.Stderr, "relayload: setup:", err)
		return 2
	}
	if err := c.start(); err != nil {
		c.stop()
		fmt.Fprintln(os.Stderr, "relayload: start:", err)
		return 2
	}
	defer c.stop()
	t0 := time.Now()
	if err := c.waitReady(ctx, o.readyTimeout); err != nil {
		fmt.Fprintln(os.Stderr, "relayload:", err)
		return 2
	}
	syncTime := time.Since(t0)
	logf("relays up and synced with their neighbours in %.1fs", syncTime.Seconds())

	m := newMeter()
	w := &world{c: c, m: m, prop: newPropagation(c.dist), sprop: newPropagation(c.dist), deals: newDealBook(), r: o.r, byKey: map[string]*player{},
		live: make([]atomic.Int64, o.servers)}
	w.hc = &http.Client{Transport: loopbackTransport(c.pool, func(nc net.Conn) net.Conn { return counted{nc, m} })}
	for i := range o.clients {
		p := newPlayer(w, i, assign(i, o.clients, o.servers, o.spread), o.seed)
		w.players = append(w.players, p)
		w.byKey[p.key.Key] = p
	}
	ready := c.sample(ctx, "idle")
	playStart := time.Now()
	first := playStart.Unix() - playStart.Unix()%fed.SlotLen + fed.SlotLen
	w.warmAt = time.Unix(first+30, 0)
	pctx, pcancel := context.WithCancel(ctx)
	defer pcancel()
	var wg sync.WaitGroup
	for i, p := range w.players {
		wg.Add(1)
		go p.run(pctx, time.Duration(float64(o.ramp)*float64(i)/float64(o.clients)), &wg)
	}
	obs := startObservers(pctx, w)
	probes := make(chan struct{})
	go func() {
		defer close(probes)
		if o.r.state > 0 {
			time.Sleep(o.ramp)
			probeStates(pctx, w)
		}
	}()

	// Periodic samples: progress, peaks, and the start / mid / end the report compares.
	var samples []*sample
	var smu sync.Mutex
	takeSample := func(label string) *sample {
		s := c.sample(ctx, label)
		smu.Lock()
		samples = append(samples, s)
		smu.Unlock()
		return s
	}
	end := playStart.Add(o.duration)
	allBy := playStart.Add(o.ramp + time.Minute)
	mid := playStart.Add(o.ramp + (o.duration-o.ramp)/2)
	var startS, midS, endS *sample
	connectedAll := false
	connectedAt := time.Duration(0)
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	lastLog := time.Now()
	crashed := ""
loop:
	for {
		select {
		case <-ctx.Done():
			logf("interrupted: stopping")
			break loop
		case now := <-tick.C:
			for _, r := range c.relays {
				if r.crashed() && !strings.Contains(crashed, r.name) {
					crashed += r.name + " "
					logf("%s exited: %v\n%s", r.name, r.exitErr, tail(r.logPath, 20))
				}
			}
			n := m.count("connected")
			if !connectedAll && n >= int64(o.clients) {
				connectedAll, connectedAt = true, now.Sub(playStart)
				logf("all %d players connected", n)
			}
			if startS == nil && (connectedAll || now.After(allBy)) {
				startS = takeSample("start")
			}
			if midS == nil && now.After(mid) {
				midS = takeSample("mid")
			}
			if now.Sub(lastLog) >= 30*time.Second {
				lastLog = now
				s := takeSample("tick")
				logf("connected %d, puts %d acked %d, rank %d, load %.2f %.2f %.2f", n, m.count("puts"), m.count("acked"),
					len(m.lat["rank"]), s.load[0], s.load[1], s.load[2])
			}
			if now.After(end) {
				break loop
			}
		}
	}
	if startS == nil {
		startS = takeSample("start")
	}
	if midS == nil {
		midS = takeSample("mid")
	}
	endS = takeSample("end")
	playEnd := time.Now()
	pcancel()
	wg.Wait()
	obs.wait()
	<-probes
	var boardsOK *boardCheck
	if !o.quick && ctx.Err() == nil {
		boardsOK = checkBoards(ctx, w)
	}
	c.stop()
	rep := buildReport(o, c, w, ready, startS, midS, endS, samples, playStart, playEnd, syncTime, connectedAll, connectedAt, obs, boardsOK, crashed)
	fmt.Print(rep.markdown())
	if o.jsonOut != "" {
		b, _ := json.MarshalIndent(rep, "", "  ")
		if err := os.WriteFile(o.jsonOut, append(b, '\n'), 0o644); err != nil {
			fmt.Fprintln(os.Stderr, "relayload:", err)
		}
	}
	if ctx.Err() != nil {
		return 130
	}
	if len(rep.Failures) > 0 {
		return 1
	}
	return 0
}

// assign puts player i on a server: round-robin, or skewed (Zipf, s = 1: the first server gets
// most players, as a well-known server would).
func assign(i, n, servers int, spread string) int {
	if spread != "skewed" || servers == 1 {
		return i % servers
	}
	h := 0.0
	for k := 1; k <= servers; k++ {
		h += 1 / float64(k)
	}
	x := (float64(i) + 0.5) / float64(n) * h
	for k := 1; k <= servers; k++ {
		x -= 1 / float64(k)
		if x <= 0 {
			return k - 1
		}
	}
	return servers - 1
}

// observers are one extra session per server that proves a key of its own and subscribes to the
// deal kinds: no deal is ever addressed to them, so any deal record they get is a leak.
type observers struct {
	wg    sync.WaitGroup
	mu    sync.Mutex
	got   int64 // deal records received
	ok    int   // observers that subscribed
	recvd int64 // records of any kind
}

func startObservers(ctx context.Context, w *world) *observers {
	o := &observers{}
	for i, r := range w.c.relays {
		o.wg.Add(1)
		go func() {
			defer o.wg.Done()
			k, _ := fed.NewSigner(seedFor(0xdead, i))
			h := http.Header{}
			h.Set("X-Forwarded-For", fmt.Sprintf("10.254.%d.%d", i/256, i%256))
			dctx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			cl, err := client.Dial(dctx, r.url, client.Options{HTTPClient: w.hc, Header: h})
			if err != nil {
				return
			}
			defer cl.Close()
			if _, err := cl.Auth(dctx, k, time.Now().Unix()); err != nil {
				return
			}
			_, ch, err := cl.Start(ctx, map[string]any{"m": "sub", "kinds": []any{"offer", "accept", "decline", "announce"}, "since": ""})
			if err != nil {
				return
			}
			o.mu.Lock()
			o.ok++
			o.mu.Unlock()
			for {
				select {
				case <-ctx.Done():
					return
				case f, ok := <-ch:
					if !ok {
						return
					}
					items, _ := f.Raw["items"].([]any)
					for _, x := range items {
						it, _ := x.(map[string]any)
						rec, _ := it["rec"].(map[string]any)
						kind, _ := rec["kind"].(string)
						o.mu.Lock()
						o.recvd++
						if kind == "offer" || kind == "accept" || kind == "decline" {
							o.got++
						}
						o.mu.Unlock()
					}
				}
			}
		}()
	}
	return o
}

func (o *observers) wait() { o.wg.Wait() }

// boardCheck is what every server's pops board says after the run.
type boardCheck struct {
	Slot     int64   `json:"slot"`
	Expected int     `json:"expected"` // players with stats acked well before the slot began
	N        []int64 `json:"n"`        // per server: networks on the board
	Agree    bool    `json:"agree"`    // every server gave the same top rows
	Err      string  `json:"err,omitempty"`
}

func checkBoards(ctx context.Context, w *world) *boardCheck {
	out := &boardCheck{Agree: true}
	// Ask early in a slot is not needed: the boards of slot c count records with receipts before c.
	now := time.Now().Unix()
	c := fed.Slot(now)
	if now-c > fed.SlotLen-20 { // too close to the next slot: every server must answer for the same one
		time.Sleep(time.Duration(fed.SlotLen-(now-c)+2) * time.Second)
		c = fed.Slot(time.Now().Unix())
	}
	out.Slot = c
	w.statsAt.Range(func(_, v any) bool {
		if v.(int64) < c-60 {
			out.Expected++
		}
		return true
	})
	var first string
	for i, r := range w.c.relays {
		h := http.Header{}
		h.Set("X-Forwarded-For", fmt.Sprintf("10.253.%d.%d", i/256, i%256))
		dctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		cl, err := client.Dial(dctx, r.url, client.Options{HTTPClient: w.hc, Header: h})
		if err != nil {
			cancel()
			out.Err = r.name + ": " + err.Error()
			out.N = append(out.N, -1)
			continue
		}
		f, err := cl.Request(dctx, map[string]any{"m": "rank", "board": "pops", "measure": "total", "division": "all", "n": int64(100)})
		cl.Close()
		cancel()
		if err != nil || f.M != "ranks" {
			out.Err = fmt.Sprintf("%s: rank: %v", r.name, err)
			out.N = append(out.N, -1)
			continue
		}
		n, _ := wire.Int(f.Raw["n"])
		out.N = append(out.N, n)
		var sb strings.Builder
		fmt.Fprint(&sb, f.Raw["slot"])
		rows, _ := f.Raw["rows"].([]any)
		for _, x := range rows {
			row, _ := x.(map[string]any)
			fmt.Fprint(&sb, "|", row["key"], "=", row["value"])
		}
		if first == "" {
			first = sb.String()
		} else if sb.String() != first {
			out.Agree = false
		}
	}
	return out
}

/* ---------- the report ---------- */

// RelayRow is one relay in the report.
type RelayRow struct {
	Name       string  `json:"name"`
	Players    int     `json:"players"`
	Neighbours int     `json:"neighbours"`
	CPUAvg     float64 `json:"cpuAvgPct"`  // start to end
	CPUPeak    float64 `json:"cpuPeakPct"` // over the periodic samples
	RSSStart   float64 `json:"rssStartMB"`
	RSSMid     float64 `json:"rssMidMB"`
	RSSEnd     float64 `json:"rssEndMB"`
	HeapMid    float64 `json:"heapMidMB"` // Go heap in use (go_memstats_heap_alloc_bytes)
	HeapEnd    float64 `json:"heapEndMB"`
	GorMid     float64 `json:"goroutinesMid"`
	GorEnd     float64 `json:"goroutinesEnd"`
	Clients    float64 `json:"clientsEnd"`
	Sessions   float64 `json:"nodeSessionsEnd"`
	Records    float64 `json:"recordsEnd"`
	RecordsIn  float64 `json:"recordsIn"`  // stored during the run
	RecordsOut float64 `json:"recordsOut"` // sent during the run
	Refused    float64 `json:"refused"`
	RankHits   float64 `json:"rankCacheHitRate"` // -1: not exposed
	LogErrors  int     `json:"logErrors"`
	Crashed    bool    `json:"crashed"`
}

// Report is the whole report.
type Report struct {
	Machine     map[string]any              `json:"machine"`
	Settings    map[string]any              `json:"settings"`
	SyncSeconds float64                     `json:"syncSeconds"`
	PlaySeconds float64                     `json:"playSeconds"`
	Connected   int64                       `json:"connected"`
	AllBy       float64                     `json:"allConnectedSeconds"`
	Latency     map[string]Dist             `json:"latency"`
	Errors      map[string]map[string]int64 `json:"errors"`
	Counts      map[string]int64            `json:"counts"`
	Refusals    map[string]float64          `json:"relayRefusals"`
	Prop        PropReport                  `json:"propagation"`
	StateProp   PropReport                  `json:"statePropagation"`
	Deals       DealReport                  `json:"deals"`
	Observers   map[string]int64            `json:"observers"`
	Relays      []RelayRow                  `json:"relays"`
	Totals      map[string]float64          `json:"totals"`
	Load        map[string][3]float64       `json:"loadAvg"`
	Boards      *boardCheck                 `json:"boards,omitempty"`
	Failures    []string                    `json:"failures"`
}

func mb(b float64) float64 { return math.Round(b/(1<<20)*10) / 10 }

func buildReport(o options, c *cluster, w *world, idle, st, mid, end *sample, ticks []*sample, playStart, playEnd time.Time,
	syncTime time.Duration, allConn bool, allAt time.Duration, obs *observers, boards *boardCheck, crashed string) *Report {
	m := w.m
	rep := &Report{
		Machine: map[string]any{"os": runtime.GOOS, "arch": runtime.GOARCH, "cpus": runtime.NumCPU(), "memoryGB": memGB()},
		Settings: map[string]any{"servers": o.servers, "clients": o.clients, "duration": o.duration.String(), "ramp": o.ramp.String(),
			"mesh": o.mesh, "chord": o.chord, "spread": o.spread, "quick": o.quick,
			"rates": map[string]string{"announce": o.r.announce.String(), "rank": o.r.rank.String(), "nets": o.r.nets.String(),
				"facets": o.r.facets.String(), "deal": o.r.deal.String(), "reconnect": o.r.reconnect.String(),
				"rankwhy": fmt.Sprint(o.r.rankwhy), "filtered": fmt.Sprint(o.r.filtered), "cross": fmt.Sprint(o.r.cross)}},
		SyncSeconds: syncTime.Seconds(), PlaySeconds: playEnd.Sub(playStart).Seconds(), Connected: m.count("connected"),
		Latency: map[string]Dist{}, Errors: m.errs, Counts: m.counts, Refusals: map[string]float64{},
		Prop: w.prop.report(playEnd), StateProp: w.sprop.report(playEnd), Deals: w.deals.report(playEnd),
		Totals: map[string]float64{}, Load: map[string][3]float64{}, Boards: boards}
	if allConn {
		rep.AllBy = allAt.Seconds()
	}
	m.mu.Lock()
	for op, v := range m.lat {
		rep.Latency[op] = dist(v)
	}
	m.mu.Unlock()
	obs.mu.Lock()
	rep.Observers = map[string]int64{"subscribed": int64(obs.ok), "records": obs.recvd, "dealRecords": obs.got}
	obs.mu.Unlock()
	for _, s := range []*sample{idle, st, mid, end} {
		rep.Load[s.label] = s.load
	}
	var maxLoad [3]float64
	for _, s := range ticks {
		for i := range 3 {
			maxLoad[i] = max(maxLoad[i], s.load[i])
		}
	}
	rep.Load["max"] = maxLoad
	el := end.at.Sub(st.at).Seconds()
	players := make([]int, len(c.relays))
	for _, p := range w.players {
		players[p.srv]++
	}
	var inTotal, outTotal float64
	for i, r := range c.relays {
		row := RelayRow{Name: r.name, Players: players[i], Neighbours: len(c.adj[i]), RankHits: -1, Crashed: strings.Contains(crashed, r.name)}
		pid := 0
		if r.cmd != nil && r.cmd.Process != nil {
			pid = r.cmd.Process.Pid
		}
		if a, b := st.ps[pid], end.ps[pid]; el > 0 && b.cpu >= a.cpu {
			row.CPUAvg = math.Round((b.cpu-a.cpu)/el*1000) / 10
		}
		// Peaks over the periodic samples: intervals of 10 s or more (start, mid and end can fall
		// right after one, where a scheduler tick of CPU would read as a burst), one source each.
		var prev *sample
		for _, b := range ticks {
			if b.at.Before(st.at) {
				continue
			}
			if prev == nil {
				prev = b
				continue
			}
			d := b.at.Sub(prev.at).Seconds()
			if d < 10 {
				continue
			}
			x, y := prev.ps[pid], b.ps[pid]
			if x.metrics == y.metrics && y.cpu >= x.cpu {
				row.CPUPeak = max(row.CPUPeak, math.Round((y.cpu-x.cpu)/d*1000)/10)
			}
			prev = b
		}
		row.RSSStart, row.RSSMid, row.RSSEnd = mb(st.ps[pid].rss), mb(mid.ps[pid].rss), mb(end.ps[pid].rss)
		if mm := mid.m[i]; mm != nil {
			row.GorMid = mm["go_goroutines"]
			row.HeapMid = mb(mm["go_memstats_heap_alloc_bytes"])
		}
		if em := end.m[i]; em != nil {
			row.GorEnd = em["go_goroutines"]
			row.HeapEnd = mb(em["go_memstats_heap_alloc_bytes"])
			row.Clients, row.Sessions, row.Records = em["relay_clients"], em["relay_node_sessions"], em["relay_records"]
			row.Refused = em["relay_refused_total"]
			if sm := st.m[i]; sm != nil {
				row.RecordsIn = em["relay_records_in_total"] - sm["relay_records_in_total"]
				row.RecordsOut = em["relay_records_out_total"] - sm["relay_records_out_total"]
			}
			if h, ok := em[`relay_rank_answers_total{cache="hit"}`]; ok {
				if t := em["relay_rank_answers_total"]; t > 0 {
					row.RankHits = math.Round(h/t*1000) / 1000
				}
			}
			for k, v := range em {
				if strings.HasPrefix(k, "relay_refused_total{") {
					rep.Refusals[strings.TrimSuffix(strings.TrimPrefix(k, `relay_refused_total{code="`), `"}`)] += v
				}
			}
		}
		inTotal += row.RecordsIn
		outTotal += row.RecordsOut
		row.LogErrors, _, _ = logLines(r.logPath)
		rep.Relays = append(rep.Relays, row)
	}
	play := playEnd.Sub(playStart).Seconds()
	if el > 0 {
		rep.Totals["relayRecordsStoredPerSec"] = math.Round(inTotal/el*10) / 10
		rep.Totals["relayRecordsSentPerSec"] = math.Round(outTotal/el*10) / 10
		rep.Totals["loadgenCPUPct"] = math.Round((end.self-st.self)/el*1000) / 10
	}
	if play > 0 {
		rep.Totals["recordsPutPerSec"] = math.Round(float64(m.count("acked"))/play*10) / 10
		rep.Totals["clientFramesPerSec"] = math.Round(float64(m.framesIn.Load()+m.framesOut.Load())/play*10) / 10
		rep.Totals["clientBytesPerSec"] = math.Round(float64(m.bytesIn.Load()+m.bytesOut.Load()) / play)
		rep.Totals["clientBytesInPerSec"] = math.Round(float64(m.bytesIn.Load()) / play)
	}

	// Assertions.
	fail := func(f string, a ...any) { rep.Failures = append(rep.Failures, fmt.Sprintf(f, a...)) }
	if crashed != "" {
		fail("relays exited during the run: %s", strings.TrimSpace(crashed))
	}
	if rep.Connected < int64(o.clients) {
		fail("only %d of %d players connected", rep.Connected, o.clients)
	}
	if n := countCode(m.errs, "EMFILE"); n > 0 {
		fail("%d connections failed with EMFILE (too many open files): raise ulimit -n", n)
	}
	puts := m.count("puts") - countOpCode(m.errs, "put:", "canceled")
	if puts > 0 {
		r := float64(m.count("acked")) / float64(puts)
		rep.Totals["ackedFraction"] = math.Round(r*10000) / 10000
		if r < o.minAcked {
			fail("%.2f%% of puts acked (want at least %.2f%%)", 100*r, 100*o.minAcked)
		}
	}
	if p := rep.Prop.All; p.N > 0 && p.P95 > float64(o.propP95/time.Millisecond) {
		fail("announce propagation p95 %.0f ms (want under %s)", p.P95, o.propP95)
	}
	if p := rep.StateProp.All; p.N > 0 && p.P95 > float64(o.stateP95/time.Millisecond) {
		fail("live state propagation p95 %.0f ms (want under %s)", p.P95, o.stateP95)
	}
	if o.r.state > 0 && rep.StateProp.Expected > 0 && rep.StateProp.Within60 < 0.99 {
		fail("only %.2f%% of live states showed on every other server's board of now within 60 s", 100*rep.StateProp.Within60)
	}
	if rep.Prop.Expected > 0 && rep.Prop.Within60 < 0.99 {
		fail("only %.2f%% of announces reached every other server within 60 s", 100*rep.Prop.Within60)
	}
	if rep.Deals.Leaks > 0 || rep.Observers["dealRecords"] > 0 {
		fail("deal records reached third parties: %d at players, %d at observers", rep.Deals.Leaks, rep.Observers["dealRecords"])
	}
	if d := rep.Deals; d.Cross > 0 && d.CrossRate < o.minDeals {
		fail("%.1f%% of cross-server offers answered (want %.0f%%)", 100*d.CrossRate, 100*o.minDeals)
	}
	if n := countOpCode(m.errs, "deal", ""); n > 0 {
		fail("%d sealed deal records failed to open or seal", n)
	}
	if !o.quick {
		if d, ok := rep.Latency["rank_warm"]; !ok || d.N == 0 {
			fail("no warm rank answers")
		} else if d.P95 > float64(o.rankP95/time.Millisecond) {
			fail("warm rank p95 %.0f ms (want under %s)", d.P95, o.rankP95)
		}
		if boards != nil {
			if boards.Err != "" {
				fail("board check: %s", boards.Err)
			}
			for i, n := range boards.N {
				if float64(n) < 0.95*float64(boards.Expected) {
					fail("%s's pops board lists %d networks, %d expected", c.relays[i].name, n, boards.Expected)
				}
			}
			if !boards.Agree {
				fail("the servers' pops boards differ for the same slot")
			}
		}
	}
	for _, r := range rep.Relays {
		if r.RSSMid > 0 && r.RSSEnd > r.RSSMid*o.memGrowth+32 {
			fail("%s grew from %.0f MB mid-run to %.0f MB", r.Name, r.RSSMid, r.RSSEnd)
		}
	}
	return rep
}

// countCode counts errors with a code, over every operation.
func countCode(errs map[string]map[string]int64, code string) int64 {
	var n int64
	for _, m := range errs {
		n += m[code]
	}
	return n
}

// countOpCode counts errors of operations starting with prefix, with code ("": any code).
func countOpCode(errs map[string]map[string]int64, prefix, code string) int64 {
	var n int64
	for op, m := range errs {
		if !strings.HasPrefix(op, prefix) {
			continue
		}
		for c, v := range m {
			if code == "" || c == code {
				n += v
			}
		}
	}
	return n
}

func memGB() float64 {
	if b, err := sysctl("hw.memsize"); err == nil {
		var n float64
		fmt.Sscan(b, &n)
		return math.Round(n / (1 << 30))
	}
	return 0
}

func (r *Report) markdown() string {
	var b strings.Builder
	p := func(f string, a ...any) { fmt.Fprintf(&b, f, a...) }
	p("\n# Relay load test\n\n")
	p("%v servers (%v, chord %v), %v players (%v), played %.0f s (ramp %v); relays synced in %.1f s.  \n",
		r.Settings["servers"], r.Settings["mesh"], r.Settings["chord"], r.Settings["clients"], r.Settings["spread"], r.PlaySeconds, r.Settings["ramp"], r.SyncSeconds)
	p("Machine: %v/%v, %v CPUs, %v GB. Load average (1/5/15 min): idle %s, start %s, mid %s, end %s, max %s.\n\n",
		r.Machine["os"], r.Machine["arch"], r.Machine["cpus"], r.Machine["memoryGB"],
		la(r.Load["idle"]), la(r.Load["start"]), la(r.Load["mid"]), la(r.Load["end"]), la(r.Load["max"]))
	if len(r.Failures) == 0 {
		p("**All assertions passed.**\n\n")
	} else {
		p("**Failed:**\n\n")
		for _, f := range r.Failures {
			p("- %s\n", f)
		}
		p("\n")
	}
	p("## Latency seen by the players (ms)\n\n| Operation | n | p50 | p95 | p99 | max |\n| --- | ---: | ---: | ---: | ---: | ---: |\n")
	ops := make([]string, 0, len(r.Latency))
	for op := range r.Latency {
		ops = append(ops, op)
	}
	sort.Strings(ops)
	for _, op := range ops {
		d := r.Latency[op]
		p("| %s | %d | %s | %s | %s | %s |\n", op, d.N, ms(d.P50), ms(d.P95), ms(d.P99), ms(d.Max))
	}
	p("\nConnected %d players (all by %.0f s). Puts %d, acked %d (%.2f%%). Reconnects %d (cursor resumed), connections lost %d.\n\n",
		r.Connected, r.AllBy, r.Counts["puts"], r.Counts["acked"], 100*r.Totals["ackedFraction"], r.Counts["reconnects"], r.Counts["connections_lost"])
	p("## Errors seen by the players\n\n")
	if len(r.Errors) == 0 {
		p("None.\n\n")
	} else {
		p("| Operation | Code | Count |\n| --- | --- | ---: |\n")
		ops = ops[:0]
		for op := range r.Errors {
			ops = append(ops, op)
		}
		sort.Strings(ops)
		for _, op := range ops {
			codes := make([]string, 0)
			for c := range r.Errors[op] {
				codes = append(codes, c)
			}
			sort.Strings(codes)
			for _, c := range codes {
				p("| %s | %s | %d |\n", op, c, r.Errors[op][c])
			}
		}
		p("\n")
	}
	if len(r.Refusals) > 0 {
		p("Refusals counted by the relays (all servers, `relay_refused_total`): ")
		codes := make([]string, 0, len(r.Refusals))
		for c := range r.Refusals {
			codes = append(codes, c)
		}
		sort.Strings(codes)
		for i, c := range codes {
			if i > 0 {
				p(", ")
			}
			p("%s %.0f", c, r.Refusals[c])
		}
		p(".\n\n")
	}
	p("## Propagation: an announce put on one server, seen by a subscriber on another (ms)\n\n| Hops | n | p50 | p95 | p99 | max |\n| ---: | ---: | ---: | ---: | ---: | ---: |\n")
	hs := make([]int, 0, len(r.Prop.ByHops))
	for h := range r.Prop.ByHops {
		hs = append(hs, h)
	}
	sort.Ints(hs)
	for _, h := range hs {
		d := r.Prop.ByHops[h]
		p("| %d | %d | %s | %s | %s | %s |\n", h, d.N, ms(d.P50), ms(d.P95), ms(d.P99), ms(d.Max))
	}
	d := r.Prop.All
	p("| all | %d | %s | %s | %s | %s |\n\n", d.N, ms(d.P50), ms(d.P95), ms(d.P99), ms(d.Max))
	p("Of %d (announce, other server) pairs put at least 60 s before the end: %.2f%% within 10 s, %.2f%% within 60 s, %d never.\n\n",
		r.Prop.Expected, 100*r.Prop.Within10, 100*r.Prop.Within60, r.Prop.Never)
	p("## Live states: a state sent on one server, shown on another server's board of now (ms)\n\n| Hops | n | p50 | p95 | p99 | max |\n| ---: | ---: | ---: | ---: | ---: | ---: |\n")
	hs = hs[:0]
	for h := range r.StateProp.ByHops {
		hs = append(hs, h)
	}
	sort.Ints(hs)
	for _, h := range hs {
		d := r.StateProp.ByHops[h]
		p("| %d | %d | %s | %s | %s | %s |\n", h, d.N, ms(d.P50), ms(d.P95), ms(d.P99), ms(d.Max))
	}
	d = r.StateProp.All
	p("| all | %d | %s | %s | %s | %s |\n\n", d.N, ms(d.P50), ms(d.P95), ms(d.P99), ms(d.Max))
	p("Of %d (state, other server) pairs sent at least 60 s before the end: %.2f%% within 10 s, %.2f%% within 60 s, %d never. Includes the boards' snapshot age (up to 2 s) and the 500 ms polling.\n\n",
		r.StateProp.Expected, 100*r.StateProp.Within10, 100*r.StateProp.Within60, r.StateProp.Never)
	dl := r.Deals
	p("## Sealed deals\n\n%d offers (put at least 60 s before the end), %d cross-server: answered %.1f%% cross-server, %.1f%% same server; %d accepted, %d declined (sealed), %d never delivered.  \n",
		dl.Offers, dl.Cross, 100*dl.CrossRate, 100*dl.SameRate, dl.Accepted, dl.Declined, dl.Undelivered)
	p("Offer put to answer seen by the requester (ms): cross-server p50 %s, p95 %s, max %s; same server p50 %s, p95 %s, max %s.  \n",
		ms(dl.CrossLat.P50), ms(dl.CrossLat.P95), ms(dl.CrossLat.Max), ms(dl.SameLat.P50), ms(dl.SameLat.P95), ms(dl.SameLat.Max))
	p("Deal records at a session that was neither party: %d at players, %d at %d observers (which received %d records in all).\n\n",
		dl.Leaks, r.Observers["dealRecords"], r.Observers["subscribed"], r.Observers["records"])
	if r.Boards != nil {
		p("## Boards after the run\n\nSlot %d: %d players had stats acked before it; networks on each server's pops board: %v; top rows identical on every server: %v.\n\n",
			r.Boards.Slot, r.Boards.Expected, r.Boards.N, r.Boards.Agree)
	}
	p("## Relays (start = all players connected; CPU %% of one core)\n\n| Relay | Players | Nbrs | CPU avg | CPU peak | RSS start/mid/end MB | Heap mid/end MB | Goroutines mid/end | Clients | Node sessions | Records | Stored | Sent | Refused | Rank cache hits | Log errors |\n| --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n")
	for _, x := range r.Relays {
		hits := "n/a"
		if x.RankHits >= 0 {
			hits = fmt.Sprintf("%.1f%%", 100*x.RankHits)
		}
		name := x.Name
		if x.Crashed {
			name += " (exited)"
		}
		p("| %s | %d | %d | %.1f | %.1f | %.0f / %.0f / %.0f | %.0f / %.0f | %.0f / %.0f | %.0f | %.0f | %.0f | %.0f | %.0f | %.0f | %s | %d |\n",
			name, x.Players, x.Neighbours, x.CPUAvg, x.CPUPeak, x.RSSStart, x.RSSMid, x.RSSEnd, x.HeapMid, x.HeapEnd, x.GorMid, x.GorEnd, x.Clients, x.Sessions, x.Records, x.RecordsIn, x.RecordsOut, x.Refused, hits, x.LogErrors)
	}
	t := r.Totals
	p("\n## Totals\n\nRecords put by players %.1f/s; stored by relays %.1f/s (each record once per server); sent by relays %.1f/s. Player frames %.1f/s, %.0f KB/s on the wire (TLS, both ways). The load generator itself used %.1f%% of one core.\n",
		t["recordsPutPerSec"], t["relayRecordsStoredPerSec"], t["relayRecordsSentPerSec"], t["clientFramesPerSec"], t["clientBytesPerSec"]/1024, t["loadgenCPUPct"])
	return b.String()
}

func ms(v float64) string {
	if v >= 100 {
		return fmt.Sprintf("%.0f", v)
	}
	return fmt.Sprintf("%.1f", v)
}

func la(l [3]float64) string { return fmt.Sprintf("%.2f/%.2f/%.2f", l[0], l[1], l[2]) }

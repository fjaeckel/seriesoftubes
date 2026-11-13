package main

import (
	"bufio"
	"context"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/certs"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

// relayProc is one relay of the run: its data folder, server and process.
type relayProc struct {
	i         int
	name      string // s01
	dir       string
	id        string // server identity
	nodeKey   string
	port      int
	mport     int
	url       string
	logPath   string
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	exited    chan struct{}
	exitErr   error
	exitAt    time.Time
	stopping  bool
	stoppedMu sync.Mutex
}

// cluster is the run's relays and how they are connected.
type cluster struct {
	root   string
	caPath string
	pool   *x509.CertPool
	relays []*relayProc
	adj    [][]int // undirected neighbours
	dist   [][]int // hops between servers
}

// topology gives each server's neighbours: a ring with chords (each server with 3 or 4 others,
// so records cross several hops) or a full mesh. For the registry mesh the servers find each other
// in the registry (10.9): setup works the graph out once their identities are known.
func topology(n int, mesh string, chord int) [][]int {
	if mesh == "registry" {
		return nil
	}
	set := make([]map[int]bool, n)
	for i := range set {
		set[i] = map[int]bool{}
	}
	link := func(a, b int) {
		if a != b {
			set[a][b], set[b][a] = true, true
		}
	}
	if mesh == "full" {
		for a := range n {
			for b := a + 1; b < n; b++ {
				link(a, b)
			}
		}
	} else {
		for a := range n {
			link(a, (a+1)%n)
			if chord > 1 && n > 4 {
				link(a, (a+chord)%n)
			}
		}
	}
	adj := make([][]int, n)
	for a := range n {
		for b := range n {
			if set[a][b] {
				adj[a] = append(adj[a], b)
			}
		}
	}
	return adj
}

// hops is the hop count between every two servers (breadth first; -1 unreachable).
func hops(adj [][]int) [][]int {
	n := len(adj)
	d := make([][]int, n)
	for s := range n {
		d[s] = make([]int, n)
		for i := range d[s] {
			d[s][i] = -1
		}
		d[s][s] = 0
		q := []int{s}
		for len(q) > 0 {
			x := q[0]
			q = q[1:]
			for _, y := range adj[x] {
				if d[s][y] < 0 {
					d[s][y] = d[s][x] + 1
					q = append(q, y)
				}
			}
		}
	}
	return d
}

// freePorts reserves n distinct loopback ports (closed again; the relays bind them right after).
func freePorts(n int) ([]int, error) {
	var ls []net.Listener
	defer func() {
		for _, l := range ls {
			l.Close()
		}
	}()
	var out []int
	for range n {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return nil, err
		}
		ls = append(ls, l)
		out = append(out, l.Addr().(*net.TCPAddr).Port)
	}
	return out, nil
}

// setup founds n servers in folders under root, each with its own operator and node key, makes
// the run's certificate and a registry listing them all as voters, and writes each config. adj nil:
// no neighbours configured, the servers sync automatically through the registry.
func setup(root string, n int, adj [][]int) (*cluster, error) {
	c := &cluster{root: root, adj: adj}
	ports, err := freePorts(2 * n)
	if err != nil {
		return nil, err
	}
	names := certs.Names{DNS: []string{"localhost"}, IPs: []netip.Addr{netip.MustParseAddr("127.0.0.1")}}
	for i := range n {
		r := &relayProc{i: i, name: fmt.Sprintf("s%02d", i+1), port: ports[2*i], mport: ports[2*i+1], exited: make(chan struct{})}
		r.dir = filepath.Join(root, r.name)
		r.url = fmt.Sprintf("wss://%s.localhost:%d/fed", r.name, r.port)
		r.logPath = filepath.Join(root, r.name+".log")
		names.DNS = append(names.DNS, r.name+".localhost")
		c.relays = append(c.relays, r)
	}
	now := time.Now()
	cp, kp, err := certs.SelfSigned(names, now)
	if err != nil {
		return nil, err
	}
	c.caPath = filepath.Join(root, "tls.crt")
	keyPath := filepath.Join(root, "tls.key")
	if err := os.WriteFile(c.caPath, cp, 0o600); err != nil {
		return nil, err
	}
	if err := os.WriteFile(keyPath, kp, 0o600); err != nil {
		return nil, err
	}
	c.pool = x509.NewCertPool()
	c.pool.AppendCertsFromPEM(cp)

	// Founded 40 days ago and listed for 31, answering now: every server is a voter (10.7).
	t := now.Unix() - 40*fed.Day
	// Stamps are whole days (11.1).
	day := now.Unix() - now.Unix()%fed.Day
	listed, answered := day-31*fed.Day, day
	files := map[string][]byte{}
	for _, r := range c.relays {
		if err := os.MkdirAll(r.dir, 0o700); err != nil {
			return nil, err
		}
		nk, err := ops.NewKey(filepath.Join(r.dir, "node.key"))
		if err != nil {
			return nil, err
		}
		op, err := ops.NewKey(filepath.Join(r.dir, "operator.key"))
		if err != nil {
			return nil, err
		}
		r.nodeKey = nk.Key
		name := "Load Tube " + r.name
		g := op.Seal("genesis", t, map[string]any{"name": name, "node": map[string]any{"key": nk.Key, "url": r.url}})
		gr, code := fed.CheckValue(g, now.Unix(), fed.Opts{})
		if code != "" {
			return nil, fmt.Errorf("genesis: %s", code)
		}
		r.id = gr.ID
		st := &ops.State{Server: gr.ID, Head: gr.ID, Operators: []string{op.Key}}
		st.Nodes = append(st.Nodes, struct{ Key, URL string }{nk.Key, r.url})
		srv := ops.ServerRecord(st, op, ops.ServerFields{Name: name, Sync: "open", NoLogs: true, Langs: []string{"en"}}, t)
		cfg := config.Default()
		cfg.Server, cfg.URL, cfg.Listed = gr.ID, r.url, true
		cfg.Listen = fmt.Sprintf("127.0.0.1:%d", r.port)
		cfg.Metrics = fmt.Sprintf("127.0.0.1:%d", r.mport)
		cfg.TLSCert, cfg.TLSKey = c.caPath, keyPath
		cfg.Registry = filepath.Join(root, "servers.json")
		if adj != nil {
			// A topology of its own: neighbours by hand, nothing automatic. Of two neighbours
			// the lower one dials; the other takes the session as it comes.
			off := false
			cfg.AutoSync = &off
			for _, b := range adj[r.i] {
				if b > r.i {
					cfg.Neighbours = append(cfg.Neighbours, config.Neighbour{URL: c.relays[b].url})
				}
			}
		}
		if err := cfg.Save(filepath.Join(r.dir, "config.json")); err != nil {
			return nil, err
		}
		nr, err := node.New(node.Options{Dir: r.dir, Config: cfg, Node: nk})
		if err != nil {
			return nil, err
		}
		for _, rec := range []map[string]any{g, srv} {
			if _, code := nr.ImportOwn(rec); code != "" {
				nr.Close()
				return nil, fmt.Errorf("found %s: %s", r.name, code)
			}
		}
		nr.Close()
		files[gr.ID+".json"] = canon.Encode(map[string]any{"v": int64(1), "genesis": g, "chain": []any{}, "server": srv,
			"listed": listed, "answered": answered})
	}
	b, skipped := registry.Build(files, now.Unix())
	if len(skipped) > 0 {
		for name, f := range skipped {
			return nil, fmt.Errorf("registry left out %s: %v", name, f)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "servers.json"), b, 0o600); err != nil {
		return nil, err
	}
	if c.adj == nil {
		c.adj = registryGraph(c.relays)
	}
	c.dist = hops(c.adj)
	return c, nil
}

// registryGraph is who syncs with whom when every server is open and live in the registry: the
// graph each relay computes for itself (10.9).
func registryGraph(relays []*relayProc) [][]int {
	var ids []string
	at := map[string]int{}
	for _, r := range relays {
		ids = append(ids, r.id)
		at[r.id] = r.i
	}
	slices.Sort(ids)
	adj := make([][]int, len(relays))
	for _, r := range relays {
		for _, p := range registry.AutoPeers(ids, r.id, fed.AutoPeers) {
			adj[r.i] = append(adj[r.i], at[p])
		}
		slices.Sort(adj[r.i])
	}
	return adj
}

// start runs every relay as a child process of this binary.
func (c *cluster) start() error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	for _, r := range c.relays {
		lf, err := os.Create(r.logPath)
		if err != nil {
			return err
		}
		cmd := exec.Command(self, "node", "--data", r.dir, "--ca", c.caPath)
		cmd.Stdout, cmd.Stderr = lf, lf
		cmd.Env = append(os.Environ(), "RELAYLOAD_CHILD=1")
		// Its own process group: a Ctrl-C in the terminal reaches this process, which stops them in order.
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		in, err := cmd.StdinPipe()
		if err != nil {
			lf.Close()
			return err
		}
		if err := cmd.Start(); err != nil {
			lf.Close()
			return err
		}
		r.cmd, r.stdin = cmd, in
		go func() {
			err := cmd.Wait()
			lf.Close()
			r.stoppedMu.Lock()
			r.exitErr, r.exitAt = err, time.Now()
			r.stoppedMu.Unlock()
			close(r.exited)
		}()
	}
	return nil
}

// crashed reports whether a relay ended without being asked to.
func (r *relayProc) crashed() bool {
	select {
	case <-r.exited:
		r.stoppedMu.Lock()
		defer r.stoppedMu.Unlock()
		return !r.stopping
	default:
		return false
	}
}

// stop asks every relay to stop (SIGTERM), then kills what is left after a grace period.
func (c *cluster) stop() {
	for _, r := range c.relays {
		if r.cmd == nil || r.cmd.Process == nil {
			continue
		}
		r.stoppedMu.Lock()
		r.stopping = true
		r.stoppedMu.Unlock()
		_ = r.cmd.Process.Signal(syscall.SIGTERM)
	}
	deadline := time.After(10 * time.Second)
	for _, r := range c.relays {
		if r.cmd == nil || r.cmd.Process == nil {
			continue
		}
		select {
		case <-r.exited:
		case <-deadline:
			_ = r.cmd.Process.Kill()
			<-r.exited
		}
	}
}

// waitReady waits until every relay answers /metrics and holds a session with each neighbour.
func (c *cluster) waitReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		ready := 0
		var last string
		for _, r := range c.relays {
			if r.crashed() {
				return fmt.Errorf("%s exited at start: %s", r.name, tail(r.logPath, 10))
			}
			m, err := scrape(ctx, r.mport)
			if err != nil {
				last = r.name + ": " + err.Error()
				continue
			}
			if int(m["relay_node_sessions"]) >= len(c.adj[r.i]) {
				ready++
			} else {
				last = fmt.Sprintf("%s: %v of %d node sessions", r.name, m["relay_node_sessions"], len(c.adj[r.i]))
			}
		}
		if ready == len(c.relays) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("relays not synced after %s (%d of %d ready; %s)", timeout, ready, len(c.relays), last)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

// scrape reads a relay's /metrics into name{labels} -> value; for each name with labels, the
// plain name holds the sum.
func scrape(ctx context.Context, port int) (map[string]float64, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/metrics", port), nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("metrics: %s", resp.Status)
	}
	out := map[string]float64{}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		line := sc.Text()
		if line == "" || line[0] == '#' {
			continue
		}
		i := strings.LastIndexByte(line, ' ')
		if i < 0 {
			continue
		}
		v, err := strconv.ParseFloat(line[i+1:], 64)
		if err != nil {
			continue
		}
		name := line[:i]
		out[name] = v
		if j := strings.IndexByte(name, '{'); j > 0 {
			out[name[:j]] += v
		}
	}
	return out, sc.Err()
}

// procStat is a process's CPU time and resident memory, from ps (macOS and Linux alike).
type procStat struct {
	cpu float64 // seconds
	rss float64 // bytes
	// metrics: read from the relay's own process metrics rather than ps
	metrics bool
}

func psStats(pids []int) (map[int]procStat, error) {
	if len(pids) == 0 {
		return map[int]procStat{}, nil
	}
	list := make([]string, len(pids))
	for i, p := range pids {
		list[i] = strconv.Itoa(p)
	}
	b, err := exec.Command("ps", "-o", "pid=,time=,rss=", "-p", strings.Join(list, ",")).Output()
	if err != nil && len(b) == 0 {
		return nil, err
	}
	out := map[int]procStat{}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) != 3 {
			continue
		}
		pid, err1 := strconv.Atoi(f[0])
		rss, err2 := strconv.ParseFloat(f[2], 64)
		if err1 != nil || err2 != nil {
			continue
		}
		out[pid] = procStat{cpu: cpuTime(f[1]), rss: rss * 1024}
	}
	return out, nil
}

// cpuTime reads ps's time column: [[dd-]hh:]mm:ss[.hh].
func cpuTime(s string) float64 {
	days := 0.0
	if d, rest, ok := strings.Cut(s, "-"); ok {
		days, _ = strconv.ParseFloat(d, 64)
		s = rest
	}
	parts := strings.Split(s, ":")
	total := 0.0
	for _, p := range parts {
		v, _ := strconv.ParseFloat(p, 64)
		total = total*60 + v
	}
	return days*86400 + total
}

// loadAvg is the 1, 5 and 15 minute load averages, when the system says.
func loadAvg() [3]float64 {
	var out [3]float64
	var s string
	if b, err := os.ReadFile("/proc/loadavg"); err == nil {
		s = string(b)
	} else if b, err := exec.Command("sysctl", "-n", "vm.loadavg").Output(); err == nil {
		s = strings.Trim(strings.TrimSpace(string(b)), "{}")
	}
	f := strings.Fields(s)
	for i := 0; i < 3 && i < len(f); i++ {
		out[i], _ = strconv.ParseFloat(f[i], 64)
	}
	return out
}

// tail is the last n lines of a file.
func tail(path string, n int) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return err.Error()
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

// logLines counts a relay log's lines at level ERROR and WARN.
func logLines(path string) (errs, warns int, err error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		l := sc.Text()
		switch {
		case strings.Contains(l, "level=ERROR"), strings.HasPrefix(l, "panic:"), strings.HasPrefix(l, "fatal error:"):
			errs++
		case strings.Contains(l, "level=WARN"):
			warns++
		}
	}
	return errs, warns, sc.Err()
}

// sysctl reads a value by name (macOS, BSD).
func sysctl(name string) (string, error) {
	b, err := exec.Command("sysctl", "-n", name).Output()
	return strings.TrimSpace(string(b)), err
}

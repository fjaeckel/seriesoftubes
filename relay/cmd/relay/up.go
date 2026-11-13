package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/certs"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/lan"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
)

// upSettings is what relay up is told, by flags or the environment (relay/docker-compose.yml).
type upSettings struct {
	dir                          string
	url, name, sync, langs, desc string
	listen, metrics              string
	metricsPublic                bool
	tlsCert, tlsKey              string
	join, joinFrom, opKey        string
	registry                     string // servers.json: first start, and where a join finds the server's nodes
	// Applied to the config on every start when given (nil: not given): they describe this
	// machine's surroundings, not the server, and are signed nowhere.
	proxies, notifyURL *string
	logJSON            bool
	initCfg            func(*config.Config) // tests: offline settings for a new config
	jn                 joinNet              // tests: the registry and nodes of a relaytest.Net
	nodeOpts           func(*node.Options)  // tests: the same for the node
}

// upOpts: settings plus what tests replace.
type upOpts struct {
	s            upSettings
	out          io.Writer       // the log and the first-start notice
	stop         <-chan struct{} // closed: stop (waiting for the certificate, or serving)
	ready        func(net.Addr)
	wait         [2]time.Duration // the certificate wait: first and longest pause
	joinWait     [2]time.Duration // looking for the server's nodes, waiting for the add-node: the same
	certInterval time.Duration    // how often the reloader looks at the files (default a minute)
}

var errStopped = errors.New("stopped")

// cmdUp: one command for containers. A data folder without a node is set up (init, then genesis
// or join) from the settings; then it serves, waiting first for a TLS certificate that is not
// there yet. Later starts only serve. docs/RELAY.md, "relay up".
func cmdUp(args []string) error {
	fs, dir := flags("up")
	var s upSettings
	fs.StringVar(&s.url, "url", os.Getenv("RELAY_URL"), "this node's public wss:// URL, first start ($RELAY_URL)")
	fs.StringVar(&s.name, "name", os.Getenv("RELAY_NAME"), "the server's name, when founding it ($RELAY_NAME)")
	fs.StringVar(&s.sync, "sync", envOr("RELAY_SYNC", "open"), "sync policy when founding: standalone, selective or open ($RELAY_SYNC)")
	fs.StringVar(&s.langs, "langs", envOr("RELAY_LANGS", "en"), "languages spoken, comma separated ($RELAY_LANGS)")
	fs.StringVar(&s.desc, "desc", os.Getenv("RELAY_DESC"), "a short description, when founding ($RELAY_DESC)")
	fs.StringVar(&s.listen, "listen", envOr("RELAY_LISTEN", "127.0.0.1:8080"), "address to listen on, first start ($RELAY_LISTEN)")
	fs.StringVar(&s.metrics, "metrics", os.Getenv("RELAY_METRICS"), "address for /metrics, first start ($RELAY_METRICS)")
	fs.BoolVar(&s.metricsPublic, "metrics-public", os.Getenv("RELAY_METRICS_PUBLIC") == "true", "allow /metrics beyond localhost ($RELAY_METRICS_PUBLIC)")
	fs.StringVar(&s.tlsCert, "tls-cert", os.Getenv("RELAY_TLS_CERT"), "serve TLS with this certificate chain, first start ($RELAY_TLS_CERT)")
	fs.StringVar(&s.tlsKey, "tls-key", os.Getenv("RELAY_TLS_KEY"), "and this key ($RELAY_TLS_KEY)")
	fs.StringVar(&s.join, "join", os.Getenv("RELAY_JOIN"), "join this existing server instead of founding one ($RELAY_JOIN)")
	fs.StringVar(&s.joinFrom, "join-from", os.Getenv("RELAY_JOIN_FROM"), "wss:// URL of a running node of that server, for servers not in the registry ($RELAY_JOIN_FROM)")
	fs.StringVar(&s.registry, "registry", os.Getenv("RELAY_REGISTRY"), "servers.json, an https:// URL or a file, first start; empty: the game's ($RELAY_REGISTRY)")
	fs.StringVar(&s.opKey, "operator-key", os.Getenv("RELAY_OPERATOR_KEY"), "use this operator key file instead of making one, first start ($RELAY_OPERATOR_KEY)")
	proxies := fs.String("trusted-proxies", os.Getenv("RELAY_TRUSTED_PROXIES"), "networks a proxy connects from, besides loopback; applied on every start ($RELAY_TRUSTED_PROXIES)")
	notify := fs.String("notify-url", os.Getenv("RELAY_NOTIFY_URL"), "https:// URL called once per new release, empty: off; applied on every start ($RELAY_NOTIFY_URL)")
	fs.BoolVar(&s.logJSON, "log-json", os.Getenv("RELAY_LOG_JSON") == "true", "log as JSON lines ($RELAY_LOG_JSON)")
	parse(fs, args)
	s.dir = *dir
	given := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { given[f.Name] = true })
	if _, ok := os.LookupEnv("RELAY_TRUSTED_PROXIES"); ok || given["trusted-proxies"] {
		s.proxies = proxies
	}
	if _, ok := os.LookupEnv("RELAY_NOTIFY_URL"); ok || given["notify-url"] {
		s.notifyURL = notify
	}
	// SIGTERM while waiting for the certificate stops at once; serve handles signals itself.
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	return up(upOpts{s: s, out: os.Stderr, stop: ctx.Done(), wait: [2]time.Duration{2 * time.Second, time.Minute},
		joinWait: [2]time.Duration{5 * time.Second, 5 * time.Minute}, certInterval: time.Minute})
}

func up(o upOpts) error {
	log := newLogger(o.out, o.s.logJSON)
	if err := setUp(o.s, o.out, log, o.stop, o.joinWait); err != nil {
		if errors.Is(err, errStopped) {
			return nil
		}
		return err
	}
	c, err := config.Load(cfgPath(o.s.dir))
	if err != nil {
		return err
	}
	var rl *certs.Reloader
	if c.TLSCert != "" {
		if rl, err = waitCert(c.TLSCert, c.TLSKey, log, o.stop, o.wait); err != nil {
			if errors.Is(err, errStopped) {
				return nil
			}
			return err
		}
		if o.certInterval > 0 {
			rl.Interval = o.certInterval
		}
	}
	quit := make(chan struct{})
	var waiting sync.WaitGroup
	defer waiting.Wait()
	defer close(quit)
	return serve(o.s.dir, serveOpts{log: log, tls: rl, stop: o.stop, node: o.s.nodeOpts, ready: func(a net.Addr) {
		compareServer(o.s, log)
		waiting.Go(func() { awaitAdded(o.s.dir, c.URL, log, quit, o.joinWait) })
		if o.ready != nil {
			o.ready(a)
		}
	}})
}

// awaitAdded, while this node is not on its server's list yet (a join the operators have not signed): logs the
// add-node line for them, with pauses doubling from wait[0] to wait[1], and once more when the node is added. The
// node itself fetches the server's records from its seeds meanwhile and starts syncing on its own.
func awaitAdded(dir, url string, log *slog.Logger, quit <-chan struct{}, wait [2]time.Duration) {
	if wait[0] <= 0 {
		wait = [2]time.Duration{5 * time.Second, 5 * time.Minute}
	}
	d, said := wait[0], false
	for {
		v, err := call(dir, ops.Request{Cmd: "state"})
		if m, ok := v.(map[string]any); err == nil && ok {
			if m["serving"] == true {
				if said {
					log.Info("this node is on the server's list now: syncing")
				}
				return
			}
			if nk, ok := m["node"].(string); ok {
				log.Info("waiting for the server's operators to add this node", "next_check_in", d.String(),
					"how", "relay ops propose add-node "+nk+" --url "+url+", signed by a majority of its operators")
				said = true
			}
		}
		select {
		case <-quit:
			return
		case <-time.After(d):
		}
		if d *= 2; d > wait[1] {
			d = wait[1]
		}
	}
}

// setUp makes what is missing: the data folder (init), then the server (genesis, or join). Each
// step checks what is there, so a start after a crash halfway carries on where it stopped.
func setUp(s upSettings, out io.Writer, log *slog.Logger, stop <-chan struct{}, joinWait [2]time.Duration) error {
	if s.sync != "standalone" && s.sync != "selective" && s.sync != "open" {
		return fmt.Errorf("RELAY_SYNC %q: standalone, selective or open", s.sync)
	}
	if (s.tlsCert == "") != (s.tlsKey == "") {
		return errors.New("set both RELAY_TLS_CERT and RELAY_TLS_KEY, or neither")
	}
	fresh := false
	if _, err := os.Stat(cfgPath(s.dir)); errors.Is(err, os.ErrNotExist) {
		if s.url == "" {
			return errors.New("no relay in " + s.dir + " yet: set RELAY_URL (wss://your.domain/fed) to make one")
		}
		if _, _, _, err := initData(s.dir, s.opKey, func(c *config.Config) {
			c.Listen, c.URL, c.Metrics, c.MetricsPublic = s.listen, s.url, s.metrics, s.metricsPublic
			c.TLSCert, c.TLSKey = s.tlsCert, s.tlsKey
			if s.proxies != nil {
				c.TrustedProxies = append(c.TrustedProxies, splitList(*s.proxies)...)
			}
			if s.notifyURL != nil {
				c.NotifyURL = *s.notifyURL
			}
			if s.registry != "" {
				c.Registry = s.registry
			}
			if s.initCfg != nil {
				s.initCfg(c)
			}
		}); err != nil {
			return err
		}
		log.Info("data folder made", "dir", s.dir)
		fresh = true
	} else if err != nil {
		return err
	}
	c, nk, err := loadAll(s.dir)
	if err != nil {
		return err
	}
	op, err := ops.LoadKey(filepath.Join(s.dir, "operator.key"))
	if err != nil {
		return fmt.Errorf("operator key: %w", err)
	}
	if c.Server != "" {
		if !fresh {
			return applyEnv(s, c, log)
		}
		return nil
	}
	if s.join != "" {
		if !fed.IsID(s.join) {
			return fmt.Errorf("RELAY_JOIN %q is not a server identity", s.join)
		}
		addNode := "relay ops propose add-node " + nk.Key + " --url " + c.URL
		seeds := []string{s.joinFrom}
		if s.joinFrom == "" {
			src := s.registry
			if src == "" {
				src = c.Registry
			}
			if joinWait[0] <= 0 {
				joinWait = [2]time.Duration{5 * time.Second, 5 * time.Minute}
			}
			if seeds, err = waitSeeds(src, s.join, c.URL, s.jn, log, stop, joinWait, addNode); err != nil {
				if errors.Is(err, errStopped) {
					return err
				}
				return fmt.Errorf("RELAY_JOIN: %w", err)
			}
			log.Info("found the server's nodes in the registry", "answered", seeds[0], "nodes", len(seeds))
		} else if !fed.URLOK(s.joinFrom) {
			return errors.New("RELAY_JOIN_FROM must be the wss:// URL of a running node of that server")
		}
		c.Server, c.Seeds = s.join, seeds
		if err := c.Save(cfgPath(s.dir)); err != nil {
			return err
		}
		notice(out, s.dir, fmt.Sprintf("This node joins the server %s.", s.join), nk, op, c.URL, []string{
			"Ask an operator of that server to run",
			"  " + addNode,
			"and a majority of its operators to sign it (relay ops sign ID).",
		})
		return nil
	}
	if s.name == "" {
		return errors.New("set RELAY_NAME to found the server (or RELAY_JOIN to join one)")
	}
	id, err := found(s.dir, "", ops.ServerFields{Name: s.name, Sync: s.sync, NoLogs: true, Langs: splitList(s.langs), Desc: s.desc})
	if err != nil {
		return err
	}
	notice(out, s.dir, fmt.Sprintf("Server %q founded. Its identity: %s", s.name, id), nk, op, c.URL, []string{
		"To be listed in the game's server list: relay registry-file, then a pull request (docs/HOSTING.md).",
	})
	return nil
}

// notice is printed once, when a node is set up: who it is and the operator key to back up.
// Public keys only: the private key never leaves its file.
func notice(out io.Writer, dir, what string, nk, op *fed.Signer, url string, more []string) {
	opPath := filepath.Join(dir, "operator.key")
	bar := strings.Repeat("=", 78)
	fmt.Fprintf(out, "\n%s\n%s\nNode key:              %s\nOperator key (public): %s\nInvite link:           %s\n", bar, what, nk.Key, op.Key, lan.Invite(url))
	for _, l := range more {
		fmt.Fprintln(out, l)
	}
	fmt.Fprintf(out, "\nBACK UP THE OPERATOR KEY NOW. %s is your control of this server: there is\n"+
		"no password reset and no one to ask, and backups leave it out on purpose. Copy it off this machine\n"+
		"and keep it somewhere safe and offline. With Docker Compose, from the folder of docker-compose.yml\n"+
		"(on your own computer with --context, it lands there straight away):\n\n"+
		"  docker compose cp relay:%s ./operator.key\n%s\n\n", opPath, opPath, bar)
}

// applyEnv, on a start after the first: the settings that describe this machine (trusted proxies,
// the release webhook) follow the environment; the others are only compared, as changing them
// is a decision the config file records (or the operators sign).
func applyEnv(s upSettings, c *config.Config, log *slog.Logger) error {
	changed := false
	if s.proxies != nil {
		want := append([]string{"127.0.0.0/8", "::1/128"}, splitList(*s.proxies)...)
		slices.Sort(want)
		want = slices.Compact(want)
		have := slices.Sorted(slices.Values(c.TrustedProxies))
		if !slices.Equal(want, have) {
			log.Info("trustedProxies updated from RELAY_TRUSTED_PROXIES", "was", strings.Join(have, ","), "now", strings.Join(want, ","))
			c.TrustedProxies, changed = want, true
		}
	}
	if s.notifyURL != nil && *s.notifyURL != c.NotifyURL {
		log.Info("notifyURL updated from RELAY_NOTIFY_URL", "on", *s.notifyURL != "")
		c.NotifyURL, changed = *s.notifyURL, true
	}
	if changed {
		if err := c.Check(); err != nil {
			return err
		}
		if err := c.Save(cfgPath(s.dir)); err != nil {
			return err
		}
	}
	differ := func(what, env, have, how string) {
		log.Warn(what+" in the environment differs from config.json; config.json wins", "env", env, "config", have, "how", how)
	}
	const edit = "edit config.json in the data folder (docs/HOSTING.md, changing settings), then restart"
	if s.url != "" && s.url != c.URL {
		differ("RELAY_URL", s.url, c.URL, "a node's URL is in the server's signed records: add the node again with the new URL (relay ops propose add-node), then edit config.json")
	}
	if s.listen != c.Listen {
		differ("RELAY_LISTEN", s.listen, c.Listen, edit)
	}
	if s.metrics != c.Metrics || s.metricsPublic != c.MetricsPublic {
		differ("RELAY_METRICS", fmt.Sprintf("%s public=%v", s.metrics, s.metricsPublic), fmt.Sprintf("%s public=%v", c.Metrics, c.MetricsPublic), edit)
	}
	if s.tlsCert != c.TLSCert || s.tlsKey != c.TLSKey {
		differ("RELAY_TLS_CERT/RELAY_TLS_KEY", s.tlsCert+" "+s.tlsKey, c.TLSCert+" "+c.TLSKey, edit)
	}
	if s.join != "" && s.join != c.Server {
		differ("RELAY_JOIN", s.join, c.Server, "a node belongs to one server: use a new data folder (volume) to join another")
	}
	return nil
}

// compareServer reads the running server's record and says which of the name, sync policy,
// languages and description differ from the environment. Operators change those by signing a new
// server record, which the relay does not do on its own. A node that joined another's server was
// never told them (RELAY_JOIN): nothing to compare.
func compareServer(s upSettings, log *slog.Logger) {
	if s.join != "" {
		return
	}
	v, err := call(s.dir, ops.Request{Cmd: "state"})
	if err != nil {
		return
	}
	st, err := ops.ReadState(v)
	if err != nil {
		return
	}
	f := ops.CurrentFields(st)
	var diff []string
	var fl []string
	if s.name != "" && s.name != f.Name {
		diff = append(diff, fmt.Sprintf("name %q (server: %q)", s.name, f.Name))
		fl = append(fl, fmt.Sprintf("--name %q", s.name))
	}
	if s.sync != f.Sync {
		diff = append(diff, fmt.Sprintf("sync %s (server: %s)", s.sync, f.Sync))
		fl = append(fl, "--sync "+s.sync)
	}
	if l := splitList(s.langs); !slices.Equal(l, slices.Sorted(slices.Values(f.Langs))) {
		diff = append(diff, fmt.Sprintf("langs %s (server: %s)", strings.Join(l, ","), strings.Join(f.Langs, ",")))
		fl = append(fl, "--langs "+strings.Join(l, ","))
	}
	if s.desc != "" && s.desc != f.Desc {
		diff = append(diff, "desc")
		fl = append(fl, fmt.Sprintf("--desc %q", s.desc))
	}
	if len(diff) > 0 {
		log.Warn("the environment differs from the server's signed record, which stays as it is: "+strings.Join(diff, "; "),
			"how", "docker compose exec relay /relay ops server "+strings.Join(fl, " ")+" (or set the environment back)")
	}
}

// waitCert loads the certificate pair, waiting while it is missing or does not load (certbot has
// not issued it yet), with pauses that double from wait[0] up to wait[1].
func waitCert(cert, key string, log *slog.Logger, stop <-chan struct{}, wait [2]time.Duration) (*certs.Reloader, error) {
	d := wait[0]
	for {
		rl, err := certs.NewReloader(cert, key, log)
		if err == nil {
			return rl, nil
		}
		why := err.Error()
		if errors.Is(err, os.ErrNotExist) {
			why = "not there yet (certbot issues it on its first start)"
		}
		log.Info("waiting for the TLS certificate", "cert", cert, "why", why, "next_try_in", d.String())
		select {
		case <-stop:
			return nil, errStopped
		case <-time.After(d):
		}
		if d *= 2; d > wait[1] {
			d = wait[1]
		}
	}
}

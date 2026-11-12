// Command relay is the Series of Tubes federation relay: a server players run so their
// games can find each other. See docs/RELAY.md.
package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/metrics"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
	"github.com/fjaeckel/seriesoftubes/relay/internal/privacy"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

// version is set at build time (-X main.version=x.y.z).
var version = "dev"

const usage = `relay: the Series of Tubes federation relay (docs/RELAY.md)

Setting up:
  relay init [--operator-key FILE] [--url wss://host/path]   make the data folder, node key, operator key, config
  relay genesis --name NAME [--sync open] [--langs en,de] [--desc TEXT]   found a new server
  relay join SERVER --from wss://existing-node/path          prepare this node for an existing server
  relay registry-file [--from FILE]                          print the file for the registry pull request, keeping
                                                             listed/answered from FILE (default: federation/servers/<id>.json)
  relay serve                                                run the relay

Day to day (talks to the running relay over its local socket):
  relay status | servers | players | nodes
  relay board [--board pops|pies|traffic|total] [--measure total|growth] [--division all|human|ai]
  relay hide KEY [--names | --refuse]      relay unhide KEY
  relay shun KEY --reason cheating|offensive_name|spam|abuse      relay unshun KEY
  relay ops propose add-operator|remove-operator|add-node|remove-node KEY [--url wss://...]
  relay ops pending      relay ops sign ID [--via wss://a-running-node/path]
  relay ops server [--name N] [--sync standalone|selective|open] [--langs en,de] [--desc T] [--no-logs=true]
  relay backup FILE.tar.gz

Registry (CI and the site build):
  relay check-registry [--offline] [--base GITREF] FILE...
  relay build-servers-json DIR OUT

Every command takes --data DIR (default $RELAY_DATA, else ./relay-data).
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	cmd, args := os.Args[1], os.Args[2:]
	var err error
	switch cmd {
	case "init":
		err = cmdInit(args)
	case "genesis":
		err = cmdGenesis(args)
	case "join":
		err = cmdJoin(args)
	case "registry-file":
		err = cmdRegistryFile(args)
	case "serve":
		err = cmdServe(args)
	case "status", "servers", "players", "nodes":
		err = cmdShow(cmd, args)
	case "board":
		err = cmdBoard(args)
	case "hide", "unhide":
		err = cmdHide(cmd, args)
	case "shun", "unshun":
		err = cmdShun(cmd, args)
	case "ops":
		err = cmdOps(args)
	case "backup":
		err = cmdBackup(args)
	case "check-registry":
		os.Exit(cmdCheckRegistry(args, os.Stdout))
	case "build-servers-json":
		err = cmdBuild(args)
	case "version", "--version":
		fmt.Println("relay", version)
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "relay: unknown command %q\n\n%s", cmd, usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "relay:", err)
		os.Exit(1)
	}
}

func flags(name string) (*flag.FlagSet, *string) {
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	def := os.Getenv("RELAY_DATA")
	if def == "" {
		def = "relay-data"
	}
	return fs, fs.String("data", def, "data folder")
}

// parse lets flags come before or after positional arguments.
func parse(fs *flag.FlagSet, args []string) []string {
	var pos []string
	for {
		_ = fs.Parse(args)
		args = fs.Args()
		if len(args) == 0 {
			return pos
		}
		pos = append(pos, args[0])
		args = args[1:]
	}
}

func cfgPath(dir string) string { return filepath.Join(dir, "config.json") }

func cmdInit(args []string) error {
	fs, dir := flags("init")
	opKey := fs.String("operator-key", "", "use this operator key file instead of making one")
	url := fs.String("url", "", "this node's public wss:// URL")
	listen := fs.String("listen", "127.0.0.1:8080", "address to listen on (behind your TLS proxy)")
	parse(fs, args)
	if err := os.MkdirAll(*dir, 0o700); err != nil {
		return err
	}
	if _, err := os.Stat(cfgPath(*dir)); err == nil {
		return fmt.Errorf("%s already holds a relay", *dir)
	}
	nk, err := ops.NewKey(filepath.Join(*dir, "node.key"))
	if err != nil {
		return err
	}
	opPath := filepath.Join(*dir, "operator.key")
	var op *fed.Signer
	if *opKey != "" {
		if op, err = ops.LoadKey(*opKey); err != nil {
			return err
		}
		b, _ := os.ReadFile(*opKey)
		if err := os.WriteFile(opPath, b, 0o600); err != nil {
			return err
		}
	} else if op, err = ops.NewKey(opPath); err != nil {
		return err
	}
	c := config.Default()
	c.Listen, c.URL = *listen, *url
	if err := c.Check(); err != nil {
		return err
	}
	if err := c.Save(cfgPath(*dir)); err != nil {
		return err
	}
	fmt.Printf("Data folder:  %s\nNode key:     %s\nOperator key: %s\n\nNext: relay genesis --name \"…\" (new server) or relay join SERVER --from wss://… (existing one).\nBack up %s: it is your control of the server.\n",
		*dir, nk.Key, op.Key, opPath)
	return nil
}

func loadAll(dir string) (*config.Config, *fed.Signer, error) {
	c, err := config.Load(cfgPath(dir))
	if err != nil {
		return nil, nil, err
	}
	nk, err := ops.LoadKey(filepath.Join(dir, "node.key"))
	if err != nil {
		return nil, nil, err
	}
	return c, nk, nil
}

func splitList(s string) []string {
	var out []string
	for _, x := range strings.Split(s, ",") {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	sort.Strings(out)
	return out
}

func cmdGenesis(args []string) error {
	fs, dir := flags("genesis")
	name := fs.String("name", "", "the server's name")
	url := fs.String("url", "", "this node's public wss:// URL (default: from config)")
	sync := fs.String("sync", "open", "sync policy: standalone, selective or open")
	langs := fs.String("langs", "en", "languages spoken, comma separated")
	desc := fs.String("desc", "", "a short description (280 characters)")
	noLogs := fs.Bool("no-logs", true, "declare that nothing in front of the relay logs addresses")
	parse(fs, args)
	if ops.Running(*dir) {
		return errors.New("stop the relay first")
	}
	c, nk, err := loadAll(*dir)
	if err != nil {
		return err
	}
	if c.Server != "" {
		return fmt.Errorf("this node already belongs to server %s", c.Server)
	}
	if *url == "" {
		*url = c.URL
	}
	if !fed.URLOK(*url) {
		return errors.New("give --url wss://your.host/path (a host name, not an IP address)")
	}
	op, err := ops.LoadKey(filepath.Join(*dir, "operator.key"))
	if err != nil {
		return err
	}
	now := time.Now().Unix()
	g := op.Seal("genesis", now, map[string]any{"name": *name, "node": map[string]any{"key": nk.Key, "url": *url}})
	gr, code := fed.CheckValue(g, now, fed.Opts{})
	if code != "" {
		return fmt.Errorf("genesis refused: %s", code)
	}
	st := &ops.State{Server: gr.ID, Head: gr.ID, Operators: []string{op.Key}}
	st.Nodes = append(st.Nodes, struct{ Key, URL string }{nk.Key, *url})
	srv := ops.ServerRecord(st, op, ops.ServerFields{Name: *name, Sync: *sync, NoLogs: *noLogs, Langs: splitList(*langs), Desc: *desc}, now)
	c.Server, c.URL = gr.ID, *url
	r, err := node.New(node.Options{Dir: *dir, Config: c, Node: nk})
	if err != nil {
		return err
	}
	defer r.Close()
	for _, rec := range []map[string]any{g, srv} {
		if _, code := r.ImportOwn(rec); code != "" {
			return fmt.Errorf("record refused: %s", code)
		}
	}
	if err := c.Save(cfgPath(*dir)); err != nil {
		return err
	}
	fmt.Printf("Server founded. Its identity: %s\nStart it with: relay serve\nTo be listed: relay registry-file > federation/servers/%s.json, then open a pull request.\n", gr.ID, gr.ID)
	return nil
}

func cmdJoin(args []string) error {
	fs, dir := flags("join")
	from := fs.String("from", "", "wss:// URL of a running node of that server")
	url := fs.String("url", "", "this node's public wss:// URL (default: from config)")
	pos := parse(fs, args)
	if len(pos) != 1 || !fed.IsID(pos[0]) {
		return errors.New("usage: relay join SERVER-IDENTITY --from wss://existing-node/path")
	}
	c, nk, err := loadAll(*dir)
	if err != nil {
		return err
	}
	if c.Server != "" {
		return fmt.Errorf("this node already belongs to server %s", c.Server)
	}
	if !fed.URLOK(*from) {
		return errors.New("give --from wss://… of a node of that server")
	}
	if *url != "" {
		c.URL = *url
	}
	if !fed.URLOK(c.URL) {
		return errors.New("set this node's public URL with --url wss://your.host/path")
	}
	c.Server, c.Seeds = pos[0], []string{*from}
	if err := c.Save(cfgPath(*dir)); err != nil {
		return err
	}
	fmt.Printf("This node will join %s.\nAsk an operator of that server to run:\n\n  relay ops propose add-node %s --url %s\n\nand a majority of its operators to sign it (relay ops sign ID). Then run: relay serve\n", pos[0], nk.Key, c.URL)
	return nil
}

func call(dir string, q ops.Request) (any, error) {
	resp, err := ops.Call(dir, q)
	if err != nil {
		return nil, err
	}
	if !resp.OK {
		return nil, errors.New(resp.Error)
	}
	return resp.Result, nil
}

func printJSON(v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(b))
}

func cmdShow(cmd string, args []string) error {
	fs, dir := flags(cmd)
	parse(fs, args)
	v, err := call(*dir, ops.Request{Cmd: cmd})
	if err != nil {
		return err
	}
	printJSON(v)
	return nil
}

func cmdBoard(args []string) error {
	fs, dir := flags("board")
	b := fs.String("board", "pops", "pops, pies, traffic or total")
	m := fs.String("measure", "total", "total or growth")
	d := fs.String("division", "all", "all, human or ai")
	parse(fs, args)
	v, err := call(*dir, ops.Request{Cmd: "board", Board: *b, Measure: *m, Div: *d})
	if err != nil {
		return err
	}
	printJSON(v)
	return nil
}

func state(dir string) (*ops.State, *fed.Signer, error) {
	v, err := call(dir, ops.Request{Cmd: "state"})
	if err != nil {
		return nil, nil, err
	}
	st, err := ops.ReadState(v)
	if err != nil {
		return nil, nil, err
	}
	op, err := ops.LoadKey(filepath.Join(dir, "operator.key"))
	if err != nil {
		return nil, nil, fmt.Errorf("operator key: %w", err)
	}
	return st, op, nil
}

func put(dir string, rec map[string]any) error {
	v, err := call(dir, ops.Request{Cmd: "put", Rec: canon.Encode(rec)})
	if err != nil {
		return err
	}
	printJSON(v)
	return nil
}

func cmdHide(cmd string, args []string) error {
	fs, dir := flags(cmd)
	names := fs.Bool("names", false, "show by ASN only, name hidden")
	refuse := fs.Bool("refuse", false, "refuse its new records")
	pos := parse(fs, args)
	if len(pos) != 1 {
		return fmt.Errorf("usage: relay %s KEY", cmd)
	}
	st, op, err := state(*dir)
	if err != nil {
		return err
	}
	list := "hide"
	if *names {
		list = "names"
	}
	if *refuse {
		list = "refuse"
	}
	rec, err := ops.Hide(st, op, list, pos[0], cmd == "hide", time.Now().Unix())
	if err != nil {
		return err
	}
	return put(*dir, rec)
}

func cmdShun(cmd string, args []string) error {
	fs, dir := flags(cmd)
	reason := fs.String("reason", "", "cheating, offensive_name, spam or abuse")
	pos := parse(fs, args)
	if len(pos) != 1 {
		return fmt.Errorf("usage: relay %s KEY", cmd)
	}
	if cmd == "shun" && *reason == "" {
		return errors.New("give --reason cheating|offensive_name|spam|abuse")
	}
	if cmd == "unshun" {
		*reason = ""
	}
	st, op, err := state(*dir)
	if err != nil {
		return err
	}
	rec, err := ops.Shun(st, op, pos[0], *reason, time.Now().Unix())
	if err != nil {
		return err
	}
	return put(*dir, rec)
}

func cmdOps(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: relay ops propose|pending|sign|server")
	}
	sub, args := args[0], args[1:]
	fs, dir := flags("ops " + sub)
	url := fs.String("url", "", "node URL (add-node)")
	name := fs.String("name", "", "server name")
	sync := fs.String("sync", "", "standalone, selective or open")
	langs := fs.String("langs", "", "languages, comma separated")
	desc := fs.String("desc", "\x00", "description")
	noLogs := fs.String("no-logs", "", "true or false")
	via := fs.String("via", "", "sign: send the signature to this node over wss:// instead of the local relay")
	pos := parse(fs, args)
	switch sub {
	case "pending":
		v, err := call(*dir, ops.Request{Cmd: "pending"})
		if err != nil {
			return err
		}
		printJSON(v)
		return nil
	case "propose":
		if len(pos) != 2 {
			return errors.New("usage: relay ops propose ACTION KEY [--url wss://...]")
		}
		st, op, err := state(*dir)
		if err != nil {
			return err
		}
		rec, err := ops.Propose(st, op, pos[0], pos[1], *url, time.Now().Unix())
		if err != nil {
			return err
		}
		return put(*dir, rec)
	case "sign":
		if len(pos) != 1 {
			return errors.New("usage: relay ops sign ID [--via wss://node]")
		}
		if *via != "" {
			return signVia(*dir, *via, pos[0])
		}
		_, op, err := state(*dir)
		if err != nil {
			return err
		}
		v, err := call(*dir, ops.Request{Cmd: "get", ID: pos[0]})
		if err != nil {
			return err
		}
		b, _ := json.Marshal(v)
		rec, code := canon.ParseStrict(b)
		if code != "" {
			return errors.New(code)
		}
		sig, err := ops.Cosign(rec, op)
		if err != nil {
			return err
		}
		res, err := call(*dir, ops.Request{Cmd: "cosign", ID: pos[0], Key: op.Key, Sig: sig})
		if err != nil {
			return err
		}
		printJSON(res)
		return nil
	case "server":
		st, op, err := state(*dir)
		if err != nil {
			return err
		}
		f := ops.CurrentFields(st)
		if *name != "" {
			f.Name = *name
		}
		if *sync != "" {
			f.Sync = *sync
		}
		if *langs != "" {
			f.Langs = splitList(*langs)
		}
		if *desc != "\x00" {
			f.Desc = *desc
		}
		if *noLogs != "" {
			f.NoLogs = *noLogs == "true"
		}
		return put(*dir, ops.ServerRecord(st, op, f, time.Now().Unix()))
	}
	return fmt.Errorf("unknown ops command %q", sub)
}

// signVia fetches a pending record from a running node, signs it with the local operator key
// and sends the signature back over wss://, as the game's operator panel does.
func signVia(dir, url, id string) error {
	op, err := ops.LoadKey(filepath.Join(dir, "operator.key"))
	if err != nil {
		return fmt.Errorf("operator key: %w", err)
	}
	return cosignOver(url, id, op, nil)
}

func cosignOver(url, id string, op *fed.Signer, hc *http.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cl, err := client.Dial(ctx, url, client.Options{HTTPClient: hc})
	if err != nil {
		return err
	}
	defer cl.Close()
	items, err := cl.Collect(ctx, map[string]any{"m": "fetch", "ids": []any{id}})
	if err != nil {
		return err
	}
	if len(items) != 1 {
		return fmt.Errorf("%s does not hold %s", url, id)
	}
	rec, code := canon.Check(items[0]["rec"])
	if code != "" {
		return errors.New(code)
	}
	sig, err := ops.Cosign(rec, op)
	if err != nil {
		return err
	}
	if _, err := cl.Request(ctx, map[string]any{"m": "cosign", "rid": id, "key": op.Key, "sig": sig}); err != nil {
		return err
	}
	fmt.Printf("Signed %s on %s.\n", id, url)
	return nil
}

func cmdBackup(args []string) error {
	fs, dir := flags("backup")
	pos := parse(fs, args)
	if len(pos) != 1 {
		return errors.New("usage: relay backup FILE.tar.gz")
	}
	out, err := filepath.Abs(pos[0])
	if err != nil {
		return err
	}
	v, err := call(*dir, ops.Request{Cmd: "backup", Path: out})
	if err != nil {
		return err
	}
	printJSON(v)
	return nil
}

func cmdRegistryFile(args []string) error {
	fs, dir := flags("registry-file")
	from := fs.String("from", "", "existing registry file whose listed/answered to keep (default federation/servers/<id>.json if present)")
	parse(fs, args)
	b, err := registryFile(*dir)
	if err != nil {
		return err
	}
	// Keep the weekly job's stamps, or CI refuses the replacement (11.2 step 8).
	path := *from
	if path == "" {
		if c, err := config.Load(cfgPath(*dir)); err == nil && c.Server != "" {
			p := filepath.Join("federation", "servers", c.Server+".json")
			// Empty: the shell just made it for `> federation/servers/<id>.json`, a first listing.
			if fi, err := os.Stat(p); err == nil && fi.Size() > 0 {
				path = p
			}
		}
	}
	if path != "" {
		old, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if b, err = registry.KeepStamps(b, old); err != nil {
			return err
		}
		fmt.Fprintln(os.Stderr, "relay: kept listed/answered from", path)
	}
	_, err = os.Stdout.Write(b)
	return err
}

func registryFile(dir string) ([]byte, error) {
	if ops.Running(dir) {
		v, err := call(dir, ops.Request{Cmd: "registry-file"})
		if err != nil {
			return nil, err
		}
		s, _ := v.(string)
		return []byte(s), nil
	}
	c, nk, err := loadAll(dir)
	if err != nil {
		return nil, err
	}
	r, err := node.New(node.Options{Dir: dir, Config: c, Node: nk})
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return r.RegistryFile()
}

func cmdServe(args []string) error {
	fs, dir := flags("serve")
	logJSON := fs.Bool("log-json", false, "log as JSON lines")
	parse(fs, args)
	c, nk, err := loadAll(*dir)
	if err != nil {
		return err
	}
	if c.Server == "" {
		return errors.New("this node has no server yet: run relay genesis or relay join first")
	}
	var h slog.Handler = slog.NewTextHandler(os.Stderr, nil)
	if *logJSON {
		h = slog.NewJSONHandler(os.Stderr, nil)
	}
	logger := slog.New(h)
	var countries *privacy.MMDB
	if c.CountryDB != "" {
		if countries, err = privacy.OpenMMDB(c.CountryDB); err != nil {
			return fmt.Errorf("country database: %w", err)
		}
	}
	m := metrics.New()
	o := node.Options{Dir: *dir, Config: c, Node: nk, Log: logger, Metrics: m}
	if countries != nil {
		o.Countries = countries
	}
	r, err := node.New(o)
	if err != nil {
		return err
	}
	defer r.Close()
	sock, err := ops.Serve(*dir, r)
	if err != nil {
		return fmt.Errorf("local socket: %w", err)
	}
	defer sock.Close()
	r.Run()
	srv := &http.Server{Addr: c.Listen, Handler: r.Handler(), ReadHeaderTimeout: 10 * time.Second,
		// net/http logs failed handshakes with the peer's address: never let that out.
		ErrorLog: log.New(io.Discard, "", 0)}
	if c.TLSCert != "" {
		srv.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	errc := make(chan error, 2)
	go func() {
		var err error
		if c.TLSCert != "" {
			err = srv.ListenAndServeTLS(c.TLSCert, c.TLSKey)
		} else {
			err = srv.ListenAndServe()
		}
		errc <- err
	}()
	var msrv *http.Server
	if c.Metrics != "" {
		mux := http.NewServeMux()
		mux.Handle("/metrics", m.Handler())
		msrv = &http.Server{Addr: c.Metrics, Handler: mux, ReadHeaderTimeout: 10 * time.Second, ErrorLog: log.New(io.Discard, "", 0)}
		go func() { errc <- msrv.ListenAndServe() }()
	}
	logger.Info("relay serving", "version", version, "server", c.Server, "node", nk.Key, "listen", c.Listen)
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM)
	for {
		select {
		case err := <-errc:
			if !errors.Is(err, http.ErrServerClosed) {
				return err
			}
		case s := <-sig:
			if s == syscall.SIGHUP {
				nc, err := config.Load(cfgPath(*dir))
				if err != nil {
					logger.Error("config not reloaded", "err", err)
					continue
				}
				if nc.Listen != c.Listen || nc.Metrics != c.Metrics || nc.TLSCert != c.TLSCert {
					logger.Warn("listen, metrics and TLS settings change on restart only")
				}
				r.Reload(nc)
				continue
			}
			logger.Info("relay stopping")
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			_ = srv.Shutdown(ctx)
			if msrv != nil {
				_ = msrv.Shutdown(ctx)
			}
			cancel()
			return nil
		}
	}
}

// cmdCheckRegistry runs 11.2 for each file; it prints "<file>: step N: <code>[: detail]" for
// each failure and returns the exit code.
func cmdCheckRegistry(args []string, out io.Writer) int {
	fs := flag.NewFlagSet("check-registry", flag.ExitOnError)
	offline := fs.Bool("offline", false, "skip step 9 (a node answering the challenge)")
	base := fs.String("base", "", "git ref of the base branch, for step 8")
	paths := parse(fs, args)
	if len(paths) == 0 {
		fmt.Fprintln(out, "usage: relay check-registry [--offline] [--base GITREF] FILE...")
		return 2
	}
	var challenge registry.Challenger
	if !*offline {
		challenge = liveChallenge(nil, func() int64 { return time.Now().Unix() })
	}
	return checkFiles(paths, *base, challenge, out)
}

func checkFiles(paths []string, base string, challenge registry.Challenger, out io.Writer) int {
	code := 0
	now := time.Now().Unix()
	for _, p := range paths {
		files, err := registry.ReadFolder(filepath.Dir(p))
		if err != nil {
			fmt.Fprintf(out, "%s: step 1: bad_json: %v\n", p, err)
			code = 1
			continue
		}
		name := filepath.Base(p)
		if _, ok := files[name]; !ok {
			b, err := os.ReadFile(p)
			if err != nil {
				fmt.Fprintf(out, "%s: step 1: missing_field: %v\n", p, err)
				code = 1
				continue
			}
			files[name] = b
		}
		var baseFile []byte
		if base != "" {
			if b, err := exec.Command("git", "show", base+":"+filepath.ToSlash(p)).Output(); err == nil {
				baseFile = b
			}
		}
		if f := registry.Check(name, files, baseFile, now, challenge); f != nil {
			fmt.Fprintf(out, "%s: %s\n", p, f.Error())
			code = 1
			continue
		}
		fmt.Fprintf(out, "%s: ok\n", p)
	}
	return code
}

// liveChallenge connects to a node and checks its proof (11.2 step 9).
func liveChallenge(hc *http.Client, now func() int64) registry.Challenger {
	return func(ctx context.Context, url, server, nodeKey string) error {
		cl, err := client.Dial(ctx, url, client.Options{HTTPClient: hc})
		if err != nil {
			return err
		}
		defer cl.Close()
		return cl.Challenge(ctx, server, nodeKey, now())
	}
}

func cmdBuild(args []string) error {
	fs := flag.NewFlagSet("build-servers-json", flag.ExitOnError)
	pos := parse(fs, args)
	if len(pos) != 2 {
		return errors.New("usage: relay build-servers-json DIR OUT")
	}
	files, err := registry.ReadFolder(pos[0])
	if err != nil {
		return err
	}
	b, skipped := registry.Build(files, time.Now().Unix())
	names := make([]string, 0, len(skipped))
	for n := range skipped {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		fmt.Fprintf(os.Stderr, "%s: left out: %s\n", filepath.Join(pos[0], n), skipped[n].Error())
	}
	if err := os.MkdirAll(filepath.Dir(pos[1]), 0o755); err != nil {
		return err
	}
	return os.WriteFile(pos[1], b, 0o644)
}

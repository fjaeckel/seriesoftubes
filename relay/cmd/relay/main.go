// Command relay is the Series of Tubes federation relay: a server players run so their
// games can find each other. See docs/RELAY.md.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/certs"
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
             [--listen ADDR] [--trusted-proxies CIDR,…] [--tls-cert F --tls-key F]
             [--metrics ADDR [--metrics-public]]
  relay genesis --name NAME [--sync open] [--langs en,de] [--desc TEXT]   found a new server
  relay join SERVER [--from wss://existing-node/path]        prepare this node for an existing server (its nodes
                                                             from the registry; --from for unlisted servers)
  relay registry-file [--from FILE]                          print the file for the registry pull request, keeping
                                                             listed/answered from FILE (default: federation/servers/<id>.json)
  relay serve                                                run the relay
  relay up                                                   init + genesis (or join) on the first start, then serve;
                                                             settings from $RELAY_URL, $RELAY_NAME… (containers;
                                                             docs/RELAY.md#relay-up)
  relay lan [--name NAME] [--port 8443]                      a LAN party server in one step: no domain, no internet
                                                             (self-signed certificate, docs/HOSTING.md#lan-party)

Day to day (talks to the running relay over its local socket):
  relay status | servers | players | nodes
  relay board [--board pops|pies|traffic|total|cone] [--measure total|growth] [--division all|human|ai]
  relay hide KEY [--names | --refuse]      relay unhide KEY
  relay shun KEY --reason cheating|offensive_name|spam|abuse      relay unshun KEY
  relay ops propose add-operator|remove-operator|add-node|remove-node KEY [--url wss://...]
  relay ops pending      relay ops sign ID [--via wss://a-running-node/path]
  relay ops server [--name N] [--sync standalone|selective|open] [--langs en,de] [--desc T] [--no-logs=true]
  relay backup FILE.tar.gz

Registry (CI and the site build):
  relay check-registry [--offline] [--base GITREF] FILE...
  relay build-servers-json DIR OUT

Every command takes --data DIR (default $RELAY_DATA, else ./relay-data; relay lan: ./relay-lan).
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
	case "up":
		err = cmdUp(args)
	case "lan":
		err = cmdLan(args)
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

// parse lets flags come before or after positional arguments. A server identity or key can
// start with "-" (base64url): one standing where a positional argument may is never a flag.
func parse(fs *flag.FlagSet, args []string) []string {
	var pos []string
	for len(args) > 0 {
		cut := len(args)
		for i := range args {
			if dashID(fs, args, i) {
				cut = i
				break
			}
		}
		rest := args[:cut]
		for len(rest) > 0 {
			_ = fs.Parse(rest)
			rest = fs.Args()
			if len(rest) > 0 {
				pos = append(pos, rest[0])
				rest = rest[1:]
			}
		}
		if cut < len(args) {
			pos = append(pos, args[cut])
			cut++
		}
		args = args[cut:]
	}
	return pos
}

// dashID: args[i] is an identity or key that starts with "-", and not the value of the flag before it.
func dashID(fs *flag.FlagSet, args []string, i int) bool {
	if !strings.HasPrefix(args[i], "-") || !fed.IsID(args[i]) {
		return false
	}
	if i == 0 {
		return true
	}
	p := args[i-1]
	if !strings.HasPrefix(p, "-") || strings.Contains(p, "=") || p == "--" {
		return true
	}
	f := fs.Lookup(strings.TrimLeft(p, "-"))
	if f == nil {
		return true
	}
	b, ok := f.Value.(interface{ IsBoolFlag() bool })
	return ok && b.IsBoolFlag()
}

func cfgPath(dir string) string { return filepath.Join(dir, "config.json") }

func cmdInit(args []string) error {
	fs, dir := flags("init")
	opKey := fs.String("operator-key", "", "use this operator key file instead of making one")
	url := fs.String("url", "", "this node's public wss:// URL")
	listen := fs.String("listen", envOr("RELAY_LISTEN", "127.0.0.1:8080"), "address to listen on (behind your TLS proxy; default $RELAY_LISTEN)")
	metricsAddr := fs.String("metrics", os.Getenv("RELAY_METRICS"), "address for /metrics (default $RELAY_METRICS, else off)")
	metricsPublic := fs.Bool("metrics-public", os.Getenv("RELAY_METRICS_PUBLIC") == "true", "allow /metrics beyond localhost, for a Prometheus in another container (default $RELAY_METRICS_PUBLIC)")
	tlsCert := fs.String("tls-cert", "", "serve TLS itself with this certificate chain (PEM; reread when it changes)")
	tlsKey := fs.String("tls-key", "", "and this private key (PEM)")
	proxies := fs.String("trusted-proxies", "", "networks your proxy connects from, comma separated, trusted besides loopback (a Docker network: 172.30.0.0/24)")
	parse(fs, args)
	if (*tlsCert == "") != (*tlsKey == "") {
		return errors.New("give both --tls-cert and --tls-key, or neither")
	}
	nk, op, opPath, err := initData(*dir, *opKey, func(c *config.Config) {
		c.Listen, c.URL, c.Metrics, c.MetricsPublic = *listen, *url, *metricsAddr, *metricsPublic
		c.TLSCert, c.TLSKey = *tlsCert, *tlsKey
		c.TrustedProxies = append(c.TrustedProxies, splitList(*proxies)...)
	})
	if err != nil {
		return err
	}
	fmt.Printf("Data folder:  %s\nNode key:     %s\nOperator key: %s\n\nNext: relay genesis --name \"…\" (new server) or relay join SERVER (existing one).\nBack up %s: it is your control of the server.\n",
		*dir, nk.Key, op.Key, opPath)
	return nil
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// initData makes the data folder, the node and operator keys and the config (set by cfg).
func initData(dir, opKey string, cfg func(*config.Config)) (nk, op *fed.Signer, opPath string, err error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, nil, "", err
	}
	if _, err := os.Stat(cfgPath(dir)); err == nil {
		return nil, nil, "", fmt.Errorf("%s already holds a relay", dir)
	}
	c := config.Default()
	cfg(c)
	if err := c.Check(); err != nil {
		return nil, nil, "", err
	}
	// Keys left by a setup that stopped before the config was written are kept, never replaced:
	// operator.key may already be backed up (relay up resumes this way).
	if nk, err = newOrLoadKey(filepath.Join(dir, "node.key")); err != nil {
		return nil, nil, "", err
	}
	opPath = filepath.Join(dir, "operator.key")
	if _, err := os.Stat(opPath); err == nil {
		if op, err = ops.LoadKey(opPath); err != nil {
			return nil, nil, "", err
		}
		if opKey != "" {
			if given, err := ops.LoadKey(opKey); err != nil || given.Key != op.Key {
				return nil, nil, "", fmt.Errorf("%s already holds another operator key", opPath)
			}
		}
	} else if opKey != "" {
		if op, err = ops.LoadKey(opKey); err != nil {
			return nil, nil, "", err
		}
		b, _ := os.ReadFile(opKey)
		if err := os.WriteFile(opPath, b, 0o600); err != nil {
			return nil, nil, "", err
		}
	} else if op, err = ops.NewKey(opPath); err != nil {
		return nil, nil, "", err
	}
	if err := c.Save(cfgPath(dir)); err != nil {
		return nil, nil, "", err
	}
	return nk, op, opPath, nil
}

func newOrLoadKey(path string) (*fed.Signer, error) {
	if _, err := os.Stat(path); err == nil {
		return ops.LoadKey(path)
	}
	return ops.NewKey(path)
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
	id, err := found(*dir, *url, ops.ServerFields{Name: *name, Sync: *sync, NoLogs: *noLogs, Langs: splitList(*langs), Desc: *desc})
	if err != nil {
		return err
	}
	fmt.Printf("Server founded. Its identity: %s\nStart it with: relay serve\nTo be listed: relay registry-file > federation/servers/%s.json, then open a pull request.\n", id, id)
	return nil
}

// found signs the genesis and the first server record with the operator key and stores them;
// it returns the server identity.
func found(dir, url string, f ops.ServerFields) (string, error) {
	if ops.Running(dir) {
		return "", errors.New("stop the relay first")
	}
	c, nk, err := loadAll(dir)
	if err != nil {
		return "", err
	}
	if c.Server != "" {
		return "", fmt.Errorf("this node already belongs to server %s", c.Server)
	}
	if url == "" {
		url = c.URL
	}
	if !fed.URLOK(url) {
		return "", errors.New("give --url wss://your.host/path (a host name, not a public IP address)")
	}
	op, err := ops.LoadKey(filepath.Join(dir, "operator.key"))
	if err != nil {
		return "", err
	}
	now := time.Now().Unix()
	// The founding records are written to a pending file before they are stored, and reused from it: a crash
	// between storing them and saving the config (relay up restarts on its own) finishes this server instead of
	// founding a second one.
	pending := filepath.Join(dir, "genesis.pending.json")
	g, srv := pendingFounding(pending, op.Key, nk.Key)
	if g == nil {
		g = op.Seal("genesis", now, map[string]any{"name": f.Name, "node": map[string]any{"key": nk.Key, "url": url}})
	}
	gr, code := fed.CheckValue(g, now, fed.Opts{})
	if code != "" {
		return "", fmt.Errorf("genesis refused: %s", code)
	}
	if srv == nil {
		st := &ops.State{Server: gr.ID, Head: gr.ID, Operators: []string{op.Key}}
		st.Nodes = append(st.Nodes, struct{ Key, URL string }{nk.Key, url})
		srv = ops.ServerRecord(st, op, f, now)
		if err := writeAtomic(pending, canon.Encode(map[string]any{"genesis": g, "server": srv}), 0o600); err != nil {
			return "", err
		}
	}
	if b, _ := gr.Body["node"].(map[string]any); b != nil {
		if u, _ := b["url"].(string); u != "" {
			url = u
		}
	}
	c.Server, c.URL = gr.ID, url
	r, err := node.New(node.Options{Dir: dir, Config: c, Node: nk})
	if err != nil {
		return "", err
	}
	defer r.Close()
	for _, rec := range []map[string]any{g, srv} {
		if _, code := r.ImportOwn(rec); code != "" {
			return "", fmt.Errorf("record refused: %s", code)
		}
	}
	if err := c.Save(cfgPath(dir)); err != nil {
		return "", err
	}
	_ = os.Remove(pending)
	return gr.ID, nil
}

// pendingFounding reads founding records left by an interrupted found: both, when they are this operator's and
// name this node; else nil, nil (and an unusable file is removed).
func pendingFounding(path, opKey, nodeKey string) (map[string]any, map[string]any) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, nil
	}
	v, code := canon.ParseStrict(b) // strict values (int64 numbers), as records are checked
	m, _ := v.(map[string]any)
	g, _ := m["genesis"].(map[string]any)
	srv, _ := m["server"].(map[string]any)
	if code != "" || g == nil || srv == nil || g["key"] != opKey {
		_ = os.Remove(path)
		return nil, nil
	}
	if body, _ := g["body"].(map[string]any); body != nil {
		if n, _ := body["node"].(map[string]any); n == nil || n["key"] != nodeKey {
			_ = os.Remove(path)
			return nil, nil
		}
	}
	return g, srv
}

// writeAtomic writes a file under a temporary name and renames it into place.
func writeAtomic(path string, b []byte, mode os.FileMode) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func cmdJoin(args []string) error {
	fs, dir := flags("join")
	from := fs.String("from", "", "wss:// URL of a running node of that server (default: its nodes in the registry)")
	reg := fs.String("registry", os.Getenv("RELAY_REGISTRY"), "servers.json to find the server's nodes in, an https:// URL or a file (default $RELAY_REGISTRY, else config.json's registry)")
	url := fs.String("url", "", "this node's public wss:// URL (default: from config)")
	pos := parse(fs, args)
	if len(pos) != 1 || !fed.IsID(pos[0]) {
		return errors.New("usage: relay join SERVER-IDENTITY [--from wss://existing-node/path]")
	}
	return join(*dir, pos[0], *from, *reg, *url, joinNet{}, os.Stdout)
}

// join points this node at a server: --from when given, else the server's nodes in the registry. The node fetches
// and checks the server's chain when it serves, and waits until the operators add it.
func join(dir, server, from, reg, ownURL string, j joinNet, out io.Writer) error {
	c, nk, err := loadAll(dir)
	if err != nil {
		return err
	}
	if c.Server != "" {
		return fmt.Errorf("this node already belongs to server %s", c.Server)
	}
	if from != "" && !fed.URLOK(from) {
		return errors.New("--from must be the wss://… URL of a node of that server")
	}
	if ownURL != "" {
		c.URL = ownURL
	}
	if !fed.URLOK(c.URL) {
		return errors.New("set this node's public URL with --url wss://your.host/path")
	}
	seeds := []string{from}
	if from == "" {
		if reg == "" {
			reg = c.Registry
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		seeds, err = findSeeds(ctx, reg, server, c.URL, j)
		cancel()
		if err != nil {
			return err
		}
		fmt.Fprintf(out, "Found the server's nodes in the registry: %s answered.\n", seeds[0])
	}
	c.Server, c.Seeds = server, seeds
	if err := c.Save(cfgPath(dir)); err != nil {
		return err
	}
	fmt.Fprintf(out, "This node will join %s.\nAsk an operator of that server to run:\n\n  relay ops propose add-node %s --url %s\n\nand a majority of its operators to sign it (relay ops sign ID). Then run: relay serve\n", server, nk.Key, c.URL)
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
	// The update line stands out below the JSON (stderr: scripts reading stdout get JSON only).
	if m, ok := v.(map[string]any); ok && cmd == "status" {
		if u, ok := m["update"].(map[string]any); ok {
			if says, ok := u["says"].(string); ok {
				fmt.Fprintln(os.Stderr, says)
			}
		}
	}
	return nil
}

func cmdBoard(args []string) error {
	fs, dir := flags("board")
	b := fs.String("board", "pops", "pops, pies, traffic, total or cone")
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
	return serve(*dir, serveOpts{logJSON: *logJSON})
}

// lanServe is what relay lan adds to serve: its self-signed certificate and the page at /.
type lanServe struct {
	cert *tls.Certificate
	page http.Handler
}

// serveOpts: what serve's callers add. Everything but logJSON is optional.
type serveOpts struct {
	logJSON bool
	lan     *lanServe
	log     *slog.Logger        // default: text (or JSON) on stderr
	tls     *certs.Reloader     // the certificate pair, already loaded (relay up waits for it)
	stop    <-chan struct{}     // closed: stop as on SIGTERM (tests)
	ready   func(net.Addr)      // called once listening, with the address
	node    func(*node.Options) // tests: the net and clock of a relaytest.Net
}

func newLogger(w io.Writer, logJSON bool) *slog.Logger {
	if logJSON {
		return slog.New(slog.NewJSONHandler(w, nil))
	}
	return slog.New(slog.NewTextHandler(w, nil))
}

func serve(dir string, so serveOpts) error {
	lanOpt := so.lan
	c, nk, err := loadAll(dir)
	if err != nil {
		return err
	}
	if c.Server == "" {
		return errors.New("this node has no server yet: run relay genesis or relay join first")
	}
	// Another relay on this folder would lose its operator socket and share the store: refuse
	// (the store's lock refuses it too, where the system has one).
	if ops.Running(dir) {
		return errors.New("a relay is already serving this data folder")
	}
	logger := so.log
	if logger == nil {
		logger = newLogger(os.Stderr, so.logJSON)
	}
	if w := c.ProxyWarning(); w != "" {
		logger.Warn(w)
	}
	if w := c.MetricsWarning(); w != "" {
		logger.Warn(w)
	}
	var countries *privacy.MMDB
	if c.CountryDB != "" {
		if countries, err = privacy.OpenMMDB(c.CountryDB); err != nil {
			return fmt.Errorf("country database: %w", err)
		}
	}
	m := metrics.New()
	o := node.Options{Dir: dir, Config: c, Node: nk, Log: logger, Metrics: m, Version: version}
	// For end-to-end tests only: a stand-in for GitHub's releases API (https, or http on loopback).
	if u := os.Getenv("RELAY_RELEASES_URL"); u != "" {
		if !testReleasesURL(u) {
			return fmt.Errorf("RELAY_RELEASES_URL %q is not an https:// URL or an http:// URL on loopback", u)
		}
		o.ReleasesURL = u
	}
	// For end-to-end tests only: other nodes of the run serve a self-signed certificate.
	if p := os.Getenv("RELAY_TEST_ROOTS"); p != "" {
		hc, err := testRootsClient(p)
		if err != nil {
			return fmt.Errorf("RELAY_TEST_ROOTS: %w", err)
		}
		o.HTTPClient = hc
		logger.Warn("RELAY_TEST_ROOTS: also trusting the certificates in that file for outgoing connections (for tests only)")
	}
	if countries != nil {
		o.Countries = countries
	}
	if so.node != nil {
		so.node(&o)
	}
	r, err := node.New(o)
	if err != nil {
		return err
	}
	defer r.Close()
	sock, err := ops.Serve(dir, r)
	if err != nil {
		return fmt.Errorf("local socket: %w", err)
	}
	defer sock.Close()
	r.Run()
	hh := r.Handler()
	if lanOpt != nil && lanOpt.page != nil {
		ws := hh
		hh = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path == "/" {
				lanOpt.page.ServeHTTP(w, req)
				return
			}
			ws.ServeHTTP(w, req)
		})
	}
	srv := &http.Server{Addr: c.Listen, Handler: hh, ReadHeaderTimeout: 10 * time.Second,
		// net/http logs failed handshakes with the peer's address: never let that out.
		ErrorLog: log.New(io.Discard, "", 0)}
	switch {
	case lanOpt != nil && lanOpt.cert != nil:
		srv.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{*lanOpt.cert}}
	case c.TLSCert != "":
		// Reread when the files change (a Let's Encrypt renewal), so no restart is needed.
		rl := so.tls
		if rl == nil {
			if rl, err = certs.NewReloader(c.TLSCert, c.TLSKey, logger); err != nil {
				return fmt.Errorf("TLS certificate: %w", err)
			}
		}
		srv.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: rl.GetCertificate}
		logger.Info("TLS certificate loaded", "notAfter", rl.NotAfter().UTC().Format(time.RFC3339))
	}
	ln, err := net.Listen("tcp", c.Listen)
	if err != nil {
		return err
	}
	errc := make(chan error, 2)
	go func() {
		var err error
		if srv.TLSConfig != nil {
			err = srv.ServeTLS(ln, "", "")
		} else {
			err = srv.Serve(ln)
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
	if so.ready != nil {
		so.ready(ln.Addr())
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(sig)
	for {
		select {
		case <-so.stop: // nil: never
			so.stop = nil
			sig <- syscall.SIGTERM
		case err := <-errc:
			if !errors.Is(err, http.ErrServerClosed) {
				return err
			}
		case s := <-sig:
			if s == syscall.SIGHUP {
				nc, err := config.Load(cfgPath(dir))
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

// testRootsClient trusts the PEM certificates in path, besides the system's, for outgoing https and wss.
func testRootsClient(path string) (*http.Client, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM(b) {
		return nil, fmt.Errorf("no PEM certificate in %s", path)
	}
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: pool}
	return &http.Client{Transport: t, Timeout: 0}, nil
}

// testReleasesURL accepts a stand-in for GitHub's releases API: https://, or http:// on loopback.
func testReleasesURL(s string) bool {
	u, err := url.Parse(s)
	if err != nil || u.Host == "" || u.User != nil {
		return false
	}
	switch u.Scheme {
	case "https":
		return true
	case "http":
		h := u.Hostname()
		return h == "127.0.0.1" || h == "::1" || h == "localhost"
	}
	return false
}

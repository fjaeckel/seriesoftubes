package main

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/certs"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/lan"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
)

// The files of a LAN server's certificate in its data folder; a folder whose config names other
// TLS files is not a LAN server's, and relay lan leaves it alone.
const lanCert, lanKey = "lan-cert.pem", "lan-key.pem"

// lanSetup is what cmdLan works out before serving; split out for tests.
type lanSetup struct {
	dir, name, listen, host string
	hostname                string       // os.Hostname
	addrs                   []netip.Addr // the machine's LAN addresses
	now                     time.Time
}

// cmdLan runs a standalone server for a LAN party in one step: a data folder of its own, a
// server founded if there is none, a self-signed certificate for this machine's names and LAN
// addresses, and the invite links printed for the players.
func cmdLan(args []string) error {
	fs := flag.NewFlagSet("lan", flag.ExitOnError)
	dir := fs.String("data", "relay-lan", "data folder of the LAN server (kept apart from any other relay's)")
	name := fs.String("name", "LAN Before Time", "the server's name (when founding it)")
	port := fs.Int("port", 8443, "port to listen on, on every interface")
	listen := fs.String("listen", "", "address to listen on instead (for example 127.0.0.1:8443)")
	host := fs.String("host", "", "host name or address for the server's node URL (default: this machine's .local name)")
	logJSON := fs.Bool("log-json", false, "log as JSON lines")
	parse(fs, args)
	if *listen == "" {
		*listen = net.JoinHostPort("", strconv.Itoa(*port))
	}
	hn, _ := os.Hostname()
	s := lanSetup{dir: *dir, name: *name, listen: *listen, host: *host, hostname: hn, addrs: lan.MachineAddrs(), now: time.Now()}
	page, cert, err := s.prepare(os.Stdout)
	if err != nil {
		return err
	}
	return serve(*dir, serveOpts{logJSON: *logJSON, lan: &lanServe{cert: cert, page: page}})
}

// prepare makes or checks the data folder, founds the server, makes the certificate and prints
// the invites. It returns the page and certificate to serve.
func (s lanSetup) prepare(out io.Writer) (http.Handler, *tls.Certificate, error) {
	listenHost, portStr, err := net.SplitHostPort(s.listen)
	if err != nil {
		return nil, nil, fmt.Errorf("--listen: %w", err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return nil, nil, fmt.Errorf("--listen: bad port %q", portStr)
	}
	mdns := lan.MDNSName(s.hostname)
	names := certs.Names{DNS: []string{"localhost"}, IPs: append([]netip.Addr{netip.MustParseAddr("127.0.0.1"), netip.IPv6Loopback()}, s.addrs...)}
	if mdns != "" {
		names.DNS = append([]string{mdns}, names.DNS...)
	}
	urlHost := s.host
	if a, err := netip.ParseAddr(listenHost); urlHost == "" && err == nil && !a.IsUnspecified() {
		urlHost = a.String()
	}
	if urlHost == "" {
		urlHost = mdns
	}
	if urlHost == "" && len(s.addrs) > 0 {
		urlHost = s.addrs[0].String()
	}
	if urlHost == "" {
		urlHost = "127.0.0.1"
	}
	if a, err := netip.ParseAddr(urlHost); err == nil {
		if !contains(names.IPs, a) {
			names.IPs = append(names.IPs, a)
		}
	} else if !contains(names.DNS, urlHost) {
		names.DNS = append(names.DNS, urlHost)
	}
	const path = "/fed"
	nodeURL := lan.HostURL(urlHost, port, path)
	if !fed.URLOK(nodeURL) {
		return nil, nil, fmt.Errorf("%s is not a node URL: give --host a name with a dot or a private address", nodeURL)
	}

	certPath, keyPath := filepath.Join(s.dir, lanCert), filepath.Join(s.dir, lanKey)
	if _, err := os.Stat(cfgPath(s.dir)); errors.Is(err, os.ErrNotExist) {
		if _, _, _, err := initData(s.dir, "", func(c *config.Config) {
			c.Listen, c.URL, c.Path, c.TLSCert, c.TLSKey = s.listen, nodeURL, path, certPath, keyPath
			c.Registry = "" // offline: no registry, no update feed, nothing from the internet
		}); err != nil {
			return nil, nil, err
		}
		fmt.Fprintf(out, "Made the LAN server's data folder %s.\n", s.dir)
	}
	c, err := config.Load(cfgPath(s.dir))
	if err != nil {
		return nil, nil, err
	}
	if c.TLSCert != certPath {
		return nil, nil, fmt.Errorf("%s holds a relay that is not a LAN server (relay lan keeps its own folder): give another --data", s.dir)
	}
	if c.Listen != s.listen {
		c.Listen = s.listen
		if err := c.Save(cfgPath(s.dir)); err != nil {
			return nil, nil, err
		}
	}
	if c.Server == "" {
		id, err := found(s.dir, nodeURL, ops.ServerFields{Name: s.name, Sync: "standalone", NoLogs: true, Langs: []string{"en"}})
		if err != nil {
			return nil, nil, err
		}
		fmt.Fprintf(out, "Founded %q, a standalone server (identity %s).\n", s.name, id)
	}
	srvName := s.name
	if st, err := serverName(s.dir); err == nil && st != "" {
		srvName = st
	}
	cert, made, err := certs.EnsureSelfSigned(certPath, keyPath, names, s.now)
	if err != nil {
		return nil, nil, fmt.Errorf("certificate: %w", err)
	}

	// The invites: by the .local name, then by each address (for phones that do not resolve
	// .local names). Only on this terminal: nothing is logged or stored.
	hosts := []string{}
	if mdns != "" {
		hosts = append(hosts, mdns)
	}
	for _, a := range s.addrs {
		hosts = append(hosts, a.String())
	}
	if s.host != "" && !contains(hosts, s.host) {
		hosts = append([]string{s.host}, hosts...)
	}
	// Listening on one address only (loopback, say): that is the one address that works.
	if a, err := netip.ParseAddr(listenHost); err == nil && !a.IsUnspecified() {
		hosts = []string{a.String()}
	}
	if len(hosts) == 0 {
		hosts = []string{"127.0.0.1"}
	}
	fmt.Fprintf(out, "\n%s is ready for a LAN party on port %d.\n", srvName, port)
	if made {
		fmt.Fprintln(out, "A new self-signed certificate was made: every device accepts it once (again).")
	} else {
		fmt.Fprintln(out, "Same certificate as last time: devices that accepted it before can join straight away.")
	}
	fmt.Fprintln(out, "\nOn each device, once:\n  1. Open the server's page and accept the certificate warning (\"Advanced\", \"Proceed\" / \"Show details\", \"visit this website\"):")
	for _, h := range hosts {
		fmt.Fprintf(out, "       %s\n", "https://"+hostPort(h, port)+"/")
	}
	fmt.Fprintln(out, "  2. Then join with the invite link the page shows, or one of these:")
	for _, h := range hosts {
		fmt.Fprintf(out, "       %s\n", lan.Invite(lan.HostURL(h, port, path)))
	}
	fmt.Fprintln(out, "\nIf a phone cannot open the .local address, use an address with numbers instead.\nThe game must have been opened once on each device while online; after that nothing here needs the internet.\nStop with Ctrl-C. Your server stays in "+s.dir+" for the next party.")
	return lan.Page(srvName, port, path), cert, nil
}

func hostPort(h string, port int) string {
	return net.JoinHostPort(h, strconv.Itoa(port))
}

func contains[T comparable](l []T, x T) bool {
	for _, y := range l {
		if y == x {
			return true
		}
	}
	return false
}

// serverName reads the server's name from the stored server record, when there is one.
func serverName(dir string) (string, error) {
	b, err := registryFile(dir)
	if err != nil {
		return "", err
	}
	var f struct {
		Server struct {
			Body struct {
				Name string `json:"name"`
			} `json:"body"`
		} `json:"server"`
	}
	err = json.Unmarshal(b, &f)
	return f.Server.Body.Name, err
}

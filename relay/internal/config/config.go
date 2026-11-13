// Package config reads the relay's config file (config.json in the data folder): what
// rarely changes. The relay rereads it on SIGHUP.
package config

import (
	"encoding/json"
	"fmt"
	"net"
	"net/netip"
	"os"
	"slices"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
)

// Classes a sync session can carry (9.4). shun and unshun always travel.
var Classes = []string{"players", "catalog", "advice"}

// Neighbour is another server's node this node dials.
type Neighbour struct {
	URL  string   `json:"url"`
	Send []string `json:"send,omitempty"` // classes sent to it; empty: all
	Take []string `json:"take,omitempty"` // classes taken from it; empty: all
}

// Limits bound what one connection or address may do.
type Limits struct {
	MaxClients    int `json:"maxClients"`    // open client connections
	MaxNodes      int `json:"maxNodes"`      // open node sessions
	ConnsPerAddr  int `json:"connsPerAddr"`  // new connections per address per window, before anything is put
	AddrWindowSec int `json:"addrWindowSec"` // the window, seconds (kept in memory only)
	MsgsPerSec    int `json:"msgsPerSec"`    // frames per connection per second (burst 4x)
}

// Config is the config file.
type Config struct {
	Listen         string      `json:"listen"`              // address the relay listens on, usually behind a proxy
	Path           string      `json:"path"`                // WebSocket path
	URL            string      `json:"url"`                 // this node's public wss:// URL
	TLSCert        string      `json:"tlsCert,omitempty"`   // serve TLS itself (optional)
	TLSKey         string      `json:"tlsKey,omitempty"`    //
	Server         string      `json:"server,omitempty"`    // server identity (set by genesis or join)
	Seeds          []string    `json:"seeds,omitempty"`     // join: existing nodes of the server
	Selective      []string    `json:"selective,omitempty"` // servers allowed when the server's sync is selective
	Neighbours     []Neighbour `json:"neighbours,omitempty"`
	AutoSync       *bool       `json:"autoSync,omitempty"`    // false: do not dial the registry's open servers (10.9); unset: on
	DefaultSend    []string    `json:"defaultSend,omitempty"` // for servers that dial in and are not neighbours
	DefaultTake    []string    `json:"defaultTake,omitempty"`
	CountryDB      string      `json:"countryDb,omitempty"`      // country-only MaxMind-format database
	Registry       string      `json:"registry,omitempty"`       // servers.json: a file path or an https:// URL
	Metrics        string      `json:"metrics,omitempty"`        // loopback address for /metrics, empty: off
	MetricsPublic  bool        `json:"metricsPublic,omitempty"`  // allow metrics beyond loopback (a container's Prometheus)
	TrustedProxies []string    `json:"trustedProxies,omitempty"` // prefixes whose X-Forwarded-For is believed
	Listed         bool        `json:"listed"`                   // the operators mean to be in the registry
	NotifyURL      string      `json:"notifyURL,omitempty"`      // https:// URL POSTed once per new relay release; empty: off
	Limits         Limits      `json:"limits"`
}

// DefaultRegistry is where the site publishes servers.json.
const DefaultRegistry = "https://seriesoftub.es/federation/servers.json"

// Default is the config `relay init` writes.
func Default() *Config {
	c := &Config{Listen: "127.0.0.1:8080", Path: "/fed", Registry: DefaultRegistry,
		TrustedProxies: []string{"127.0.0.0/8", "::1/128"}}
	c.fill()
	return c
}

func (c *Config) fill() {
	if c.Path == "" {
		c.Path = "/fed"
	}
	l := &c.Limits
	def := func(p *int, v int) {
		if *p <= 0 {
			*p = v
		}
	}
	def(&l.MaxClients, 5000)
	def(&l.MaxNodes, 64)
	def(&l.ConnsPerAddr, 30)
	def(&l.AddrWindowSec, 300)
	def(&l.MsgsPerSec, 20)
	if c.TrustedProxies == nil {
		c.TrustedProxies = []string{"127.0.0.0/8", "::1/128"}
	}
}

// ProxyWarning is a warning for a setup where every player may seem to come from one address,
// or "": the relay listens beyond loopback without TLS of its own, so a proxy is in front, yet it
// believes X-Forwarded-For from loopback only. In a container the proxy connects from the
// container network, and the per-address connection limit would then count all players as one.
func (c *Config) ProxyWarning() string {
	if c.TLSCert != "" {
		return ""
	}
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil {
		return ""
	}
	if a, err := netip.ParseAddr(host); err == nil && a.IsLoopback() || host == "localhost" {
		return ""
	}
	for _, p := range c.Proxies() {
		if !p.Addr().IsLoopback() {
			return ""
		}
	}
	return "listen is not on loopback but trustedProxies trusts loopback only: if a proxy in front connects " +
		"from another address (a container network), every player seems to come from it and shares one " +
		"connection limit; add the proxy's address to trustedProxies"
}

func loopback(host string) bool {
	ip, err := netip.ParseAddr(host)
	return host == "localhost" || err == nil && ip.IsLoopback()
}

// MetricsWarning is a warning when /metrics listens beyond loopback (metricsPublic), or "".
func (c *Config) MetricsWarning() string {
	host, _, err := net.SplitHostPort(c.Metrics)
	if c.Metrics == "" || err != nil || loopback(host) {
		return ""
	}
	return "metrics listen on " + c.Metrics + " (metricsPublic): anyone who can reach that port reads them; " +
		"keep it on an internal network or behind a firewall, never published to the internet"
}

// Load reads and checks a config file.
func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var c Config
	d := json.NewDecoder(bytesReader(b))
	d.DisallowUnknownFields()
	if err := d.Decode(&c); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	c.fill()
	if err := c.Check(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &c, nil
}

// Check refuses settings that would break the relay's promises.
func (c *Config) Check() error {
	if c.URL != "" && !fed.URLOK(c.URL) {
		return fmt.Errorf("url %q is not a wss:// URL with a host name", c.URL)
	}
	if (c.TLSCert == "") != (c.TLSKey == "") {
		return fmt.Errorf("tlsCert and tlsKey go together")
	}
	if c.Server != "" && !fed.IsID(c.Server) {
		return fmt.Errorf("server is not a server identity")
	}
	for _, s := range c.Selective {
		if !fed.IsID(s) {
			return fmt.Errorf("selective: %q is not a server identity", s)
		}
	}
	for _, n := range c.Neighbours {
		if !fed.URLOK(n.URL) {
			return fmt.Errorf("neighbour %q is not a wss:// URL with a host name", n.URL)
		}
		if err := classes(n.Send); err != nil {
			return err
		}
		if err := classes(n.Take); err != nil {
			return err
		}
	}
	for _, u := range c.Seeds {
		if !fed.URLOK(u) {
			return fmt.Errorf("seed %q is not a wss:// URL", u)
		}
	}
	if err := classes(c.DefaultSend); err != nil {
		return err
	}
	if err := classes(c.DefaultTake); err != nil {
		return err
	}
	if c.Metrics != "" {
		host, _, err := net.SplitHostPort(c.Metrics)
		if err != nil {
			return fmt.Errorf("metrics: %w", err)
		}
		if !c.MetricsPublic && !loopback(host) {
			return fmt.Errorf("metrics must listen on localhost only, not %q (in a container, set metricsPublic: true and keep the port off the internet)", c.Metrics)
		}
	}
	for _, p := range c.TrustedProxies {
		if _, err := netip.ParsePrefix(p); err != nil {
			return fmt.Errorf("trustedProxies: %w", err)
		}
	}
	if c.NotifyURL != "" && !update.HTTPSURL(c.NotifyURL) {
		return fmt.Errorf("notifyURL %q is not an https:// URL with a host (and no user or password in it)", c.NotifyURL)
	}
	return nil
}

func classes(list []string) error {
	for _, x := range list {
		if !slices.Contains(Classes, x) {
			return fmt.Errorf("unknown class %q (players, catalog, advice)", x)
		}
	}
	return nil
}

// Proxies parses TrustedProxies.
func (c *Config) Proxies() []netip.Prefix {
	var out []netip.Prefix
	for _, p := range c.TrustedProxies {
		if pr, err := netip.ParsePrefix(p); err == nil {
			out = append(out, pr)
		}
	}
	return out
}

// Neighbour returns the neighbour entry for a URL, if any.
func (c *Config) Neighbour(url string) *Neighbour {
	for i := range c.Neighbours {
		if c.Neighbours[i].URL == url {
			return &c.Neighbours[i]
		}
	}
	return nil
}

// Auto reports whether this node syncs automatically with the registry's open servers (10.9).
func (c *Config) Auto() bool { return c.AutoSync == nil || *c.AutoSync }

// Save writes the config file (0600).
func (c *Config) Save(path string) error {
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return store.WriteAtomic(path, append(b, '\n'), 0o600)
}

// Or returns list, or all classes when it is empty.
func Or(list []string) []string {
	if len(list) == 0 {
		return Classes
	}
	return list
}

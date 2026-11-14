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
	"github.com/fjaeckel/seriesoftubes/relay/internal/origin"
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
	MaxClients    int     `json:"maxClients"`              // open client connections
	MaxNodes      int     `json:"maxNodes"`                // open node sessions
	OpenPerAddr   int     `json:"openPerAddr"`             // connections open at once per address (IPv6: per /64; a /56 twice, a /48 four times)
	ConnBurst     int     `json:"connBurst"`               // new connections per address at once (a token bucket, kept in memory only)
	ConnsPerSec   float64 `json:"connsPerSec"`             // and how fast that refills, per second
	ConnsPerAddr  int     `json:"connsPerAddr,omitempty"`  // older form: new connections per address per window (read into connBurst/connsPerSec)
	AddrWindowSec int     `json:"addrWindowSec,omitempty"` // the older form's window, seconds
	MsgsPerSec    int     `json:"msgsPerSec"`              // frames per connection per second (burst 4x)
}

// Old defaults of the older per-address limit: files written by older relays carry them, and they
// mean "the default", not a choice to keep 30 connections per 5 minutes.
const (
	oldConnsPerAddr  = 30
	oldAddrWindowSec = 300
)

// Budgets bound how fast others can make a node keep more: keys cost nothing to make, so what is
// new (keys, record bytes, live-state keys) is counted per connection, per address and per other
// server, by the hour, in memory only. Past a high-water mark only networks that have an announce
// here may put. Players running many games from one address stay well inside them.
type Budgets struct {
	NewKeysPerConn  int   `json:"newKeysPerConn"`  // keys not seen before, per connection per hour
	NewKeysPerAddr  int   `json:"newKeysPerAddr"`  // per address (an IPv6 /64) per hour
	NewKeysPerPeer  int   `json:"newKeysPerPeer"`  // per other server syncing with this one, per hour
	BytesPerConn    int64 `json:"bytesPerConn"`    // bytes of new records per connection per hour
	BytesPerAddr    int64 `json:"bytesPerAddr"`    // per address per hour
	BytesPerPeer    int64 `json:"bytesPerPeer"`    // per other server per hour
	LiveKeysPerConn int   `json:"liveKeysPerConn"` // live-state keys without an announce, per connection per hour
	LiveKeysPerAddr int   `json:"liveKeysPerAddr"` // per address per hour
	LiveKeysPerPeer int   `json:"liveKeysPerPeer"` // per other server per hour
	MaxRecords      int   `json:"maxRecords"`      // high-water mark: records kept
	MaxStoreBytes   int64 `json:"maxStoreBytes"`   // high-water mark: bytes of records kept
	MaxHeapBytes    int64 `json:"maxHeapBytes"`    // high-water mark: Go heap in use
	MinFreeDisk     int64 `json:"minFreeDisk"`     // high-water mark: free space left on the data folder's disk
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
	AllowedOrigins []string    `json:"allowedOrigins,omitempty"` // web pages besides the game's that may connect (https://example.org, https://*.example.org, or "*": any)
	// LegacyAuth: whether a client's auth may be the older form, bound to no session nonce or URL
	// (9.3). Unset: true, while older games are about; it will be switched off in a later release.
	LegacyAuth *bool   `json:"legacyAuth,omitempty"`
	Limits     Limits  `json:"limits"`
	Budgets    Budgets `json:"budgets"`
}

// LegacyAuthOK says whether the older, unbound client auth is taken (legacyAuth, default true).
func (c *Config) LegacyAuthOK() bool { return c.LegacyAuth == nil || *c.LegacyAuth }

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
	if l.ConnBurst <= 0 && l.ConnsPerAddr > 0 && (l.ConnsPerAddr != oldConnsPerAddr || l.AddrWindowSec > 0 && l.AddrWindowSec != oldAddrWindowSec) {
		// An operator's own older setting: the same number of connections at once, refilled over the window.
		w := l.AddrWindowSec
		if w <= 0 {
			w = oldAddrWindowSec
		}
		l.ConnBurst = l.ConnsPerAddr
		if !(l.ConnsPerSec > 0) {
			l.ConnsPerSec = float64(l.ConnsPerAddr) / float64(w)
		}
	}
	def(&l.OpenPerAddr, 256)
	def(&l.ConnBurst, 120)
	if !(l.ConnsPerSec > 0) {
		l.ConnsPerSec = 1
	}
	def(&l.MsgsPerSec, 20)
	b := &c.Budgets
	def(&b.NewKeysPerConn, 64)
	def(&b.NewKeysPerAddr, 1024)
	def(&b.NewKeysPerPeer, 20000)
	def(&b.LiveKeysPerConn, 16)
	def(&b.LiveKeysPerAddr, 256)
	def(&b.LiveKeysPerPeer, 5000)
	def(&b.MaxRecords, 20_000_000)
	def64 := func(p *int64, v int64) {
		if *p <= 0 {
			*p = v
		}
	}
	def64(&b.BytesPerConn, 16<<20)
	def64(&b.BytesPerAddr, 256<<20)
	def64(&b.BytesPerPeer, 2<<30)
	def64(&b.MaxStoreBytes, 32<<30)
	def64(&b.MaxHeapBytes, 6<<30)
	def64(&b.MinFreeDisk, 1<<30)
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
	for _, o := range c.AllowedOrigins {
		if !origin.Pattern(o) {
			return fmt.Errorf("allowedOrigins: %q is not an origin (https://example.org, https://*.example.org or *)", o)
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

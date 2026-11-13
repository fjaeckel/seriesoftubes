// Package lan is what `relay lan` needs beyond a normal relay: the machine's LAN addresses and
// mDNS name (for the self-signed certificate and the invite links), and the small page the relay
// shows at / so players can accept the certificate. The page is the relay's own, never the game:
// the game is served from GitHub Pages only (docs/adr/0001-github-pages-only.md).
package lan

import (
	"html/template"
	"net"
	"net/http"
	"net/netip"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// GameURL is where players open the game; invites are GameURL + "#join=" + node URL.
const GameURL = "https://seriesoftub.es/"

// Invite is the game link that joins a node.
func Invite(nodeURL string) string { return GameURL + "#join=" + nodeURL }

// Addrs picks the LAN addresses among an interface's: private IPv4 (10/8, 172.16/12, 192.168/16),
// IPv4 link-local and IPv6 unique local, the addresses a node URL may name (protocol 5, Url).
// Loopback is left out (only this machine reaches it) and so is IPv6 link-local (it needs a zone,
// which URLs cannot carry). Sorted: IPv4 first.
func Addrs(addrs []net.Addr) []netip.Addr {
	var out []netip.Addr
	for _, a := range addrs {
		var ip net.IP
		switch v := a.(type) {
		case *net.IPNet:
			ip = v.IP
		case *net.IPAddr:
			ip = v.IP
		default:
			continue
		}
		x, ok := netip.AddrFromSlice(ip)
		if !ok {
			continue
		}
		x = x.Unmap()
		if x.IsLoopback() || !fed.LocalAddr(x) || slices.Contains(out, x) {
			continue
		}
		out = append(out, x)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Is4() != out[j].Is4() {
			return out[i].Is4()
		}
		return out[i].Less(out[j])
	})
	return out
}

// MachineAddrs reads this machine's interfaces (up, not loopback) and returns their LAN addresses.
func MachineAddrs() []netip.Addr {
	ifs, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var all []net.Addr
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		if as, err := i.Addrs(); err == nil {
			all = append(all, as...)
		}
	}
	return Addrs(all)
}

// MDNSName is the machine's mDNS name (<hostname>.local), or "" when the host name cannot be
// one: lower case, the first label only, characters other than a-z, 0-9 and - dropped.
func MDNSName(hostname string) string {
	h := strings.ToLower(strings.TrimSuffix(strings.TrimSuffix(hostname, "."), ".local"))
	if i := strings.IndexByte(h, '.'); i >= 0 {
		h = h[:i]
	}
	var b strings.Builder
	for _, c := range h {
		switch {
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-':
			b.WriteRune(c)
		case c == ' ' || c == '_':
			b.WriteByte('-')
		}
	}
	h = strings.Trim(b.String(), "-")
	if h == "" || len(h) > 63 {
		return ""
	}
	return h + ".local"
}

// HostURL is the node URL for a host (a name, or an address as the Url type writes it).
func HostURL(host string, port int, path string) string {
	if a, err := netip.ParseAddr(host); err == nil && a.Is6() {
		host = "[" + a.String() + "]"
	}
	return "wss://" + host + portPart(port) + path
}

func portPart(p int) string {
	if p == 443 {
		return ""
	}
	return ":" + strconv.Itoa(p)
}

// Page serves the relay's own page at / (GET and HEAD): the server's name and the invite link for
// the address the browser used, which, having reached this page, is one that works. A Host that
// is not a valid node host gets the page without a link. No external requests, no scripts.
func Page(name string, port int, path string) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet && req.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		host := req.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		d := pageData{Name: name, Game: GameURL}
		if u := HostURL(strings.Trim(host, "[]"), port, path); fed.URLOK(u) {
			d.Node, d.Invite = u, Invite(u)
		}
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-store")
		h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Content-Type-Options", "nosniff")
		_ = page.Execute(w, d)
	}
}

type pageData struct{ Name, Node, Invite, Game string }

var page = template.Must(template.New("lan").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{{.Name}}: a Series of Tubes LAN server</title>
<style>
body{font:17px/1.5 system-ui,sans-serif;max-width:36em;margin:0 auto;padding:16px;background:#fdf8ee;color:#1e2640}
h1{font-size:1.4em;margin:.4em 0}a.go{display:block;margin:1em 0;padding:.8em 1em;background:#1e2640;color:#fff;border-radius:10px;text-align:center;text-decoration:none;font-weight:600;word-break:break-all}
code{background:#fff;border:1px solid #d9d2c3;border-radius:6px;padding:.1em .3em;word-break:break-all}
li{margin:.4em 0}@media (prefers-color-scheme:dark){body{background:#151a2c;color:#eee}a.go{background:#f4c95d;color:#151a2c}code{background:#222a44;border-color:#3a4466}}
</style></head><body>
<h1>{{.Name}}</h1>
<p>This is a <b>Series of Tubes</b> multiplayer server on your local network. You are seeing this page, so your
browser now accepts its certificate: that was the one step needed.</p>
{{if .Invite}}<p>Now open the game with this invite link to join:</p>
<a class="go" href="{{.Invite}}">Join {{.Name}}</a>
<p>Or, in the game's multiplayer screen, type the server address <code>{{.Node}}</code>.</p>
{{else}}<p>Open this page by the address the server printed (a <code>.local</code> name or a local IP address) to get
the invite link.</p>{{end}}
<ul>
<li>Each device does this once: open this page, accept the warning about the certificate, then use the link.</li>
<li>The game must have been opened once on the device while online; after that it works without the internet.</li>
<li>Nothing here leaves your network: this server is not listed anywhere.</li>
</ul>
</body></html>
`))

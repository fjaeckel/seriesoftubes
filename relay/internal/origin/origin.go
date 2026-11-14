// Package origin decides which web pages may open a WebSocket to the relay. Agents, command
// lines and other relays send no Origin and are always let in; a browser always sends one, so
// another website cannot make its visitors' browsers use up the relay's connections.
package origin

import (
	"net/netip"
	"net/url"
	"path"
	"strings"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Game is where the game is served from.
var Game = []string{"https://seriesoftub.es", "https://www.seriesoftub.es"}

// OK reports whether a request with this Origin header may connect. extra are the operator's own
// patterns (Pattern). Not "the relay's own host": with DNS rebinding any website could be that.
func OK(origin string, extra []string) bool {
	if origin == "" {
		return true
	}
	o := strings.ToLower(origin)
	for _, p := range extra {
		if p == "*" {
			return true
		}
		if m, _ := path.Match(strings.ToLower(p), o); m {
			return true
		}
	}
	for _, g := range Game {
		if o == g {
			return true
		}
	}
	u, err := url.Parse(o)
	if err != nil || u.Host == "" || u.Scheme != "http" && u.Scheme != "https" || u.Path != "" || u.User != nil {
		return false // "null" (a sandboxed frame or a file) included
	}
	return Local(u.Hostname()) // relay lan's own page included: it is on a LAN address or name
}

// Local reports whether a page's host name can only be a machine of one's own or one's LAN, never a
// website: the game in development (npm run dev, --host, --https) and pages served on a LAN.
func Local(h string) bool {
	if a, err := netip.ParseAddr(strings.Trim(h, "[]")); err == nil {
		return fed.LocalAddr(a.WithZone(""))
	}
	h = strings.TrimSuffix(h, ".")
	if h == "localhost" {
		return true
	}
	for _, s := range []string{".localhost", ".local", ".test", ".home.arpa", ".internal"} {
		if strings.HasSuffix(h, s) {
			return true
		}
	}
	return false
}

// Pattern reports whether an operator's allowedOrigins entry is one: "*", or scheme://host[:port]
// with http or https, where the host may hold * wildcards.
func Pattern(p string) bool {
	if p == "*" {
		return true
	}
	if _, err := path.Match(p, ""); err != nil {
		return false
	}
	u, err := url.Parse(strings.ReplaceAll(p, "*", "x"))
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && u.Path == "" && u.User == nil && u.RawQuery == "" && u.Fragment == ""
}

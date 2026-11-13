package lan

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
)

func cidr(s string) net.Addr {
	ip, n, _ := net.ParseCIDR(s)
	n.IP = ip
	return n
}

// Only addresses a node URL may name, and that other machines on the LAN reach.
func TestAddrs(t *testing.T) {
	got := Addrs([]net.Addr{
		cidr("192.168.1.20/24"), cidr("127.0.0.1/8"), cidr("::1/128"), cidr("fe80::1/64"),
		cidr("fd12:3456::1/64"), cidr("203.0.113.9/24"), cidr("2001:db8::7/64"), cidr("10.0.0.5/8"),
		cidr("169.254.3.4/16"), cidr("100.64.0.1/10"), cidr("192.168.1.20/24"), &net.IPAddr{IP: net.ParseIP("172.20.0.2")},
	})
	want := []string{"10.0.0.5", "169.254.3.4", "172.20.0.2", "192.168.1.20", "fd12:3456::1"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != netip.MustParseAddr(want[i]) {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestMDNSName(t *testing.T) {
	for in, want := range map[string]string{
		"Freds-MacBook-Pro.local": "freds-macbook-pro.local",
		"raspberrypi":             "raspberrypi.local",
		"box.example.net":         "box.local",
		"Fred's Laptop":           "freds-laptop.local",
		"":                        "",
		"___":                     "",
	} {
		if got := MDNSName(in); got != want {
			t.Errorf("MDNSName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestHostURL(t *testing.T) {
	for _, c := range [][3]string{
		{"freds-laptop.local", "wss://freds-laptop.local:8443/fed"},
		{"192.168.1.20", "wss://192.168.1.20:8443/fed"},
		{"fd12:3456:0:0:0:0:0:1", "wss://[fd12:3456::1]:8443/fed"},
	} {
		if got := HostURL(c[0], 8443, "/fed"); got != c[1] {
			t.Errorf("HostURL(%q) = %q, want %q", c[0], got, c[1])
		}
	}
	if got := HostURL("box.local", 443, "/fed"); got != "wss://box.local/fed" {
		t.Errorf("port 443 written: %s", got)
	}
}

// The page at /: the invite for the address the browser used, nothing from elsewhere, and
// nothing for a Host that is not a node host.
func TestPage(t *testing.T) {
	h := Page("LAN Before Time", 8443, "/fed")
	get := func(host, method string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "https://x/", nil)
		req.Host = host
		w := httptest.NewRecorder()
		h(w, req)
		return w
	}
	for host, invite := range map[string]string{
		"192.168.1.20:8443":       "https://seriesoftub.es/#join=wss://192.168.1.20:8443/fed",
		"freds-laptop.local:8443": "https://seriesoftub.es/#join=wss://freds-laptop.local:8443/fed",
		"[fd12:3456::1]:8443":     "https://seriesoftub.es/#join=wss://[fd12:3456::1]:8443/fed",
	} {
		w := get(host, http.MethodGet)
		b := w.Body.String()
		if w.Code != 200 || !strings.Contains(b, `href="`+invite+`"`) || !strings.Contains(b, "LAN Before Time") {
			t.Errorf("%s: %d, no invite %s in:\n%s", host, w.Code, invite, b)
		}
		if csp := w.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'none'") {
			t.Errorf("CSP %q", csp)
		}
		for _, ext := range []string{"<script", "src=", "@import", "url("} {
			if strings.Contains(b, ext) {
				t.Errorf("the page loads something (%s)", ext)
			}
		}
	}
	for _, host := range []string{"8.8.8.8:8443", `evil"><script>.example:8443`, "localhost:8443"} {
		b := get(host, http.MethodGet).Body.String()
		if strings.Contains(b, "#join=") || strings.Contains(b, "<script>") {
			t.Errorf("%s: an invite or markup from the Host header:\n%s", host, b)
		}
	}
	if w := get("192.168.1.20:8443", http.MethodPost); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST: %d", w.Code)
	}
}

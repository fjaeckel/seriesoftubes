package fed

import "testing"

// Section 5, Url: host names with a dot, or a local address for LAN servers. The registry
// (PublicURL) takes host names only, and no .local names.
func TestURL(t *testing.T) {
	for _, c := range []struct {
		url        string
		ok, public bool
	}{
		{"wss://relay.example.net/fed", true, true},
		{"wss://relay.example.net:8443/fed", true, true},
		{"wss://freds-laptop.local:8443/fed", true, false},
		{"wss://192.168.1.20:8443/fed", true, false},
		{"wss://10.0.0.5/fed", true, false},
		{"wss://172.16.0.1/fed", true, false},
		{"wss://172.31.255.254/fed", true, false},
		{"wss://169.254.10.10/fed", true, false},
		{"wss://127.0.0.1:8443/fed", true, false},
		{"wss://[fd12:3456::1]:8443/fed", true, false},
		{"wss://[::1]:8443/fed", true, false},
		{"wss://[fd00:0:1::1:0:1]/fed", true, false},
		{"wss://[fd00::1:0:0:1:0:1]/fed", false, false},
		// Public addresses are refused: a public server has a name.
		{"wss://192.0.2.7/fed", false, false},
		{"wss://8.8.8.8/fed", false, false},
		{"wss://172.32.0.1/fed", false, false},
		{"wss://[2001:db8::1]/fed", false, false},
		{"wss://0.0.0.0/fed", false, false},
		// One spelling per address.
		{"wss://192.168.001.20/fed", false, false},
		{"wss://10.1/fed", false, false},
		{"wss://[fd12:3456:0:0:0:0:0:1]/fed", false, false},
		{"wss://[FD12::1]/fed", false, false},
		{"wss://[::ffff:a00:1]/fed", false, false},
		{"wss://[fe80::1]/fed", false, false},
		{"wss://[fd12::1/fed", false, false},
		{"wss://localhost/fed", false, false},
		{"ws://192.168.1.20/fed", false, false},
		{"wss://192.168.1.20:0/fed", false, false},
	} {
		if got := URLOK(c.url); got != c.ok {
			t.Errorf("URLOK(%q) = %v, want %v", c.url, got, c.ok)
		}
		if got := PublicURL(c.url); got != c.public {
			t.Errorf("PublicURL(%q) = %v, want %v", c.url, got, c.public)
		}
	}
}

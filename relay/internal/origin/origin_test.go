package origin

import "testing"

func TestOK(t *testing.T) {
	for _, o := range []string{"", "https://seriesoftub.es", "http://localhost:8080", "https://box.local:8080", "https://10.0.0.5:8443", "http://[::1]:8080", "https://x.localhost"} {
		if !OK(o, nil) {
			t.Errorf("%q refused", o)
		}
	}
	for _, o := range []string{"null", "https://evil.example", "https://seriesoftub.es.evil.example", "https://203.0.113.1", "file://", "https://localhost.evil.example"} {
		if OK(o, nil) {
			t.Errorf("%q let in", o)
		}
	}
	if !OK("https://play.example.org", []string{"https://*.example.org"}) || OK("https://example.org", []string{"https://*.example.org"}) {
		t.Error("patterns")
	}
	if !OK("https://anything.example", []string{"*"}) {
		t.Error("*")
	}
	for p, ok := range map[string]bool{"*": true, "https://example.org": true, "https://*.example.org:8443": true, "example.org": false, "https://example.org/x": false, "ftp://example.org": false, "https://[": false} {
		if Pattern(p) != ok {
			t.Errorf("Pattern(%q) = %v", p, !ok)
		}
	}
}

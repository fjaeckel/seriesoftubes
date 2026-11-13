package canon

import "testing"

// \u escapes are four hex digits (at most U+FFFF); a surrogate pair makes one rune above it, and a short escape fails.
func TestUnicodeEscapes(t *testing.T) {
	for in, want := range map[string]string{`"￿"`: "￿", `"é"`: "é", `"🚀"`: "🚀"} {
		v, code := ParseStrict([]byte(in))
		if code != "" || v != want {
			t.Fatalf("%s: %q %q", in, v, code)
		}
	}
	for _, in := range []string{`"\u12"`, `"\uzzzz"`} {
		if _, code := ParseStrict([]byte(in)); code == "" {
			t.Fatalf("%s was taken", in)
		}
	}
}

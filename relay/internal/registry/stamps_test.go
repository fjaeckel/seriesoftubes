package registry

import "testing"

// An existing file without a genesis is an error, not a crash.
func TestKeepStampsWithoutGenesis(t *testing.T) {
	for _, old := range []string{`{}`, `{"listed":86400}`} {
		if _, err := KeepStamps([]byte(`{"genesis":{"a":1}}`), []byte(old)); err == nil {
			t.Fatalf("existing %s: no error", old)
		}
	}
}

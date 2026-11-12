package ops

import (
	"strings"
	"testing"
)

// A data folder too long for a Unix socket gets a clear error instead of "bind: invalid argument".
func TestServeRejectsLongSocketPath(t *testing.T) {
	_, err := Serve("/"+strings.Repeat("d", 100), nil)
	if err == nil || !strings.Contains(err.Error(), "shorter data folder") {
		t.Fatalf("want a clear socket path error, got %v", err)
	}
}

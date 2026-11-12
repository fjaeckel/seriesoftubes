package node

import (
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// sigs is a list of n signature entries (only their number matters to the cost).
func sigs(n int) []any {
	out := make([]any, n)
	for i := range out {
		out[i] = map[string]any{"key": "k", "sig": "s"}
	}
	return out
}

// bloatedEntry is a catalog entry with every signature the limits allow: a genesis, 64 chain
// records and a server record of 16 signers each, 1041 signatures to verify.
func bloatedEntry() map[string]any {
	ch := make([]any, 64)
	for i := range ch {
		ch[i] = map[string]any{"kind": "operators", "sigs": sigs(16)}
	}
	return map[string]any{"genesis": map[string]any{"kind": "genesis", "sig": "s"}, "chain": ch,
		"server": map[string]any{"kind": "server", "sigs": sigs(16)}, "path": []any{}, "seen": int64(0)}
}

// A node frame costs a token per signature it asks to verify: an entry with 1041 signatures costs
// over a thousand, not a flat 64, so pacing bounds the verifying a peer can ask for.
func TestNodeCostCountsSignatures(t *testing.T) {
	big := nodeCost(&wire.Frame{M: "catalog", Raw: map[string]any{"entries": []any{bloatedEntry()}}})
	if big < 1041 {
		t.Fatalf("an entry of 1041 signatures costs %v", big)
	}
	small := nodeCost(&wire.Frame{M: "catalog", Raw: map[string]any{"entries": []any{map[string]any{
		"genesis": map[string]any{"sig": "s"}, "chain": []any{}, "server": map[string]any{"sigs": sigs(1)}}}}})
	if small > 3 {
		t.Fatalf("a one-operator entry costs %v", small)
	}
	// Records and their receipts: one token per signature too.
	item := map[string]any{"rec": map[string]any{"sig": "s"}, "rcpt": []any{map[string]any{}, map[string]any{}}}
	if c := nodeCost(&wire.Frame{M: "push", Raw: map[string]any{"items": []any{item, item}}}); c != 1+2*3 {
		t.Fatalf("two records with two receipts each cost %v", c)
	}
	// At the node rate, a peer can make this node verify at most nodeRate signatures a second.
	perSec := nodeRate / big
	t.Logf("bloated entries a peer may send per second: %.1f (%.0f signatures)", perSec, perSec*1041)
}

// BenchmarkNodeCost: weighing a frame is cheap next to what it pays for (a signature check is
// about 40 µs; weighing the bloated entry visits 66 lists).
func BenchmarkNodeCost(b *testing.B) {
	f := &wire.Frame{M: "catalog", Raw: map[string]any{"entries": []any{bloatedEntry()}}}
	for b.Loop() {
		_ = nodeCost(f)
	}
}

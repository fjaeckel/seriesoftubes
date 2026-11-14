package fed

import (
	"crypto/ed25519"
	"testing"
)

// The identity point verifies (R = identity, S = 0) for any message: such keys are refused.
func TestWeakKeys(t *testing.T) {
	id := make([]byte, 32)
	id[0] = 1
	sig := make([]byte, 64)
	sig[0] = 1 // R: the identity; S: 0
	if !ed25519.Verify(ed25519.PublicKey(id), []byte("anything at all"), sig) {
		t.Fatal("expected Go to take the identity's forged signature (the reason for the check)")
	}
	if IsKey(Encode(id)) {
		t.Fatal("the identity is a key")
	}
	p := make([]byte, 32)
	for i := range p {
		p[i] = 0xff
	}
	p[31] = 0x7f
	for _, low := range []byte{0xec, 0xed, 0xee, 0xff} { // p - 1 (order 2), p, p + 1, 2^255 - 1
		k := append([]byte(nil), p...)
		k[0] = low
		if IsKey(Encode(k)) {
			t.Fatalf("y = %x...: a key", low)
		}
	}
	for _, w := range weakY {
		for _, sign := range []byte{0, 0x80} {
			k := w
			k[31] |= sign
			if IsKey(Encode(k[:])) {
				t.Fatalf("small-order %x: a key", k)
			}
		}
	}
	seed := make([]byte, 32)
	seed[0] = 7
	pub := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	if !IsKey(Encode(pub)) {
		t.Fatal("a real key refused")
	}
}

package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"errors"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Sealed deals as a game makes them (protocol 3.5): a box key derived from the network's seed, and
// offers and declines whose terms only the two parties can open. The relay never opens a box; the
// load test opens every one it receives, so a relay that changed a byte would show as a failure.

// boxKey derives a network's X25519 box key from its Ed25519 seed (3.5).
func boxKey(seed []byte) *ecdh.PrivateKey {
	d, err := hkdf.Key(sha256.New, seed, nil, "tubes-fed v1 box", 32)
	if err != nil {
		panic(err)
	}
	d[0] &= 248
	d[31] &= 127
	d[31] |= 64
	k, err := ecdh.X25519().NewPrivateKey(d)
	if err != nil {
		panic(err)
	}
	return k
}

// dealKey is the AES-256-GCM key between me and peer (whose box is peerBox) for one record kind.
func dealKey(mine *ecdh.PrivateKey, me, peer, peerBox, kind string) ([]byte, error) {
	pb, ok := fed.Decode(peerBox, 32)
	if !ok {
		return nil, errors.New("bad box key")
	}
	pk, err := ecdh.X25519().NewPublicKey(pb)
	if err != nil {
		return nil, err
	}
	shared, err := mine.ECDH(pk)
	if err != nil {
		return nil, err
	}
	lo, hi := me, peer
	if hi < lo {
		lo, hi = hi, lo
	}
	a, _ := fed.Decode(lo, 32)
	b, _ := fed.Decode(hi, 32)
	return hkdf.Key(sha256.New, shared, append(a, b...), "tubes-fed v1 "+kind, 32)
}

// boxAAD is the record without sig and its body without enc, as canonical JSON.
func boxAAD(rec map[string]any) []byte {
	env := map[string]any{}
	for k, v := range rec {
		if k != "sig" {
			env[k] = v
		}
	}
	body := map[string]any{}
	if b, ok := rec["body"].(map[string]any); ok {
		for k, v := range b {
			if k != "enc" {
				body[k] = v
			}
		}
	}
	env["body"] = body
	return canon.Encode(env)
}

func aead(key []byte) cipher.AEAD {
	b, err := aes.NewCipher(key)
	if err != nil {
		panic(err)
	}
	g, err := cipher.NewGCM(b)
	if err != nil {
		panic(err)
	}
	return g
}

// sealed signs a record of kind whose clear body is clear and whose sealed fields are plain,
// sealed for peer (key and box).
func sealed(k *fed.Signer, box *ecdh.PrivateKey, kind string, t int64, clear, plain map[string]any, peer, peerBox string) (map[string]any, error) {
	key, err := dealKey(box, k.Key, peer, peerBox, kind)
	if err != nil {
		return nil, err
	}
	env := map[string]any{"v": int64(fed.Version), "kind": kind, "key": k.Key, "t": t, "body": clear}
	n := make([]byte, fed.BoxNonce)
	if _, err := rand.Read(n); err != nil {
		return nil, err
	}
	c := aead(key).Seal(nil, n, canon.Encode(plain), boxAAD(env))
	body := map[string]any{"enc": map[string]any{"n": fed.Encode(n), "c": fed.Encode(c)}}
	for f, v := range clear {
		body[f] = v
	}
	return k.Seal(kind, t, body), nil
}

// open opens a sealed record (a loose tree as received) with my box key; it returns the plaintext.
func open(box *ecdh.PrivateKey, me string, rec map[string]any, peerBox string) (any, error) {
	author, _ := rec["key"].(string)
	kind, _ := rec["kind"].(string)
	body, _ := rec["body"].(map[string]any)
	enc, _ := body["enc"].(map[string]any)
	ns, _ := enc["n"].(string)
	cs, _ := enc["c"].(string)
	n, ok1 := fed.Decode(ns, fed.BoxNonce)
	c, ok2 := fed.Decode(cs, len(cs)*6/8)
	if !ok1 || !ok2 {
		return nil, errors.New("bad box")
	}
	key, err := dealKey(box, me, author, peerBox, kind)
	if err != nil {
		return nil, err
	}
	p, err := aead(key).Open(nil, n, c, boxAAD(rec))
	if err != nil {
		return nil, err
	}
	v, code := canon.ParseStrict(p)
	if code != "" {
		return nil, errors.New(code)
	}
	return v, nil
}

// recID is a single-signer record's id (3.3): SHA-256 of its canonical JSON.
func recID(rec map[string]any) string {
	h := sha256.Sum256(canon.Encode(rec))
	return fed.Encode(h[:])
}

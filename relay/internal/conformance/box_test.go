package conformance

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/hkdf"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Sealed deals (5.3). The relay never opens a box; this is the reference the games are held to.

// boxPriv is the X25519 private key from an Ed25519 seed (5.1): HKDF-SHA256, clamped.
func boxPriv(t *testing.T, seed []byte) *ecdh.PrivateKey {
	d, err := hkdf.Key(sha256.New, seed, nil, "tubes-fed v1 box", 32)
	if err != nil {
		t.Fatal(err)
	}
	d[0] &= 248
	d[31] &= 127
	d[31] |= 64
	k, err := ecdh.X25519().NewPrivateKey(d)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

// dealKey is the AES-256-GCM key between the seed's network and peer (whose box is peerBox) for
// one record kind; nil when the X25519 result is all zeros (a low-order box).
func dealKey(t *testing.T, seed []byte, me, peer, peerBox, kind string) []byte {
	pb, ok := fed.Decode(peerBox, 32)
	if !ok {
		t.Fatal("peer box")
	}
	pk, err := ecdh.X25519().NewPublicKey(pb)
	if err != nil {
		t.Fatal(err)
	}
	shared, err := boxPriv(t, seed).ECDH(pk)
	if err != nil {
		return nil
	}
	lo, hi := me, peer
	if hi < lo {
		lo, hi = hi, lo
	}
	a, _ := fed.Decode(lo, 32)
	b, _ := fed.Decode(hi, 32)
	k, err := hkdf.Key(sha256.New, shared, append(a, b...), "tubes-fed v1 "+kind, 32)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

// boxAAD: the record without sig, and its body without enc, as canonical JSON.
func boxAAD(rec map[string]any) []byte {
	env := map[string]any{}
	for k, v := range rec {
		if k != "sig" {
			env[k] = v
		}
	}
	body := map[string]any{}
	for k, v := range rec["body"].(map[string]any) {
		if k != "enc" {
			body[k] = v
		}
	}
	env["body"] = body
	return canon.Encode(env)
}

func gcm(t *testing.T, key []byte) cipher.AEAD {
	b, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	g, err := cipher.NewGCM(b)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func pubOf(seed []byte) string {
	return fed.Encode(ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey))
}

func init() {
	areas["box"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Seed     string          `json:"seed"`
			Peer     string          `json:"peer"`
			PeerBox  string          `json:"peerBox"`
			Envelope json.RawMessage `json:"envelope"`
			Plain    json.RawMessage `json:"plain"`
			Nonce    string          `json:"nonce"`
			Record   json.RawMessage `json:"record"`
			Kind     string          `json:"kind"`
			Author   string          `json:"author"`
			Body     json.RawMessage `json:"body"`
		}](t, in)
		seed, _ := hex.DecodeString(x.Seed)
		switch {
		case x.Kind != "": // what an opened offer or decline holds
			body := strict(t, x.Body)
			var code string
			if x.Kind == "decline" {
				code = fed.CheckDeclineReason(body)
			} else {
				code = fed.CheckOfferTerms(x.Author, body.(map[string]any))
			}
			return errOr(code, map[string]any{"ok": true})
		case x.Envelope != nil: // sealing
			env := strict(t, x.Envelope).(map[string]any)
			key := dealKey(t, seed, pubOf(seed), x.Peer, x.PeerBox, env["kind"].(string))
			n, _ := fed.Decode(x.Nonce, fed.BoxNonce)
			c := gcm(t, key).Seal(nil, n, canon.Encode(strict(t, x.Plain)), boxAAD(env))
			return map[string]any{"aad": string(boxAAD(env)), "key": hex.EncodeToString(key),
				"enc": map[string]any{"n": x.Nonce, "c": fed.Encode(c)}}
		case x.Record != nil: // opening
			rec := strict(t, x.Record).(map[string]any)
			enc := rec["body"].(map[string]any)["enc"].(map[string]any)
			key := dealKey(t, seed, pubOf(seed), x.Peer, x.PeerBox, rec["kind"].(string))
			n, _ := fed.Decode(enc["n"].(string), fed.BoxNonce)
			c, _ := fed.Decode(enc["c"].(string), len(enc["c"].(string))*6/8)
			if key == nil || n == nil || c == nil {
				return map[string]any{"ok": false}
			}
			p, err := gcm(t, key).Open(nil, n, c, boxAAD(rec))
			if err != nil {
				return map[string]any{"ok": false}
			}
			v, code := canon.ParseStrict(p)
			if code != "" {
				return map[string]any{"ok": false}
			}
			return map[string]any{"ok": true, "plain": v}
		default: // the box key from a seed
			return map[string]any{"box": fed.Encode(boxPriv(t, seed).PublicKey().Bytes())}
		}
	}
}

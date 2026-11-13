// Package fed holds the federation protocol's records: encoding, keys, signatures, ids,
// the envelope and every record kind (spec sections 1 to 6), and the constants (13).
package fed

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
)

// Error codes (7.2).
const (
	BadFrame     = "bad_frame"
	TooBig       = "too_big"
	BadJSON      = "bad_json"
	TooDeep      = "too_deep"
	BadNumber    = "bad_number"
	BadString    = "bad_string"
	BadName      = "bad_name"
	BadValue     = "bad_value"
	BadVersion   = "bad_version"
	BadKind      = "bad_kind"
	MissingField = "missing_field"
	UnknownField = "unknown_field"
	BadField     = "bad_field"
	BadKey       = "bad_key"
	BadSig       = "bad_sig"
	TooMany      = "too_many"
	Duplicate    = "duplicate"
	TooOld       = "too_old"
	TooNew       = "too_new"
	NotOperator  = "not_operator"
	NotNode      = "not_node"
	NoMajority   = "no_majority"
	BadChain     = "bad_chain"
	UnknownSrv   = "unknown_server"
	Shunned      = "shunned"
	Refused      = "refused"
	NotFound     = "not_found"
	Unsupported  = "unsupported"
	NotReady     = "not_ready"
	Policy       = "policy"
	RateLimited  = "rate_limited"
	BadChallenge = "bad_challenge"
	IDMismatch   = "id_mismatch"
	NoLogs       = "no_logs"
	LocalURL     = "local_url"
	NameTaken    = "name_taken"
	NoAnswer     = "no_answer"
	StaleTerms   = "stale_terms"
	BadTerms     = "bad_terms"
	NoTerms      = "no_terms"
	Declined     = "declined"
	Internal     = "internal"
)

// Times (13.1).
const (
	Earliest        = 1735689600
	Skew            = 600
	SlotLen         = 300
	WindowSlots     = 288
	CarryForward    = 604800
	ProofFresh      = 300
	PendingLife     = 1209600
	VoteLife        = 7776000
	ShunLift        = 604800
	VoterListed     = 2592000
	VoterAnswered   = 1209600
	GossipExpiry    = 604800
	OfferKept       = 2592000
	ReportKept      = 2592000
	QuietFading     = 604800
	QuietDark       = 3196800
	QuietForgotten  = 15552000
	TermsGrace      = 86400
	ShortestIXTerm  = 30
	Day             = 86400
	LeaveKept       = 180 * Day
	ClientFrame     = 65536
	NodeFrame       = 1048576
	MaxItems        = 256
	MaxSigners      = 16
	MaxInv          = 4096
	MaxPath         = 16
	MaxChain        = 64
	RegistryFileMax = 65536
	NewcomerDays    = 30  // a network is new for this many real days after it joined (10.10)
	NewcomerPrice   = 750 // per mille of the card price a newcomer pays (10.10)
	AutoPeers       = 64  // most registry servers one server syncs with automatically (10.9)
	AutoFallback    = 900 // seconds without a session before the higher identity of a pair dials too (10.9)
	StateLife       = 900 // a live state counts, and is kept in memory, until its t is this many seconds old (5.11)
)

// Version is the protocol version this document describes.
const Version = 1

// Subprotocol is the WebSocket subprotocol of version 1 framing.
const Subprotocol = "tubes-fed.1"

// Div is floor division (rounds toward minus infinity).
func Div(a, b int64) int64 {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// Slot is the 5-minute slot of t.
func Slot(t int64) int64 { return t - mod(t, SlotLen) }

func mod(a, b int64) int64 {
	m := a % b
	if m < 0 {
		m += b
	}
	return m
}

var b64 = base64.RawURLEncoding

// Decode decodes base64url without padding, refusing anything that does not round-trip.
func Decode(s string, n int) ([]byte, bool) {
	if len(s) != b64.EncodedLen(n) {
		return nil, false
	}
	b, err := b64.DecodeString(s)
	if err != nil || len(b) != n || b64.EncodeToString(b) != s {
		return nil, false
	}
	return b, true
}

// Encode is base64url without padding.
func Encode(b []byte) string { return b64.EncodeToString(b) }

// IsKey, IsSig and IsID check the format of 3.1.
func IsKey(s string) bool { _, ok := Decode(s, 32); return ok }
func IsSig(s string) bool { _, ok := Decode(s, 64); return ok }
func IsID(s string) bool  { _, ok := Decode(s, 32); return ok }

// Hash is base64url(SHA-256(b)): record ids.
func Hash(b []byte) string {
	h := sha256.Sum256(b)
	return Encode(h[:])
}

// Verify checks an Ed25519 signature given as protocol strings.
func Verify(key, sig string, msg []byte) bool {
	k, ok := Decode(key, 32)
	if !ok {
		return false
	}
	s, ok := Decode(sig, 64)
	if !ok {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(k), msg, s)
}

// ASN is the ASN the game shows for a key (3.4).
func ASN(key string) (int64, bool) {
	k, ok := Decode(key, 32)
	if !ok {
		return 0, false
	}
	h := sha256.Sum256(k)
	n := int64(binary.BigEndian.Uint32(h[:4]))
	return 4200000000 + n%94967295, true
}

// Signer holds a private key.
type Signer struct {
	priv ed25519.PrivateKey
	Key  string
}

// NewSigner makes a signer from a 32-byte seed.
func NewSigner(seed []byte) (*Signer, error) {
	if len(seed) != ed25519.SeedSize {
		return nil, errors.New("seed must be 32 bytes")
	}
	priv := ed25519.NewKeyFromSeed(seed)
	return &Signer{priv: priv, Key: Encode(priv.Public().(ed25519.PublicKey))}, nil
}

// Sign signs bytes.
func (s *Signer) Sign(msg []byte) string { return Encode(ed25519.Sign(s.priv, msg)) }

// Seal signs an unsigned single-signer object (adds sig) and returns the record.
func (s *Signer) Seal(kind string, t int64, body map[string]any) map[string]any {
	m := map[string]any{"v": int64(Version), "kind": kind, "key": s.Key, "t": t, "body": body}
	m["sig"] = s.Sign(canon.Encode(m))
	return m
}

// SealMulti makes a multi-signer object signed by the author alone.
func (s *Signer) SealMulti(kind string, t int64, body map[string]any) map[string]any {
	m := map[string]any{"v": int64(Version), "kind": kind, "key": s.Key, "t": t, "body": body}
	sig := s.Sign(canon.Encode(m))
	m["sigs"] = []any{map[string]any{"key": s.Key, "sig": sig}}
	return m
}

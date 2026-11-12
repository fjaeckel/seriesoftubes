package fed

import "github.com/fjaeckel/seriesoftubes/relay/internal/canon"

// MaxAuthKeys is how many keys one client session may prove (9.3 auth).
const MaxAuthKeys = 4

// AuthText is what a client signs to prove a key to one node of one server (9.3 auth): the canonical
// JSON of {m: "auth", key, node, server, t}. It has no kind, so it can never pass for a record,
// receipt or proof, and naming the node and server keeps it from being shown to any other.
func AuthText(key, node, server string, t int64) []byte {
	return canon.Encode(map[string]any{"m": "auth", "key": key, "node": node, "server": server, "t": t})
}

// Auth signs an auth for this key.
func (s *Signer) Auth(node, server string, t int64) string {
	return s.Sign(AuthText(s.Key, node, server, t))
}

// CheckAuth checks a client's auth against this node and server at now: "" or bad_key, bad_sig,
// too_old, too_new (the clock skew, 600 s, either way).
func CheckAuth(key string, t int64, sig, node, server string, now int64) string {
	if !IsKey(key) {
		return BadKey
	}
	if !IsSig(sig) || !Verify(key, sig, AuthText(key, node, server, t)) {
		return BadSig
	}
	if t > now+Skew {
		return TooNew
	}
	if t < now-Skew {
		return TooOld
	}
	return ""
}

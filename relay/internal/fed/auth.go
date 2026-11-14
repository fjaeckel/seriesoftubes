package fed

import (
	"slices"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
)

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

// AuthBoundText is what a client signs when the node's welcome listed FeatBind and gave a nonce
// (9.3 auth): the canonical JSON of {m: "auth", key, node, nonce, server, t, url}. The nonce is the
// one this session's welcome carried and url the URL the client dialled, so a server the client
// talks to cannot pass the auth on to another server's node, whose own session nonce and URL
// differ.
func AuthBoundText(key, node, server string, t int64, nonce, url string) []byte {
	return canon.Encode(map[string]any{"m": "auth", "key": key, "node": node, "nonce": nonce, "server": server, "t": t, "url": url})
}

// AuthBound signs a bound auth for this key.
func (s *Signer) AuthBound(node, server string, t int64, nonce, url string) string {
	return s.Sign(AuthBoundText(s.Key, node, server, t, nonce, url))
}

// CheckAuthBound checks a bound auth: as CheckAuth, and url must be one of urls (this node's own),
// signed together with nonce (the one this session's welcome carried). A url not this node's is
// bad_sig, as an auth signed for another node is.
func CheckAuthBound(key string, t int64, sig, node, server string, now int64, nonce, url string, urls []string) string {
	if !IsKey(key) {
		return BadKey
	}
	if !IsSig(sig) || nonce == "" || !slices.Contains(urls, url) || !Verify(key, sig, AuthBoundText(key, node, server, t, nonce, url)) {
		return BadSig
	}
	return authTime(t, now)
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
	return authTime(t, now)
}

func authTime(t, now int64) string {
	if t > now+Skew {
		return TooNew
	}
	if t < now-Skew {
		return TooOld
	}
	return ""
}

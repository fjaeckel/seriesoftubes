package fed

import "slices"

func only(kind string) Opts {
	return Opts{Allow: func(k string) bool { return k == kind }}
}

// ParseReceiptShape checks a receipt's envelope, size and body (no signature, no state).
func receiptShape(v any) (*Record, string) {
	r, code := envelope(v, only("receipt"))
	if code != "" {
		return nil, code
	}
	if len(r.Canon()) > kinds["receipt"].max {
		return nil, TooBig
	}
	if code := checkBody(r); code != "" {
		return nil, code
	}
	return r, ""
}

// CheckReceipt checks a receipt for a record (6.1): the server identity and its node keys.
func CheckReceipt(v any, rec *Record, server string, nodes []string, now int64) (*Record, string) {
	r, code := receiptShape(v)
	if code != "" {
		return nil, code
	}
	if r.T%SlotLen != 0 {
		return nil, BadField
	}
	if r.Str("rec") != rec.ID || r.Str("server") != server {
		return nil, BadField
	}
	if r.Has("cc") && (rec.Kind != "stats" || !rec.Bool("shareCountry")) {
		return nil, BadField
	}
	if !Verify(r.Key, r.Sig, r.Signed()) {
		return nil, BadSig
	}
	if r.T > now+Skew {
		return nil, TooNew
	}
	if !slices.Contains(nodes, r.Key) {
		return nil, NotNode
	}
	return r, ""
}

// ReceiptServer returns the server a receipt names, if it is shaped like one.
func ReceiptServer(v any) (string, string, bool) {
	r, code := receiptShape(v)
	if code != "" {
		return "", "", false
	}
	return r.Str("server"), r.Key, true
}

// MakeReceipt signs a receipt for a record received now from a client.
func (s *Signer) MakeReceipt(rec *Record, server string, now int64, country string) map[string]any {
	body := map[string]any{"rec": rec.ID, "server": server}
	if country != "" && rec.Kind == "stats" && rec.Bool("shareCountry") {
		body["cc"] = country
	}
	return s.Seal("receipt", Slot(now), body)
}

// MakeProof answers a challenge (6.2).
func (s *Signer) MakeProof(nonce, server string, now int64) map[string]any {
	return s.Seal("proof", now, map[string]any{"nonce": nonce, "server": server})
}

// CheckProof checks a proof against the challenge (6.2), in the spec's order.
func CheckProof(v any, nonce, server, node string, now int64) string {
	m, ok := v.(map[string]any)
	if !ok || m["kind"] != "proof" {
		return BadChallenge
	}
	r, code := envelope(v, only("proof"))
	if code != "" || len(r.Canon()) > kinds["proof"].max || checkBody(r) != "" {
		return BadChallenge
	}
	if r.Key != node || r.Str("server") != server {
		return BadChallenge
	}
	if !Verify(r.Key, r.Sig, r.Signed()) {
		return BadSig
	}
	d := r.T - now
	if r.Str("nonce") != nonce || d > ProofFresh || d < -ProofFresh {
		return BadChallenge
	}
	return ""
}

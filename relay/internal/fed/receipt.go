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
	if r.T%SlotLen != 0 || !ReceiptTimeOK(r.T, rec) {
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

// ReceiptTimeOK says whether a receipt's t fits its record's t (6.1). A node signs a receipt at
// slot(receive time) and takes a record only while rec.t <= now + Skew and its age is within the
// kind's maximum, so an honest receipt is never earlier than slot(rec.t) - Skew, nor later than
// rec.t plus that maximum. Anything else would move the record's board slot (10.1) to a time it
// never had: backfilled slots, or a fresh record dated more than 7 days back.
func ReceiptTimeOK(t int64, rec *Record) bool {
	if t < Slot(rec.T)-Skew {
		return false
	}
	age := kinds[rec.Kind].maxAge
	return age == 0 || t <= rec.T+age
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

// MakeProof answers a client's challenge (6.2). Its body names no checker, so it is never good
// for a node handshake with a peer that listed FeatBind.
func (s *Signer) MakeProof(nonce, server string, now int64) map[string]any {
	return s.Seal("proof", now, map[string]any{"nonce": nonce, "server": server})
}

// MakeBoundProof is a node handshake proof (6.2, 9.4) bound to the node that checks it (to) and
// to this side's role in the handshake: "answer" in a welcome, "call" in the caller's proof. A
// proof made for one checker or role is no good for another, so a node cannot be made to sign
// one that lets someone else pass as it.
func (s *Signer) MakeBoundProof(nonce, server, to, role string, now int64) map[string]any {
	return s.Seal("proof", now, map[string]any{"nonce": nonce, "server": server, "to": to, "role": role})
}

// Roles of a bound proof (6.2).
const (
	RoleAnswer = "answer"
	RoleCall   = "call"
)

// CheckProof checks a client challenge's proof (6.2), in the spec's order: a bound proof is
// refused, as the client asked for none.
func CheckProof(v any, nonce, server, node string, now int64) string {
	return checkProof(v, nonce, server, node, now, "", "", false)
}

// CheckNodeProof checks a node handshake proof (6.2, 9.4): bound to this node (to) and to the
// peer's role. legacy also takes an unbound proof, from a peer that did not list FeatBind.
func CheckNodeProof(v any, nonce, server, node string, now int64, to, role string, legacy bool) string {
	return checkProof(v, nonce, server, node, now, to, role, legacy)
}

func checkProof(v any, nonce, server, node string, now int64, to, role string, legacy bool) string {
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
	_, bound := r.Body["to"]
	switch {
	case bound && (to == "" || r.Str("to") != to || r.Str("role") != role):
		return BadChallenge
	case !bound && to != "" && !legacy:
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

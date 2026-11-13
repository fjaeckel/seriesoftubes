package fed

import (
	"net/netip"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// A check returns an error code or "".
type check func(v any) string

// field is one row of a body table.
type field struct {
	name string
	opt  bool
	fn   check
}

// object checks a map against a table, in table order, then refuses unknown members.
func object(v any, fields []field) string {
	m, ok := v.(map[string]any)
	if !ok {
		return BadField
	}
	for _, f := range fields {
		e, ok := m[f.name]
		if !ok {
			if f.opt {
				continue
			}
			return MissingField
		}
		if code := f.fn(e); code != "" {
			return code
		}
	}
	for k := range m {
		found := false
		for _, f := range fields {
			if f.name == k {
				found = true
				break
			}
		}
		if !found {
			return UnknownField
		}
	}
	return ""
}

func obj(fields ...field) check { return func(v any) string { return object(v, fields) } }

func req(name string, fn check) field { return field{name, false, fn} }
func opt(name string, fn check) field { return field{name, true, fn} }

func intIn(lo, hi int64) check {
	return func(v any) string {
		n, ok := v.(int64)
		if !ok || n < lo || n > hi {
			return BadField
		}
		return ""
	}
}

func count(n int64) check { return intIn(0, n) }

var (
	mbps  = intIn(0, 1000000000)
	money = intIn(0, 1000000000000)
	days  = intIn(1, 3650)
)

func boolean(v any) string {
	if _, ok := v.(bool); !ok {
		return BadField
	}
	return ""
}

func oneOf(vals ...string) check {
	return func(v any) string {
		s, ok := v.(string)
		if !ok {
			return BadField
		}
		for _, x := range vals {
			if s == x {
				return ""
			}
		}
		return BadField
	}
}

func keyCheck(v any) string {
	s, _ := v.(string)
	if !IsKey(s) {
		return BadKey
	}
	return ""
}

func idCheck(v any) string {
	s, _ := v.(string)
	if !IsID(s) {
		return BadField
	}
	return ""
}

func hasBidi(s string) bool {
	for _, r := range s {
		if r >= 0x202A && r <= 0x202E || r >= 0x2066 && r <= 0x2069 {
			return true
		}
	}
	return false
}

// textCheck is Text(n) (lo 0) or Label(n) (lo 1).
func textCheck(lo, hi int) check {
	return func(v any) string {
		s, ok := v.(string)
		if !ok {
			return BadField
		}
		n := utf8.RuneCountInString(s)
		if n < lo || n > hi || hasBidi(s) {
			return BadField
		}
		return ""
	}
}

// NameOK is the Name type: 1 to 40 code points, not only spaces, no bidi controls.
func NameOK(s string) bool {
	n := utf8.RuneCountInString(s)
	return n >= 1 && n <= 40 && strings.Trim(s, " ") != "" && !hasBidi(s)
}

func nameCheck(v any) string {
	s, ok := v.(string)
	if !ok || !NameOK(s) {
		return BadField
	}
	return ""
}

var (
	cityRe = regexp.MustCompile(`^[a-z0-9]{2,8}$`)
	ccRe   = regexp.MustCompile(`^[A-Z]{2}$`)
	langRe = regexp.MustCompile(`^[a-z]{2}$`)
	urlRe  = regexp.MustCompile(`^wss://([a-z0-9.-]+|\[[0-9a-f:]+\])(:([0-9]+))?(/[A-Za-z0-9._~/-]*)?$`)
	label  = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)
)

// IsCity reports whether s is a game city id.
func IsCity(s string) bool { return cityRe.MatchString(s) }

func reCheck(re *regexp.Regexp) check {
	return func(v any) string {
		s, ok := v.(string)
		if !ok || !re.MatchString(s) {
			return BadField
		}
		return ""
	}
}

var (
	city = reCheck(cityRe)
	cc   = reCheck(ccRe)
)

// URLOK is the Url type of section 5: a host name with a dot, or a local address (LocalAddr).
func URLOK(s string) bool {
	host, ok := urlHost(s)
	if !ok {
		return false
	}
	if a, err := netip.ParseAddr(strings.Trim(host, "[]")); err == nil || host[0] == '[' {
		return err == nil && host == addrText(a) && LocalAddr(a)
	}
	if allDigitsAndDots(host) {
		return false // a malformed or non-canonical IPv4 literal (010.0.0.1, 10.1)
	}
	labels := strings.Split(host, ".")
	if len(labels) < 2 {
		return false
	}
	for _, l := range labels {
		if !label.MatchString(l) {
			return false
		}
	}
	return true
}

// PublicURL reports whether a Url names a host anyone on the internet can look up: not an IP
// literal and not an mDNS name (.local). The registry lists only those (11.2 step 6).
func PublicURL(s string) bool {
	host, ok := urlHost(s)
	if !ok || !URLOK(s) {
		return false
	}
	if _, err := netip.ParseAddr(strings.Trim(host, "[]")); err == nil {
		return false
	}
	return !strings.HasSuffix(host, ".local")
}

// LocalAddr reports whether an address is one a Url may name directly (section 5): private
// IPv4 (10/8, 172.16/12, 192.168/16), IPv4 link-local (169.254/16), loopback (127/8, ::1)
// and IPv6 unique local addresses (fc00::/7). Never one reachable from the internet.
func LocalAddr(a netip.Addr) bool {
	if a.Zone() != "" || a.Is4In6() {
		return false
	}
	if a.Is4() {
		return a.IsPrivate() || a.IsLoopback() || a.IsLinkLocalUnicast()
	}
	return a.IsLoopback() || a.IsPrivate()
}

// addrText is how a Url writes an address: dotted decimal, or RFC 5952 IPv6 in brackets.
func addrText(a netip.Addr) string {
	if a.Is6() {
		return "[" + a.String() + "]"
	}
	return a.String()
}

func allDigitsAndDots(h string) bool {
	for _, c := range h {
		if (c < '0' || c > '9') && c != '.' {
			return false
		}
	}
	return true
}

// urlHost checks the length, the characters, the shape and the port, and returns the host.
func urlHost(s string) (string, bool) {
	if len(s) > 200 {
		return "", false
	}
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			return "", false
		}
	}
	m := urlRe.FindStringSubmatch(s)
	if m == nil {
		return "", false
	}
	if m[2] != "" {
		p := m[3]
		if p == "" || p[0] == '0' {
			return "", false
		}
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > 65535 {
			return "", false
		}
	}
	return m[1], true
}

func urlCheck(v any) string {
	s, ok := v.(string)
	if !ok || !URLOK(s) {
		return BadField
	}
	return ""
}

// list checks [T] with lo..hi entries; set entries must be unique.
func list(of check, lo, hi int, set bool) check {
	return func(v any) string {
		a, ok := v.([]any)
		if !ok {
			return BadField
		}
		if len(a) > hi {
			return TooMany
		}
		if len(a) < lo {
			return BadField
		}
		seen := map[string]bool{}
		for _, e := range a {
			if code := of(e); code != "" {
				return code
			}
			if set {
				k := setKey(e)
				if seen[k] {
					return Duplicate
				}
				seen[k] = true
			}
		}
		return ""
	}
}

func setKey(e any) string {
	switch x := e.(type) {
	case string:
		return x
	case map[string]any:
		if k, ok := x["key"].(string); ok {
			return k
		}
		if a, ok := x["a"].(string); ok {
			if b, ok := x["b"].(string); ok {
				return a + "|" + b
			}
		}
	}
	return "\x00"
}

// sortedSet: entries sorted by key in byte order (bad_field) and unique (duplicate).
func sortedSet(of check, lo, hi int) check {
	return func(v any) string {
		a, ok := v.([]any)
		if !ok {
			return BadField
		}
		if len(a) > hi {
			return TooMany
		}
		if len(a) < lo {
			return BadField
		}
		for i, e := range a {
			if code := of(e); code != "" {
				return code
			}
			if i > 0 {
				p, c := setKey(a[i-1]), setKey(e)
				if p == c {
					return Duplicate
				}
				if c < p {
					return BadField
				}
			}
		}
		return ""
	}
}

// ascending: a list of objects with strictly ascending mbps.
func ascending(of check, lo, hi int) check {
	inner := list(of, lo, hi, false)
	return func(v any) string {
		if code := inner(v); code != "" {
			return code
		}
		a := v.([]any)
		for i := 1; i < len(a); i++ {
			if a[i].(map[string]any)["mbps"].(int64) <= a[i-1].(map[string]any)["mbps"].(int64) {
				return BadField
			}
		}
		return ""
	}
}

var cities16 = list(city, 1, 16, true)

var port = obj(req("mbps", mbps), req("monthly", money))

// waveGbps: the wave sizes a rate card or an offer may name.
func waveGbps(v any) string {
	if n, ok := v.(int64); ok && (n == 100 || n == 400 || n == 800 || n == 1600) {
		return ""
	}
	return BadField
}

// ordered: an object whose cities a and b are in byte order (a wave route has one spelling).
func ordered(inner check) check {
	return func(v any) string {
		if code := inner(v); code != "" {
			return code
		}
		m := v.(map[string]any)
		if !(m["a"].(string) < m["b"].(string)) {
			return BadField
		}
		return ""
	}
}

// ascendingBy: a list of objects with strictly ascending integer field f.
func ascendingBy(of check, lo, hi int, f string) check {
	inner := list(of, lo, hi, false)
	return func(v any) string {
		if code := inner(v); code != "" {
			return code
		}
		a := v.([]any)
		for i := 1; i < len(a); i++ {
			if a[i].(map[string]any)[f].(int64) <= a[i-1].(map[string]any)[f].(int64) {
				return BadField
			}
		}
		return ""
	}
}

var waveRoute = ordered(obj(req("a", city), req("b", city)))

var rates = obj(
	opt("transit", obj(
		req("perGbps", money),
		req("commit", ascending(obj(req("mbps", mbps), req("off", count(900))), 0, 8)),
		req("term", days),
	)),
	opt("pni", obj(
		req("setup", money),
		req("ports", ascending(port, 1, 8)),
		req("term", days),
	)),
	opt("ix", obj(
		req("ports", ascending(port, 1, 8)),
		req("join", oneOf("anyone", "selective", "approval")),
		req("at", cities16),
	)),
	opt("wave", obj(
		req("routes", list(waveRoute, 1, 32, true)),
		req("sizes", ascendingBy(obj(req("gbps", waveGbps), req("monthly", money)), 1, 4, "gbps")),
		req("term", days),
	)),
)

var auto = func() check {
	a := oneOf("auto", "review", "decline")
	// wave is optional: announces from before wave deals (absent: wave requests are declined).
	return obj(req("peering", a), req("transit", a), req("pni", a), req("swap", a), req("consortium", a), req("port", a), opt("wave", a))
}()

var cond = obj(
	req("minMbps", mbps), req("maxRatio", intIn(100, 100000)), req("minShared", count(64)),
	req("rpki", boolean), req("tier1", boolean), req("ai", boolean),
)

func checkAnnounce(r *Record) string {
	asn, _ := ASN(r.Key)
	policy, _ := r.Body["policy"].(string)
	condCheck := func(v any) string {
		if policy != "selective" {
			return BadField
		}
		return cond(v)
	}
	code := object(r.Body, []field{
		req("name", nameCheck),
		req("asn", func(v any) string {
			if n, ok := v.(int64); !ok || n != asn {
				return BadField
			}
			return ""
		}),
		req("box", keyCheck),
		req("home", cc),
		req("day", count(10000000)),
		req("founded", intIn(0, Div(r.T, Day))),
		req("pops", list(city, 0, 512, true)),
		req("ix", func(v any) string {
			if code := list(city, 0, 512, true)(v); code != "" {
				return code
			}
			pops := map[string]bool{}
			for _, p := range strs(r.Body["pops"]) {
				pops[p] = true
			}
			for _, x := range strs(v) {
				if !pops[x] {
					return BadField
				}
			}
			return ""
		}),
		req("cust", count(10000000)),
		req("mix", func(v any) string {
			c := count(1000)
			if code := object(v, []field{req("content", c), req("eyeball", c), req("enterprise", c)}); code != "" {
				return code
			}
			m := v.(map[string]any)
			if m["content"].(int64)+m["eyeball"].(int64)+m["enterprise"].(int64) != 1000 {
				return BadField
			}
			return ""
		}),
		req("traffic", obj(req("in", mbps), req("out", mbps))),
		req("policy", oneOf("open", "selective", "restrictive")),
		opt("cond", condCheck),
		req("rates", rates),
		req("auto", auto),
	})
	if code != "" {
		return code
	}
	if _, ok := r.Body["cond"]; !ok && policy == "selective" {
		return MissingField
	}
	return ""
}

// Most transit customers and upstreams a stats record lists (5.2).
const (
	MaxCust = 128
	MaxUp   = 16
)

func checkStats(r *Record) string {
	// others is a set of other networks' keys: never the author's own.
	others := func(n int) check {
		return list(func(v any) string {
			if code := keyCheck(v); code != "" {
				return code
			}
			if v == r.Key {
				return BadField
			}
			return ""
		}, 0, n, true)
	}
	return object(r.Body, []field{
		req("mode", oneOf("normal", "sandbox", "open_gates", "puzzle", "scenario", "weekly", "architect")),
		req("pops", func(v any) string {
			m, ok := v.(map[string]any)
			if !ok {
				return BadField
			}
			if len(m) > 512 {
				return TooMany
			}
			for k, n := range m {
				if !IsCity(k) {
					return BadField
				}
				if code := intIn(1, 1000)(n); code != "" {
					return code
				}
			}
			return ""
		}),
		opt("pies", count(10000000)),
		req("traffic", list(func(v any) string {
			if code := object(v, []field{req("key", keyCheck), req("in", mbps), req("out", mbps)}); code != "" {
				return code
			}
			if v.(map[string]any)["key"] == r.Key {
				return BadField
			}
			return ""
		}, 0, 256, true)),
		opt("total", mbps),
		opt("cust", others(MaxCust)),
		opt("up", others(MaxUp)),
		req("tier1", boolean),
		opt("tier2", boolean),
		opt("ai", obj(req("model", textCheck(1, 64)), req("harness", textCheck(1, 64)))),
		req("shareCountry", boolean),
	})
}

// founded (optional on priced deals): the buyer claims the newcomer price (10.10).
var dealTerms = map[string]check{
	"peering": obj(req("at", cities16), req("via", oneOf("ix", "pni"))),
	"transit": obj(req("mbps", mbps), req("perGbps", money), req("term", days), req("at", cities16), opt("founded", count(10000000))),
	"pni":     obj(req("at", city), req("mbps", mbps), req("setup", money), req("monthly", money), req("term", days), opt("founded", count(10000000))),
	"port":    obj(req("at", city), req("mbps", mbps), req("monthly", money), req("term", days), opt("founded", count(10000000))),
	"swap": func() check {
		leg := obj(req("a", city), req("b", city), req("mbps", mbps))
		return obj(req("give", leg), req("take", leg), req("term", days))
	}(),
	"wave": ordered(obj(req("a", city), req("b", city), req("gbps", waveGbps), req("monthly", money), req("term", days), opt("founded", count(10000000)))),
	"consortium": obj(req("name", nameCheck), req("a", city), req("b", city), req("members", intIn(2, 16)),
		req("share", money), req("pairs", intIn(1, 16))),
}

// Box limits (5.3): a 12-byte AES-GCM nonce, and a ciphertext of at least one byte plus the 16-byte tag.
const (
	BoxNonce = 12
	BoxMin   = 17
	BoxMax   = 2048
)

// bytesCheck: base64url (3.1) of lo to hi bytes.
func bytesCheck(lo, hi int) check {
	return func(v any) string {
		s, ok := v.(string)
		if !ok || len(s) > b64.EncodedLen(hi) {
			return BadField
		}
		if b, err := b64.DecodeString(s); err != nil || len(b) < lo || b64.EncodeToString(b) != s {
			return BadField
		}
		return ""
	}
}

// encCheck is the Box type of 5.3: {n, c}, which only the two parties of a deal can open. A relay
// checks its shape, never what is inside.
var encCheck = obj(req("n", bytesCheck(BoxNonce, BoxNonce)), req("c", bytesCheck(BoxMin, BoxMax)))

// notSelfKey: a Key that is not the author's own.
func notSelfKey(author string) check {
	return func(v any) string {
		if code := keyCheck(v); code != "" {
			return code
		}
		if v == author {
			return BadField
		}
		return ""
	}
}

// checkOffer: an offer to someone is sealed, with only to and the box in clear; an offer without
// to is a consortium project open to anyone, in clear (5.3).
func checkOffer(r *Record) string {
	if _, ok := r.Body["to"]; ok {
		return object(r.Body, []field{req("to", notSelfKey(r.Key)), req("enc", encCheck)})
	}
	return CheckOfferTerms(r.Key, r.Body)
}

// CheckOfferTerms checks an offer in clear (5.3): an open consortium project as it travels, or
// what a sealed offer holds once opened, together with its to. author is the offer's key.
func CheckOfferTerms(author string, body map[string]any) string {
	deal, _ := body["deal"].(string)
	toField := req("to", notSelfKey(author))
	if deal == "consortium" {
		toField.opt = true
	}
	basis := req("basis", idCheck)
	switch deal {
	case "swap":
		basis.opt = true
	case "consortium":
		basis = opt("basis", func(any) string { return BadField })
	}
	terms := func(v any) string {
		fn, ok := dealTerms[deal]
		if !ok {
			return BadField
		}
		return fn(v)
	}
	return object(body, []field{
		toField,
		req("deal", oneOf("peering", "transit", "pni", "swap", "consortium", "port", "wave")),
		basis,
		opt("renews", idCheck),
		req("terms", terms),
	})
}

// CheckDeclineReason checks what a sealed decline holds once opened (5.3): {reason}.
func CheckDeclineReason(v any) string {
	return obj(req("reason", oneOf("declined", "conditions", "depeer", "excluded", "quiet")))(v)
}

func hideCheck(r *Record) string {
	keys := list(keyCheck, 0, 512, true)
	code := object(r.Body, []field{req("server", idCheck), req("hide", keys), req("names", keys), req("refuse", keys)})
	if code != "" {
		return code
	}
	if len(strs(r.Body["hide"]))+len(strs(r.Body["names"]))+len(strs(r.Body["refuse"])) > 512 {
		return TooMany
	}
	return ""
}

var node = obj(req("key", keyCheck), req("url", urlCheck))

func checkBody(r *Record) string {
	switch r.Kind {
	case "announce":
		return checkAnnounce(r)
	case "stats", "state":
		return checkStats(r) // a live state holds the fields of a stats record (5.11)
	case "offer":
		return checkOffer(r)
	case "accept":
		return object(r.Body, []field{req("offer", idCheck), req("to", keyCheck)})
	case "decline":
		// The reason is sealed for the offer's author (5.3).
		return object(r.Body, []field{req("offer", idCheck), req("to", keyCheck), req("enc", encCheck)})
	case "genesis":
		return object(r.Body, []field{req("name", nameCheck), req("node", node)})
	case "operators":
		action, _ := r.Body["action"].(string)
		u := req("url", urlCheck)
		if action != "set_node" {
			u = opt("url", func(any) string { return BadField })
		}
		return object(r.Body, []field{
			req("server", idCheck), req("prev", idCheck),
			req("action", oneOf("add_operator", "remove_operator", "set_node", "remove_node")),
			req("target", keyCheck), u,
		})
	case "server":
		return object(r.Body, []field{
			req("server", idCheck), req("head", idCheck), req("name", nameCheck),
			req("nodes", sortedSet(node, 1, 16)),
			req("operators", sortedSet(keyCheck, 1, 16)),
			req("sync", oneOf("standalone", "selective", "open")),
			req("noLogs", boolean),
			req("langs", list(reCheck(langRe), 0, 8, true)),
			req("desc", textCheck(0, 280)),
		})
	case "hide":
		return hideCheck(r)
	case "shun":
		return object(r.Body, []field{req("server", idCheck), req("target", keyCheck),
			req("reason", oneOf("cheating", "offensive_name", "spam", "abuse"))})
	case "unshun":
		return object(r.Body, []field{req("server", idCheck), req("target", keyCheck)})
	case "leave":
		return object(r.Body, nil)
	case "report":
		// A player's report to its server's operators (5.10): a pre-made reason, never about itself.
		return object(r.Body, []field{req("server", idCheck), req("target", notSelfKey(r.Key)),
			req("reason", oneOf("cheating", "offensive_name", "spam", "abuse"))})
	case "receipt":
		return object(r.Body, []field{req("rec", idCheck), req("server", idCheck), opt("cc", cc)})
	case "proof":
		return object(r.Body, []field{req("nonce", idCheck), req("server", idCheck)})
	}
	return BadKind
}

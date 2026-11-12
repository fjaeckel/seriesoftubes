// Package deals checks an offer against the published terms it relies on (spec 10.10).
// The relay cannot enforce it: offers to someone travel sealed (5.3), so only the two games
// read the terms and apply this rule after opening them. It is here as the reference both
// implementations are held to by the deals vectors.
package deals

import (
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

// Announce is the part of an announce the rule needs.
type Announce struct {
	ID   string
	Kind string
	Key  string
	T    int64
	Body map[string]any
}

// Offer is an offer record.
type Offer struct {
	ID   string
	Key  string
	T    int64
	Body map[string]any
}

// Running is the deal a renewal renews.
type Running struct {
	ID    string
	Start int64
	End   int64
}

// Result of the check. Start and End are nil while not binding or without an end.
type Result struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
	Auto  bool   `json:"auto"`
	Start *int64 `json:"start"`
	End   *int64 `json:"end"`
}

func fail(code string) Result { return Result{Error: code} }

// Check checks an offer; accept is the accept's t when there is one.
func Check(anns []Announce, o Offer, accept *int64, renews *Running) Result {
	to, _ := o.Body["to"].(string)
	deal, _ := o.Body["deal"].(string)
	basisID, hasBasis := o.Body["basis"].(string)
	terms, _ := o.Body["terms"].(map[string]any)
	var basis *Announce
	if hasBasis {
		for i := range anns {
			if anns[i].ID == basisID {
				basis = &anns[i]
			}
		}
		if basis == nil {
			return fail(fed.NotFound)
		}
		if basis.Kind != "announce" || basis.Key != to {
			return fail(fed.BadField)
		}
		if basis.T > o.T {
			return fail(fed.BadField)
		}
		var next *Announce
		for i := range anns {
			a := &anns[i]
			if a.Kind == "announce" && a.Key == to && a.T > basis.T && (next == nil || a.T < next.T) {
				next = a
			}
		}
		if next != nil && next.T <= o.T-fed.TermsGrace {
			return fail(fed.StaleTerms)
		}
	}
	isAuto := false
	if basis != nil {
		autoMap, _ := basis.Body["auto"].(map[string]any)
		mode, ok := autoMap[deal].(string)
		if mode == "decline" || !ok {
			return fail(fed.Declined)
		}
		isAuto = mode == "auto"
		rates, _ := basis.Body["rates"].(map[string]any)
		price := func(p int64) int64 { return p }
		if f, ok := terms["founded"].(int64); ok {
			// The newcomer price: the buyer joined less than 30 days before the offer, the seller did not.
			d := fed.Div(o.T, fed.Day)
			bf, ok := basis.Body["founded"].(int64)
			if d-f < 0 || d-f >= fed.NewcomerDays || !ok || d-bf < fed.NewcomerDays {
				return fail(fed.BadTerms)
			}
			price = func(p int64) int64 { return fed.Div(p*fed.NewcomerPrice, 1000) }
		}
		if code := checkTerms(deal, terms, rates, price); code != "" {
			return fail(code)
		}
	}
	res := Result{OK: true, Auto: isAuto}
	var start int64
	switch {
	case isAuto:
		start = o.T
	case accept != nil:
		start = *accept
	default:
		return res
	}
	if renews != nil && renews.End > start {
		start = renews.End
	}
	res.Start = &start
	if term, ok := terms["term"].(int64); ok {
		end := start + term*fed.Day
		res.End = &end
	}
	return res
}

func obj(v any) map[string]any { m, _ := v.(map[string]any); return m }
func num(v any) int64          { n, _ := v.(int64); return n }

func ports(v any) []map[string]any {
	a, _ := v.([]any)
	out := make([]map[string]any, 0, len(a))
	for _, e := range a {
		out = append(out, obj(e))
	}
	return out
}

// checkTerms compares the terms with the card; price maps a card price to what this buyer pays.
func checkTerms(deal string, terms, rates map[string]any, price func(int64) int64) string {
	switch deal {
	case "transit":
		r := obj(rates["transit"])
		if r == nil {
			return fed.NoTerms
		}
		mbps := num(terms["mbps"])
		var off, tier int64 = 0, -1
		for _, c := range ports(r["commit"]) {
			if m := num(c["mbps"]); m <= mbps && m > tier {
				tier, off = m, num(c["off"])
			}
		}
		if num(terms["perGbps"]) != price(fed.Div(num(r["perGbps"])*(1000-off), 1000)) || num(terms["term"]) < num(r["term"]) {
			return fed.BadTerms
		}
	case "pni":
		r := obj(rates["pni"])
		if r == nil {
			return fed.NoTerms
		}
		for _, p := range ports(r["ports"]) {
			if num(p["mbps"]) == num(terms["mbps"]) {
				if num(terms["setup"]) == price(num(r["setup"])) && num(terms["monthly"]) == price(num(p["monthly"])) &&
					num(terms["term"]) >= num(r["term"]) {
					return ""
				}
				return fed.BadTerms
			}
		}
		return fed.BadTerms
	case "port":
		r := obj(rates["ix"])
		if r == nil {
			return fed.NoTerms
		}
		at, _ := terms["at"].(string)
		found := false
		atList, _ := r["at"].([]any)
		for _, c := range atList {
			if c == at {
				found = true
			}
		}
		if !found {
			return fed.BadTerms
		}
		for _, p := range ports(r["ports"]) {
			if num(p["mbps"]) == num(terms["mbps"]) {
				if num(terms["monthly"]) == price(num(p["monthly"])) && num(terms["term"]) >= fed.ShortestIXTerm {
					return ""
				}
				return fed.BadTerms
			}
		}
		return fed.BadTerms
	case "wave":
		r := obj(rates["wave"])
		if r == nil {
			return fed.NoTerms
		}
		a, _ := terms["a"].(string)
		b, _ := terms["b"].(string)
		found := false
		for _, x := range ports(r["routes"]) {
			if x["a"] == a && x["b"] == b {
				found = true
			}
		}
		if !found {
			return fed.BadTerms
		}
		for _, p := range ports(r["sizes"]) {
			if num(p["gbps"]) == num(terms["gbps"]) {
				if num(terms["monthly"]) == price(num(p["monthly"])) && num(terms["term"]) >= num(r["term"]) {
					return ""
				}
				return fed.BadTerms
			}
		}
		return fed.BadTerms
	}
	return ""
}

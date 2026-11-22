// Package authority reads seriesoftub.es's authority file (FEDERATION-PROTOCOL.md 11.5, ADR 0006): the networks and
// servers it bans and the oldest relay allowed, signed by a key pinned here.
package authority

import (
	"bytes"
	_ "embed"
	"encoding/json"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
)

// keysJSON is federation/authority-keys.json, copied here because embed cannot reach outside the module (a test
// checks they match).
//
//go:embed keys.json
var keysJSON []byte

// Name is the only implementation relayMin is measured against.
const Name = update.Name

// Keys are the pinned authority keys: at most 4, each a valid Key; a malformed file pins none.
func Keys() []string {
	var k []string
	if json.Unmarshal(keysJSON, &k) != nil || len(k) > 4 {
		return nil
	}
	for _, x := range k {
		if !fed.IsKey(x) {
			return nil
		}
	}
	return k
}

// Authority is a checked authority file.
type Authority struct {
	T        int64
	RelayMin string            // "" when unset
	From     int64             // when RelayMin applies
	Nets     map[string]string // banned network key -> reason
	Servers  map[string]string // banned server identity -> reason
	Raw      []byte            // the file as read, to keep on disk
}

// Parse checks an authority file against keys at now.
func Parse(text []byte, keys []string, now int64) (*Authority, string) {
	text = Trim(text)
	r, code := fed.CheckAuthority(text, keys, now)
	if code != "" {
		return nil, code
	}
	a := &Authority{T: r.T, RelayMin: r.Str("relayMin"), From: r.Int("relayMinFrom"), Nets: map[string]string{}, Servers: map[string]string{},
		Raw: append([]byte(nil), text...)}
	for _, x := range r.Body["nets"].([]any) {
		m := x.(map[string]any)
		a.Nets[m["key"].(string)] = m["reason"].(string)
	}
	for _, x := range r.Body["servers"].([]any) {
		m := x.(map[string]any)
		a.Servers[m["id"].(string)] = m["reason"].(string)
	}
	return a, ""
}

// Trim drops the JSON whitespace around a file (a trailing newline), which a frame's string cannot carry (2.1).
func Trim(text []byte) []byte { return bytes.Trim(text, " \t\r\n") }

// Newer reports whether b should replace a: the greatest t wins, an equal t changes nothing (11.5).
func Newer(a, b *Authority) bool { return b != nil && (a == nil || b.T > a.T) }

// BansNet reports whether a network is banned.
func (a *Authority) BansNet(key string) bool {
	if a == nil {
		return false
	}
	_, ok := a.Nets[key]
	return ok
}

// BansServer reports whether a server is banned.
func (a *Authority) BansServer(id string) bool {
	if a == nil {
		return false
	}
	_, ok := a.Servers[id]
	return ok
}

// Applies reports whether relayMin counts at now.
func (a *Authority) Applies(now int64) bool { return a != nil && a.RelayMin != "" && now >= a.From }

// OutOfDate reports whether a node running impl is out of date at now: no impl, another implementation, or a
// version that is not a semantic version or is below relayMin (11.5).
func (a *Authority) OutOfDate(impl *update.Impl, now int64) bool {
	if !a.Applies(now) {
		return false
	}
	if impl == nil || impl.Name != Name {
		return true
	}
	v, ok := update.Parse(impl.Version)
	if !ok {
		return true
	}
	min, _ := update.Parse(a.RelayMin)
	return v.Cmp(min) < 0
}

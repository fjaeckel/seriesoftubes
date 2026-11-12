// Package canon reads JSON text the way the federation protocol requires (section 2.2)
// and writes canonical JSON (section 2.3). It never uses encoding/json for output.
package canon

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// Error codes of section 7.2 that parsing and value checks produce.
const (
	BadJSON   = "bad_json"
	BadString = "bad_string"
	BadNumber = "bad_number"
	BadName   = "bad_name"
	BadValue  = "bad_value"
	TooDeep   = "too_deep"
)

// MaxSafe is 2^53 - 1.
const MaxSafe = 9007199254740991

// MaxDepth of a record.
const MaxDepth = 8

// Num is a JSON number as written, before the integer rule is applied.
type Num string

// Lone is a string that held a lone surrogate escape; it is never a valid value.
type Lone string

// Parse reads JSON text into a loose tree: map[string]any, []any, string, Lone, Num, bool, nil.
// It only fails with bad_json. Repeated member names: the last wins.
func Parse(b []byte) (any, string) {
	v, _, code := parse(b)
	return v, code
}

func parse(b []byte) (any, bool, string) {
	if !utf8.Valid(b) || !json.Valid(b) {
		return nil, false, BadJSON
	}
	p := parser{b: b}
	p.ws()
	v, ok := p.value()
	if !ok {
		return nil, false, BadJSON
	}
	p.ws()
	if p.i != len(p.b) {
		return nil, false, BadJSON
	}
	return v, p.lone, ""
}

// ParseStrict reads a record text: JSON (2.2) then the value rules (2.1).
func ParseStrict(b []byte) (any, string) {
	v, lone, code := parse(b)
	if code != "" {
		return nil, code
	}
	if lone {
		return nil, BadString
	}
	return Check(v)
}

// Check applies the value rules of 2.1 to a loose tree and returns the strict value:
// map[string]any, []any, string, int64, bool.
func Check(v any) (any, string) {
	return check(v, 1)
}

func check(v any, depth int) (any, string) {
	switch v.(type) {
	case map[string]any, []any:
		if depth > MaxDepth {
			return nil, TooDeep
		}
	}
	switch x := v.(type) {
	case nil:
		return nil, BadValue
	case bool:
		return x, ""
	case string:
		if !goodString(x) {
			return nil, BadString
		}
		return x, ""
	case Lone:
		return nil, BadString
	case Num:
		n, ok := Int(x)
		if !ok {
			return nil, BadNumber
		}
		return n, ""
	case int64:
		if x > MaxSafe || x < -MaxSafe {
			return nil, BadNumber
		}
		return x, ""
	case int:
		return check(int64(x), depth)
	case map[string]any:
		out := make(map[string]any, len(x))
		// Check members in a fixed order so the same input always gives the same code.
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if !GoodName(k) {
				return nil, BadName
			}
			e, code := check(x[k], depth+1)
			if code != "" {
				return nil, code
			}
			out[k] = e
		}
		return out, ""
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			c, code := check(e, depth+1)
			if code != "" {
				return nil, code
			}
			out[i] = c
		}
		return out, ""
	}
	return nil, BadValue
}

// Int converts a number literal by the rule of 2.2: a finite, integral, safe double, not -0.
func Int(n Num) (int64, bool) {
	f, err := strconv.ParseFloat(string(n), 64)
	if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
		return 0, false
	}
	if f != math.Trunc(f) || math.Abs(f) > MaxSafe {
		return 0, false
	}
	if f == 0 && math.Signbit(f) {
		return 0, false
	}
	return int64(f), true
}

// GoodName reports whether s matches ^[A-Za-z0-9_]{1,32}$.
func GoodName(s string) bool {
	if len(s) < 1 || len(s) > 32 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_') {
			return false
		}
	}
	return true
}

func goodString(s string) bool {
	if !utf8.ValidString(s) {
		return false
	}
	for _, r := range s {
		if r < 0x20 {
			return false
		}
	}
	return true
}

// Encode writes canonical JSON (2.3) of a strict value.
func Encode(v any) []byte {
	var b []byte
	return appendValue(b, v)
}

// Append writes canonical JSON of v to b.
func Append(b []byte, v any) []byte { return appendValue(b, v) }

func appendValue(b []byte, v any) []byte {
	switch x := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys) // byte order
		b = append(b, '{')
		for i, k := range keys {
			if i > 0 {
				b = append(b, ',')
			}
			b = appendString(b, k)
			b = append(b, ':')
			b = appendValue(b, x[k])
		}
		return append(b, '}')
	case []any:
		b = append(b, '[')
		for i, e := range x {
			if i > 0 {
				b = append(b, ',')
			}
			b = appendValue(b, e)
		}
		return append(b, ']')
	case []map[string]any:
		b = append(b, '[')
		for i, e := range x {
			if i > 0 {
				b = append(b, ',')
			}
			b = appendValue(b, e)
		}
		return append(b, ']')
	case []string:
		b = append(b, '[')
		for i, e := range x {
			if i > 0 {
				b = append(b, ',')
			}
			b = appendString(b, e)
		}
		return append(b, ']')
	case string:
		return appendString(b, x)
	case int64:
		return strconv.AppendInt(b, x, 10)
	case int:
		return strconv.AppendInt(b, int64(x), 10)
	case bool:
		if x {
			return append(b, "true"...)
		}
		return append(b, "false"...)
	case Raw:
		return append(b, x...)
	}
	panic("canon: value of unsupported type")
}

// Raw is canonical JSON already written; Encode copies it as is.
type Raw []byte

func appendString(b []byte, s string) []byte {
	b = append(b, '"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '"' || c == '\\' {
			b = append(b, '\\')
		}
		b = append(b, c)
	}
	return append(b, '"')
}

// parser reads JSON that json.Valid already accepted.
type parser struct {
	b    []byte
	i    int
	lone bool // a lone surrogate escape was seen anywhere
}

func (p *parser) ws() {
	for p.i < len(p.b) {
		switch p.b[p.i] {
		case ' ', '\t', '\n', '\r':
			p.i++
		default:
			return
		}
	}
}

func (p *parser) value() (any, bool) {
	if p.i >= len(p.b) {
		return nil, false
	}
	switch c := p.b[p.i]; {
	case c == '{':
		p.i++
		m := map[string]any{}
		p.ws()
		if p.i < len(p.b) && p.b[p.i] == '}' {
			p.i++
			return m, true
		}
		for {
			p.ws()
			k, ok := p.str()
			if !ok {
				return nil, false
			}
			p.ws()
			if p.i >= len(p.b) || p.b[p.i] != ':' {
				return nil, false
			}
			p.i++
			p.ws()
			v, ok := p.value()
			if !ok {
				return nil, false
			}
			switch k := k.(type) {
			case Lone:
				m[string(k)] = v
			case string:
				m[k] = v
			}
			p.ws()
			if p.i >= len(p.b) {
				return nil, false
			}
			if p.b[p.i] == ',' {
				p.i++
				continue
			}
			if p.b[p.i] == '}' {
				p.i++
				return m, true
			}
			return nil, false
		}
	case c == '[':
		p.i++
		a := []any{}
		p.ws()
		if p.i < len(p.b) && p.b[p.i] == ']' {
			p.i++
			return a, true
		}
		for {
			p.ws()
			v, ok := p.value()
			if !ok {
				return nil, false
			}
			a = append(a, v)
			p.ws()
			if p.i >= len(p.b) {
				return nil, false
			}
			if p.b[p.i] == ',' {
				p.i++
				continue
			}
			if p.b[p.i] == ']' {
				p.i++
				return a, true
			}
			return nil, false
		}
	case c == '"':
		return p.str()
	case c == 't':
		p.i += 4
		return true, true
	case c == 'f':
		p.i += 5
		return false, true
	case c == 'n':
		p.i += 4
		return nil, true
	default:
		start := p.i
		for p.i < len(p.b) {
			c := p.b[p.i]
			if c >= '0' && c <= '9' || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E' {
				p.i++
				continue
			}
			break
		}
		if start == p.i {
			return nil, false
		}
		return Num(p.b[start:p.i]), true
	}
}

// str reads a string literal; it returns Lone when an escape left a lone surrogate.
func (p *parser) str() (any, bool) {
	if p.i >= len(p.b) || p.b[p.i] != '"' {
		return nil, false
	}
	p.i++
	var sb strings.Builder
	bad := false
	for p.i < len(p.b) {
		c := p.b[p.i]
		if c == '"' {
			p.i++
			if bad {
				p.lone = true
				return Lone(sb.String()), true
			}
			return sb.String(), true
		}
		if c != '\\' {
			sb.WriteByte(c)
			p.i++
			continue
		}
		if p.i+1 >= len(p.b) {
			return nil, false
		}
		e := p.b[p.i+1]
		p.i += 2
		switch e {
		case '"', '\\', '/':
			sb.WriteByte(e)
		case 'b':
			sb.WriteByte('\b')
		case 'f':
			sb.WriteByte('\f')
		case 'n':
			sb.WriteByte('\n')
		case 'r':
			sb.WriteByte('\r')
		case 't':
			sb.WriteByte('\t')
		case 'u':
			r, ok := p.hex4()
			if !ok {
				return nil, false
			}
			switch {
			case r >= 0xD800 && r <= 0xDBFF:
				// A high surrogate must be followed by a low one.
				if p.i+1 < len(p.b) && p.b[p.i] == '\\' && p.b[p.i+1] == 'u' {
					save := p.i
					p.i += 2
					r2, ok := p.hex4()
					if ok && r2 >= 0xDC00 && r2 <= 0xDFFF {
						sb.WriteRune(utf16.DecodeRune(r, r2))
						continue
					}
					p.i = save
				}
				bad = true
			case r >= 0xDC00 && r <= 0xDFFF:
				bad = true
			default:
				sb.WriteRune(r)
			}
		default:
			return nil, false
		}
	}
	return nil, false
}

func (p *parser) hex4() (rune, bool) {
	if p.i+4 > len(p.b) {
		return 0, false
	}
	n, err := strconv.ParseUint(string(p.b[p.i:p.i+4]), 16, 32)
	if err != nil {
		return 0, false
	}
	p.i += 4
	return rune(n), true
}

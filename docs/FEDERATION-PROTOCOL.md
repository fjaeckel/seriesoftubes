# Federation protocol, version 1

The wire protocol and the shared rules of multiplayer ("federation"). The decision and its reasons:
[ADR 0005](adr/0005-federation-by-player-run-servers.md).

Two implementations follow this document: the relay (Go, `relay/`) and the game (JavaScript, `src/game/`). Both must
pass every vector in [`federation/vectors/`](../federation/vectors/README.md). Where this text and a vector disagree,
the vector is wrong or this text is; fix both in one change, never one implementation alone.

The words MUST, MUST NOT and MAY are used as in RFC 2119. Everything in sections 1 to 12 is normative; notes marked
"Why" are not.

Contents:

1. [Conventions](#1-conventions)
2. [Canonical JSON](#2-canonical-json)
3. [Keys, signatures, ids and ASNs](#3-keys-signatures-ids-and-asns)
4. [The envelope](#4-the-envelope)
5. [Record kinds](#5-record-kinds)
6. [Receipts and proofs](#6-receipts-and-proofs)
7. [Validation order and error codes](#7-validation-order-and-error-codes)
8. [Servers: genesis, operators, server records](#8-servers-genesis-operators-server-records)
9. [The wire protocol](#9-the-wire-protocol)
10. [Rules both sides compute](#10-rules-both-sides-compute)
11. [The registry](#11-the-registry)
12. [Privacy](#12-privacy)
13. [Constants](#13-constants)

## 1. Conventions

- **Time** is unix seconds (UTC), an integer. **Days** in rules are exactly 86400 s; nothing uses calendars or time
  zones. A **real day number** is `floor(unixSeconds / 86400)`.
- **Slot**: the 5-minute slot of a time `x` is `slot(x) = x - (x mod 300)` (all times are positive).
- **Integer arithmetic only.** No rule uses floating point. Division is **floor division** (rounds toward minus
  infinity) wherever a rule says `div`. Go's `/` truncates toward zero and JavaScript's `Math.floor(a / b)` is not exact
  for large operands: implement `div(a, b)` exactly (JS: `r = ((a % b) + b) % b; q = (a - r) / b`, which is exact for
  safe integers; Go: adjust `a / b` down by one when the remainder is non-zero and the signs differ).
- **Byte order** of strings: comparing two strings means comparing their UTF-8 bytes. Every string compared this way
  in this protocol is ASCII (keys, ids, city ids), where byte order, code point order and JavaScript's `<` agree.
- **Lengths of text** count Unicode code points (JS: `[...s].length`; Go: `utf8.RuneCountInString`), never UTF-16
  units or bytes, unless the limit says bytes.
- **Sizes** are bytes of UTF-8.

## 2. Canonical JSON

Records are signed and hashed in one exact byte form, the same in JavaScript and Go.

### 2.1 Values a record may hold

1. **Objects**, whose member names match `^[A-Za-z0-9_]{1,32}$`. Otherwise `bad_name`.
2. **Arrays.**
3. **Strings** of Unicode scalar values: no character below U+0020 (`bad_string`), no lone surrogate (`bad_string`).
4. **Booleans.**
5. **Integers** with `|n| <= 9007199254740991` (2^53 - 1). Otherwise `bad_number`.
6. Nothing else. `null` is refused with `bad_value`.
7. **Depth** at most 8: the record object is depth 1, each object or array inside adds one. Deeper: `too_deep`.

Data keyed by something that is not a plain name (for example traffic per network key) is a list of objects, never an
object keyed by it.

### 2.2 Reading JSON text

Records arrive as JSON text (RFC 8259) and are checked before anything else is done with them:

1. The text MUST be valid UTF-8 and valid JSON; otherwise `bad_json`. (Raw control characters inside a string are
   already invalid JSON.)
2. **Numbers** are read as IEEE-754 doubles, rounding to nearest (what `JSON.parse` and Go's `strconv.ParseFloat` do).
   A number is accepted when the double is finite, integral, within the safe range and not negative zero. So `12`,
   `12.0` and `1.2e1` are all the integer 12, while `12.5`, `-0`, `1e400` and `9007199254740992` are `bad_number`.
3. **String escapes** are decoded as JSON defines. A `\uD800`–`\uDFFF` escape that is not part of a high-then-low
   surrogate pair is a lone surrogate: `bad_string`.
4. **Repeated member names** in one object: the last one wins (what `JSON.parse` and Go's `encoding/json` both do).
5. Then the value rules of 2.1 apply to the decoded value, depth first, members in any order. A vector never holds
   two different faults of this step, so the order within it does not matter.

**Go, take care.** `encoding/json` silently replaces invalid UTF-8 and lone surrogate escapes with U+FFFD, matches
struct field names case-insensitively, and fails the whole decode on `1e400`. Check `utf8.Valid` on the text, scan the
raw text for lone surrogate escapes, decode into `any` with `Decoder.UseNumber()`, and convert numbers by the rule
above. **JavaScript, take care.** Check strings with `String.prototype.isWellFormed()` (or an equivalent test) after
`JSON.parse`, and `Number.isSafeInteger(n) && !Object.is(n, -0)` for numbers.

### 2.3 Writing canonical JSON

`canon(value)`:

| Value | Output |
| --- | --- |
| object | `{`, then members sorted by name in byte order, each as `canon(name):canon(value)`, joined by `,`, then `}` |
| array | `[`, the elements in their order as `canon(element)`, joined by `,`, then `]` |
| string | `"`, the string with `\` written as `\\` and `"` written as `\"`, every other character written literally as UTF-8, then `"` |
| integer | decimal digits, with `-` for negatives, no leading zeros, no `+`, no exponent; zero is `0` |
| boolean | `true` or `false` |

No whitespace anywhere. Member names are ASCII, so byte order equals the UTF-16 order that JavaScript's default
`.sort()` uses.

**Go: never use `encoding/json` to write canonical JSON.** It escapes `<`, `>`, `&`, U+2028 and U+2029, and its map
ordering and number formatting are not this. Write the five cases above by hand (about 40 lines).

The canonical form of a record is what is signed and hashed. Records on the wire need not be canonical (whitespace,
member order, `12.0`, `é` are all fine): implementations parse, check, and re-canonicalise.

## 3. Keys, signatures, ids and ASNs

### 3.1 Encoding

All binary values are **base64url without padding** (RFC 4648 §5): alphabet `A–Z a–z 0–9 - _`, no `=`.
A decoder MUST refuse anything that does not round-trip: decode, re-encode, compare with the input. That refuses
padding, other alphabets, wrong lengths and non-zero unused bits in the last character.

| Type | Bytes | Characters | Wrong format |
| --- | --- | --- | --- |
| Key (Ed25519 public key) | 32 | 43 | `bad_key` |
| Sig (Ed25519 signature) | 64 | 86 | `bad_sig` |
| Id (SHA-256) | 32 | 43 | `bad_field` |
| Nonce | 32 | 43 | `bad_field` |
| Box key (X25519 public key, 3.5) | 32 | 43 | `bad_key` |
| Box nonce (3.5) | 12 | 16 | `bad_field` |

### 3.2 Signatures

- **Ed25519 only** (RFC 8032, pure Ed25519, no context, no prehash). WebCrypto `Ed25519` in the browser, `crypto/ed25519`
  in Go. A browser without WebCrypto Ed25519 does not offer multiplayer; there is no fallback algorithm.
- A private key is a 32-byte seed. WebCrypto imports it as PKCS#8: the 16 bytes `302e020100300506032b657004220420`
  followed by the seed. Go: `ed25519.NewKeyFromSeed`.
- The signed bytes are always the UTF-8 canonical JSON of an object (section 4), so every signature in the protocol is
  over an object with a `kind`. Kinds are disjoint, so a signature made for one purpose can never be presented as
  another (a proof is never a receipt, a receipt never a record). The one exception is a client's `auth` (9.3), signed
  over an object with `m: "auth"` and no `kind`: no record, receipt or proof lacks `kind`, so it can never pass for
  one either, and it names the node and server it is for.
- Verification uses the platform verifier as it is. It MUST refuse a non-reduced scalar (S >= L), as both platforms
  do. A key whose bytes are not a valid curve point simply fails to verify (WebCrypto may throw on import: treat that
  as `bad_sig`). The vectors avoid the few small-order-point cases where Ed25519 libraries are known to differ.

### 3.3 Record ids

- **Single-signer record** (has `sig`): `id = base64url(SHA-256(canon(record)))`, over the full record, `sig` included.
- **Multi-signer record** (has `sigs`): `id = base64url(SHA-256(canon(record without "sigs")))`, which is exactly the
  text every signer signs. Adding a signature never changes the id; copies merge (10.11).

### 3.4 ASN

The ASN the game shows for a key: let `h = SHA-256(the 32 raw key bytes)` and `n` the first 4 bytes of `h` as an
unsigned big-endian integer. Then

```
ASN = 4200000000 + (n mod 94967295)
```

which is always within the 32-bit private range 4200000000–4294967294. ASNs can collide; the key is the identity and
the game tells two networks with one ASN apart by key.

### 3.5 Box keys and sealing

Deals between two players are sealed so that only those two read them (5.3); relays forward them unread. Each network
has a **box key**, an X25519 key pair (RFC 7748) derived from its Ed25519 seed, so nothing new is stored or moved with a
save:

```
box_priv = HKDF-SHA256(ikm = seed (32 bytes), salt = empty, info = "tubes-fed v1 box", 32 bytes),
           then clamped: byte 0 &= 248, byte 31 &= 127, byte 31 |= 64
box      = X25519(box_priv, 9)            (published in announce, 5.1, as a Key: 32 bytes, base64url)
```

A **box** is an object `{n, c}`, both base64url (3.1): `n` the 12-byte AES-GCM nonce (16 characters), `c` the
ciphertext with its 16-byte tag appended, 17 to 2048 bytes. Anything else is `bad_field`; other members are
`unknown_field`.

**Sealing** a record of kind `K` by network A (Ed25519 key `a`, box private key `A`) for network B (Ed25519 key `b`, box
`B`):

1. `shared = X25519(A, B)`. An all-zero result fails (a low-order box): nothing is sealed.
2. `key = HKDF-SHA256(ikm = shared, salt = raw(lo) || raw(hi), info = "tubes-fed v1 " + K, 32 bytes)`, where `lo` and
   `hi` are `a` and `b` ordered by their Key text in byte order and `raw` is the 32 key bytes. `K` is the record's
   `kind` (`offer` or `decline`), so a box can never be moved into a record of another kind.
3. `aad = canon(the record without sig, its body without enc)`: the box is bound to `v`, `kind`, the author, `t` and
   every field left in clear (`to`, and `offer` for a decline).
4. `c = AES-256-GCM(key, nonce n, plaintext = canon(the sealed fields as one object), aad)`. `n` is 12 random bytes,
   never reused with the same key (pick them at random every time).

**Opening** is the same derivation from the other side (X25519 is symmetric: `X25519(B_priv, A) = shared`), then
AES-GCM decryption with the same `aad`. A box that does not open (wrong keys, a changed field, a tampered ciphertext) is
dropped silently. The plaintext is then read as JSON (2.2, 2.1) and checked as 5.3 says.

**Why**: X25519, HKDF-SHA256 and AES-GCM are in WebCrypto and in Go's standard library, so neither side needs a library.
Static keys on both sides mean an offer can be sealed for someone who is offline; the signature over the whole record
(with the box) still says who wrote it. A browser without WebCrypto X25519 does not offer multiplayer, like one without
Ed25519 (3.2).

## 4. The envelope

Every signed object, stored or not, has this shape:

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | integer | Always `1` in this version. Anything else (a string `"1"` too): `bad_version` |
| `kind` | string | One of the kinds of section 5 or 6. Unknown: `bad_kind` |
| `key` | Key | The author's public key |
| `t` | integer | The author's clock, unix seconds |
| `body` | object | Depends on `kind` |
| `sig` | Sig | Single-signer kinds: Ed25519 by `key` over `canon(envelope without sig)` |
| `sigs` | list | Multi-signer kinds (`operators`, `server`) instead of `sig`, see below |

No other fields (`unknown_field`). A single-signer kind without `sig` (even with `sigs`), or a multi-signer kind
without `sigs`, is `missing_field`.

**`sigs`**: a list of 1 to 16 objects `{key: Key, sig: Sig}` (exactly those two fields), sorted by `key` in byte order
(`bad_field` if not), each key at most once (`duplicate`). Every entry signs the same bytes:
`canon(envelope without sigs)`. Every entry MUST verify (`bad_sig`), and the author `key` MUST be one of the signers
(`bad_field`). Whether the signers are entitled to sign is a separate, stateful check (section 8).

**Size**: the canonical bytes of the whole envelope (with `sig` or `sigs`) MUST NOT exceed the kind's limit (13.2):
`too_big`.

**Time** (`now` is the receiver's clock):

1. `t < 1735689600` (2025-01-01): `too_old`.
2. `t > now + 600`: `too_new`.
3. `now - t` greater than the kind's maximum age (13.2): `too_old`.

## 5. Record kinds

Records are what players and operators publish; relays store and forward them. Every kind below is single-signer
except `operators` and `server`. A live state (5.11) has the same envelope but is no record: it is never stored, and
only a `state` frame (9.3) or a `states` frame (9.4) carries one; anywhere a record is expected its kind is `bad_kind`.

**Field types** used in the tables (each wrong value is `bad_field` unless the type says otherwise):

| Type | Rule |
| --- | --- |
| Key, Id, Sig | Section 3.1 |
| Name | String, 1 to 40 code points, not only spaces (U+0020), no bidi controls U+202A–U+202E or U+2066–U+2069 |
| Text(n) | String, 0 to n code points, no bidi controls |
| Label(n) | String, 1 to n code points, no bidi controls |
| City | String matching `^[a-z0-9]{2,8}$`, a game city id. Unknown cities are not refused; the game ignores them |
| CC | String matching `^[A-Z]{2}$`, a country code |
| Mbps | Integer 0 to 1000000000 |
| Money | Integer 0 to 1000000000000, in game money |
| Days | Integer 1 to 3650, real days |
| Count(n) | Integer 0 to n |
| Bool | `true` or `false` |
| Url | ASCII string of at most 200 bytes matching `^wss://H(:P)?(/[A-Za-z0-9._~/-]*)?$`, where P is a port 1 to 65535 without leading zeros and H is either a lower-case host name of dot-separated labels `[a-z0-9]([a-z0-9-]*[a-z0-9])?` with at least one dot and not made only of digits and dots, or a local address (for servers on a LAN): an IPv4 address in 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 or 127.0.0.0/8 in dotted decimal without leading zeros, or an IPv6 address in fc00::/7 or `::1` in brackets, written as RFC 5952 section 4 has it (lower case, no leading zeros, the longest run of two or more zero groups, the first on a tie, as `::`; no zone, no embedded IPv4). Any other IP literal is refused. No user info, query or fragment. The registry takes host names only (11.2 step 6) |
| [T] max n | A list of T with at most n entries (`too_many`); entries that are sets are unique (`duplicate`) |

All listed fields are required unless marked optional (`missing_field`). Fields not listed are refused
(`unknown_field`). When several fields are wrong, the error of the first in table order is reported, but vectors only
ever hold one fault.

### 5.1 `announce` (client)

A network's public description: enough for other games to build it as a network, plus its published terms. The newest
`announce` of a key (greatest `t`, then lowest id) replaces older ones. A relay keeps at most one `announce` of a key per
board slot (6.1, 10.1), the newest: a newer one in that slot replaces it, and an older one is refused (`refused`).

| Field | Type | Rule |
| --- | --- | --- |
| `name` | Name | The network's name, as typed |
| `asn` | integer | MUST equal the ASN of `key` (3.4) |
| `box` | Key | Its box key (3.5), derived from the network's seed: deals offered to it are sealed for this key. Relays cannot check that it belongs to `key`; a wrong one only means that network cannot open what is sealed for it |
| `home` | CC | Home market: the game country the network started in |
| `day` | Count(10000000) | The save's current game day |
| `founded` | integer | Real day number the save joined; 0 to `floor(t / 86400)` |
| `pops` | [City] max 512 | Cities with a POP, unique |
| `ix` | [City] max 512 | Cities where it is at the exchange, unique, each also in `pops` |
| `cust` | Count(10000000) | Number of customers |
| `mix` | object | `{content, eyeball, enterprise}`, each Count(1000), summing to exactly 1000 (per mille of its traffic) |
| `traffic` | object | `{in: Mbps, out: Mbps}`, its total traffic now |
| `policy` | string | `open`, `selective` or `restrictive` |
| `cond` | object | Required when `policy` is `selective`, refused (`bad_field`) otherwise. See below |
| `rates` | object | Rate card, see below; `{}` when it sells nothing |
| `auto` | object | How requests are handled: `{peering, transit, pni, swap, consortium, port, wave}`, each `auto`, `review` or `decline`. The first six are required; `wave` is optional (announces from before wave deals) and absent means `decline` (10.10) |

`cond`, the conditions of a selective policy: `{minMbps: Mbps, maxRatio: integer 100 to 100000 (the highest in/out ratio
accepted, times 100: 300 means 3:1), minShared: Count(64) (shared locations), rpki: Bool, tier1: Bool (Tier 1 only),
ai: Bool (AI players accepted)}`, all required.

`rates`, every part optional:

- `transit`: `{perGbps: Money (per Gbps per month at the 95th percentile), commit: [{mbps: Mbps, off: Count(900)}] max 8
  with strictly ascending `mbps` (discount per mille for committing at least `mbps`), term: Days (minimum term)}`.
- `pni`: `{setup: Money, ports: [{mbps: Mbps, monthly: Money}] 1 to 8 with strictly ascending mbps, term: Days}`.
- `ix` (an exchange it runs): `{ports: [{mbps, monthly}] 1 to 8 with strictly ascending mbps, join: anyone|selective|approval, at: [City] 1 to 16 unique}`.
- `wave` (managed waves on routes it has lit): `{routes: [{a: City, b: City}] 1 to 32, sizes: [{gbps: 100|400|800|1600,
  monthly: Money}] 1 to 4 with strictly ascending gbps, term: Days (minimum term)}`. A route's cities are in byte order
  (`a < b`, `bad_field` otherwise; so a route has one spelling and a city is never paired with itself); routes are unique
  (`duplicate`). Whether the routes are really lit is the seller's game's business, not a rule here.

Example (keys and signatures shortened):

```json
{"v":1,"kind":"announce","key":"q6-YSQ…PWMw","t":1767312000,"sig":"…","body":{
 "name":"Ping Floyd","asn":4215690104,"box":"JFbp…-wM","home":"DE","day":412,"founded":20454,
 "pops":["fra","ams","lon"],"ix":["fra","ams"],"cust":37,
 "mix":{"content":200,"eyeball":700,"enterprise":100},"traffic":{"in":42000,"out":9000},
 "policy":"selective","cond":{"minMbps":1000,"maxRatio":300,"minShared":2,"rpki":true,"tier1":false,"ai":true},
 "rates":{"transit":{"perGbps":900,"commit":[{"mbps":10000,"off":100},{"mbps":100000,"off":250}],"term":90},
          "pni":{"setup":5000,"ports":[{"mbps":10000,"monthly":1500}],"term":180}},
 "auto":{"peering":"auto","transit":"auto","pni":"review","swap":"review","consortium":"review","port":"auto"}}}
```

### 5.2 `stats` (client, at most one per 5-minute slot)

What the boards rank. The country is never in here: the receiving node adds it to the receipt (6.1) when
`shareCountry` is true.

**When a client sends it:** whenever the values change, and at least once an hour while the game is open, but never
more than one per slot. Carrying forward (10.2) covers the slots in between, so there is no need to send every slot.
What the game's numbers are right now goes in live states (5.11), which the boards of now rank (10.13).

The largest body a game can send (512 cities, 256 traffic entries, 128 customers, 16 upstreams, an AI setup, every
number at its maximum) is under the 40960-byte limit (13.2); the `records` vector `stats-biggest` holds it.

| Field | Type | Rule |
| --- | --- | --- |
| `mode` | string | `normal`, `sandbox`, `open_gates`, `puzzle`, `scenario`, `weekly` or `architect`. Only `normal` is ranked |
| `pops` | object | City → POPs in service in that city, 1 to 1000. At most 512 members (`too_many`); member names that are not City: `bad_field`; cities with none are left out. In this game version a network has at most one POP per city, so every count is 1; the count stays for later versions |
| `pies` | Count(10000000), optional | Pies in service (`pieLiveAll()`). Absent: the save has no Pie in the Sky company |
| `traffic` | [{key: Key, in: Mbps, out: Mbps}] max 256 | Traffic with each other player network right now: `in` received from it, `out` sent to it. Keys unique (`duplicate`), never the author's own (`bad_field`) |
| `total` | Mbps, optional | The network's whole traffic right now, the busier direction: what the game shows as traffic served. Absent (older games): 0. Self-reported, nobody can confirm it; accepted, the boards are not competitive (ADR 0005) |
| `cust` | [Key] max 128, optional | Its transit customers among the player networks: those it sells transit to in a deal running now (5.3). Unique (`duplicate`), never the author's own key (`bad_field`). Absent: none. The cone board (10.4) counts an edge only when the customer confirms it in `up` |
| `up` | [Key] max 16, optional | The player networks it buys transit from in a deal running now. Same rules as `cust` |
| `tier1` | Bool | Tier 1 in the game's rank |
| `tier2` | Bool, optional | Tier 2 or better in the game's rank. Absent: false. Read by a mentor's game (9.5 `nets`, 10.10), never ranked |
| `ai` | object, optional | `{model: Label(64), harness: Label(64)}`, declared by whoever runs the agent. Absent: a human |
| `shareCountry` | Bool | The player lets the server attach their country |

```json
{"v":1,"kind":"stats","key":"q6-YSQ…PWMw","t":1767312000,"sig":"…","body":{
 "mode":"normal","pops":{"ams":1,"fra":2,"lon":1},"pies":12,
 "traffic":[{"key":"BydB2y…CSz0","in":1800,"out":2400},{"key":"Of174J…dUKns","in":300,"out":0}],"total":48000,
 "tier1":false,"ai":{"model":"example-model-1","harness":"tubes-mcp"},"shareCountry":true}}
```

### 5.3 `offer`, `accept`, `decline` (client)

Deals between players. Each record has one signer; a deal's two signatures are the two records that make it
(an offer and an accept, or an offer and the counterparty's own `announce` it relies on, see 10.10). Records stay
immutable, and nobody has to be online at the same time as anyone else.

**Deals are private between their two parties.** An offer to someone and every decline travel **sealed** (3.5): only
the fields a relay needs to deliver them are in clear, everything that describes the deal is in the box `enc`, which
only the two parties open. Relays check the envelope, the signature and the box's shape, never the terms, and send
these records only to the two parties' sessions (9.3). Consortium projects open to anyone are public by design and
travel in clear. A relay MAY bound the `offer`s it keeps by one author, in all and to any one `to` (the reference relay:
4096 and 128, a project without `to` counting as one more `to`); an offer over the bound is refused (`too_many`).

On the wire:

| Record | Body in clear | Sealed in `enc` (the plaintext object) |
| --- | --- | --- |
| `offer` with `to` | `{to: Key, enc: Box}`, exactly these two (`to` never the author: `bad_field`; anything else: `unknown_field`) | `{deal, basis?, renews?, terms}` as in the table below |
| `offer` without `to` | The offer in clear, as below; `deal` MUST be `consortium` (otherwise `to` is `missing_field`) | nothing |
| `accept` | `{offer: Id, to: Key}` | nothing: it says only which offer, never its terms |
| `decline` | `{offer: Id, to: Key, enc: Box}` | `{reason}` |

A party that opens a box joins the clear fields and the plaintext into the offer or decline **in clear** (the tables
below) and checks it as written there: any failure (a plaintext that is not an object, repeats a clear field, misses a
field or breaks a rule) drops the record, as a box that does not open does. Then 10.10 applies, exactly as before. The
size limits (13.2) are of the record as it travels.

The offer in clear (an open consortium project on the wire, or a sealed offer once opened):

| Field | Type | Rule |
| --- | --- | --- |
| `to` | Key | The counterparty, never the author (`bad_field`). Optional for `consortium` only (absent: open to anyone; present: an invitation, sealed like any offer to someone) |
| `deal` | string | `peering`, `transit`, `pni`, `swap`, `consortium`, `port` or `wave` |
| `basis` | Id | The counterparty's `announce` whose terms the offer takes. Required for `peering`, `transit`, `pni`, `port`, `wave`; optional for `swap`; refused for `consortium` (`bad_field`) |
| `renews` | Id, optional | The offer that started the running deal this one renews |
| `terms` | object | By `deal`, below |

| `deal` | `terms` |
| --- | --- |
| `peering` | `{at: [City] 1 to 16 unique, via: ix\|pni}` |
| `transit` | `{mbps: Mbps (committed), perGbps: Money, term: Days, at: [City] 1 to 16 unique, founded?}` |
| `pni` | `{at: City, mbps: Mbps, setup: Money, monthly: Money, term: Days, founded?}` |
| `port` | `{at: City, mbps: Mbps, monthly: Money, term: Days, founded?}` |
| `swap` | `{give: {a: City, b: City, mbps: Mbps}, take: {a: City, b: City, mbps: Mbps}, term: Days}` |
| `consortium` | `{name: Name, a: City, b: City, members: integer 2 to 16, share: Money, pairs: integer 1 to 16}` |
| `wave` | `{a: City, b: City (a < b, as on the card), gbps: 100\|400\|800\|1600, monthly: Money, term: Days, founded?}`: one wave the author buys from `to` |

`founded` (optional, Count(10000000), on the four priced deals): the buyer (the offer's author) claims the newcomer
price, giving the real day it joined, as its `announce` says (5.1). 10.10 checks it.

`accept`: `{offer: Id, to: Key}` where `to` is the offer's author. `decline` (once opened): `{offer: Id, to: Key,
reason}` with `reason` one of `declined`, `conditions`, `depeer`, `excluded`, `quiet`. A `decline` of a running deal
ends it.

A transit offer as it travels, what Alice reads once she opened it, and her accept:

```json
{"v":1,"kind":"offer","key":"Fz3…","t":1767312000,"sig":"…","body":{
 "to":"q6-YSQ…PWMw","enc":{"n":"o4dM_rFff72Ms2lZ","c":"Y_yGXG15…"}}}
{"to":"q6-YSQ…PWMw","deal":"transit","basis":"<id of alice's announce>","terms":{"mbps":10000,"perGbps":810,"term":90,"at":["fra"]}}
{"v":1,"kind":"accept","key":"q6-YSQ…PWMw","t":1767312600,"sig":"…","body":{"offer":"<offer id>","to":"Fz3…"}}
```

**Why** the offer's `to` and the accept stay in clear: the relay delivers by them, and that two networks deal at all
is visible to a relay anyway (it carries both sides' records). What they agreed on, at what price, where, and why one
of them said no, is not.

### 5.4 `genesis` (founding operator)

Founds a server. Its record id **is the server identity**.

| Field | Type |
| --- | --- |
| `name` | Name |
| `node` | `{key: Key, url: Url}`, the first node |

```json
{"v":1,"kind":"genesis","key":"<anna's operator key>","t":1763856000,"sig":"…",
 "body":{"name":"Packet Lunch","node":{"key":"<node1 key>","url":"wss://relay.example.net/fed"}}}
```

### 5.5 `operators` (operators, multi-signer)

A proposal to change the operator or node list (section 8).

| Field | Type | Rule |
| --- | --- | --- |
| `server` | Id | The server identity |
| `prev` | Id | The chain head it applies to: the genesis id or the id of the last applied proposal |
| `action` | string | `add_operator`, `remove_operator`, `set_node` or `remove_node` |
| `target` | Key | The operator or node key concerned |
| `url` | Url | Required for `set_node` (`missing_field`), refused for the others (`bad_field`) |

```json
{"v":1,"kind":"operators","key":"<anna>","t":1764720000,"body":{"server":"<id>","prev":"<id>",
 "action":"add_operator","target":"<cleo>"},"sigs":[{"key":"<anna>","sig":"…"},{"key":"<ben>","sig":"…"}]}
```

### 5.6 `server` (operators, multi-signer)

The server's description, signed by a strict majority of its operators at `head`.

| Field | Type | Rule |
| --- | --- | --- |
| `server` | Id | |
| `head` | Id | The chain head this record was made at |
| `name` | Name | |
| `nodes` | [{key: Key, url: Url}] 1 to 16 | Sorted by `key`, keys unique (`bad_field` if unsorted, `duplicate`) |
| `operators` | [Key] 1 to 16 | Sorted, unique |
| `sync` | string | `standalone`, `selective` or `open` |
| `noLogs` | Bool | The operators declare that neither the relay nor anything in front of it logs addresses |
| `langs` | [string `^[a-z]{2}$`] max 8 | Languages spoken, unique |
| `desc` | Text(280) | |

```json
{"v":1,"kind":"server","key":"<anna>","t":1767312000,"body":{"server":"<id>","head":"<id>","name":"Packet Lunch",
 "nodes":[{"key":"<node1>","url":"wss://relay.example.net/fed"}],"operators":["<anna>"],"sync":"open",
 "noLogs":true,"langs":["en","de"],"desc":"Small, friendly, always on."},"sigs":[{"key":"<anna>","sig":"…"}]}
```

### 5.7 `hide` (an operator)

The server's moderation lists. The newest `hide` of a server (greatest `t`, then lowest id) signed by any of its
current operators replaces the previous one; it applies on all its nodes and is advice to other servers.

| Field | Type | Rule |
| --- | --- | --- |
| `server` | Id | |
| `hide` | [Key] | Networks left off this server's boards and lists |
| `names` | [Key] | Networks shown by ASN only, name hidden |
| `refuse` | [Key] | Networks whose new records this server refuses (`refused`) |

Each list unique; the three together at most 512 keys (`too_many`).

### 5.8 `shun` and `unshun` (an operator)

A server's vote to exclude a network everywhere, and its withdrawal (10.7).

| Field | Type | Rule |
| --- | --- | --- |
| `server` | Id | The voting server |
| `target` | Key | The network |
| `reason` | string | `shun` only: `cheating`, `offensive_name`, `spam` or `abuse`. No free text anywhere |

```json
{"v":1,"kind":"shun","key":"<anna>","t":1767312000,"sig":"…","body":{"server":"<id>","target":"<mallory>","reason":"spam"}}
```

### 5.9 `leave` (client)

`body` is `{}`. The network leaves the federation: relays and games drop every record of that key with `t` at or before
the leave's `t` (except the `leave` itself, kept 180 days so it spreads), and remove it from boards and maps at once.
Records with a later `t` are accepted again, as a network back from nothing.

### 5.10 `report` (client)

A player tells the operators of one of its joined servers that a network breaks the rules. Only that server's operators
ever see it (9.3, 9.4, 12): a report is not a vote and excludes no one; operators decide what to do (hide it, 5.7, or
vote, 5.8).

| Field | Type | Rule |
| --- | --- | --- |
| `server` | Id | The server whose operators it is for |
| `target` | Key | The network reported; not the author (`bad_field`) |
| `reason` | string | `cheating`, `offensive_name`, `spam` or `abuse`, as for `shun`. No free text anywhere |

A node takes a report only when `server` is its own server (`not_node` otherwise) and, from a client, only from a key it
holds an `announce` of (`refused`): operators judge reports by who sent them. It keeps one report per author and
`target`, the newest (greatest `t`, then lowest id): a newer one replaces it, an older one is `refused`. It MAY bound
what one author and everyone can make it keep (`too_many`); the reference relay takes at most 20 new reports per author
per day, counted by receipt slot, and keeps at most 65536. Reports are kept 30 days (13.1).

```json
{"v":1,"kind":"report","key":"<bob>","t":1767312000,"sig":"…","body":{"server":"<id>","target":"<mallory>","reason":"offensive_name"}}
```

### 5.11 `state` (client, live, never stored)

A network's numbers **now**: what the boards of now rank (10.13). Its body is exactly a `stats` body (5.2: the same
fields, the same checks, the same limits), signed by the network's key like any single-signer object, `kind: "state"`,
at most 40960 bytes. It is **not a record**: no node stores it, writes it to disk, puts it in a `sub` backlog or an
inventory, or signs a receipt for it; anywhere a record is expected (`put`, `push`, a store) it is `bad_kind`, and a
`state` frame takes nothing else (`bad_kind`).

- **Time.** `t` is the author's clock. Refused when `t > now + 600` (`too_new`) or `now - t > 900` (`too_old`): its
  maximum age is 900 s (13.2). A state is **live** at a time `x` while `x - t < 900`.
- **Newest wins.** Of one key, a node keeps only the newest state it has (greatest `t`, then lowest id), in memory: an
  older or equal one changes nothing (and is not passed on). It forgets a key once its newest state is no longer live,
  and it MAY bound how many keys it keeps (answering `rate_limited` for a new key while full; the reference relay keeps
  at most 50000 keys and 128 MB of states). A restart forgets every state.
- **State checks** (7.1 step 9) as for records of that key: `refused` (the key left with a later `t`, or the server
  refuses it), `shunned`.
- **When a game sends one:** while the tab is visible and a session with a node that lists `state` in `feats` (9.3) is
  ready: every 10 s when the body changed since the last one that node took, and at least every 180 s otherwise (so the
  network stays live), never twice within 5 s; nothing is queued or kept: a state missed is replaced by the next.

```json
{"v":1,"kind":"state","key":"q6-YSQ…PWMw","t":1767312042,"sig":"…","body":{
 "mode":"normal","pops":{"ams":1,"fra":1},"pies":12,"traffic":[{"key":"BydB2y…CSz0","in":1800,"out":2400}],"total":48000,
 "tier1":false,"shareCountry":true}}
```

**Why** a signed object and not a record: validation and the body's rules are shared with `stats`, every node can
check a state it is passed (and a game can check a ranking of now against them, 9.5), and nothing has to be stored to
show what is happening now.

## 6. Receipts and proofs

Signed with the same envelope, but never stored or forwarded as records on their own; `put` refuses them (`bad_kind`).

### 6.1 Receipts (a node)

When a node receives a record **from a client**, it signs a receipt. The receipt travels with the record from then on
(sync carries both), and is what the boards use as the record's time.

| Envelope | Rule |
| --- | --- |
| `key` | The node's key, which MUST be one of the server's nodes (`not_node`) |
| `t` | `slot(receive time)`: a multiple of 300 (`bad_field`). Exact times are never kept |
| `body.rec` | Id of the record (`bad_field` if it is not that record's id) |
| `body.server` | The server identity (`bad_field` if not the server the node belongs to) |
| `body.cc` | CC, optional: only on a `stats` record whose `shareCountry` is true (`bad_field` otherwise), and only when the node found a country for the connection |

Size at most 1024 bytes. Time: `t > now + 600` is `too_new`; there is no maximum age.
A node receiving a record from another node keeps the receipts that came with it and adds none, except when a record
arrives with no valid receipt at all, when it adds its own.

A **valid receipt** is one that checks as above and whose `key` is a node of a server the checker knows: for a client,
a server in its registry snapshot or catalog (10.8), or the server it is connected to (from its `welcome`); for a
node, its own server or one it knows from the registry or gossip. Receipts from any other key are ignored. A `stats`
record without a valid receipt has no board slot and is not ranked (10.1).

### 6.2 Proofs (a node)

A node proves it holds its node key by signing a challenge: `kind` `proof`, `key` the node key, `t` the node's clock,
`body` `{nonce: Nonce, server: Id}`. The checker verifies, in this order: the envelope (any fault of section 4 or of
the body's shape, such as a missing or extra field, a wrong `v`, a malformed key, nonce or signature: `bad_challenge`,
never the record error codes); `kind` is `proof`, `key` is the node it asked, `body.server` is the server it expected
(each otherwise `bad_challenge`); the signature (`bad_sig`); `body.nonce` is the nonce it sent and `|t - now| <= 300`
(otherwise `bad_challenge`). Nonces are 32 random bytes, used once.

## 7. Validation order and error codes

### 7.1 Order

A received record is checked in this order; the first failing step gives the error:

1. Size of the text (frame limit, 9.1): `too_big`.
2. JSON (2.2): `bad_json`, `bad_string`.
3. Values (2.1): `too_deep`, `bad_number`, `bad_string`, `bad_name`, `bad_value`.
4. Envelope (4): not an object `bad_field`; `v` missing `missing_field` or wrong `bad_version`; `kind` missing
   `missing_field` or unknown `bad_kind`; other fields missing `missing_field`; extra fields `unknown_field`; `key`
   `bad_key`; `t` not an integer `bad_field`; `body` not an object `bad_field`; `sig` format `bad_sig`; `sigs` shape
   (`bad_field`, `bad_key`, `bad_sig`, `too_many`, `duplicate`, order `bad_field`).
5. Size of the canonical record (13.2): `too_big`.
6. Body (section 5): `missing_field`, `unknown_field`, `bad_field`, `bad_key`, `too_many`, `duplicate`.
7. Signatures (3.2, 4): `bad_sig`; author not among `sigs`: `bad_field`.
8. Time (4): `too_old`, `too_new`.
9. State (relays and games, with what they know): `shunned`, `refused`, `not_operator`, `no_majority`, `bad_chain`,
   `unknown_server`; for a `report` also `not_node` and `too_many` (5.10).

Steps 1 to 8 depend only on the record and `now`, and are what the `records` vectors test. (The registry check,
11.2, runs them with the wall clock as `now`.)

### 7.2 Error codes

| Code | Meaning | Closes the connection |
| --- | --- | --- |
| `bad_frame` | Not a frame: not a JSON object, unknown or missing `m`, missing or bad `id`, a field of the wrong type | yes |
| `too_big` | A frame, record or file over its size limit | frame: yes; record: no |
| `bad_json` | Not valid UTF-8 JSON | yes for frames |
| `too_deep` | Nesting over 8 in a record | no |
| `bad_number` | A number that is not a safe integer | no |
| `bad_string` | A control character or lone surrogate in a string | no |
| `bad_name` | An object member name outside `[A-Za-z0-9_]{1,32}` | no |
| `bad_value` | `null` | no |
| `bad_version` | Record `v` is not 1 | no |
| `bad_kind` | Unknown kind, or a kind not allowed here | no |
| `missing_field` | A required field is absent | no |
| `unknown_field` | A field this version does not define | no |
| `bad_field` | A field's value breaks its rule | no |
| `bad_key` | Not a valid Key | no |
| `bad_sig` | Not a valid Sig, or a signature that does not verify | no |
| `too_many` | A list over its limit | no |
| `duplicate` | An entry repeated in a list that is a set | no |
| `too_old` | Before 2025-01-01 or past the kind's maximum age; an `auth` more than 600 s behind | no |
| `too_new` | More than 600 s ahead (records and `auth`) | no |
| `not_operator` | Signed by a key that is not a current operator of that server | no |
| `not_node` | A node key that is not one of the server's nodes; a `report` for a server this node is not a node of | yes for node sessions |
| `no_majority` | Not signed by a strict majority of the operators | no |
| `bad_chain` | Operator chain broken: unknown `prev`/`head`, lists not matching | no |
| `unknown_server` | A server identity this node does not know | no |
| `shunned` | The author is shunned by the federation (10.7) | no |
| `refused` | Refused by this server's moderation, or the author has left | no |
| `not_found` | A requested record or offer is not here | no |
| `unsupported` | No protocol version in common | yes |
| `not_ready` | A message other than `hello` before the handshake finished | yes |
| `policy` | The sync policies do not allow this session or this gossip | yes |
| `rate_limited` | Too much; `retry` says after how many seconds | no |
| `bad_challenge` | A proof that does not answer the challenge | yes |
| `id_mismatch` | Registry file name is not the genesis id | (registry check) |
| `no_logs` | Registry file without `noLogs: true` | (registry check) |
| `local_url` | Registry file with a node URL that is an IP address or a `.local` name | (registry check) |
| `name_taken` | Registry server name already used by another file | (registry check) |
| `no_answer` | No listed node answered the registry challenge | (registry check) |
| `stale_terms` | An offer relying on terms the counterparty replaced more than 24 h before (10.10) | no |
| `bad_terms` | An offer whose terms are not the published ones | no |
| `no_terms` | The basis publishes no terms for that deal | no |
| `declined` | The counterparty declines that kind of deal automatically | no |
| `internal` | The node failed; try again later | no |

## 8. Servers: genesis, operators, server records

A server is its operator list. There is no server key.

### 8.1 The chain

`state(genesis)` = operators `[genesis.key]`, nodes `[genesis.body.node]`, head = the genesis id (the server identity).
Lists are kept sorted by key (byte order).

Given every valid `operators` record known for that server (records naming another `server` are ignored), apply
proposals one at a time:

1. **Candidates** are proposals with `prev` equal to the current head, whose author `key` is a current operator, that
   are **applicable** and have a **majority**.
2. **Applicable**: `add_operator` of a key not yet an operator, while there are fewer than 16; `remove_operator` of a
   current operator, while there are at least 2; `set_node` of a new node key while there are fewer than 16 nodes, or of
   an existing node key (changing its URL); `remove_node` of a current node, while there are at least 2.
3. **Majority**: the number of `sigs` entries whose key is a current operator, times 2, is greater than the number of
   current operators (strict majority: 1 of 1, 2 of 2, 2 of 3, 3 of 4, 3 of 5, 9 of 16). Signatures from other keys do
   not count and do not invalidate the record.
4. If there are no candidates, stop. Otherwise apply the candidate with the **lowest record id** (byte order); its id
   becomes the head. Every other proposal on the old head is now void.

The result depends only on the set of records, never on their order of arrival or on the clock. A cut-off node cannot
change the lists alone.

**Pending** at time `now`: proposals with `prev` equal to the final head, author an operator, applicable, without a
majority yet, and `now < t + 1209600` (14 days). Pending proposals are listed in order of record id (byte order), by
relays, operator tools and vectors alike. Expiry only removes pending proposals: a proposal that reached its
majority stays applied however old it is. Relays drop expired pending proposals and refuse `cosign` for them
(`too_old`); operator tools refuse to sign them.

### 8.2 Server records

A `server` record is **valid** when its `head` is the genesis id or an applied proposal (otherwise `bad_chain`), its
`nodes` and `operators` equal the lists at that head (`bad_chain`), and the number of its signers who were operators at
that head, times 2, is greater than the number of those operators (`no_majority`). The **current** server record is the
valid one with the greatest `t` (then lowest id). The lists shown for a server always come from the chain; the
descriptive fields (`name`, `sync`, `noLogs`, `langs`, `desc`) from the current server record, or the genesis `name`
while there is none.

The **head server record** is the valid server record whose `head` is the chain's final head with the greatest `t`
(then the lowest id). It is the one a server sends in its own catalog entry (10.8) and the one `relay registry-file`
writes (11.1), since both require a server record at the final head; a server with none there (its operators have
not yet signed one after the last change) emits no catalog entry and cannot make a registry file.

### 8.3 Operator records against the chain

`hide`, `shun` and `unshun` are accepted from a key that is a current operator of `body.server` (`not_operator`
otherwise), as far as the receiver knows the server's chain (`unknown_server` if it knows nothing of it). Relays keep
and pass on `shun` and `unshun` only of servers in their registry snapshot (11.3), with its operator lists, and of their
own server; any other is refused (`unknown_server`) and neither stored nor passed on: such a vote could never count
(10.7 counts registry servers only), and a server known from gossip alone costs nothing to make up, so keeping its votes
would let anyone fill every relay's store and tally. A relay MAY also bound the votes it keeps of one server (the
reference relay: 8192; over it, `too_many`).

## 9. The wire protocol

### 9.1 Transport

- WebSocket over TLS only (`wss://`), subprotocol **`tubes-fed.1`**. A node refuses a connection without it. The
  subprotocol names this framing; the protocol version inside is negotiated by `hello`.
- Development only: a game page that was itself loaded from a loopback host (`localhost`, `127.0.0.1`, `[::1]` or a
  name ending in `.localhost`) dials a node whose URL host ends in `.localhost` with plain `ws://` instead, so a relay
  run on the same machine needs no certificate. URLs in records stay `wss://`; nothing else changes. The page players
  load is never on a loopback host, so this never applies to them.
- Every message is one **text frame** holding one JSON object with a string member `m` (the message type). Binary
  frames close the connection.
- Frame limits: **65536 bytes** between clients and nodes, **1048576 bytes** between nodes. Larger: `too_big`, and the
  connection closes.
- Members of a frame not defined here are ignored (records inside frames are strict, frames are not). Nothing outside
  the records is ever stored.
- **Requests** carry `id`, an integer 1 to 2147483647 chosen by the sender; the answer echoes it. Messages that are not
  answers to a request (streamed records, gossip, inventories) carry no `id`, or the `id` of the subscription they
  belong to.
- `hello.role` is `client` or `node`; anything else is `bad_frame`.
- Before the handshake ends, only `hello` (and on node sessions, `welcome` and `proof`) may be sent: otherwise
  `not_ready`. A second `hello` is `bad_frame`.
- Either side sends `ping` `{m, id}` when idle for 60 s; the answer is `pong` `{m, id, now}`. A side that hears nothing
  for 120 s closes the connection.

### 9.2 Versions

`hello` carries `vers`, the protocol versions the sender speaks: integers, ascending, unique, at least one
(`bad_frame` otherwise). The session uses the **highest version both speak**; with none in common the answer is
`err` `unsupported` and the connection closes. So two servers keep speaking the older version until both have
upgraded. This document is version 1; records carry `v: 1` in it.

A client **skips** a frame from a node whose `m` it does not know (a newer relay's message within the same version):
it is neither answered nor a reason to close, so an older game keeps working with a newer relay. A frame with a known
`m` that fails its checks is still `bad_frame`.

### 9.3 Client and node

| Message | Direction | Fields | Answer |
| --- | --- | --- | --- |
| `hello` | client → node | `vers`, `role: "client"` | `welcome` |
| `welcome` | node → client | `ver` (chosen), `server` (Id), `node` (Key), `now`, `impl` (optional, below), `feats` (optional, below) | |
| `update` | node → client | `version`, `security` (Bool), `source` (`feed` or `github`), `notes` (optional, an `https://` URL); no `id` | Only to a session that proved an operator key of the node's server: a newer relay is out (below) |
| `auth` | client → node | `id`, `key` (Key), `t` (unix seconds), `sig` (Sig) | `ack` with `op`, or `err` (`bad_key`, `bad_sig`, `too_old`, `too_new`, `too_many`): proves the session holds `key` (below) |
| `challenge` | client → node | `id`, `nonce` | `proof` `{m, id, proof}`, a proof envelope (6.2) |
| `put` | client → node | `id`, `rec` (a record) | `ack` or `err` |
| `state` | client → node | `id` (optional), `rec` (a live state, 5.11) | with `id`: `ack` (`rid`, `dup`: it was not newer) or `err`; without: only an `err` |
| `ack` | node → client | `id`; answering `put` and `cosign` also `rid` (record id), `dup` (Bool: already had it) and `rcpt` (the receipt, when the record came from this client); answering `auth` also `op` (Bool: `key` is a current operator of this node's server); answering `unsub` only `id` | |
| `excluded` | node → client | `keys` ([Key], sorted), `more` (Bool), `reasons` ([reason], only to a session that proved an excluded key); no `id` | The networks this server excludes now (10.7), below |
| `cosign` | client → node | `id`, `rid` (a pending proposal or server record), `key`, `sig` | `ack` or `err`: adds one operator signature to a multi-signer record (same check as 4 and 8) |
| `sub` | client → node | `id`, `kinds` ([kind]), `since` (cursor, `""` for everything kept) | `recs` frames carrying the `id`, first the backlog, then live records, until `unsub` |
| `unsub` | client → node | `id` (of the `sub`) | `ack` |
| `fetch` | client → node | `id`, `ids` ([Id] max 256) | `recs` (missing ids are left out) |
| `rank` | client → node | `id`, `board`, `measure`, `division`, `filters` (optional), `n` (optional) | `ranks`: the top rows of a slice and the asker's own row (9.5) |
| `ranks` | node → client | `id`, `slot`, `n`, `rows`, `me`, `at` (the snapshot of live states, 10.13) | |
| `rankwhy` | client → node | `id`, `board`, `measure`, `division`, `filters` (optional), `key`, `at` (optional) | `recs` with the records and live states behind one row, `slot` and `at` (9.5) |
| `facets` | either | `id`; answering, also `slot`, `models`, `harnesses`, `from`, `homes` | `facets`: the values a filter sheet offers (9.5) |
| `nets` | client → node | `id`, `keys` ([Key] max 64) | `netstats` `{id, nets, reports}` (9.5) |
| `servers` | client → node | `id` | `catalog` |
| `recs` | node → client | `id`, `items` ([{rec, rcpt: [receipts]}] max 256), `cursor`, `more` (Bool) | |
| `catalog` | node → client or node | `id` (when answering), `entries` (10.8), `more` (Bool, see below) | |
| `err` | either | `id` (when answering a request), `code` (7.2), `retry` (seconds, with `rate_limited`) | |

- **Cursors** are opaque ASCII strings of at most 64 characters `[A-Za-z0-9_-]` made by the node; a client keeps the
  last cursor per node and passes it to `sub` after a reconnect. A cursor the node no longer understands means
  "everything kept". **Every `recs` frame of a `sub` carries the cursor of what it covers**: the records of that frame
  and of the frames before it, never of frames still to come. So a client that loses the connection in the middle of a
  backlog resumes from the last frame it received, and nothing is skipped.
- **Long answers are paced.** A node sends a `sub` backlog, a `rankwhy`, a `fetch` and a `catalog` answer one frame at a
  time, the next one when the connection has taken the previous ones, so a long answer never fills the connection
  (a slow reader is not disconnected for asking). The frames keep their order and `more`; live records of a `sub`
  follow its last backlog frame (`more: false`). Requests that answer from the whole store (`rank`, `rankwhy`, `servers`, `sub`)
  cost a node more than others, and a node MAY answer them `rate_limited` (with `retry`) when one connection sends them
  too often, or while several of its answers are still being sent. A node MAY stop a backlog frame after skipping
  records the session may not see (shun votes, others' deals), so a frame can hold no items with `more: true`; its
  cursor still covers what was skipped.
- **`sub` kinds** this version does not define are ignored. A `sub` left with no kind (`kinds: []`, or only unknown
  ones) gets one `recs` frame with no items and `more: false`, and no live records: never every kind.
- **A `catalog` answer** that does not fit in one frame is split across several `catalog` frames with the same `id`,
  each with whole entries; every frame but the last carries `more: true` (the last `more: false` or no `more`). The
  receiver joins the entries of all of them.
- **`auth`** proves a key to this node. `sig` is an Ed25519 signature (3.2) by `key` over the canonical JSON (2) of
  `{"m": "auth", "key": key, "node": <the welcome's node>, "server": <the welcome's server>, "t": t}`. The node checks,
  in this order: `key` (`bad_key`), `sig` and the signature (`bad_sig`), `t` within 600 s of its clock (`too_new`,
  `too_old`). A session proves at most 4 keys (`too_many`; proving one again changes nothing). The `ack` says whether
  `key` is a current operator of the node's server (`op`). Proved keys last as long as the connection and are never
  stored. A game sends `auth` with its network's key, and with an imported operator key of that server, after it checked
  the node and before its `sub`.
- **Shun votes go to operators only.** A node sends `shun` and `unshun` records to a client session only when it proved
  a key that is a current operator of the node's server: other sessions never get them, from `sub` (backlog and live),
  `fetch` or `rankwhy`, and are not told they were left out. Between nodes they travel unchanged (9.4).
- **Reports go to their server's operators only** (5.10). A node sends a `report` to a client session only when it
  proved a key that is a current operator of the node's server, like the votes: never to its author or any other
  session, from `sub` (backlog and live), `fetch` or `rankwhy`, and other sessions are not told they were left out. A
  game puts a report only to a node of the server it names. Between nodes it travels only within that server (9.4).
- **Deals go to their two parties only** (5.3). A node sends an `offer`, `accept` or `decline` to a client session only
  when that session proved (`auth`) the record's author or its `to`. The exceptions are public by design: an `offer`
  without `to` (an open consortium project) goes to everyone, and so does an `accept` or `decline` of such an offer
  (the node has the offer stored, it has no `to`, and the record's `to` is its author), so every game can count a
  project's signers. Like the votes, this holds for `sub` (backlog and live), `fetch` and `rankwhy`, other sessions are
  not told what they did not get, and records travel unchanged between nodes (9.4). A game proves its network's key
  before its `sub` (above), so it gets its own deals from the backlog.
- **`excluded`** tells every client the outcome instead. A node sends it after the backlog of a session's first `sub`,
  and again whenever the networks it excludes change (10.7: a vote arrives, votes expire, a shun lifts, a new registry
  snapshot). `keys` is the whole list, sorted; a list that does not fit one frame is split over several `excluded`
  frames, every one but the last with `more: true`, and the receiver joins them. `reasons` appears, in the first frame
  only, for a session that proved a key the server excludes: the sorted set of reasons of the votes counting at `now`
  (10.7 step 6), never how many or whose. It is sent again to such a session when a vote for its key changes them.
- **`impl`** says what software the node runs: `{name, version}`, each 1 to 40 characters of `[0-9A-Za-z.+_-]`
  starting with a letter or digit (the reference relay: `{"name": "tubes-relay", "version": "3.6.0"}`, `"dev"` for a
  build without a version). It is optional and informational: a receiver ignores a missing or malformed one (never an
  error), shows it, and uses it for nothing else. The same member is in a node's `hello` and `welcome` (9.4).
- **`feats`** lists the optional messages a node takes in this version: `["state"]` means it takes `state` frames
  (5.11) and answers the measure `now` (9.5). It is optional: a receiver reads it as a list of strings and ignores
  anything else. A game sends `state` frames, and asks for boards of `now`, only to a node whose `welcome` lists
  `state` (an older node would close the connection on a message it does not know). The same member is in a node's
  `hello` and `welcome` (9.4).
- **`state`** sends a live state (5.11). The node checks it (7.1 steps 2 to 8 for kind `state`, then 5.11's state
  checks); a newer state is kept in memory and passed on to other nodes (9.4). A node limits each connection's states
  on its own: the reference relay allows one every 4 s with a burst of 2, and answers `rate_limited` (with `retry`)
  beyond. A `state` frame without `id` is answered only when it is refused.
- **`update`** tells an operator that a newer relay is out. A node sends it only to a client session that proved
  (`auth`) a current operator key of its server, right after the `ack` of that `auth` and again whenever what it knows
  changes; other sessions never get it and are not told. `version` is the newer version; `security` is true when the
  newer release, or one between, fixes a security issue in the relay; `source` is `feed` (the site's `relay.json`,
  section 11.4) or `github` (GitHub's latest release, read when `relay.json` cannot be, 11.4; never `security`); `notes`,
  when present, is the release notes' `https://` URL. A game shows it in the operator panel, keeping `notes` only when
  it is an `https://` URL; a malformed `update` is ignored.
- **Operator actions** in the game are `put` of operator-signed records (`hide`, `shun`, `unshun`, `operators`,
  `server`) and `cosign`. The node checks them against its chain (`not_operator`, `no_majority`). The relay's command
  line does the same over its local socket.
- A node attaches a receipt only to records it received from a client, and rate-limits each key (at most one `stats`
  per slot: `rate_limited`). Before a client has put anything, a node may rate-limit by connection address **in memory
  only** (section 12).

### 9.4 Node and node

Nodes of one server, and nodes of different servers that sync, use the same transport and these messages:

| Message | Fields | Meaning |
| --- | --- | --- |
| `hello` | `vers`, `role: "node"`, `server`, `node`, `nonce`, `impl` and `feats` (optional, 9.3) | Sent by the side that connected |
| `welcome` | `ver`, `server`, `node`, `nonce`, `proof`, `impl` and `feats` (optional, 9.3) | The answer: its own nonce, and a proof (6.2) over the caller's nonce, `body.server` its own server |
| `proof` | `proof` | The caller's proof over the answerer's nonce |
| `carry` | `classes` ([string]), `since` (slot, 0 for everything) | What this side will send (below), and from which receipt slot it wants the other side's inventory |
| `inv` | `ids` ([Id] max 4096), `more` (Bool) | Ids of records this side holds and will send, with a first receipt slot at or after the other side's `since` |
| `want` | `ids` ([Id] max 4096) | Ids it lacks and wants |
| `push` | `items` ([{rec, rcpt}] max 256) | Records, answering `want` or as they arrive |
| `states` | `items` ([state] max 256) | Live states (5.11), newer than what this side had sent: below. Only to a peer whose `hello` or `welcome` listed `state` in `feats` |
| `catalog` | `entries` | Gossip (10.8): its own entry always on connect (below), other entries on connect and whenever an entry changes, at most every 10 minutes |
| `err`, `ping`, `pong` | | As above |

1. **Who may sync.** Each side checks the other's proof (`bad_challenge`) and that the other node key is a node of the
   server it claims (`not_node`, as far as it knows the server; a server it does not know may be learned from its
   catalog entry). Nodes of the **same server** always sync everything. Between **different servers** each side applies
   its own `sync` policy (10.9); refusing is `err` `policy` and the connection closes.
   - **Own entry first.** When a session between two different servers starts (after the proofs), each side sends a
     `catalog` frame holding its own entry (10.8, `path: [its id]`), whatever its policy and the classes. A side that
     does not know the other server holds the other frames from it (`carry`, `inv`, `push`…; `ping`, `pong` and `err`
     are handled at once) until that entry has arrived and checked, then applies the policy and the node check above
     and handles the held frames in order. If the entry does not come within a short time (or too many frames pile up),
     the session ends with `not_node`. Until then it reads only the peer's own entry from `catalog` frames: entries
     for other servers sent before it are ignored (neither checked, stored nor passed on).
   - **Same server.** A node checks `not_node` against the chain it has. At the start of each same-server session,
     with its `inv`, each node also `push`es every `operators` record (applied and pending, with every signature) and
     every `server` record of its server: an added signature keeps the record id, so an inventory cannot show it, and
     the copies merge (10.11). A node that is not yet in the other node's chain is refused (`not_node`) and cannot sync
     until that node has the change; so operator tools can send a signature `--via` the `wss://` address of a node
     already listed instead of through the new node.
2. **Classes.** `players` (`announce`, `stats`, `offer`, `accept`, `decline`, `leave`), `catalog` (gossip), `advice`
   (`hide`). `shun` and `unshun` records **always travel**, whatever the classes. Between nodes of the same server all
   classes plus `genesis`, `operators` (with every signature) and `server` records travel, and `report` records (5.10),
   which are in no class: they **never** travel to another server, and a node takes none from one (`bad_kind`). A server MAY take records
   without passing them on.
3. **Inventory.** After `carry`, each side sends `inv` for what it will send; the other answers `want` with ids it
   neither has nor has refused; the first side `push`es them. Afterwards new records are `push`ed as they arrive.
   Every pushed record is checked like a record from a client (7.1); invalid ones are dropped and logged by kind and
   code, never forwarded.
4. Records keep their original signatures and receipts on every hop. Each record is stored once per server, however
   many paths brought it (10.11).
5. **Pacing.** A node answers `want` with `push` frames one at a time as the peer takes them, and MAY slow down reading
   a peer's frames (by the records, entries and ids they carry) rather than refuse them. Nothing is dropped for being
   paced.
6. **Live states** travel like records of the `players` class (same server: always), but are never stored or listed in
   an inventory. A node passes a state on when it is newer than the one it held for that key (5.11), to every session
   that takes `players` (or is of its own server) and listed `state` in `feats`, except the one it came from. It sends
   them in `states` frames, coalesced: per session the keys whose state changed, and every few seconds (the reference
   relay: every 2 s) their newest states, so a key that changed twice meanwhile costs one; a session whose send queue
   is still full keeps its keys for the next round. When a session starts (after `carry`), the node sends it every
   live state it holds. A receiver checks each state like one from a client (7.1 steps 2 to 9, 5.11), keeps it only
   when newer and passes it on the same way; invalid ones are dropped, counted, never answered. Since only newer states
   are kept and passed on, a state stops where it is already known, whatever loops the sync graph has. A node MAY skip
   checking a state whose `t` is older than the one it holds.

### 9.5 Leaderboards: what `rank`, `rankwhy`, `facets` and `nets` return

**The server ranks.** A game never downloads the records of a leaderboard: it asks for the slice it shows and gets
the top rows and its own row. The relay keeps the boards in memory (`docs/RELAY.md`, "Leaderboards") and must give
exactly what 10.1 to 10.5 and 10.12 say over the `stats` records it holds, and 10.13 over the live states it holds;
the shared vectors (`boards`, `now`, `rank`) hold it to that. The game trusts its server's ranking as it trusts its `excluded` list (non-competitive, ADR 0005), and
checks it by spot checks (below).

With `c = slot(now)` at the node:

- **`rank`** `{m, id, board, measure, division, filters?, n?}`. `board` is `traffic`, `total`, `pops`, `pies` or `cone`;
  `measure` `total` (over the window, 10.4: shown as "24 h"), `growth` (10.5) or `now` (the live states, 10.13); `division` `all`, `human` or `ai`; `n` the rows wanted, 1 to 100 (default 50);
  `filters` an object with any of the members of 10.12. A value not allowed is answered `err` `bad_field` (the frame
  is fine, so the connection stays); members of `filters` not defined here are ignored. The answer is
  **`ranks`** `{m, id, slot, n, rows, me}`:
  - `slot`: `c`, the running slot the ranking is for (its windows end at `c - 300`).
  - `at`: the time of the snapshot of live states it ranks (10.13): the whole of a board of `now`, and the running
    slot that ends the current window of the other measures. A node ranks a snapshot taken when asked, reused while it
    is under a few seconds old and in the same slot (the reference relay: 2 s for `now`, 10 s for the others), and
    keeps recent snapshots a while (the reference relay: 30 s) for `rankwhy`. **Freshness:** a node never answers a
    `rank`, `rankwhy` or `facets` from anything worked out more than 30 s before, whatever the measure, so what a game
    shows follows what networks report within about 30 s.
  - `n`: how many networks the whole slice holds.
  - `rows`: its first `n` (asked) rows in board order, each `{rank, key, value, asn, ai, name?, home?, cc?}`: `rank`
    the position in the slice (1 first), `value` the board's value (10.4, 10.5), `asn` the key's ASN (3.4), `ai`
    whether `eff(X, last)` has `ai`, `name` and `home` from the key's newest `announce` (`name` left out when the
    server's `hide` lists the key under `names`, or without an announce), `cc` the country of the record's earliest
    receipt (6.1), when it has one.
  - `me`: the row of the key this session proved with `auth` (9.3; the first proved key that is not an operator of
    this server, else the first): `{rank, value}`, `rank` `null` when the key is on the board but the filters leave it
    out; `null` when the session proved no key or the key is not on the board.
- **Who the server leaves out.** Networks this server excludes (10.7, its `excluded` list), hides or refuses (its
  current `hide` record's `hide` and `refuse` lists) are not listed, and traffic with them counts 0 (10.4): the
  "excluded" set of 10.3 is their union. Networks a player **mutes** are that player's own choice and never sent: the
  game asks for up to 50 more rows than it shows (at most 100) and leaves them out itself.
- **`rankwhy`** `{m, id, board, measure, division, filters?, key}`: the signed records behind one row. The answer is
  `recs` frames like a `fetch` (paced, each item `{rec, rcpt}` with every receipt, `more` on all but the last), each
  carrying `slot` (`c`). They hold every `stats` record the node holds of `key`, its newest `announce`, and on the
  traffic board every `stats` record of each network that any of those records lists (whose reports the min() rule
  reads and whose POPs a region asks about), except networks the server leaves out (their traffic counts 0 anyway).
  On the cone board, instead, every `stats` record and the newest `announce` of each network the key's cone can
  reach: those any held record of the key lists in `cust`, those any held record of theirs lists, and so on (whose
  `up`, traffic and `founded` decide each edge, 10.4), except networks the server leaves out.
  At most 512 such networks and 20000 records: beyond that `err` `too_many`. `key` not a Key: `bad_key`.
  Every `rankwhy` may carry `at` (the `ranks` answer's) and answers from the snapshot made then when the node still
  keeps it, else from the newest; its frames carry that snapshot's `at`. For the measures `total` and `growth` they also
  hold the live states the running slot reads (10.13): the key's and, when it has one, those of the networks named
  above (partners, cone members, whose cone lists include their live states' `cust`). For the measure `now` they hold the live states behind the row (no
  receipts): the key's, on the traffic board those of each network its state lists, on the cone board those of each
  network its cone can reach over `cust` lists of live states (with their newest announces), except networks the
  server leaves out; plus the key's newest announce and its newest `stats` record (the country, 10.12).
- **`facets`** `{m, id}`: the values a filter sheet offers. The answer `facets` `{m, id, slot, models, harnesses, from,
  homes}` lists, over the networks with a value at `last` that the server does not leave out, the AI `model`s and
  `harness`es of `eff(X, last)` (at most 64 each), the countries of their records' receipts (`from`) and the `home` of
  their newest announces (at most 256 each), each sorted and unique.
- **`nets`** `{m, id, keys}`, `keys` at most 64 Keys: what the gameplay needs of other networks without their records.
  The answer `netstats` `{m, id, nets, reports}`: `nets` `[{key, ai, tier1, tier2, pops, cust, slot}]` for each of
  `keys` the node holds a `stats` record of, from its newest one (greatest board slot, then 10.2): `tier2` (false when
  absent), `pops` the sum of its `pops` counts, `cust` how many networks its `cust` lists, `slot` its board slot (when
  it was heard). A mentor's game reads them (10.10); older games ignore the members they do not know; `reports` `[{key, in, out}]`, sorted by
  key, at most 256: every network whose newest `stats` record lists the session's own key (as for `me`), with what
  that entry says. Networks the server leaves out are left out of both.
- **Cost.** `rank` and `rankwhy` cost a client's token bucket like other requests that work from the whole store
  (9.3); a node MAY answer `rate_limited` while it is still building its boards after a start.

**Checking a ranking.** After a fresh `ranks` answer, a game checks its own row and one row picked at random from
`rows`: it asks `rankwhy` for that key and slice, checks every record and receipt as it would any other (4, 6.1),
works the key's value out with 10.1 to 10.5 and 10.12 from those records alone (the excluded set: the server's
`excluded` list and its `hide` record's `hide` and `refuse`), and compares: a row must be listed, pass the filters
and have the same `value`; `me` must match whether the key is on the board, whether it passes the filters (`rank`
null or not) and its `value`. When the `rankwhy` answer is for another slot or another `at`, or a record carries a receipt of a server the game
does not know, the row cannot be checked and nothing follows. The row is worked out at `at` (its slot `c`), each
state checked as at `at` (so one live then is never too old). A row that does not match, asked again and
still not matching, means the server sent a ranking its own records do not give: the game leaves that server's
rankings out (and prefers its other servers) for 24 hours and tells the player. Spot checks deter; they cannot prove
which networks a server left out or which rows it chose to send.

**What relays keep of `stats`:** every `stats` record whose receipt slot is in the last 72 hours (the two windows and
some slack), and besides that, for each network, its newest `stats` and its effective record at the start of the
previous window (`eff(X, c - 576 * 300)`, 10.2), each while its board slot is within the full carry-forward reach
(604800 s before the start of the previous window). The second is what carries a network's value into the windows when
it was silent for more than 72 hours and has posted again since.

## 10. Rules both sides compute

### 10.1 Slots and windows

- `slot(x) = x - (x mod 300)`.
- At time `now`, let `c = slot(now)`. The **current window** is the 288 complete slots before `c`:
  `c - 288 * 300` to `c - 300`, followed by the **running slot** `c` for keys with a live state (10.13). The **previous window** is the 288 slots before that: `c - 576 * 300` to
  `c - 289 * 300`. The slot `c` itself is still running and belongs to neither.
- The **board slot** of a record is the slot of its receipt (6.1). When a record carries several valid receipts, the
  earliest `t` among them. Never the author's `t`. A record with no valid receipt (6.1) has no board slot and takes no
  part in any board.

### 10.2 Effective record

For a key `X` and a slot `s`, `eff(X, s)` is the `stats` record of `X` with the greatest board slot `r <= s`; among
several in that slot the greatest author `t`, then the lowest id. If none, or if `s - r >= 604800` (7 days), `X` has
**no value** at `s`. If `eff(X, s)` has a `mode` other than `normal`, `X` also has no value at `s`.

This is "missing slots carry the last value forward, for up to 7 days".

### 10.3 Who is listed

At `last = c - 300`, a key `X` is **listed** on a board when it has a value at `last` (10.2), is not excluded (by the
server that ranks: shunned, hidden or refused by it, 9.5; the caller passes this set), and:

- POPs board: always.
- Pies board: `eff(X, last)` has `pies`.
- Traffic board: always.
- Total traffic board: always.
- Customer cone board: always.

With a **region filter** (a set of cities), on every board `X` is listed only with at least one POP in the region at
`last`. The totals then change as 10.4 says (the total traffic and cone boards keep the whole value: `total` is not per
city, and a cone is the network's, wherever its members are).

**Division** comes from `eff(X, last)`: AI when it has `ai`, human otherwise. `all` lists both.

### 10.4 Totals

Over the slots `s` of the window where `X` has a value:

- **POPs**: `sum of eff(X, s).pops` at the latest slot `s` of the window where `X` has a value (with a region filter:
  the sum over the cities in the region). For the current window of a listed key that is `eff(X, last)`.
- **Pies**: `eff(X, s).pies` at that same latest slot, 0 where `pies` is absent.
- **Traffic**, 95th percentile of the busier direction, as billing does:
  1. For each slot `s` and each other key `Y`:
     - `X`'s report: if `eff(X, s)` lists `Y`, its `in` and `out`; else 0 and 0.
     - If `Y` has a value at `s` (it has an effective record in `normal` mode), `Y`'s report about `X` likewise.
     - `inXY = min(X.in, Y.out)` and `outXY = min(X.out, Y.in)` when `Y` has a value; `X.in` and `X.out` when `Y` has
       no effective record at all; and 0 when `Y` has an effective record but not in `normal` mode, or `Y` is excluded.
       `Y` has **no effective record** when it has no `stats` at all or when its newest one before `s` is at or past the
       carry limit (`s - r >= 604800`, 10.2): an expired record counts as no record, not as a non-`normal` one.
     - With a region filter, only `Y` that has a value at `s` with at least one POP in the region (in `eff(Y, s).pops`)
       counts; every other `Y`, including one with no effective record, gives 0 for that slot.
  2. `IN(s) = sum over Y of inXY`, `OUT(s) = sum over Y of outXY`.
  3. `p95(list)`: with `n` values sorted ascending into `a[0..n-1]`, `k = div(n * 5, 100)`, `p95 = a[n - 1 - k]`.
     With 288 values `k = 14`: the 14 highest slots (70 minutes) do not count, the 15th does.
  4. Total = `max(p95 of IN over the window, p95 of OUT over the window)`, in Mbps.
- **Total traffic**: `p95` (as above) of `eff(X, s).total` over those slots, counting 0 where `total` is absent, in
  Mbps. A region filter does not change it (10.3).

- **Customer cone** (CAIDA's AS rank, among players): `p95` (as above) of `cone(X, s)` over those slots. `cone(X, s)`
  is the number of networks reachable from `X` over **counted edges** at `s`, `X` itself not counted (a network
  reachable several ways counts once; `X` reachable back through a cycle does not count). `Z -> Y` is a counted edge at
  `s` when all of these hold:
  1. `Z` and `Y` both have a value at `s` (10.2: an effective `normal` record, so each was heard within the 604800 s
     before `s`), and neither is excluded (10.3);
  2. `eff(Z, s).cust` lists `Y` and `eff(Y, s).up` lists `Z` (both sides confirm: one alone counts nothing);
  3. `eff(Z, s).traffic` lists `Y` with `in > 0` and `out > 0`, and `eff(Y, s).traffic` lists `Z` with `in > 0` and
     `out > 0` (traffic confirmed both ways, as the traffic board's min() rule reads it: `min(Z.in, Y.out) > 0` and
     `min(Z.out, Y.in) > 0`);
  4. `Y` is **established**: the newest `announce` of `Y` (greatest `t`, then lowest id) has
     `div(s, 86400) - founded >= 30`. Without an announce, `Y` is never established.
  Every edge along a path must be counted: a network that fails 1, 3 or 4 cuts the paths through it. `X` itself need
  not be established. A region filter does not change the value (10.3).

Rows are sorted by value, highest first, then by key in byte order; the rank is the position, starting at 1.

**Cost of the cone board** (reference relay, `relay/internal/rank/cone.go`): per state (running slot, records,
exclusions, announces), when a cone ranking is asked for: each network listing customers or upstreams is cut into
spans of slots with one record and one list; listed customers are matched against the customers' spans, giving each
edge's slots; between the slot indexes where edges start or stop the graph is constant (at most 577 graphs, and graphs
with the same edges are worked out once). One graph: strongly connected components, then each component's reach as a
bitset in reverse topological order: `O(V + E + E·V/64)` for `V` networks and `E` edges. 10000 networks in a tree of
transit (cones up to 9999): about 30 ms on one laptop core, 16 MB allocated, then cached.

### 10.5 Growth

A key is on a growth board when it is listed (10.3) and also has a value at `c - 576 * 300` (the first slot of the
previous window), which means at least 48 hours of records. With `cur` the total over the current window and `prev`
the total over the previous window (10.4, each over its own slots):

```
growth = div((cur - prev) * 10000, max(prev, FLOOR))      in basis points (10000 = +100%)
```

(for POPs and pies, `cur` and `prev` are each window's latest value, 10.4) with FLOOR = 10 for POPs and the customer cone, 100 for pies and 1000 (Mbps) for traffic and total traffic. Note floor division: -333.3 is -334.

### 10.6 Quiet networks

With `lastHeard` the newest board slot of any record by that key that the viewer has, and `age = now - lastHeard`:

| `age` | State | Demand factor (per mille) |
| --- | --- | --- |
| `< 604800` (also negative) | `active` | 1000 |
| `604800` to `< 3196800` (7 to 37 days) | `fading` | `1000 - div((age - 604800) * 1000, 2592000)` |
| `3196800` to `< 15552000` (37 to 180 days) | `dark` | 0 |
| `>= 15552000` (180 days) | `forgotten` | 0 |

The game multiplies customers' demand for that network by the factor (and may ease toward it over a few days when it
rises again). `dark` ends deals with a notice; `forgotten` deletes it from the map and the cache; relays delete its
`announce` at 180 days.

### 10.7 Shun tally

Inputs: the registry snapshot (`servers.json`, 11.3), every `shun` and `unshun` record, `now`, a `target`.

1. **Voters**: registry servers with `listed <= asOf - 2592000` (30 days) and `answered >= asOf - 1209600` (14 days),
   where `asOf` is the snapshot's own field. Servers without `listed` or `answered` are not voters. `V` is their number.
2. **Threshold**: `need = max(5, div(V + 3, 4))` (25% rounded up, at least 5).
3. **A vote at time `x`**: for each voter, take its `shun` and `unshun` records for `target` with `t <= x`, signed by a
   key in that server's `operators` in the registry (others are ignored); the latest by `t` (then the lowest id) decides.
   It is a vote when it is a `shun` and `x < t + 7776000` (90 days). `votes(x)` is the number of voters with a vote:
   one per server, however many operators signed.
4. `C(x)` is `votes(x) >= need`.
5. **Shunned** at `now` when `C(x)` holds for some integer `x` with `now - 604800 <= x <= now`. Because `C` changes
   only at a record's `t` or at `t + 7776000`, it is enough to test `x = now - 604800` and each such moment in
   `(now - 604800, now]`. So a shun lifts exactly 7 days after the votes fell below the threshold.
6. **Reasons** of the votes at `now`, counted per reason. Only operators see the counts (and the votes themselves).
   The shunned player is shown the reasons only: the set, no counts, never which servers or operators voted
   (`excluded`, 9.3). Everyone else learns only that the network is excluded.

**How a game applies the excluded lists.** Each server computes this tally itself and tells its clients the outcome
(`excluded`, 9.3). A game joined to several servers keeps each one's last list, and one dishonest operator could list
anyone: so a single list is enough to be cautious, never enough to break what is running. With `n` the number of joined
servers whose `excluded` list the game has (at least once, kept offline) and `m` the number of them listing a network:

1. `m >= 1`: **listed**. The network is hidden: left out of boards, the looking glass and the networks a game routes
   to (it counts as dark, 10.6), unless a deal with it is still running, which keeps it on the map for that deal. No
   new deal with it starts: requests to it are not sent (the game says why), offers from it are declined with reason
   `excluded`, offers waiting for review cannot be accepted.
2. `m >= 2` and `2 * m > n`: **confirmed**, a strict majority of the servers that sent a list and at least two of them.
   Only then do running deals with it end (a `decline` with reason `excluded`, as before).
3. A listed network that is not confirmed keeps its running deals; the game shows, on that network's deals, which
   servers list it and that running deals continue until other servers confirm it. With one joined server nothing is
   ever confirmed, so running deals continue until they end by their term, a decline or quiet (10.6).

The excluded network's own game shows the reasons (as above) and the names of the joined servers whose list has it,
never counts of votes.

### 10.8 Catalog gossip

An **entry** is `{genesis, chain, server, path, seen}`: the server's `genesis`, its applied `operators` records in order
(at most 64), its current `server` record, the `path` (list of server identities, at most 16) and `seen` (unix
seconds when the server itself last emitted the entry). A server emits its own entry with `path: [its id]` and
`seen = now`.

An entry MAY also carry `impl`: what the server's nodes run, a list of at most 16 items `{node, name, version}` (`node`
a node key of the server, `name` and `version` as in 9.3), sorted by `node`. The emitting server sets it (the reference
relay: itself and the nodes of its own server it has a session with), no one signs it, and it travels with the `seen`
and `path` it came with: a server passing the entry on forwards the `impl` of the entry it received, and when it keeps
an entry for its `seen` (below) it keeps that entry's `impl`. A receiver reads it leniently: a value that is not a list
or has more than 16 items is ignored, and so is an item for a key that is not one of the server's nodes or with a
malformed `name` or `version`; none of that refuses the entry. It is for display (a looking glass shows the version per
node); it never counts for anything else, update hints included (11.4). It is not part of the size check of step 1.

Receiving an entry from a neighbour, a server with identity `self`:

1. Refuses it (`err`, no store, the session goes on) if its canonical JSON (2.3) is over 61440 bytes (`too_big`: every
   entry kept then fits a client's `catalog` frame), if the records do not check (sections 4, 5, 8; the server record
   must be at the chain's final head), if `path` is empty, its first element is not the entry's server identity
   (`bad_field`), it has more than 16 elements (`too_many`) or repeats one (`duplicate`), or `seen > now + 600`
   (`too_new`). A relay checks the size before any signature, and need not check again the records of an entry it
   holds unchanged.
2. Drops it silently if `self` is in `path` (a loop) or if `now >= seen + 604800` (expired).
3. Otherwise stores it, and passes it on to neighbours that take `catalog` as `path + [self]`, unless that would make
   the path longer than 16. It also passes it, unchanged (same `path`, `seen` and `impl`), to the other nodes of its own
   server, which are not a hop: with one session per pair of servers (10.9) often only one of them has a session with
   the server the entry came from. A node starting a session with another node of its server sends it the entries it
   keeps in the same way.
4. A relay MAY bound the entries it keeps, in all and per neighbour they first came from (the reference relay: 4096
   and 512). An entry for a server it does not keep yet is then dropped silently; entries it keeps still update.

**Merging** what a viewer knows (clients and relays alike), per server identity:

- Gossip entries with `now >= seen + 604800` are ignored first.
- In the registry: genesis, chain and server record come from the registry, whatever gossip says. Gossip only adds
  `seen` and `path` (chosen as below). Registry servers never expire; without gossip their `seen` is unknown.
- Gossip only: the entry with the newest server record (greatest `t`, then lowest id) gives the records; `seen` is the
  greatest `seen` of all entries for it, and `path` comes from the entry with that `seen` (then the shortest path, then
  the lowest path compared element by element). `impl`, registry or not, comes from the freshest entry that has one. The server is forgotten when `now >= seen + 604800`.
- Standalone servers neither send nor take gossip (`policy`).

### 10.9 Sync policies

Between two different servers A and B, a session is allowed when both allow it:

- `standalone` allows no other server.
- `selective` allows the servers on its own list (in its config, not published).
- `open` allows any server that is not `standalone`.

Nodes of one server always sync, whatever the policy.

A server's policy is the `sync` of its published server record (8.2): its own for its own half, the other server's
(from the registry or the catalog) for "not `standalone`". A relay's config does not set the policy; it only holds the
`selective` list and the extra neighbours it connects to (with the classes each way; open servers in the registry need
none for each other, see "Who connects" below). Changing the policy is a new server
record, signed like any other.

**Who connects.** The policy says who may sync; this says who dials whom. Open servers in the registry find each other
there, with no configuration:

1. **Eligible.** From the registry snapshot (`servers.json`, 11.3), the servers whose server record has `sync: "open"`
   and that are **live**: `last >= asOf - 1209600` (the 14 days of 10.7, against the snapshot's `asOf`), where `last`
   is `answered`; for a server that has never answered, `listed`; for one with neither stamp, `asOf`. A server without
   stamps was merged since the last weekly run, and its listing pull request passed the live challenge (11.2 step 9),
   so it takes part as soon as relays read the snapshot that lists it. A server that never answered the weekly job
   stays live 14 days from `listed`, the same days after which that job removes it (11.3). This is liveness for
   automatic sync only: voters (10.7) still need both stamps, `listed` 30 days back and `answered` within 14 days, so a
   new server never votes early. `E` is their identities, sorted in byte order, `n = |E|`.
2. **Who takes part.** A server whose identity is in `E` and whose own current policy is `open` syncs automatically
   with its **peers** in `E` (below). Selective and standalone servers, servers not in the registry and servers that are
   not live take no part (they still sync with the neighbours their operators configure, as the policies allow).
3. **Peers.** With `cap = 64`: if `n - 1 <= cap`, every other server of `E`. Otherwise, with `i` the server's index in
   `E`: let `b` be the largest integer in `[2, n]` with `2 * (b - 1) * L(b) <= cap`, where `L(b)` is the least
   `L >= 1` with `b^L >= n` (if there is none, `b = 2`); with `L = L(b)`, the offsets are `c * b^j` for
   `1 <= c <= b - 1` and `0 <= j <= L - 1`, and the peers are the servers at indexes `(i + d) mod n` and
   `(i - d) mod n` for every offset `d`, other than `i` itself. Integers only, so every server computes the same graph
   and the same links from both ends; each server has at most `cap` peers (for `n` up to `2^32`), and any two are at
   most `L` hops apart (200 servers: `b = 17`, `L = 2`).
4. **One session per pair.** Of two peers, the one with the lower identity (byte order) dials; the other accepts (its
   `open` policy allows it). A server with several nodes dials from one of them; which one is up to the implementation
   (the reference relay: the node with the lowest key among those up), and it dials one node of the peer, going on to
   the peer's next node (from the registry) when one does not answer.
   **Fallback.** The higher identity dials too when the pair has had no session for 900 s (15 minutes), counted by the
   higher server (the node that would dial) from when the peer became one of its peers, or from the end of the last
   session with it; this covers a lower server that does not dial (an older relay, or one whose operators turned
   automatic dialling off). It keeps that session while it lasts, retries with the backoff of any dial, and stops
   dialling once a session with the peer is up that it did not dial; when a session ends, the 900 s start again. If
   both sides end up dialling, the rule below keeps one session.
5. **Classes.** Every class both ways (`players`, `catalog`, `advice`; `shun` and `unshun` always travel), unless the
   operators configured that server's nodes as neighbours: then the configured classes hold on the one session,
   whichever side dialled.
6. **Following the registry.** A relay works this out again whenever its snapshot changes (the reference relay: at
   start and on every refresh, every 6 hours): it opens sessions to new peers and closes the ones it dialled to servers
   that are no longer its peers.

A server keeps **at most one session with each other server**, automatic or configured: when a second one with the same
server is verified (9.4), the one dialled by the lower identity stays and the other closes (when both were dialled by the
same side, the newer closes), and a node does not dial a server it already has a session with. Two servers that list
each other as neighbours therefore keep one session, not one each way.

### 10.10 Deal terms

An offer relies on the `announce` named by `basis` (`not_found` if the receiver does not have it, `bad_field` if it is
not an `announce` by `to`). It is checked, in this order:

1. `basis.t <= offer.t`, otherwise `bad_field`.
2. **Still current**: the next `announce` by `to` after `basis` (smallest `t` greater than `basis.t`), if any, has
   `t > offer.t - 86400`. Otherwise `stale_terms`. (A day of grace for terms that changed while the offer was on its way.)
3. `basis.auto[deal]` is `decline`, or absent (an announce from before `wave` deals has no `auto.wave`): `declined`.
4. **Terms are the published ones** (`no_terms` when the basis publishes none for this deal, `bad_terms` when they
   differ):
   - `transit`: let `off` be the `off` of the commit tier with the greatest `mbps <= terms.mbps` (0 when none). Then
     `terms.perGbps` MUST equal `div(perGbps * (1000 - off), 1000)` and `terms.term >= rates.transit.term`.
   - `pni`: a port with `mbps == terms.mbps` exists; `terms.setup == rates.pni.setup`, `terms.monthly` equals that port's
     `monthly`, `terms.term >= rates.pni.term`.
   - `port`: `terms.at` is in `rates.ix.at`, a port with that `mbps` exists, `monthly` equal, `term >= 30`.
   - `wave`: `{a, b}` is one of `rates.wave.routes` (same `a`, same `b`); a size with `gbps == terms.gbps` exists;
     `terms.monthly` equals its `monthly`; `terms.term >= rates.wave.term`. The computer-run price of a wave (what the
     game's own vendors charge) is a ceiling the seller's game applies when it publishes, as it does for transit; it is
     not part of this rule, which needs no city table. Each game simulates its own world: the wave is a link in the
     buyer's game and capacity sold off a lit route in the seller's; the seller's route failing in its game changes
     nothing in the buyer's.
   - `peering`, `swap`, `consortium`: no prices. The policy's conditions (`cond`) need game data and are checked by the
     game, not by these rules.
   - **Newcomer price.** When `terms` has `founded` (transit, pni, port, wave), let `d = div(offer.t, 86400)`. It is
     allowed when `d - terms.founded` is 0 to 29 (the buyer joined less than 30 days before the offer) and the basis's
     `founded` gives `d - basis.founded >= 30` (the seller is established); otherwise `bad_terms`. Every price above is
     then `div(p * 750, 1000)` of the card's `p` (the transit price after its commit tier, the PNI's `setup` and
     `monthly`, the port's and the wave's `monthly`): 25% off, rounded down. Both games compute it from the offer and
     the basis alone, so they agree on the price. That `terms.founded` is the buyer's real join day is the seller's
     game's business: it declines (`conditions`) when the buyer's newest announce it has says otherwise. Two newcomers
     get no discount from each other; a renewal gets it only while the buyer is still new.
5. Then: with `auto`, the deal is binding at once (`start = offer.t`); with `review`, it binds when the counterparty
   signs `accept` (`start = accept.t`). `end = start + term * 86400`; deals whose terms have no `term` (peering,
   consortium) have no end and run until a `decline` with reason `depeer` (or the counterparty goes dark, 10.6).

An offer **without a basis** (`swap` without one, `consortium` always) skips steps 1 to 4: there are no published
terms to check, so it is never automatic and binds when the counterparty signs `accept` (`start = accept.t`, moved for
a renewal as below).

**Who checks.** Relays store and forward offers, accepts and declines after the record checks (7.1), without running
these rules: they cannot, since the terms are sealed (5.3), and they need not hold the basis. Both games apply them in
full to the offer in clear, after opening it: the requester before sending, the counterparty when it receives it and
before acting on it or accepting it.

**Prices change only at renewal.** A running deal keeps its terms until `end`, whatever newer announces say. A renewal
is an offer with `renews` set, checked as above against the basis it names; its deal starts at
`max(end of the renewed deal, its own start)` and runs its own term. A `decline` with reason `depeer` ends a deal at the
decline's `t`.

### 10.11 Merging and dedupe

- Records are stored by id. A record with an id already stored is a duplicate and changes nothing.
- A multi-signer record whose id is stored merges: the stored `sigs` become the union of both (sorted by key). A copy
  that fails validation (any signature not verifying) is refused as a whole and the stored copy stays.
- **Only signatures that count are kept.** Of an `operators` or `server` record of its own server, a relay keeps the
  author's signature and those of keys that are operators at the record's head (`prev` for `operators`, `head` for
  `server`), at most 16 in all; others are left out when storing or merging, so no copy, however padded, makes the
  record exceed 16 signers or crowd out an operator. A `put` (or `cosign`) of such a record carrying a signature of any
  other key is refused (`not_operator`). While a relay does not know the record's head yet, it keeps the author and
  the first others by key, at most 16.
- A record that fails validation is never stored, and never blocks another record.
- A game that shows the leaderboards of several servers merged takes their `ranks` rows by key (the higher `value`
  when two servers rank a key), leaves out what any of them hides or excludes and what the player muted, sorts them
  again (value, then key) and numbers them; its own row is its place among those rows, else as the first server that
  answered gives it.

### 10.12 Slices

A slice is a board, a measure, a division and any of these filters (`rank` `filters`, 9.5). Every filter left out
does not filter. The board is ranked over every listed key (10.3, with the region when `cities` is given); then a
key stays in the slice only when it passes every filter, read from `l = eff(X, last)` and `A`, the key's newest
`announce` (the greatest `t`, then the lowest id), with `day = div(c, 86400)`; ranks are positions in what stays.

| Filter | Type | A key passes when |
| --- | --- | --- |
| division | `all`, `human`, `ai` | `ai`: `l` has `ai`; `human`: it has not |
| `cities` | [City] max 512, unique | The region of 10.3 and 10.4 (listing, POPs, traffic partners; on the total traffic and cone boards, listing only) |
| `model` | Label(64) | `l.ai.model` equals it |
| `harness` | Label(64) | `l.ai.harness` equals it |
| `tier1` | Bool | `l.tier1` equals it |
| `from` | CC | The country of `l`'s earliest receipt (6.1) equals it |
| `home` | CC | `A` exists and `A.home` equals it |
| `policy` | `open`, `selective`, `restrictive` | `A` exists and `A.policy` equals it |
| `ageMin`, `ageMax` | Count(10000000) | `A` exists and `day - A.founded` is at least `ageMin` (0 when left out) and at most `ageMax` |
| `dayMin`, `dayMax` | Count(10000000) | `A` exists and `A.day` is at least `dayMin` (0 when left out) and at most `dayMax` |
| `keys` | [Key] max 256, unique | The key is one of them (a game sends the networks it has a deal with) |

On a board of `now` (10.13) the same filters read `l` = the key's live state at `at` instead of `eff(X, last)`, the
country of `from` (and of a row's `cc`) from the earliest receipt of the key's newest `stats` record (greatest board
slot, then 10.2's order; none: no country), and `day = div(at, 86400)`.

### 10.13 Boards of now

The measure `now` ranks what networks report right now, from live states (5.11) instead of the windows. Inputs: the
time of the snapshot `at`, the live states held then, the excluded set (10.3) and, for the cone board, the newest
announces. `L(X)` is `X`'s newest state (greatest `t`, then lowest id) with `at - t < 900`; `X` **counts** when `L(X)`
exists, has `mode` `normal` and `X` is not excluded.

- **Listed**: `X` counts; on the pies board `L(X)` has `pies`; with a region filter, `L(X)` has a POP in the region.
  Division: AI when `L(X)` has `ai`.
- **POPs**: the sum of `L(X).pops` (with a region, over its cities). **Pies**: `L(X).pies`. **Total traffic**:
  `L(X).total`, 0 when absent.
- **Traffic**: for each `Y` that `L(X).traffic` lists: when `Y` counts (and with a region, `L(Y)` has a POP there),
  `in += min(X.in, Y.out)` and `out += min(X.out, Y.in)` from the two states (`Y`'s report about `X`, 0 and 0 when it
  lists none); otherwise 0: **a partner without a live state counts 0** (unlike 10.4, where a network with no record
  counts what the other reports: a live board shows only what both sides confirm now). The value is `max(in, out)`.
- **Customer cone**: the cone of 10.4 over one graph: `Z -> Y` is a counted edge when both count, `L(Z).cust` lists `Y`,
  `L(Y).up` lists `Z`, each state reports traffic with the other with `in > 0` and `out > 0`, and `Y` is established at
  `at`: its newest announce has `div(at, 86400) - founded >= 30`. A region does not change it.

Rows are sorted as in 10.4. There is no growth of now.

**The running slot.** The measures `total` and `growth` (10.4, 10.5) also read the live states held at `at` (the
snapshot's time, in slot `c`): a key `X` listed on a board (10.3, unchanged: a value at `last`) whose `L(X)` exists in
normal mode has one more sample in its current window, at the running slot `c`, after the 288 complete slots (so 289
samples, and `k = div(289 * 5, 100) = 14`). There, every network reports with its live state, else with its effective
record at `c` (10.2, records of the running slot included), else nothing: `run(Y) = L(Y)`, else `eff(Y, c)`.

- POPs and pies: the sample is `L(X)`'s, and the latest of the window, so it is the value.
- Total traffic: `L(X).total` (0 when absent). Traffic: as 10.4 step 1 with `L(X)`'s list and each `Y`'s `run(Y)` in
  place of `eff(Y, s)` (no `run(Y)` at all: `X`'s report counts; `run(Y)` not in `normal` mode, or `Y` excluded: 0;
  with a region, only `Y` whose `run(Y)` is in `normal` mode with a POP there).
- Customer cone: 10.4's cone at `c` over the graph of `run(·)`, established counted at `div(c, 86400)`.
- Growth compares the current window, its running sample included, with the previous one (unchanged).

A key without a live state, or with one in another mode, has no sample there: its value is that of the complete
slots. So a change a game reports shows on every measure within seconds, not when the slot ends.

## 11. The registry

### 11.1 Files

One file per server: `federation/servers/<server identity>.json`, at most 65536 bytes:

| Field | Type | Who writes it |
| --- | --- | --- |
| `v` | 1 | |
| `genesis` | the `genesis` record | the operators |
| `chain` | [`operators` records], applied, in order, at most 64 | the operators |
| `server` | the head server record (8.2), at the chain's last head | the operators |
| `listed` | integer, optional: real day start (multiple of 86400) when first merged | only the weekly CI job |
| `answered` | integer, optional: real day start when a node last answered the job's challenge | only the weekly CI job |

No other fields. Pending proposals are never in the file.

### 11.2 `relay check-registry`

Run by CI on every pull request that touches `federation/servers/`, for each added or changed file. In this order:

1. Size at most 65536 bytes (`too_big`), JSON (`bad_json`), fields as in 11.1 (`missing_field`, `unknown_field`,
   `bad_field`).
2. Every record valid (7.1 steps 2 to 8, with `now` the wall clock at the time of the check). The `registry`
   vectors therefore carry no `now`: implementations run them with the wall clock, as CI does.
3. The file name is `<genesis id>.json` (`id_mismatch`).
4. The chain: `chain[0].prev` is the genesis id and each next `prev` is the id of the one before (`bad_chain`); each
   proposal is by an operator, applicable, and has a majority at its `prev` (`no_majority` for the majority,
   `bad_chain` otherwise).
5. The server record: valid against the chain (8.2) and its `head` is the chain's last head (`bad_chain`).
6. `server.body.noLogs` is true (`no_logs`), and every node URL in the file (the genesis node, `url` of the chain's
   proposals, the server record's `nodes`) names a host anyone can look up: no IP literal and no host ending in
   `.local` (`local_url`). Such servers are valid and can be joined by invite (a LAN party), but are not listed.
7. No other file's server name equals this one when both are compared with `A`–`Z` turned into `a`–`z` (`name_taken`).
   Only other files whose server name can be read (the file parses as JSON with a `server` record holding a string
   `name`) are compared; files that do not parse are skipped here (they fail their own check).
8. If the file exists on the base branch, `listed` and `answered` are unchanged (`bad_field`). This step does not
   apply to the weekly liveness pull request from `federation-liveness.yml` (11.3), the one place stamps change.
   `relay registry-file` copies both stamps from the existing file (`--from FILE`, by default
   `federation/servers/<id>.json` when present and not empty), so a replacement made with it passes.
9. At least one listed node answers: the check connects to each node's URL in turn (10 s timeout each), sends `hello`
   and `challenge`, and checks the `proof` (6.2) (`no_answer` when none does).

A failing check prints the file, the step and the code.

### 11.3 `servers.json`

The site build writes `_site/federation/servers.json` (served at the site's own path `federation/servers.json`) from
the folder. It includes the files that pass steps 1 to 7 of 11.2 (step 8 needs a base branch and runs only in CI on
pull requests; step 9 needs the network and is left to CI and the weekly job). The bytes are the canonical JSON (2.3)
of the object below followed by one `\n`:

```json
{"v":1,"asOf":1767225600,"servers":[{"id":"<identity>","genesis":{…},"chain":[…],"server":{…},"listed":1764633600,"answered":1767225600}]}
```

`servers` is sorted by `id` (byte order); `listed` and `answered` are copied when present; `asOf` is the greatest
`answered` of all files (0 when none). The shun tally (10.7) counts against `asOf`, not against the clock, so every
relay and every game with the same file gets the same voters.

The weekly CI job (`federation-liveness.yml`) challenges every node, sets `listed` on files that have none, updates
`answered`, and removes files not answered for 14 days (counted from `listed` for a file that never answered), in one
pull request. It is the only change to the stamps, so step 8 of 11.2 does not apply to it. A file merged since its
last run has no stamps; it is listed in `servers.json` all the same and is live for automatic sync (10.9) at once.

### 11.4 `relay.json`: the update feed

The site build also writes `_site/federation/relay.json`, beside `servers.json`, about the newest release of the
reference relay (the relay ships with every release of the game, so its version is the game's):

```json
{"v":1,"version":"3.6.0","released":"2026-11-12","security":false,"notes":"https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.6.0","minSafe":"3.5.2"}
```

| Field | Meaning |
| --- | --- |
| `v` | 1 |
| `version` | The newest release, a semantic version (semver.org 2.0) |
| `released` | Its date, `YYYY-MM-DD` |
| `security` | True when this release fixes a security issue in the relay |
| `notes` | Its release notes, an `https://` URL |
| `minSafe` | Optional: the newest release that fixed a relay security issue |

The game page never requests it. A relay reads it from the folder its registry comes from (the registry URL with its
last path segment replaced by `relay.json`, or the file `relay.json` beside a registry file), at start and on each
registry refresh, with a plain GET that sends nothing about the relay. It ignores members it does not know, a `notes`
that is not an `https://` URL, and a file over 4096 bytes or not `v: 1` (then it keeps the last one it read). A relay
running version `own`:

1. does nothing when `own` is not a semantic version (a development build);
2. is behind when `version > own` (semver precedence, build metadata ignored); the update is a security one when
   `security` is true or `own < minSafe`;
3. when `relay.json` cannot be read, asks GitHub's REST API for the project's latest release
   (`GET https://api.github.com/repos/fjaeckel/seriesoftubes/releases/latest`, unauthenticated, `Accept:
   application/vnd.github+json`, a `User-Agent` of `tubes-relay/<own>` and nothing else about the relay; at most
   256 KiB read, a short timeout) on the same schedule. `tag_name` with a leading `v` dropped must be a semantic
   version, else the answer is ignored, and so are drafts and pre-releases; `html_url` is the notes only when it is an
   `https://` page on `github.com`. It is behind when that version `> own`, `source: "github"`, never a security
   one (only `relay.json` says that). A 403 or 429 means waiting as long as `Retry-After`, or an exhausted
   rate limit's reset, asks, and at least 6 hours, doubling up to 48 hours while it repeats; the last release read is
   kept through failures. The last `relay.json` read stands unless GitHub has a newer release, and a `relay.json`
   read again replaces what GitHub said.

Versions other servers report (`impl`, 10.8 and 9.4) are shown and never give a hint, however many report one.

How a relay tells its operators is up to it (the reference relay: its log, `relay status`, metrics, the `update` frame
of 9.3 and an optional webhook; see docs/RELAY.md). It never tells anyone else.

## 12. Privacy

1. No record, receipt, proof, frame, file or log line carries an IP address, a city or anything finer than a country,
   a device, browser, user agent, time zone, email or account. (The one address a record may hold is a LAN server's
   own local node address in its node URL (5, Url): the server's, never a player's, and never routable.) The schemas make that structural: unknown fields are
   refused, and no field holds free text about a person.
2. The only place a country appears is `cc` in a receipt for a `stats` record whose author set `shareCountry`.
3. Receipt times are slots: exact times of activity are never kept.
4. A relay uses the connection address only in memory: to look up the country (in a country-only database) and to
   rate-limit connections before a client has put anything, counting for a few minutes. It never writes it.
5. Relay logs hold counts, error codes, record kinds and network keys; never addresses or headers.
6. Registered servers declare `noLogs: true` for everything in front of the relay too.
7. Shun votes are for operators: a `shun` or `unshun` record goes from node to node, and from a node only to a client
   session that proved an operator key of that node's server (9.3). Games of other players never receive, store or
   show votes; they learn which networks are excluded (`excluded`), and an excluded network which reasons were given,
   without counts or which servers and operators voted (it sees which of its own joined servers list it, 10.7).
8. Deals are private (5.3): offers to someone and declines are sealed for the other party (3.5), and relays send deal
   records only to the sessions of their two parties (9.3). An operator sees that two networks exchanged deal records
   and when, never which deal, its terms or the reason for a no. Open consortium projects are public by design.
9. The customer cone board makes transit relationships between players public: a network's `stats` lists whom it
   sells transit to and buys it from (`cust`, `up`), never the price or terms, as BGP paths show real ones.
10. No operator can end other players' deals alone: a game ends running deals with an excluded network only when most
   of its joined servers, and at least two, list it (10.7).
11. Reports are for the operators of the server they name (5.10): a node sends them only to sessions that proved an
   operator key of its server, and only to the other nodes of that server. The reported network, other players and
   other servers never learn that a report was made, by whom or why. Operators see the reporters' network keys and
   names, as on any record: networks, never people.
12. Live states (5.11) carry the fields of a `stats` record and nothing else. No node stores them: they are kept in
   memory, the newest of each key, until 900 s after their `t`, and passed to other nodes as records of the `players`
   class are. A game sends one at most every 5 s, and only while it is visible.

## 13. Constants

### 13.1 Times

| Name | Value |
| --- | --- |
| Earliest `t` | 1735689600 (2025-01-01) |
| Clock skew allowed | 600 s |
| Slot | 300 s |
| Window | 288 slots (86400 s) |
| Carry forward | 604800 s (7 days) |
| Proof freshness | 300 s |
| Pending proposal life | 1209600 s (14 days) |
| Vote life | 7776000 s (90 days) |
| Shun lift delay | 604800 s (7 days) |
| Voter: listed for | 2592000 s (30 days) |
| Voter: answered within | 1209600 s (14 days) |
| Gossip expiry | 604800 s (7 days) |
| Offer kept by relays | 2592000 s (30 days) |
| Report kept by relays | 2592000 s (30 days) |
| Quiet: fading, dark, forgotten | 604800, 3196800, 15552000 s |
| Deal terms grace | 86400 s |
| Shortest exchange port term | 30 days |
| Newcomer: joined less than, newcomer price | 30 days, 750 per mille of the card |
| Cone member: joined at least | 30 days before the slot |
| Live state: live for, maximum age, ahead | 900 s, 900 s, 600 s |
| Live state from a game: every, keepalive, at least apart | 10 s, 180 s, 5 s |

### 13.2 Records

| Kind | Signers | Max bytes | Max age |
| --- | --- | --- | --- |
| `announce` | one | 16384 | none |
| `stats` | one | 40960 | 777600 s (9 days: 7 to carry forward, 2 for the window) |
| `offer` | one | 4096 | 2592000 s (30 days) |
| `accept` | one | 1024 | 2592000 s |
| `decline` | one | 1024 | 2592000 s |
| `genesis` | one | 2048 | none |
| `operators` | several | 8192 | none |
| `server` | several | 16384 | none |
| `hide` | one | 32768 | none |
| `shun` | one | 1024 | 7776000 s (90 days) |
| `unshun` | one | 1024 | 7776000 s |
| `leave` | one | 512 | none |
| `report` | one | 1024 | 2592000 s (30 days) |
| `state` (5.11, never stored) | one | 40960 | 900 s |
| `receipt` | one (a node) | 1024 | none |
| `proof` | one (a node) | 1024 | ±300 s |

### 13.3 Lists and frames

| What | Limit |
| --- | --- |
| Client frame | 65536 bytes |
| Node frame | 1048576 bytes |
| Depth | 8 |
| Member name | 32 characters |
| POP cities in `announce` and `stats` | 512 |
| Traffic entries | 256 |
| `stats` `cust`, `up` | 128, 16 |
| Signers, operators, nodes | 16 |
| Box ciphertext (3.5), tag included | 17 to 2048 bytes |
| Keys proved by one client session (`auth`) | 4 |
| `ranks` rows | 50 unless `n` asks, at most 100 |
| `rank` filter `keys`, `cities` | 256, 512 |
| `nets` keys, `netstats` reports | 64, 256 |
| `rankwhy`: networks listed, records | 512, 20000 |
| `facets`: models and harnesses, countries | 64, 256 each |
| Hide lists together | 512 |
| Reports kept: per author and target; new per author and day; in all (reference relay, 5.10) | 1; 20; 65536 |
| Chain in a registry file or catalog entry | 64 |
| Catalog entry (canonical JSON) | 61440 bytes |
| Gossip path | 16 |
| Automatic sync peers of one server (10.9, `cap`) | 64 |
| Automatic sync: the higher identity dials after, without a session (10.9) | 900 s (15 minutes) |
| `impl` items in a catalog entry; `impl` name and version | 16; 40 characters each |
| `relay.json` | 4096 bytes |
| GitHub latest-release answer (11.4) | 262144 bytes |
| `fetch` ids, `recs`, `push` and `states` items | 256 |
| `inv` and `want` ids | 4096 |
| Names, descriptions, AI model and harness | 40, 280, 64, 64 code points |
| Registry file | 65536 bytes |

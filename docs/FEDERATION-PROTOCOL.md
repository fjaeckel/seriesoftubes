# Federation protocol, version 1

The wire protocol and the shared rules of multiplayer ("federation"). Design and reasons:
[docs/plans/federation.md](plans/federation.md); decision: [ADR 0005](adr/0005-federation-by-player-run-servers.md).

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

### 3.2 Signatures

- **Ed25519 only** (RFC 8032, pure Ed25519, no context, no prehash). WebCrypto `Ed25519` in the browser, `crypto/ed25519`
  in Go. A browser without WebCrypto Ed25519 does not offer multiplayer; there is no fallback algorithm.
- A private key is a 32-byte seed. WebCrypto imports it as PKCS#8: the 16 bytes `302e020100300506032b657004220420`
  followed by the seed. Go: `ed25519.NewKeyFromSeed`.
- The signed bytes are always the UTF-8 canonical JSON of an object (section 4), so every signature in the protocol is
  over an object with a `kind`. Kinds are disjoint, so a signature made for one purpose can never be presented as
  another (a proof is never a receipt, a receipt never a record).
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
except `operators` and `server`.

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
| Url | ASCII string of at most 200 bytes matching `^wss://H(:P)?(/[A-Za-z0-9._~/-]*)?$`, where H is a lower-case host name of dot-separated labels `[a-z0-9]([a-z0-9-]*[a-z0-9])?` with at least one dot and not made only of digits and dots (no IP literals), and P is a port 1 to 65535 without leading zeros. No user info, query or fragment |
| [T] max n | A list of T with at most n entries (`too_many`); entries that are sets are unique (`duplicate`) |

All listed fields are required unless marked optional (`missing_field`). Fields not listed are refused
(`unknown_field`). When several fields are wrong, the error of the first in table order is reported, but vectors only
ever hold one fault.

### 5.1 `announce` (client)

A network's public description: enough for other games to build it as a network, plus its published terms. The newest
`announce` of a key (greatest `t`, then lowest id) replaces older ones.

| Field | Type | Rule |
| --- | --- | --- |
| `name` | Name | The network's name, as typed |
| `asn` | integer | MUST equal the ASN of `key` (3.4) |
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
| `auto` | object | How requests are handled: `{peering, transit, pni, swap, consortium, port}`, all six required, each `auto`, `review` or `decline` |

`cond`, the conditions of a selective policy: `{minMbps: Mbps, maxRatio: integer 100 to 100000 (the highest in/out ratio
accepted, times 100: 300 means 3:1), minShared: Count(64) (shared locations), rpki: Bool, tier1: Bool (Tier 1 only),
ai: Bool (AI players accepted)}`, all required.

`rates`, every part optional:

- `transit`: `{perGbps: Money (per Gbps per month at the 95th percentile), commit: [{mbps: Mbps, off: Count(900)}] max 8
  with strictly ascending `mbps` (discount per mille for committing at least `mbps`), term: Days (minimum term)}`.
- `pni`: `{setup: Money, ports: [{mbps: Mbps, monthly: Money}] 1 to 8 with strictly ascending mbps, term: Days}`.
- `ix` (an exchange it runs): `{ports: [{mbps, monthly}] 1 to 8 with strictly ascending mbps, join: anyone|selective|approval, at: [City] 1 to 16 unique}`.

Example (keys and signatures shortened):

```json
{"v":1,"kind":"announce","key":"q6-YSQ…PWMw","t":1767312000,"sig":"…","body":{
 "name":"Ping Floyd","asn":4215690104,"home":"DE","day":412,"founded":20454,
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

| Field | Type | Rule |
| --- | --- | --- |
| `mode` | string | `normal`, `sandbox`, `open_gates`, `puzzle`, `scenario`, `weekly` or `architect`. Only `normal` is ranked |
| `pops` | object | City → POPs in service in that city, 1 to 1000. At most 512 members (`too_many`); member names that are not City: `bad_field`; cities with none are left out. In this game version a network has at most one POP per city, so every count is 1; the count stays for later versions |
| `pies` | Count(10000000), optional | Pies in service (`pieLiveAll()`). Absent: the save has no Pie in the Sky company |
| `traffic` | [{key: Key, in: Mbps, out: Mbps}] max 256 | Traffic with each other player network right now: `in` received from it, `out` sent to it. Keys unique (`duplicate`), never the author's own (`bad_field`) |
| `tier1` | Bool | Tier 1 in the game's rank |
| `ai` | object, optional | `{model: Label(64), harness: Label(64)}`, declared by whoever runs the agent. Absent: a human |
| `shareCountry` | Bool | The player lets the server attach their country |

```json
{"v":1,"kind":"stats","key":"q6-YSQ…PWMw","t":1767312000,"sig":"…","body":{
 "mode":"normal","pops":{"ams":1,"fra":2,"lon":1},"pies":12,
 "traffic":[{"key":"BydB2y…CSz0","in":1800,"out":2400},{"key":"Of174J…dUKns","in":300,"out":0}],
 "tier1":false,"ai":{"model":"example-model-1","harness":"tubes-mcp"},"shareCountry":true}}
```

### 5.3 `offer`, `accept`, `decline` (client)

Deals between players. Each record has one signer; a deal's two signatures are the two records that make it
(an offer and an accept, or an offer and the counterparty's own `announce` it relies on, see 10.10). Records stay
immutable, and nobody has to be online at the same time as anyone else.

`offer`:

| Field | Type | Rule |
| --- | --- | --- |
| `to` | Key | The counterparty, never the author (`bad_field`). Optional for `consortium` only (absent: open to anyone) |
| `deal` | string | `peering`, `transit`, `pni`, `swap`, `consortium` or `port` |
| `basis` | Id | The counterparty's `announce` whose terms the offer takes. Required for `peering`, `transit`, `pni`, `port`; optional for `swap`; refused for `consortium` (`bad_field`) |
| `renews` | Id, optional | The offer that started the running deal this one renews |
| `terms` | object | By `deal`, below |

| `deal` | `terms` |
| --- | --- |
| `peering` | `{at: [City] 1 to 16 unique, via: ix\|pni}` |
| `transit` | `{mbps: Mbps (committed), perGbps: Money, term: Days, at: [City] 1 to 16 unique}` |
| `pni` | `{at: City, mbps: Mbps, setup: Money, monthly: Money, term: Days}` |
| `port` | `{at: City, mbps: Mbps, monthly: Money, term: Days}` |
| `swap` | `{give: {a: City, b: City, mbps: Mbps}, take: {a: City, b: City, mbps: Mbps}, term: Days}` |
| `consortium` | `{name: Name, a: City, b: City, members: integer 2 to 16, share: Money, pairs: integer 1 to 16}` |

`accept`: `{offer: Id, to: Key}` where `to` is the offer's author. `decline`: `{offer: Id, to: Key, reason}` with
`reason` one of `declined`, `conditions`, `depeer`, `excluded`, `quiet`. A `decline` of a running deal ends it.

```json
{"v":1,"kind":"offer","key":"Fz3…","t":1767312000,"sig":"…","body":{
 "to":"q6-YSQ…PWMw","deal":"transit","basis":"<id of alice's announce>",
 "terms":{"mbps":10000,"perGbps":810,"term":90,"at":["fra"]}}}
{"v":1,"kind":"accept","key":"q6-YSQ…PWMw","t":1767312600,"sig":"…","body":{"offer":"<offer id>","to":"Fz3…"}}
```

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
   `unknown_server`.

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
| `too_old` | Before 2025-01-01 or past the kind's maximum age | no |
| `too_new` | More than 600 s ahead | no |
| `not_operator` | Signed by a key that is not a current operator of that server | no |
| `not_node` | A node key that is not one of the server's nodes | yes for node sessions |
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
otherwise), as far as the receiver knows the server's chain (`unknown_server` if it knows nothing of it). Relays refuse
`shun` and `unshun` of servers they know nothing of (from the registry, the catalog or their own chain) and neither
store nor pass them on: such a vote could never count (10.7 counts registry servers only), and keeping them would let
anyone fill every relay's store and tally.

## 9. The wire protocol

### 9.1 Transport

- WebSocket over TLS only (`wss://`), subprotocol **`tubes-fed.1`**. A node refuses a connection without it. The
  subprotocol names this framing; the protocol version inside is negotiated by `hello`.
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

### 9.3 Client and node

| Message | Direction | Fields | Answer |
| --- | --- | --- | --- |
| `hello` | client → node | `vers`, `role: "client"` | `welcome` |
| `welcome` | node → client | `ver` (chosen), `server` (Id), `node` (Key), `now` | |
| `challenge` | client → node | `id`, `nonce` | `proof` `{m, id, proof}`, a proof envelope (6.2) |
| `put` | client → node | `id`, `rec` (a record) | `ack` or `err` |
| `ack` | node → client | `id`; answering `put` and `cosign` also `rid` (record id), `dup` (Bool: already had it) and `rcpt` (the receipt, when the record came from this client); answering `unsub` only `id` | |
| `cosign` | client → node | `id`, `rid` (a pending proposal or server record), `key`, `sig` | `ack` or `err`: adds one operator signature to a multi-signer record (same check as 4 and 8) |
| `sub` | client → node | `id`, `kinds` ([kind]), `since` (cursor, `""` for everything kept) | `recs` frames carrying the `id`, first the backlog, then live records, until `unsub` |
| `unsub` | client → node | `id` (of the `sub`) | `ack` |
| `fetch` | client → node | `id`, `ids` ([Id] max 256) | `recs` (missing ids are left out) |
| `board` | client → node | `id` | `recs` with what the boards need (9.5) |
| `servers` | client → node | `id` | `catalog` |
| `recs` | node → client | `id`, `items` ([{rec, rcpt: [receipts]}] max 256), `cursor`, `more` (Bool) | |
| `catalog` | node → client or node | `id` (when answering), `entries` (10.8), `more` (Bool, see below) | |
| `err` | either | `id` (when answering a request), `code` (7.2), `retry` (seconds, with `rate_limited`) | |

- **Cursors** are opaque ASCII strings of at most 64 characters `[A-Za-z0-9_-]` made by the node; a client keeps the
  last cursor per node and passes it to `sub` after a reconnect. A cursor the node no longer understands means
  "everything kept". **Every `recs` frame of a `sub` carries the cursor of what it covers**: the records of that frame
  and of the frames before it, never of frames still to come. So a client that loses the connection in the middle of a
  backlog resumes from the last frame it received, and nothing is skipped.
- **Long answers are paced.** A node sends a `sub` backlog, a `board`, a `fetch` and a `catalog` answer one frame at a
  time, the next one when the connection has taken the previous ones, so a long answer never fills the connection
  (a slow reader is not disconnected for asking). The frames keep their order and `more`; live records of a `sub`
  follow its last backlog frame (`more: false`). Requests that answer from the whole store (`board`, `servers`, `sub`)
  cost a node more than others, and a node MAY answer them `rate_limited` (with `retry`) when one connection sends them
  too often, or while several of its answers are still being sent.
- **A `catalog` answer** that does not fit in one frame is split across several `catalog` frames with the same `id`,
  each with whole entries; every frame but the last carries `more: true` (the last `more: false` or no `more`). The
  receiver joins the entries of all of them.
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
| `hello` | `vers`, `role: "node"`, `server`, `node`, `nonce` | Sent by the side that connected |
| `welcome` | `ver`, `server`, `node`, `nonce`, `proof` | The answer: its own nonce, and a proof (6.2) over the caller's nonce, `body.server` its own server |
| `proof` | `proof` | The caller's proof over the answerer's nonce |
| `carry` | `classes` ([string]), `since` (slot, 0 for everything) | What this side will send (below), and from which receipt slot it wants the other side's inventory |
| `inv` | `ids` ([Id] max 4096), `more` (Bool) | Ids of records this side holds and will send, with a first receipt slot at or after the other side's `since` |
| `want` | `ids` ([Id] max 4096) | Ids it lacks and wants |
| `push` | `items` ([{rec, rcpt}] max 256) | Records, answering `want` or as they arrive |
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
   classes plus `genesis`, `operators` (with every signature) and `server` records travel. A server MAY take records
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

### 9.5 What `board` returns

With `c = slot(now)`, the node returns every `stats` record whose receipt slot `s` satisfies
`c - 576 * 300 <= s < c`, plus for each key the newest `stats` with `c - 576 * 300 - 604800 < s < c - 576 * 300`
(for carrying forward), plus the newest `announce` of each of those keys and the server's current `hide` record. The
client computes everything from these (10.3 to 10.5).

**What relays keep of `stats`:** every `stats` record whose receipt slot is in the last 72 hours (the two windows and
some slack), and besides that the newest `stats` of each network for the full carry-forward reach (604800 s before the
start of the previous window), so that the carry records above can always be returned. Older ones are deleted.

## 10. Rules both sides compute

### 10.1 Slots and windows

- `slot(x) = x - (x mod 300)`.
- At time `now`, let `c = slot(now)`. The **current window** is the 288 complete slots before `c`:
  `c - 288 * 300` to `c - 300`. The **previous window** is the 288 slots before that: `c - 576 * 300` to
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

At `last = c - 300`, a key `X` is **listed** on a board when it has a value at `last` (10.2), is not excluded (shunned,
hidden by this server, muted by this player; the caller passes this set), and:

- POPs board: always.
- Pies board: `eff(X, last)` has `pies`.
- Traffic board: always.

With a **region filter** (a set of cities), on every board `X` is listed only with at least one POP in the region at
`last`. The totals then change as 10.4 says.

**Division** comes from `eff(X, last)`: AI when it has `ai`, human otherwise. `all` lists both.

### 10.4 Totals

Over the slots `s` of the window where `X` has a value:

- **POPs**: the lowest of `sum of eff(X, s).pops` (with a region filter: the sum over the cities in the region).
- **Pies**: the lowest of `eff(X, s).pies`, counting 0 where `pies` is absent.
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

Rows are sorted by value, highest first, then by key in byte order; the rank is the position, starting at 1.

### 10.5 Growth

A key is on a growth board when it is listed (10.3) and also has a value at `c - 576 * 300` (the first slot of the
previous window), which means at least 48 hours of records. With `cur` the total over the current window and `prev`
the total over the previous window (10.4, each over its own slots):

```
growth = div((cur - prev) * 10000, max(prev, FLOOR))      in basis points (10000 = +100%)
```

with FLOOR = 10 for POPs, 100 for pies and 1000 (Mbps) for traffic. Note floor division: -333.3 is -334.

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
6. **Reasons** shown to the shunned player: the votes at `now`, counted per reason.

### 10.8 Catalog gossip

An **entry** is `{genesis, chain, server, path, seen}`: the server's `genesis`, its applied `operators` records in order
(at most 64), its current `server` record, the `path` (list of server identities, at most 16) and `seen` (unix
seconds when the server itself last emitted the entry). A server emits its own entry with `path: [its id]` and
`seen = now`.

Receiving an entry from a neighbour, a server with identity `self`:

1. Refuses it (`err`, no store) if the records do not check (sections 4, 5, 8; the server record must be at the chain's
   final head), if `path` is empty, its first element is not the entry's server identity (`bad_field`), it has more
   than 16 elements (`too_many`) or repeats one (`duplicate`), or `seen > now + 600` (`too_new`).
2. Drops it silently if `self` is in `path` (a loop) or if `now >= seen + 604800` (expired).
3. Otherwise stores it, and passes it on to neighbours that take `catalog` as `path + [self]`, unless that would make
   the path longer than 16.
4. A relay MAY bound the entries it keeps, in all and per neighbour they first came from (the reference relay: 4096
   and 512). An entry for a server it does not keep yet is then dropped silently; entries it keeps still update.

**Merging** what a viewer knows (clients and relays alike), per server identity:

- Gossip entries with `now >= seen + 604800` are ignored first.
- In the registry: genesis, chain and server record come from the registry, whatever gossip says. Gossip only adds
  `seen` and `path` (chosen as below). Registry servers never expire; without gossip their `seen` is unknown.
- Gossip only: the entry with the newest server record (greatest `t`, then lowest id) gives the records; `seen` is the
  greatest `seen` of all entries for it, and `path` comes from the entry with that `seen` (then the shortest path, then
  the lowest path compared element by element). The server is forgotten when `now >= seen + 604800`.
- Standalone servers neither send nor take gossip (`policy`).

### 10.9 Sync policies

Between two different servers A and B, a session is allowed when both allow it:

- `standalone` allows no other server.
- `selective` allows the servers on its own list (in its config, not published).
- `open` allows any server that is not `standalone`.

Nodes of one server always sync, whatever the policy.

A server's policy is the `sync` of its published server record (8.2): its own for its own half, the other server's
(from the registry or the catalog) for "not `standalone`". A relay's config does not set the policy; it only holds the
`selective` list and the neighbours it connects to (with the classes each way). Changing the policy is a new server
record, signed like any other.

### 10.10 Deal terms

An offer relies on the `announce` named by `basis` (`not_found` if the receiver does not have it, `bad_field` if it is
not an `announce` by `to`). It is checked, in this order:

1. `basis.t <= offer.t`, otherwise `bad_field`.
2. **Still current**: the next `announce` by `to` after `basis` (smallest `t` greater than `basis.t`), if any, has
   `t > offer.t - 86400`. Otherwise `stale_terms`. (A day of grace for terms that changed while the offer was on its way.)
3. `basis.auto[deal]` is `decline`: `declined`.
4. **Terms are the published ones** (`no_terms` when the basis publishes none for this deal, `bad_terms` when they
   differ):
   - `transit`: let `off` be the `off` of the commit tier with the greatest `mbps <= terms.mbps` (0 when none). Then
     `terms.perGbps` MUST equal `div(perGbps * (1000 - off), 1000)` and `terms.term >= rates.transit.term`.
   - `pni`: a port with `mbps == terms.mbps` exists; `terms.setup == rates.pni.setup`, `terms.monthly` equals that port's
     `monthly`, `terms.term >= rates.pni.term`.
   - `port`: `terms.at` is in `rates.ix.at`, a port with that `mbps` exists, `monthly` equal, `term >= 30`.
   - `peering`, `swap`, `consortium`: no prices. The policy's conditions (`cond`) need game data and are checked by the
     game, not by these rules.
5. Then: with `auto`, the deal is binding at once (`start = offer.t`); with `review`, it binds when the counterparty
   signs `accept` (`start = accept.t`). `end = start + term * 86400`; deals whose terms have no `term` (peering,
   consortium) have no end and run until a `decline` with reason `depeer` (or the counterparty goes dark, 10.6).

An offer **without a basis** (`swap` without one, `consortium` always) skips steps 1 to 4: there are no published
terms to check, so it is never automatic and binds when the counterparty signs `accept` (`start = accept.t`, moved for
a renewal as below).

**Who checks.** Relays store and forward offers, accepts and declines after the record checks (7.1), without running
these rules: they need not hold the basis. Games check each offer against these rules when they receive it and before
acting on it or accepting it.

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
- Merging leaderboards of several servers is the union of their records by id, then the same rules.

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
6. `server.body.noLogs` is true (`no_logs`).
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
`answered`, and removes files not answered for 14 days, in one pull request. It is the only change to the stamps, so
step 8 of 11.2 does not apply to it.

## 12. Privacy

1. No record, receipt, proof, frame, file or log line carries an IP address, a city or anything finer than a country,
   a device, browser, user agent, time zone, email or account. The schemas make that structural: unknown fields are
   refused, and no field holds free text about a person.
2. The only place a country appears is `cc` in a receipt for a `stats` record whose author set `shareCountry`.
3. Receipt times are slots: exact times of activity are never kept.
4. A relay uses the connection address only in memory: to look up the country (in a country-only database) and to
   rate-limit connections before a client has put anything, counting for a few minutes. It never writes it.
5. Relay logs hold counts, error codes, record kinds and network keys; never addresses or headers.
6. Registered servers declare `noLogs: true` for everything in front of the relay too.

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
| Quiet: fading, dark, forgotten | 604800, 3196800, 15552000 s |
| Deal terms grace | 86400 s |
| Shortest exchange port term | 30 days |

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
| Signers, operators, nodes | 16 |
| Hide lists together | 512 |
| Chain in a registry file or catalog entry | 64 |
| Gossip path | 16 |
| `fetch` ids, `recs` and `push` items | 256 |
| `inv` and `want` ids | 4096 |
| Names, descriptions, AI model and harness | 40, 280, 64, 64 code points |
| Registry file | 65536 bytes |

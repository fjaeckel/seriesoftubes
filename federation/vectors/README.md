# Federation test vectors

Shared test vectors for [the federation protocol](../../docs/FEDERATION-PROTOCOL.md). The relay (Go, `relay/`) and the
game (JavaScript, `tests/federation-vectors.test.js`) both run every file here and must agree with every `expect`.
They are also how a third implementation knows it is right.

## Rules for implementations

1. Run **every** `*.json` file in **every** folder. A folder your runner does not know is a failure, not a skip, so
   a new area can never be silently ignored.
2. Compare results exactly: error codes as strings, numbers as integers, lists in the order given (they are already
   in the order the spec defines). Objects compare by members, not by text.
3. A vector holds **one** fault. Where the expected result is an error, return that code and no other.
4. Inject the clock: use `now` from the vector, never the machine's clock. The one exception is `registry`, whose
   vectors have no `now`: the check runs with the wall clock, as CI does (spec 11.2). Nothing here needs the network.
5. A change to a rule changes the vectors first (and the spec in the same change); then both implementations follow.

## File format

Most files are one vector:

```json
{ "description": "what is tested and, for rules, the working", "input": { … }, "expect": { … } }
```

Where many tiny cases share one rule, a file holds a list instead:

```json
{ "description": "…", "cases": [ { "input": { … }, "expect": { … } } ] }
```

Files are numbered (`001-…`) only to keep a stable order; the number means nothing.

## Who writes what

- **Generated** by [`scripts/fed-vectors.js`](../../scripts/fed-vectors.js) from fixed seeds: `signing`, `asn`,
  `records`, `receipts`, `proofs`, `auth`, `operators`, `registry`, `dedupe`, `rank`, `box`. Never edit these by hand: change the script and
  run `node scripts/fed-vectors.js` (CI can run `node scripts/fed-vectors.js --check`). Keys are Ed25519 from the seed
  SHA-256("tubes-fed.1 vector key <name>") for the names alice, bob, carol, mallory (networks), anna, ben, cleo, dan
  (operators) and node1, node2, node3 (nodes). Ed25519 is deterministic, so the files never change unless the script
  does. The script only fills in keys, signatures and ids; which result is expected is written as a literal in it.
- **Hand-written**, with the working in each `description`: `canonical`, `slots`, `boards`, `now`, `quiet`, `shun`,
  `catalog`, `deals`, `majority`, `sync`, `autosync`, `wire`, `impl`. Edit these files directly. They use short labels (`kA`, `s01`,
  `o01`, `r1`) for keys, server identities, operator keys and record ids: treat them as opaque strings, compared in
  byte order like real ones. Their records are already validated, so only the rule under test applies.

## Areas

| Folder | Spec | `input` | `expect` |
| --- | --- | --- | --- |
| `canonical` | 2 | `text` (JSON text), or `hex` (raw bytes) | `canonical` (the canonical text) or `error` |
| `signing` | 3.2, 3.3 | `seeds` (name → hex) or `seed`/`seeds` and `unsigned` (a record without `sig`/`sigs`) | `keys` (name → Key); or `signed_text`, `sig` or `sigs`, `id` (and the full `record`) |
| `asn` | 3.4 | cases: `key` | `asn` |
| `records` | 2, 4, 5, 7.1 steps 2–8 | `now` and either `record` (a parsed value) or `text` (JSON text to parse first); `as: "state"` when it is checked where a live state is expected (5.11, a `state` frame) | `{ok: true, kind, id}` or `{ok: false, error}` |
| `receipts` | 6.1 | `now`, `server`, `nodes` (the server's node keys), `record`, `receipt` | `{ok: true}` or `{ok: false, error}` |
| `proofs` | 6.2 | `now`, `nonce`, `server`, `node` (the node asked), `proof` | `{ok: true}` or `{ok: false, error}` |
| `auth` | 9.3 | `now`, `node` (the node's key), `server`, `auth` (the client's `auth` frame) | `{ok: true}` or `{ok: false, error}` |
| `operators` | 8 | `now`, `genesis`, `records` (`operators` proposals); optionally `server` | `{head, operators, nodes, pending}` (lists sorted by key, `pending` as ids); with `server`: `{ok}` or `{ok: false, error}` |
| `registry` | 11 | `files` (file name → file object, or `{text}` for raw text), `check` (the file to check), optional `base` (that file on the base branch) | `{ok: true}` or `{ok: false, error}`; for the build: `servers_json` |
| `dedupe` | 10.11 | `now`, `arrivals` (in order, each `{record}` or `{text}`) | `stored` (sorted by id; multi-signer records with their signer keys) and `results` per arrival: `stored`, `duplicate`, `merged` or an error code |
| `slots` | 10.1, 10.2 | cases: `t` → `slot`; `now` → windows; `receipts` → board slot. Files: `records` (`{id, key, slot, t, mode}`) and `queries` (slots) | as named; `results` per query: `{s, eff (id or null), value}` |
| `boards` | 10.3–10.5 | `now`, `board` (`pops`, `pies`, `traffic`, `total`, `cone`), `measure` (`total`, `growth`), `division` (`all`, `human`, `ai`), `exclude` (keys), `cities` (region filter or null), `founded` (cone board: key -> founded of its newest announce; a key without one has no announce), `records` (`{id, key, slot, t, body}`, `slot` being the board slot), optional `states` (live states held at `now`, `{id, key, t, body}`: the running slot, 10.13) | `rows`: `[{key, value}]` in board order |
| `now` | 10.13 | `now` (the snapshot's time), `board`, `division`, `exclude`, `cities`, `founded` (as in `boards`), `states` (live states `{id, key, t, body}`, in the order they arrived) | `rows`: `[{key, value}]` in board order |
| `rank` | 9.5, 10.12 | `now`, `request` (a `rank` frame), `me` (the proved key, or null), `excluded` (keys the server leaves off), `names` (keys shown without a name), `records` (as in `boards`, plus `cc`), `announces` (`{key, name, home, policy, founded, day}`) | the `ranks` answer `{slot, n, rows, me}`, or `{error}`. Run by servers; a game merges answers instead |
| `quiet` | 10.6 | cases: `now`, `lastHeard` | `{state, factor}` |
| `shun` | 10.7 | `now`, `target`, `registry` (`{asOf, servers: [{id, operators, listed?, answered?}]}`), `records` (`{id, kind, key, t, server, target, reason?}`) | `{voters, need, votes, shunned, reasons}` (`votes` and `reasons` at `now`) |
| `catalog` | 10.8 | receiving: `now`, `self`, `entry` (`{id, path, seen}`, records assumed valid). Merging: `now`, `registry` and `gossip` with server records summarised as `{rid, t, name, nodes, operators}` | receiving: `{action: store, forward}`, `{action: drop, why}` or `{action: refuse, error}`. Merging: `servers` sorted by id |
| `box` | 3.5, 5.1, 5.3 | `seed` (hex) alone; or `seed`, `peer`, `peerBox`, `envelope` (the record without sig and enc), `plain`, `nonce`; or `seed`, `peer`, `peerBox`, `record` (opened by the seed's network, the other party being `peer`); or `kind` (`offer`/`decline`), `author`, `body` (what an opened record holds, in clear) | `box`; or `{aad, key (hex), enc}`; or `{ok: true, plain}` / `{ok: false}`; or `{ok: true}` / `{ok: false, error}` |
| `deals` | 10.10 | `announces` (summaries `{id, kind, key, t, body: {rates, auto}}`), `offer`, optional `accept` (`{t}`), optional `renews` (the running deal) | `{ok: true, auto, start, end}` or `{ok: false, error}` |
| `majority` | 8.1 | cases: `operators`, `signers` (counts) | `majority` |
| `sync` | 9.2, 10.9 | cases: policies (`same`, `a`, `b`), or versions (`a`, `b` as `vers` lists) | `sync`, or `ver` or `error` |
| `autosync` | 10.9 | cases: `asOf`, `cap`, `self`, `servers` (`[{id, sync, listed?, answered?}]`, as in the registry snapshot) | `eligible` (sorted ids), `peers` (`self`'s automatic peers, sorted), `dials` (those `self` dials; the fallback dial after 900 s is not part of the vectors) |
| `wire` | 9.1–9.3 | cases: `role`, `speaks` (the node's versions), `state` (`new` or `ready`), `frame` (text) | `{ok: true}` when the node accepts the frame (any record inside is then checked as in `records`), or `{error}` |
| `impl` | 9.3, 9.4, 10.8 | cases: `welcome` (one `impl` value), or `entry` (a catalog entry's `impl` list) with `nodes` (the server's node keys) | `impl`: `{name, version}` or null for `welcome`; node key → `{name, version}` for `entry` (malformed parts left out, never an error) |

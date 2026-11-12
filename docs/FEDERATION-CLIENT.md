# Federation: the client core

The game's side of multiplayer ([design](plans/federation.md), [protocol](FEDERATION-PROTOCOL.md), cited as §n).
This is the API the interface and the gameplay build on. It has no interface of its own: no window, toast or button,
and no player-facing text (functions answer with codes; the interface translates them).

Code: `src/game/60-features/81-fed-core.js` to `88-fed-net.js`, actions in `src/game/90-actions/93-fed.js`, the AI
declaration in `src/agent/77-fed.js`. Everything is plain functions in the page's one scope, named `fed…` (`FED` is the
runtime object). Tests: `tests/federation-*.test.js`; `tests/helpers/fed.js` has fake relay nodes on a virtual clock.
End to end against the real relay: `node scripts/fed-e2e.js` builds the Go relay, serves it over TLS on loopback and
drives two players in Chromium through joining, announcing, deals, a shun and the boards (about 6 minutes; not in CI).

## Rules that hold everywhere

- **A save that never joined pays nothing.** `S.fed` is `null`; no socket, timer, listener or request exists. The
  session starts only when a joined save is loaded (`sanitize()` schedules `fedWake()`) or joins.
- **Never in the game loop.** Nothing here runs from `dayTick()`, `after()` or drawing. The connection has its own
  timers; a dead server is a state (`fedStatus()`), never a modal, toast or exception.
- **Everything received is untrusted.** Frames, records, receipts, catalog entries and the registry are checked before
  anything is kept; a record that fails is dropped and never blocks another.
- **No `Math.random`.** Seeded games replace it; federation uses `crypto.getRandomValues` through `FED.rand`.
- **WebCrypto Ed25519 or nothing.** `fedCan()` resolves false where the browser lacks it; joining then answers
  `'crypto'` and nothing else changes.
- **The worker never connects.** The route worker runs the same script; `fedWake()` does nothing there.

## State in the save

```
S.fed = null | {
  on,        // joined (false: detached, left, or not a normal game)
  key,       // {pub, priv}: priv is the 32-byte Ed25519 seed (base64url); null after a broken key
  servers,   // [node URL] joined, at most 4 (FED_MAX_SERVERS)
  ai,        // null | {model, harness}: written only by src/agent/
  out,       // signed records waiting to be sent, capped (FED_OUT_MAX 64, FED_OUT_BYTES 128 KB; one stats at most)
  muted,     // [key], at most 512
  deals,     // deals with other players, self-contained (fedDealClean checks the common part), at most 256
  share,     // let servers attach my country to my stats (default true)
  joined,    // real day number of the first join (announce.founded)
  last,      // slot of the last stats sent (at most one per slot)
}
```

`fedSanitize(s)` (called by `sanitize()`) drops anything malformed, caps the lists, turns `on` off for a broken key
(keeping deals and mutes), for a key without its private half (a detached import), with no server, or in a save that is
not a normal game. Queued records are kept only with the key that signed them.

Helpers: `fedNewState()`, `fedMode(s)` (`normal`, `sandbox`, `open_gates`, `puzzle`, `architect`, `scenario`,
`weekly`), `fedEligible(s)`, `fedHasPriv(f)`.

## Exports and imports

| Function | What it does |
| --- | --- |
| `fedPublic(s)`, `fedPublicText(t)` | A copy of a save without `key.priv` and `out` (used by `exportSave()`, `exportSlot()`, the transfer sheet and link `xferText()`, and the agent's `state` tool) |
| `fedDetach(s)` | Used by `parseSave()` on everything that is not a move file: the save arrives off and keyless; joining makes a new identity |
| `fedExportMove()` | "Move to another device": the one file with the key and the queue, named `…-move-PRIVATE.json`, wrapper `move: true`. Action `fedMoveExport`. The interface must show its warning first |

## Actions

All return a value (or a promise) and change only `S.fed`; they save, but do not re-render.

| Action | Function | Gives |
| --- | --- | --- |
| `fedJoin({url})` | `fedJoin(url)` | `null` when joined, else `'mode'` (not a normal game), `'url'` (not a valid `wss://` node URL, §5), `'full'` (4 servers), `'crypto'` |
| `fedLeave({url})` | `fedLeave(url)` | Leaves one server (all without `url`); off when none is left; the identity stays |
| `fedQuit()` | `fedQuit()` | Sends a signed `leave` (§5.9), waits up to 5 s, then drops the key, servers and queue |
| `fedMute({key, on})` | `fedMute(key, on)` | Mutes or unmutes a network (emits `mute`) |
| `fedShare({on})` | `fedShare(on)` | Share my country |
| `fedMoveExport()` | `fedExportMove()` | The move file |

`fedJoinWhy(url)` answers the same codes without joining (for greying out a button).

## Records

| Function | Purpose |
| --- | --- |
| `fedCheck(textOrValue, now, {kinds})` | §7.1 steps 1–8: `{ok:true, kind, id, rec}` or `{ok:false, error}` with the spec's codes |
| `fedSignMine(kind, body)` | Signs a record of this save's network (needs `key.priv`) |
| `fedQueue(rec)` | Queues it for every joined server; `false` when the queue is full (offers and answers only; a newer stats or announce replaces the older one) |
| `fedStatsBody()` | This game's `stats` body now (§5.2). Gameplay can adjust it with `FED.hooks.stats = body => body` (e.g. traffic per player network) |
| `fedSignRec(seed, kind, body, t)`, `fedCosign(seed, rec)` | Signing with any seed (operator tools) |
| `fedRcptErr`, `fedProofErr`, `fedStoreRec` | Receipts (§6.1), proofs (§6.2), storing with merge (§10.11) |
| `fedId`, `fedAsn`, `fedCanon`, `fedParse`, `fedB64`, `fedUnb64`, `fedBin` | §2, §3 |

## Rules both sides compute (§10)

Pure functions, held to `federation/vectors/` by `tests/federation-vectors.test.js`:

| Function | Rule |
| --- | --- |
| `fedSlot`, `fedWindows(now)`, `fedBoardSlot(ts)`, `fedByKey`, `fedEffs` | Slots, windows, effective records (§10.1–10.2) |
| `fedRankOne(q, key, records, announce)` | One network's place on a board from records alone (§10.3–10.5, §10.12): `{listed, kept, value}`. `q`: `{now, board, measure, division, exclude, cities, filters}`. How a game checks a server's row (§9.5); a pure function, runs every `boards` vector |
| `fedRankReq(view, deals, n)`, `fedRankKey(req)`, `fedRanksOk(answer)`, `fedRankMerge(answers, me, drop, n)` | A view as a `rank` request, the slice's cache key, a checked `ranks` answer, several servers' answers merged (see below) |
| `fedQuiet(now, lastHeard)` | `{state: active/fading/dark/forgotten, factor}` per mille (§10.6) |
| `fedShun(registry, votes, target, now)` | `{voters, need, votes, shunned, reasons}` (§10.7) |
| `fedDeal(announces, offer, accept, renews)` | `{ok, auto, start, end}` or `{ok:false, error}` (§10.10) |
| `fedChain`, `fedServerErr`, `fedRegEntry`, `fedRegCheck`, `fedServersJson` | Operator chain, server records, registry (§8, §11) |
| `fedGossipIn`, `fedCatalogMerge` | Catalog gossip (§10.8) |
| `fedVersion`, `fedSyncOk`, `fedFrame`, `fedMaj` | Versions, sync policy, frames, majority (§9, §10.9, §8.1) |

### Slicing: the servers rank

The game never downloads leaderboard records. `await fedRankView(v, urls?)` asks each joined server (or those `urls`)
for the slice (`rank`, §9.5) and gives `{rows: [{rank, key, value, asn, ai, name, home, cc}], me: {rank, value} or null,
n, at, slot, untrusted}`. `v` takes any of: `board` (`pops`, `pies`, `traffic`, `total`), `measure` (`total`,
`growth`), `division` (`all`, `human`, `ai`), `model`, `harness`, `region` (`{continent: 'EU'}` as in `CITIES[].reg`,
`{country: 'DE'}`, `{city: 'fra'}`, sent as its city list), `home`, `from`, `ageMin`/`ageMax`, `dayMin`/`dayMax`,
`tier1`, `policy`, `peers` (sent as the keys in `S.fed.deals`); their meaning is §10.12. The boards sheet's "as seen
from" a server passes that server's URLs.

- **All your servers, merged** (`fedRankMerge`): rows joined by key, a key on two servers taking the **higher** value;
  networks the player muted, any joined server hides (its `hide` list) and the federation excludes are left out; then
  sorted again (value, then key), numbered, top 50. Muted networks are never sent to a server: the game asks for 50 more
  rows than it shows (at most 100). `n` is the most networks any server counted.
- **The own row** is its position among the merged rows when it is there, else as the first server that answered
  gives it (`rank` `null`: on the board, but not in this slice).
- **Offline:** the last answer of each joined URL and slice is kept (`kv` `ranks`, at most 48, the oldest first out)
  and shown "as of" `at` (the oldest kept answer used; `null` when every answer is fresh).
- **Checks** (`fedRankCheck`, in the background after each fresh answer, one at a time per server and once per slice and
  slot): the own row and one row picked with `FED.rand()` are worked out again from the server's `rankwhy` records
  (`fedRankOne`, with that server's excluded list and hide record). A row not matching twice (the slice asked again in
  between) marks the server untrusted for 24 hours (`kv` `untrusted`, `fedUntrusted()`): its rankings are left out,
  `fedRankView` lists it in `untrusted`, the sheet says so (`fedui.ranking_does_not_match`), and an `untrusted` event
  fires. A row that cannot be checked (another slot, a receipt from a server unknown here, no answer) counts for nothing.
- `await fedFacets(urls?)`: the values the filter sheet offers, `{models, harnesses, from, homes}`, from each server's
  `facets` (kept per URL for offline).

## The connection

| Function | Purpose |
| --- | --- |
| `fedWake()` | Starts, adjusts or stops the session to match the open save. Safe any time |
| `fedStatus()` | `{state: 'off'|'connecting'|'connected'|'offline', since, servers: [{url, state, since, server, node}]}`; `since` is when it went offline (or connected). Per server `state` may also be `waiting` (hidden tab) |
| `fedRankView(view, urls?)`, `fedFacets(urls?)` | Leaderboards ranked by the servers (§9.5), see "Slicing" |
| `fedNetsFetch(keys)`, `fedNetsStats()` | For the gameplay: asks each connected server `nets` about up to 64 networks (hourly, and when the snapshot has networks not asked about yet), kept per URL; `fedNetsStats()` gives `Map key -> {ai, tier1, traffic}` (`traffic`: what that network reports about traffic with this one) |
| `fedServers()` | Known servers, registry merged with gossip (§10.8): `[{id, source, name, nodes, operators, sync, noLogs, langs, desc, seen, path, listed, answered}]` |
| `fedCatalogLoad()` | Fetches `federation/servers.json` (same origin), keeps the checked entries; the cache stays on failure |
| `fedNetworks(now?)` | Other players' networks from cached announces: `[{key, rec, id, heard, quiet, srv}]` (`srv`: the servers it was heard on); forgets those silent 180 days |
| `fedShunned()`, `fedExclInfo(key)` | Keys excluded now: the union of the `excluded` lists of the joined servers, as each last sent it (kept offline); about one key `{shunned, reasons}`, the reasons (a set, no counts) only for this network's own key |
| `fedShunInfo(key)` | Operators only: the tally (§10.7) from the votes their nodes sent, `{voters, need, votes, shunned, reasons}` with counts |

Behaviour (§9): one connection per joined server; `hello` → `welcome`; when the registry knows the server, the node
must be one of its nodes and answer a `challenge` (otherwise the next node is tried); nothing is sent before. Then
`auth` proves the network's key, and the imported operator key when the catalog lists it as an operator of that server.
Then the queue is put (a record leaves it once every joined server took it, or refused it for good; `rate_limited` waits
`retry`), a `sub` follows `announce`, `offer`, `accept`, `decline`, `leave`, `hide` from the stored cursor, and
`servers` brings gossip. Shun votes are for operators only (§9.3, §12): only when the node answered the operator key's
`auth` with `op: true` does a second `sub` follow `shun` and `unshun` from its own cursor, and votes are kept only then,
only on a device with an operator key, and only when signed by an operator of a voting registry server (§10.7);
importing or removing the operator key proves it to the connected servers or stops following and deletes the votes
(`fedOpChanged`). Every game keeps each joined server's `excluded` list (pages joined first) and uses their union
wherever it excludes networks (boards, snapshot, deals ending, the excluded notice). `hide` only when signed by an operator of its own server (at the head of the chain the
catalog has); player names become plain text (`fedSafeName`: `<>&"'` swapped for look-alikes) before they reach `NET`. Pings after 60 s idle, gives up after 120 s of silence, requests time out after
20 s. A lost connection tries the server's next node at once; after a full round it waits 2 s doubling up to 30 min,
times 0.5–1 jitter, and only while the tab is visible (it dials at once when the tab comes back). Stats are signed every
5 minutes when the body changed, or hourly as a heartbeat, at most once per slot.

### Events

`fedOn(name, fn)` returns an unsubscribe function. Listeners run outside the game loop; an exception in one is logged.

| Event | Data |
| --- | --- |
| `status` | `fedStatus()` |
| `records` | `{server, n}` after a batch was checked and kept |
| `excluded` | `{server, n}` after a server's excluded list was kept |
| `deal` | `{rec, id, slot, server}`: an `offer`, `accept` or `decline` to or from this network (gameplay decides) |
| `untrusted` | `{server, url}`: a server's ranking did not match its records (§9.5) |
| `catalog` | `{source: 'registry' or 'gossip'}` |
| `mute` | `{key, on}` |

### Injecting for tests

`FED.now` (unix s), `FED.WS(url)`, `FED.set(fn, ms)`/`FED.clear(t)`, `FED.rand()`, `FED.visible()`, `FED.fetch`,
`FED.idb()`, `FED.registry` (URL), `FED.T` (every timeout), `FED.hooks.stats`.

## Browser storage (IndexedDB `sot-fed`, shared by every slot)

Stores `ann` (other networks' newest announce and `heard`, at most 5000, the longest silent dropped first once a tenth
over, counted without reading the store each time, forgotten after 180 days), `kv` (`registry`, `gossip`, `ranks` (the last answer per joined URL and slice, at most 48), `facets:<URL>`, `nets:<URL>`, `untrusted` (servers caught, for 24 hours), `excl:<joined URL>` (`{at, srv, keys, me, reasons}`), `hide:<server>`,
`cursor:<node>`, and on an operator's device only `votes` until expired and `vcursors`; without an operator key they are
deleted when a session starts or the sheet opens) and `op` (the operator key). Every access is wrapped; without IndexedDB (or when it fails) the same calls
use memory for the tab. `fedGet/fedPut/fedDel/fedAll(store, …)`.

Operator key (never in a save or an export): `fedOpKey()`, `fedOpKeySet(seed)`, `fedOpKeyDel()`, and
`fedOpSign(kind, body)` to sign `hide`, `shun`, `unshun` (and co-sign `operators`, `server`), to `put` from the
operator panel.

## The AI declaration (`src/agent/77-fed.js`, development page only)

`apiFedDeclare({model, harness})` (session action `apiFedDeclare`) writes `S.fed.ai`, creating `S.fed` if needed. Any
tool call on a save with `S.fed` and no declaration marks it `{model: 'undeclared', harness: 'tubes-mcp'}`. The game
reads `S.fed.ai` only to put it in `stats`; it never names agent code (ADR 0004).

### Operating from the game (`88-fed-ops.js`)

Over the game's own connection to a joined server (nothing opens a socket of its own): `fedConnTo(server)` (a ready
connection or null), `fedOpPut(server, rec)`, `fedOpChain(server)` (its chain from a node, with `pending` proposals),
`fedOpCosign(server, {id, rec})`, `fedHideOf(server)`, `fedOpHide(server, key, list, on)`, `fedOpShun(server, key,
reason)` (a pre-made reason, or `null` to withdraw). Each gives `{ok:true}` or `{error}` (`offline`, `timeout`, `no_key`
or the node's code). `fedErrLog`/`fedErrs(server?)`: the last 24 connection and operator errors, memory only.

## The interface (`95-modals/47-49-fed-*.js`, actions `90-actions/94-fed-ui.js`)

Sheets (modals, so bottom sheets on phones) opened with `ACT.fuOpen({v})`: `home` (multiplayer settings), `join`,
`move`, `quit`, `opkey`, `boards`, `filters`, `glass`, `server` (`id`), `net` (`key`). The HUD's status dot is `#hFed`.
An invite link is `#join=<node URL>` in the page address. Labels are `fedui.*`.

## Left to the interface and gameplay

Joining, status dot, server list and looking glass, boards, the move-file warning, the operator panel, other players'
networks in routing (`fedNetworks()` with `quiet.factor`), deals (`deal` events, `fedDeal`, `S.fed.deals`), announces
(build the body, `fedSignMine('announce', body)`, `fedQueue`), traffic per player network in stats (`FED.hooks.stats`),
the 14-day "join another server" suggestion (from `fedStatus().since`).

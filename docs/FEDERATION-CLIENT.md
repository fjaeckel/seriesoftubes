# Federation: the client core

The game's side of multiplayer ([design](plans/federation.md), [protocol](FEDERATION-PROTOCOL.md), cited as §n).
This is the API the interface and the gameplay build on. It has no interface of its own: no window, toast or button,
and no player-facing text (functions answer with codes; the interface translates them).

Code: `src/game/60-features/81-fed-core.js` to `88-fed-net.js`, actions in `src/game/90-actions/93-fed.js`, the AI
declaration in `src/agent/77-fed.js`. Everything is plain functions in the page's one scope, named `fed…` (`FED` is the
runtime object). Tests: `tests/federation-*.test.js`; `tests/helpers/fed.js` has fake relay nodes on a virtual clock.

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
| `fedBoard({now, board, measure, division, exclude, cities, records})` | Board rows `[{key, value}]` (§10.3–10.5). Walks only the slots where an effective record changes; kept per `records` array (identity) and slot, so slicing the same data again is a lookup. `await fedBoardWarm(q)` works it out in short steps first (the boards sheet does) |
| `fedSlice(view, data)` | A sliced board: `{rows: [{key, value, rank, ai}], me}` (see below) |
| `fedQuiet(now, lastHeard)` | `{state: active/fading/dark/forgotten, factor}` per mille (§10.6) |
| `fedShun(registry, votes, target, now)` | `{voters, need, votes, shunned, reasons}` (§10.7) |
| `fedDeal(announces, offer, accept, renews)` | `{ok, auto, start, end}` or `{ok:false, error}` (§10.10) |
| `fedChain`, `fedServerErr`, `fedRegEntry`, `fedRegCheck`, `fedServersJson` | Operator chain, server records, registry (§8, §11) |
| `fedGossipIn`, `fedCatalogMerge` | Catalog gossip (§10.8) |
| `fedVersion`, `fedSyncOk`, `fedFrame`, `fedMaj` | Versions, sync policy, frames, majority (§9, §10.9, §8.1) |

### Slicing

`fedSlice(v, d)`, or `await fedBoardView(v)` which reads the cache for `d`. `v` takes any of: `board` (`pops`, `pies`,
`traffic`), `measure` (`total`, `growth`), `division` (`all`, `human`, `ai`), `model`, `harness`, `region`
(`{continent: 'EU'}` as in `CITIES[].reg`, `{country: 'DE'}`, `{city: 'fra'}`), `home`, `from` (players' country,
from receipts), `ageMin`/`ageMax` (real days since founded), `dayMin`/`dayMax` (game days), `tier1`, `policy`, `peers`
(only networks in `S.fed.deals`), `server` (one server's view; omitted: all merged, each record once). Regions change
values (only POPs, and traffic with networks, in the region); the other filters only hide rows. Ranks are positions in
the slice. `me` is the player's own row, pinned: `rank` is `null` when the slice hides it.

## The connection

| Function | Purpose |
| --- | --- |
| `fedWake()` | Starts, adjusts or stops the session to match the open save. Safe any time |
| `fedStatus()` | `{state: 'off'|'connecting'|'connected'|'offline', since, servers: [{url, state, since, server, node}]}`; `since` is when it went offline (or connected). Per server `state` may also be `waiting` (hidden tab) |
| `fedBoardFetch(url)` | Asks a connected server for its board records (§9.5), checks them (receipts give slot and country), caches them; `null` when not connected |
| `fedBoardData(server?)` | `server`: one server id, a list of ids, or none (the connected ones). From the cache (works offline): `{now, records, announces, exclude, deals, me, at}`; `at` is the oldest fetch ("as of …"). `records`: at most 20000 (the newest) from at most 5000 networks, the same array until a server's cached records change or a slot passes |
| `fedServers()` | Known servers, registry merged with gossip (§10.8): `[{id, source, name, nodes, operators, sync, noLogs, langs, desc, seen, path, listed, answered}]` |
| `fedCatalogLoad()` | Fetches `federation/servers.json` (same origin), keeps the checked entries; the cache stays on failure |
| `fedNetworks(now?)` | Other players' networks from cached announces: `[{key, rec, id, heard, quiet, srv}]` (`srv`: the servers it was heard on); forgets those silent 180 days |
| `fedShunned(now?)`, `fedShunInfo(key)` | Keys shunned now; the tally about one (for telling a shunned player why) |

Behaviour (§9): one connection per joined server; `hello` → `welcome`; when the registry knows the server, the node
must be one of its nodes and answer a `challenge` (otherwise the next node is tried); nothing is sent before. Then the
queue is put (a record leaves it once every joined server took it, or refused it for good; `rate_limited` waits
`retry`), a `sub` follows `announce`, `offer`, `accept`, `decline`, `leave`, `hide`, `shun`, `unshun` from the stored
cursor, and `servers` brings gossip. Of what arrives, `shun` and `unshun` are kept only when signed by an operator of
a voting registry server (§10.7) and `hide` only when signed by an operator of its own server (at the head of the chain the
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
| `deal` | `{rec, id, slot, server}`: an `offer`, `accept` or `decline` to or from this network (gameplay decides) |
| `board` | `{server, n}` after `fedBoardFetch` |
| `catalog` | `{source: 'registry' or 'gossip'}` |
| `mute` | `{key, on}` |

### Injecting for tests

`FED.now` (unix s), `FED.WS(url)`, `FED.set(fn, ms)`/`FED.clear(t)`, `FED.rand()`, `FED.visible()`, `FED.fetch`,
`FED.idb()`, `FED.registry` (URL), `FED.T` (every timeout), `FED.hooks.stats`.

## Browser storage (IndexedDB `sot-fed`, shared by every slot)

Stores `ann` (other networks' newest announce and `heard`, at most 5000, the longest silent dropped first once a tenth
over, counted without reading the store each time, forgotten after 180 days), `kv` (`registry`, `gossip`, `board:<server>` up to 20000 records, `votes` until expired, `hide:<server>`,
`cursor:<node>`) and `op` (the operator key). Every access is wrapped; without IndexedDB (or when it fails) the same calls
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

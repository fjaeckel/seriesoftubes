# Federation: the client core

The game's side of multiplayer ([protocol](FEDERATION-PROTOCOL.md), cited as §n).
Players know this feature as "Multimode" (a pun on multimode fiber); the code and these docs say federation or multiplayer.
This is the API the interface and the gameplay build on. It has no interface of its own: no window, toast or button,
and no player-facing text (functions answer with codes; the interface translates them).

Code: `src/game/60-features/81-fed-core.js` to `88-fed-worker.js`, actions in `src/game/90-actions/93-fed.js`, the AI
declaration in `src/agent/77-fed.js`. Everything is plain functions in the page's one scope, named `fed…` (`FED` is the
runtime object). Tests: `tests/federation-*.test.js`; `tests/helpers/fed.js` has fake relay nodes on a virtual clock.
End to end against the real relay: `node scripts/fed-e2e.js` builds the Go relay, serves it over TLS on loopback and
drives two players in Chromium through joining, announcing, deals, a shun, a report and the boards (about 6 minutes; not in CI).

## Rules that hold everywhere

- **A save that never joined pays nothing.** `S.fed` is `null`; no socket, timer, listener or request exists. The
  session starts only when a joined save is loaded (`sanitize()` schedules `fedWake()`) or joins.
- **Never in the game loop.** Nothing here runs from `dayTick()`, `after()` or drawing. The connection has its own
  timers; a dead server is a state (`fedStatus()`), never a modal, toast or exception.
- **Everything received is untrusted.** Frames, records, receipts, catalog entries and the registry are checked before
  anything is kept; a record that fails is dropped and never blocks another.
- **No `Math.random`.** Seeded games replace it; federation uses `crypto.getRandomValues` through `FED.rand`.
- **WebCrypto Ed25519, X25519, HKDF and AES-GCM, or nothing.** `fedCan()` signs and verifies, then seals a decline to
  itself and opens it again; it resolves false where any of these is missing, and joining then answers `'crypto'`
  and nothing else changes. Current Chrome, Edge, Firefox and Safari (desktop and phone) ship WebCrypto X25519 next to
  Ed25519 (they arrived within a few releases of each other); a browser with Ed25519 but not yet X25519 does not offer
  multiplayer.
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
| `fedSignMine(kind, body)` | Signs a record of this save's network (needs `key.priv`). `body` is in clear: an offer with `to` and a decline go out sealed for the other network (§5.3, through `fedSealMine`); throws `nobox` when that network's box is not known here (no announce of it) |
| `fedBoxPub(seed)`, `fedBoxKey(seed)` | The box key (§3.5) derived from an identity seed; the announce carries `box` (nothing new in the save or the move file) |
| `fedSeal`, `fedOpen`, `fedBoxOf(key)`, `fedOpenRec(f, rec)` | Sealing and opening (§3.5); a network's box from its stored announce; a received deal record as the game reads it (opened and checked in clear, `null` when it does not open, `undefined` while the sender's box is unknown) |
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
| `fedRankOne(q, key, records, announce)` | One network's place on a board from records alone (§10.3–10.5, §10.12): `{listed, kept, value}`. `q`: `{now, board, measure, division, exclude, cities, filters, founded}` (`founded`: the cone board's key -> founded of its newest announce; the worker fills it from the announces `rankwhy` sends). How a game checks a server's row (§9.5); a pure function, runs every `boards` vector |
| `fedNowOne(q, key, states, announce, cc)`, `fedLatest(now, states)` | The same for a board of now (§10.13) from live states `[{id, key, t, body}]`; `q.now` is the snapshot's `at`, `cc` the country of the key's newest stats record. Runs every `now` vector |
| `fedRankReq(view, deals, n)`, `fedRankKey(req)`, `fedRanksOk(answer)`, `fedRankMerge(answers, me, drop, n)` | A view as a `rank` request, the slice's cache key, a checked `ranks` answer, several servers' answers merged (see below) |
| `fedQuiet(now, lastHeard)` | `{state: active/fading/dark/forgotten, factor}` per mille (§10.6) |
| `fedShun(registry, votes, target, now)` | `{voters, need, votes, shunned, reasons}` (§10.7) |
| `fedDeal(announces, offer, accept, renews)` | `{ok, auto, start, end}` or `{ok:false, error}` (§10.10), the newcomer price included (`fedNewPrice`, `fedIsNew(founded, t)`) |
| `fedChain`, `fedServerErr`, `fedRegEntry`, `fedRegCheck`, `fedServersJson` | Operator chain, server records, registry (§8, §11) |
| `fedGossipIn`, `fedCatalogMerge` | Catalog gossip (§10.8) |
| `fedVersion`, `fedSyncOk`, `fedFrame`, `fedMaj` | Versions, sync policy, frames, majority (§9, §10.9, §8.1) |

### Slicing: the servers rank

The game never downloads leaderboard records. `await fedRankView(v, urls?)` asks each joined server (or those `urls`)
for the slice (`rank`, §9.5) and gives `{rows: [{rank, key, value, asn, ai, name, home, cc}], me: {rank, value} or null,
n, at, slot, snap, untrusted}`. `v` takes any of: `board` (`pops`, `pies`, `traffic`, `total`, `cone`), `measure` (`now`:
the live states, §10.13, the sheet's default; `total`: the 24-hour window; `growth`), `division` (`all`, `human`, `ai`), `model`, `harness`, `region` (`{continent: 'EU'}` as in `CITIES[].reg`,
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
- **Now** (`measure: 'now'`) is asked only of servers whose `welcome` lists `state` in `feats` (others give their kept
  answer, if any). `snap` is the newest snapshot time (`at` of the `ranks` answers) among them. The boards sheet asks
  again every 10 s while it shows a board of now and the tab is visible (`fuNowTick`, only the slice on screen,
  redrawn in place) and stops when the sheet closes or shows something else. Its spot checks send the answer's `at`
  with `rankwhy`, check each live state as at `at` and work the row out with `fedNowOne`; a `rankwhy` for another `at`
  cannot check it.
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
| `fedShunned()`, `fedConfirmed()`, `fedExcl()`, `fedExclInfo(key)` | Keys listed as excluded by any joined server, as each last sent its list (kept offline); keys whose exclusion is confirmed (§10.7: listed by a strict majority of the joined servers that sent a list, and by at least two; `fedExclConfirmed(m, n)`); both with who lists what; about one key `{shunned, confirmed, servers: [{srv, url}], reasons}`, the reasons (a set, no counts) only for this network's own key |
| `fedShunInfo(key)` | Operators only: the tally (§10.7) from the votes their nodes sent, `{voters, need, votes, shunned, reasons}` with counts |
| `fedReport(target, reason, servers)` | Reports a network (§5.10) to the operators of joined servers (ids, connected now): a signed `report` per server, `put` to that server's node only, never queued. `{ok: [ids], failed: [{srv, error}]}` or `{error}` (`bad_field`, `offline`, `too_many`: at most 10 networks a day from one network). `fedReported()`, `fedReportedOf(target)`: what this network reported in the last 30 days (`kv` `reported#<network key>`) |
| `fedReportsFor(server)` | Operators only: the reports their nodes sent about networks on that server, `[{target, reasons {reason: count}, reporters [keys], t}]`, newest first |

Behaviour (§9): one connection per joined server; `hello` → `welcome`; when the registry knows the server, the node
must be one of its nodes and answer a `challenge` (otherwise the next node is tried); nothing is sent before. Then
`auth` proves the network's key, and the imported operator key when the catalog lists it as an operator of that server.
A node that does not `ack` the network's own key gets no `sub` (what a sub gives depends on the key proved): the
connection is dropped and tried again with back-off. The back-off (2 s doubling, at most 30 min) starts again only after
a connection stayed ready 60 s, and a connection-level `err` `rate_limited` is waited out (`retry`) before redialling.
Then the queue is put (a record leaves it once every joined server took it, or refused it for good; `rate_limited` waits
`retry`; the newest `announce` and `stats` replace their older copy outside the queue's cap), a `sub` follows `announce`, `offer`, `accept`, `decline`, `leave`, `hide` from the stored cursor, and
`servers` brings gossip. Shun votes are for operators only (§9.3, §12): only when the node answered the operator key's
`auth` with `op: true` does a second `sub` follow `shun` and `unshun` from its own cursor, and votes are kept only then,
only on a device with an operator key, and only when signed by an operator of a voting registry server (§10.7);
importing or removing the operator key proves it to the connected servers or stops following and deletes the votes
(`fedOpChanged`). Reports (§5.10) likewise: with `op: true` a third `sub` follows `report` from its own cursor
(`rcursors`), and only reports naming that server, from its own node, are kept (`fedReportsAdd`: the newest per reporter
and network, 30 days, at most 4096). Every game keeps each joined server's `excluded` list (pages joined first). A network on any of
them is hidden (boards, looking glass, the routing snapshot, unless a deal with it still runs) and gets no new deals
(requests answer the miss `excluded`, its offers are declined `excluded`, waiting ones cannot be accepted); running
deals end only once the exclusion is confirmed (§10.7), so one server cannot end anyone's deals: until then that
network's sheet says which servers list it and that running deals continue. The excluded network's own notice names
the joined servers that list it (never vote counts). Deal records reach the gameplay opened (§5.3): `deal` events carry
the record in clear; a sealed one whose sender's announce has not come yet waits in memory (at most 64) until it does,
one that does not open is dropped. `hide` only when signed by an operator of its own server (at the head of the chain the
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
| `deal` | `{rec, id, slot, server}`: an `offer`, `accept` or `decline` to or from this network, opened (`rec.body` in clear; `id` the id of the record as it travelled), and open consortium projects (gameplay decides) |
| `untrusted` | `{server, url}`: a server's ranking did not match its records (§9.5) |
| `catalog` | `{source: 'registry' or 'gossip'}` |
| `mute` | `{key, on}` |
| `update` | `{srv, version, security, notes, gossip}`: a node told this device's operator that a newer relay is out (§9.3 `update`, kept in `FED.upd[srv]`, memory only) |

### Injecting for tests

`FED.now` (unix s), `FED.WS(url)`, `FED.set(fn, ms)`/`FED.clear(t)`, `FED.rand()`, `FED.visible()`, `FED.fetch`,
`FED.idb()`, `FED.registry` (URL), `FED.T` (every timeout), `FED.hooks.stats`.

## Workers: what runs where

The demanding part of the client is checking what nodes send: each record is made canonical JSON three times, walked
by every schema rule and verified with Ed25519, which Chromium does on the thread that asks. Measured on a phone
profile (`node scripts/fed-perf.js`: Chromium, CPU 4× slower, the big-network fixture joined), a backlog of 2850
records kept the page busy for 3.7 s, and a ranking spot check over 877 records was one task of 0.8 s. So that work
runs in a **federation worker** (`88-fed-worker.js`), built like the route worker: `rwWorker()` runs this page's own
script again from a Blob URL (nothing fetched, no file served), and in it `fedWorker()` is true, so nothing wakes.

| In the federation worker (pure: data in, verdicts out) | On the page |
| --- | --- |
| `fedItemsRun`: every record of a sub page, a `fetch` or the operator panel's chain read is checked (`fedCheck`) and placed by its receipts (`fedPlace`); back come `{ok, kind, id, slot, cc}` per item, not the records | Frames and their JSON, the connection, requests and cursors |
| `fedWhyRun`: a `rankwhy` answer checked, placed and worked out into one row (`fedRankOne`) | What is kept (IndexedDB), events, votes, `S`, the save |
| `fedRegRun`: registry and gossip entries, each a whole chain (`fedRegEntry`) | Opening sealed deals (`fedOpenRec`), signing and sealing: the seeds never leave the page |
| | The snapshot rebuild (`fedPlayRun`, about 20 ms of page time on the phone profile, mostly IndexedDB) and the shun tally (`fedShunInfo`, operators only, no task over 50 ms with 4096 votes) |

- **One batch per page or answer.** `fwDo(op, args)` posts it and resolves with the result; `fedRecsRun` awaits its
  page's batch in its place in `FED.recQ` and then keeps the records one by one as before, so pages, cursors, votes and
  announces keep their order. The catalog goes over as server ids and node keys only (`fwSrvs`); the worker never sees
  a key, a seed, IndexedDB or `S`.
- **Lazy.** The worker starts with a joined save's session (`fedWake`), so a save that never joins never makes it.
- **Fallback.** Without `Worker` (jsdom, `__TUBES_TEST__`, `__TUBES_SYNC__`), when it cannot be made, when posting
  fails, when it reports an error or stays silent for a minute (`FW_WAIT`), it is given up for the session (`fwKill`)
  and the same functions run on the page: the batch in flight is done again here, with the same answers in the same
  order.
- **Not the route worker.** A big network's day of routing and a long spot check would wait for each other there.
- `FW.stat` counts batches and items done in the worker and batches done on the page (`local`); the end-to-end run
  checks that a real browser checked everything in the worker. Tests: `tests/federation-worker.test.js` (a fake
  `Worker` through `FW.force` and `FW.make`).

After the change, the same phone profile: the backlog keeps the page busy 1.7 s instead of 3.7 s (what is left is
IndexedDB, frame parsing, and the game routing once when the snapshot changes), and the spot check has no task over
50 ms (page time 0.1 s instead of 1.0 s).

## Browser storage (IndexedDB `sot-fed`, shared by every slot)

Stores `ann` (other networks' newest announce and `heard`, at most 5000, the longest silent dropped first once a tenth
over, counted without reading the store each time, forgotten after 180 days), `kv` (`registry`, `gossip`, `ranks` (the last answer per joined URL, network and slice, at most 48), `facets:<URL>`, `nets:<URL>`, `untrusted` (servers caught, for 24 hours), `excl:<joined URL>` (`{at, srv, keys, me, reasons}`), `hide:<server>`,
`cursor:<node>#<network key>` (cursors are per network: what a sub gives depends on the key proved), `dpend#<network
key>` (sealed deal records waiting for their sender's announce, at most 256, 30 days), and on an operator's device only
`votes` until expired and `vcursors` (per `<node>#<network key>`), `reports` and `rcursors`; without an operator key they are
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
`move`, `quit`, `opkey`, `boards`, `filters`, `glass`, `server` (`id`), `net` (`key`), `report` (`key`). The HUD's status dot is `#hFed`.
An invite link is `#join=<node URL>` in the page address. Labels are `fedui.*`.

**The leaderboards** (`95-modals/48-fed-boards.js`). Title "Leaderboards"; the board is a native select under it (the
sheet's subtitle), measure (`FU_MEASURES`, the first is the default; the 24 h measure of traffic, total and cone reads
"p95 · 24 h") and division are two small segmented controls, and every other filter sits behind the filters button (a
count badge when some are active), on the `filters` sheet. Nothing scrolls sideways; on a phone on its side all
controls share one line. The board's note (`fuBoardNote`, one label per board, and per measure where it differs) is one
line that opens on a tap (`ACT.fuNote`). Rows: rank (top three tinted), the name as a button over a small line (🤖, AS,
home country), the value in a fixed column. The own row is highlighted in place, or, when not among the rows, kept in
a sticky row at the bottom (`.fu-mine`). The open board refreshes every 30 s whatever the measure (`fuBoardsTick`, on
`FED.set`): only while visible and connected, a tick with an ask in flight is skipped, and the sheet re-renders only
when the answer changed. **The rank chip** (`95-modals/48-fed-rank.js`, `#hFu`, `ACT.fuBoards`): for a joined save, 🏆
and the own rank on the default slice, from the sheet's answer for that slice or its own ask every 30 s (visible and
connected only; at once on reconnecting or showing the page again). `fuMyRank()` is the one way to read it. The
network menu has a Leaderboards tile for joined saves, and the home sheet leads with a Leaderboards card.

**Relay versions and the update banner.** A node's `welcome` may say what it runs (§9.3 `impl`, read by `fedImpl`, kept
as `FED.st[url].impl`), and a server's catalog entry what its nodes run (§10.8 `impl`, read by `fedImpls` for the
server's own nodes only, kept with the gossip entry; `fedServers()` gives it as `relays`, node key → `{name, version}`
from the freshest entry). The `server` sheet shows "relay x.y.z" per node under "Relay software": the connected node's
own word first, else the entry's. A session that proved an operator key gets `update` frames (§9.3): `fedUpdOf` keeps
the version, `security`, the `notes` link only when it is `https://`, and whether it came from GitHub releases (`source: 'github'`, when the relay could not read `relay.json`:
the banner adds "From GitHub releases"); versions seen in gossip are shown only, never a banner. The operator
panel opens with an "Update available" banner (`.fu-upd`; for a security fix "Security update available" in the red
`.fu-box.bad`) with the release notes link (escaped, `rel="noopener noreferrer"`). Players who are not operators never
get the frame and never see a banner. Nothing is stored, and nothing is fetched for it: the page never asks for
`relay.json`.

**Help and privacy** (`95-modals/61-help-more.js`, actions `90-actions/89-help-privacy.js`). Two plain sheets:
"How multiplayer works" (`showMpHelp`, `ACT.helpMp`, labels `mphelp.*`), offered in How to play where `fuCan()` holds
and in the home sheet (`.fu-info`), and the privacy sheet (`showPrivacy`, `ACT.privacy`, labels `privacy.*`), offered in
Settings, How to play, the home sheet and the help sheet. Each takes `{from}` (`help`, `settings`, `fed`, `mp`) onto a
short stack `UI.info`, so Back (`ACT.infoBack`) returns where it came from and × (`ACT.infoClose`) closes everything;
Settings' `UI.setOpen` is put aside meanwhile so it cannot redraw over the sheet. Nothing is fetched: the web copy,
`site/privacy.html`, is only a link. Its facts follow `docs/RELAY.md` (what relays keep) and §12; change both together.

**Reporting** (`95-modals/49-fed-report.js`, actions `90-actions/94-fed-report.js`). "Report" on a network's looking
glass sheet and on a player network's deals sheet (`ACT.fuReport({key, from})`) opens the `report` sheet: one of the four
reasons (chips), which joined servers' operators get it (connected ones; by default those the network was heard on,
else all connected), and "Also mute this network". No text field. The toast names the servers; the sheet goes back to
where it came from (the deals sheet too). An operator's panel lists "Reports from players" for that server: per network
the reasons with counts, how many players reported it, when, and on demand ("Who reported?") the reporters' network
names; buttons hide it on this server or vote to shun it with the most-given reason (`fuOpHide`, `fuOpShun`).

### Starting in multiplayer (`95-modals/47-fed-start.js`, actions `90-actions/94-fed-start.js`)

The title screen's Normal door has a "Play with others" switch (`#fsTog`, `ACT.fsSet({on})`), shown only where `fuCan()`
holds (Ed25519, X25519 and AES-GCM); Sandbox hides it with the Normal door, and Puzzles and Scenarios open their own
lists without it (`fedEligible` stays the rule at join time).

- **Default:** off; on when an invite link is waiting, otherwise as this device left it when it last started a new
  game (localStorage `sot-fed-start`, `{on, url}`, read through try/catch and checked with `FdUrl`; a convenience,
  never forced).
- **Online only:** while `navigator.onLine === false` the switch is shown off and disabled with "Multiplayer needs a
  connection", no picker and no address field; it follows the `online`/`offline` events while the title is up. An
  invite or a remembered "on" shows off while offline and comes back with the connection; starting offline is solo
  and leaves the remembered choice as it was.
- **Lazy:** switching it on is the only thing that fetches `servers.json` (`fedCatalogLoad`, once per page). Switched
  on by itself (invite, remembered), the picker shows the catalog this browser already has (`fedServers()`, IndexedDB),
  so drawing the title adds no request.
- **Picker:** one compact row per server (`.fs-srv`, `ACT.fsPick({url})`): name and policy line, inside a list that
  scrolls in the card (`max-height:min(190px,30vh)`), then "Or type a server's address" (`#fsUrl`, which wins over the
  rows while it has text). An address the catalog does not know (the invite, a remembered one) is a row of its own.
  The invited server comes first, picked at the invited node.
- **Default server** when nothing is picked: the open registry server whose node answered the registry's liveness
  check most recently (`answered`, then name), else any registry server the same way, else one known from gossip.
- **Something to join, or off:** after turning it on, the switch stays on only when there is something to join: a
  server row (not from an older cache when the fetch the player asked for failed), the invite, or a valid typed
  address (`FdUrl`). Otherwise it turns back off with a note: "Couldn't reach the server list" (the fetch failed; turning
  it on again retries) or "No servers listed yet". The address field stays under the note, and typing a valid address
  turns the switch on again, so invites and private servers work with an empty or unreachable list; clearing it turns
  it off again. Switched on by itself (invite, remembered) with nothing to join, it goes off without a note. Text that
  is not a valid address never keeps it on, but while it is on for another reason typed text still wins as the pick
  (and a refused join then starts solo, below).
- **Start:** `ACT.start` passes the pick to `beginGame(…, {fed})`: a node URL, `false` (switch shown and off, or
  offline) or absent (not shown). Multiplayer never blocks Start: "on but no server" cannot happen.
  `beginGame` keeps it as `UI.fedGo = {url, s: S}` for that game only. Signing the charter calls `fuInviteGo()`,
  which joins (`fsJoin` → `fedJoin`) without opening the join sheet; switched off, it opens nothing (a pending
  invite still shows in the join sheet when the player opens it). Without the switch (no title, no crypto) an
  invite opens the join sheet after the charter as before.
- **Joined or not:** `fsJoin` waits for the server's first word: connected gives the "Joined …" toast and the green
  dot. A refused join (`url`, `crypto`, `full`) starts solo with a red toast that says why and a "Join a server"
  button (the join sheet). A server that is `offline` or gives no answer in `2 × FED.T.open` keeps the join: the
  offline dot and a toast, and the game connects when the server does. A hidden tab (`waiting`) stays joined and
  connects when it is seen.

## Left to the interface and gameplay

Joining, status dot, server list and looking glass, boards, the move-file warning, the operator panel, other players'
networks in routing (`fedNetworks()` with `quiet.factor`), deals (`deal` events, `fedDeal`, `S.fed.deals`), announces
(build the body, `fedSignMine('announce', body)`, `fedQueue`), traffic per player network in stats (`FED.hooks.stats`),
the 14-day "join another server" suggestion (from `fedStatus().since`).

## Deals kept and renewed (`60-features/89-fedplay-deals.js`)

- `S.fed.deals` holds at most 256 deals (`fedDealsCap`, on load and in `fedDealAdd`): waiting and running deals always
  stay, ended ones only as room is left, the newest first.
- A deal is renewed once: each deal keeps `renews` (the id of the deal it renews, or null); `fedRenewal(f, id)` finds a
  waiting or running renewal. The buyer cannot book a second (`dup`, and Renew is hidden, offered to buyers only); the
  seller declines a second renewal offer (`conditions`).
- A renewal starts when the renewed deal ends, or when it binds if later (§10.10), on both paths: automatic (`fedDeal`)
  and reviewed (`fedRenStart`, for the accept received and the accept given), so the two never bill together. A wave
  renewal on the same route, no bigger, takes over the room of the wave it renews (`fedWaveRen`).
- The review queue (`S.fedp.rq`) holds 32 offers. When full, the oldest leaves with a `decline` (`declined`), so its
  requester is not left waiting, and the new one waits: a flood of offers cannot keep new ones out.
- A consortium project shows and costs at least `fedConsShare(a, b, pairs)` in this game, whatever share its author
  wrote (a share of 0 is not a free cable).

## Newcomers and mentors (`60-features/89-fedplay-mentor.js`)

- **Stats**: the gameplay hook adds `cust` and `up` (`fedTransitLists`: the other side of every running transit deal,
  sold or bought) and `tier2` to every stats body; the cone board counts an edge both sides list.
- **Newcomer price**: `fedOffer` passes its terms through `fedNewTerms`: while this save joined less than 30 days ago
  (`S.fed.joined`, as the announce's `founded`) and the seller did not, the terms carry `founded` and 25% off every
  price. The seller's game checks the same rule (`fedDeal`) and that `founded` is what the buyer's announce says
  (`fedTheirMiss`, `miss_newcomer`). Deal rows say "newcomer price".
- **Mentor dividend** (`fedMentorTick`, from the hourly look, with the `nets` answers' `tier2`, `pops`, `cust`, `slot`):
  newcomers with a running deal that started while they were new and this network was not, less than 60 days ago.
  Kept in `S.fedp.ment` (`[{k, n, m: seen|pops|t2|cust, v, t, cap?}]`, at most 512) and `S.fedp.heard` (`[{k, d: [UTC
  days, at most 3]}]`), defaults in `fedPNew()`, repaired by `fedMentorClean` in `fedpSanitize`. Heard days come from
  the board slot of the newcomer's newest stats each time this game looks (hourly while it runs): a mentor offline for
  days misses those days. Paid bonuses show in the players card ("Mentor bonus: …") and as a toast.

## Waves between players (`60-features/89-fedplay-waves.js`)

A deal of kind `wave` (§5.3, §10.10) sells one managed wave from the seller's published card (`rates.wave`).

| Name | What it does |
| --- | --- |
| `fedWaveLit()` | This network's lit routes (its own ready fiber with optics), `"a\|b"` with `a < b`: what its card may list. `fedRatesOut` publishes only those |
| `fedWaveCeil(a, b, gbps)` | What a computer-run vendor charges a month for that wave (`waveMo`): the seller's ceiling, applied by `fedWaveCap` when terms are edited or saved, not by `fedDeal` |
| `fedWaveRoom(a, b, gbps)` | The seller has a fiber on the route whose optics carry a channel that big and whose spare lit capacity takes it (checked before an automatic or a reviewed accept) |
| `fedWaveSold(map)` | Running waves sold, added to `mwG()` (managed waves on a fiber): they come off the seller's own capacity like waves sold to computer-run carriers |
| `fedWaveLinks(s)` | The buyer's wave links (`kind: 'wave'`, `fwv`: the deal id, `mo: 0`): one per running wave bought with POPs at both ends, removed with the deal (term, end, decline, quiet, excluded). Called from `fedDealsOn` and the day loop; `sanitize()` drops one whose deal is not running |

Both sides book the monthly price in `fedMoney` (`R.cost.fed` / `R.rev.fed`). The buyer's sheet names what is missing:
`ends` (POPs at both ends), `gear` (routers that take that wave size); the seller's accept fails with `room`.

## Live states

While a joined save is open and the tab is visible, `fedStateTick` (every `FED.T.state`, 10 s) signs the current
`fedStatsBody()` as a `state` (§5.11) and sends it in a `state` frame to every ready connection whose node lists `state`
in `feats`, when the body changed since the last one that node took, or `FED.T.stateKeep` (180 s) went by; never twice
within `FED.T.stateMin` (5 s). Nothing is queued or saved: a state that is not taken (offline, hidden, `rate_limited`)
is simply replaced by the next. Signing runs on the page (the worker holds no key): one canonical text and one Ed25519
signature per state sent; `FED.stCost` counts states signed (`n`), the milliseconds they took (`ms`) and those spent on
ticks that sent nothing (`idle`).

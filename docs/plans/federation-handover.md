# Federation: handover for the next agent

Read this first, then `CLAUDE.md`. This file is everything a new session needs to continue the multiplayer
("federation") work on Series of Tubes without the conversation that produced it.

## Where things stand

- **Branch:** `federation-design`, 34 commits on top of main `9c26d03` ("Conferences stop notifying once you are
  Tier 1 (#101)"). Local only. **Never push it, and never open a pull request, until Frederic explicitly says so.**
  Commits are authored and committed as `Frederic Jung <frederic@jc-ix.net>`, with **no** `Co-Authored-By`,
  `Claude-Session` or other trailers (CLAUDE.md overrides any tool's default attribution).
- **No release.** Never bump the version. The CHANGELOG has five player-facing bullets under `## [Unreleased]`
  for the whole feature; fixes to this unreleased feature do not need more bullets.
- **Scope built:** everything in `docs/plans/federation.md`: protocol, Go relay, registry, CI and release
  wiring, game client core, user interface and gameplay, plus fixes for all 12 findings of an independent review.

## Read in this order

1. `docs/adr/0005-federation-by-player-run-servers.md`: the decision (status: proposed) and the one exception to
   ADR 0001 (secure WebSockets to servers the player joined).
2. `docs/plans/federation.md`: the agreed design. Its "Decided" section lists Frederic's decisions.
3. `docs/FEDERATION-PROTOCOL.md`: the normative wire protocol (canonical JSON, Ed25519, record kinds, wire messages,
   every shared rule, registry checks, constants). `federation/vectors/` + `federation/vectors/README.md`: the shared
   test vectors both implementations must pass; `scripts/fed-vectors.js` regenerates the signed ones (`--check` in CI).
4. `docs/FEDERATION-CLIENT.md`: the client core API (state, actions, records, rules, connection, events, storage,
   operating from the game, interface).
5. `docs/RELAY.md`: operator documentation for the relay. `federation/servers/README.md`: how servers get listed.

## Frederic's decisions (do not reopen without him)

- GitHub Pages stays the only host of the game; multiplayer goes through relay servers players run themselves.
  No central service of any kind: the server registry is the folder `federation/servers/` in this repo, changed by
  pull request, checked by CI, merged on review; the build publishes it as the static `federation/servers.json`.
  Gossip between servers carries liveness between releases. No DHT for now.
- Non-competitive mode. Cheaters are accepted (trust model); no replay checks or anti-Sybil machinery.
- A server hosts many players and may be run by several operators, each with a node; the server is its operator list
  (founded by a `genesis` record, changed only by a strict majority). Servers sync only by choice: standalone,
  selective or open, always mutual.
- Shunning: a network is excluded everywhere when votes reach 25% of voting registry servers and at least 5;
  one vote per server; votes expire after 90 days; pre-made reasons only (cheating, offensive name, spam, abuse).
- Leaderboards: traffic with players, total traffic (self-reported `stats.total`, added 2026-11-12), POPs in service,
  pies in the sky; rolling 24 hours; totals or growth; never money; humans and AI together and apart in one view;
  sliceable by every dimension the records carry.
- Players publish peering policies, conditions and rate cards; matching requests are accepted automatically if the
  player chose that; computer-run transit is the price ceiling; prices change only at renewal.
- Players sell waves to each other (deal kind `wave`, `rates.wave`, `89-fedplay-waves.js`); dark fiber IRUs come later.
- Privacy: nothing identifies a person; no IPs, cities or device details are logged, stored or sent. The player's
  country is allowed (relay looks it up from a country-only database) and players can switch it off.
- If a server is down, nothing breaks. Quiet networks fade (0–7 days unchanged, 7–37 fading, 37–180 dark, then
  forgotten).
- Shared saves and bug reports never carry the private key; only the "Move to another device" file
  (`…-move-PRIVATE.json`) does. Player-typed names are allowed as typed (real company names included).
- Relay in **Go**, newest toolchain (`go 1.27.4` in `relay/go.mod`), newest maintained libraries, never step down.
  Metrics through `github.com/prometheus/client_golang` (Frederic asked for it explicitly).
- Other players' networks are never drawn on the map (2026-11-13); a dark network is greyed in lists.
- The extra page size is accepted (about +73 KB gzipped for every player, joined or not).

## What is where

| Part | Files |
| --- | --- |
| Protocol and vectors | `docs/FEDERATION-PROTOCOL.md`, `federation/vectors/`, `scripts/fed-vectors.js` |
| Relay (Go) | `relay/` (module `github.com/fjaeckel/seriesoftubes/relay`, binary `relay/cmd/relay`, packages in `relay/internal/`: canon, fed, chain, boards, shun, catalog, deals, wire, store, node, ops, registry, client, privacy, metrics, config, relaytest, conformance), `relay/Dockerfile` |
| Registry and build | `federation/servers/` (no servers yet), `scripts/registry.js` (Node copy of the checks and the `servers.json` build), `scripts/build.js` |
| CI and releases | `.github/workflows/ci.yml` (relay job, registry job that builds `check-registry` from the base commit), `docker.yml` (relay image, amd64+arm64), `relay-release.yml` (static binaries on releases), `auto-release.yml` (dispatches it), `federation-liveness.yml` (weekly pull request removing dead servers) |
| Client core | `src/game/60-features/81-88-fed-*.js`, `src/game/90-actions/93-fed.js` |
| Interface | `src/game/95-modals/47-fed-home.js`, `48-fed-boards.js`, `49-fed-glass.js`, `src/game/90-actions/94-fed-ui.js`, `src/styles/46-fed.css`, phone rules in `src/styles/60-phone.css`, `#hFed` in `src/index.html` |
| Gameplay | `src/game/60-features/89-fedplay-{nets,terms,deals}.js`, `src/game/90-actions/94-fedplay.js`, `src/game/94-dashboard/92-fedplay.js`, `src/styles/36-fedplay.css`, one-line hooks in routing, money, peering, traceroute, sanitize, newGame |
| Help and privacy | `src/game/95-modals/61-help-more.js` (How multiplayer works, the privacy sheet; from How to play, Settings and the multiplayer sheet), `src/game/90-actions/89-help-privacy.js`, `site/privacy.html` (the same for the web, linked from the README and the registry README), `tests/help-privacy.test.js`; labels `mphelp.*`, `privacy.*` |
| AI players | `src/agent/77-fed.js` (`apiFedDeclare`, `apiFedJoin`), MCP deal commands |
| Strings | `fedui.*` and `fedplay.*` labels in `src/i18n/en.js` and all five `site/i18n/*.js` |
| Tests | `tests/federation-*.test.js` (vectors, state, exports, messages, outage, catalog, boards, slices, shun, ui, gameplay, hardening), `tests/helpers/fed.js` (fake nodes on a virtual clock), `tests/registry-build.test.js`; Go tests in `relay/` |

State added to saves: `S.fed` (identity, servers, deals, queue, mutes, share, …), `S.fedn` (the compact snapshot of
other players' networks routing needs, at most 48), `S.fedp` (own published terms). All have defaults in
`newGame()` and repairs in `sanitize()`.

## Running things

```bash
npm ci
node --test tests/federation-*.test.js tests/gameplay-rules.test.js tests/build.test.js tests/pages.test.js \
  tests/registry-build.test.js tests/docker.test.js tests/mcp-commands.test.js   # focused game tests (169)
node scripts/i18n-check.js          # must be 0 missing, 0 unused, 0 broken
node scripts/fed-vectors.js --check
npm run perf -- --base-ref 9c26d03  # performance against the main commit the branch started from
cd relay && go vet ./... && go test -race ./...
```

Frederic's working preferences: write all the code first, then run **focused** tests; do not run the whole
`npm test` unless absolutely necessary; don't over-invest in tests; keep him updated on status as you go.

On a normal machine Go 1.27.4 and the official module proxy work as usual. The previous session ran in a sandbox
where the module proxy, checksum database and go.dev were blocked: it built Go 1.27.4 from source and served
`golang.org/x/*`, `google.golang.org/protobuf`, `go.yaml.in/*` and `go.uber.org/goleak` from a local file proxy made
from their GitHub mirrors with `golang.org/x/mod/zip` (real module paths, so hashes match the official ones).
**So `relay/go.sum` has never been checked against sum.golang.org.** First thing on a normal machine:
`cd relay && go mod download && go mod verify` (with the default `GOPROXY` and `GOSUMDB`); a mismatch would point
at that sandbox method.

## Verified so far

- Go: `go vet`, `gofmt -l` clean, `go test -race ./...` green on Go 1.27.4; every vector file passes.
- Game: the 169 focused tests above pass; every vector relevant to the client passes; i18n 0/0/0.
- Performance against main on the big-network fixture (unjoined save): no slowdowns beyond noise, routing
  identical (compute() 68.4 → 60.5 ms, dayTick() 67.7 → 66.8 ms, after() 4.27 → 4.67 ms).
- Independent review of the whole branch: 12 findings (3 high, 6 medium, 3 low), all fixed with regression tests
  (`relay/internal/node/limits_test.go`, `relay/internal/shun/shun_test.go`, `relay/internal/store/store_test.go`,
  `tests/federation-hardening.test.js`, `tests/docker.test.js`). The reviewer found workflows, saves and exports,
  escaping in the multiplayer sheets, privacy and the hard rules clean.
- The full `npm test` and the GitHub workflows have **not** been run.

## Done since the first handover (2026-11-12)

- **Hosting straight from the repo** (Frederic, 2026-11-13): `relay up` (init + genesis or join on the first start from
  flags/env, then serve; waits for a missing certificate; the image's default command) and `relay/docker-compose.yml`
  + `relay/.env.example` (relay serving TLS, certbot issuing and renewing, named volumes and inline configs only, so a
  remote Docker context works); HOSTING.md "From the repo", RELAY.md "relay up", `tests/docker.test.js`.
- **Joining finds nodes in the registry** (Frederic, 2026-11-13): `relay join SERVER` / `RELAY_JOIN` take the server's
  node URLs from servers.json (own URL left out, first that answers first); `--from`/`RELAY_JOIN_FROM` only for
  unlisted servers; `relay up` retries and logs the add-node line until approved (`cmd/relay/joinreg.go`).
- **Open listed servers sync automatically** (Frederic, 2026-11-13: "all open servers listed on the GitHub server list
  should all auto accept each other"): spec §10.9 "Who connects": open + live (`answered` within 14 days of `asOf`)
  registry servers sync with each other, every pair up to 64 peers, a deterministic chord graph beyond (offsets
  `c*b^j`, diameter ≤ L); the lower identity dials, one session per server pair (also when both configure each other
  by hand); multi-node servers dial from their lowest-key live node, rotating through the peer's nodes; recomputed on
  every registry install; automatic peers have their own room beside `maxNodes`. `relay/internal/registry/auto.go`,
  `relay/internal/node/auto.go`, vectors `federation/vectors/autosync/`, `relay status` `auto`, config `autoSync:
  false` opt-out, `relayload --mesh registry`; fed-e2e's two servers have no neighbours configured.
- **Relay versions and update notices:** `welcome`/node `hello` carry `impl`, catalog entries an `impl` list; the site
  build writes `federation/relay.json` (security via package.json `relaySecurity`); relays read it beside the
  registry and tell operators (log, `relay status`, metrics, `update` frame, opt-in `notifyURL`); the looking glass
  shows "relay x.y.z" per node and the operator panel an update banner (`relay/internal/update`, `node/update.go`,
  spec §9.3, §10.8, §11.4, RELAY.md "Versions and update notices", vectors `impl`, `tests/federation-update.test.js`).
- **Versions come from GitHub** (Frederic, 2026-11-13): relay.json first, else GitHub's latest-release API
  (`update.ReleasesURL`, `source: "github"`, never security, 403/429 back-off); the gossip quorum hint is gone, gossip
  versions are display only. **Multiplayer only online:** the title's switch is disabled offline and falls back off
  when the server list fails or is empty (a valid typed address still counts); Start is never blocked by it.

- **Relay memory** (Frederic, 2026-11-13): the store keeps a 112-byte entry per record and reads records back from
  the day files (recent ones and the chain in memory), the aggregator packs its records and slot sums: about 0.7 KB
  of heap per record instead of 5.4 to 5.9 (`BenchmarkMemory`), same day-file format; sizing in HOSTING.md.
- `relay/go.sum` regenerated from scratch with a fresh module cache against proxy.golang.org and sum.golang.org:
  byte-identical, `go mod verify` clean.
- Relay tests failed on macOS (operator socket path over the 104-byte Unix limit under `t.TempDir()`): tests use
  `relaytest.Dir(t)`, `ops.Serve` names the problem. A node `carry` now walks the store in chunks, releasing the lock.
- **End-to-end:** `node scripts/fed-e2e.js` (about 6 minutes; `--headed`, `--keep`, `--quick`) builds the real relay,
  founds five servers, serves TLS on loopback and drives two real game pages through join, announce, paged sub and
  cursor resume, terms, a peering request accepted and a PNI declined, a shun vote, the operator panel, stats, the
  board, rate limits, metrics without addresses and leaving: 22/22. It found eight client bugs, all fixed with
  tests in `tests/federation-wire.test.js` (refused sub never retried, unsub by the wrong id, unsub ack without
  `rid` dropped the connection, multi-frame catalogs cut, sub pages racing their cursors, concurrent record batches
  losing votes, the 48-network snapshot hiding new players from each other, board retries giving up too early).
- **Shun votes for operators only** (Frederic, 2026-11-12): clients prove keys with `auth` (§9.3); relays send `shun`
  and `unshun` only to a session that proved an operator key of their server, and every client gets the outcome in
  `excluded` frames (reasons, without counts, only to the excluded key itself). Games keep each joined server's list
  (`kv` `excl:<url>`) and use the union; votes are kept only on a device with an operator key. Node-to-node sync is
  unchanged. Vectors: `auth` area, wire cases. End to end: the shun step checks Bob sees no vote, Alice (operator) does,
  the target's own session gets `["spam"]`.
- Relay Docker image built (10.9 MB, amd64 cross-build too, `init` on a volume as the unprivileged user).
- **Server-ranked leaderboards** (Frederic, 2026-11-12): `rank`/`ranks`, `facets`, `nets`/`netstats` and `rankwhy`
  replace `board` (§9.5, §10.12); the relay ranks in memory (`relay/internal/rank`, held to `boards` by a randomized
  test), games get the top 50 and their own row, merge their servers, keep answers offline, and spot-check rows.
- **Operators cannot read or steer other players' deals** (Frederic, 2026-11-12). Offers to someone and declines are
  sealed for the other party (§3.5, §5.3: X25519 box key derived from the identity seed and published as `box` in the
  announce, HKDF-SHA256, AES-256-GCM bound to the record), relays check only their shape and send deal records only to
  the two parties' sessions (§9.3; open consortium projects stay public). One server's `excluded` list now only hides a
  network and stops new deals; running deals end only when a strict majority of the joined servers, and at least two,
  list it (§10.7). Vectors: `box` area (both implementations), records updated. Tests: `tests/federation-sealed.test.js`,
  `relay/internal/node/deals_test.go`; end to end, a third raw client sees none of Alice's and Bob's deal records.
- Perf against 9c26d03, headless and Chromium desktop/phone: no slowdowns beyond noise, routing identical.
- **Federation worker** (Frederic, 2026-11-12: "workers on the clients for all the demanding stuff"): record, receipt,
  spot-check and registry checking run in a dedicated worker built from the page (`88-fed-worker.js`, falls back to the
  page); measured with `node scripts/fed-perf.js` (phone profile), see FEDERATION-CLIENT.md "Workers".

- **Newcomers and mentors** (Frederic, 2026-11-12): a **customer cone** board (§10.4: networks reachable over transit
  edges both sides list in `stats.cust`/`stats.up`, with traffic both ways, to members that joined 30 days before and
  were heard in the last 7; relay `relay/internal/rank/cone.go`, held to `boards.Cone` by the randomized test), the
  **newcomer price** (§10.10: `terms.founded`, 25% off for a buyer in its first 30 days from an established seller,
  checked by both games) and the **mentor dividend** (`89-fedplay-mentor.js`: one-off bonuses when a newcomer reaches 10
  POPs, Tier 2 or a transit customer within 60 days of a deal; at most 5 newcomers in 14 days, heard on 3 UTC days).
  `nets` answers carry `tier2`, `pops`, `cust`, `slot`. Tests: `tests/federation-cone.test.js`,
  `tests/federation-mentor.test.js`, Go `TestConeShapes`, `BenchmarkConeBoard`; vectors boards 022–030, deals 030–037,
  records 135–143; end to end four new steps.

- **Full project review** (2026-11-12): six parallel reviews (relay network/security, relay data, client core,
  multiplayer gameplay/UI, single-player core, single-player UI/site/build/CI). Fixed with a regression test each:
  18 relay findings (bloated catalog entries, signature-weighted pacing, unverified-peer limits, votes only from the
  registry, durable leave removals, torn lines, retention for carry-forward and shun lift, ranking order/slot/key
  races, one relay per data folder, /64 limiter, …), 15 client findings (per-network cursors and caches, no sub
  without auth, back-off that holds, pending deals kept, renewals once and on time, deal cap keeping running deals,
  honest consortium price, …), the service worker caching 404s as the game page, focus after modals, `$HOST` in
  dev.js, finishing an in-flight day before a forced save, hostile loan/grace/transit numbers in saves. Full checks:
  focused tests 292/292, Go race clean, vectors 254, i18n 0/0/0, end to end 30/30, perf (jsdom, Chromium desktop and
  phone) no slowdowns, routing identical.
- **Start in multiplayer** (Frederic, 2026-11-12): the title's Normal door has a "Play with others" switch with a
  lazy server picker; the game joins once the charter is signed, solo with a toast when that fails (FEDERATION-CLIENT.md
  "Starting in multiplayer", `tests/federation-start.test.js`; end to end, Bob now starts that way, Alice via the sheet).

## Open work, roughly in order

0. Follow-ups from the review: (a) two announces of one network signed in the same second tie on `t` and games keep
   the lower id (§10.11); the e2e waits a second between term changes. Proper fix: a per-network sequence number in
   the announce (spec, Go, vectors). (b) The fiber market's cut shock picks its city by hashing a clock-based incident
   id (`37-fiber-market.js`): deterministic per run, but not across replays; changing it alters game outcomes vs main,
   so do it with a release. (c) Leaderboard board fetches no longer exist, so the old global record queue concern is
   gone; the remaining main-thread cost during a big backlog is IndexedDB writes (`scripts/fed-perf.js`).

1. Decisions for Frederic:
   - FEDERATION-PROTOCOL §9.3: an `ack` answering `unsub` carries only `id` (spec matched to what the relay sends).
   - Networks with deals, requests or picked in the looking glass (in memory, at most 8) take priority in the
     48-network snapshot.
2. Let CI run the relay job once (workflows are still unlinted and unrun). Repo setting for the weekly liveness
   workflow: "Allow GitHub Actions to create and approve pull requests". Registry merges reach the site only with a
   release unless `federation/servers` is copied the way weekly puzzle files are.
3. Not yet covered end to end: node-to-node sync, failover to a second node, two servers syncing, `cosign`, the
   "Move to another device" file, a real MaxMind country database, nginx/Caddy in front.
4. Known leftovers:
   - The relay answers `retry: 1` for every rate limit; the client copes, but the hint is optimistic.
   - The NOC queue's "Review" opens the dashboard underneath an open multiplayer sheet.
   - The operator panel shows only this game's own connection state and errors (no node-status query), and
     operator actions need the save joined and connected to that server.
   - Exchanges run by players reuse the player's own exchange; capacity swaps back up one shared route.
   - No "Tier 1 among players" rule beyond reach.
   - Two muting strings still say a muted network vanishes from "your map" (`fedui.muting_hides_a_network_from_your`,
     `fedui.none_muted_networks_vanish_from_your`); players' networks are never on the map, so give them new labels
     saying "lists". Keep the privacy sheet and `site/privacy.html` in step with `docs/RELAY.md` when retention changes.
5. Spec gaps resolved locally, to settle with Frederic: `S.fedn` in the save (the route worker only receives `S`);
   no RPKI field in the announce; shared route leaks and consortium "funded" have no record; `decline` ending a
   running deal goes to the counterparty; a restrictive policy forces peering requests to review.
6. Offered but not decided: "Joined saves" and "Why people stay" sections in the design doc.
7. When Frederic says so: push the branch and open a pull request (perf table in the body), then follow CI.

## Hard rules worth repeating

GitHub Pages only; no runtime cost for structure; every player-facing string by label in all six dictionaries
(`scripts/i18n-add.js`, Italian included); phones first (360 px, portrait and landscape, bottom sheets); saves are
sacred (defaults in `newGame()`, repairs in `sanitize()`); performance demonstrated against main for every change
to `src/` or `site/`; tests come with every fix; names the game ships are puns; game code never names agent code
(ADR 0004); easter eggs stay secret.

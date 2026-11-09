# Architecture

Series of Tubes is a static web game hosted on **GitHub Pages, and only there**
([ADR 0001](adr/0001-github-pages-only.md)). Its source is split into many small files under `src/`;
the build joins them into **one self-contained `index.html`** (one inline `<style>`, one inline
`<script>`), exactly the page players have always loaded ([ADR 0002](adr/0002-one-page-assembled-at-build.md)).

```
src/                         the game page, in pieces
  index.html                 shell: <head>, static markup, the language loader, the @include lines
  i18n/en.js                 the English for every label → inlined at the top of the page's <script>
  styles/NN-*.css            → pasted into the page's <style>, in path order
  game/NN-area/NN-*.js       → pasted into the page's <script>, in path order
  agent/NN-*.js              → the agent facade the MCP server drives: development page only (@include-dev)
site/                        static files copied to the build as they are (dictionaries, icons, sw.js…)
scripts/lib/page.js          the assembler: <!-- @include DIR --> → every file under src/DIR, sorted;
                             <!-- @include-dev DIR --> the same, in the development page only
scripts/build.js             _site/ = site/ + the assembled page, version-stamped, release notes baked in
```

Because the partials are concatenated into one classic script, they share one top-level scope, just as
when they were one file: `S`, `CITY` or `compute()` are visible everywhere, function declarations are
hoisted across files, and top-level statements run in path order. Find code by name
(`grep -rn "function compute(" src/game`); the folders follow the game's layers:

| Folder under `src/game/` | What lives there |
| --- | --- |
| `00-core/` | `tr()`/`trn()`/`N_()` and the dictionary; version, release notes and the analytics counter |
| `10-catalog/` | Prices and gear: POP and port costs, routers (`RG`), supply chain, port slots, dark fiber systems and optics (`OPT`), reach and subsea upgrades |
| `20-world/` | Map projection, landmasses, coastline, city coordinates (`CITY_LL`), `CITIES`, `CABLES` |
| `30-networks/` | Other ASes (`NETS`), rival exchanges (`XIX`), the long tail, traffic shares (`NSH`) |
| `40-progress/` | Customer types (`BIZ_T`), `LEVELS` and their requirements, `GOALS`; the per-save ruleset (`S.rules`, `rule()`, `PRESETS`, `chaosMul()`, `leadDays()`) |
| `50-state.js` | The globals `S`, `R`, `UI`; `emptyR()` |
| `60-features/` | Moving a customer to another path (`37-customer-paths.js`), banks and loans, scenarios and the weekly challenge, puzzles and the published weekly puzzle, conferences, the tutorial, traceroute, the share card, `newGame()`, the offer trial (`autoOffer()`), standing orders (`S.ops`, `opsDay()`, run from `dayTick()`), the sales desk (`S.sales`, `salesDay()`, `salesShape()` on new offers, orbit ones through `pieSlShape()`; signing for you: `S.slAuto`, `slAutoDay()`; renewal haggles: `S.slAuto.ren`, `slRenDay()`) |
| `70-rules/` | Formatting helpers and market rules: exchanges, PNIs, the peering desk (requests answered by policy), peering policy and snubs, DE-KICKS, sold-out routes, hot ports and the Tier 1/2/3 rank |
| `80-simulation/` | Dijkstra, RouteScript, where a DDoS flood goes (`ddosLoad()`/`ddosAfter()`, called by `compute()`), `compute()`, monthly prices, `sanitize()`/`migrate()`, customer requirements, events, the customer lifecycle (contracts, renewals, the bandwidth market, why customers leave), geography pricing and latency, second sites and service |
| `85-incidents/` | `addInc()`, DDoS attacks (targets, sizes, scoring, the NOC card) and scrubbing, `failureRun()`/`fireFailure()`, `clearInc()`, `fireEvent()`, the chaos monkey, cable ships (`50-cable-ships.js`: a subsea cut sends a club ship from its port along the cable routes; voyages in `S.fleet`, drawn by `96-map/88-cable-ships.js`) |
| `88-days/` | `dayTick()`, new offers, badges, `checkGoals()` |
| `90-actions/` | The `ACT` map, one file per area (`const ACT` in `10-interface.js`, `Object.assign(ACT,…)` in the rest), and their helpers |
| `91-save.js`, `92-audio.js` | Save, export and import; sound effects |
| `93-ui/` | DOM helpers (`$`, `btn`, `morph`), the phone tab bar, install pitch, HUD, left panel, city and link panels, decommissioning |
| `94-dashboard/` | Scenario and level progress, where to meet a network, customers and connections overviews, cities with no POP yet, lease swaps, the NOC dashboard and its own window for a second display (`90-noc-window.js`: this page at `?noc=<slot>`, a read-only copy of `S` and `R` over a BroadcastChannel, clicks sent back to the game; `91-noc-wall.js`: its wallboard), the bank, hints |
| `95-modals/` | Toasts, notifications, modals, title screen, what's new, help, the link and own-cable modals |
| `96-map/` | The canvas: resize, land and clouds, settings, level of detail, link geometry, how each tube looks, the WebGL map (the default, 2D as fallback: context, background, tubes, and the sprite atlas cities, labels and markers are drawn from, in 2D too), `draw()`, the world layer, cities, input and click delegation |
| `99-loop.js` | `frame()` and `boot()` |

`src/styles/` holds the CSS the same way: base, HUD, drawers, toasts, modal, tablet, then phone.

`src/agent/` is the agent facade (`window.TUBES`): the typed commands, reads and screens the MCP server plays
through. It is assembled into the **development page** only (`npm run dev`, the MCP server, tests that ask for it);
the page players get never has it ([ADR 0004](adr/0004-dev-only-code.md)). Its top-level names all start with
`api`/`API_`, and nothing outside `src/agent/` may use them. Where it must reach into the game (agent mode in the
player's tab locks the clock and draws its badge and Settings section), the game offers `HOOKS` and the flag
`UI.clockLocked` (`50-state.js`), empty and false in the page players get, and `runClock(dt)` (`99-loop.js`).

Rules for the source (checked by `tests/build.test.js` and the assembler): files are named
`NN-lower-case.js`/`.css`, end with a newline and never close their `<script>`/`<style>`; top-level code
may only use top-level values from earlier files; tables people add to have one entry per line, the
id-keyed ones sorted. New features get their own file in the right folder (`edit-the-game` skill).
Development runs on `npm run dev` (assembles the development page on every request, reloads on save);
`npm run page -- -o FILE` writes the page players get, `npm run page -- --source --dev -o FILE` the development page.

## Other files

| Path | What it is |
| --- | --- |
| `src/i18n/en.js` | English: label → text, one entry per line, sorted; inlined into the page by `<!-- @include i18n -->` |
| `site/i18n/it.js`, `pt.js`, `fr.js`, `es.js`, `de.js` | Translations: label → text, the same layout; loaded only for that language |
| `site/sw.js` | Service worker: network-first for pages, stale-while-revalidate for assets. Cache name is stamped with the version |
| `site/site.webmanifest`, icons, `404.html`, `CNAME`, `robots.txt`, `sitemap.xml`, `llms.txt` | PWA and GitHub Pages files, copied as they are |
| `scripts/lib/page.js` | Assembles the page from `src/` (also from a git ref with `--ref`, for performance baselines) |
| `scripts/lib/compile-labels.js` | Shrinks labels to short ids in the shipped page and dictionaries |
| `scripts/build.js` | Builds `_site/` for GitHub Pages: copies `site/`, writes the page, stamps `__VERSION__`/`__BUILD_DATE__`, bakes release notes, writes `version.json` |
| `scripts/dev.js` | `npm run dev`: development server (loopback unless `--host`), serving the development page and hosting the agent relay |
| `scripts/test.js` | `npm test`: runs every `tests/*.test.js` |
| `scripts/release-notes.js` | Extracts a version's CHANGELOG bullets |
| `scripts/perf-bench.js`, `perf-browser.js`, `perf-stats.js`, `perf-fixture.js` | Big-network benchmark, base vs head, headless and in Chromium as a desktop and a throttled phone, with a significance test per row (posted on every PR by `perf.yml` + `perf-comment.yml`), and the generator of its save, `tests/fixtures/big-network.json` |
| `scripts/gpu-bench.js`, `scripts/lib/gpu-bench-client.js` | `npm run bench:gpu -- --save FILE`: the map in your own browser on your own graphics card, 2D against WebGL, scenario by scenario; the table shows in the page and in the terminal |
| `scripts/mcp.js`, `scripts/lib/mcp-game.js`, `scripts/lib/mcp-headless.js`, `src/agent/` | The game as a local MCP server, on the official SDK over stdio or HTTP: typed tools to play, inspect and debug it from an AI client, headless or in the player's own tab ([MCP.md](MCP.md)) |
| `scripts/agent/relay.js`, `scripts/lib/mcp-browser.js`, `scripts/lib/relay-client.js` | The agent relay `npm run dev` hosts at `/agent`, and the MCP server's side of it: how a tool reaches the game in the player's tab |
| `scripts/i18n-check.js`, `scripts/i18n-add.js`, `scripts/lib/dict.js` | Translation coverage and dictionary order; adding, renaming and removing entries |
| `scripts/legacy/` | The splitter that made `src/` from the old `site/index.html` (and gave its text labels), and `port-branch.js`, which carries older branches over |
| `tests/harness.js` | Loads the assembled page in jsdom with a seeded `Math.random` and a fake canvas: the players' page, or the development page with `{agent: true}`. The page's scripts run straight in the window (jsdom's parser is slow on 2 MB of script) |
| `scripts/test.js`, `tests/durations.json` | Runs the tests, every file in its own process; splits them into parts of equal time for CI (`--plan`, `--shard`) by each file's seconds, which CI refreshes after every run on `main` |
| `.github/workflows/ci.yml` | Tests (split over 6 runners), build and translations on every push and PR; the releases call it too, so the tests run one way everywhere |
| `.github/workflows/auto-release.yml` | After every green CI on `main`: if `package.json` has a new version, tag the commit CI tested, publish the GitHub release from the CHANGELOG, start the deploy (`tested=true`, so it does not test again) |
| `.github/workflows/release.yml` | Builds and deploys to GitHub Pages, the only workflow that can |
| `.github/workflows/weekly-puzzle.yml` | Sunday 03:37 UTC: makes the week's puzzle, commits it to `main` (data only, no release) and starts `release.yml` for the live release tag with `weekly=true` |
| `scripts/weekly-puzzle.js`, `site/puzzles/weekly/` | The weekly puzzle generator and its output, one `<key>.json` per week plus `index.json` (see below) |
| `scripts/weekly-scenario.js`, `scripts/lib/scenario-bot.js`, `site/scenarios/weekly/` | The weekly scenario generator, its reference player and its output (see below) |
| `docs/adr/` | Decisions: GitHub Pages only (0001), one page assembled at build (0002), translations by label (0003), development-only code (0004) |

## Globals

- **`S`**: the whole saved game (one JSON object). Cash, day, POPs, links, transit,
  IX ports, PNIs, caches, customers (`biz`), offers, incidents (`inc`), live events
  (`ev`), stats, settings. Saved to `localStorage` key `sot-save-v1:<slot>` (one per network, see below).
- **`R`**: results of the last `compute()`: per-link load, per-exit use, served and
  demanded traffic, reach, costs and revenue. Never saved; always rebuilt.
- **`UI`**: view state (selection, open tabs, speed, confirmations). Not game state.
- **`cam`**: map camera (x, y, zoom).

Lookup tables built at load: `CITY[id]`, `NET[id]`, `CABLE`, `FAB`, `BIZ_T`, `REQS`.

## The life of a day

`frame()` (requestAnimationFrame) accumulates time (`runClock()`); every `DAY_MS × speed` it starts a day, inside a
try/catch so one bad tick never freezes the game. In play the day runs with the route worker (below), one day in flight
at a time: the clock waits for the day, never the other way round, so a machine that cannot keep up at ×8 plays slower
instead of freezing to catch up. Without a worker it calls `dayTick()`, at most four times per frame.

A day is a generator, `dayRun()` (`src/game/88-days/10-day-tick.js`): `dayPreRun()` (the world moves on), then
`dayPost()`, and the intern's shift (`opsRun()`) and the sales desk's (`slAutoRun()`) inside it are generators too. Each
`yield` is a `compute()` the day needs before it goes on: the day's own routing, then a recompute after failures and
events, and after the intern's jobs. `dayTick()` (tests, the fallback) answers each one with `compute()` on the spot
(`dayGo()`); in play the route worker answers them. `yield DAY_REST` is not a routing, only a place where a long day may
let a frame through. Same steps, same random numbers either way: routing draws none. Nothing of a day routes on the page:
a failure (`failureRun()`; `fireFailure()` plays one at once through `runNow()`), a DDoS and Auto-RTBH (`ddosNewsRun()`),
the chaos monkey's snip (`mkSnipRun()`), an event's cut (`eventRun()`: its routing is deferred to the next yield) and the
sales desk's trials (a `{trial}` yield the worker answers with yes or no, `offerTrial()`) are all steps. The intern's
orders are generators too, with a rest after each job. `UI.tick` (what the day itself announces, which quiet
notifications may keep to the NOC log) is set around every step (`dayStep()`), on both sides of the worker.
A big autosave is packed, turned into text and compressed in the worker (`rwSave()`), the page only writes it. The
diverse-paths map and the latency floors new offers need are worked out a millisecond a frame ahead (`diversityWarm()`,
`latWarm()`). A rest waits for the next frame only when none was drawn just now (`rwLater()`).

The daily mood check asks "a path without subsea" for each customer that wants one: during that loop the land-connected
islands are worked out once (`TERR`, `terrIslands()`), and two cities have a land path when they share one.

The day:

1. Advances `S.day`, runs scheduled world events (conferences, IX price wars, licences).
2. Runs `compute()` to route today's traffic.
3. Records history for 95th-percentile billing, stats and streaks.
4. Rolls failures (`failureRun()`) and events (`fireEvent()`) when their timers run out,
   and expires incidents.
   Then the NOC intern's standing orders (`opsRun()`, or `opsDay()` in one go), if one is hired: each order clicks the
   same `ACT` actions a player would, muted, within its monthly budget, and the shift routes again (a yield) before
   decommissioning, which reads today's loads, and at the end, each only if a job changed the network. An order that
   throws is paused; the day goes on. The NOC gets one notice a week. The orders plan for every POP each day, so what
   they count is counted for all POPs in one pass (`portsAt()`, `cachePlan()`, `pniFlows()`, `pniBatch()`), never one
   pass over the network per POP.
   Then the sales desk (`slAutoDay()`), if someone runs sales and the player lets them sign: deals are Sales', never
   the intern's. Each salesperson signs in their own style (a routing trial a day, or the shark's sign-everything).
5. Updates customer mood, churn and new offers; IX members join; loans tick.
6. Every 30 days: bills the month (revenue minus costs) and checks for bankruptcy.
7. Checks goals, level, badges and scenario end conditions.

## compute(): the traffic model

1. Builds a graph from your live links: parallel links between the same two cities
   merge into one edge with summed capacity. The routing metric belongs to the city pair
   (`S.pairMet`) and sets the edge's weight; Dijkstra gives shortest paths from each POP.
   Links on standby (`l.standby`) add their capacity to the edge, but when loads are
   handed back to links the active ones fill first and standby links take the rest.
2. Builds the exit list `E`: embedded caches (rank 0), PNIs and IX ports (2, both peering),
   transit (3). Each exit has a capacity, the networks it can reach (`ok(net)`) and an
   egress preference (`high`, `normal`, `low` = backup only). A transit port can also be set to
   carry (`t.carry`): see step 4.
3. Builds flows: for every POP, its demand (eyeballs and customers) split across
   destination networks by their traffic share (`NSH`, with regional variants for
   China, Russia and Korea). Incidents can add junk flows or scale demand.
4. Routes flows rank by rank: the nearest usable exit first, ECMP across equal exits (a PNI goes before an
   IX port at the same distance: `PNI_TIE`, #298),
   consuming link, router (`nodeCap`) and exit capacity. A carrier's own transit port also
   goes first, before plain transit, for traffic bound for that carrier or for a network that buys
   transit from it (`25-direct-egress.js`: the shorter AS path): always at its own POP, and from every
   POP when the port is set to carry. Such a port is still an ordinary transit exit for the other
   POPs. Backup, RouteScript and Auto-TE rules keep their say, and so does a Prefer-marked port at its own POP (the other
   POPs keep the rule). With Auto-TE, overflow spills
   onto alternate paths; RouteScript rules (`teRules()`) can prefer, avoid, cap, drain
   or blackhole.
5. Layer-2 customers (L2VPN, SD-WAN, waves) are carved out of link capacity first.
6. Totals costs (`R.cost`) and revenue (`R.rev`) per month.

It runs every day and after every action, so it is built for big networks: the graph works on city
indices (`CIDX`), each exit is asked once per network what it can reach, and `R.ef` (what crosses each
link) is only put together for a link when something reads it.

What follows from the network's shape alone is kept from one call to the next (`29-route-cache.js`): the shortest
paths from every POP, and who reaches whom with each network's exit lists. Each has a key made of everything it is
built from (the live graph with its weights; every exit with what it reaches and how it is preferred, RouteScript and
the events that move routes), so most days, when only demand changes, they are reused, and any other change rebuilds
them. Only indices are kept: exits, lists and paths are made fresh every call, because routing writes on them.
`tests/route-cache.test.js` checks the keys, and the equivalence tests route with and without the kept tables.
`scripts/route-fuzz.js` plays hundreds of random seeded games on main's page and this checkout's at once, comparing all
of R and S after every move and day, with the kept tables and without (`tests/route-fuzz.test.js` plays a few).

Each loop of `compute()` runs in a function of its own (the money is `computeMoney()`). V8 optimises a small function
quickly and keeps it; `compute()` as one 33 KB function never stayed optimised: it ran in baseline code, boxing every
number, and was compiled again and again in the background only to be thrown away, which cost more CPU than the routing
itself. Keep it that way: a new loop goes in a function.

The routing core, the loops that place every flow on an exit (`rankPass`, `directPass`, `sendGroup`, `send`, `push`,
`carry`, `altPath`), lives in `ROUTE` (`29-route-core.js`), made once at load: `compute()` hands it the day's state
(`ROUTE.nodes()`, `ROUTE.run()`). Made inside `compute()`, as they were, they were new functions every call, and V8 threw
away the code it had compiled for the old ones. The core reads exits by number from typed columns (`USED`, `CAPX`, `CIX`,
`HPX`, `VISX`), and each list as an object of one shape (`lx()`). For each list and source city, the route cache also
keeps the list in the order routing tries it (`xOrder()`: by preference, then distance, a stable sort): on a day the cache
is used, a flow's first group is where that order starts, past the exits that filled up, instead of a scan of the whole
list, and what is left needs no sort. Auto-TE marks the pairs that have no detour (`TEF`), the answer to most of its
asks. `tests/day-steps.test.js` and the routing equivalence tests hold all this to the same results.

Served share per city (`sfOf`) drives eyeball revenue and customer mood.

## Routing in a worker

During play, each day's `compute()` runs off the main thread (`src/game/80-simulation/28-route-worker.js`), so a big
network does not freeze the page once a day.

- **Built from the page itself.** The worker is the page's own inline game script (`document.currentScript.textContent`)
  run again from a Blob URL, after a short prelude of inert stand-ins for `document`, storage and the other DOM globals,
  and the player's dictionary. Nothing is fetched: GitHub Pages still serves one page, and a release cannot mismatch.
  In the worker `RW_IN` is true and `boot()` never runs; the catalogs are rebuilt by the same top-level code.
- **The day in steps.** In play, `frame()` calls `rwDay()`, which runs `dayRun()` (see "The life of a day") with
  `rwGo()`: the steps run on the page up to a yield, then S and what routing reads of yesterday's R (`R.load`,
  `R.l2route`, `R.efg`) are posted, and the day goes on in `rwDone()` when R comes back. The next day waits until the
  last step has run. So a day sees exactly the routing it would have had in one go: same results, same random numbers.
  At a `DAY_REST`, a day that has run `RW.budget` ms (half a frame: 3 to 8, or up to 32 on a device slower than 50 frames a second) already goes on after the next frame
  (`RW.later`, `rwLater()`), so a phone gets its frames between the steps of a big network's day. Half a day is never
  saved; nothing else starts meanwhile. `tests/day-steps.test.js` plays a second page as the worker and compares every
  day with `dayTick()`.
- **What crosses.** `R.ef` and `R.fl` are lazy getters; their pieces (`R.efp`, `R.flc`) travel instead, typed arrays
  transferred, and `efBuild()`/`flDefine()` (in `30-compute.js`) rebuild the same lazy R on the page. What crossed each
  link (`R.efp.L`) crosses as typed arrays with each exit key once (`rwLOut()`), and the page decodes a link only when
  something reads it (`rwLIn()`). Two parts are not sent again when they would be the same: `R.egDesc` comes back as 0
  when it is the last one key for key (the page keeps `RW.desc`), and `R.efg` is not posted back while R is the worker's
  own last answer (`RW.wR`; the worker keeps it in `RW.last`). Both sides read every message in order, so they always
  hold the same last one; `tests/day-steps.test.js` plays a second page as the worker and checks it all.
- **Actions mid-day.** Every `compute()` bumps `RW.gen`. If an action routed while a day was in flight, the worker's
  answer is stale: it is dropped and the day ends with the action's R.
- **Fallbacks.** Tests (`__TUBES_TEST__`, and jsdom has no Worker), `window.__TUBES_SYNC__`, a browser without workers, a
  post that fails or a worker that errors take the synchronous path (`rwKill()` routes the day in flight on the page).
- **Still on the main thread**, because the caller reads R right away: actions (`after()`), loading a game, failures and
  RouteScript what-ifs and the link panel's cut check. Everything a day routes (failures, events, DDoS, the chaos monkey,
  the intern's shift, the sales desk's trials) is a yield of the day, so it goes to the worker.

## Actions and rendering

- Player actions live in `ACT`. Buttons render as `btn(label, act, args, cls, disabled)`
  and a delegated click handler calls `ACT[act](JSON args)`.
- An action validates its inputs (they come from the DOM), mutates `S`, shows a
  `toast()` and calls `after()`.
- `after()` = `purgeInc()` + `compute()` + `checkGoals()` + `renderAll()` + `save()`.
- `renderLeft()` draws the left tabs (deals, NOC, customers…), `renderPanel()` the
  selection panel (city, link, network). On phones these become bottom sheets
  controlled by `renderTabbar()`.
- These panels and the dashboard are rebuilt as HTML every tick and written with `morph()`, which
  patches only what changed. Buttons whose action changed are replaced, so taps stay safe (#44).
- The map is a canvas drawn by `draw()` from `frame()`. Zoomed out (`lodFar()`) it uses
  a simplified style; parallel waves are grouped by `linkGroups()`. `mapStill()` decides whether a frame is drawn:
  when nothing changed (paused, animations off) it is not, except once a second; when only the animation clock moved
  (packets, waves, clouds, floaters) the map is ambient and drawn at most 30 times a second; anything else that moves
  (camera, pointer, selection, the network) gets every frame (`tests/frame-pacing.test.js`).

## The weekly puzzle

A puzzle week runs from Sunday 06:00 Berlin time to the next Sunday 06:00, and is named after the ISO week of
its Monday (the week starting Sunday 1 November 2026 is `2026-W45`); `pzWeekKey()` and `pzWeekStart()` in
`src/game/60-features/93-puzzles-weekly.js` handle summer time and the year boundary.

Every Sunday `weekly-puzzle.yml` runs `scripts/weekly-puzzle.js`, which loads the real game headless, picks a
theme the last three weeks did not have (region tour, ring, detour around a hub, ocean crossing, island hopping,
latency sprint) and cities the last four weeks did not use, gives them traffic (content in the first city, eyeballs
in the others, a circuit with a latency cap for a sprint), searches for the cheapest topology that connects them and
the cheapest one that survives any single cut (a whole cable, or a trench), then sizes both with the game's own
routing (`scripts/lib/puzzle-solver.js`: links and routers big enough for every flow, after any cut too, then as
small as they go). The budget sits just above that N-1 build. Both references are judged by the game's own star
code and must earn one and three stars, or the puzzle is thrown away. The file holds only ids, numbers and
translation labels with their fill-ins
(`{"v":2,"key","theme","cities","src","dem","via","avoid","budget","twist","name":{"l","p"},"joke":{"l","p"},"ref","rev"?}`).
`--check` re-validates every file the way the game does.

The game fetches `puzzles/weekly/<key>.json` (relative, same origin) only when the Puzzles list opens, and checks
it field by field (`pzWkValid()`): known fields, playable cities, labels from the theme's own list, sane numbers.
When it is missing, offline or wrong, the seeded weekly (`pzWeekly()`) stands in, so the weekly puzzle always
works. The service worker fetches these files network-first and keeps a copy for offline play.

The weekly ships without a release: the workflow commits only `site/puzzles/weekly/` to `main` (no version bump,
so `auto-release.yml` stays quiet) and starts `release.yml` from the live release's tag with `weekly=true`, which
rebuilds that exact release with every weekly file from `main` and deploys it. Every release build takes the
weekly files from `main` too, so no deploy ever drops a published week.

The weekly scenario is its twin, in the same weeks and the same workflow run: `scripts/weekly-scenario.js` writes
`site/scenarios/weekly/<key>.json`. A template (plain data in the script) picks a theme, a home city, rules from the
scenario vocabulary (`scnRule` keys, `WEEK_MODS`) and a goal type with parameters; each goal type (`WS_GOALS` in
`src/game/60-features/94-scenarios-weekly.js`) is implemented once in the game, with its progress card. A reference
player (`scripts/lib/scenario-bot.js`) plays it through `ACT`, seeded with the scenario's seed; the goal's number is
calibrated from that run, the scenario must not be won on day 0, the reference must win with a tenth of the days to
spare, and its finishing day is the par. The file keeps the reference plan (`ref`), which `--check` replays. The game
fetches the file when the Scenarios list opens, checks it with `wsValid()` (again in `sanitize()` on load), and falls
back to the in-browser `weekly()`.

## Saves, imports and migration

- `save()` writes `S` to localStorage every few seconds and after actions, into this window's slot
  (`UI.slot`, `src/game/91-slots.js`): `sot-save-v1:<id>`, plain JSON or `gz:`-compressed above a million
  characters, with a stamp `sv:{seq,at}` appended. Then the index `sot-slots` (name, ASN, preset, day, tier,
  cash, last played, size, seq) is updated; the title screen lists networks from the index alone. A save whose text is
  the one the slot already holds (`SLOT.txt`: a paused game, nothing changed) is not written again, unless the page is
  closing: on a big network the storage write costs more than making the text.
- Each tab keeps its slot in `sessionStorage['sot-slot']`. One window per slot: a Web Lock
  (`sot-slot:<id>`) where supported, plus a heartbeat `sot-open:<id>`; BroadcastChannel `sot-slots` asks
  another window to hand over, and the `storage` event stops a window whose slot was saved newer elsewhere
  (higher seq) or deleted. A window never writes a slot whose index seq is newer than its own.
- The single save of older versions (`sot-save-v1`) is copied to slot `main` and read back before the
  index lists it; the old key is removed only by that slot's next successful save.
- `boot()` loads the save through `migrate()` → `sanitize()`. If loading throws, the
  slot is kept and marked damaged in the index (it can still be exported or deleted).
- Puzzles never write a slot; while one runs, `save()` writes the network set aside (`UI.pzKeep`).
- `sanitize(s)` is the gate for all untrusted state (saves and imported files): it
  drops unknown ids, clamps numbers, repairs references and fills defaults. Every new
  field in `S` needs a line there.

## Translations

Text is keyed by label ([ADR 0003](adr/0003-translations-by-label.md)):

- `tr('area.label', vars)` looks up `DICT['area.label']` and fills `{placeholders}`; `trn('area.label', n)`
  picks `one` or `other` of a plural; `N_('area.label')` marks a label kept in a table or a save, translated
  where it is shown.
- `DICT` is the English (`src/i18n/en.js`, inlined into the page) with the player's language
  (`site/i18n/<lang>.js`) laid over it. English text from saves of 1.33 and older still finds its translation.
- Static markup uses `data-i18n="label"`, `data-i18n-aria-label`, `data-i18n-title`; `i18nDom()` swaps it at boot.
- The build swaps labels for short ids in the shipped page and dictionaries (`scripts/lib/compile-labels.js`);
  `N_()` labels stay whole because saves keep them.
- `npm run i18n:check` checks the English against the code and every translation against the English.

## Tests

`tests/*.test.js` use `node:test` and `tests/harness.js`, which assembles `src/` in memory, so tests
never run a stale build. `npm test` runs every file in `tests/`; a new suite needs no registration:

```js
const { load } = require('./harness');
const { ev, errors } = load();            // seeded, deterministic
ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'})");
ev("compute()");
assert.equal(ev("R.reach>0"), true);
assert.deepEqual(errors, []);
```

`ev()` runs code inside the page. To force a specific random failure, patch the
picker, e.g. evaluate `failureRun` with a `.replace(…)` and play it with `runNow(…)` (it is a generator).
Use `window.__reseed(n)` to reset the random sequence mid-test.

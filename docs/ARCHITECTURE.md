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
site/                        static files copied to the build as they are (dictionaries, icons, sw.js…)
scripts/lib/page.js          the assembler: <!-- @include DIR --> → every file under src/DIR, sorted
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
| `60-features/` | Banks and loans, scenarios and the weekly challenge, puzzles and the published weekly puzzle, conferences, the tutorial, traceroute, the share card, `newGame()`, the offer trial (`autoOffer()`), standing orders (`S.ops`, `opsDay()`, run from `dayTick()`) |
| `70-rules/` | Formatting helpers and market rules: exchanges, PNIs, the peering desk (requests answered by policy), peering policy and snubs, DE-KICKS, sold-out routes, hot ports and the Tier 1/2/3 rank |
| `80-simulation/` | Dijkstra, RouteScript, `compute()`, monthly prices, `sanitize()`/`migrate()`, customer requirements, events, geography pricing and latency, second sites and service |
| `85-incidents/` | `addInc()`, DDoS and scrubbing, `fireFailure()`, `clearInc()`, `fireEvent()` |
| `88-days/` | `dayTick()`, new offers, badges, `checkGoals()` |
| `90-actions/` | The `ACT` map, one file per area (`const ACT` in `10-interface.js`, `Object.assign(ACT,…)` in the rest), and their helpers |
| `91-save.js`, `92-audio.js` | Save, export and import; sound effects |
| `93-ui/` | DOM helpers (`$`, `btn`, `morph`), the phone tab bar, install pitch, HUD, left panel, city and link panels, decommissioning |
| `94-dashboard/` | Scenario and level progress, where to meet a network, customers and connections overviews, lease swaps, the NOC dashboard, the bank, hints |
| `95-modals/` | Toasts, notifications, modals, title screen, what's new, help, the link and own-cable modals |
| `96-map/` | The canvas: resize, land and clouds, settings, level of detail, link geometry, `draw()`, the world layer, cities, input and click delegation |
| `99-loop.js` | `frame()` and `boot()` |

`src/styles/` holds the CSS the same way: base, HUD, drawers, toasts, modal, tablet, then phone.

Rules for the source (checked by `tests/build.test.js` and the assembler): files are named
`NN-lower-case.js`/`.css`, end with a newline and never close their `<script>`/`<style>`; top-level code
may only use top-level values from earlier files; tables people add to have one entry per line, the
id-keyed ones sorted. New features get their own file in the right folder (`edit-the-game` skill).
Development runs on `npm run dev` (assembles on every request, reloads on save);
`npm run page -- -o FILE` writes the assembled page.

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
| `scripts/dev.js` | `npm run dev`: development server, no dependencies |
| `scripts/test.js` | `npm test`: runs every `tests/*.test.js` |
| `scripts/release-notes.js` | Extracts a version's CHANGELOG bullets |
| `scripts/perf-bench.js`, `perf-browser.js`, `perf-stats.js`, `perf-fixture.js` | Big-network benchmark, base vs head, headless and in Chromium as a desktop and a throttled phone, with a significance test per row (posted on every PR by `perf.yml` + `perf-comment.yml`), and the generator of its save, `tests/fixtures/big-network.json` |
| `scripts/i18n-check.js`, `scripts/i18n-add.js`, `scripts/lib/dict.js` | Translation coverage and dictionary order; adding, renaming and removing entries |
| `scripts/legacy/` | The splitter that made `src/` from the old `site/index.html` (and gave its text labels), and `port-branch.js`, which carries older branches over |
| `tests/harness.js` | Loads the assembled page in jsdom with a seeded `Math.random` and a fake canvas |
| `.github/workflows/ci.yml` | Tests and build on every push and PR |
| `.github/workflows/auto-release.yml` | On a `package.json` version bump on `main`: test, tag, GitHub release from the CHANGELOG, start the deploy |
| `.github/workflows/release.yml` | Builds and deploys to GitHub Pages, the only workflow that can |
| `.github/workflows/weekly-puzzle.yml` | Sunday 03:37 UTC: makes the week's puzzle, commits it to `main` (data only, no release) and starts `release.yml` for the live release tag with `weekly=true` |
| `scripts/weekly-puzzle.js`, `site/puzzles/weekly/` | The weekly puzzle generator and its output, one `<key>.json` per week plus `index.json` (see below) |
| `scripts/weekly-scenario.js`, `scripts/lib/scenario-bot.js`, `site/scenarios/weekly/` | The weekly scenario generator, its reference player and its output (see below) |
| `docs/adr/` | Decisions: GitHub Pages only (0001), one page assembled at build (0002), translations by label (0003) |

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

`frame()` (requestAnimationFrame) accumulates time; every `DAY_MS × speed` it calls
`dayTick()`, at most four times per frame, each inside a try/catch so one bad tick
never freezes the game.

`dayTick()`:

1. Advances `S.day`, runs scheduled world events (conferences, IX price wars, licences).
2. Runs `compute()` to route today's traffic.
3. Records history for 95th-percentile billing, stats and streaks.
4. Rolls failures (`fireFailure()`) and events (`fireEvent()`) when their timers run out,
   and expires incidents.
   Then the NOC intern's standing orders (`opsDay()`), if one is hired: each order clicks the same `ACT`
   actions a player would, muted, within its monthly budget, and the shift recomputes once at the end, only if
   a job changed the network. An order that throws is paused; the day goes on. The NOC gets one notice a week.
5. Updates customer mood, churn and new offers; IX members join; loans tick.
6. Every 30 days: bills the month (revenue minus costs) and checks for bankruptcy.
7. Checks goals, level, badges and scenario end conditions.

## compute(): the traffic model

1. Builds a graph from your live links: parallel links between the same two cities
   merge into one edge with summed capacity. The routing metric belongs to the city pair
   (`S.pairMet`) and sets the edge's weight; Dijkstra gives shortest paths from each POP.
   Links on standby (`l.standby`) add their capacity to the edge, but when loads are
   handed back to links the active ones fill first and standby links take the rest.
2. Builds the exit list `E`: embedded caches (rank 0), PNIs (1), IX ports (2),
   transit (3). Each exit has a capacity, the networks it can reach (`ok(net)`) and an
   egress preference (`high`, `normal`, `low` = backup only). A transit port can also be set to
   carry (`t.carry`): see step 4.
3. Builds flows: for every POP, its demand (eyeballs and customers) split across
   destination networks by their traffic share (`NSH`, with regional variants for
   China, Russia and Korea). Incidents can add junk flows or scale demand.
4. Routes flows rank by rank: the nearest usable exit first, ECMP across equal exits,
   consuming link, router (`nodeCap`) and exit capacity. A carrier's own transit port also
   goes first, before plain transit, for traffic bound for that carrier or for a network that buys
   transit from it (`25-direct-egress.js`: the shorter AS path): always at its own POP, and from every
   POP when the port is set to carry. Such a port is still an ordinary transit exit for the other
   POPs. A Prefer-marked port, backup, RouteScript and Auto-TE rules keep their say. With Auto-TE, overflow spills
   onto alternate paths; RouteScript rules (`teRules()`) can prefer, avoid, cap, drain
   or blackhole.
5. Layer-2 customers (L2VPN, SD-WAN, waves) are carved out of link capacity first.
6. Totals costs (`R.cost`) and revenue (`R.rev`) per month.

It runs every day and after every action, so it is built for big networks: the graph works on city
indices (`CIDX`), each exit is asked once per network what it can reach, and `R.ef` (what crosses each
link) is only put together for a link when something reads it.

Served share per city (`sfOf`) drives eyeball revenue and customer mood.

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
- The map is a canvas drawn every frame by `draw()`. Zoomed out (`lodFar()`) it uses
  a simplified style; parallel waves are grouped by `linkGroups()`.

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
  cash, last played, size, seq) is updated; the title screen lists networks from the index alone.
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
picker, e.g. evaluate `fireFailure` with `.replace('const e=pick(opts);', "const e='x';")`.
Use `window.__reseed(n)` to reset the random sequence mid-test.

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
| `40-progress/` | Customer types (`BIZ_T`), `LEVELS` and their requirements, `GOALS` |
| `50-state.js` | The globals `S`, `R`, `UI`; `emptyR()` |
| `60-features/` | Banks and loans, scenarios and the weekly challenge, conferences, the tutorial, traceroute, the share card, `newGame()` |
| `70-rules/` | Formatting helpers and market rules: exchanges, PNIs, the peering inbox, peering policy and snubs, DE-KICKS, sold-out routes, hot ports and the Tier 1/2/3 rank |
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
| `docs/adr/` | Decisions: GitHub Pages only (0001), one page assembled at build (0002), translations by label (0003) |

## Globals

- **`S`**: the whole saved game (one JSON object). Cash, day, POPs, links, transit,
  IX ports, PNIs, caches, customers (`biz`), offers, incidents (`inc`), live events
  (`ev`), stats, settings. Saved to `localStorage` key `sot-save-v1`; `sot-save-tab` names the
  tab that may write it (the one opened last), so a forgotten tab cannot overwrite it.
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
   egress preference (`high`, `normal`, `low` = backup only).
3. Builds flows: for every POP, its demand (eyeballs and customers) split across
   destination networks by their traffic share (`NSH`, with regional variants for
   China, Russia and Korea). Incidents can add junk flows or scale demand.
4. Routes flows rank by rank: the nearest usable exit first, ECMP across equal exits,
   consuming link, router (`nodeCap`) and exit capacity. With Auto-TE, overflow spills
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

## Saves, imports and migration

- `save()` writes `S` to localStorage every few seconds and after actions.
- `boot()` loads the save through `migrate()` → `sanitize()`. If loading throws, the
  damaged save is kept under `sot-save-broken` and the player starts fresh.
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

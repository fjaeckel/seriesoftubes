# Architecture

Everything that runs in the browser lives in `site/index.html`. It is large (several
thousand lines), so find things by the section banners rather than by line number:

```
/* ================= PHONES ================= */      phone CSS
/* ================= LANGUAGE ================= */    tr(), trn(), N_(), dictionary loading
/* ================= ANALYTICS ================= */   privacy-friendly event counter
/* ================= CONSTANTS ================= */   prices, ports (PORT), routers (RG), optics
/* ================= WORLD ================= */       CITIES, CABLES, display nudges
/* ================= NETWORKS ================= */    NETS (other ASes), traffic shares (NSH)
/* ================= BUSINESSES ================= */  BIZ_T customer types, LEVELS + LV_REQ (13 levels, traffic eras)
/* ================= GOALS ================= */       GOALS checklist
/* ================= STATE ================= */       S, R, UI globals
/* ================= BANKS & LOANS ================= */
   scenarios (SCN), conferences, tutorial, traceroute, share card
/* ================= HELPERS ================= */     formatting, geometry, small queries
/* ================= SIMULATION ================= */  RouteScript, compute(), costs, sanitize()
   failures & events, daily tick, badges
/* ================= ACTIONS ================= */     the ACT map: every player action
/* ================= SAVE ================= */
/* ================= AUDIO ================= */
/* ================= DOM RENDER ================= */  HUD, left panel, side panel, modals, toasts
/* ================= PHONE ================= */       tab bar, bottom sheets
/* ================= INSTALL (PWA) ================= */
/* ================= CANVAS ================= */      map drawing, level of detail
/* ================= LOOP ================= */        frame(), boot()
```

Other files:

| Path | What it is |
| --- | --- |
| `site/i18n/it.js` | Italian dictionary: English text → Italian, loaded when the language is `it` |
| `site/sw.js` | Service worker: network-first for pages, stale-while-revalidate for assets. Cache name is stamped with the version |
| `site/site.webmanifest`, icons | PWA install metadata |
| `scripts/build.sh` | Copies `site/` to `_site/`, stamps `__VERSION__`/`__BUILD_DATE__`, bakes release notes, writes `version.json` |
| `scripts/release-notes.js` | Extracts a version's CHANGELOG bullets |
| `scripts/i18n-check.js` | Compares every `tr`/`trn`/`N_` literal and `data-i18n` text with each dictionary |
| `tests/harness.js` | Loads the page in jsdom with a seeded `Math.random` and a fake canvas |
| `.github/workflows/ci.yml` | Tests and build on every push and PR |
| `.github/workflows/auto-release.yml` | On a `package.json` version bump on `main`: test, tag, GitHub release from the CHANGELOG, start the deploy |
| `.github/workflows/release.yml` | Builds and deploys to GitHub Pages |

## Globals

- **`S`**: the whole saved game (one JSON object). Cash, day, POPs, links, transit,
  IX ports, PNIs, caches, customers (`biz`), offers, incidents (`inc`), live events
  (`ev`), stats, settings. Saved to `localStorage` key `sot-save-v1`.
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
   merge into one edge with summed capacity. Link metrics set weights; Dijkstra gives
   shortest paths from each POP.
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

- `tr(text, vars)` looks up `DICT[text]` and fills `{placeholders}`; `trn(one, other, n)`
  picks the plural; `N_(text)` marks a literal for the checker and translates later.
- Static markup uses `data-i18n`; `i18nDom()` swaps it at boot.
- The English text is the key, so changing English text means updating the key in
  every dictionary.

## Tests

`tests/*.test.js` use `node:test` and `tests/harness.js`:

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

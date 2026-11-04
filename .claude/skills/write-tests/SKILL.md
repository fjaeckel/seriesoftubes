---
name: write-tests
description: Write deterministic jsdom tests for Series of Tubes features and fixes in tests/*.test.js.
---

# Writing tests

Tests use `node:test` and `tests/harness.js`, which assembles the game page from `src/`
(once per test file) and loads it in jsdom with the animation loop off, a seeded `Math.random` and a recording fake canvas.
Code runs inside the page through `ev()`. `load()` is the page players get; tests of the agent facade
(`src/agent/`, `window.TUBES`) ask for the development page with `load({ agent: true })`.

## Pattern

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('what the player should see happen', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  assert.ok(ev("R.served") > 0);
  assert.deepEqual(errors, []);   // always: no page errors
});
```

## Where to put it

Pick the suite by topic: `game` (core loop), `build`, `persist` (save/import/migrate),
`services` (customers), `peering`, `issues` (GitHub issue regressions, name them
`#NN …`), `regions`, `modes` (scenarios, sandbox, weekly), `i18n`, `pages` (hosting).
For a new feature, prefer a new file named after it (`tests/route-servers.test.js`): every
`tests/*.test.js` runs on its own (`scripts/test.js`), and a file of your own never conflicts
with someone else's tests. Appending to the big suites (`issues`, `regions`) is where
pull requests collide. Run one file with `npm test -- tests/route-servers.test.js`.

## Rules

- **Text in assertions:** match what the player sees (`/Ready in about 3 days/`), or compare with
  `ev("tr('pnis.ready_in_about_n_days',{n:3})")`. Tests run the source page, where labels are readable;
  the shipped page (ids instead of labels) is covered by `tests/pages.test.js`.
- **Deterministic.** Never rely on luck. Use the default seed, `window.__reseed(n)`,
  or set state directly (`S.day=…`, `S.ev.x=…`).
- **Force a specific random failure or event** by patching the picker:
  ```js
  ev("eval('('+fireFailure.toString().replace('const e=pick(opts);',\"const e='crash';\")+')')()");
  ```
  Check the current source for the exact `pick` line first (`grep -rn "function fireFailure" src/game`); it may differ.
- **Drive the game through `ACT`** like a player would, then `compute()` or `dayTick()`.
- **Saves:** for persistence changes, round-trip `JSON.stringify(S)` through
  `parseSave()`/`migrate()`, and test that an *old* save without the new field still loads.
- **UI:** render with `renderAll()` and query `dom.window.document`; check phone
  layouts by setting `window.innerWidth = 390` before rendering.
- Run `npm test`; the whole suite must pass, not just the new test.

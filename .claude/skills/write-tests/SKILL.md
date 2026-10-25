---
name: write-tests
description: Write deterministic jsdom tests for Series of Tubes features and fixes in tests/*.test.js.
---

# Writing tests

Tests use `node:test` and `tests/harness.js`, which loads `site/index.html` in jsdom
with the animation loop off, a seeded `Math.random` and a recording fake canvas.
Code runs inside the page through `ev()`.

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
`#NN …`), `regions`, `modes` (scenarios, sandbox, weekly), `i18n`. A new file must be
added to the `test` script in `package.json`.

## Rules

- **Deterministic.** Never rely on luck. Use the default seed, `window.__reseed(n)`,
  or set state directly (`S.day=…`, `S.ev.x=…`).
- **Force a specific random failure or event** by patching the picker:
  ```js
  ev("eval('('+fireFailure.toString().replace('const e=pick(opts);',\"const e='crash';\")+')')()");
  ```
  Check the current source for the exact `pick` line first; it may differ.
- **Drive the game through `ACT`** like a player would, then `compute()` or `dayTick()`.
- **Saves:** for persistence changes, round-trip `JSON.stringify(S)` through
  `parseSave()`/`migrate()`, and test that an *old* save without the new field still loads.
- **UI:** render with `renderAll()` and query `dom.window.document`; check phone
  layouts by setting `window.innerWidth = 390` before rendering.
- Run `npm test`; the whole suite must pass, not just the new test.

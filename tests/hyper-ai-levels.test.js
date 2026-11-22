// From level 7 a Hyperscaler's levels also ask for AI on its own backbone: the peak of AI traffic between regions
// (training runs and the data lake, S.hs.apk). Levels already reached are kept.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('levels 7 to 13 need AI traffic between regions at peak, shown on the level card; reached levels stay', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});ACT.charter({k:'hyper'});compute()");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(HS_LV_AI)')), [0, 0, 0, 0, 0, 0, 1000, 2000, 3500, 5000, 7000, 9000, 12000]);
  // Everything else a level 7 asks for, but no AI between regions: still level 6.
  ev("S.stats.peak=HS_LV_PK[6];HS_LVX.places=()=>HS_LV_RG[6];HS_LVX.regions=()=>HS_LV_CT[6];S.hs.apk=0");
  assert.equal(ev('custLevel()'), 6);
  ev('S.hs.apk=1000');
  assert.equal(ev('custLevel()'), 7, 'a Tbps of AI between regions makes level 7');
  // The card says what the next level asks.
  ev('S.lvl=7');
  const items = JSON.parse(ev('JSON.stringify(lvlItems())'));
  const ai = items.find((x) => /AI between regions/.test(x.l));
  assert.ok(ai && ai.max === 2000, 'the AI bar on the level card');
  assert.match(ev('hsLvNext(lvInfo(7))'), /2\.00 Tbps of AI traffic between your regions at peak/);
  // A level reached is never taken away (the day only ever raises S.lvl).
  ev('S.lvl=9;S.hs.apk=0;dayTick()');
  assert.equal(ev('S.lvl'), 9);
  // The peak is recorded day by day and kept in saves.
  ev('R.hs.aiw=4321;S.hs.apk=0;for(const f of CX_DAY)f(S.day)');
  assert.equal(ev('S.hs.apk'), 4321);
  ev('const t=JSON.parse(JSON.stringify(S));S=sanitize(t)');
  assert.equal(ev('S.hs.apk'), 4321);
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A small seeded network, no failures or events, at the given speed.
const game = (t, speed) => { const h = load(); t.after(() => h.dom.window.close());
  h.ev(`ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'lvl',tier:1});closeModal();UI.speed=${speed};`);
  return h; };
const day = (ev, speed) => ev(`UI.speed=${speed};S.offers=[];S.nextFail=S.nextEvent=S.day+99;dayTick();UI.routeWhy`);
const rj = (ev) => ev("JSON.stringify(R,(k,v)=>k==='attack'||k==='parent'?(v&&v.id):v)");

test('at 1x and 2x (and paused, as in every other test) each day routes in full, as compute() does', (t) => {
  for (const speed of [0, 1, 2]) {
    const { ev, errors } = game(t, speed);
    for (let d = 0; d < 4; d++) {
      assert.equal(day(ev, speed), 'speed');
      const a = rj(ev); ev('compute()'); assert.equal(rj(ev), a, `speed ${speed}, day ${d}`);
    }
    assert.deepEqual(errors, []);
  }
});

test('at 8x a quiet day reuses the last routing, scaled to its demand, close to a full routing', (t) => {
  const { ev, errors } = game(t, 8);
  const whys = [];
  for (let d = 0; d < 6; d++) {
    whys.push(day(ev, 8));
    if (whys.at(-1) !== '') continue;
    const got = JSON.parse(ev('JSON.stringify({s:R.served,d:R.demand,r:R.revMo,c:R.costMo})'));
    ev('compute()');
    const full = JSON.parse(ev('JSON.stringify({s:R.served,d:R.demand,r:R.revMo,c:R.costMo})'));
    for (const k of ['s', 'd', 'r', 'c']) assert.ok(Math.abs(got[k] - full[k]) <= 0.01 * Math.abs(full[k]) + 1e-9, `${k}: ${got[k]} vs ${full[k]}`);
  }
  assert.ok(whys.includes(''), `some day reused routing: ${whys}`);
  assert.ok(!whys.some((w, i) => w === '' && whys[i - 1] === ''), 'never two reused days in a row');
  assert.deepEqual(errors, []);
});

test('at 8x an action, or a change routing reads, routes the next day in full', (t) => {
  const { ev, errors } = game(t, 8);
  day(ev, 8);
  // An action re-routes through after(): that result is new, so tomorrow does not reuse the one before it.
  ev('after()'); assert.equal(day(ev, 8), 'new');
  // A port going down tomorrow changes what routing reads, even with nothing else different.
  ev('S.transit[0].down=S.day+3'); assert.equal(day(ev, 8), 'changed');
  assert.equal(ev('R.useT[S.transit[0].id]||0'), 0, 'the port that is down carries nothing');
  // And the day it comes back routes in full too, with the port carrying traffic again.
  day(ev, 8); assert.notEqual(day(ev, 8), '');
  assert.ok(ev('R.useT[S.transit[0].id]||0') > 0, 'the port is back');
  assert.deepEqual(errors, []);
});

// Clouds grow faster than the internet around them: a Hyperscaler's users can ask for about three times as much at
// the top level as at the first (37-hyper.js hsDemF), and past a country's base size each Gbps pays less (hsRateF), so
// more users bring more money, but less than in proportion.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('demand grows about threefold over the levels, and the price per Gbps eases as a country grows', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});ACT.charter({k:'hyper'});ACT.hsLaunch({cc:'DE'});compute()");
  ev('S.lvl=1');
  assert.equal(ev('hsDemF()'), 1);
  const base = ev("hsPot('DE')");
  assert.equal(base, ev("hsPotB('DE')"));
  ev('S.lvl=13');
  assert.ok(Math.abs(ev('hsDemF()') - 3.1) < 1e-9);
  assert.ok(Math.abs(ev("hsPot('DE')") / ev("hsPotB('DE')") - 3.1) < 1e-9, 'three times what the eras alone give');
  // Up to the base size the price is the full one; at four times the base, half.
  const B = ev("hsPotB('DE')");
  ev(`S.hs.cc.DE.d=${B * 0.5}`);
  assert.equal(ev("hsRateF('DE')"), 1);
  ev(`S.hs.cc.DE.d=${B * 4}`);
  assert.ok(Math.abs(ev("hsRateF('DE')") - 0.5) < 1e-9);
  // Revenue keeps growing with users, smoothly, across the base size.
  const rev = (d) => { ev(`S.hs.cc.DE.d=${d}`); return ev("S.hs.cc.DE.d*HS_RATE*hsRateF('DE')"); };
  assert.ok(Math.abs(rev(B * 0.999) - rev(B)) < B * 220 * 0.01, 'no jump at the base size');
  assert.ok(rev(B * 3) > rev(B * 2) && rev(B * 3) < 3 * rev(B), 'three times the users: more money, not three times');
  assert.deepEqual(errors, []);
});

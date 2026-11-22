// The Hyperscaler's late-game badges (26-hyper-badges.js): long-term goals beyond Cloud Nine.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('the late-game badges come when their marks are met, and not before', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});ACT.charter({k:'hyper'});compute();S.ach={};S.achP={}");
  const got = () => JSON.parse(ev("JSON.stringify(Object.keys(S.ach).filter(k=>/^hs_(super|aiwan|fresh|viral|edge|pond|world|fabric|frontier|notransit)$/.test(k)).sort())"));
  ev('checkBadges()');
  assert.deepEqual(got(), [], 'none at the start');
  ev('S.hs.cld=1;S.hs.apk=10000;S.hs.bpk=50000;S.hs.fm=1;checkBadges()');
  assert.deepEqual(got(), ['hs_aiwan', 'hs_fabric', 'hs_frontier', 'hs_super']);
  // Tubular at full audience: Gone Viral; with 60% served at the edge: You Are the CDN.
  ev('S.hs.vid={since:S.day-400};checkBadges()');
  assert.ok(got().includes('hs_viral'));
  ev("R.hs.cc={XX:{D:100,st:55,nd:4}};checkBadges()");
  assert.ok(!got().includes('hs_edge'), '59% at the edge is not yet 60%');
  ev("R.hs.cc={XX:{D:100,st:56,nd:4}};checkBadges()");
  assert.ok(got().includes('hs_edge'), "60% at the edge, partners' edge nodes included");
  // A fresh lake of 5 Tbps.
  ev('R.hs.lake={c:S.home,want:5000,got:5000,rg:{}};checkBadges()');
  assert.ok(got().includes('hs_fresh'));
  // A year without transit counts days in a row with three regions or more, and starts over when transit is paid.
  ev("S.stats.hsNoTr=364;checkBadges()");
  assert.ok(!got().includes('hs_notransit'));
  ev("S.stats.hsNoTr=365;checkBadges()");
  assert.ok(got().includes('hs_notransit'));
  assert.deepEqual(errors, []);
});

test('A Year Without Transit counts only transit-free days with three regions or more', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});ACT.charter({k:'hyper'});compute();S.stats.hsNoTr=10");
  ev("R.cost={transit:0};for(const f of CX_DAY)f(S.day)");
  assert.equal(ev('S.stats.hsNoTr'), 0, 'one region is not enough');
  ev("for(const c of ['par','ams'])S.hs.rg[c]={t:0,ready:0,mw:5};S.pops.par=S.pops.par||JSON.parse(JSON.stringify(S.pops[S.home]));S.pops.ams=S.pops.ams||JSON.parse(JSON.stringify(S.pops[S.home]));R.cost={transit:0};S.stats.hsNoTr=10;for(const f of CX_DAY)f(S.day)");
  assert.equal(ev('S.stats.hsNoTr'), 11);
  ev("R.cost={transit:500};for(const f of CX_DAY)f(S.day)");
  assert.equal(ev('S.stats.hsNoTr'), 0, 'paying for transit starts it over');
  assert.deepEqual(errors, []);
});

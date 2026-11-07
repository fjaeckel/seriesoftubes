// Traffic badges: the rate ladder (1 Tbps, 10 Tbps, then the old 100 Tbps and 1 Pbps) and the odometer, S.vol, the
// petabytes carried in a game, with badges at 1 PB, 100 PB, 1 EB and 1 ZB.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()";

test('every day adds a day of what was served: 1 Gbps for a day is 10.8 TB', () => {
  const { ev, errors } = load();
  ev(start);
  assert.equal(ev('S.vol'), 0, 'a new game starts at zero');
  // What a day adds, from the day's own served traffic, whatever it is.
  const r = JSON.parse(ev('(()=>{const out=[];for(let i=0;i<20;i++){const v0=S.vol;dayTick();out.push({add:S.vol-v0,srv:R.served});}return JSON.stringify(out);})()'));
  for (const x of r) assert.ok(Math.abs(x.add - x.srv * 0.0108) < 1e-9, `${x.add} PB for ${x.srv} Gbps`);
  assert.ok(r.some((x) => x.srv > 0), 'some traffic flowed');
  assert.equal(ev('fmtVol(0.0108)'), '11 TB');
  assert.equal(ev('fmtVol(1)'), '1.0 PB');
  assert.equal(ev('fmtVol(1500)'), '1.50 EB');
  assert.equal(ev('fmtVol(2e6)'), '2.00 ZB');
  assert.deepEqual(errors, []);
});

test('the ladders: each badge at its line, not before', () => {
  const { ev, errors } = load();
  ev(start);
  const got = () => JSON.parse(ev("JSON.stringify(['tera','tera10','peta','petabit','vol_pb','vol_100pb','vol_eb','vol_zb'].filter(k=>S.ach&&S.ach[k]!==undefined))"));
  const at = (served, vol) => { ev(`R.served=${served};S.vol=${vol};checkBadges()`); return got(); };
  assert.deepEqual(at(999, 0.99), []);
  assert.deepEqual(at(1000, 1), ['tera', 'vol_pb']);
  assert.deepEqual(at(9999, 99.9), ['tera', 'vol_pb']);
  assert.deepEqual(at(10000, 100), ['tera', 'tera10', 'vol_pb', 'vol_100pb']);
  assert.deepEqual(at(10000, 1000), ['tera', 'tera10', 'vol_pb', 'vol_100pb', 'vol_eb']);
  assert.deepEqual(at(1e6, 1e6), ['tera', 'tera10', 'peta', 'petabit', 'vol_pb', 'vol_100pb', 'vol_eb', 'vol_zb']);
  assert.deepEqual(errors, []);
});

test('the dashboard shows what was carried', () => {
  const { ev, errors } = load();
  ev(start);
  ev('S.vol=1234.5');
  ev('renderDash()');
  const h = ev("document.getElementById('dash').innerHTML");
  assert.match(h, /Carried/);
  assert.match(h, /1\.23 EB/);
  assert.deepEqual(errors, []);
});

test('saves: kept, repaired, and an old save starts from the history it still holds', () => {
  const { ev, errors } = load();
  ev(start);
  ev('S.vol=42;S.hist=[{d:1,srv:1000},{d:2,srv:2000}]');
  const s = JSON.parse(ev('JSON.stringify(packSave(S))'));
  const fix = (x) => JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${JSON.stringify(JSON.stringify(x))})).vol)`));
  assert.equal(fix(s), 42);
  for (const bad of [-5, 'lots', null, Infinity]) assert.ok(Math.abs(fix({ ...s, vol: bad }) - 3000 * 0.0108) < 1e-9, `${bad} is rebuilt from the history`);
  delete s.vol;
  assert.ok(Math.abs(fix(s) - 3000 * 0.0108) < 1e-9, 'a save from before the odometer: 3,000 Gbps-days of history');
  s.hist = [{ d: 1, srv: 'x' }, { d: 2, srv: -1 }, null];
  assert.equal(fix(s), 0, 'junk history counts for nothing');
  assert.deepEqual(errors, []);
});

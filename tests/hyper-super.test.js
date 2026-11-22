// Superclusters (39-hyper-super.js): AI training across three regions on two continents, as two legs on your own
// backbone, each within a latency limit (a direct path meets it, a detour stalls it). Labs offer them from level 9; your
// own frontier model is one from level 11.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)},day:-30});`;
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
// London (home), Amsterdam and New York, each a Compute Campus with power to spare, joined by fat direct waves.
function cloud(t, lv = 9) {
  const h = load({ seed: 11 });
  t.after(() => h.dom.window.close());
  h.ev(`UI.startCity='lon';ACT.start({});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});HS_LAKE[0]=99;S.cash=1e12;S.lvl=${lv};S.nextFail=S.nextEvent=1e9;` +
    "for(const c of ['ams','nyc'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=RG_TOP;" +
    "for(const c of ['lon','ams','nyc']){S.hs.rg[c]={t:2,ready:0,mw:60};S.hs.pw[c]=hsPwDef(c);S.hs.pw[c].cap=2000;}S.links=[];" +
    wave('ln', 'lon', 'nyc', 6) + wave('la', 'lon', 'ams', 6) + 'S.hs.jo=[];S.hs.jobs=[];compute()');
  return h;
}

test('a lab\'s supercluster: three regions, two legs within their limits, paid as the data moves and in full on time', (t) => {
  const { ev, errors } = cloud(t);
  const P = J(ev, 'hsClPick(hsRgs())');
  assert.deepEqual(P.rgs, ['lon', 'nyc', 'ams'], 'the nearest pair across the Atlantic, and the region nearest either');
  assert.deepEqual(P.legs, [['lon', 'nyc'], ['ams', 'lon']]);
  ev("hsClOffer(S.day,hsRgs(),[]);S.hs.jo[0].g=6400;S.hs.jo[0].wk=4");
  const o = J(ev, 'S.hs.jo[0]');
  assert.equal(o.cl, 1);
  ev('renderAll()');
  assert.match(ev('document.body.textContent'), /a supercluster across London, New York and Amsterdam, 6\.40 Tbps on each of two legs/);
  ev(`ACT.hsJobTake({id:${lit(o.id)}});compute()`);
  assert.equal(ev('S.hs.cl.length'), 1);
  const legs = J(ev, 'S.hs.jobs');
  assert.equal(legs.length, 2);
  assert.ok(legs.every((j) => j.grp === o.id && j.lim > 0));
  // Direct waves meet the limits: both legs move, and the lab pays half its fee as they do.
  const x = J(ev, 'R.hs.jobs');
  for (const j of legs) assert.ok(x[j.id].got > 0 && x[j.id].ms <= j.lim, `${j.a}-${j.b}: ${x[j.id].ms} ms within ${j.lim}`);
  assert.ok(ev('R.hs.aiw') >= x[legs[0].id].got + x[legs[1].id].got - 1e-6, 'it counts as AI between regions');
  let cash = ev('S.cash');
  ev('hsTrafficDay(S.day)');
  assert.ok(ev('S.cash') > cash && ev('S.hs.cl[0].paid') > 0, 'paid as the data moves');
  // A leg over its limit stalls: no progress that day, and the card shows it in red.
  const done = ev('S.hs.jobs[1].done');
  ev('S.hs.jobs[1].lim=0.5;hsTrafficDay(S.day)');
  assert.equal(ev('S.hs.jobs[1].done'), done, 'a stalled leg does not move');
  ev('renderAll()');
  assert.match(ev('document.body.textContent'), /supercluster: \d+% trained/);
  assert.match(ev('document.body.textContent'), /\/0\.5 ms ⚠️/);
  // Every leg done, on time: the rest of the fee.
  ev('for(const j of S.hs.jobs)j.done=j.tb;');
  cash = ev('S.cash'); const paid = ev('S.hs.cl[0].paid');
  ev('hsTrafficDay(S.day)');
  assert.equal(ev('S.cash') - cash + paid, o.fee, 'the whole fee');
  assert.equal(ev('S.hs.cl.length'), 0);
  assert.equal(ev('S.hs.jobs.length'), 0);
  assert.equal(ev('S.hs.cld'), 1);
  assert.deepEqual(errors, []);
});

test('your frontier model: from level 11, across three regions; it ships with the biggest lift there is; saves keep it', (t) => {
  const { ev, errors } = cloud(t, 10);
  assert.match(ev('hsFrontierWhy()'), /from level 11/);
  ev('S.lvl=11;renderAll()');
  assert.match(ev('document.body.textContent'), /Your own frontier model, trained across London, New York and Amsterdam/);
  ev('ACT.hsFrontier({})');
  assert.equal(ev("S.hs.cl.length===1&&S.hs.cl[0].k==='own'"), true);
  assert.equal(ev('S.hs.own.length'), 2, 'two legs among your models');
  assert.match(ev('hsFrontierWhy()'), /one model at a time/i);
  // A save keeps the legs and their group.
  ev('const t=JSON.parse(JSON.stringify(S));S=sanitize(t);compute()');
  assert.equal(ev('S.hs.cl.length'), 1);
  assert.ok(ev('S.hs.own.every(m=>m.grp===S.hs.cl[0].id&&m.lim>0)'));
  // Fed in full, it ships.
  ev('for(const m of S.hs.own)m.done=m.tb;hsTrafficDay(S.day)');
  assert.equal(ev('S.hs.fm'), 1);
  assert.equal(ev('S.hs.own.length'), 0);
  assert.equal(ev('S.hs.boost.f'), 0.5);
  assert.ok(ev('S.hs.boost.until') >= ev('S.day') + 365);
  assert.deepEqual(errors, []);
});

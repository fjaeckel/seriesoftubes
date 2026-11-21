// The NOC intern at a Hyperscaler grows with the level (95-hyper-orders.js): orders unlock level by level, budgets have
// a ceiling that rises with the level, regions are grown to a tier only two levels after the player could build it and
// at most one a month, and waves count their monthly price: against the budget, and never into a month at a loss. The
// intern once leased subsea waves every week on "no limit" and bankrupted the cloud.
// These mechanics tests pin each country's users to its main city (one user zone); zones have their own test
// (hyper-zones-users.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)},day:-30});`;
/* Frankfurt (home, a Server Barn) replicating to a Rack Shack in `far` over a thin 10G wave, so the backlog grows; German
   users nearly fill Frankfurt (rich: French users too, enough to pay for a bigger region). An intern with every order off, no cash floor, Change Freeze rules, at level lv. */
function cloud(t, { lv = 8, far = 'ams', seed = 7, rich = false } = {}) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev(`ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);HS_LAKE[0]=99;S.cash=1e12;S.lvl=${lv};S.nextFail=S.nextEvent=1e9;S.rules=makeRules('freeze');ACT.buildPop({city:${lit(far)}});` +
    `for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra',${lit(far)}])ACT.buyTransit({city:c,net:'cog',tier:3});` +
    `S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg[${lit(far)}]={t:0,ready:0,mw:5};S.hs.cc.DE={d:1400,since:0};${rich ? 'S.hs.cc.FR={d:300,since:0};' : ''}S.hs.rep.fra=${lit(far)};S.links=[];` +
    wave('w0', 'fra', far, 0) +
    "S.hs.pw.fra=hsPwDef('fra');S.hs.pw.fra.cap=1000;compute();hsDay(S.day);ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();S.log=[]");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const on = (ev, k, p = {}, cap) => ev(`S.ops.on.${k}=true;S.ops.p.${k}=${lit(p)};${cap === undefined ? '' : `S.ops.cap.${k}=${cap};`}`);
const did = (ev, k) => J(ev, `(S.ops.log[0]||{r:[]}).r.filter(x=>x[0]===${lit(k)})`);
const HS = ['hsdrill', 'hsfund', 'hswave', 'hsrg', 'hsaz'];

test('the cloud intern\'s orders unlock level by level, and the sheet names the ones still to come', (t) => {
  const { ev, errors } = cloud(t, { lv: 2 });
  const open = lv => { ev(`S.lvl=${lv}`); return HS.filter(k => ev(`opsUse(${lit(k)})`)); };
  assert.deepEqual(open(2), ['hsdrill', 'hsfund']);
  assert.deepEqual(open(3), ['hsdrill', 'hsfund', 'hswave']);
  assert.deepEqual(open(4), ['hsdrill', 'hsfund', 'hswave', 'hsrg']);
  assert.deepEqual(open(5), HS);
  // A locked order does not run, even if a save had it switched on.
  ev("S.lvl=2;S.ops.on.hswave=true;S.ops.p.hswave={tb:10};S.ops.cap.hswave=0");
  const n = ev('S.links.length'); ev('opsDay(S.day)');
  assert.equal(ev('S.links.length'), n);
  ev('ACT.opsOpen({})');
  const sheet = ev("document.getElementById('modal').textContent");
  assert.match(sheet, /Waves for the backlog: from level 3/);
  assert.match(sheet, /Watch the regions: from level 4/);
  assert.doesNotMatch(sheet, /Failover drills: from level/, 'open orders are not listed as locked');
  assert.deepEqual(errors, []);
});

test('budgets have a ceiling that rises with the level; "no limit" waits for the top', (t) => {
  const { ev, errors } = cloud(t, { lv: 3 });
  assert.deepEqual(J(ev, "opsCapsNow('hswave')"), [25000, 100000]);
  ev("S.ops.cap.hswave=0");
  assert.equal(ev("opsCap('hswave')"), 100000, 'a saved "no limit" is held at the ceiling');
  ev("S.lvl=8");
  assert.equal(ev("opsCap('hswave')"), 1e6);
  ev("S.lvl=12");
  assert.equal(ev("opsCap('hswave')"), 0, 'and is "no limit" again at the top level');
  assert.deepEqual(J(ev, "opsCapsNow('hswave')"), J(ev, 'HS_OPS_WAVE_CAPS'));
  ev("S.lvl=4");
  assert.deepEqual(J(ev, "opsCapsNow('hsrg')"), [1e6, 3e6]);
  assert.deepEqual(J(ev, "opsCapsNow('hsfund')"), [10000, 50000, 250000]);
  // Picking from the sheet only offers what the level allows.
  ev("S.lvl=3;S.ops.cap.hswave=25000;ACT.opsCap({k:'hswave',v:1})");
  assert.equal(ev('S.ops.cap.hswave'), 100000);
  ev("ACT.opsCap({k:'hswave',v:5})");
  assert.equal(ev('S.ops.cap.hswave'), 100000, 'a choice past the ceiling is refused');
  // Classic orders keep their lists.
  assert.deepEqual(J(ev, "opsCapsNow('waveup')"), J(ev, "opsCaps('waveup')"));
  assert.deepEqual(errors, []);
});

test('waves count their monthly price: no subsea wave that costs more a month than the cloud earns, even on "no limit"', (t) => {
  const { ev, errors } = cloud(t, { lv: 12, far: 'sin' });
  on(ev, 'hswave', { tb: 50 }, 0);
  assert.ok(ev("S.hs.lag['fra>sin']") > 50, 'the backlog has grown');
  const q = J(ev, "hsOpsWaveQuote('fra','sin',100)");
  assert.ok(q.cost > ev('R.revMo-R.costMo'), 'the wave costs more a month than the cloud makes: ' + q.cost);
  const n = ev('S.links.length'), mo = ev('opsMoNow()');
  for (let d = 0; d < 30; d++) ev('dayTick()');
  assert.equal(ev('S.links.length'), n, 'no wave leased in a month');
  assert.equal(ev('opsMoNow()'), mo, 'the monthly bill did not grow');
  assert.ok(J(ev, "S.ops.log.flatMap(e=>e.r.map(x=>x[0]))").includes('hsloss'), 'the log says why');
  assert.deepEqual(errors, []);
});

test('a wave\'s monthly price counts against the running budget, and one wave a shift', (t) => {
  const A = cloud(t, { rich: true });
  const q = J(A.ev, "hsOpsWaveQuote('fra','ams',(R.hs.rep.fra.base-R.hs.rep.fra.got+S.hs.lag['fra>ams']/TB_DAY/7)*opsAhead())");
  on(A.ev, 'hswave', { tb: 50 }, 25000);
  assert.ok(q.cost < 25000, 'this wave fits a small budget: ' + q.cost);
  const n = A.ev('S.links.length'); A.ev('opsDay(S.day)');
  assert.equal(A.ev('S.links.length'), n + 1);
  assert.equal(A.ev('S.ops.addMo.hswave'), A.ev('S.links.at(-1).mo'), 'booked as a monthly price');
  // A second backlogged pair the same day waits for the next shift.
  const B = cloud(t);
  B.ev("ACT.buildPop({city:'par'});ACT.buyTransit({city:'par',net:'cog',tier:3});S.hs.rg.par={t:1,ready:0,mw:20};S.hs.rep.par='ams';S.hs.cc.FR={d:1400,since:0};" +
    wave('w1', 'par', 'ams', 0) + "compute();hsDay(S.day)");
  assert.ok(B.ev("S.hs.lag['fra>ams']") > 50 && B.ev("S.hs.lag['par>ams']") > 50, 'two backlogs');
  on(B.ev, 'hswave', { tb: 50 }, 1e6);
  const m = B.ev('S.links.length'); B.ev('opsDay(S.day)');
  assert.equal(B.ev('S.links.length'), m + 1, 'one wave a shift');
  assert.equal(did(B.ev, 'hswave')[0][1], 1);
  for (const h of [A, B]) assert.deepEqual(h.errors, []);
});

test('regions: the intern grows only to a tier two levels old, and at most one region a month', (t) => {
  // Level 5 opens the Compute Campus for the player (level 4) but not yet for the intern (level 6).
  const A = cloud(t, { lv: 5, rich: true });
  on(A.ev, 'hsrg', { at: 85 });
  A.ev('opsDay(S.day)');
  assert.equal(A.ev('S.hs.rg.fra.up'), undefined, 'no campus from the intern at level 5');
  assert.deepEqual(did(A.ev, 'rgfull').map(x => x[2]), [['fra']], 'a note instead');
  A.ev("S.lvl=6;S.ops.log=[]"); A.ev('opsDay(S.day)');
  assert.ok(A.ev('!!S.hs.rg.fra.up'), 'at level 6 it grows the region');
  // A bigger region whose monthly price would take the month into a loss: a note, not a build.
  const C = cloud(t, { lv: 8 });
  on(C.ev, 'hsrg', { at: 85 });
  assert.ok(C.ev('R.revMo-R.costMo') < C.ev('HS_T[2].mo-HS_T[1].mo'), 'this cloud cannot carry a campus yet');
  C.ev('opsDay(S.day)');
  assert.equal(C.ev('S.hs.rg.fra.up'), undefined);
  // Two full regions: one grows this month, the other waits for the next.
  const B = cloud(t, { lv: 8, rich: true });
  B.ev("ACT.buildPop({city:'par'});ACT.buyTransit({city:'par',net:'cog',tier:3});S.hs.rg.par={t:1,ready:0,mw:20};S.hs.pw.par=hsPwDef('par');S.hs.pw.par.cap=1000;S.hs.cc.FR={d:1400,since:0};" +
    wave('w1', 'fra', 'par', 3) + "compute();hsDay(S.day)");
  on(B.ev, 'hsrg', { at: 85 }, 25e6);
  B.ev('opsDay(S.day)');
  const up = () => J(B.ev, 'Object.keys(S.hs.rg).filter(c=>S.hs.rg[c].up)');
  assert.equal(up().length, 1, 'one region grown: ' + up());
  B.ev('S.day++;opsDay(S.day)');
  assert.equal(up().length, 1, 'not a second one the same month');
  B.ev('{const m=monthIdx(S.day);while(monthIdx(S.day)===m)S.day++;}opsDay(S.day)');
  assert.equal(up().length, 2, 'the next month the other one');
  for (const h of [A, B, C]) assert.deepEqual(h.errors, []);
});

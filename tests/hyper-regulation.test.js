// Regulators, phase 6 (38-hyper-regulation.js): data localisation laws announced with notice that pin a country's users
// through the residency rules (M13 holds); moratoria on new data centers that stop builds, upgrades and utility
// requests in a metro; the energy rule that bills regions wasting their heat; the EU transfer rule; the egress-fee
// investigation with its two answers and its fine; laws need the market rule, a level and day 60, and roll on hashes;
// saves; the card and the Cloud tab on a phone and a desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
// The director (38-hyper-director.js) lets laws in at their level, once introduced, with budget to spend: these tests
// start with all three.
const DIR = 'Object.assign(S.hs.dir,{b:9,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});';
// Regions in Frankfurt and Amsterdam, a POP in New York with transit; German, Dutch and American users; a storage tenant.
function cloud(t, seed = 7) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'ams'});ACT.buildPop({city:'nyc'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','ams','nyc'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.ams={t:1,ready:0,mw:20};S.hs.pw.ams=hsPwDef('ams');S.hs.cc.DE={d:300,since:0};S.hs.cc.NL={d:100,since:0};S.hs.cc.US={d:200,since:0};S.links=[];" +
    wave('fa', 'fra', 'ams', 3) + wave('an', 'ams', 'nyc', 3) +
    "S.offers=[];const o=hsOffer('tv','fra',50);o.id='tv1';S.offers.push(o);ACT.accept({id:'tv1'});" + DIR + "compute();hsDay(S.day);S.log=[]");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));

test('a data localisation law: announced with months of notice, then the country\'s users are pinned to a region inside it (M13)', (t) => {
  const { ev, errors } = cloud(t);
  assert.equal(ev("hsResOf('US')"), '');
  assert.deepEqual([...new Set(J(ev, 'R.hs.cc.US.parts.filter(p=>p[3]).map(p=>p[3])'))].every(r => ['fra', 'ams'].includes(r)), true, 'Americans are served from Europe');
  ev("S.log=[];hsLawStart('cc','US',S.day)");
  const x = J(ev, 'S.hs.law.cc.US');
  assert.ok(x.f - ev('S.day') >= 150 && x.f - ev('S.day') <= 210, 'notice long enough to build a region');
  assert.match(ev('JSON.stringify(S.log)'), /data localisation law/);
  assert.match(ev("hsLawAlerts().map(x=>x.h).join('')+hsLawStat()"), /no region there yet/);
  assert.equal(ev("hsResOf('US')"), '', 'not in force yet');
  // In force, with no region in the country: Americans wait, neither growing nor leaving.
  ev("S.day=S.hs.law.cc.US.f;S.log=[];compute();hsDay(S.day)");
  assert.equal(ev("hsResOf('US')"), 'cc');
  assert.match(ev('JSON.stringify(S.log)'), /empty rack/);
  assert.equal(J(ev, 'R.hs.cc.US.parts.filter(p=>p[3])').length, 0, 'served from nowhere abroad');
  assert.equal(ev('R.hs.cc.US.blk'), 1);
  const d0 = ev('S.hs.cc.US.d');
  ev('for(let i=0;i<5;i++){S.day++;compute();hsDay(S.day)}');
  assert.equal(ev('S.hs.cc.US.d'), d0, 'held');
  assert.match(ev("hsLawAlerts().map(x=>x.h).join('')+hsLawStat()"), /users wait for a region in the country/);
  // A region in New York: they come home to it, and only to it.
  ev("S.hs.rg.nyc={t:1,ready:S.day,mw:20};compute();hsDay(S.day)");
  assert.deepEqual([...new Set(J(ev, 'R.hs.cc.US.parts.filter(p=>p[3]).map(p=>p[3])'))], ['nyc']);
  assert.equal(ev("hsResOk('US','fra')"), false);
  assert.deepEqual(errors, []);
});

test('a moratorium: announced ahead, then no new region, upgrade or utility request in that metro until it ends', (t) => {
  const { ev, errors } = cloud(t);
  ev("S.hs.pw.ams.q={mw:100,ready:S.day+40,late:0};hsLawStart('mor','ams',S.day)");
  const M = J(ev, 'S.hs.law.mor.ams');
  assert.equal(M.f - ev('S.day'), ev('HS_MOR_AHEAD'));
  assert.ok(M.u - M.f >= 180 && M.u - M.f <= 360);
  // Before it starts, building is still allowed.
  assert.equal(ev("hsMorAt('ams')"), null);
  ev("S.day=S.hs.law.mor.ams.f;hsLawDay(S.day)");
  assert.ok(ev("S.hs.pw.ams.q.ready") > M.u, 'the queued request waits until it ends');
  const c0 = ev('S.cash');
  ev("ACT.hsRegion({city:'ams'});S.hs.pw.ams.q=null;ACT.hsUtil({city:'ams'})");
  assert.equal(ev('S.cash'), c0, 'refused');
  assert.equal(ev('S.hs.rg.ams.up'), undefined);
  assert.equal(ev('S.hs.pw.ams.q'), null);
  // Own generation is still allowed; other metros too.
  ev("ACT.hsGen({city:'ams',k:'sol'})");
  assert.equal(ev("S.hs.pw.ams.own.length"), 1);
  assert.match(ev("((x)=>x?x.t+x.body():'')(hsLawSpec('ams'))"), /no new data-center grid connections/);
  assert.equal(ev("((x)=>x?x.t+x.body():'')(hsLawSpec('par'))"), '');
  ev("S.day=S.hs.law.mor.ams.u;hsLawDay(S.day);ACT.hsUtil({city:'ams'})");
  assert.ok(J(ev, 'S.hs.pw.ams.q'), 'over: the utility answers again');
  assert.deepEqual(errors, []);
});

test('the energy rule bills regions that waste their heat; heat reuse is exempt', (t) => {
  const { ev, errors } = cloud(t);
  const c0 = ev('compute();R.costMo');
  ev("hsLawStart('pue','EU',S.day);compute()");
  assert.equal(ev('R.costMo'), c0, 'not yet');
  ev("S.day=S.hs.law.pue.EU.f;compute()");
  const fee = ev("hsPueFee('fra')+hsPueFee('ams')");
  assert.ok(fee > 0);
  assert.ok(Math.abs(ev('R.costMo') - c0 - fee) < 1, 'both European regions pay');
  ev("ACT.hsHeat({city:'fra'});compute()");
  assert.deepEqual(J(ev, 'hsPueRgs()'), ['ams'], 'heating the pool exempts Frankfurt');
  assert.match(ev("hsLawAlerts().map(x=>x.h).join('')+hsLawStat()"), /wasted heat/);
  assert.deepEqual(errors, []);
});

test('the EU tightens: an EU region copying outside the EU pays for lawyers until its replica moves', (t) => {
  const { ev, errors } = cloud(t);
  ev("S.hs.rg.nyc={t:1,ready:0,mw:20};S.hs.rep.ams='nyc';S.hs.rep.fra='ams';compute()");
  ev("hsLawStart('eu','',S.day);S.day=S.hs.law.eu.f;compute()");
  assert.deepEqual(J(ev, 'hsEuRgs()'), ['ams']);
  const c1 = ev('R.costMo');
  ev("ACT.hsReplica({city:'ams',v:'fra'});compute()");
  assert.deepEqual(J(ev, 'hsEuRgs()'), []);
  assert.equal(c1 - ev('R.costMo'), ev('HS_EU_MO'));
  // #483: Frankfurt and Zurich backing each other up is no transfer the EU worries about (Switzerland has an
  // adequacy decision), nor is London; New York still is.
  ev("S.hs.rg.zrh={t:1,ready:0,mw:20};S.hs.rep.fra='zrh';S.hs.rep.zrh='fra';S.hs.rep.ams='lon';S.hs.rg.lon={t:1,ready:0,mw:20};compute()");
  assert.deepEqual(J(ev, 'hsEuRgs()'), []);
  assert.doesNotMatch(ev("hsLawAlerts().map(x=>x.h).join('')"), /lawyers/);
  ev("S.hs.rep.fra='nyc';compute()");
  assert.deepEqual(J(ev, 'hsEuRgs()'), ['fra']);
  assert.deepEqual(errors, []);
});

test('egress fees investigated: cut them for a year, pay the fine, or ignore it and pay more', (t) => {
  for (const how of ['cut', 'pay', 'ignore']) {
    const { ev, errors } = cloud(t);
    ev("S.lvl=8;hsLawStart('egr','',S.day)");
    const E = J(ev, 'S.hs.law.egr');
    assert.equal(E.st, 'open'); assert.ok(E.fee >= ev('HS_EGR_MIN'));
    const rev = ev('compute();R.revMo'), c0 = ev('S.cash');
    if (how === 'cut') {
      const m0 = ev("S.biz[0].mood");
      ev("ACT.hsEgress({v:'cut'});compute()");
      assert.equal(ev('S.hs.law.egr.st'), 'cut');
      assert.ok(Math.abs(rev - ev('R.revMo') - ev('hsEgrRev(R)') * ev('HS_EGR_CUT')) < 1, 'the cut comes off the bill');
      assert.equal(ev("S.biz[0].mood"), Math.min(100, m0 + 10));
      ev("S.day=S.hs.law.egr.u;hsLawDay(S.day);compute()");
      assert.ok(Math.abs(ev('R.revMo') - rev) < 1, 'a year later it is over');
    } else if (how === 'pay') {
      ev("ACT.hsEgress({v:'pay'})");
      assert.equal(c0 - ev('S.cash'), E.fee); assert.equal(ev('S.hs.law.egr.st'), 'paid');
      ev("S.day=S.hs.law.egr.dl;hsLawDay(S.day)");
      assert.equal(c0 - ev('S.cash'), E.fee, 'no second fine');
    } else {
      assert.match(ev("hsLawAlerts().map(x=>x.h).join('')+hsLawStat()"), /hsEgress/);
      ev("S.day=S.hs.law.egr.dl;hsLawDay(S.day)");
      assert.equal(ev('S.hs.law.egr.st'), 'fined');
      assert.equal(c0 - ev('S.cash'), Math.round(E.fee * ev('HS_EGR_LATE')));
      ev("ACT.hsEgress({v:'cut'})");
      assert.equal(ev('S.hs.law.egr.st'), 'fined', 'too late to answer');
    }
    assert.deepEqual(errors, []);
  }
});

test('new laws need the market rule, level 4 and day 60, one at a time, and roll on hashes', (t) => {
  const { ev, errors } = cloud(t);
  const run = (rules, lv, from, to) => ev(`(()=>{S.rules=makeRules(${lit(rules)});S.lvl=${lv};S.hs.law={cc:{},mor:{},pue:{},eu:null,egr:null,nx:0,n:0};window.__n=0;window.__r=Math.random;Math.random=()=>{__n++;return __r()};
    const d0=S.day;const ds=[];for(let d=${from};d<${to};d++){S.day=d;const n=S.hs.law.n;Object.assign(S.hs.dir,{c:null,q:0,b:9,t:d,ib:0});hsLawDay(d);if(S.hs.law.n>n)ds.push(d)}S.day=d0;Math.random=__r;return JSON.stringify([ds,__n])})()`);
  assert.deepEqual(JSON.parse(run('freeze', 8, 0, 2000))[0], [], 'Change Freeze has no market rule: no laws');
  assert.deepEqual(JSON.parse(run('oncall', 3, 0, 2000))[0], [], 'not before level 4 (the director holds them back, 38-hyper-director.js)');
  const [ds, rnd] = JSON.parse(run('oncall', 8, 0, 2000));
  assert.equal(rnd, 0, 'no random numbers drawn');
  assert.ok(ds.length >= 3, 'laws come: ' + ds);
  assert.ok(ds[0] >= 60, 'not before day 60');
  for (let i = 1; i < ds.length; i++) assert.ok(ds[i] - ds[i - 1] >= 60, 'at least 60 days apart');
  assert.equal(run('oncall', 8, 0, 2000), JSON.stringify([ds, 0]), 'the same game, the same laws');
  const L = J(ev, 'S.hs.law');
  assert.ok(Object.keys(L.cc).every(cc => !['DE', 'NL'].includes(cc)), 'never a country already under a residency rule');
  assert.deepEqual(errors, []);
});

test('saves: every law repaired, junk dropped; a classic save has none', (t) => {
  const { ev, errors } = cloud(t);
  ev("S.hs.law={cc:{US:{a:1,f:'200',m:9},DE:{a:1,f:2,m:0},XX:{a:1,f:2}},mor:{ams:{a:1,f:5,u:2,m:1},nowhere:{a:1,f:2,u:3}},pue:{EU:{a:1,f:3,m:0},MARS:{a:1}},eu:{a:1,f:2,m:'x'},egr:{a:1,dl:4,st:'weird'},nx:'soon',n:-3}");
  const back = J(ev, '(()=>{const r=parseSave(JSON.stringify(S));return migrate(r.s).hs.law})()');
  assert.deepEqual(back.cc, { US: { a: 1, f: 200, m: 3 } }, 'Germany already has a residency rule; XX is no country');
  assert.deepEqual(back.mor, { ams: { a: 1, f: 5, u: 5, m: 1 } });
  assert.deepEqual(Object.keys(back.pue), ['EU']);
  assert.deepEqual(back.eu, { a: 1, f: 2, m: 0 });
  assert.equal(back.egr, null);
  assert.equal(back.nx, 0); assert.equal(back.n, 0);
  const c = load({ seed: 3 });
  t.after(() => c.dom.window.close());
  c.ev("ACT.start({});S.cash=1e8;compute()");
  assert.equal(c.ev("(()=>{const r=parseSave(JSON.stringify(S));return migrate(r.s).hs===undefined})()"), true);
  assert.deepEqual(errors, []); assert.deepEqual(c.errors, []);
});

test('the card and the Cloud tab show the laws on a phone and a desktop', (t) => {
  const { ev, errors, dom } = cloud(t);
  ev("hsLawStart('cc','US',S.day);hsLawStart('mor','ams',S.day);hsLawStart('pue','EU',S.day);hsLawStart('eu','',S.day);hsLawStart('egr','',S.day);compute()");
  for (const w of [360, 1280]) {
    ev(`window.innerWidth=${w};selectCity('ams');UI.tab='cust';renderAll()`);
    const card = ev("hsLawAlerts().map(x=>x.h).join('')+hsLawStat()");
    for (const re of [/🏛️/, /🔌/, /🌡️/, /🇪🇺/, /🏨/]) assert.match(card, re);
    assert.match(ev("((x)=>x?x.t+x.body():'')(hsLawSpec('ams'))"), /🔌/);
    assert.match(ev("((x)=>x?x.t+x.body():'')(hsLawSpec('nyc'))"), /🏛️/);
    assert.equal(ev("(hsCard().match(/data-act=\"hsEgress\"/g)||[]).length"), 2, 'the charter card carries both answers');
    assert.ok(dom.window.document.body.innerHTML.includes(ev("tr('hyper_reg.title')")), 'the Cloud tab shows the regulators at ' + w);
  }
  assert.deepEqual(errors, []);
});

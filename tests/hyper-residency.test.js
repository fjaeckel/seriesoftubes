// Data residency, phase 4 (38-hyper-residency.js): users of countries with data localisation laws are homed only in a
// region in their country, EU members' users only in an EU region; with none built they neither grow nor leave, and the
// card and Cloud tab say why; a failover never breaks the law; Very Sovereign Cloud signs, lives and leaves by it.
// These mechanics tests pin each country's users to its main city (one user zone) and keep the data lake out (it has
// its own test in hyper-traffic.test.js); zones are tested in hyper-zones-users.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
/* Frankfurt (home, a Rack Shack: 400G), London and Paris POPs with transit, Delhi too; waves between them all. */
function net(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE','ES','IN'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);HS_LAKE[0]=99;S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;for(const c of ['par','lon','del'])ACT.buildPop({city:c});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','lon','del'])ACT.buyTransit({city:c,net:NETS.find(n=>n.price&&sellsAt(n,c)).id,tier:3});S.links=[];" +
    wave('fp', 'fra', 'par', 4) + wave('fl', 'fra', 'lon', 4) + wave('pl', 'par', 'lon', 4) + wave('fd', 'fra', 'del', 4) + 'compute();checkGoals();S.log=[]');
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const homes = (ev, cc) => J(ev, `[...new Set((R.hs.cc[${lit(cc)}]||{parts:[]}).parts.filter(p=>p[3]).map(p=>p[3]))].sort()`);

test('the law: who is pinned where', (t) => {
  const { ev, errors } = net(t);
  assert.deepEqual(J(ev, "['IN','RU','ID','VN','SA','TR','NG','FR','DE','IE','GB','US','CH','NO'].map(hsResOf)"), ['cc', 'cc', 'cc', 'cc', 'cc', 'cc', 'cc', 'eu', 'eu', 'eu', '', '', '', '']);
  assert.equal(ev("hsResOk('FR','fra')"), true, 'any EU region for an EU member');
  assert.equal(ev("hsResOk('FR','lon')"), false, 'London is not in the EU');
  assert.equal(ev("hsResOk('IN','fra')"), false);
  assert.equal(ev("hsResOk('GB','fra')&&hsResOk('US','del')"), true, 'no law, anywhere');
  assert.equal(ev("hsResSite('IN')"), true);
  assert.deepEqual(errors, []);
});

test('residency never homes users outside their bloc: a full EU region leaves French users short, not in London', (t) => {
  const { ev, errors } = net(t);
  ev("S.hs.rg.lon={t:1,ready:0,mw:20};S.hs.cc.DE={d:400,since:0};S.hs.cc.FR={d:200,since:0};S.hs.cc.GB={d:100,since:0};compute()");
  assert.deepEqual(homes(ev, 'FR'), [], 'Frankfurt is full and London is outside the EU');
  assert.ok(J(ev, 'R.hs.cc.FR').short > 199);
  assert.deepEqual(homes(ev, 'GB'), ['lon']);
  // A region in Paris: French users are homed there.
  ev("S.hs.rg.par={t:0,ready:0,mw:5};compute()");
  assert.deepEqual(homes(ev, 'FR'), ['par']);
  assert.equal(J(ev, 'R.hs.cc.FR').short, 0);
  // British users spill anywhere there is room, even Frankfurt.
  ev("S.hs.cc.DE.d=1;S.hs.rg.lon={t:0,ready:0,mw:5};S.hs.cc.GB.d=600;compute()");
  assert.ok(homes(ev, 'GB').includes('lon') && homes(ev, 'GB').length > 1, 'GB spills: ' + homes(ev, 'GB'));
  assert.deepEqual(errors, []);
});

test('sovereign users wait for an in-country region: no growth, no churn, and the panel says why', (t) => {
  const { ev, dom, errors } = net(t);
  ev("ACT.hsLaunch({cc:'IN'});compute()");
  const d0 = ev('S.hs.cc.IN.d');
  assert.deepEqual(homes(ev, 'IN'), []);
  assert.equal(J(ev, 'R.hs.cc.IN').blk, 1, 'nowhere they may be homed');
  assert.ok(ev('R.hs.blk') > 0 && ev('R.hs.short') < 1e-6, 'not counted as regions full');
  for (let i = 0; i < 10; i++) ev('dayTick()');
  assert.equal(ev('S.hs.cc.IN.d'), d0, 'held at its launch size');
  assert.match(ev('hsCard()'), /no region yet for India/);
  ev("selectCity('del');UI.tab='cust';renderAll()");
  assert.match(dom.window.document.getElementById('panelBody').textContent, /must stay in India/);
  // A region in Delhi: they are homed there and grow.
  ev("S.hs.rg.del={t:1,ready:0,mw:20};compute();dayTick()");
  assert.deepEqual(homes(ev, 'IN'), ['del']);
  ev('dayTick();dayTick()');
  assert.ok(ev('S.hs.cc.IN.d') > d0, 'growing');
  assert.equal(ev("hsResWhy('IN')"), '');
  assert.deepEqual(errors, []);
});

test('a failover never breaks the law: a replica outside the bloc leaves EU users without service', (t) => {
  const { ev, errors } = net(t);
  ev("S.hs.rg.par={t:1,ready:0,mw:20};S.hs.rg.lon={t:1,ready:0,mw:20};S.hs.rep.par='lon';S.hs.cc.FR={d:200,since:0};compute();hsDay(S.day)");
  assert.equal(ev('S.hs.cc.FR.home'), 'par');
  const I = J(ev, "hsFailInfo('par')");
  assert.deepEqual(I.law, ['France']);
  assert.equal(I.ok, false);
  ev("hsRegionFail('par',2,'test');compute()");
  assert.equal(ev('R.hs.fo.par'), 'lon');
  assert.deepEqual(homes(ev, 'FR'), [], 'not to London, and not to Frankfurt either: Paris\'s replica is London');
  assert.equal(J(ev, 'R.hs.cc.FR').blk, 1);
  // A drill says so.
  ev("S.hs.down={};S.hs.out={};S.inc=[];compute();S.log=[];ACT.hsDrill({city:'par'});dayTick()");
  assert.match(ev("S.log.map(x=>x.t).join(' ')"), /The law got in the way/);
  // With an EU replica it holds.
  ev("S.hs.rep.par='fra';compute()");
  assert.equal(J(ev, "hsFailInfo('par')").law.length, 0);
  assert.deepEqual(errors, []);
});

test('Very Sovereign Cloud: signs only with an in-country region, lives there, and leaves at once if its region fails', (t) => {
  const { ev, errors } = net(t);
  ev("S.offers.push(hsOffer('gov','del',20));ACT.accept({id:S.offers[0].id})");
  assert.equal(ev('S.biz.length'), 0, 'no region in India, no ministry');
  assert.equal(ev('S.offers.length'), 1);
  // Offers for governments come only where you have a region in the country.
  ev("S.offers=[];S.lvl=13;for(let i=0;i<200;i++)hsSpawn();");
  assert.equal(ev("S.offers.filter(o=>o.ck==='gov'&&CITY[o.city].cc!=='DE').length"), 0);
  ev("S.offers=[];S.hs.rg.del={t:1,ready:0,mw:20};S.hs.rg.par={t:1,ready:0,mw:20};compute();S.offers.push(hsOffer('gov','del',20));ACT.accept({id:S.offers[0].id});compute()");
  assert.equal(ev('S.biz.length'), 1);
  assert.equal(ev('S.biz[0].rg'), 'del');
  assert.equal(ev('R.hs.ten[S.biz[0].id].r'), 'del');
  assert.equal(ev("hsRgFor('del',null,['sov'])"), 'del');
  assert.equal(ev("hsRgFor('lon',null,['sov'])"), null, 'no British region');
  // A drill does not chase it away.
  ev("ACT.hsDrill({city:'del'});dayTick()");
  assert.equal(ev('S.biz.length'), 1);
  // A real failure with nowhere at home to go: it leaves at once.
  ev("hsRegionFail('del',2,'test');compute();hsResDay(S.day)");
  assert.equal(ev('S.biz.length'), 0);
  assert.match(ev("S.log.map(x=>x.t).join(' ')"), /left/);
  assert.deepEqual(errors, []);
});

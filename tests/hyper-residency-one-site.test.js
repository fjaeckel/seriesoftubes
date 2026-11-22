// Data residency in a country with one possible region site (#451, 38-hyper-residency.js): Singapore under its own
// localisation law (or a ministry on Very Sovereign Cloud there) can never have a second region at home, so a failover
// or a drill to the replica abroad is allowed; a country with a second site (India) still must build one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
/* Frankfurt (home), Singapore and Hong Kong POPs with transit; Server Barns in Singapore and Hong Kong, Singapore's
   replica in Hong Kong; Singapore's localisation law in force (an old save carrying it loads the same way). */
function net(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['SG','HK','IN'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);HS_LAKE[0]=99;S.cash=1e12;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const c of ['sin','hkg','del','bom'])ACT.buildPop({city:c});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c in S.pops)ACT.buyTransit({city:c,net:NETS.find(n=>n.price&&sellsAt(n,c)).id,tier:3});S.links=[];" +
    wave('sh', 'sin', 'hkg', 4) + wave('db', 'del', 'bom', 4) +
    "S.hs.rg.sin={t:1,ready:0,mw:20};S.hs.rg.hkg={t:1,ready:0,mw:20};S.hs.rep.sin='hkg';S.hs.law.cc.SG={a:0,f:0,m:0};S.hs.cc.SG={d:100,since:0};" +
    "S.hs.edge.sin=1;S.hs.dir.b=0;compute();hsDay(S.day);checkGoals();S.log=[]");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const homes = (ev, cc) => J(ev, `[...new Set((R.hs.cc[${lit(cc)}]||{parts:[]}).parts.filter(p=>p[3]).map(p=>p[3]))].sort()`);

test('one possible site at home: Singapore\'s users fail over to the replica abroad, and the drill passes', (t) => {
  const { ev, errors } = net(t);
  assert.equal(ev("hsResOf('SG')"), 'cc', 'the law is in force');
  assert.deepEqual(homes(ev, 'SG'), ['sin'], 'normally served at home');
  assert.equal(ev("hsResOk('SG','hkg')"), false, 'the law still pins them at home day to day');
  assert.deepEqual(J(ev, "hsFailInfo('sin')").law, [], 'readiness does not demand an impossible region');
  ev("ACT.hsDrill({city:'sin'});compute()");
  assert.deepEqual(homes(ev, 'SG'), ['hkg'], 'drained into Hong Kong');
  assert.equal(J(ev, 'R.hs.cc.SG').blk, undefined);
  ev('dayTick()');
  assert.doesNotMatch(ev("S.log.map(x=>x.t).join(' ')"), /law got in the way/);
  assert.ok(ev("S.hs.drill[hsPk('sin','hkg')]!==undefined"), 'the pair counts as drilled for Cloud Nine');
  assert.equal(J(ev, 'hsPairsUndrilled()').includes('hkg|sin'), false);
  assert.deepEqual(errors, []);
});

test('one possible site at home: a Very Sovereign Cloud ministry rides out a failure in the replica', (t) => {
  const { ev, errors } = net(t);
  ev("S.offers.push(hsOffer('gov','sin',20));ACT.accept({id:S.offers[0].id});compute()");
  assert.equal(ev('S.biz.length'), 1);
  assert.equal(ev('S.biz[0].rg'), 'sin');
  assert.deepEqual(J(ev, "hsFailInfo('sin')").law, []);
  ev("hsRegionFail('sin',2,'test');compute();hsResDay(S.day)");
  assert.equal(ev('S.biz.length'), 1, 'it does not leave');
  assert.equal(ev('R.hs.ten[S.biz[0].id].r'), 'hkg');
  assert.equal(ev("hsRgFor('sin',null,['sov'])"), null, 'and it still signs only at home');
  assert.deepEqual(errors, []);
});

test('a country with a second possible site still waits for it: India does not fail over abroad', (t) => {
  const { ev, errors } = net(t);
  ev("S.hs.rg.del={t:1,ready:0,mw:20};S.hs.rep.del='hkg';S.links.push({id:'dh',a:'del',b:'hkg',kind:'wave',tier:4,km:3800,mo:1,cut:0,ready:0,trench:'dh'});S.hs.cc.IN={d:100,since:0};compute();hsDay(S.day)");
  assert.deepEqual(homes(ev, 'IN'), ['del']);
  assert.deepEqual(J(ev, "hsFailInfo('del')").law, ['India']);
  ev("hsRegionFail('del',2,'test');compute()");
  assert.deepEqual(homes(ev, 'IN'), []);
  assert.equal(J(ev, 'R.hs.cc.IN').blk, 1);
  assert.deepEqual(errors, []);
});

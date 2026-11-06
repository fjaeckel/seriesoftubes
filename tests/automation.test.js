const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// #185's engines: the repair one is the NOC intern's standing order, the sales one belongs to the sales desk
// (39-sales-auto.js). Here the engineer, who signs only what the trial says the network can serve, as #185 did.
function setup(ev) {
  ev("ACT.start({});S.cash=1e8;S.offers=[];S.biz=[];S.nextFail=S.nextEvent=1e6;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=3;ACT.buyTransit({city:'fra',net:'lvl',tier:1});S.lvl=2;S.ops.intern='kevin';S.ops.floor=0;S.rules=makeRules('freeze');ACT.salesHire({id:'eng'});compute()");
}
const shift = ev => ev('slAutoDay(S.day);opsDay(S.day)');
function offer(ev, id, extra = {}) {
  ev(`S.offers.push(${lit({ id, city: 'fra', name: id, type: 'dia', bw: 1, rate: 600, reqs: [], exp: 30, ...extra })})`);
}

test('the sales desk signs ready offers once a day, and switching it off stops it', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  offer(ev, 'first');
  shift(ev);
  assert.equal(ev('S.biz.length'), 0, 'off by default');
  ev('ACT.salesAuto()');
  shift(ev);
  assert.equal(ev('S.biz[0].id'), 'first');
  ev('ACT.salesAuto()');
  offer(ev, 'off');
  ev('dayTick()');
  assert.equal(ev('S.biz.length'), 1, 'switched off, it signs nothing');
  assert.ok(ev("S.offers.some(o=>o.id==='off')"));
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('the trial includes new bandwidth and later offers cannot overbook earlier accepted sales', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  offer(ev, 'one', { bw: 60 });
  offer(ev, 'two', { bw: 60 });
  const state = ev('JSON.stringify(S)');
  ev('window.beforeState=S;window.beforeResult=R;window.beforeHot=UI.hotMap');
  assert.equal(ev('!!autoOffer(S.offers[0])'), true);
  assert.equal(ev('JSON.stringify(S)'), state);
  assert.equal(ev('S===beforeState&&R===beforeResult&&UI.hotMap===beforeHot'), true);
  ev('S.slAuto.on=true;slAutoDay(S.day)');
  assert.equal(ev('S.biz.length'), 1);
  assert.equal(ev('S.offers[0].id'), 'two');
  assert.ok(ev('bizSf(S.biz[0])') >= 0.95);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('the sales desk checks actual circuits, latency and NNI capacity', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;compute()");
  offer(ev, 'circuit', { type: 'hft', city2: 'ams', bw: 10, latMax: 50, reqs: ['lat'] });
  assert.equal(ev('!!autoOffer(S.offers[0])'), false, 'POPs alone are not a circuit');
  ev("S.links.push({id:'path',a:'fra',b:'ams',kind:'wave',tier:1,km:450,sub:false,cut:0,mo:1});compute()");
  assert.equal(ev('!!autoOffer(S.offers[0])'), true);
  ev('S.offers[0].latMax=0.1');
  assert.equal(ev('!!autoOffer(S.offers[0])'), false, 'latency budget must pass');
  ev("S.offers=[];window.fabric=FABS.find(f=>f.cities.includes('fra')).id;ACT.buyNni({city:'fra',prov:fabric,tier:0})");
  const prov = ev('fabric');
  const bandwidth = ev('NNI[0].g * 0.75');
  offer(ev, 'fabric-one', { type: 'fabip', prov, bw: bandwidth, reqs: ['nni'] });
  offer(ev, 'fabric-two', { type: 'fabip', prov, bw: bandwidth, reqs: ['nni'] });
  // Transit has enough headroom, so the second rejection is the shared NNI port.
  ev("S.transit[0].tier=4;compute();S.slAuto.on=true;slAutoDay(S.day)");
  assert.equal(ev('S.biz.length'), 1);
  assert.equal(ev('S.offers[0].id'), 'fabric-two');
  assert.ok(ev("nniUsed('fra',fabric)<=NNI[0].g"));
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('new circuits do not take service away from healthy signed customers', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;S.links.push({id:'path',a:'fra',b:'ams',kind:'wave',tier:1,km:450,sub:false,cut:0,mo:1});S.transit[0].city='ams';compute()");
  offer(ev, 'existing', { bw: 80 });
  ev("ACT.accept({id:'existing'})");
  offer(ev, 'new-circuit', { type: 'l2vpn', city2: 'ams', bw: 50 });
  assert.equal(ev('bizWhy(S.biz[0]).length'), 0);
  assert.equal(ev('!!autoOffer(S.offers[0])'), false);
  assert.ok(ev('bizSf(S.biz[0])') >= 0.95, 'failed preview leaves the old routing result intact');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('fiber sales check live equipment and free spectrum, and repeated carrier orders still merge', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;S.links=[{id:'fiber',a:'fra',b:'ams',kind:'df',own:true,sys:'lite',ch:Array(14).fill('zr4'),km:450,sub:false,ready:0,cut:0,mo:1}];S.biz=[{id:'old',name:'Same Carrier',type:'wwave',city:'fra',city2:'ams',link:'fiber',bw:1,rate:1000,slots:1,reqs:[],mood:100,since:0}];compute()");
  offer(ev, 'full', { type: 'wwave', city2: 'ams', link: 'fiber', slots: 2 });
  assert.equal(ev('!!autoOffer(S.offers[0])'), false);
  ev("S.offers[0].slots=1;S.offers[0].name='Same Carrier';S.links[0].eqDown=10;compute()");
  assert.equal(ev('!!autoOffer(S.offers[0])'), false, 'a broken amplifier prevents a wave sale');
  ev('S.links[0].eqDown=0;compute();S.slAuto.on=true;slAutoDay(S.day)');
  assert.equal(ev('S.biz.length'), 1);
  assert.equal(ev('S.biz[0].slots'), 2);
  assert.equal(ev('S.biz[0].rate'), 1600);
  assert.equal(ev('freeCh(S.links[0])'), 0);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('capacity pair sales need completed infrastructure and reserve it for the accepted contract', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  offer(ev, 'pairs', { type: 'capfib', city2: 'ams', slots: 2, win: 90 });
  assert.equal(ev('!!autoOffer(S.offers[0])'), false);
  ev("ACT.buildPop({city:'ams'});S.links=[{id:'own',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',ch:[],km:450,sub:false,ready:0,cut:0,mo:1}];compute()");
  assert.equal(ev('!!autoOffer(S.offers[0])'), true);
  ev('S.slAuto.on=true;slAutoDay(S.day)');
  assert.equal(ev('S.biz[0].link'), 'own');
  assert.equal(ev('capPend(S.biz[0])'), true, 'normal delivery handover still happens on a game day');
  offer(ev, 'second-pairs', { type: 'capfib', city2: 'ams', slots: 2, win: 90 });
  assert.equal(ev('!!autoOffer(S.offers[0])'), false, 'the same trench cannot be promised twice');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('future event demand is tested before signing, with booked events reserving headroom', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  offer(ev, 'event', { type: 'event', bw: 80, rate: 0, start: 10, dur: 3, fee: 5000, exp: 9 });
  assert.equal(ev('!!autoOffer(S.offers[0])'), true);
  ev('S.slAuto.on=true;slAutoDay(S.day)');
  assert.equal(ev('S.biz[0].start'), 10, 'the trial does not move the actual event date');
  assert.equal(ev('R.cityDem.fra'), 0);
  offer(ev, 'too-large', { bw: 30 });
  assert.equal(ev('!!autoOffer(S.offers[0])'), false);
  ev('S.offers[0].bw=10');
  assert.equal(ev('!!autoOffer(S.offers[0])'), true);
  assert.equal(ev('S.biz[0].start'), 10);
  assert.equal(ev('R.cityDem.fra'), 0);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('failed capacity trials restore game, routing and map state even when compute throws', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  offer(ev, 'ready');
  ev("window.beforeState=S;window.beforeResult=R;window.beforeHot=UI.hotMap;window.originalCompute=compute;window.compute=()=>{throw new Error('trial failed')}");
  assert.throws(() => ev('autoOffer(S.offers[0])'), /trial failed/);
  assert.equal(ev('S===beforeState&&R===beforeResult&&UI.hotMap===beforeHot'), true);
  ev('window.compute=originalCompute');
  assert.equal(ev('S.biz.length'), 0);
  assert.equal(ev('S.offers.length'), 1);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('the repair order rushes affordable repairs once, skips unaffordable and expired incidents, and obeys its pause', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  ev(`S.cash=10000;S.links=[{id:'fiber',a:'fra',b:'ams',kind:'df',sys:'lite',ch:['zr4'],km:450,sub:false,ready:0,cut:0,eqDown:10,chFail:{i:0,until:10},mo:1}];
    S.pops.fra.down=8;S.inc=[
      {id:'amp',type:'amp',ref:'fiber',until:10,cost:30000,msg:'Broken amp'},
      {id:'optic',type:'optic',ref:'fiber',until:10,cost:5000,msg:'Broken optic'},
      {id:'slow',type:'crash',ref:'fra',until:8,cost:2000,slow:true,msg:'Slow boot'},
      {id:'orphan',type:'amp',ref:'gone',until:10,cost:299,msg:'Removed equipment'},
      {id:'expired',type:'amp',ref:'fiber',until:0,cost:1000,msg:'Expired'},
      {id:'ddos',type:'ddos',ref:'fra',until:10,cost:1000,msg:'Attack'}];
    S.ops.on.repair=true;opsDay(S.day)`);
  assert.equal(ev('S.cash'), 3000);
  assert.equal(ev("S.inc.some(i=>i.id==='optic')"), false);
  assert.equal(ev('S.links[0].chFail'), null);
  assert.equal(ev("S.inc.find(i=>i.id==='slow').rushed"), true);
  assert.equal(ev("S.inc.find(i=>i.id==='slow').until"), 1);
  assert.equal(ev("S.inc.find(i=>i.id==='slow').cost"), 0);
  assert.equal(ev('S.pops.fra.down'), 1);
  ev('opsDay(S.day)');
  assert.equal(ev('S.cash'), 3000, 'no duplicate rush payment');
  ev('S.cash=40000;opsDay(S.day)');
  assert.equal(ev('S.cash'), 10000);
  assert.equal(ev('S.links[0].eqDown'), 0);
  assert.equal(ev("S.inc.some(i=>i.id==='amp')"), false);
  ev("ACT.opsToggle({k:'repair'});S.inc.push({id:'new',type:'amp',ref:'fiber',until:10,cost:1000,msg:'New failure'});opsDay(S.day)");
  assert.equal(ev('S.cash'), 10000);
  assert.equal(ev("S.inc.some(i=>i.id==='new')"), true);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('the sales desk leaves unready and expired offers alone without failure notifications', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  offer(ev, 'generator', { reqs: ['gen'] });
  offer(ev, 'missing-pop', { city: 'ams' });
  offer(ev, 'scrub', { type: 'scrub' });
  offer(ev, 'expired', { exp: 0 });
  offer(ev, 'ipv6', { reqs: ['ipv6'] });
  const log = ev('S.log.length');
  ev('S.slAuto.on=true;slAutoDay(S.day)');
  assert.equal(ev('S.biz.length'), 0);
  assert.equal(ev('S.offers.length'), 5);
  assert.equal(ev('S.log.length'), log, 'no failed manual-action toasts and no notice when nothing got done');
  ev('S.pops.fra.gen=true;compute();slAutoDay(S.day)');
  assert.equal(ev('S.biz.length'), 1);
  assert.equal(ev('S.biz[0].id'), 'generator');
  // Manual acceptance keeps its existing sign-now, provision-later behavior.
  ev("ACT.accept({id:'scrub'})");
  assert.equal(ev("S.biz.some(b=>b.id==='scrub')"), true);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('#185\'s auto-repair toggle in old saves becomes the repair order; its auto-accept, which never ran without an intern, goes', () => {
  const { ev, dom, errors } = load();
  setup(ev);
  ev("delete S.ops;delete S.slAuto;S.autoSales=true;S.autoRepair=true;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ops.on.repair'), true);
  assert.equal(ev("'sales' in S.ops.on"), false, 'the intern has no sales order any more');
  assert.equal(ev('S.slAuto.on'), false, 'nothing signs on its own that did not before');
  assert.equal(ev("'autoSales' in S||'autoRepair' in S"), false);
  assert.equal(ev('S.ops.intern'), null, 'no intern until you hire one, so nothing runs yet');
  ev("delete S.ops;S.autoSales='true';S.autoRepair=1;S=migrate(S)");
  assert.equal(ev('S.ops.on.repair'), false);
  assert.deepEqual(errors, []);
  dom.window.close();
});

// Split every LAG across a POP's two buildings from Utilities: free for bundles, a second member first for single ports.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(t, extra = '') {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});S.cash=1e8;S.lvl=2;for(const g of GOALS)S.done[g.id]=0;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules.pnis='instant';compute();" + extra);
  return h;
}
const modal = ev => ev("document.getElementById('modalCard').textContent");
const reload = ev => ev("save();S=migrate(JSON.parse(slotRaw(UI.slot)));compute()");
// Frankfurt with two buildings: a bundle and a single port of each kind (transit, PNI, IX). Amsterdam has one building.
const PORTS = "ACT.addSite({city:'fra'});S.pops.fra.routers=2;S.pops.fra.rgen=3;ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;" +
  "S.transit.push({id:'t2',city:'fra',net:'cog',tier:1,n:2,site:'a'},{id:'t1',city:'fra',net:'drz',tier:1,n:1,site:'a'});" +
  "S.pni.push({id:'p2',city:'fra',net:'ggl',tier:1,n:2,ready:0,site:'b'},{id:'p1',city:'fra',net:'nfx',tier:1,n:1,ready:0,site:'a'},{id:'pa',city:'ams',net:'ggl',tier:1,n:2,ready:0});" +
  "ACT.buyIx({city:'fra',tier:1,signed:true});S.ixn={fra:2};ACT.buyIx({city:'fra~2',tier:1});compute();";

test('the quote lists bundles as free and single ports with the price of a second member', t => {
  const { ev, errors } = setup(t, PORTS);
  const q = JSON.parse(ev('JSON.stringify(lagSplitAll())'));
  assert.deepEqual(q.free.map(x => x.id).sort(), ['fra', 'p2', 't2']);
  assert.deepEqual(q.add.map(x => x.id).sort(), ['fra~2', 'p1', 't1']);
  assert.equal(q.cost, ev("PORT[1].setup+1500+PORT[1].setup/2+ixPortMo('fra~2',S.ixp['fra~2'])"));
  assert.ok(!q.free.concat(q.add).some(x => x.id === 'pa'), 'a POP with one building is left alone');
  ev("ACT.utilities({})");
  assert.match(modal(ev), /Split every LAG/);
  assert.match(modal(ev), /3 LAGs have their members in one building/);
  assert.match(modal(ev), /3 single ports need a second member first/);
  assert.deepEqual(errors, []);
});

test('splitting the bundles is free, touches nothing else and survives a reload', t => {
  const { ev, errors } = setup(t, PORTS);
  const cash = ev('S.cash');
  ev("ACT.utilityLagSplit({})");
  assert.equal(ev('S.cash'), cash, 'moving members costs nothing');
  assert.deepEqual(JSON.parse(ev("JSON.stringify([S.transit.find(x=>x.id==='t2').site,S.pni.find(x=>x.id==='p2').site,S.ixSite.fra])")), ['ab', 'ab', 'ab']);
  assert.deepEqual(JSON.parse(ev("JSON.stringify([S.transit.find(x=>x.id==='t1').n,S.pni.find(x=>x.id==='p1').n,S.ixn['fra~2']||1])")), [1, 1, 1], 'no port bought');
  assert.equal(ev("S.pni.find(x=>x.id==='pa').site||'a'"), 'a');
  assert.match(modal(ev), /Split 3 LAGs across both buildings/);
  reload(ev);
  assert.equal(ev('lagSplitAll().free.length'), 0);
  assert.equal(ev('lagSplitAll().add.length'), 3);
  assert.deepEqual(errors, []);
});

test('adding members buys a second port for each single one at the quoted price, and splits everything', t => {
  const { ev, errors } = setup(t, PORTS);
  const q = JSON.parse(ev('JSON.stringify(lagSplitAll())'));
  const cash = ev('S.cash');
  ev(`ACT.utilityLagSplit({add:true,cost:${q.cost + 1}})`);
  assert.equal(ev('S.cash'), cash, 'a stale quote buys nothing');
  assert.match(modal(ev), /quote changed/);
  ev(`ACT.utilityLagSplit({add:true,cost:${q.cost}})`);
  assert.equal(ev('S.cash'), cash - q.cost);
  assert.deepEqual(JSON.parse(ev("JSON.stringify([S.transit.find(x=>x.id==='t1'),S.pni.find(x=>x.id==='p1')].map(x=>[x.n,x.site]))")), [[2, 'ab'], [2, 'ab']]);
  assert.deepEqual(JSON.parse(ev("JSON.stringify([S.ixn['fra~2'],S.ixSite['fra~2']])")), [2, 'ab']);
  assert.equal(ev('lagSplitAll().free.length+lagSplitAll().add.length'), 0);
  ev("ACT.utilities({})");
  assert.match(modal(ev), /Every LAG at a POP with two buildings is split/);
  assert.deepEqual(errors, []);
});

test('needs level 2 and never spends money that is not there', t => {
  const { ev, errors } = setup(t, PORTS);
  ev('S.lvl=1;ACT.utilities({})');
  assert.equal(ev('lagSplitAll()'), null);
  assert.doesNotMatch(modal(ev), /Split every LAG/);
  ev('S.lvl=2;window.q=lagSplitAll().cost;S.cash=q-1;ACT.utilityLagSplit({add:true,cost:q})');
  assert.equal(ev('S.cash'), ev('q-1'));
  assert.equal(ev("S.transit.find(x=>x.id==='t2').site"), 'a', 'all or nothing');
  assert.deepEqual(errors, []);
});

test('a PNI augment already on order is split when it lands, without buying another member', t => {
  const { ev, errors } = setup(t, PORTS + "S.rules.pnis='quick';const p=S.pni.find(x=>x.id==='p1');p.up={tier:1,n:2,ready:S.day+30};compute();");
  assert.ok(ev("lagSplitAll().free.some(x=>x.id==='p1')"));
  assert.ok(!ev("lagSplitAll().add.some(x=>x.id==='p1')"));
  const cash = ev('S.cash');
  ev('ACT.utilityLagSplit({})');
  assert.equal(ev('S.cash'), cash);
  assert.equal(ev("S.pni.find(x=>x.id==='p1').up.site"), 'ab');
  ev("pniUpDone(S.pni.find(x=>x.id==='p1'))");
  assert.deepEqual(JSON.parse(ev("JSON.stringify((({n,site})=>[n,site])(S.pni.find(x=>x.id==='p1')))")), [2, 'ab']);
  assert.deepEqual(errors, []);
});

test('the quote only prices the members the routers have free ports for, and says where the rest wait', t => {
  const { ev, errors } = setup(t, "ACT.addSite({city:'fra'});S.pops.fra.routers=2;S.pops.fra.rgen=3;" +
    "S.transit.push({id:'s1',city:'fra',net:'cog',tier:1,n:1,site:'a'},{id:'s2',city:'fra',net:'drz',tier:1,n:1,site:'a'},{id:'s3',city:'fra',net:'tly',tier:1,n:1,site:'a'});" +
    // Fill the routers with bundles already split, until one 10G port is left.
    "for(let i=0;i<500&&portsMax('fra')-portsUsed('fra')>=2*PORT_SLOT(1);i++)S.transit.push({id:'f'+i,city:'fra',net:'cog',tier:1,n:2,site:'ab'});compute();");
  assert.equal(ev("portsMax('fra')-portsUsed('fra')"), ev('PORT_SLOT(1)'), 'room for one more port');
  const q = ev("(()=>{const q=lagSplitAll();return {add:q.add.map(x=>x.id).join(),full:q.full.map(x=>x.id+'@'+x.city).join(),cost:q.cost}})()");
  assert.equal(q.add, 's1', 'the first single port fits');
  assert.equal(q.full, 's2@fra,s3@fra', 'the others wait for router ports');
  assert.equal(q.cost, ev('PORT[1].setup'), 'only what fits is priced');
  ev("utilitiesModal('fra')");
  assert.match(modal(ev), /2 single ports can't get a second member yet: no free router ports in Frankfurt/);
  const cash = ev('S.cash');
  ev(`ACT.utilityLagSplit({add:true,cost:${q.cost},city:'fra'})`);
  assert.equal(cash - ev('S.cash'), q.cost, 'charged exactly the quote');
  assert.equal(ev("S.transit.find(t=>t.id==='s1').site"), 'ab');
  assert.equal(ev("S.transit.filter(t=>/^s/.test(t.id)&&(t.n||1)<2).map(t=>t.id).join()"), 's2,s3');
  assert.match(modal(ev), /Split 1 LAG across both buildings/);
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const g = n => `RG.findIndex(r=>r.n===${JSON.stringify(n)})`;
const setup = (ev, router) => ev(`ACT.start({});S.cash=1e8;S.nextFail=1e9;S.nextEvent=1e9;S.pops.fra.rgen=${g(router)};S.caches=[];compute()`);
const boxes = (n, site = 'a') => `for(let i=0;i<${n};i++)S.caches.push({id:'c${site}'+i,city:'fra',net:'cfl',site:'${site}'});`;

test('cache boxes share a router port, as many as its speed holds (#252)', () => {
  const { ev, errors } = load();
  setup(ev, 'Absolute Unit 3.2T');
  const base = ev("portsUsed('fra')");
  ev(boxes(32));
  assert.equal(ev("portsUsed('fra')") - base, 1, '32 boxes behind one 3.2T port');
  ev(boxes(1).replace("'ca'+i", "'cx'+i"));
  assert.equal(ev("portsUsed('fra')") - base, 2, 'the 33rd takes a second port');
  ev(boxes(1, 'b'));
  assert.equal(ev("portsUsed('fra')") - base, 3, 'the second site has its own');
  assert.deepEqual(errors, []);
});

test('the share follows the router: 16 on 1.6T, one each on 100G, and a downgrade counts its ports', () => {
  const { ev, errors } = load();
  setup(ev, 'Absolute Unit 1.6T');
  const base = ev("portsUsed('fra')");
  ev(boxes(17));
  assert.equal(ev("portsUsed('fra')") - base, 2);
  assert.equal(ev(`portsUsed('fra',${g('Rusty Router 9000')})`) - base, 17, 'on 100G ports every box takes its own');
  assert.equal(ev("cachePortsAdd('fra',[{site:'a'}])"), 0, 'the 18th still fits on the second port');
  assert.deepEqual(errors, []);
});

test('requesting caches only needs the ports the boxes really take', () => {
  const { ev, errors } = load();
  setup(ev, 'Absolute Unit 3.2T');
  ev("R.demTo={cfl:NET.cfl.cache.min};R.cityDem.fra=900/NSH.cfl");
  const q = JSON.parse(ev("JSON.stringify(utilityCaches('fra'))"));
  assert.equal(q.add.length, 3, 'three 400G boxes');
  assert.equal(q.ports, 1, 'all on one port');
  ev("ACT.utilityCaches({city:'fra',quote:utilityCaches('fra').key})");
  assert.equal(ev("S.caches.length"), 3);
  assert.deepEqual(errors, []);
});

test('400G cache boxes behind 400G or faster ports: fewer boxes, cheaper per Gbps, packed by speed', () => {
  const { ev, errors } = load();
  setup(ev, 'Absolute Unit 3.2T');
  ev("R.demTo={cfl:NET.cfl.cache.min};R.cityDem.fra=1000/NSH.cfl");
  const q = JSON.parse(ev("JSON.stringify(utilityCaches('fra'))"));
  assert.deepEqual(q.add.map(x => x.g), [400, 400, 400], '1T of demand: three 400G boxes');
  assert.equal(q.mo, 3 * ev('CACHE_BIG_MO'));
  ev("ACT.utilityCaches({city:'fra',quote:utilityCaches('fra').key});compute()");
  assert.equal(ev("cachePorts('fra')"), 1, '1.2T behind one 3.2T port');
  assert.equal(ev("R.cost.caches"), 3 * ev('CACHE_BIG_MO'));
  assert.equal(ev("utilityCaches('fra').add.length"), 0);
  // A 100G router still gets 100G boxes; a saved 400G box survives a save, garbage sizes do not.
  ev(`S.pops.ams={day:0,routers:1};R.demTo={cfl:NET.cfl.cache.min};ACT.cache({city:'ams',net:'cfl'})`);
  assert.equal(ev("S.caches.find(c=>c.city==='ams').g"), undefined);
  ev("S.caches.push({id:'x',city:'fra',net:'cfl',g:999});S=sanitize(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("S.caches.filter(c=>c.g===400).length"), 3);
  assert.equal(ev("S.caches.find(c=>c.id==='x').g"), undefined);
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(t) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});S.cash=1e8;UI.speed=0;for(const g of GOALS)S.done[g.id]=0;compute()");
  return h;
}

test('kit balances each provider with minimal moves while buying the missing hardware', t => {
  const { ev, errors } = setup(t);
  ev("for(const [net,n] of [['cfl',4],['ggl',3]])for(let i=0;i<n;i++)S.caches.push({id:net+i,city:'fra',net});S.pops.ams={day:0,routers:1};S.caches.push({id:'elsewhere',city:'ams',net:'cfl',site:'b'});compute()");
  const before = ev('S.cash'), ids = ev('S.caches.map(c=>c.id).join()');
  const quote = JSON.parse(ev("JSON.stringify(utilityKit('fra'))"));
  assert.equal(quote.moves.length, 3);
  ev("ACT.utilityKit({city:'fra',cost:utilityKit('fra').cost})");
  assert.equal(ev('S.cash'), before - quote.cost);
  assert.equal(ev("S.caches.filter(c=>c.city==='fra'&&c.net==='cfl'&&c.site==='b').length"), 2);
  assert.equal(ev("S.caches.filter(c=>c.city==='fra'&&c.net==='ggl'&&c.site==='b').length"), 1);
  assert.equal(ev("S.caches.find(c=>c.id==='elsewhere').site"), 'b');
  assert.equal(ev('S.caches.map(c=>c.id).join()'), ids);
  assert.equal(ev("utilityKit('fra').moves.length"), 0);
  const stable = ev('JSON.stringify(S.caches)');
  ev("ACT.utilityKit({city:'fra',cost:0})");
  assert.equal(ev('JSON.stringify(S.caches)'), stable);
  assert.deepEqual(errors, []);
});

test('an already equipped PoP can balance caches for free, even with negative cash', t => {
  const { ev, errors } = setup(t);
  ev("Object.assign(S.pops.fra,{gen:true,site2:true,routers:3});for(const [net,site] of [['cfl','a'],['ggl','b']])for(let i=0;i<4;i++)S.caches.push({id:net+i,city:'fra',net,site});S.cash=-1;compute();selectCity('fra');ACT.tab({t:'links'})");
  assert.equal(ev("utilityKit('fra').moves.length"), 4, 'overall counts match but provider counts do not');
  assert.equal(ev("document.querySelector('#panelBody [data-act=utilityKit]').disabled"), false);
  ev("document.querySelector('#panelBody [data-act=utilityKit]').click()");
  assert.equal(ev('S.cash'), -1);
  assert.equal(ev('S.pops.fra.routers'), 3);
  for (const net of ['cfl', 'ggl'])
    assert.equal(ev(`S.caches.filter(c=>c.net==='${net}'&&c.site==='b').length`), 2);
  assert.deepEqual(errors, []);
});

test('a rejected kit purchase never moves caches or partially installs hardware', t => {
  const { ev, errors } = setup(t);
  ev("S.caches=[{id:'c1',city:'fra',net:'cfl'},{id:'c2',city:'fra',net:'cfl'}];S.cash=1;compute()");
  const before = ev('JSON.stringify({p:S.pops.fra,c:S.caches,cash:S.cash})');
  ev("ACT.utilityKit({city:'fra',cost:utilityKit('fra').cost});ACT.utilityKit({city:'fra',cost:-1})");
  assert.equal(ev('JSON.stringify({p:S.pops.fra,c:S.caches,cash:S.cash})'), before);
  assert.deepEqual(errors, []);
});

test('odd provider totals are balanced across the whole PoP with the fewest moves', t => {
  const { ev, errors } = setup(t);
  ev("Object.assign(S.pops.fra,{gen:true,site2:true,routers:2});for(const [net,n] of [['nfx',3],['cfl',1],['ggl',1]])for(let i=0;i<n;i++)S.caches.push({id:net+i,city:'fra',net});compute()");
  assert.equal(ev("utilityCacheMoves('fra').length"), 2, 'five boxes all in A require two moves');
  ev("ACT.utilityKit({city:'fra',cost:0})");
  assert.equal(ev("S.caches.filter(c=>c.site==='b').length"), 2);
  assert.equal(ev("['nfx','cfl','ggl'].every(net=>Math.abs(S.caches.filter(c=>c.net===net&&c.site==='b').length-S.caches.filter(c=>c.net===net&&c.site!=='b').length)<=1)"), true);
  assert.equal(ev("utilityCacheMoves('fra').length"), 0);
  assert.deepEqual(errors, []);
});

test('cache batch fills missing provider/site pairs, keeps extra boxes and respects eligibility', t => {
  const { ev, errors } = setup(t);
  ev("Object.assign(S.pops.fra,{site2:true,routers:2});S.caches=[{id:'keep1',city:'fra',net:'cfl'},{id:'keep2',city:'fra',net:'cfl',site:'a'}];compute();R.demTo={cfl:NET.cfl.cache.min,ggl:NET.ggl.cache.min-1}");
  const cash = ev('S.cash'), mo = ev('R.cost.caches');
  assert.equal(ev("utilityCaches('fra').add.length"), 1);
  ev("ACT.utilityCaches({city:'fra',quote:utilityCaches('fra').key})");
  assert.equal(ev('S.cash'), cash, 'cache hardware is free');
  assert.equal(ev('R.cost.caches'), mo + ev('CACHE_MO'));
  assert.equal(ev("S.caches.filter(c=>c.net==='cfl'&&c.site==='b').length"), 1);
  assert.equal(ev("S.caches.filter(c=>c.net==='cfl').length"), 3, 'extra existing A box kept');
  assert.equal(ev("S.caches.some(c=>c.net==='ggl')"), false);
  const stable = ev('JSON.stringify(S.caches)');
  ev("R.demTo={cfl:NET.cfl.cache.min};ACT.utilityCaches({city:'fra',quote:utilityCaches('fra').key})");
  assert.equal(ev('JSON.stringify(S.caches)'), stable);
  assert.deepEqual(errors, []);
});

test('one-site requests add only A, then a new second site gets exactly its missing boxes', t => {
  const { ev, errors } = setup(t);
  ev("R.demTo=Object.fromEntries(NETS.filter(n=>n.cache).map(n=>[n.id,n.cache.min]));ACT.utilityCaches({city:'fra',quote:utilityCaches('fra').key})");
  assert.equal(ev('S.caches.length'), 5);
  assert.equal(ev("S.caches.every(c=>c.site==='a')"), true);
  ev("ACT.utilityKit({city:'fra',cost:utilityKit('fra').cost});R.demTo=Object.fromEntries(NETS.filter(n=>n.cache).map(n=>[n.id,n.cache.min]));ACT.utilityCaches({city:'fra',quote:utilityCaches('fra').key})");
  assert.equal(ev('S.caches.length'), 10);
  assert.equal(ev("NETS.filter(n=>n.cache).every(n=>['a','b'].every(s=>S.caches.filter(c=>c.net===n.id&&c.site===s).length===1))"), true);
  ev("save();S=migrate(JSON.parse(slotRaw(UI.slot)));compute()");
  assert.equal(ev('S.caches.length'), 10);
  assert.equal(ev("S.caches.filter(c=>c.site==='b').length"), 5);
  assert.deepEqual(errors, []);
});

test('cache requests reject stale eligibility and insufficient port capacity atomically', t => {
  const { ev, errors } = setup(t);
  ev("S.pops.fra.site2=true;for(let i=0;i<7;i++)S.caches.push({id:'full'+i,city:'fra',net:'nfx'});compute();R.demTo={cfl:NET.cfl.cache.min};window.q=utilityCaches('fra');ACT.utilities()");
  assert.equal(ev('q.free'), 1);
  assert.equal(ev('q.add.length'), 2);
  assert.equal(ev("document.querySelector('[data-act=utilityCaches]').disabled"), true);
  const before = ev('JSON.stringify(S.caches)');
  ev("ACT.utilityCaches({city:'fra',quote:q.key})");
  assert.equal(ev('JSON.stringify(S.caches)'), before);
  ev("S.pops.fra.routers=2;R.demTo.ggl=NET.ggl.cache.min;ACT.utilityCaches({city:'fra',quote:q.key,modal:true})");
  assert.equal(ev('JSON.stringify(S.caches)'), before);
  assert.match(ev("document.getElementById('modalCard').textContent"), /quote changed/);
  ev("ACT.utilityCaches({city:'not-a-city',quote:''})");
  assert.deepEqual(errors, []);
});

test('balanced caches keep serving when either site fails', t => {
  const { ev, errors } = setup(t);
  ev("Object.assign(S.pops.fra,{site2:true,routers:2,rgen:RG_TOP,bb:{d:5000}});S.caches=[{id:'one',city:'fra',net:'ggl'},{id:'two',city:'fra',net:'ggl'}];compute();ACT.utilityKit({city:'fra',cost:utilityKit('fra').cost})");
  for (const site of ['a', 'b']) {
    ev(`S.inc=[{id:'site-failure',type:'site',ref:'fra',site:'${site}',until:S.day+2}];compute()`);
    assert.ok(ev('Object.values(R.useCache).reduce((a,b)=>a+b,0)') > 0);
    assert.equal(ev(`S.caches.filter(c=>(c.site||'a')==='${site}').every(c=>!R.useCache[c.id])`), true);
  }
  assert.deepEqual(errors, []);
});

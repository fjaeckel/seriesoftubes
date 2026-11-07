const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})";

test('#157 a POP can grow past six routers, with a cage extension', () => {
  const { ev, dom, errors } = load();
  ev(start);
  for (let i = 0; i < 5; i++) ev("ACT.addRouter({city:'fra'})");
  assert.equal(ev('S.pops.fra.routers'), 6);
  const inCage = ev('routerCost(S.pops.fra.rgen||0,5)'), pastCage = ev('routerCost(S.pops.fra.rgen||0,6)');
  assert.ok(pastCage > inCage, 'the seventh router costs more to install');
  const cash = ev('S.cash');
  ev("ACT.addRouter({city:'fra'})");
  assert.equal(ev('S.pops.fra.routers'), 7, 'a seventh router goes in');
  assert.equal(cash - ev('S.cash'), pastCage);
  ev('compute()');
  const withCage = ev('R.cost.pops');
  ev("S.pops.fra.routers=6;compute()");
  const without = ev('R.cost.pops');
  assert.equal(withCage - without, ev('ROUTER_MO+RG[S.pops.fra.rgen||0].mo+CAGE_MO'), 'the cage extension is billed monthly');
  ev("S.pops.fra.routers=7;compute()");
  assert.ok(ev('nodeCap("fra")') === ev('RG[S.pops.fra.rgen||0].cap*7'), 'every router adds forwarding');
  // The routers live on the city's Infra tab. (Not the whole body: that once held the game's source, dictionary
  // and all, so a phrase was always found there.)
  ev("UI.sel={type:'city',id:'fra'};UI.tab='links';renderAll()");
  assert.match(dom.window.document.getElementById('panel').innerHTML, /Cage extension/);
  assert.deepEqual(errors, []);
});

test('#157 the cap stops at RMAX and saves keep their routers', () => {
  const { ev, errors } = load();
  ev(start);
  for (let i = 0; i < 30; i++) ev("ACT.addRouter({city:'fra'})");
  assert.equal(ev('S.pops.fra.routers'), ev('RMAX'));
  assert.ok(ev('RMAX') > 6);
  ev("const s=JSON.parse(JSON.stringify(S));s.pops.fra.routers=12;window.__t=migrate(s)");
  assert.equal(ev('__t.pops.fra.routers'), 12, 'a big POP survives a save round trip');
  ev("const s=JSON.parse(JSON.stringify(S));s.pops.fra.routers=999;window.__t=migrate(s)");
  assert.equal(ev('__t.pops.fra.routers'), ev('RMAX'), 'nonsense is clamped');
  assert.deepEqual(errors, []);
});

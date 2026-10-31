// The capacity broker sells a listing as the route's market wants (#203), and consortium seats can regenerate in the
// landing stations along their cable, so a seat bought early can be lit with early optics.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;S.offers=[];S.biz=[]");
const fiber = (ev, id, a, b, km) => ev(`for(const c of ['${a}','${b}'])if(!S.pops[c])ACT.buildPop({city:c});S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'df',own:true,sys:'roadm',ch:['tp16'],km:${km},ready:0,day:0,cut:0,mo:100,trench:'own:${id}',pairs:1,spares:false});compute()`);

test('a route\'s market follows the eyeballs at both ends, and a landing town counts the city it serves', () => {
  const { ev } = load();
  start(ev);
  assert.ok(ev("brMarket('fra','ams')") >= 6, 'Frankfurt to Amsterdam wants a handful of waves');
  assert.equal(ev("brMarket('jed','gdx')"), 1, 'Jeddah to Magadan (#203) wants about one');
  assert.ok(ev("brMarket('nyc','bde')") > 10, 'Bude lands the Atlantic for London');
  assert.ok(ev("brMarket('nyc','bde')") > ev("brMarket('nyc','gdx')"));
});

test('a listing sells over time, never past the market, and rent from a road to nowhere stays small', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'big', 'fra', 'ams', 450);
  fiber(ev, 'far', 'jed', 'gdx', 9089);
  ev("__reseed(7);ACT.listFiber({id:'big',w:60});ACT.listFiber({id:'far',w:60})");
  assert.equal(ev("S.biz.length"), 0, 'nothing sells the moment it is listed');
  ev('for(let d=0;d<720;d++)brTick()');
  const sold = (id) => ev(`S.biz.filter(b=>b.link==='${id}').reduce((a,b)=>a+(b.slots||0),0)`);
  assert.ok(sold('big') >= 3, `Frankfurt–Amsterdam sold ${sold('big')}`);
  assert.ok(sold('big') <= ev("brMarket('fra','ams')"), 'never more than the route wants');
  assert.equal(sold('far'), 1, 'Jeddah–Magadan: one wave, then the market is full');
  assert.equal(ev("brFree(S.links.find(l=>l.id==='far'))"), 0);
  // random alien-wave offers respect the market too
  ev("S.offers=[];for(let i=0;i<400;i++)spawnOffer()");
  assert.equal(ev("S.offers.filter(o=>o.link==='far').length"), 0, 'no random offer for a full route');
  assert.deepEqual(errors, []);
});

test('a listing is kept in the save, checked, and can be taken off the market', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'big', 'fra', 'ams', 450);
  ev("ACT.listFiber({id:'big',w:4})");
  ev("const t=JSON.stringify(packSave(S));S=migrate(JSON.parse(t))");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.links.find(l=>l.id==='big').list)")), { w: 4, p: 0 });
  ev("const o=JSON.parse(JSON.stringify(packSave(S)));o.links.find(l=>l.id==='big').list={w:'lots',p:-3};S=migrate(o)");
  assert.equal(ev("S.links.find(l=>l.id==='big').list===undefined"), true, 'junk is dropped');
  ev("ACT.listFiber({id:'big',w:2});ACT.unlistFiber({id:'big'})");
  assert.equal(ev("S.links.find(l=>l.id==='big').list===undefined"), true);
  assert.deepEqual(errors, []);
});

test('a consortium seat regenerates in the landing stations along its cable, so early optics can light it', () => {
  const { ev, errors } = load();
  start(ev);
  ev("S.lvl=2;for(const c of ['mrs','sin'])if(!S.pops[c])ACT.buildPop({city:c});S.pops.mrs.rgen=S.pops.sin.rgen=1;S.seatOff={a:'mrs',b:'sin',name:'Sea, Me, We, Us, Them',km:seatKm('mrs','sin'),exp:S.day+30};ACT.seatBuy({n:1});const l=S.links.at(-1);l.ready=S.day;compute()");
  const id = ev('S.links.at(-1).id');
  assert.ok(ev(`!!chWhy(S.links.at(-1),'zr4')`), 'out of reach without regens');
  for (let i = 0; i < 8; i++) ev(`ACT.regen({id:'${id}',d:1})`);
  assert.equal(ev('S.links.at(-1).regen'), 8, 'regen sites on a seat');
  assert.equal(ev(`chWhy(S.links.at(-1),'zr4')`), '', 'and the level-2 optic reaches');
  ev(`ACT.addCh({id:'${id}',o:'zr4'})`);
  assert.equal(ev('S.links.at(-1).ch.length'), 1, 'lit');
  ev(`selectLink(S.links.at(-1));renderPanel()`);
  assert.match(ev("document.getElementById('panelBody').textContent"), /landing stations along the way/);
  // your own point-to-point cable still cannot
  ev("S.links.push({id:'own',a:'lis',b:'for',kind:'df',own:true,sub:true,seaDesign:'standard',sys:'roadm',ch:[],km:6000,ready:0,day:0,cut:0,mo:1,trench:'own:own',pairs:1});ACT.regen({id:'own',d:1})");
  assert.equal(ev("S.links.find(l=>l.id==='own').regen|0"), 0);
  assert.deepEqual(errors, []);
});

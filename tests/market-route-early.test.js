// A route can be kept off the capacity market while its fiber is still being built. The broker starts trading on a
// route the day its fiber is handed over, so switching it off only once it was there left that first day open.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const setup = () => {
  const r = load();
  r.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.biz=[];S.offers=[];for(const c of ['lon','nyc'])if(!S.pops[c])ACT.buildPop({city:c})");
  // Every product on, no minimum, the lowest floor: the broker lists and sells whatever the route wants.
  r.ev("for(const p of CM_P)Object.assign(S.cm.p[p],{on:true,min:1,floor:60});S.cm.hold=0");
  r.ev("S.links.push({id:'f',a:'lon',b:'nyc',kind:'df',own:true,sys:'cl',ch:[],km:5570,ready:S.day+30,day:S.day,cut:0,mo:1,trench:'own:f',pairs:1});after()");
  return r;
};
const J = (ev, x) => JSON.parse(ev(`JSON.stringify(${x})`));
// The fiber is handed over, then a few market days in which every buyer buys.
const handOver = ev => ev("(()=>{const l=S.links.find(x=>x.id==='f');l.ready=S.day;const r=Math.random;Math.random=()=>0;try{for(let i=0;i<5;i++)cmDay(S.day)}finally{Math.random=r}})()");
const traded = ev => J(ev, "[S.links.find(l=>l.id==='f').list||null,S.biz.filter(b=>b.link==='f').length]");

test('a route whose fiber is still being built can be kept off the market, and nothing on it sells at handover', () => {
  const { ev, errors } = setup();
  ev("ACT.mktRoute({k:'lon|nyc'})");
  assert.equal(ev("S.cm.off['lon|nyc']"), 1);
  handOver(ev);
  assert.deepEqual(traded(ev), [null, 0]);
  assert.deepEqual(errors, []);
});

test('left on, the same route trades from the day it is handed over', () => {
  const { ev, errors } = setup();
  handOver(ev);
  const [list, sold] = traded(ev);
  assert.ok(list || sold > 0, 'the broker lists or sells on a route left on');
  assert.deepEqual(errors, []);
});

test('the switch turns back on, refuses a route with no fiber, and survives a reload', () => {
  const { ev, errors } = setup();
  ev("ACT.mktRoute({k:'lon|nyc'});ACT.mktRoute({k:'lon|nyc'})");
  assert.equal(ev("!!S.cm.off['lon|nyc']"), false);
  ev("ACT.mktRoute({k:'lon|par'})");
  assert.equal(ev("!!S.cm.off['lon|par']"), false, 'no fiber between these cities');
  ev("ACT.mktRoute({k:'lon|nyc'});save();S=migrate(JSON.parse(slotRaw(UI.slot)));compute()");
  assert.equal(ev("S.cm.off['lon|nyc']"), 1);
  assert.deepEqual(errors, []);
});

test('the panel of a fiber being built has the switch', () => {
  const { ev, errors } = setup();
  ev("ACT.selLink({id:'f'});renderAll()");
  const panel = () => ev("document.getElementById('panel').textContent");
  assert.match(panel(), /the day the fiber is handed over/);
  assert.match(panel(), /Broker trades here/);
  ev("ACT.mktRoute({k:'lon|nyc'});renderAll()");
  assert.match(panel(), /Broker leaves it alone/);
  assert.match(panel(), /nothing on it is sold/);
  assert.deepEqual(errors, []);
});

// One switch per city pair: with live fiber already on the route, the new fiber's panel says the switch covers the
// live fiber now, not only the new one at handover.
test('next to live fiber on the same route, the switch says it is the whole route\'s', () => {
  const { ev, errors } = setup();
  ev("S.links.push({id:'g',a:'lon',b:'nyc',kind:'df',own:true,sys:'cl',ch:[],km:5570,ready:0,day:0,cut:0,mo:1,trench:'own:g',pairs:1});after()");
  ev("ACT.selLink({id:'f'});renderAll()");
  const panel = () => ev("document.getElementById('panel').textContent");
  assert.match(panel(), /already trades on your live fiber between London and New York/);
  assert.match(panel(), /off stops trading on the live fiber now too/);
  ev("ACT.mktRoute({k:'lon|nyc'});renderAll()");
  assert.match(panel(), /leaves the whole route between London and New York alone/);
  assert.equal(ev("S.cm.off['lon|nyc']"), 1);
  assert.deepEqual(errors, []);
});

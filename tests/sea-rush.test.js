// #258: money hurries the survey, permits and factory of your own subsea cable, 30 days a step, but never below what the
// factory needs to make the cable (two months plus a day per 80 km); the lay ships still sail after that.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.day=200;S.nextFail=S.nextEvent=1e8;for(const g of GOALS)S.done[g.id]=0;";
const own = (km, ready) => `S.links=[{id:'own',a:'lag',b:'bde',kind:'df',own:true,sub:true,sys:'roadm',km:${km},ch:[],day:200,ready:${ready},cut:0,mo:1}];`;

test('#258 paying hurries the permits and the factory, 30 days a step, down to what the factory needs', () => {
  const { ev, dom, errors } = load();
  ev(start + own(6000, 800));
  // 6000 km: 60 + 72 days to make it, then 40 days at sea.
  assert.equal(ev('prepMin(S.links[0])'), 132);
  assert.equal(ev('prepFloor(S.links[0])'), 200 + 132 + 40);
  assert.equal(ev('prepSteps(S.links[0])'), 15);
  ev("UI.sel={type:'link',id:'own'};renderPanel()");
  const panel = () => dom.window.document.querySelector('#panelBody').textContent;
  assert.match(panel(), /Hurry the permits and the factory/);
  assert.match(panel(), /As fast as money goes/);
  assert.match(panel(), /132 days from the order at the soonest/);
  const step = ev('prepCost(S.links[0])'), cash = ev('S.cash');
  ev("ACT.seaRush({id:'own'})");
  assert.equal(ev('S.links[0].ready'), 770, 'one step: 30 days sooner');
  assert.equal(cash - ev('S.cash'), step);
  ev("ACT.seaRush({id:'own',all:1})");
  assert.equal(ev('S.links[0].ready'), 372, 'all the way: the factory floor, then the ships');
  assert.equal(cash - ev('S.cash'), 15 * step);
  assert.equal(ev('layStart(S.links[0])'), 332);
  assert.equal(ev('prepSteps(S.links[0])'), 0, 'no faster than that');
  ev("ACT.seaRush({id:'own'})");
  assert.equal(cash - ev('S.cash'), 15 * step, 'and nothing more is charged');
  // The second lay ship still halves the time at sea on top.
  ev("ACT.layShip({id:'own'})");
  assert.equal(ev('S.links[0].ready'), 352);
  assert.deepEqual(errors, []);
});

test('#258 a short cable is quick; once the ships sail, money buys no more paperwork', () => {
  const { ev, errors } = load();
  ev(start + own(800, 600));
  assert.equal(ev('prepMin(S.links[0])'), 70, 'a short hop: a couple of months');
  ev("ACT.seaRush({id:'own',all:1})");
  assert.equal(ev('S.links[0].ready'), 200 + 70 + 6);
  ev(start + own(6000, 800) + 'S.day=770');
  assert.equal(ev('prepSteps(S.links[0])'), 0, 'laying has started');
  const cash = ev('S.cash');
  ev("ACT.seaRush({id:'own'})");
  assert.equal(ev('S.cash'), cash);
  assert.deepEqual(errors, []);
});

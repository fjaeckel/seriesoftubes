// The Hyperscaler's goals and win, phase 4 (37-hyper.js HYPER_GOALS, 38-hyper-win.js): the goal ladder from launching at
// home to Cloud Nine, Tier 1 as a side achievement with its badge (never the win, never selling transit, over a long
// seeded run of the reference bot), and Cloud Nine reached by setting up its four conditions one by one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { install } = require('../scripts/lib/hyper-bot');

const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
function start(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;compute()");
  return h;
}

test('the goal ladder: about ten goals from launching at home to Cloud Nine, which is the only win', (t) => {
  const { ev, errors } = start(t);
  const ids = J(ev, 'goals().map(g=>g.id)');
  assert.deepEqual(ids, ['hs_launch', 'hs_door', 'hs_tenant', 'hs_region', 'hs_edge', 'hs_cc5', 'hs_rep', 'hs_cont3', 'hs_ai', 'hs_drill', 'hs_cable', 'hs_survive', 'hs_win']);
  assert.deepEqual(J(ev, 'goals().filter(g=>g.win).map(g=>[g.id,!!g.cloud9])'), [['hs_win', true]]);
  assert.ok(ev('goals().every(g=>g.t&&g.d&&!/^hyper/.test(g.t)&&!/^hyper/.test(g.d))'), 'every goal is named and described');
  // The new goals, each from its own fact.
  const ok = (id) => ev(`goals().find(g=>g.id==='${id}').ok()`);
  assert.equal(ok('hs_ai'), false);
  ev('S.hs.jd=1');
  assert.equal(ok('hs_ai'), true);
  assert.equal(ok('hs_drill'), false);
  ev("S.hs.drill['fra|par']=3");
  assert.equal(ok('hs_drill'), true);
  assert.equal(ok('hs_survive'), false);
  ev('S.hs.fsv=1');
  assert.equal(ok('hs_survive'), true);
  assert.equal(ok('hs_cable'), false);
  ev("S.links.push({id:'seat',a:'lon',b:'nyc',kind:'df',own:true,sub:true,seat:true,pairs:1,ch:[],km:6000,ready:0,cut:0,mo:1,trench:'seat'})");
  assert.equal(ok('hs_cable'), true, 'a seat on a consortium cable counts as your own subsea cable');
  assert.equal(ev('hsC9().cab'), false, 'but not as your own cable across an ocean');
  assert.equal(ok('hs_rep'), false);
  ev("ACT.buildPop({city:'par'});S.hs.rg.par={t:0,ready:0,mw:5};S.links.push({id:'w',a:'fra',b:'par',kind:'wave',tier:3,km:480,mo:1,cut:0,ready:0,trench:'w'});ACT.buyTransit({city:'fra',net:'cog',tier:1});S.hs.cc.DE={d:90,since:0};compute()");
  assert.equal(ok('hs_rep'), true);
  assert.deepEqual(errors, []);
});

test('Tier 1 is a side achievement: a toast, S.hs.t1, the badge, its own cables; never the win, never transit sold', (t) => {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  install(ev);
  ev("beginGame('Cloud Bot','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});UI.speed=0;closeModal();__hsBot.start()");
  // A long seeded run of the reference bot, checking every day that nothing but cloud tenants is offered or signed.
  const bad = J(ev, `(()=>{const bad=[];for(let i=0;i<400;i++){__hsBot.day();dayTick();closeModal();
    if(i===200){window.__t1=isTier1;isTier1=()=>true;}if(i===201)window.__t1log=(S.log||[]).map(x=>x.t).join(' ');
    for(const o of S.offers.concat(S.biz))if(o.type!=='cloud')bad.push(S.day+':'+o.type);}return bad;})()`);
  assert.deepEqual(bad, [], 'no transit customer, no classic kind, ever');
  assert.equal(ev('S.hs.t1'), 202, 'Tier 1 recorded the day it came');
  assert.equal(ev('S.won'), false, 'never the classic win');
  assert.equal(ev('S.hs.won'), 0, 'nor Cloud Nine');
  assert.notEqual(ev("S.ach&&S.ach.hs_t1"), undefined, 'the badge: Transit? Never Heard of Her');
  assert.equal(ev("BADGES.find(b=>b.id==='hs_t1').t"), 'Transit? Never Heard of Her');
  assert.match(ev('window.__t1log'), /You're Tier 1 now, as a side hustle/);
  assert.equal(ev('cabOpen()'), true, 'a Tier 1 lays its own cables, as a Tier 1 win would let it');
  assert.equal(ev("$('modal').hidden"), true, 'no win window');
  assert.ok(ev("S.fedp?!S.fedp.rates.transit:true"), 'no transit card to publish');
  ev('isTier1=window.__t1');
  assert.deepEqual(errors, []);
});

test('Cloud Nine: five continents with regions, every pair drilled, an own cable across an ocean, 10 Tbps between regions', (t) => {
  const { ev, errors } = start(t);
  const card = () => ev('hsC9Card()');
  assert.match(card(), /Regions on 1 of 5 continents/);
  // Regions on five continents (Frankfurt, New York, São Paulo, Singapore, Johannesburg), each paired with the next.
  ev("for(const c of ['nyc','sao','sin','jnb']){ACT.buildPop({city:c});S.hs.rg[c]={t:1,ready:0,mw:20};}S.hs.rep={fra:'nyc',nyc:'fra',sao:'nyc',sin:'fra',jnb:'fra'};compute();checkGoals()");
  assert.equal(ev('hsC9().ct'), 5);
  assert.match(card(), /✅ Regions on 5 of 5 continents/);
  assert.deepEqual(J(ev, 'hsPairs()'), ['fra|jnb', 'fra|nyc', 'fra|sin', 'nyc|sao']);
  assert.match(card(), /Region pairs drilled: 0 of 4/);
  ev("for(const k of ['fra|jnb','fra|nyc','fra|sin'])S.hs.drill[k]=1;checkGoals()");
  assert.equal(ev('S.hs.won'), 0);
  ev("S.hs.drill['nyc|sao']=2;checkGoals()");
  assert.match(card(), /✅ Region pairs drilled: 4 of 4/);
  assert.equal(ev('S.hs.won'), 0, 'not yet: no cable, no traffic');
  ev("S.links.push({id:'atl',a:'lon',b:'nyc',kind:'df',own:true,sub:true,ch:[],km:5600,ready:S.day+30,cut:0,mo:1,trench:'atl'});checkGoals()");
  assert.equal(ev('hsC9().cab'), false, 'a cable still at sea is not yours yet');
  ev("S.links.find(l=>l.id==='atl').ready=0;checkGoals()");
  assert.match(card(), /✅ Your own subsea cable across an ocean/);
  assert.equal(ev('S.hs.won'), 0);
  ev('S.hs.bpk=9000;checkGoals()');
  assert.equal(ev('S.hs.won'), 0);
  assert.match(card(), /▫️ Between regions at peak: 9.00 Tbps of 10.0 Tbps/);
  // The peak comes from the routing, kept from day to day.
  ev('R.hs.btw=10000;hsDay(S.day);R.hs.btw=10;hsDay(S.day)');
  assert.equal(ev('S.hs.bpk'), 10000);
  ev('checkGoals()');
  assert.equal(ev('S.hs.won'), ev('S.day') || 1);
  assert.notEqual(ev("S.done.hs_win"), undefined);
  assert.equal(ev('S.won'), false, 'Cloud Nine is not Tier 1');
  assert.notEqual(ev("S.ach&&S.ach.cloud9"), undefined, 'its badge');
  assert.match(ev("(S.log||[]).map(x=>x.t).join(' ')"), /Head in the clouds/);
  assert.match(card(), /Cloud Nine, reached on/);
  // Won once: losing a condition later takes nothing back.
  ev("S.hs.drill={};checkGoals()");
  assert.ok(ev('S.hs.won') >= 1);
  assert.deepEqual(errors, []);
});

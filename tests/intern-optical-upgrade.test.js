// The intern upgrades optical transport: line systems up a size (only where the traffic gets around the day-long swap and
// no customer rides the fiber), optics traded for bigger ones on full, hot fiber, or every fiber up to a chosen line system.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt (transit) and Amsterdam (broadband) joined by a full Rainbow-in-a-Box fiber of 16×400G, and the long way
// round through Paris on two waves. Level 6: every line system and optic unlocked. Change Freeze: no fat fingers.
// Annie runs the shift: Kevin would swap two line systems a night (tests/intern-personas.test.js).
const BASE = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=6;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "for(const c of ['ams','par'])ACT.buildPop({city:c});for(const c of ['fra','ams','par']){S.pops[c].rgen=mainRG(3);S.pops[c].routers=2;}ACT.launchBB({city:'ams'});" +
  "S.transit=[];ACT.buyTransit({city:'fra',net:'cog',tier:2});" +
  "S.links=[{id:'f',a:'fra',b:'ams',kind:'df',own:true,sys:'lite',ch:Array(16).fill('zr4'),km:450,trench:'t1',ready:0,cut:0,mo:1,pairs:1}," +
  "{id:'w1',a:'fra',b:'par',kind:'wave',tier:4,km:480,cut:0,mo:1},{id:'w2',a:'par',b:'ams',kind:'wave',tier:4,km:430,cut:0,mo:1}];compute();" +
  "ACT.opsHire({id:'annie'});S.ops.floor=0;S.ops.cap.optup=0;closeModal()";
function game(t, extra) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  if (extra) h.ev(extra);
  return h;
}
const order = (ev, p) => ev(`S.ops.on.optup=true;S.ops.p.optup=${JSON.stringify(p)}`);
// The fiber runs at 90% of what it carries.
const heat = ev => ev("R.load.f=dfCap(S.links[0])*0.9");
const fiber = ev => JSON.parse(ev("JSON.stringify({sys:S.links[0].sys,ch:S.links[0].ch.join(),down:S.links[0].eqDown>S.day})"));

test('a full, hot fiber gets the next line system where the traffic gets around it, at the price of the click', t => {
  const { ev, errors } = game(t);
  order(ev, { at: 80 });
  const want = ev('sysUpCost(S.links[0])'), served = ev('R.served'), c0 = ev('S.cash');
  heat(ev);
  ev('opsDay(S.day)');
  assert.equal(fiber(ev).sys, 'roadm', 'up to the ROADMaster');
  assert.equal(c0 - ev('S.cash'), want, 'the shift paid exactly what Upgrade costs');
  assert.equal(fiber(ev).down, true, 'the swap takes the fiber down for the day, as by hand');
  assert.ok(ev('R.served') >= served - 1e-6, 'and every gigabit still gets through, the long way round');
  assert.match(ev('opsLine(S.ops.log[0])'), /upgraded the line system on Frankfurt–Amsterdam ⇧ROADM/);
  // Not hot enough, or not full: nothing.
  const { ev: ev2 } = game(t);
  order(ev2, { at: 80 });
  ev2('R.load.f=dfCap(S.links[0])*0.5;opsDay(S.day)');
  ev2('S.links[0].ch.pop();R.load.f=dfCap(S.links[0])*0.95;S.day++;opsDay(S.day)');
  assert.equal(fiber(ev2).sys, 'lite', 'a fiber with a free channel gets more optics from Light more fiber, not a new line system');
  assert.deepEqual(errors, []);
});

test('no way around, or a customer on the fiber: no swap; bigger optics instead, one channel at a time', t => {
  // Without the waves through Paris, Amsterdam would be cut off for the day.
  const { ev, errors } = game(t, "S.links=S.links.filter(l=>l.kind==='df');compute()");
  order(ev, { at: 80 });
  heat(ev);
  const c0 = ev('dfCap(S.links[0])'), cash0 = ev('S.cash');
  ev('opsDay(S.day)');
  assert.equal(fiber(ev).sys, 'lite', 'no outage');
  assert.equal(fiber(ev).down, false);
  assert.ok(ev('dfCap(S.links[0])') > c0, 'more capacity from bigger optics');
  assert.match(fiber(ev).ch, /zr8/, 'Sizzle 800ZR+ in place of some 400ZR+');
  assert.equal(ev("S.links[0].ch.length"), 16, 'still sixteen channels');
  assert.ok(ev("S.spares.zr4") > 0, 'the old optics went on the shelf');
  assert.ok(cash0 - ev('S.cash') > 0);
  assert.match(ev('opsLine(S.ops.log[0])'), /swapped \d+ optics for bigger ones \(Frankfurt–Amsterdam 400G→800G\)/);
  // A customer's wave on the fiber: the intern never swaps its line system, even with a way around.
  const { ev: ev2 } = game(t, "S.links[0].ch.length=15;S.biz.push({id:'cw',name:'Wave',city:'fra',city2:'ams',type:'wwave',link:'f',slots:1,bw:400,rate:1})");
  order(ev2, { at: 80, swap: false });
  heat(ev2);
  ev2('opsDay(S.day)');
  assert.equal(fiber(ev2).sys, 'lite');
  assert.deepEqual(errors, []);
});

test('a chosen line system: every fiber below it is moved up, two steps in one night if need be, one fiber a night', t => {
  const { ev, errors } = game(t, "S.links[0].ch=['zr4'];" +
    "for(const [i,a,b] of [[2,'fra','par'],[3,'par','ams']])S.links.push({id:'g'+i,a,b,kind:'df',own:true,sys:'lite',ch:['zr4'],km:450,trench:'t'+i,ready:0,cut:0,mo:1,pairs:1});compute()");
  order(ev, { sys: 'cl', at: 90 });
  const want = ev("sysCost('roadm')+sysCost('cl')");
  const sys = () => JSON.parse(ev("JSON.stringify(S.links.filter(l=>l.kind==='df').map(l=>l.sys))"));
  const c0 = ev('S.cash');
  ev('opsDay(S.day)');
  assert.equal(sys().filter(s => s === 'cl').length, 1, 'one fiber a night, cold or not');
  assert.equal(c0 - ev('S.cash'), want, 'both steps in one night: one outage, not two');
  for (let n = 0; n < 6 && sys().some(s => s !== 'cl'); n++) ev('S.day+=2;compute();opsDay(S.day)');
  assert.deepEqual(sys(), ['cl', 'cl', 'cl', 'cl'].slice(0, sys().length), 'the rest on the nights after');
  // Nothing is ever moved down.
  ev("S.ops.p.optup.sys='roadm';S.day+=2;compute();opsDay(S.day)");
  assert.ok(sys().every(s => s === 'cl'));
  // A fiber with no way around is tested once, then left alone for a week: no routing every night for nothing.
  ev("S.links=S.links.filter(l=>l.id==='f');S.links[0].sys='lite';S.ops.p.optup.sys='cl';S.day+=2;compute()");
  const runs = () => ev('window.__runs||0');
  ev("window.__runs=0;const c0=compute;compute=function(){window.__runs++;return c0.apply(this,arguments);};opsDay(S.day)");
  assert.equal(sys()[0], 'lite');
  assert.equal(runs(), 0, 'no other path at all: not even one routing to find out');
  ev("S.links.push({id:'w9',a:'fra',b:'ams',kind:'wave',tier:0,km:450,cut:0,mo:1});S.day+=OPTUP_WAIT;window.__runs=0;opsDay(S.day)");
  assert.equal(runs(), 1, 'a path, too thin: one routing to find out');
  assert.equal(sys()[0], 'lite');
  ev('S.day++;window.__runs=0;opsDay(S.day)');
  assert.equal(runs(), 0, 'and not again the next night');
  assert.deepEqual(errors, []);
});

test('the budget holds, the setting is saved, and the sheet shows it as lists', t => {
  const { ev, dom, errors } = game(t);
  order(ev, { at: 80 });
  ev('S.ops.cap.optup=10000');
  heat(ev);
  ev('opsDay(S.day)');
  assert.equal(fiber(ev).sys, 'lite', 'a $10k budget does not buy a line system');
  assert.ok(ev("S.ops.log[0].r.some(x=>x[0]==='broke')"));
  const back = v => ev(`(()=>{const s=JSON.parse(JSON.stringify(S));s.ops.p.optup=${v};sanitize(s);return JSON.stringify(s.ops.p.optup);})()`);
  assert.deepEqual(JSON.parse(back("{sys:'cl',swap:false,at:70}")), { at: 70, sys: 'cl', swap: false });
  assert.deepEqual(JSON.parse(back("{sys:'lite',swap:'yes'}")), {});
  assert.deepEqual(JSON.parse(back('undefined')), {}, 'an old save without the order');
  ev("const s=JSON.parse(JSON.stringify(S));delete s.ops.on.optup;sanitize(s);window.__off=s.ops.on.optup");
  assert.equal(ev('__off'), false, 'off in an old save');
  dom.window.innerWidth = 360;
  ev("ACT.phoneTab({t:'noc'})");
  dom.window.document.querySelector('#leftBody [data-act="opsOpen"]').click();
  const sel = [...dom.window.document.querySelectorAll('#modalCard select[data-chg="opsParam"]')].find(s => s.dataset.args === '{"k":"optup","p":"sys"}');
  assert.deepEqual([...sel.options].map(o => o.textContent), ['Next one, when full', 'ROADMaster 9000', 'ROADMaster 9000 C+L']);
  assert.match(dom.window.document.getElementById('modalCard').textContent, /Upgrade optical transport/);
  assert.deepEqual(errors, []);
});

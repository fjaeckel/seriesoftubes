// The optical team's "Modernize optics" order: every lit fiber moved onto newer optics even with room to spare, the
// chosen model or the fastest that reaches, smallest first, hitless, the old optics on the spares shelf.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt–Amsterdam on a ROADMaster with 10×400ZR+ and plenty of free channels, barely used. Level 6: every optic but
// the 3.2T unlocked. Change Freeze: no fat fingers.
const BASE = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=6;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.buildPop({city:'ams'});for(const c of ['fra','ams']){S.pops[c].rgen=mainRG(3);S.pops[c].routers=2;}ACT.launchBB({city:'ams'});" +
  "S.links=[{id:'f',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',ch:Array(10).fill('zr4'),km:450,trench:'t1',ready:0,cut:0,mo:1,pairs:1}];compute();" +
  "S.ops.floor=0;ACT.optxHire({size:'m'});closeModal();S.ops.cap.optmod=0";
function game(t) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  return h;
}
const teamDay = ev => ev('dayGo(optxRun(S.day),(g,v)=>g.next(v))');
const ch = ev => ev("S.links[0].ch.slice().sort().join()");

test('modernize: the fastest that reaches replaces every smaller optic, room to spare or not, at the price of the clicks', t => {
  const { ev, errors } = game(t);
  assert.ok(ev("freeCh(S.links[0])") > 0 && ev("(R.load.f||0)<dfCap(S.links[0])*0.5"), 'a fiber with room and little traffic');
  // Not switched on: nothing.
  teamDay(ev);
  assert.equal(ch(ev), Array(10).fill('zr4').join());
  const best = ev("Object.keys(OPT).filter(o=>!chWhy(S.links[0],o)).sort((a,b)=>optG(b,S.links[0])-optG(a,S.links[0]))[0]");
  assert.equal(best, 'tp16', 'at level 6 on a ROADM, the 1.6T is the fastest that reaches');
  const want = ev("opticCountCost(S.links[0],'tp16',10)"), c0 = ev('S.cash'), cap0 = ev('dfCap(S.links[0])');
  ev('S.ops.on.optmod=true');
  teamDay(ev);
  assert.equal(ch(ev), Array(10).fill('tp16').join(), 'every 400ZR+ swapped, channel for channel');
  assert.equal(c0 - ev('S.cash'), want, 'exactly what the optic buttons cost');
  assert.ok(ev('dfCap(S.links[0])') > cap0);
  assert.equal(ev('S.spares.zr4'), 10, 'the old optics went on the shelf');
  assert.equal(ev('S.links[0].eqDown>S.day'), false, 'no outage');
  assert.match(ev('optxLine(S.optx.log[0])'), /swapped 10 optics for bigger ones/);
  // Nothing smaller left: the next night does nothing.
  const c1 = ev('S.cash');
  ev('S.day++');teamDay(ev);
  assert.equal(ev('S.cash'), c1);
  assert.deepEqual(errors, []);
});

test('modernize: a chosen model only where it carries more, within the budget; the intern never runs it', t => {
  const { ev, errors } = game(t);
  ev("S.ops.on.optmod=true;S.ops.p.optmod={to:'zr8'};S.links[0].ch=['zr4','zr4','zr4','tp16'];compute()");
  // Budget for two 800ZR+ this month.
  ev("S.ops.cap.optmod=OPS_CAPS.find(v=>v>=2*optCost('zr8')&&v<3*optCost('zr8'))||0");
  const cap = ev('S.ops.cap.optmod');
  teamDay(ev);
  const got = ev("S.links[0].ch.filter(k=>k==='zr8').length");
  assert.equal(cap, 50000);
  assert.ok(got >= 1 && got * ev("optCost('zr8')") <= cap, 'as many as the budget pays for');
  assert.equal(ev("S.links[0].ch.filter(k=>k==='tp16').length"), 1, 'a 1.6T is never swapped down to an 800ZR+');
  ev("S.ops.cap.optmod=0;S.day++");teamDay(ev);
  assert.equal(ch(ev), 'tp16,zr8,zr8,zr8', 'the rest the next night, on a budget with no limit');
  // A model smaller than everything lit does nothing.
  ev("S.ops.p.optmod={to:'zr4'};S.day++");const c0 = ev('S.cash');teamDay(ev);
  assert.equal(ev('S.cash'), c0, 'nothing swapped down');
  assert.equal(ch(ev), 'tp16,zr8,zr8,zr8');
  // Team only: without the team the order does not run, and the intern's panel does not offer it.
  assert.equal(ev("OPSK.optmod.only===1&&OPSK.optmod.team===1"), true);
  ev("ACT.opsHire({id:'annie'});closeModal()");
  assert.equal(ev("OPS.filter(d=>opsShow(d)&&opsMine(d.k)).some(d=>d.k==='optmod')"), false);
  // The setting offers 'the fastest' and every optic unlocked now, smallest first.
  assert.deepEqual(JSON.parse(ev("JSON.stringify(opsOpts('optmod','to'))")), ['best', ...JSON.parse(ev("JSON.stringify(Object.keys(OPT).filter(o=>techOk('opt',o,OPT[o].lvl)).sort((a,b)=>OPT[a].g-OPT[b].g))"))]);
  assert.equal(JSON.parse(ev("JSON.stringify(opsOpts('optmod','to'))"))[1], 'zr4', 'smallest first');
  // A save with a bad setting falls back to the fastest.
  ev("S.ops.p.optmod={to:'warp9'};sanitize(S)");
  assert.equal(ev("opsP('optmod','to')"), 'best');
  assert.deepEqual(errors, []);
});

test('modernize: the team panel shows the order and fits a phone', t => {
  const { ev, errors } = game(t);
  ev('window.innerWidth=390;S.ops.on.optmod=true');
  assert.ok(ev("OPS.filter(d=>d.team&&opsShow(d)).some(d=>d.k==='optmod')"), 'listed with the team\'s orders');
  assert.match(ev("opsOrderHtml(OPSK.optmod)"), /Modernize optics[\s\S]*The fastest that reaches/);
  assert.deepEqual(errors, []);
});

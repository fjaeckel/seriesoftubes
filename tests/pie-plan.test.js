// Pie in the Sky: the Dishes tab's planner (93-ui/87-pie-plan.js). Seeded; a sandbox, state set directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// London, Frankfurt, Manchester and New York on one backbone; dishes with rights in Europe; a baked crust without lasers.
const world = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','fra','man','nyc'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'lf',a:'lon',b:'fra',kind:'wave',tier:3,km:640,sub:false,cut:0,mo:1},{id:'lm',a:'lon',b:'man',kind:'wave',tier:3,km:260,sub:false,cut:0,mo:1},{id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1});for(const c of ['lon','fra','man','nyc'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['lon','fra','man']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}");
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];compute()");
};
const term = (ev, id, city, bw) => ev(`S.biz.push({id:'${id}',type:'pizza',city:'${city}',city2:null,bw:${bw},rate:BIZ_T.pizza.rate,reqs:[],latMax:null,route:'normal',name:'Home ${id}',mood:100,since:0,sites:null});compute()`);
const plan = (ev) => JSON.parse(ev('JSON.stringify(piePlan(R.pie),(k,v)=>v===Infinity?1e99:v)'));

test('a busy dish gets just enough antennas', () => {
  const { ev, errors } = load();
  world(ev);
  // London (one antenna) carries 18 of its 20 Gbps.
  term(ev, 'a', 'lon', 18);
  const ant = plan(ev).items.find((x) => x.k === 'ant');
  assert.equal(ant.c, 'lon');
  assert.equal(ant.ant, 2, 'not all 16');
  assert.equal(ant.cost, ev('pieAntPrice(0)'));
  assert.deepEqual(errors, []);
});

test('suggestions come best first: idle dishes moved and new dishes where cities are out of reach', () => {
  const { ev, errors } = load();
  world(ev);
  // London carries a little; Manchester and Frankfurt carry nothing and London reaches their cities too.
  term(ev, 'a', 'lon', 5);
  const p = plan(ev);
  const pays = p.items.map((x) => x.pay);
  assert.deepEqual(pays, pays.slice().sort((a, b) => a - b), 'sorted by payback');
  const mv = p.items.find((x) => x.k === 'move');
  assert.ok(mv, 'an idle dish moves');
  assert.ok(['man', 'fra'].includes(mv.from));
  assert.notEqual(mv.from, mv.to);
  assert.ok(mv.n >= 2, 'to where it reaches cities no dish reaches');
  assert.equal(mv.cost, ev(`pieDishPrice()+${mv.lic}+${mv.pop}-pieDishSalvage(S.pie.dishes.find(x=>x.city==='${mv.from}'))`), 'net of the salvage');
  const ny = p.items.find((x) => x.to === 'nyc');
  assert.ok(ny, 'a dish at New York reaches America');
  assert.equal(ny.lic, ev("pieLicPrice('US')"), 'with a year of landing rights');
  assert.ok(p.r1 > p.r0, 'the plan reaches more cities');
  assert.deepEqual(errors, []);
});

test('the planner shows in the Dishes tab, ranked, with a globe mark for each suggestion', () => {
  const { ev, dom, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 18);
  const p = plan(ev);
  ev("ACT.pieOpen();ACT.pieTab({t:'dish'})");
  assert.equal(dom.window.document.querySelector('#modal .pie-plan'), null, 'closed until asked');
  ev('ACT.piePlanOpen()');
  const box = dom.window.document.querySelector('#modal .pie-plan');
  assert.equal(box.querySelectorAll('[data-act=piePlanDo]').length, p.items.length);
  assert.equal(box.querySelectorAll('[data-act=pieLook]').length, p.items.length, 'each one can be seen on the globe');
  assert.match(box.querySelector('.pie-pl-i').textContent, /#1/);
  assert.equal(box.querySelector('[data-act=piePlanAll]'), null, 'one line at a time, no do-all');
  assert.match(box.querySelector('.pie-pl-tot').textContent, /in all/, 'the total up top');
  assert.equal(box.querySelectorAll('.pie-pl-ring').length, 3, 'a legend for the rings');
  assert.match(box.querySelector('.pie-pl .pie-fx-m small').textContent, /London dish \d+% full: 1 orbit customer lands there/, 'each line says why');
  assert.equal(ev('pieGlobeData().plan.length'), p.items.length);
  ev('ACT.piePlanOpen()');
  assert.equal(ev('pieGlobeData().plan.length'), 0, 'no marks once closed');
  ev('ACT.piePlanOpen();closeModal()');
  assert.equal(ev('!!UI.piePlan'), false, 'closing Pie Control closes the planner');
  assert.deepEqual(errors, []);
});

test('a new POP is suggested where it pays best, and carrying it out opens the POP with its dish', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 18);
  const np = plan(ev).items.find((x) => x.pop > 0);
  assert.ok(np, 'a site without a POP');
  assert.equal(ev(`!!S.pops['${np.to}']`), false);
  assert.equal(np.pop, ev(`popCost('${np.to}')`));
  const args = { k: np.k, to: np.to };
  if (np.from) args.from = np.from;
  if (np.from) args.ok = true;
  ev(`ACT.piePlanDo(${JSON.stringify(args)})`);
  assert.equal(ev(`!!S.pops['${np.to}']`), true, 'the POP opened');
  assert.equal(ev(`S.pie.dishes.some(x=>x.city==='${np.to}')`), true, 'with its dish');
  assert.equal(ev(`pieLicOk(CITY['${np.to}'].cc)`), true, 'and landing rights');
  if (np.from) assert.equal(ev(`S.pie.dishes.some(x=>x.city==='${np.from}')`), false, 'the old dish went');
  assert.deepEqual(errors, []);
});

test('an idle dish that alone covers some cities stays, and nothing is dropped before a crust carries', () => {
  const { ev, errors } = load();
  world(ev);
  ev("S.pie.dishes=S.pie.dishes.filter(x=>x.city!=='man');ACT.pieDish({city:'nyc'});S.pie.lic.US={state:'ok',until:1e6};compute()");
  term(ev, 'a', 'lon', 5);
  assert.ok(!plan(ev).items.some((x) => x.from === 'nyc'), 'New York idles but is the only dish over there');
  ev("S.pie.crusts.short.cohorts=[{n:Math.round(CRUSTS.short.full*0.3),day:S.day,las:false}];compute()");
  assert.ok(!plan(ev).items.some((x) => x.k === 'drop' || x.k === 'move'), 'no crust carries: idle says nothing');
  assert.deepEqual(errors, []);
});

test('an idle dish next to a full one is its spare room: neither taken down nor moved onto itself', () => {
  const { ev, errors } = load();
  world(ev);
  // London has all 16 antennas and runs over 90% full; Manchester, 260 km away, idles.
  ev("S.pie.dishes.find(x=>x.city==='lon').ant=PIE_ANT_MAX");
  term(ev, 'a', 'lon', 300);
  assert.ok(ev("R.pie.dish.find(d=>d.city==='lon').u") >= 0.75);
  const p = plan(ev);
  assert.ok(!p.items.some((x) => x.from === 'man'), 'Manchester stays');
  assert.ok(!p.items.some((x) => x.from && x.from === x.to), 'never a move onto itself');
  assert.ok(!p.items.some((x) => x.c === 'lon' && x.to), 'no new dish while one nearby has room');
  assert.deepEqual(errors, []);
});

test('coverage never rounds up to 100% while a city is out of reach', () => {
  const { ev } = load();
  assert.equal(ev('piePlanPct(410,411)'), '99%');
  assert.equal(ev('piePlanPct(411,411)'), '100%');
  assert.equal(ev('piePlanPct(1,3)'), '33%');
});

test('a town no dish can reach is named with the reason, and one-town sites are still offered', () => {
  const { ev, dom, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 5);
  const p = plan(ev);
  const pcn = p.out.find((o) => o.c === 'pcn');
  assert.ok(pcn, 'Pitcairn stays out of reach without lasers');
  assert.equal(pcn.why, 'nobh');
  assert.ok(p.items.filter((x) => x.n !== undefined).every((x) => x.n >= 1));
  ev("ACT.pieOpen();ACT.pieTab({t:'dish'});ACT.piePlanOpen()");
  const txt = dom.window.document.querySelector('#modal .pie-pl-out').textContent;
  ev('closeModal()');
  assert.match(txt, new RegExp(ev(`CITY['${p.out[0].c}'].name`)), 'the first ones by name');
  assert.match(txt, new RegExp(`${p.out.length - 5} more`), 'the rest counted');
  assert.deepEqual(errors, []);
});

const args = (it) => { const a = { k: it.k }; for (const f of { ant: ['c', 'ant'], band: ['c'], add: ['to'], move: ['from', 'to'], drop: ['from'] }[it.k]) a[f] = it[f]; return a; };
const leave = (ev) => ev("S.mode='normal';S.rules.gates='open'");

test('moving or taking down a dish asks first, and cancelling keeps it', () => {
  const { ev, dom, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 5);
  const mv = plan(ev).items.find((x) => x.k === 'move');
  const n = ev('S.pie.dishes.length');
  ev("ACT.pieOpen();ACT.pieTab({t:'dish'});ACT.piePlanOpen()");
  ev(`ACT.piePlanDo(${JSON.stringify(args(mv))})`);
  assert.equal(ev(`S.pie.dishes.some(x=>x.city==='${mv.from}')`), true, 'nothing moved yet');
  assert.equal(ev('S.pie.dishes.length'), n);
  const box = dom.window.document.querySelector('#modal .pie-plan .pie-confirm');
  assert.ok(box, 'the question shows under its line');
  assert.match(box.textContent, new RegExp(ev(`CITY['${mv.from}'].name`)));
  ev('ACT.piePlanKeep()');
  assert.equal(dom.window.document.querySelector('#modal .pie-plan .pie-confirm'), null);
  assert.equal(ev(`S.pie.dishes.some(x=>x.city==='${mv.from}')`), true);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('a dish an orbit customer lands on is never suggested for taking down', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 5);
  const from = plan(ev).items.find((x) => x.k === 'move').from;
  // Pretend a customer lands there (a terminal with nothing carried still counts).
  ev(`R.pie.gs.zz='${from}'`);
  assert.ok(!plan(ev).items.some((x) => x.from === from));
  assert.deepEqual(errors, []);
});

test('arguments must match a current suggestion of that kind exactly', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 5);
  const mv = plan(ev).items.find((x) => x.k === 'move');
  const before = ev('JSON.stringify(S.pie.dishes)'), cash = ev('S.cash');
  // A drop with a to (the move's arguments under another kind) does nothing at all.
  ev(`ACT.piePlanDo({k:'drop',from:'${mv.from}',to:'${mv.to}',ok:true})`);
  ev(`ACT.piePlanDo({k:'move',from:'${mv.from}',to:'${mv.to}',c:'lon',ok:true})`);
  ev("ACT.piePlanDo({k:'nuke',from:'lon',ok:true})");
  ev("ACT.piePlanDo({k:'ant',c:'lon',ant:16})");
  ev(`ACT.piePlanDo({k:'drop',from:'lon',ok:true})`);
  assert.equal(ev('JSON.stringify(S.pie.dishes)'), before);
  assert.equal(ev('S.cash'), cash);
  assert.deepEqual(errors, []);
});

test('a stale suggestion and the same line clicked twice do nothing the second time', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 18);
  const ant = plan(ev).items.find((x) => x.k === 'ant');
  leave(ev);
  ev('S.cash=1e9');
  ev(`ACT.piePlanDo(${JSON.stringify(args(ant))})`);
  assert.equal(ev("S.pie.dishes.find(x=>x.city==='lon').ant"), 2);
  const cash = ev('S.cash');
  ev(`ACT.piePlanDo(${JSON.stringify(args(ant))})`);
  assert.equal(ev("S.pie.dishes.find(x=>x.city==='lon').ant"), 2, 'clicked twice: once');
  assert.equal(ev('S.cash'), cash, 'and paid once');
  // A dish built by hand where the plan wanted one makes that line stale.
  const add = plan(ev).items.find((x) => x.k === 'add' && !x.pop);
  if (add) {
    const stale = args(add);
    ev(`ACT.pieDish({city:'${add.to}'})`);
    const n = ev('S.pie.dishes.length'), c2 = ev('S.cash');
    ev(`ACT.piePlanDo(${JSON.stringify(stale)})`);
    assert.equal(ev('S.pie.dishes.length'), n);
    assert.equal(ev('S.cash'), c2);
  }
  assert.deepEqual(errors, []);
});

test('short of cash outside the sandbox: the line is greyed and the action pays nothing', () => {
  const { ev, dom, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 5);
  leave(ev);
  ev('S.cash=10');
  const p = plan(ev), np = p.items.find((x) => x.pop > 0);
  ev("ACT.pieOpen();ACT.pieTab({t:'dish'});ACT.piePlanOpen()");
  const btns = [...dom.window.document.querySelectorAll('#modal .pie-plan [data-act=piePlanDo]')];
  p.items.forEach((it, i) => { if (it.cost > 10) assert.equal(btns[i].disabled, true, `${it.k} ${it.to || it.c || it.from} greyed`); });
  const pops = ev('Object.keys(S.pops).length'), dishes = ev('S.pie.dishes.length'), spent = ev('S.pie.book.spent');
  ev(`ACT.piePlanDo(${JSON.stringify({ ...args(np), ok: true })})`);
  assert.equal(ev('Object.keys(S.pops).length'), pops, 'no POP');
  assert.equal(ev('S.pie.dishes.length'), dishes, 'no dish');
  assert.equal(ev('S.pie.book.spent'), spent, 'nothing spent');
  assert.ok(ev('S.cash') >= 10);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('in a sandbox a POP is still real money: its line is greyed without the cash', () => {
  const { ev, dom, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 5);
  ev('S.cash=0');
  const p = plan(ev), i = p.items.findIndex((x) => x.pop > 0);
  ev("ACT.pieOpen();ACT.pieTab({t:'dish'});ACT.piePlanOpen()");
  const btns = dom.window.document.querySelectorAll('#modal .pie-plan [data-act=piePlanDo]');
  assert.equal(btns[i].disabled, true);
  const j = p.items.findIndex((x) => !x.pop && x.k === 'add');
  if (j >= 0) assert.equal(btns[j].disabled, false, 'a dish alone is free in a sandbox');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('the plan is built once while nothing it reads changes, not every day', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 18);
  ev('piePlan(R.pie);window.__n=0;const m=piePlanMake;piePlanMake=(...a)=>{window.__n++;return m(...a);}');
  for (let i = 0; i < 3; i++) ev('compute();piePlan(R.pie)');
  assert.equal(ev('window.__n'), 0, 'three computes, no rebuild');
  ev("S.pie.dishes.find(x=>x.city==='lon').ant=2;compute();piePlan(R.pie)");
  assert.equal(ev('window.__n'), 1, 'a dish changed: rebuilt');
  assert.deepEqual(errors, []);
});

test('a new POP is priced with the POP standard\'s routers, so a move never loses the old dish for want of cash', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 5);
  leave(ev);
  ev('S.popStd={g:0,rt:4};S.cash=1e9');
  const q = JSON.parse(ev('JSON.stringify(popStdQuote())'));
  assert.ok(q && q.cost > 0, 'the standard adds routers that cost money');
  const np = plan(ev).items.find((x) => x.pop > 0 && x.k === 'move') || plan(ev).items.find((x) => x.pop > 0);
  assert.ok(np, 'a site without a POP');
  assert.equal(np.pop, ev(`popCost('${np.to}')`) + q.cost, 'the routers are in the price');
  // Exactly the line's price in the bank: it either goes through whole, or leaves the old dish where it was.
  ev(`S.cash=${np.cost}`);
  ev(`ACT.piePlanDo(${JSON.stringify({ ...args(np), ok: true })})`);
  const moved = ev(`S.pie.dishes.some(x=>x.city==='${np.to}')`);
  assert.equal(moved, true, 'the new dish is built');
  if (np.from && !moved) assert.equal(ev(`S.pie.dishes.some(x=>x.city==='${np.from}')`), true, 'or the old one stays');
  assert.deepEqual(errors, []);
});

test('a dish that just turned busy has little money at risk yet, so growing it ranks after what pays', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 15.2); // 76% of 20 Gbps: just over PIE_HOT, far from PIE_FULL
  const ant = plan(ev).items.find((x) => x.k === 'ant' && x.c === 'lon');
  assert.ok(ant, 'still suggested, as headroom');
  const traffic = ev("R.pie.dish.find(d=>d.city==='lon').used*BIZ_T.pizza.rate");
  assert.ok(ant.val > 0 && ant.val < traffic * 0.1, `a sliver of its traffic at risk (${ant.val} of ${traffic})`);
  term(ev, 'b', 'lon', 2.8); // now 90%: all of it
  const full = plan(ev).items.find((x) => x.k === 'ant' && x.c === 'lon');
  assert.ok(Math.abs(full.val - ev("R.pie.dish.find(d=>d.city==='lon').used*BIZ_T.pizza.rate")) < 1e-6, 'full: all its traffic');
  assert.ok(full.pay < ant.pay, 'pays back sooner once it is full');
  assert.deepEqual(errors, []);
});

test('a long plan shows the best few lines, and all of them on a tap', () => {
  const { ev, dom, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 18);
  // A big ground segment has a line per dish: the same line many times stands in for it.
  ev('const f0=piePlan;piePlan=Q=>{const p=f0(Q);return {...p,items:Array.from({length:14},()=>p.items[0])};}');
  ev("ACT.pieOpen();ACT.pieTab({t:'dish'});ACT.piePlanOpen()");
  const rows = () => dom.window.document.querySelectorAll('#modal .pie-plan [data-act=piePlanDo]').length;
  assert.equal(rows(), ev('PIE_PLAN_SHOW'));
  assert.match(ev("document.querySelector('#modal .pie-plan').textContent"), /14/, 'the total and the button count them all');
  ev('ACT.piePlanAll()');
  assert.equal(rows(), 14);
  ev('closeModal();ACT.pieOpen();ACT.pieTab({t:\'dish\'});ACT.piePlanOpen()');
  assert.equal(rows(), ev('PIE_PLAN_SHOW'), 'closing Pie Control folds it again');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

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
  assert.ok(box.querySelector('[data-act=piePlanAll]'));
  assert.equal(ev('pieGlobeData().plan.length'), p.items.length);
  ev('ACT.piePlanOpen()');
  assert.equal(ev('pieGlobeData().plan.length'), 0, 'no marks once closed');
  ev('closeModal()');
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

test('do all carries out every suggestion', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'a', 'lon', 18);
  const p = plan(ev);
  ev('ACT.piePlanAll()');
  assert.equal(ev("S.pie.dishes.find(x=>x.city==='lon').ant"), 2);
  for (const it of p.items.filter((x) => x.to)) assert.ok(ev(`S.pie.dishes.some(x=>x.city==='${it.to}')`), it.to);
  ev('compute()');
  assert.ok(plan(ev).r0 >= p.r1, 'the cities the plan promised are reached');
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

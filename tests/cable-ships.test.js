const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Cable ships (src/game/20-world/70-cable-ships.js, src/game/85-incidents/50-cable-ships.js): a subsea cut sends a club
// ship from its port, the cut lasts until it has sailed out and spliced, the ship is busy until it is home again, and a
// cut waits when every ship of its zone's club is out, unless a private charter jumps the queue.
const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.day=200;S.nextFail=S.nextEvent=1e8;for(const g of GOALS)S.done[g.id]=0;";
const wave = (id, a, b, cable, km) => `{id:'${id}',a:'${a}',b:'${b}',kind:'wave',sub:true,tier:0,km:${km},cable:'${cable}',cut:0,mo:1000}`;
// A cut with a known fault: t of the way from a, sw days of splicing, sp days of permits.
const cut = (id, link, t, sw = 4, sp = 0) => `(()=>{const l=S.links.find(x=>x.id==='${link}');S.inc.push({id:'${id}',type:'cut',ref:l.trench||l.id,until:S.day+15,msg:'cut',cost:4000,start:S.day});
  const i=S.inc[S.inc.length-1];i.sl=l.id;i.st=${t};i.sw=${sw};i.sp=${sp};shipAssign(i,l);})()`;
const J = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));

test('a subsea cut sends the nearest free club ship, and lasts until it has sailed out and spliced', () => {
  const { ev, errors } = load();
  ev(start + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];` + cut('c1', 'med', 0.9));
  const i = J(ev, "S.inc[0]"), f = J(ev, "S.fleet[S.inc[0].ship]");
  assert.ok(['mend', 'tea'].includes(i.ship), 'a Mediterranean Mending Club ship from Marseille');
  // 10% of 365 km from Marseille: one day to sail, one to get going, four to splice.
  assert.equal(f.arr, 200 + 1 + 1);
  assert.equal(f.done, f.arr + 4);
  assert.equal(f.back, f.done + 1);
  assert.equal(i.until, f.done);
  assert.equal(ev("S.links[0].cut"), f.done);
  assert.equal(ev("linkDown(S.links[0])"), true);
  assert.match(ev("shipStatus(S.inc[0])"), /is sailing from Marseille: on site in 2d, cable back in about 6d/);
  // The cut ends with the splice; the ship sails home and only then takes another job.
  for (let d = 200; d < f.done; d++) ev('dayTick()');
  assert.equal(ev("S.inc.length"), 0);
  assert.equal(ev("linkDown(S.links[0])"), false);
  assert.ok(ev(`!shipFree(SHIP.${i.ship})`), 'still sailing home');
  ev('dayTick()');
  assert.ok(ev(`shipFree(SHIP.${i.ship})`));
  assert.equal(ev(`S.fleet.${i.ship}`), undefined);
  assert.deepEqual(errors, []);
});

test('with every club ship out the cut waits; a private charter jumps the queue, for millions', () => {
  const { ev, errors } = load();
  ev(start + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];`
    + "for(const id of ['mend','tea'])S.fleet[id]={inc:null,link:'x',t:0.5,e:'a',dep:190,arr:195,done:205,back:230,fx:0,fy:0};" + cut('c1', 'med', 0.5));
  const i = J(ev, "S.inc[0]");
  assert.equal(i.ship, null);
  assert.equal(i.seaq, 1);
  assert.equal(ev("linkDown(S.links[0])"), true);
  assert.match(ev("shipStatus(S.inc[0])"), /Every Mediterranean Mending Club ship is out on a job/);
  // The charter is the quickest free ship anywhere: from Cornwall, about 4,800 km away.
  assert.ok(i.cost >= 1000000 + 4000 * 200, `charter costs ${i.cost}`);
  assert.match(i.fix, /^Charter /);
  const cash = ev('S.cash');
  ev("ACT.fixInc({id:'c1'})");
  assert.equal(cash - ev('S.cash'), i.cost);
  const now = J(ev, "S.inc[0]"), f = J(ev, "S.fleet[S.inc[0].ship]");
  assert.ok(now.ship && !['mend', 'tea'].includes(now.ship), `chartered ${now.ship}`);
  assert.equal(now.seaq, undefined);
  assert.equal(now.until, f.done);
  assert.ok(f.done < 260, 'back well within the next weeks');
  assert.equal(ev("S.inc[0].cost"), 0, 'nothing more to buy');
  assert.deepEqual(errors, []);
});

test('a waiting cut gets the first club ship home', () => {
  const { ev, errors } = load();
  ev(start + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];`
    + "S.fleet.mend={inc:null,link:'x',t:0.5,e:'a',dep:190,arr:195,done:200,back:202,fx:0,fy:0};S.fleet.tea={...S.fleet.mend,back:260};" + cut('c1', 'med', 0.5));
  assert.equal(ev("S.inc[0].seaq"), 1);
  assert.equal(ev("S.inc[0].cost"), 0, 'no charter on offer: waiting two days for the club ship is quicker than a ship from Cornwall');
  ev('dayTick();dayTick()');
  assert.equal(ev("S.inc[0].ship"), 'mend');
  assert.equal(ev("S.inc[0].until"), ev("S.fleet.mend.done"));
  assert.deepEqual(errors, []);
});

test('a charter while a club ship is on its way turns that ship round', () => {
  const { ev, errors } = load();
  // Both Cornwall ships are out, so the club sends the next one, from Curaçao: a long way round by the cable routes.
  ev(start + `S.links=[${wave('atl', 'nyc', 'bde', 'apollo', 5564)}];S.inc=[];`
    + "for(const id of ['knot','splice'])S.fleet[id]={inc:null,link:'x',t:0.5,e:'a',dep:190,arr:195,done:200,back:201,fx:0,fy:0};" + cut('c1', 'atl', 0.7));
  const first = ev("S.inc[0].ship");
  assert.ok(['reel', 'cguy'].includes(first), `another Atlantic Splice Society ship: ${first}`);
  // Next day a Cornwall ship is home: chartering it beats waiting for the long voyage.
  ev('S.day=201;shipDay()');
  const i = J(ev, "S.inc[0]");
  assert.ok(i.cost > 0, 'the Cornwall ship would be there sooner');
  ev("ACT.fixInc({id:'c1'})");
  assert.ok(['knot', 'splice'].includes(ev("S.inc[0].ship")));
  const f = J(ev, `S.fleet.${first}`);
  assert.equal(f.inc, null, 'the first ship has no job any more');
  assert.equal(f.rs, 201);
  assert.ok(f.back <= 202, 'it turns back after a day under way');
  assert.deepEqual(errors, []);
});

test('repairs in slow-permit waters wait for the paperwork; deep water takes longer on site', () => {
  const { ev, errors } = load();
  ev(start + `S.links=[${wave('in', 'bom', 'maa', 'bbg', 2315)},${wave('atl', 'nyc', 'bde', 'apollo', 5564)}];S.inc=[];`);
  for (let seed = 1; seed <= 24; seed++) {
    ev(`window.__reseed(${seed});S.fleet={};S.inc=[];(()=>{const l=S.links[${seed % 2}];S.inc.push({id:'c',type:'cut',ref:l.id,until:S.day+15,msg:'',cost:0,start:S.day});shipCut(S.inc[0],l);})()`);
    const i = J(ev, "S.inc[0]"), km = seed % 2 ? 5564 : 2315, shallow = Math.min(i.st, 1 - i.st) * km <= 300;
    if (seed % 2 === 0 && shallow) assert.ok(i.sp >= 21 && i.sp <= 42, `Indian waters: ${i.sp} days of permits`);
    else assert.equal(i.sp, 0, 'no permit in the open sea, nor off New York or Cornwall');
    if (shallow) assert.ok(i.sw >= 3 && i.sw <= 5); else assert.ok(i.sw >= 6 && i.sw <= 12);
  }
  assert.deepEqual(errors, []);
});

test('fireFailure on a subsea wave calls a ship; a cut on land does not', () => {
  const { ev, errors } = load();
  ev(start + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];fireFailure('cut')`);
  const sea = J(ev, "S.inc.find(i=>i.type==='cut')");
  assert.ok(sea.ship || sea.seaq);
  assert.ok(sea.st > 0 && sea.st < 1);
  ev("S.links=[{id:'land',a:'fra',b:'ams',kind:'wave',tier:0,km:400,cut:0,mo:1000}];S.inc=[];S.fleet={};fireFailure('cut')");
  const land = J(ev, "S.inc.find(i=>i.type==='cut')");
  assert.equal(land.ship, undefined);
  assert.equal(land.cost, 4000);
  assert.deepEqual(J(ev, "Object.keys(S.fleet)"), []);
  assert.deepEqual(errors, []);
});

test('ships and their jobs survive a save; broken or old saves are repaired', () => {
  const { ev, errors } = load();
  ev(start + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];` + cut('c1', 'med', 0.9));
  const before = J(ev, "[S.inc[0],S.fleet]");
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.deepEqual(J(ev, "[S.inc[0],S.fleet]"), before);
  // Unknown ships, nonsense numbers and a job that points nowhere.
  ev("S.fleet.titanic={dep:1,arr:2,done:3,back:9e9};S.fleet[S.inc[0].ship].arr='soon';S.inc[0].st=7;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("S.fleet.titanic"), undefined);
  assert.ok(ev("Number.isFinite(S.fleet[S.inc[0].ship].arr)"));
  assert.equal(ev("S.inc[0].st"), 0.97);
  ev("S.inc[0].ship='titanic';S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("S.inc[0].ship"), null);
  assert.equal(ev("S.inc[0].seaq"), 1, 'a cut that lost its ship waits for the next one');
  // A save from before cable ships: no fleet, and a cut with no ship keeps working as it did.
  ev("const o=JSON.parse(JSON.stringify(S));delete o.fleet;o.inc=[{id:'old',type:'cut',ref:'med',until:o.day+5,msg:'old cut',cost:4000}];S=migrate(o)");
  assert.deepEqual(J(ev, 'S.fleet'), {});
  assert.equal(ev("S.inc[0].ship"), undefined);
  assert.equal(ev("shipSea(S.inc[0])"), false);
  ev('dayTick()');
  assert.deepEqual(errors, []);
});

test('ships are drawn where their voyage puts them, and tapping one says what it does', () => {
  const { ev, dom, errors } = load();
  ev(start + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];` + cut('c1', 'med', 0.5));
  const id = ev("S.inc[0].ship");
  const home = J(ev, `shipHomePt(SHIP.${id})`), f = J(ev, `S.fleet.${id}`);
  assert.equal(J(ev, `shipAt(SHIP.${id},200.5)`).m, 'port', 'getting under way');
  const out = J(ev, `shipAt(SHIP.${id},${f.arr - 0.5})`);
  assert.equal(out.m, 'out');
  const work = J(ev, `shipAt(SHIP.${id},${f.arr + 1})`);
  assert.equal(work.m, 'work');
  assert.ok(Math.abs(work.x - f.fx) < 1 && Math.abs(work.y - f.fy) < 1, 'on the fault');
  const back = J(ev, `shipAt(SHIP.${id},${f.back + 1})`);
  assert.ok(Math.abs(back.x - home[0]) < 1e-6 && Math.abs(back.y - home[1]) < 1e-6, 'home again');
  // Drawn on the map, and found by a tap.
  ev(`const C=CITY.mrs;cam.x=C.x;cam.y=C.y;cam.z=3;UI.speed=1;draw(0)`);
  assert.ok(ev('SHIP_HITS.length') >= 2, 'the ship at work and its sister ship in port');
  const hit = J(ev, `SHIP_HITS.find(h=>h.it.s&&h.it.s.id==='${id}')`);
  ev(`(()=>{const r=cv.getBoundingClientRect();shipTap(shipHit(${hit.x}+r.left,${hit.y}+r.top))})()`);
  assert.match(dom.window.document.body.innerHTML, /Mediterranean Mending Club/);
  assert.deepEqual(errors, []);
});

test('the link panel and the NOC say where the ship is, on a phone too', () => {
  const { ev, dom, errors } = load();
  ev(start + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];` + cut('c1', 'med', 0.5));
  ev("window.innerWidth=360;UI.sel={type:'link',id:'med'};renderPanel()");
  const panel = dom.window.document.querySelector('#panelBody').textContent;
  assert.match(panel, /is sailing from Marseille/);
  assert.doesNotMatch(panel, /Back in \d+ days/);
  ev("UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.match(dom.window.document.querySelector('#leftBody').textContent, /is sailing from Marseille/);
  assert.deepEqual(errors, []);
});

test('your own subsea cable: survey and factory first, then a lay ship; a second one can be booked, crews cannot help', () => {
  const { ev, dom, errors } = load();
  ev(start + "S.links=[{id:'own',a:'lag',b:'bde',kind:'df',own:true,sub:true,sys:'roadm',km:6000,ch:[],day:200,ready:800,cut:0,mo:1}];");
  assert.equal(ev('layDays(S.links[0])'), 40);
  assert.equal(ev('layStart(S.links[0])'), 760);
  assert.deepEqual(J(ev, 'layQuote(S.links[0])'), { save: 20, cost: 3000000 + 20 * 150000 });
  ev("UI.sel={type:'link',id:'own'};renderPanel()");
  const panel = () => dom.window.document.querySelector('#panelBody').textContent;
  assert.match(panel(), /Survey, permits and the cable factory/);
  assert.match(panel(), /Laying starts in 560 days/);
  assert.match(panel(), /Book a second lay ship/);
  assert.doesNotMatch(panel(), /Hire extra crews|All the crews/);
  const cash = ev('S.cash');
  ev("ACT.crews({id:'own'})");
  assert.equal(ev('S.cash'), cash, 'no crews at sea');
  ev("ACT.layShip({id:'own'})");
  assert.equal(cash - ev('S.cash'), 6000000);
  assert.equal(ev('S.links[0].ready'), 780);
  assert.equal(ev('layStart(S.links[0])'), 760, 'laying starts the same day, two ships finish sooner');
  assert.equal(ev('layQuote(S.links[0])'), null, 'one second ship is all');
  ev("ACT.layShip({id:'own'})");
  assert.equal(cash - ev('S.cash'), 6000000);
  // At sea: both ships on the map, from both ends.
  ev("S.day=770;UI.sel={type:'link',id:'own'};renderPanel();const C=CITY.lag;cam.x=C.x;cam.y=C.y;cam.z=0.5;UI.speed=0;draw(0)");
  assert.match(panel(), /at sea, laying/);
  assert.match(panel(), /3,000 of 6,000 km/);
  assert.equal(ev("SHIP_HITS.filter(h=>h.it.lay).length>=1"), true);
  // Too late to book once laying has started.
  ev("S.links[0].ship2=undefined;S.links[0].ready=800");
  assert.equal(ev('layQuote(S.links[0])'), null);
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.deepEqual(errors, []);
});

test('a second lay ship moves pending subsea upgrades with the finish', () => {
  const { ev, errors } = load();
  ev(start + "S.links=[{id:'own',a:'lag',b:'bde',kind:'df',own:true,sub:true,sys:'roadm',km:15000,ch:[],day:200,ready:1000,cut:0,mo:1}];");
  ev("ACT.subUpgrade({id:'own',k:'terminal'});ACT.subUpgrade({id:'own',k:'engineering'})");
  const before = J(ev, '[S.links[0].ready,S.links[0].subterminal,S.links[0].subengineering]');
  ev("ACT.layShip({id:'own'})");
  const save = Math.floor(Math.ceil(15000 / 150) / 2);
  assert.deepEqual(J(ev, '[S.links[0].ready,S.links[0].subterminal,S.links[0].subengineering]'), before.map((d) => d - save));
  assert.deepEqual(errors, []);
});

test('the NOC intern’s rush-repair order pays a charter only within its budget', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');"
    + "ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();S.day=200;"
    + `S.links=[${wave('med', 'bcn', 'mrs', 'medusa', 365)}];S.inc=[];`
    + "for(const id of ['mend','tea'])S.fleet[id]={inc:null,link:'x',t:0.5,e:'a',dep:190,arr:195,done:205,back:230,fx:0,fy:0};" + cut('c1', 'med', 0.5));
  const cost = ev('S.inc[0].cost'), cash = ev('S.cash');
  ev("S.ops.on.repair=true;S.ops.p.repair={};S.ops.cap.repair=1e6;opsDay(S.day)");
  assert.equal(ev('S.inc[0].seaq'), 1, 'over budget: the cut keeps waiting');
  assert.equal(ev('S.cash'), cash);
  assert.ok(cost > 1e6 && cost < 5e6, `a charter from Cornwall: ${cost}`);
  ev('S.ops.cap.repair=5e6;opsDay(S.day)');
  assert.equal(cash - ev('S.cash'), cost);
  assert.ok(ev('S.inc[0].ship') && !ev('S.inc[0].seaq'));
  assert.deepEqual(errors, []);
});

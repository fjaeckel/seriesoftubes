// Pie in the Sky: backhaul. A POP with no fiber to the backbone sends all its own traffic up its pie dish and down at a
// landing dish on the backbone (src/game/80-simulation/35-pie-paths.js, rule O3). Seeded; state is set directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// A backbone London – New York – Auckland with transit in London and New York, full dishes with landing rights there, a
// full lasered Shortcrust, and Pitcairn (Adamstown): a POP of its own with broadband, no cable, and a dish.
const world = (ev, opt = {}) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc','akl','pcn'])if(!S.pops[c])ACT.buildPop({city:c});S.links=[];"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'na',a:'nyc',b:'akl',kind:'wave',tier:3,km:14200,sub:true,cut:0,mo:1});for(const c of ['lon','nyc'])ACT.buyTransit({city:c,net:'cog',tier:1});ACT.buyTransit({city:'akl',net:'sgt',tier:1})");
  ev(`ACT.pieFound();for(const c of ${JSON.stringify(opt.dishes || ['lon', 'nyc', 'akl', 'pcn'])}){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX`);
  ev(`S.pops.pcn.bb={d:${opt.d || 5}};S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:${opt.las !== false}}];compute()`);
};
const J = (ev, x) => JSON.parse(ev(`JSON.stringify(${x})`));
const bh = (ev, c = 'pcn') => J(ev, `R.pie.bh.find(b=>b.city==='${c}')||null`);
const st = (ev, c = 'pcn') => ev(`R.pie.dish.find(d=>d.city==='${c}').st`);
const doc = (dom) => dom.window.document;

test('Pitcairn with a dish reaches the backbone through orbit: all its traffic lands at Auckland', () => {
  const { ev, errors } = load();
  world(ev, { dishes: ['lon', 'nyc', 'akl'] });
  assert.equal(ev("sfOf(R,'pcn')"), 0, 'no dish: Pitcairn is cut off and served by nobody');
  ev("ACT.pieDish({city:'pcn'});S.pie.lic.PN={state:'ok',until:1e6};for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX;compute()");
  assert.deepEqual(J(ev, 'R.pie.isl'), ['pcn'], 'still off the backbone');
  const b = bh(ev);
  assert.equal(b.land, 'akl', 'the fastest landing dish');
  assert.equal(b.las, true, 'Auckland is 5,300 km away: lasers');
  const km = ev("pieKm('pcn','akl')");
  assert.ok(Math.abs(b.ms - ev(`pieSkyMs(${km},CRUSTS.short.alt)`)) < 1e-9, `latency is the orbit path: ${b.ms} ms`);
  assert.ok(b.ms > 20 && b.ms < 30, `${b.ms} ms one way`);
  assert.equal(b.cap, ev("pieDishes().find(d=>d.city==='pcn').g"), 'capacity: the dish (nothing else uses it)');
  assert.ok(ev('R.citySrv.pcn/R.cityDem.pcn') > 0.95, `served ${ev('R.citySrv.pcn/R.cityDem.pcn')}`);
  assert.ok(Math.abs(b.g - ev('R.citySrv.pcn')) < 0.5, 'what it carries is what Pitcairn gets');
  // Every Gbps on the backhaul is Pitcairn's.
  assert.deepEqual(Object.keys(J(ev, "R.ef['pie:bh:pcn'].dst")), ['pcn']);
  assert.equal(st(ev), 'backhaul');
  assert.equal(st(ev, 'akl'), 'ok', 'the landing dish carries it');
  assert.ok(ev("R.pie.dish.find(d=>d.city==='akl').bh") > 4);
  assert.ok(ev('R.pie.load.pcn') > 0 && ev('R.pie.load.akl') > 0, 'load rings include backhaul');
  const f = J(ev, "R.pie.flows.find(f=>f.k==='b')");
  assert.deepEqual([f.id, f.city, f.dish], ['bh:pcn', 'pcn', 'akl']);
  assert.deepEqual(f.hops.map((h) => h.k), ['up', 'las', 'down']);
  assert.ok(Math.abs(f.hops.reduce((a, h) => a + h.ms, 0) - b.ms) < 1e-9);
  const cr = J(ev, "R.pie.crust.find(c=>c.id==='short')");
  assert.ok(Math.abs(cr.used - b.g) < 1e-6, `the crust counts what the backhaul carries (${cr.used}), not what it may (${b.cap})`);
  // Its users notice the round trip through orbit, like any far exit (#…): 50 ms is where broadband turns bad.
  assert.ok(Math.abs(ev('R.latFar.pcn.ms') - 2 * b.ms) < 0.5, 'the exit is one orbit hop away');
  assert.ok(ev('R.latF.pcn') < 1 && ev("sfOf(R,'pcn')") > 0.3);
  assert.deepEqual(errors, []);
});

test('the pipe is small: a big island POP fills it and the rest is dropped', () => {
  const { ev, errors } = load();
  world(ev, { d: 300 });
  ev("S.pie.dishes.find(x=>x.city==='pcn').ant=1;compute()");
  const b = bh(ev);
  assert.equal(b.cap, ev('PIE_ANT_G'), 'one antenna');
  assert.ok(b.g >= b.cap - 1e-6 && b.g <= b.cap + 1e-6, `full: ${b.g} of ${b.cap}`);
  assert.ok(ev("sfOf(R,'pcn')") < 0.1, 'most of the demand is dropped');
  assert.ok(ev('R.cityDem.pcn') > 10 * b.cap);
  // The landing dish's room caps it too: Auckland already full of terminals.
  ev("S.pie.dishes.find(x=>x.city==='pcn').ant=PIE_ANT_MAX;S.pie.dishes.find(x=>x.city==='akl').ant=1;compute()");
  assert.ok(bh(ev).cap <= ev('PIE_ANT_G') + 1e-9 || bh(ev).land !== 'akl', 'never more than the landing dish holds');
  for (const d of J(ev, 'R.pie.dish')) assert.ok(d.used <= d.cap + 1e-6, `${d.city}: ${d.used} on ${d.cap}`);
  // Laying fiber is the real fix: Pitcairn joins the backbone and the backhaul goes away.
  ev("S.links.push({id:'pa',a:'pcn',b:'akl',kind:'wave',tier:3,km:5400,sub:true,cut:0,mo:1});compute()");
  assert.deepEqual(J(ev, 'R.pie.isl'), []);
  assert.deepEqual(J(ev, 'R.pie.bh'), []);
  assert.equal(ev("Object.keys(R.ef).some(k=>k.startsWith('pie:bh:'))"), false);
  assert.deepEqual(errors, []);
});

test('POPs on the backbone never route bulk traffic through orbit, and one island never carries another', () => {
  const { ev, errors } = load();
  world(ev);
  ev("ACT.buildPop({city:'hnl'});ACT.pieDish({city:'hnl'});for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX;S.pops.hnl.bb={d:5};S.pops.lon.bb={d:20};S.pops.nyc.bb={d:20};S.pops.akl.bb={d:5};compute()");
  assert.deepEqual(J(ev, 'R.pie.isl').sort(), ['hnl', 'pcn']);
  ev("S.biz.push({id:'h1',type:'hft',city:'lon',city2:'akl',bw:5,rate:1,reqs:[],latMax:null,route:'fast',name:'h1',mood:100,since:0,sites:null},{id:'v1',type:'l2vpn',city:'nyc',city2:'lon',bw:5,rate:1,reqs:[],latMax:null,route:'normal',name:'v1',mood:100,since:0,sites:null});compute()");
  for (const c of ['pcn', 'hnl']) {
    const ef = J(ev, `R.ef['pie:bh:${c}']`);
    assert.deepEqual(Object.keys(ef.dst), [c], `only ${c}'s traffic on its backhaul`);
    assert.ok(!ef.eg['l2:h1'] && !ef.eg['l2:v1'], 'no circuit between other cities');
  }
  // Every other orbit edge carries only latency circuits.
  assert.ok(ev("Object.keys(R.ef).filter(k=>k.startsWith('pie:')&&!k.startsWith('pie:bh:')).every(k=>Object.keys(R.ef[k].eg).every(e=>e.startsWith('l2:')))"));
  assert.ok(ev("sfOf(R,'lon')") > 0.95 && ev("sfOf(R,'akl')") > 0.95);
  // A circuit from Pitcairn is Pitcairn's own traffic: carried, in either order.
  ev("S.biz.push({id:'p1',type:'l2vpn',city:'lon',city2:'pcn',bw:2,rate:1,reqs:[],latMax:null,route:'normal',name:'p1',mood:100,since:0,sites:null},{id:'p2',type:'hft',city:'pcn',city2:'lon',bw:2,rate:1,reqs:[],latMax:null,route:'fast',name:'p2',mood:100,since:0,sites:null});compute()");
  assert.equal(ev('R.l2.p1'), 2);
  assert.equal(ev('R.l2.p2'), 2);
  assert.ok(ev("R.ef['pie:bh:pcn'].eg['l2:p1']") > 0 && ev("R.ef['pie:bh:pcn'].eg['l2:p2']") > 0);
  assert.ok(ev('R.l2lat.p1') > bh(ev).ms, 'and pays the orbit latency');
  assert.deepEqual(errors, []);
});

test('backhaul goes when the sky does: safe mode, a storm, no lasers, no landing rights, a spat, a backhoe', () => {
  const { ev, errors } = load();
  world(ev);
  const cut = (setup, why, msg) => {
    ev(`${setup};compute()`);
    const b = bh(ev);
    assert.ok(!b || !(b.cap > 0), `${msg}: still backhauling`);
    if (why) assert.equal(b.why, why, msg);
    assert.ok(ev("sfOf(R,'pcn')") < 0.01, `${msg}: Pitcairn is cut off again`);
    assert.equal(ev("Object.keys(R.ef).some(k=>k==='pie:bh:pcn')"), false);
  };
  const back = (setup) => { ev(`${setup};compute()`); assert.ok(bh(ev).cap > 0, `back after ${setup}`); };
  cut('S.pie.safe=true', 'nocrust', 'safe mode');
  assert.equal(st(ev), 'nocrust');
  back('S.pie.safe=false');
  cut('S.pie.crusts.short.down=S.day+5', 'nocrust', 'crust down');
  back('delete S.pie.crusts.short.down');
  cut("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}]", 'nolas', 'no lasers and no dish within 1,000 km');
  back("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}]");
  // Landing rights: without New Zealand's it lands in New York; without any on the backbone it has nowhere to go.
  ev("delete S.pie.lic.NZ;compute()");
  assert.equal(bh(ev).land, 'nyc');
  cut("delete S.pie.lic.US;delete S.pie.lic.GB", 'noland', 'no landing dish');
  back("for(const c of ['NZ','US','GB'])S.pie.lic[c]={state:'ok',until:1e6}");
  cut("delete S.pie.lic.PN", null, 'no landing rights on Pitcairn');
  back("S.pie.lic.PN={state:'ok',until:1e6}");
  // Spats: data stays home (Pitcairn has no other dish), not over my airspace (avoid New Zealand's).
  cut("S.pie.spat.home={st:'on',cc:'PN',ask:S.day,until:S.day+90,c:0}", 'spat', 'data stays home');
  back('delete S.pie.spat.home');
  ev("S.pie.spat.air={st:'on',cc:'PN',cc2:'NZ',ask:S.day,until:S.day+90,c:0};compute()");
  assert.equal(bh(ev).land, 'nyc', 'not over my airspace: lands in New York instead');
  ev('delete S.pie.spat.air');
  cut("S.pie.dishes.find(x=>x.city==='pcn').down=S.day+3", null, 'a backhoe at the dish');
  assert.equal(st(ev), 'down');
  back("S.pie.dishes.find(x=>x.city==='pcn').down=0");
  assert.deepEqual(errors, []);
});

test('bent pipe: a cut-off town within 1,000 km lands without lasers', () => {
  const { ev, errors } = load();
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;for(const c of ['syd','mel','cbr'])if(!S.pops[c])ACT.buildPop({city:c});S.links=[{id:'sm',a:'syd',b:'mel',kind:'wave',tier:3,km:710,sub:false,cut:0,mo:1}];ACT.buyTransit({city:'syd',net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['syd','cbr']){ACT.pieDish({city:c});}S.pie.lic.AU={state:'ok',until:1e6};S.pops.cbr.bb={d:3};S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];compute()");
  const b = bh(ev, 'cbr');
  assert.equal(b.land, 'syd');
  assert.equal(b.las, false);
  assert.ok(b.cap > 0 && b.g > 2.5, `${b.g} of ${b.cap}`);
  assert.deepEqual(J(ev, "R.pie.flows.find(f=>f.id==='bh:cbr').hops").map((h) => h.k), ['up', 'down']);
  assert.ok(ev('R.citySrv.cbr/R.cityDem.cbr') > 0.9);
  assert.deepEqual(errors, []);
});

test("a cut-off dish says 'backhaul' or 'isl', even with its own terminals (no more 'ok' by mistake)", () => {
  const { ev, errors } = load();
  world(ev, { las: false });
  ev("S.biz.push({id:'pz',type:'pizza',city:'pcn',city2:null,bw:5,rate:BIZ_T.pizza.rate,reqs:[],latMax:null,route:'normal',name:'pz',mood:100,since:0,sites:null});compute()");
  assert.equal(ev('R.pie.gs.pz'), 'pcn', 'the home lands on the island dish');
  assert.ok(ev("R.pie.dish.find(d=>d.city==='pcn').used") > 0, 'which carries its terminal');
  assert.equal(st(ev), 'isl', 'cut off, no lasers: not ok');
  assert.match(ev("pieDishWhy(R.pie.dish.find(d=>d.city==='pcn'))"), /cut off from your backbone/);
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
  assert.equal(st(ev), 'backhaul');
  assert.ok(ev('R.pie.sf.pz') > 0.3, 'and the home now reaches the internet through the backhaul');
  assert.ok(ev("R.pie.dish.find(d=>d.city==='pcn').term") > 0);
  assert.deepEqual(errors, []);
});

test('the Dishes tab\'s load view shows backhaul at 360 px, why it is missing, and taps highlight it on the globe', () => {
  const { dom, ev, errors } = load();
  ev('window.innerWidth=360');
  world(ev, { d: 300 });
  ev("S.pie.dishes.find(x=>x.city==='pcn').ant=2;compute();UI.pieTab='dish';UI.pieDv='load';ACT.pieOpen()");
  try {
  const d = doc(dom);
  const card = () => d.querySelector('#modalCard');
  let txt = card().textContent.replace(/\s+/g, ' ');
  assert.match(txt, /Backhaul /);
  const row = card().querySelector('.pft-row[data-fid="bh:pcn"]');
  assert.ok(row, 'a backhaul row');
  assert.match(row.textContent.replace(/\s+/g, ' '), /Backhaul for Adamstown.*40\.0 Gbps of 40\.0 Gbps · lands at Auckland · \+2\d ms/);
  assert.ok(row.parentNode.querySelector('.bar.bad'), 'a full pipe shows red');
  assert.match(txt, /The pipe is full: lay fiber to Adamstown/);
  assert.ok([...card().querySelectorAll('.pie-dr .mt')].some((m) => /Terminals .* · backhaul .* · transit .* · of /.test(m.title)), 'the breakdown sits in the row\'s tooltip');
  assert.match(txt, /backhauls its own town through orbit/);
  assert.equal(/style="[^"]*width:\s*\d{3,}px/.test(card().innerHTML), false, 'no fixed widths');
  row.click();
  assert.equal(ev('UI.pieHi'), 'bh:pcn');
  assert.equal(card().querySelector('.pft-row.on').dataset.fid, 'bh:pcn');
  const g = J(ev, 'pieGlobeData()');
  const f = g.flows.find((x) => x.id === 'bh:pcn');
  assert.deepEqual([f.k, f.pts], ['b', ['pcn', 'akl']]);
  assert.equal(g.hi, 'bh:pcn');
  ev("const cv=document.createElement('canvas');document.body.appendChild(cv);pieGlobeOpen(cv,pieGlobeData)");
  assert.equal(ev('pgFrame(1000,true)'), true);
  assert.equal(ev('PG.fl[0].id'), 'bh:pcn', 'drawn on top');
  assert.equal(ev('PG.fl[0].sky'), true, 'an arc through the sky');
  ev('pieGlobeClose()');
  // In safe mode the sky is empty and the checklist says why Pitcairn has no backhaul.
  ev("UI.pieHi=null;S.pie.safe=true;compute();ACT.pieTab({t:'dish'})");
  txt = card().textContent.replace(/\s+/g, ' ');
  ev("ACT.pieTab({t:'home'})");
  txt += ' ' + card().textContent.replace(/\s+/g, ' ');
  assert.match(txt, /Why is my sky empty\?/);
  assert.match(txt, /Backhaul for Adamstown – no baked crust overhead|Backhaul for Adamstown.*no baked crust overhead/);
  const ck = Object.fromEntries([...card().querySelectorAll('.pft-ck li')].map((li) => [li.dataset.k, li.className]));
  assert.equal(ck.backhaul, 'off');
  assert.match(txt, /Adamstown has no backhaul: no baked crust overhead\./);
  } finally { ev('closeModal()'); }
  assert.deepEqual(errors, []);
});

test('the traceroute to and from a cut-off POP shows the orbit hops', () => {
  const { dom, ev, errors } = load();
  world(ev);
  ev("traceModal('pcn','net:ggl')");
  const d = doc(dom);
  let pre = d.querySelector('#modalCard pre').textContent;
  assert.match(pre, /↑ uplink at Adamstown \(Shortcrust \(550 km\)\)/);
  assert.match(pre, /laser across space 5,\d{3} km/);
  assert.match(pre, /↓ downlink at Auckland/);
  assert.doesNotMatch(pre, /\* \* \*/);
  assert.match(d.querySelector('#modalCard .note').textContent, /Adamstown has no fiber to your backbone, so it goes through orbit and lands at Auckland \(\+\d+ ms round trip\)/);
  ev("traceModal('lon','city:pcn')");
  pre = d.querySelector('#modalCard pre').textContent;
  assert.match(pre, /↑ uplink at Auckland/);
  assert.match(pre, /↓ downlink at Adamstown/);
  // Between two POPs on the backbone the trace never takes the backhaul.
  ev("traceModal('lon','city:akl')");
  assert.doesNotMatch(d.querySelector('#modalCard pre').textContent, /uplink|downlink/);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('saves without pies, and pie saves whose POPs are all connected, route as before', () => {
  const { ev, errors } = load();
  const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  ev(`S=migrate(JSON.parse(${lit(save)}));compute()`);
  assert.equal(ev('S.pie'), null);
  const out = () => ev("JSON.stringify([R.served,R.demand,R.egT,R.load,R.l2,R.l2lat,R.citySrv])");
  const a = out();
  // A rocket company with a baked, lasered crust and dishes at three connected POPs: nothing to backhaul, nothing moves.
  ev("window.__rl=0;const o=pieRelink;pieRelink=function(){__rl++;return o.apply(this,arguments);};S.pieV=1;pieInit();S.pie.co={name:'X'};const ps=Object.keys(S.pops).filter(popUp).slice(0,6);for(const c of ps){S.pie.dishes.push({id:'d'+c,city:c,ant:PIE_ANT_MAX,down:0});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
  // (the fixture has POPs off its backbone: keep only the dishes on it)
  ev("const isl=new Set(R.pie.isl);S.pie.dishes=S.pie.dishes.filter(x=>!isl.has(x.city));__rl=0;compute()");
  assert.ok(ev('S.pie.dishes.length') >= 1);
  assert.deepEqual(J(ev, 'R.pie.isl'), []);
  assert.deepEqual(J(ev, 'R.pie.bh'), []);
  assert.equal(ev('__rl'), 0, 'the backhaul pass never runs');
  const b = JSON.parse(out()), a0 = JSON.parse(a);
  assert.deepEqual([b[0], b[1], b[2], b[3], b[6]], [a0[0], a0[1], a0[2], a0[3], a0[6]]);
  assert.deepEqual(errors, []);
});

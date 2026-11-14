// Pie in the Sky: what traffic rides the sky (R.pie flows, crust and dish numbers in 35-pie-paths.js), the Traffic tab
// (93-ui/86-pie-traffic.js), traffic on the globe and the orbit traceroute. Seeded; state is set directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// London, New York and Frankfurt on one backbone, a company, 16-antenna dishes with landing rights at each.
const world = (ev, opt = {}) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc','fra'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'lf',a:'lon',b:'fra',kind:'wave',tier:3,km:640,sub:false,cut:0,mo:1});for(const c of ['lon','nyc','fra'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['lon','nyc','fra']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX");
  ev(`S.pie.crusts.short.cohorts=[{n:${opt.n || 'CRUSTS.short.full'},day:S.day,las:${opt.las !== false}}];compute()`);
};
const circuit = (ev, id, a, b, bw = 5) => ev(`S.biz.push({id:'${id}',type:'hft',city:'${a}',city2:'${b}',bw:${bw},rate:1000,reqs:[],latMax:null,route:'fast',name:'Circuit ${id}',mood:100,since:0,sites:null});compute()`);
const term = (ev, id, city, type = 'pizza', bw = 50) => ev(`S.biz.push({id:'${id}',type:'${type}',city:'${city}',city2:null,bw:${bw},rate:BIZ_T.${type}.rate,reqs:[],latMax:null,route:'normal',name:'Home ${id}',mood:100,since:0,sites:null});compute()`);
const pie = (ev) => JSON.parse(ev('JSON.stringify(R.pie)'));
const doc = (dom) => dom.window.document;

test('R.pie lists every flow, and crust and dish numbers add up', () => {
  const { ev, errors } = load();
  world(ev);
  circuit(ev, 'hft1', 'fra', 'nyc');
  term(ev, 'pz', 'pcn');
  term(ev, 'bt', 'pcn', 'boat', 100);
  const P = pie(ev);
  const c = P.flows.find((f) => f.id === 'hft1');
  assert.equal(c.k, 'c');
  assert.deepEqual([c.a, c.b, c.via.join('>')], ['fra', 'nyc', 'fra>nyc']);
  assert.deepEqual(c.hops.map((h) => h.k), ['up', 'las', 'down']);
  assert.ok(Math.abs(c.hops.reduce((a, h) => a + h.ms, 0) - c.ms) < 0.2, 'hops add up to the circuit latency');
  assert.equal(c.g, 5);
  assert.ok(c.rev > 0);
  const t = P.flows.find((f) => f.id === 'pz');
  assert.deepEqual([t.k, t.type, t.city], ['t', 'pizza', 'pcn']);
  assert.ok(['lon', 'nyc', 'fra'].includes(t.dish));
  assert.ok(t.g > 0 && t.g <= 50 + 1e-9);
  assert.ok(Math.abs(P.flows.reduce((a, f) => a + f.rev, 0) - P.rev) < 1e-6, 'flow revenue is orbit revenue');
  // crusts: used never above capacity, and the flows fit in what the crusts carry
  const cr = P.crust.find((x) => x.id === 'short');
  assert.equal(cr.st, 'ok');
  assert.ok(cr.used <= cr.cap + 1e-9);
  const flowG = P.flows.reduce((a, f) => a + f.g, 0);
  assert.ok(flowG <= P.crust.reduce((a, x) => a + x.cap, 0) + 1e-9);
  // dishes: terminals + transit = used, never above the antennas; the map/globe load matches
  for (const d of P.dish) {
    assert.ok(Math.abs(d.term + d.transit - d.used) < 1e-9, d.city);
    assert.ok(d.used <= d.cap + 1e-9, d.city);
    assert.ok(Math.abs(P.load[d.city] - d.u) < 1e-12);
    assert.ok(Math.abs(d.used - P.used[d.city]) < 1e-9);
  }
  assert.ok(Math.abs(P.dish.reduce((a, d) => a + d.term, 0) - Object.values(P.term).reduce((a, b) => a + b, 0)) < 1e-9);
  // the sky circuit counts on both its dishes
  assert.ok(P.dish.find((d) => d.city === 'fra').transit >= 5 - 1e-9);
  assert.ok(P.dish.find((d) => d.city === 'nyc').transit >= 5 - 1e-9);
  // fiber comparison: lazy, memoised per compute
  assert.equal(ev("Object.keys(R.pie._x.fm).length"), 0, 'nothing worked out until asked');
  const fm = ev("pieFiberMs(R.pie.flows.find(f=>f.id==='hft1'))");
  assert.ok(fm > c.ms, `fiber ${fm} ms is slower than orbit ${c.ms} ms`);
  assert.equal(ev("Object.keys(R.pie._x.fm).length"), 1);
  assert.equal(ev("JSON.stringify(R.pie).includes('_x')"), false, 'the graph stays out of JSON');
  assert.deepEqual(errors, []);
});

test('the Traffic tab fits 360 px and lists a terminal and a sky circuit; tapping a row highlights it', () => {
  const { dom, ev, errors } = load();
  ev('window.innerWidth=360');
  world(ev);
  circuit(ev, 'hft1', 'fra', 'nyc');
  term(ev, 'pz', 'pcn');
  ev("UI.pieTab=null;ACT.pieOpen()");
  const d = doc(dom);
  assert.equal(d.querySelector('#modalCard .pie-tabs [aria-pressed="true"]').textContent, ev("tr('common.overview')"), 'the overview opens first');
  const txt = d.querySelector('#modalCard').textContent;
  assert.match(txt, /In orbit now: .* of .* sellable · .*\/mo · 2 customers/);
  ev("ACT.pieTab({t:'dish'});ACT.pieDv({v:'load'})");
  assert.ok(d.querySelectorAll('#modalCard .pie-dr').length === 3, 'a row per dish in the load view');
  // who rides has a tab of its own
  ev("ACT.pieTab({t:'cust'})");
  const rows = [...d.querySelectorAll('#modalCard .pft-row')];
  assert.equal(rows.length, 2);
  const byId = Object.fromEntries(rows.map((r) => [r.dataset.fid, r.textContent.replace(/\s+/g, ' ')]));
  assert.match(byId.pz, /🏡.*Adamstown · lands at/);
  assert.match(byId.hft1, /📈.*Frankfurt → New York.*orbit \d+(\.\d)? ms vs fiber \d+(\.\d)? ms/);
  assert.match(byId.hft1, /5\.0 Gbps/);
  for (const r of rows) assert.equal(r.tagName, 'BUTTON', 'rows are buttons (44 px min-height in CSS)');
  // The sheet has no fixed widths of its own.
  assert.equal(/style="[^"]*width:\s*\d{3,}px/.test(d.querySelector('#modalCard').innerHTML), false);
  // tap: the row lights up and the globe turns to the circuit
  rows.find((r) => r.dataset.fid === 'hft1').click();
  assert.equal(ev('UI.pieHi'), 'hft1');
  assert.ok(ev('!PG.cv||(!!PG.goal&&Math.abs(PG.goal.tilt)<=60)'), 'the globe turns to it');
  ev("ACT.pieCk({v:'t'})");
  assert.deepEqual([...d.querySelectorAll('#modalCard .pft-row')].map((r) => r.dataset.fid), ['pz'], 'terminals only');
  ev("ACT.pieCk({v:''})");
  assert.equal(d.querySelector('#modalCard .pft-row.on').dataset.fid, 'hft1');
  assert.equal(ev("pieGlobeData().hi"), 'hft1');
  assert.equal(ev('JSON.stringify(S).includes("pieHi")'), false, 'the highlight is never saved');
  d.querySelector('#modalCard .pft-row.on').click();
  assert.equal(ev('UI.pieHi'), null, 'tapping again clears it');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

// Traffic lives where its things are: the overview (headline, the empty-sky checklist), the crusts, the dishes' load view.
const skyText = (ev, dom) => [['home', 'cc'], ['crust', 'cc'], ['dish', 'load']].map(([t, v]) => { ev(`UI.pieDv='${v}';ACT.pieTab({t:'${t}'})`); return doc(dom).querySelector('#modalCard').textContent; }).join(' | ');
const checks = (dom) => Object.fromEntries([...doc(dom).querySelectorAll('#modalCard .pft-ck li')].map((li) => [li.dataset.k, li.className]));

test('an empty sky says why: a half-baked crust', () => {
  const { dom, ev, errors } = load();
  ev('window.innerWidth=360');
  world(ev, { n: 'Math.floor(CRUSTS.short.full*0.39)' });
  term(ev, 'pz', 'dub');
  const txt = skyText(ev, dom);
  ev("ACT.pieTab({t:'home'})");
  assert.match(txt, /Why is my sky empty\?/);
  assert.equal(checks(dom).baked, 'off');
  assert.match(txt, /Shortcrust \(550 km\) is 39% baked; it carries traffic from 40%/);
  assert.equal(checks(dom).customers, 'on');
  ev('closeModal()');
  try {
    ev("S.pie.crusts.short.cohorts[0].n=CRUSTS.short.full/2;compute()");
    assert.match(skyText(ev, dom), /is 50% baked: half-baked, it carries 50% of its traffic, all of it from 60%/);
  } finally { ev('closeModal()'); }
  assert.deepEqual(errors, []);
});

test('an empty sky says why: no lasers, and a dish cut off from the backbone', () => {
  const { dom, ev, errors } = load();
  ev('window.innerWidth=360');
  world(ev, { las: false });
  let t0 = skyText(ev, dom);
  ev("ACT.pieTab({t:'home'})");
  let c = checks(dom);
  assert.equal(c.baked, 'on');
  assert.equal(c.dish, 'on');
  assert.equal(c.lasers, 'off');
  assert.equal(c.customers, 'off');
  assert.match(t0, /no lasers yet/);
  // Now only Sydney has a working dish, and it has no fiber to the rest.
  ev("ACT.buildPop({city:'syd'});ACT.pieDish({city:'syd'});S.pie.lic.AU={state:'ok',until:1e6};for(const x of S.pie.dishes)if(x.city!=='syd')x.down=S.day+30;compute()");
  const txt = skyText(ev, dom);
  ev("ACT.pieTab({t:'home'})");
  c = checks(dom);
  assert.equal(c.dish, 'on');
  assert.equal(c.backbone, 'off');
  assert.match(txt, /Sydney has no fiber to the rest of your network/);
  assert.match(txt, /out of action \(a backhoe\)/);
  assert.equal(JSON.parse(ev("JSON.stringify(R.pie.dish.find(d=>d.city==='syd'))")).st, 'isl');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('dish reasons: rain, jamming, landing rights and a spat', () => {
  const { ev, errors } = load();
  world(ev, { las: false });
  ev("S.inc.push({id:'r1',type:'pierain',ref:'lon',start:S.day,until:S.day+3,cost:0,msg:''});S.pie.spat.jam={st:'on',cc:'US',cc2:'CA',ask:S.day,until:S.day+9,c:1};S.pie.lic.DE={state:'sus',until:S.day+50};compute()");
  const st = Object.fromEntries(JSON.parse(ev('JSON.stringify(R.pie.dish)')).map((d) => [d.city, d.st]));
  assert.deepEqual(st, { lon: 'rain', nyc: 'jam', fra: 'spat' });
  ev("S.pie.lic.DE={state:'ok',until:S.day-1};compute()");
  assert.equal(ev("R.pie.dish.find(d=>d.city==='fra').st"), 'lic');
  assert.match(ev("pieDishWhy(R.pie.dish.find(d=>d.city==='fra'))"), /no landing rights in Germany/);
  assert.deepEqual(errors, []);
});

test('the globe draws the flows, the highlight on top, and load rings in both styles', () => {
  const { ev, errors } = load();
  world(ev);
  circuit(ev, 'hft1', 'fra', 'nyc');
  term(ev, 'pz', 'pcn');
  const g = JSON.parse(ev('JSON.stringify(pieGlobeData())'));
  assert.deepEqual(g.flows.map((f) => [f.id, f.k]).sort(), [['hft1', 'c'], ['pz', 't']]);
  assert.deepEqual(g.flows.find((f) => f.id === 'hft1').pts, ['fra', 'nyc']);
  assert.ok(g.dishes.find((d) => d.city === 'nyc').u > 0, 'per-dish load');
  ev("const cv=document.createElement('canvas');cv.id='pgT';document.body.appendChild(cv);UI.pieHi='hft1';pieGlobeOpen(cv,pieGlobeData)");
  assert.equal(ev('pgFrame(1000,true)'), true);
  assert.equal(ev('PG.fl.length'), 2);
  assert.equal(ev('PG.fl[0].id'), 'hft1', 'the highlighted flow is always kept');
  assert.ok(ev('PG.fl.find(f=>f.id==="pz").w') > ev('PG.fl.find(f=>f.id==="hft1").w') - 2, 'wider for more Gbps (the highlighted one gets 2 px more)');
  assert.ok(ev('PG.fl.every(f=>f.w<=7)'), 'capped');
  ev('pieGlobeNight(true)');
  assert.equal(ev('pgFrame(1100,true)'), true, 'night style draws too');
  ev('pieGlobeNight(false);pieGlobeClose();UI.pieHi=null');
  assert.deepEqual(errors, []);
});

test('the traceroute shows a circuit through orbit hop by hop', () => {
  const { dom, ev, errors } = load();
  world(ev);
  circuit(ev, 'hft1', 'fra', 'nyc');
  ev("traceModal('fra','sky:hft1')");
  const d = doc(dom);
  assert.ok([...d.querySelectorAll('#trTo option')].some((o) => o.value === 'sky:hft1'));
  const pre = d.querySelector('#modalCard pre').textContent;
  assert.match(pre, /↑ uplink at Frankfurt \(Shortcrust \(550 km\)\)/);
  assert.match(pre, /laser across space 6,\d{3} km/);
  assert.match(pre, /↓ downlink at New York/);
  assert.match(d.querySelector('#modalCard .note').textContent, /\d+ ms one way against \d+ ms on your fiber/);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('saves without pies: no traffic data, the same routing, and an untouched map', () => {
  const { ev, errors } = load();
  const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  ev(`S=migrate(JSON.parse(${lit(save)}));compute()`);
  assert.equal(ev('R.pie===undefined'), true);
  assert.equal(ev("trSkyList().length"), 0);
  assert.equal(ev("pieFiberMs({k:'c',id:'x'})"), Infinity);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(pieGlobeData())')), { crusts: [], dishes: [], pads: [], launches: [] });
  assert.deepEqual(errors, []);
});

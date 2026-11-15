// Orbit customers move between the NOC's customer list, Pie Control's Customers tab and the POP they land at
// (93-ui/90-pie-cross.js, 90-actions/99-pie-cross.js), and can be dropped from Pie Control. Seeded; state set directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// London and New York with a carrying crust, a full dish at each, and a home on Pitcairn that lands at one of them.
const world = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1});for(const c of ['lon','nyc'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['lon','nyc']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX");
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
  ev("S.biz.push({id:'pz',type:'pizza',city:'pcn',city2:null,bw:50,rate:BIZ_T.pizza.rate,reqs:[],latMax:null,route:'normal',name:'Home pz',mood:100,since:0,sites:null});compute()");
};
const doc = (dom) => dom.window.document;
// Pie Control's globe runs a frame loop while open: shut it, or the test never ends.
const open = [];
test.afterEach(() => { for (const p of open.splice(0)) { try { p.ev('pieGlobeClose();closeModal()'); } catch (e) {} p.dom.window.close(); } });
const start = () => { const p = load(); open.push(p); world(p.ev); return p; };

test('the NOC row links to Pie Control and the POP the customer lands at', () => {
  const { dom, ev, errors } = start();
  const L = ev("R.pie.gs.pz");
  assert.ok(['lon', 'nyc'].includes(L));
  ev("ACT.custOpen({})");
  const row = doc(dom).querySelector('#dash [data-cid="pz"]');
  assert.ok(row, 'the customer is listed');
  assert.match(row.textContent, new RegExp(`lands at ${ev(`CITY.${L}.name`)}`));
  const acts = [...row.querySelectorAll('[data-act]')].map((b) => b.dataset.act);
  assert.ok(acts.includes('pieCust') && acts.includes('piePop'), acts.join());
  ev("ACT.pieCust({id:'pz'})");
  assert.equal(doc(dom).getElementById('dash').hidden, true);
  assert.equal(ev("UI.pieTab"), 'cust');
  const on = doc(dom).querySelector('#modal .pft-row.on');
  assert.equal(on && on.dataset.fid, 'pz', 'its row is highlighted');
  const pacts = [...on.nextElementSibling.querySelectorAll('[data-act]')].map((b) => b.dataset.act);
  assert.deepEqual(pacts, ['custNoc', 'piePop', 'pieDrop']);
  assert.deepEqual(errors, []);
});

test('Open and the POP button land on the dish POP, which lists the customer', () => {
  const { dom, ev, errors } = start();
  const L = ev("R.pie.gs.pz");
  ev("ACT.custGo({id:'pz'})");
  assert.equal(ev("UI.sel.id"), L);
  const txt = doc(dom).getElementById('panel').textContent;
  assert.match(txt, /Orbit customers landing here/);
  assert.match(txt, /Home pz/);
  ev("ACT.pieCust({id:'pz'})");
  ev(`ACT.piePop({city:'${L}'})`);
  assert.equal(doc(dom).getElementById('modal').hidden, true);
  assert.equal(ev("UI.tab"), 'cust');
  ev("ACT.custNoc({id:'pz'})");
  assert.equal(doc(dom).getElementById('dash').hidden, false);
  assert.ok(doc(dom).querySelector('#dash .row.hi[data-cid="pz"]'), 'the NOC row is highlighted');
  assert.deepEqual(errors, []);
});

test('Pie Control drops a customer only on the second tap', () => {
  const { ev, errors } = start();
  ev("ACT.pieCust({id:'pz'})");
  ev("ACT.pieDrop({id:'pz'})");
  assert.equal(ev("S.biz.some(b=>b.id==='pz')"), true);
  assert.equal(ev("document.querySelector('#modal .pft-row.on + .pft-acts [data-act=pieDrop]').textContent"), 'Really drop?');
  ev("ACT.pieDrop({id:'pz'})");
  assert.equal(ev("S.biz.some(b=>b.id==='pz')"), false);
  assert.equal(ev("UI.pieHi"), null);
  assert.deepEqual(errors, []);
});

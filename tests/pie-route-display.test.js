// A circuit routed through orbit shows its sky leg where its path is shown and moved (#379): the customer row in the
// city panel and the "Move to another path" dialog (60-features/37-customer-paths.js). Seeded; state is set directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// London, New York and Frankfurt on one backbone (Frankfurt reaches New York only through London), a lasered crust and
// a dish with landing rights at each POP.
const world = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc','fra'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'lf',a:'lon',b:'fra',kind:'wave',tier:3,km:640,sub:false,cut:0,mo:1});for(const c of ['lon','nyc','fra'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['lon','nyc','fra']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX");
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
  ev("S.biz.push({id:'h1',type:'hft',city:'fra',city2:'nyc',bw:5,rate:1000,reqs:[],latMax:null,route:'fast',name:'Quick Trades',mood:100,since:0,sites:null});compute()");
};
const skyOf = (ev) => ev("Object.keys(R.ef).filter(k=>k.startsWith('pie:')&&R.ef[k].eg['l2:h1']>0).length>0");

test('a circuit through orbit shows the sky leg, and the fiber path is offered to move it to', () => {
  const { dom, ev, errors } = load();
  ev('window.innerWidth=360');
  world(ev);
  assert.equal(skyOf(ev), true, 'routing sends it through space');
  const crust = ev("tr(CRUSTS.short.n)");
  const sky = `Frankfurt → ${crust} in orbit → New York`;
  // the customer row in the panels
  const row = ev("pathCtl(S.biz.find(b=>b.id==='h1'))");
  assert.ok(row.includes(`Through orbit: ${sky}`), row);
  // the dialog: "Now on" is the orbit path, not the fiber one routing does not use
  ev("ACT.pathOpen({id:'h1'})");
  const card = dom.window.document.querySelector('#modalCard');
  const now = [...card.querySelectorAll('.kv')].find((k) => k.textContent.startsWith('Now on'));
  assert.equal(now.querySelector('b').textContent, sky);
  // its latency is routing's, the orbit hops included
  assert.match(card.textContent, new RegExp(`${ev("R.l2lat.h1").toFixed(1).replace('.', '\\.')} ms one-way`));
  assert.match(card.textContent, /Orbit is faster than any fiber path here/);
  // the fiber path is a choice of its own, and pinning it keeps the circuit on fiber
  const mv = [...card.querySelectorAll('[data-act="pathPin"]')].map((b) => JSON.parse(b.dataset.args).via);
  assert.deepEqual(mv, ['fra,lon,nyc']);
  ev("ACT.pathPin({id:'h1',via:'fra,lon,nyc'})");
  assert.equal(skyOf(ev), false, 'pinned to fiber: off orbit');
  const pinned = ev("pathCtl(S.biz.find(b=>b.id==='h1'))");
  assert.ok(pinned.includes('Frankfurt → London → New York') && !pinned.includes('Through orbit'), pinned);
  // letting routing choose again puts it back in orbit, and the panel says so again
  ev("ACT.pathAuto({id:'h1'})");
  assert.equal(skyOf(ev), true);
  assert.ok(ev("pathCtl(S.biz.find(b=>b.id==='h1'))").includes('Through orbit'));
  assert.deepEqual(errors, []);
});

test('a circuit on fiber shows no orbit', () => {
  const { ev, errors } = load();
  world(ev);
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];compute()");
  assert.equal(skyOf(ev), false);
  assert.ok(!ev("pathCtl(S.biz.find(b=>b.id==='h1'))").includes('orbit'));
  ev("ACT.pathOpen({id:'h1'})");
  assert.ok(ev("document.querySelector('#modalCard').textContent").includes('Now onFrankfurt → London → New York'));
  assert.deepEqual(errors, []);
});

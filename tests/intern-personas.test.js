// The three interns run the same orders the same way, at the same salary; each is better at one part of the job.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const BASE = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=6;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});S.pops.fra.rgen=1;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()";
function game(t, id, extra) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  if (extra) h.ev(extra);
  h.ev(`ACT.opsHire({id:'${id}'});S.ops.floor=0;S.ops.cap={};closeModal()`);
  return h;
}

test('the same salary, and each says what they are best at, in the hiring list and once hired', t => {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  assert.ok(h.ev("Object.values(INTERNS).every(I=>I.g)"));
  h.dom.window.innerWidth = 360;
  h.ev('opsModal()');
  const txt = h.ev("document.getElementById('modalCard').textContent");
  for (const s of [/Best at peering/, /Best at maintenance/, /Best at planning ahead/]) assert.match(txt, s);
  assert.equal(h.ev("document.querySelectorAll('#modalCard [data-act=opsHire]').length"), 3);
  assert.equal(h.ev("[...document.querySelectorAll('#modalCard [data-act=opsHire]')].every(b=>b.textContent.includes(fmt$(INTERN_MO)))"), true, 'one salary for all');
  h.ev("ACT.opsHire({id:'tracy'})");
  assert.match(h.ev("document.getElementById('modalCard').textContent"), /Best at planning ahead/);
  assert.deepEqual(h.errors, []);
});

test('Annie peers every day and orders PNIs twice a week; the others weekly', t => {
  const ix = "ACT.buyIx({city:'fra',tier:0,signed:true});compute()";
  for (const [id, want] of [['annie', true], ['kevin', false], ['tracy', false]]) {
    const { ev, errors } = game(t, id, ix);
    ev("S.ops.on.ix=true;S.day=15;opsDay(S.day)");
    assert.equal(ev('Object.keys(S.rs).length>0'), want, `${id} on a Tuesday`);
    // How often the PNI order looks for networks to order from, over one week.
    ev("S.ops.on.ix=false;S.ops.on.pni=true;window.__pb=0;pniBatch=function(){__pb++;return null;};for(let d=21;d<28;d++){S.day=d;opsDay(d);}");
    assert.equal(ev('__pb'), want ? 2 : 1, `${id}: PNI rounds a week`);
    assert.deepEqual(errors, []);
  }
});

test('Kevin never fat-fingers, even on the unluckiest roll', t => {
  for (const [id, want] of [['kevin', false], ['annie', true], ['tracy', true]]) {
    const { ev, errors } = game(t, id);
    ev("S.rules=makeRules('bgp');window.__r=Math.random;Math.random=()=>0;opsDay(S.day);Math.random=__r");
    assert.equal(ev('S.ops.log.some(e=>e.f!==undefined)'), want, id);
    assert.deepEqual(errors, []);
  }
});

test('Kevin swaps two line systems a night, the others one', t => {
  const fibers = "for(const c of ['ams','par'])ACT.buildPop({city:c});for(const c of ['fra','ams','par']){S.pops[c].rgen=mainRG(3);S.pops[c].routers=2;}" +
    "S.links=[['f1','fra','ams'],['f2','ams','par'],['f3','par','fra'],['f4','fra','ams']].map(([id,a,b])=>({id,a,b,kind:'df',own:true,sys:'lite',ch:['zr4'],km:450,trench:id,ready:0,cut:0,mo:1,pairs:1}));compute()";
  for (const [id, want] of [['kevin', 2], ['annie', 1], ['tracy', 1]]) {
    const { ev, errors } = game(t, id, fibers);
    ev("S.ops.on.optup=true;S.ops.p.optup={sys:'roadm'};opsDay(S.day)");
    assert.equal(ev("S.links.filter(l=>l.sys==='roadm').length"), want, id);
    assert.deepEqual(errors, []);
  }
});

test('Tracy buys a little before it runs hot; at the same price as anyone', t => {
  // A POP at 75% with the order set to 80%: Tracy sees 82.5% and adds a router; the others wait.
  for (const [id, want] of [['tracy', 2], ['kevin', 1], ['annie', 1]]) {
    const { ev, errors } = game(t, id);
    ev("S.ops.on.routers=true;S.ops.p.routers={at:80,how:'add'};compute();R.nodeLoad.fra=R.nodeCap.fra*0.75");
    const cost = ev("routerCost(S.pops.fra.rgen||0,S.pops.fra.routers||1)"), c0 = ev('S.cash');
    ev('opsDay(S.day)');
    assert.equal(ev('S.pops.fra.routers'), want, id);
    if (want === 2) assert.equal(c0 - ev('S.cash'), cost, 'what Add router costs');
    assert.deepEqual(errors, []);
  }
  // Transit too: a 30-day peak that the headroom just covers, but not with 10% more.
  for (const [id, grew] of [['tracy', true], ['kevin', false]]) {
    const { ev, errors } = game(t, id);
    ev("S.ops.on.transit=true;S.ops.p.transit={x:1.25,prov:'have'};const t=S.transit[0];t.hist=[lagCap(PORT[t.tier].g,t.n)/1.25/1.05]");
    const n0 = ev('JSON.stringify(S.transit.map(t=>[t.tier,t.n||1]))');
    ev('opsDay(S.day)');
    assert.equal(ev('JSON.stringify(S.transit.map(t=>[t.tier,t.n||1]))') !== n0, grew, id);
    assert.deepEqual(errors, []);
  }
});

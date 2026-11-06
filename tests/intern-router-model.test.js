// The intern standardizes routers on a chosen model within the budget, and every setting in the Ops sheet is a list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt (one router, broadband), Amsterdam (two routers, broadband) and Paris (one router, nothing on it yet),
// all on the Edge Lord 400. Change Freeze: no fat fingers.
const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});S.pops.fra.rgen=1;ACT.buyTransit({city:'fra',net:'cog',tier:1});" +
  "for(const c of ['ams','par'])ACT.buildPop({city:c});ACT.launchBB({city:'ams'});S.pops.ams.rgen=1;S.pops.ams.routers=2;S.pops.par.rgen=1;compute();" +
  "ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal()";
const MODEL = "RG.findIndex(r=>r.n==='Arrrhipster 7800R')";
function game(t) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  return h;
}
const gens = ev => JSON.parse(ev("JSON.stringify(['fra','ams','par'].map(c=>S.pops[c].rgen))"));

test('a chosen model: every POP on a smaller one is swapped to it, at the price of the swap, never as an outage', t => {
  const { ev, errors } = game(t);
  const m = ev(MODEL);
  assert.ok(m > 0 && ev(`rgOpen(${m})`), 'the model is unlocked at level 3');
  ev(`S.ops.on.routers=true;S.ops.p.routers={at:90,how:'auto',model:${m}};S.ops.cap.routers=0;compute();for(const c in R.nodeLoad)R.nodeLoad[c]=0`);
  const want = ev(`swapCost('ams',${m})+swapCost('par',${m})`), c0 = ev('S.cash');
  ev('opsDay(S.day)');
  assert.deepEqual(gens(ev), [1, m, m], 'Amsterdam (a second router) and Paris (no traffic yet) are swapped; Frankfurt has one busy router, so no');
  assert.equal(c0 - ev('S.cash'), want, 'the shift paid exactly what the two swaps cost');
  assert.equal(ev("S.inc.some(i=>i.type==='maint')"), false, 'no outage');
  assert.match(ev('opsLine(S.ops.log[0])'), /Amsterdam ⇧800G/);
  // Frankfurt gets its turn once it has a second router.
  ev('S.pops.fra.routers=2;S.day++;compute();opsDay(S.day)');
  assert.deepEqual(gens(ev), [m, m, m]);
  // Busy POPs on the chosen model get more routers, never a swap to another one.
  ev("S.ops.p.routers.how='swap';S.day++;compute();R.nodeLoad.ams=R.nodeCap.ams*0.95;opsDay(S.day)");
  assert.equal(ev('S.pops.ams.rgen'), m, 'no swap away from the chosen model');
  ev("S.ops.p.routers.how='add';S.day++;compute();R.nodeLoad.ams=R.nodeCap.ams*0.95;opsDay(S.day)");
  assert.equal(ev('S.pops.ams.routers'), 3, 'a busy POP gets a third router');
  assert.deepEqual(errors, []);
});

test('the budget decides how far it gets, the busiest POP first; a smaller model is never a downgrade', t => {
  const { ev, errors } = game(t);
  const m = ev(MODEL);
  ev(`S.ops.on.routers=true;S.ops.p.routers={at:90,how:'auto',model:${m}};compute();for(const c in R.nodeLoad)R.nodeLoad[c]=0;R.nodeLoad.par=R.nodeCap.par*0.5`);
  // A budget for one swap: Paris is the busier, so it goes first and Amsterdam waits for next month.
  const one = ev(`swapCost('par',${m})`);
  ev(`S.ops.cap.routers=OPS_CAPS.filter(c=>c>=${one}).sort((a,b)=>a-b)[0]`);
  assert.ok(ev('S.ops.cap.routers') < one + ev(`swapCost('ams',${m})`), 'the budget is too small for both');
  ev('opsDay(S.day)');
  assert.deepEqual(gens(ev), [1, 1, m], 'Paris first');
  assert.ok(ev("S.ops.log[0].r.some(x=>x[0]==='broke')"), 'the log says the budget ran out');
  // Next month, a new budget: Amsterdam.
  ev('{const m0=monthIdx(S.day);while(monthIdx(S.day)===m0)S.day++;}compute();for(const c in R.nodeLoad)R.nodeLoad[c]=0;opsDay(S.day)');
  assert.deepEqual(gens(ev), [1, m, m]);
  // Choosing a smaller model swaps nothing back.
  ev("S.ops.cap.routers=0;S.ops.p.routers.model=RG.findIndex(r=>r.n==='Edge Lord 400');S.day++;compute();opsDay(S.day)");
  assert.deepEqual(gens(ev), [1, m, m]);
  assert.deepEqual(errors, []);
});

test('the setting is saved; an unknown model falls back to the next generation', t => {
  const { ev, errors } = game(t);
  const back = v => ev(`(()=>{const s=JSON.parse(JSON.stringify(S));s.ops.p.routers=${v};sanitize(s);return JSON.stringify(s.ops.p.routers);})()`);
  assert.deepEqual(JSON.parse(back(`{model:${ev(MODEL)}}`)), { model: ev(MODEL) });
  assert.deepEqual(JSON.parse(back('{model:999}')), {});
  assert.deepEqual(JSON.parse(back("{model:'7'}")), {});
  assert.deepEqual(JSON.parse(back('undefined')), {}, 'an old save without it');
  assert.equal(ev("opsP('routers','model')"), 'next');
  assert.deepEqual(errors, []);
});

test('every setting in the Ops sheet is a list to pick from, on a phone too', t => {
  const { ev, dom, errors } = game(t);
  dom.window.innerWidth = 360;
  const doc = dom.window.document;
  ev("for(const k in S.ops.on)S.ops.on[k]=true;ACT.phoneTab({t:'noc'})");
  doc.querySelector('#leftBody [data-act="opsOpen"]').click();
  assert.equal(doc.querySelectorAll('#modalCard [data-act="opsParam"],#modalCard [data-act="opsCap"],#modalCard [data-act="opsFloor"]').length, 0, 'no buttons that step through values');
  const sel = (act, args) => [...doc.querySelectorAll(`#modalCard select[data-chg="${act}"]`)].find(s => s.dataset.args === JSON.stringify(args));
  const pick = (s, text) => {
    const o = [...s.options].find(o => o.textContent === text);
    assert.ok(o, `${text} is on the list`);
    s.value = o.value;
    s.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  };
  // Every setting of every order, every budget and the floor.
  const n = ev('OPS.reduce((a,d)=>a+Object.keys(d.p).length+(d.cap?1:0),0)+1');
  assert.equal(doc.querySelectorAll('#modalCard .ops-p select').length, n);
  // The model list: the next generation, then the models you can buy, smallest first.
  const model = sel('opsParam', { k: 'routers', p: 'model' });
  assert.ok(model, 'the routers order has a model list');
  assert.equal(model.options[0].textContent, 'Next generation, when busy');
  assert.ok([...model.options].some(o => o.textContent === 'Arrrhipster 7800R'));
  assert.ok(![...model.options].some(o => o.textContent === 'Absolute Unit 3.2T'), 'only models unlocked at your level');
  pick(model, 'Arrrhipster 7800R');
  assert.equal(ev("opsP('routers','model')"), ev(MODEL));
  assert.equal(doc.activeElement && doc.activeElement.dataset.args, JSON.stringify({ k: 'routers', p: 'model' }), 'the keyboard stays on the list');
  pick(sel('opsParam', { k: 'transit', p: 'prov' }), 'Already connected');
  assert.equal(ev("opsP('transit','prov')"), 'have');
  pick(sel('opsCap', { k: 'routers' }), 'no limit');
  assert.equal(ev("opsCap('routers')"), 0);
  pick(sel('opsFloor', {}), ev('fmt$(1e6)'));
  assert.equal(ev('S.ops.floor'), 1e6);
  // A value from nowhere changes nothing; the MCP tools still step without a value.
  ev("ACT.opsParam({k:'routers',p:'model',v:'99'});ACT.opsCap({k:'routers',v:'-1'});ACT.opsFloor({v:'x'})");
  assert.deepEqual([ev("opsP('routers','model')"), ev("opsCap('routers')"), ev('S.ops.floor')], [ev(MODEL), 0, 1e6]);
  ev("ACT.opsParam({k:'routers',p:'how'})");
  assert.equal(ev("opsP('routers','how')"), 'add');
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev) {
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;compute()");
}

test('global PNIs cover every eligible network and shared POP, including the long tail, in one transaction', () => {
  const { dom, ev, errors } = load();
  setup(ev);
  ev(`ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;
    S.pni.push({id:'small',net:'cfl',city:'fra',tier:0,n:2,site:'ab',pref:'high'},
      {id:'big',net:'drz',city:'ams',tier:2},
      {id:'pending',net:'nfx',city:'fra',tier:1,ready:S.day+30});
    compute();for(const n of NETS)R.demTo[n.id]=1e4`);
  const before = ev('JSON.stringify(S)');
  const batch = JSON.parse(ev('JSON.stringify(pniBatch(null,1))'));
  assert.equal(ev('JSON.stringify(S)'), before, 'global preview changes no game state');
  assert.ok(batch.orders.some(q => q.net === 'cfl' && q.city === 'fra' && q.ex));
  assert.ok(batch.orders.some(q => q.net === 'cfl' && q.city === 'ams' && !q.ex));
  assert.ok(batch.orders.some(q => ev(`NET['${q.net}'].tail`)), 'small networks are included');
  assert.equal(batch.orders.some(q => q.net === 'drz' && q.city === 'ams'), false, 'no downgrade');
  assert.equal(batch.orders.some(q => q.net === 'nfx' && q.city === 'fra'), false, 'keep pending orders');
  const cash = ev('S.cash');
  ev("const originalAfter=after;window.after=()=>{window.afterCount=(window.afterCount||0)+1;originalAfter()};ACT.pniAll({net:null,tier:1})");
  assert.equal(ev('window.afterCount'), 1);
  assert.equal(ev('S.cash'), cash - batch.cost);
  assert.equal(ev('S.pni.length'), 3 + batch.orders.filter(q => !q.ex).length);
  assert.equal(ev('new Set(S.pni.map(p=>p.net+"@"+p.city)).size'), ev('S.pni.length'));
  assert.equal(ev("S.pni.every(p=>S.pops[p.city]&&NET[p.net].pops.includes(p.city))"), true);
  assert.equal(ev("S.pni.find(p=>p.id==='small').up.n"), 2, 'LAG members stay together');
  assert.equal(ev("S.pni.find(p=>p.id==='small').pref"), 'high');
  assert.equal(ev("S.pni.find(p=>p.id==='big').tier"), 2);
  assert.equal(ev('Object.keys(S.pops).every(c=>portsUsed(c)<=portsMax(c))'), true);
  ev('S=migrate(JSON.parse(JSON.stringify(packSave(S))));compute()');
  assert.equal(ev('S.pni.length'), 3 + batch.orders.filter(q => !q.ex).length);
  assert.equal(ev("S.pni.find(p=>p.id==='small').up.tier"), 1);
  const count = ev('S.pni.length');
  ev('ACT.pniAll({net:null,tier:1})');
  assert.equal(ev('S.cash'), cash - batch.cost, 'repeat clicks spend nothing');
  assert.equal(ev('S.pni.length'), count);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('global PNIs share the available router ports, including four 10G breakouts per slot', () => {
  for (const [tier, count] of [[1, 1], [0, 4]]) {
    const { dom, ev, errors } = load();
    setup(ev);
    ev("S.pops.fra.rgen=0;S.caches=Array.from({length:7},()=>({id:uid(),city:'fra',net:'cfl'}));compute()");
    assert.equal(ev(`pniBatch(null,${tier}).orders.length`), count);
    assert.ok(ev(`pniBatch(null,${tier}).blocked.some(q=>/No free router ports/.test(q.why))`));
    ev(`ACT.pniAll({net:null,tier:${tier}})`);
    assert.equal(ev('S.pni.length'), count);
    assert.equal(ev("portsUsed('fra')"), 8);
    const cash = ev('S.cash');
    ev(`ACT.pniAll({net:null,tier:${tier}})`);
    assert.equal(ev('S.cash'), cash);
    assert.deepEqual(errors, []);
    dom.window.close();
  }
});

test('global planning reserves ports for pending speed and LAG augments without mutating the save', () => {
  for (const [tier, n] of [[1, 1], [0, 4]]) {
    const { dom, ev, errors } = load();
    setup(ev);
    ev(`S.pops.fra.rgen=0;S.caches=Array.from({length:7},()=>({id:uid(),city:'fra',net:'cfl'}));
      S.pni=[{id:'pending',city:'fra',net:'cfl',tier:0,n:1,up:{tier:${tier},n:${n},ready:S.day+30}}];compute()`);
    const state = ev('JSON.stringify(S)');
    assert.equal(ev('pniBatch(null,0).orders.length'), 0);
    assert.equal(ev('pniBatch(null,1).orders.length'), 0);
    assert.equal(ev('JSON.stringify(S)'), state);
    const cash = ev('S.cash');
    ev('ACT.pniAll({net:null,tier:1})');
    assert.equal(ev('S.pni.length'), 1);
    assert.equal(ev('S.cash'), cash);
    assert.deepEqual(errors, []);
    dom.window.close();
  }
});

test('global PNIs require the full budget and reject unsupported sizes and an empty POP list', () => {
  const { dom, ev, errors } = load();
  setup(ev);
  ev('S.cash=pniBatch(null,1).cost-1;ACT.pniAllOpen({net:null})');
  const cash = ev('S.cash');
  assert.equal(dom.window.document.querySelector('#modalCard [data-act="pniAll"]').disabled, true);
  ev('ACT.pniAll({net:null,tier:1})');
  assert.equal(ev('S.cash'), cash);
  assert.equal(ev('S.pni.length'), 0, 'no partial purchase');
  for (const tier of [-2, -1, 0.5, 99, NaN, Infinity]) ev(`ACT.pniAll({net:null,tier:${tier}})`);
  ev('ACT.pniAll({tier:1});S.pops={};ACT.pniAllOpen({net:null})');
  assert.equal(ev('S.cash'), cash);
  assert.equal(ev('S.pni.length'), 0);
  assert.match(dom.window.document.getElementById('modalCard').textContent, /No shared POPs/);
  assert.equal(dom.window.document.querySelector('#modalCard [data-act="pniAll"]').disabled, true);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('the global batch, now in the Ops sheet, preserves scope, keyboard focus and translations on phones', () => {
  for (const lang of ['en', 'it', 'pt', 'fr', 'es']) {
    const { dom, ev, errors } = load(lang === 'en' ? {} : { lang });
    setup(ev);
    dom.window.innerWidth = 360;
    // The Traffic tab now points at the Ops sheet, where the one-off batches live.
    ev("ACT.dash();ACT.dashTab({k:'traffic'})");
    const doc = dom.window.document;
    doc.querySelector('#dashCard [data-act="opsOpen"]').click();
    const button = [...doc.querySelectorAll('#modalCard [data-act="pniAllOpen"]')].find(b => JSON.parse(b.dataset.args).net === null);
    assert.ok(button, lang);
    button.click();
    assert.equal(doc.querySelector('#modalCard h2').textContent, ev("tr('pni_all.peer_all_networks')"), lang);
    const cash = ev('S.cash');
    const select = doc.querySelector('#modalCard select');
    assert.equal([...select.options].some(o => o.value === '-1'), false, '1G is not available for all networks');
    select.focus();
    select.value = '0';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(doc.activeElement, doc.querySelector('#modalCard select'));
    const submit = doc.querySelector('#modalCard [data-act="pniAll"]');
    assert.deepEqual(JSON.parse(submit.dataset.args), { net: null, tier: 0 }, lang);
    assert.equal(submit.disabled, false, lang);
    assert.ok(doc.querySelectorAll('#modalCard details').length > 0, 'long lists are collapsed');
    assert.equal(ev('S.cash'), cash, 'preview does not buy anything');
    assert.doesNotMatch(doc.getElementById('modalCard').textContent, /pni_all\./, lang);
    const cost = ev('pniBatch(null,0).cost');
    submit.click();
    assert.equal(doc.getElementById('modal').hidden, true, lang);
    assert.equal(ev('S.cash'), cash - cost, lang);
    assert.ok(ev('new Set(S.pni.map(p=>p.net)).size') > 1, lang);
    assert.deepEqual(errors, [], lang);
    dom.window.close();
  }
});

test('bulk PNIs follow each network\'s own minimum port and lead time (pniMin, pniLead)', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;compute();for(const n of NETS)R.demTo[n.id]=1e4");
  // Ask everyone for 10G: networks that start at 100G get 100G, the rest get 10G.
  const b = JSON.parse(ev('JSON.stringify(pniBatch(null,0))'));
  const big = b.orders.filter(q => ev(`pniMin('${q.net}')`) > 0), small = b.orders.filter(q => ev(`pniMin('${q.net}')`) === 0);
  assert.ok(big.length && small.length, 'the batch has networks of both kinds');
  assert.ok(big.every(q => q.tier === ev(`pniMin('${q.net}')`)), 'never below a network\'s minimum');
  assert.ok(small.every(q => q.tier === 0));
  assert.equal(b.raised, big.length);
  assert.equal(b.blocked.some(q => /does not do/.test(q.why)), false, 'nobody is blocked for the size alone');
  // A single network still refuses a port below its minimum.
  const t1 = ev("NETS.find(n=>pniMin(n.id)>0&&n.pops.includes('fra')).id");
  const one = JSON.parse(ev(`JSON.stringify(pniBatch('${t1}',0))`));
  assert.equal(one.orders.length, 0);
  assert.ok(one.blocked.length > 0);
  // Lead times come from pniLead per network, as for a single order: big networks about a month, others 2 to 6 weeks.
  ev("const r=Math.random;Math.random=()=>0.5;ACT.pniAll({net:null,tier:0});Math.random=r");
  const placed = JSON.parse(ev('JSON.stringify(S.pni.map(p=>({net:p.net,wait:p.ready-S.day,big:pniBig(p.net)})))'));
  assert.equal(placed.length, b.orders.length);
  assert.ok(placed.some(p => p.big) && placed.some(p => !p.big));
  for (const p of placed) if (p.big) assert.equal(p.wait, 30, p.net); else assert.equal(p.wait, 14 + Math.floor(0.5 * 29), p.net);
  assert.deepEqual(errors, []);
});

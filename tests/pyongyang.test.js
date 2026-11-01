const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('Pyongyang explains its limits inside the normal city panel', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Visit','fra',{mode:'sandbox'});selectCity('pyo')");
  const panel = () => dom.window.document.getElementById('panelBody');
  const notice = () => [...panel().querySelectorAll('.scroll .note')].find(p => p.textContent.includes('Ryugyong Ding-Dong'));
  assert.ok(notice());
  assert.match(notice().textContent, /only transit provider/);
  assert.doesNotMatch(panel().textContent, /Form BGP|You could found one|grow 60% faster/);
  assert.equal(panel().querySelector('.ph + .why'), null);
  ev("ACT.buildPop({city:'pyo'});ACT.focusCity({city:'pyo'});ACT.tab({t:'peer'})");
  assert.ok(notice(), 'the owned POP uses the same padded, scrollable notice');
  ev("ACT.foundIx({city:'pyo'});ACT.cache({city:'pyo',net:'ggl'});UI.pending={a:'pyo',b:'pek'};ACT.orderDf();ACT.orderCable()");
  assert.equal(ev('!!S.myIx.pyo'), false);
  assert.equal(ev("S.caches.some(c=>c.city==='pyo')"), false);
  assert.equal(ev("S.links.some(l=>l.a==='pyo'||l.b==='pyo')"), false);
  assert.equal(ev("NETS.filter(n=>sellsAt(n,'pyo')).map(n=>n.id).join()"), 'kpt');
  assert.deepEqual(errors, []);
});

test('Pyongyang does not receive the underserved Asian market growth bonus', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Growth','fra',{mode:'sandbox'});S.cash=1e9;ACT.buildPop({city:'pyo'});for(const c of ['fra','pyo']){S.pops[c].bb={d:10};R.cityDem[c]=10;R.citySrv[c]=10;R.latF[c]=1;}R.peerShare=0;dayTick()");
  const growth = c => ev(`(S.pops.${c}.bb.d-10)/(10*(1-10/eyeP('${c}')))`);
  assert.ok(growth('pyo') > 0);
  assert.ok(Math.abs(growth('pyo') - growth('fra')) < 1e-9, 'the restricted market grows at the ordinary rate');
  assert.deepEqual(errors, []);
});

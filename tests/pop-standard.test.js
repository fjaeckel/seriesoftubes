const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const g = n => `RG.findIndex(r=>r.n===${JSON.stringify(n)})`;
const start = "ACT.start({});S.cash=1e8;S.lvl=13;S.nextFail=1e9;S.nextEvent=1e9";

test('a standard POP: new POPs get its router model and count at once, without downtime (#240)', () => {
  const { ev, dom, errors } = load();
  ev(start + `;S.pops.fra.rgen=${g('Arrrhipster 7280R')};S.pops.fra.routers=2;selectCity('fra');UI.tab='links';renderPanel()`);
  assert.match(dom.window.document.getElementById('panelBody').textContent, /Make this the standard/);
  ev("ACT.popStdSet({city:'fra'})");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.popStd)')), { g: ev(g('Arrrhipster 7280R')), rt: 2 });
  const cash = ev('S.cash');
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev('S.pops.ams.rgen'), ev(g('Arrrhipster 7280R')));
  assert.equal(ev('S.pops.ams.routers'), 2);
  assert.ok(ev('S.cash') < cash - ev("popCost('ams')"), 'the routers are paid for');
  assert.equal(ev("S.inc.some(i=>i.type==='maint'&&i.ref==='ams')"), false, 'no maintenance window on an empty POP');
  assert.deepEqual(errors, []);
});

test('without the cash or the level, a new POP gets what fits; clearing and saves', () => {
  const { ev, errors } = load();
  ev(start + `;S.popStd={g:${g('The Router at the End of the Universe')},rt:3};S.lvl=1;S.cash=1e6`);
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev('S.pops.ams.rgen||0'), 0, 'the model is locked at level 1');
  ev("ACT.popStdClear()");
  assert.equal(ev('S.popStd'), null);
  ev(`S.popStd={g:${g('Disco 8K')},rt:99};S=sanitize(JSON.parse(JSON.stringify(S)))`);
  assert.equal(ev('S.popStd.rt'), ev('RMAX'), 'counts are clamped');
  ev("S.popStd={g:999};S=sanitize(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.popStd'), null, 'garbage is dropped');
  ev("delete S.popStd;S=sanitize(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.popStd'), null, 'old saves have none');
  assert.deepEqual(errors, []);
});

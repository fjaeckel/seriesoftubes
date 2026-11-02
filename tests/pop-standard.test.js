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

test('the price of a new POP includes the standard routers, on the button and in the template (#261)', () => {
  const { ev, dom, errors } = load();
  const U = g('The Router at the End of the Universe');
  ev(start + `;S.pops.fra.rgen=${U};S.pops.fra.routers=4;ACT.popStdSet({city:'fra'})`);
  const q = JSON.parse(ev('JSON.stringify(popStdQuote())'));
  assert.equal(q.rt, 4);
  assert.ok(q.cost > 5e6, 'four of the biggest routers cost millions, not thousands');
  ev("selectCity('ams');renderPanel()");
  const btnText = dom.window.document.querySelector('[data-act="buildPop"]').textContent;
  assert.ok(btnText.includes(ev(`fmt$(popCost('ams')+${q.cost})`)), 'the button shows the whole price: ' + btnText);
  assert.match(dom.window.document.getElementById('panelBody').textContent, /Includes your standard routers: 4 ×/);
  const cash = ev('S.cash');
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(cash - ev('S.cash'), ev("popCost('ams')") + q.cost, 'and that is exactly what it costs');
  // The one-tap template prices the standard too, so it is all or nothing.
  ev("S.ops.hired=true;S.ops.tpl={};");
  const t = JSON.parse(ev("JSON.stringify(opsTplQuote('par'))"));
  assert.equal(t.cost, ev("popCost('par')") + q.cost);
  // A locked model is not quoted: what fits is the plain routers.
  ev('S.lvl=1');
  assert.equal(ev('popStdQuote().g'), 0);
  ev('S.popStd=null');
  assert.equal(ev('popStdQuote()'), null);
  assert.deepEqual(errors, []);
});

test('POPs built by a link, dark fiber or a consortium seat get the standard too, at the quoted price (#261)', () => {
  const { ev, errors } = load();
  const A = g('Arrrhipster 7280R'), Ai = ev(A);
  ev(start + `;S.lvl=4;S.pops.fra.rgen=${A};S.pops.fra.routers=2;ACT.popStdSet({city:'fra'})`);
  const std = ev('popStdQuote().cost');
  assert.equal(ev("newPopCost('ams')"), ev("popCost('ams')") + std);
  // A wave to a city without a POP.
  ev("UI.pending={a:'fra',b:'ams'};UI.lmode='wave';ACT.buildLink({tier:0})");
  assert.ok(ev('!!S.pops.ams'), 'the wave built the POP');
  assert.equal(ev('S.pops.ams.rgen'), Ai);
  assert.equal(ev('S.pops.ams.routers'), 2);
  // Dark fiber to a city without a POP.
  ev("UI.pending={a:'fra',b:'par'};UI.lmode='df';UI.dfSys='lite';ACT.orderDf()");
  assert.equal(ev('S.pops.par.rgen'), Ai);
  assert.equal(ev('S.pops.par.routers'), 2);
  // A consortium seat with a landing that has no POP yet; its offer is priced with the standard.
  ev("S.seatOff={a:'fra',b:'lis',name:'Test',km:seatKm('fra','lis'),exp:S.day+30};UI.tab='links'");
  assert.ok(ev("seatSection()").includes(ev("fmt$(newPopCost('lis'))")));
  ev('ACT.seatBuy({n:1})');
  assert.equal(ev('S.pops.lis.rgen'), Ai);
  assert.equal(ev('S.pops.lis.routers'), 2);
  assert.deepEqual(errors, []);
});

// #365: a queued Pie in the Sky launch can be called off before its day: the pies go back on the shelf, the money comes
// back in full the day it was booked (a misclick) and half later, and the pad's slot frees up when it was the last launch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load: load0 } = require('./harness');
// Each game's window is closed after its test, so its timers do not keep the run alive.
const load = t => { const h = load0(); t.after(() => h.dom.window.close()); return h; };

// A sandbox rocket company: costs are only counted (S.pie.book.wouldHave), so refunds show there.
const company = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['sin','mia'])if(!S.pops[c])ACT.buildPop({city:c});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});S.pie.stock=200;compute()");
};
const book = ev => ev('S.pie.book.wouldHave');
const launch = ev => { const b = book(ev); ev("ACT.pieLaunch({rk:'falcon',cr:'short'})"); return { paid: Math.round(book(ev) - b), id: ev('S.pie.q.at(-1).id') }; };

test('#365 called off the day it was booked: everything back, asked first', t => {
  const { ev, errors } = load(t);
  company(ev);
  const next0 = ev("S.pie.pads[0].next"), stock0 = ev('S.pie.stock');
  const { paid, id } = launch(ev);
  assert.ok(paid > 0);
  assert.equal(ev("S.pie.crusts.short.queued"), 20);
  ev(`ACT.pieCx({id:'${id}'})`);
  assert.equal(ev('S.pie.q.length'), 1, 'only asked');
  assert.equal(ev('UI.pieCxAsk'), id);
  const b = book(ev);
  ev(`ACT.pieCx({id:'${id}',ok:true})`);
  assert.equal(ev('S.pie.q.length'), 0);
  assert.equal(Math.round(b - book(ev)), paid, 'all of it back');
  assert.equal(ev('S.pie.stock'), stock0, 'the pies are back on the shelf');
  assert.equal(ev("S.pie.crusts.short.queued"), 0);
  assert.equal(ev("S.pie.pads[0].next"), next0, 'the pad is free again');
  assert.deepEqual(errors, []);
});

test('#365 called off later: half back; the pad keeps the slot of a launch still queued after it', t => {
  const { ev, errors } = load(t);
  company(ev);
  const a = launch(ev), b = launch(ev);
  const next = ev("S.pie.pads[0].next");
  ev('for(const L of S.pie.q)L.at=S.day-1'); // booked yesterday
  let m0 = book(ev);
  ev(`ACT.pieCx({id:'${a.id}',ok:true})`);
  assert.equal(Math.round(m0 - book(ev)), Math.round(a.paid / 2), 'half: the launch provider keeps the rest');
  assert.equal(ev("S.pie.pads[0].next"), next, 'the later launch still holds the pad');
  m0 = book(ev);
  ev(`ACT.pieCx({id:'${b.id}',ok:true})`);
  assert.equal(Math.round(m0 - book(ev)), Math.round(b.paid / 2));
  assert.equal(ev("S.pie.pads[0].next"), ev('S.day'), 'the last one gone: the pad is free again');
  assert.deepEqual(errors, []);
});

test('#365 not on the day it flies; what was paid survives a save; the queue row has the button and the question', t => {
  const { ev, dom, errors } = load(t);
  company(ev);
  const { id, paid } = launch(ev);
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.deepEqual(JSON.parse(ev("JSON.stringify((({paid,at})=>({paid:Math.round(paid),at}))(S.pie.q[0]))")), { paid, at: ev('S.day') });
  ev("UI.pieTab='crust';pieModal()");
  const doc = dom.window.document;
  assert.ok(doc.querySelector(`#modal [data-act="pieCx"][data-args*="${id}"]`), 'a cancel button on the row');
  ev(`ACT.pieCx({id:'${id}'})`);
  assert.match(doc.querySelector('#modal .pie-ql .pie-confirm').textContent, /all .* back/);
  ev('S.day=S.pie.q[0].day');
  ev(`ACT.pieCx({id:'${id}',ok:true})`);
  assert.equal(ev('S.pie.q.length'), 1, 'too late on its day');
  assert.deepEqual(errors, []);
});

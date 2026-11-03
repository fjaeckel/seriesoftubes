const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'})";

test('the backbone, Auto-TE and DDoS settings open from a button at the top of the NOC tab', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev(start + ";UI.left='noc';UI.leftOpen=true;UI.sel=null;renderLeft()");
  const left = doc.getElementById('leftBody');
  const b = left.querySelector('[data-act=routingOpen]');
  assert.ok(b, 'the button is there');
  assert.ok(left.querySelector('.btns').contains(b), 'in the first row of buttons, above the notifications');
  assert.doesNotMatch(left.textContent, /Auto-RTBH|Install Auto-TE/, 'the settings no longer sit in the tab');
  b.click();
  assert.equal(ev("$('modal').hidden"), false);
  const m = () => doc.getElementById('modalCard').textContent;
  assert.match(m(), /Routing & DDoS/);
  assert.match(m(), /Backbone/); assert.match(m(), /Auto-TE/); assert.match(m(), /Auto-RTBH: off/);
  // An action inside redraws the modal in place.
  doc.querySelector('#modalCard [data-act=ddosAuto]').click();
  assert.equal(ev('S.ddosAuto.rtbh'), true);
  assert.match(m(), /Auto-RTBH: on/);
  doc.querySelector('#modalCard [data-act=coreUp]').click();
  assert.equal(ev('S.core.lv'), 1);
  assert.equal(ev("$('modal').hidden"), false, 'still open after buying');
  assert.ok(doc.querySelector('#modalCard [data-act=coreSet]'), 'with the new level to pick');
  // Other modals are left alone.
  ev("closeModal();ACT.opsOpen()");
  assert.doesNotMatch(m(), /Auto-RTBH/);
  assert.deepEqual(errors, []);
});

test('a paused Auto-TE shows on the button, and the modal works on a phone', () => {
  const { ev, dom, errors } = load();
  ev("window.innerWidth=360;" + start + ";S.te={on:true,day:S.day};S.core.run=0;UI.left='noc';UI.leftOpen=true;renderLeft()");
  const b = dom.window.document.querySelector('#leftBody [data-act=routingOpen]');
  assert.ok(b.querySelector('.cnt.dot'), 'a red dot when Auto-TE is paused');
  ev('ACT.routingOpen()');
  assert.match(dom.window.document.getElementById('modalCard').textContent, /Auto-TE is paused/);
  ev("closeModal();S.core.run=S.core.lv=2;renderLeft()");
  assert.equal(dom.window.document.querySelector('#leftBody [data-act=routingOpen] .cnt'), null);
  assert.deepEqual(errors, []);
});

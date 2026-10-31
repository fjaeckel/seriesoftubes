// #131 on Safari: the custom metric field keeps focus through a button tap, and the panel skips re-rendering a
// focused field, so switching between multiplier and cost (or to a preset) left the old panel on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const setup = (ev) => {
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal()");
  ev("window.L=S.links[0].id;ACT.selLink({id:L});renderAll();ACT.setMetric({id:L,v:'custom'});renderAll()");
};

test('#131 switching the custom metric mode re-renders even while the field has focus', () => {
  const { ev, dom, errors } = load();
  const d = dom.window.document;
  setup(ev);
  d.getElementById('metIn').focus();
  assert.equal(d.activeElement.id, 'metIn');
  ev("ACT.metricMode({id:L,k:'w'})");
  assert.equal(d.getElementById('metIn').getAttribute('step'), '1', 'the field is now the exact cost');
  assert.equal(+d.getElementById('metIn').value, ev("S.pairMet[edgeKey(S.links[0])].v"));
  d.getElementById('metIn').focus();
  ev("ACT.metricMode({id:L,k:'f'})");
  assert.equal(d.getElementById('metIn').getAttribute('step'), '0.1', 'and back to a multiplier');
  d.getElementById('metIn').focus();
  ev("ACT.setMetric({id:L,v:'normal'})");
  assert.equal(d.getElementById('metIn'), null, 'a preset hides the field');
  assert.deepEqual(errors, []);
});

test('#131 the daily re-render still keeps a half-typed value', () => {
  const { ev, dom, errors } = load();
  const d = dom.window.document;
  setup(ev);
  const t = d.getElementById('metIn');
  t.focus(); t.value = '3.5';
  ev("S.day++;renderPanel()");
  assert.equal(d.getElementById('metIn').value, '3.5');
  assert.equal(d.activeElement.id, 'metIn');
  assert.deepEqual(errors, []);
});

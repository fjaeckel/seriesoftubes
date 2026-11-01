const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('daily panel updates keep keyboard focus and refresh the tab badges', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev('ACT.start({});renderLeft()');
  const tabs = dom.window.document.getElementById('leftTabs');
  const deals = tabs.querySelector('[data-args*=deals]');
  deals.focus();
  ev('renderLeft()');
  assert.equal(dom.window.document.activeElement, deals, 'unchanged tabs keep focus');
  ev("S.offers.push({id:'focus-test'});renderLeft()");
  assert.equal(dom.window.document.activeElement, deals, 'a changed badge keeps the same button');
  assert.equal(tabs.querySelector('[data-args*=deals]'), deals);
  assert.ok(deals.querySelector('.cnt'), 'the new offer count is visible');
  assert.deepEqual(errors, []);
});

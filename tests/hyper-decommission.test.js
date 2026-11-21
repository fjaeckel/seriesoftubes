// A Hyperscaler's users belong to the countries it launched, not to its POPs (#448): decommissioning a POP moves their
// front door to the nearest one left, and the dialog and the toast say so instead of counting eyeballs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A Hyperscaler in Frankfurt with a POP in Singapore (transit there) and Germany and Singapore launched.
function start(fraDoor) {
  const page = load({ seed: 5 });
  page.ev(`ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.nextFail=S.nextEvent=1e9;ACT.hsLaunch({cc:'DE'});${fraDoor ? "ACT.buyTransit({city:S.home,net:'cog',tier:1});" : ''}compute()`);
  page.ev("ACT.buildPop({city:'sin'});UI.via=null;UI.route=null;openLinkModal(S.home,'sin');ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'sin',net:'cog',tier:1});ACT.hsLaunch({cc:'SG'});after()");
  return page;
}
const modal = ev => ev("document.getElementById('modal').textContent").replace(/\s+/g, ' ');
const toasts = ev => ev("[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent).join(' | ')");

test('#448 decommissioning a front door says where its users come in next, and they stay', () => {
  const { ev, errors } = start(true);
  assert.equal(ev('R.hs.cc.SG.v'), 'sin', 'Singapore users come in at Singapore');
  ev("ACT.decomOpen({city:'sin'})");
  const m = modal(ev);
  assert.match(m, /Users who come in elsewhere/);
  assert.match(m, /Singapore → Frankfurt/);
  assert.doesNotMatch(m, /Eyeballs you stop serving/, 'a Hyperscaler has no eyeballs to count');
  ev('ACT.decomGo({})');
  assert.equal(ev("!!S.hs.cc.SG&&!S.pops.sin"), true, 'the POP is gone, the country launch stays');
  assert.equal(ev('R.hs.cc.SG.v'), 'fra', 'the dialog named the door routing really uses');
  assert.ok(ev('R.hs.cc.SG.D') > 0);
  assert.match(toasts(ev), /Singapore → Frankfurt/);
  assert.deepEqual(errors, []);
});

test('#448 closing the last front door warns that the users go unserved', () => {
  const { ev, errors } = start(false);
  ev("ACT.decomOpen({city:'sin'})");
  assert.match(modal(ev), /Singapore: no front door left, users go unserved/);
  assert.match(modal(ev), /Germany: no front door left/);
  ev('ACT.decomGo({})');
  assert.match(toasts(ev), /no front door left/);
  assert.equal(ev('R.hs.cc.SG&&R.hs.cc.SG.v||null'), null, 'and indeed none is left');
  assert.deepEqual(errors, []);
});

test('#448 the classic game still counts the eyeballs it stops serving', () => {
  const { ev, errors } = load({ seed: 5 });
  ev("ACT.start({});S.cash=1e9;ACT.buildPop({city:'ams'});ACT.decomOpen({city:'ams'})");
  assert.match(modal(ev), /Eyeballs you stop serving/);
  assert.doesNotMatch(modal(ev), /Users who come in elsewhere/);
  assert.deepEqual(errors, []);
});

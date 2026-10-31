// The chaos monkey in every puzzle: it acts out the N-1 star on the map, and the stars never wait on it in tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const lay = (ev, a, b, via, div = 1) => ev(`if(!S.pops['${a}'])ACT.pzPop({city:'${a}'});ACT.pzLinkTo({a:'${a}',b:'${b}'});ACT.pzVia({v:'${via}'});ACT.pzDiv({v:${div}});ACT.pzLink({tier:1});closeModal()`);
const live = (ev) => ev('UI.drawnAt=performance.now()'); // as if the map were being drawn

test('a new star sets the monkey loose, then the stars show; skipping goes straight to them', () => {
  const { ev, errors } = load();
  ev("ACT.pzStart({id:'bigboat'})");
  live(ev);
  lay(ev, 'fra', 'par', 'land'); lay(ev, 'fra', 'par', 'land');
  assert.ok(ev('pzEval().goal'), 'delivered');
  assert.ok(ev('!!UI.pzMk'), 'the monkey is reviewing the build');
  assert.ok(ev('!!UI.mk'), 'and it is on the map');
  assert.ok(ev("!!document.querySelector('#pzBox [data-act=pzMkSkip]')"), 'with a skip button');
  assert.equal(ev('pzEval().goal'), true, 'its cuts never change the stars');
  ev('ACT.pzMkSkip()');
  assert.equal(ev('UI.pzMk'), null);
  assert.ok(ev('S.links.every(l=>!l.cut)'), 'every tube whole again');
  assert.match(ev("document.getElementById('toasts').textContent+document.getElementById('modalCard').textContent"), /⭐/);
  assert.ok(ev("!!document.querySelector('#pzBox [data-act=pzMonkey]')"), 'and it can be let loose again');
  assert.deepEqual(errors, []);
});

test('the monkey snips each trench in turn, and an edit sends it away', () => {
  const { ev, errors } = load();
  ev("ACT.pzStart({id:'bigboat'})");
  lay(ev, 'fra', 'par', 'land'); lay(ev, 'fra', 'par', 'land');
  ev("pzMonkey()");
  assert.equal(ev('UI.pzMk.units.length'), 2);
  assert.equal(ev('S.links.some(l=>l.cut)'), false, 'nothing cut while it runs');
  ev('pzMkHit()');
  assert.equal(ev('S.links.filter(l=>l.cut).length'), 1, 'one trench cut when it arrives');
  ev('pzMkStep()');
  assert.equal(ev('S.links.some(l=>l.cut)'), false, 'and whole again when it runs on');
  lay(ev, 'fra', 'par', 'land');
  assert.equal(ev('UI.pzMk'), null, 'a change to the build stops the review');
  assert.equal(ev('UI.mk'), null);
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// A triangle: Frankfurt-Amsterdam direct, or round through Paris.
function setup(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.launchBB({city:'fra'});ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});for(const c in S.pops){S.pops[c].rgen=3;S.pops[c].routers=2}");
  [['fra', 'par'], ['par', 'ams'], ['fra', 'ams']].forEach(([a, b], i) => ev(`UI.via=null;openLinkModal('${a}','${b}');ACT.buildLink({tier:1});closeModal();S.links[S.links.length-1].tag=${i}`));
  ev("var D=S.links.find(l=>l.tag===2);compute()");
}
const hops = (ev, mode) => ev(`trPaths('fra',${lit(mode)}).path('ams').length`);

test('a trace can follow the metrics, the lowest latency or the quietest links', () => {
  const { ev, errors } = load();
  setup(ev);
  assert.equal(hops(ev, 'normal'), 1, 'the short way round is the direct link');
  ev("ACT.setMetric({id:D.id,v:'avoid'})");
  assert.equal(hops(ev, 'normal'), 2, 'an avoided direct link sends the metric route round through Paris');
  assert.equal(hops(ev, 'fast'), 1, 'but lowest latency ignores the metric and goes direct');
  ev("ACT.setMetric({id:D.id,v:'normal'});compute()");
  assert.equal(hops(ev, 'scenic'), 1, 'with nothing busy, scenic is the plain route');
  ev("R.load[D.id]=capOf(D)*0.95");
  assert.equal(hops(ev, 'scenic'), 2, 'a busy direct link sends scenic round the quiet way');
  assert.equal(hops(ev, 'normal'), 1, 'while the metric route does not care');
  assert.equal(ev("trPaths('fra').path('ams').length"), 1, 'old callers without a mode still follow the metrics');
  assert.equal(JSON.parse(ev("JSON.stringify(traceroute('fra',{city:'ams'},'nonsense'))")).text.includes('traceroute to'), true, 'an unknown mode falls back');
  assert.deepEqual(errors, []);
});

test('the looking glass has the three route buttons, like a customer circuit, and each one re-runs the trace', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  setup(ev);
  ev("ACT.setMetric({id:D.id,v:'avoid'});ACT.trace({city:'fra'})");
  const btns = () => [...doc.querySelectorAll('[data-act="traceMode"]')];
  assert.equal(doc.getElementById('trMode'), null, 'no drop-down');
  assert.deepEqual(btns().map(b => JSON.parse(b.dataset.args).m), ['normal', 'fast', 'scenic']);
  assert.deepEqual(btns().map(b => b.className.includes('pink')), [true, false, false], 'the chosen one is highlighted');
  doc.getElementById('trTo').value = 'city:ams';
  btns()[1].click();
  assert.equal(ev("UI.trMode"), 'fast');
  assert.deepEqual(btns().map(b => b.className.includes('pink')), [false, true, false]);
  assert.match(doc.querySelector('.term').textContent, /traceroute to ams/, 'the chosen destination is kept');
  assert.equal((doc.querySelector('.term').textContent.match(/cr1\.ams/g) || []).length, 1, 'one hop: straight there');
  ev("ACT.traceMode({m:'nonsense'})");
  assert.equal(ev("UI.trMode"), 'fast', 'an unknown mode changes nothing');
  ev("ACT.traceRun()");
  assert.equal(ev("UI.trMode"), 'fast', 'Run keeps the mode');
  assert.deepEqual(errors, []);
});

test('a trace that does not follow the metrics says it shows a circuit’s path, not the internet traffic’s', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  setup(ev);
  ev("ACT.trace({city:'fra'})");
  assert.doesNotMatch(doc.getElementById('modal').textContent, /follows the metrics/);
  [...doc.querySelectorAll('[data-act="traceMode"]')][2].click();
  assert.match(doc.getElementById('modal').textContent, /follows the metrics\. This is the path a customer circuit on/);
  assert.deepEqual(errors, []);
});

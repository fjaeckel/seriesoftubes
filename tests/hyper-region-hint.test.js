// The Hyperscaler's Cloud view says where a region can never go (37-hyper.js hsNeverWhy, 55-hyper-panel.js hsRgNever):
// a city too small, or behind the Great Firewall, says so with or without a POP, and names the nearest city that can
// hold one; a city that fits but has no POP yet says a POP comes first.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function start() {
  const g = load({ seed: 5 });
  g.ev("ACT.start({});UI.tutLater=true;ACT.charter({k:'hyper'});S.cash=1e9");
  return g;
}
// The Region section of city c's Cloud view, as text ('' when there is none), at width w.
const rg = (g, c, w = 1280) => {
  g.ev(`window.innerWidth=${w};selectCity('${c}');UI.tab='cust';renderAll()`);
  const s = g.dom.window.document.querySelector('#panelBody [data-sec=hsrg]');
  return s ? s.textContent : '';
};

test('a city too small for a region says so, with or without a POP, and names the nearest that can', () => {
  const g = start();
  assert.equal(g.ev("hsNeverWhy('lys')"), 'small');
  assert.equal(g.ev("hsNearSite('lys')"), 'mil');
  for (const w of [1280, 360]) {
    const t = rg(g, 'lys', w);
    assert.match(t, /Never a region here/);
    assert.match(t, /Lyon is too small for a region, now and later/);
    assert.match(t, /The nearest city that can hold one: Milan/);
  }
  g.ev("ACT.buildPop({city:'lys'})");
  assert.match(rg(g, 'lys'), /Never a region here/, 'a POP does not change it');
  assert.match(rg(g, 'lys'), /too small/);
  assert.deepEqual(g.errors, []);
});

test('behind the Great Firewall a region is never allowed', () => {
  const g = start();
  assert.equal(g.ev("hsNeverWhy('pek')"), 'cn');
  const t = rg(g, 'pek');
  assert.match(t, /Never a region here/);
  assert.match(t, /No foreign cloud may run a region behind the Great Firewall/);
  assert.deepEqual(g.errors, []);
});

test('a city that fits says a POP comes first, then offers the region; home never says never', () => {
  const g = start();
  assert.equal(g.ev("hsNeverWhy('par')"), '');
  const t = rg(g, 'par');
  assert.match(t, /Room for a region, after a POP/);
  assert.match(t, /Open a POP first/);
  assert.doesNotMatch(t, /Never/);
  g.ev("ACT.buildPop({city:'par'})");
  const p = rg(g, 'par');
  assert.match(p, /Room for a region/);
  assert.doesNotMatch(p, /after a POP|Never/);
  assert.equal(g.ev('hsNeverWhy(S.home)'), '');
  assert.doesNotMatch(rg(g, g.ev('S.home')), /Never/);
  assert.deepEqual(g.errors, []);
});

test('every city on the map is either a region metro or says why not', () => {
  const g = start();
  const bad = JSON.parse(g.ev("JSON.stringify(CITIES.filter(C=>!C.off).filter(C=>hsSite(C.id)===!!hsNeverWhy(C.id)||!hsSite(C.id)&&!hsNearSite(C.id)).map(C=>C.id))"));
  assert.deepEqual(bad, []);
  assert.deepEqual(g.errors, []);
});

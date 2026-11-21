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

// Ashburn has a few hundred thousand people and the world's biggest cluster of data centers: a hub (at least
// HS_HUB_FAC facilities in PeeringDB) holds a region whatever its size, on a grid built for the data centers.
test('Ashburn, the data-center capital, holds a region on the biggest spare grid there is', () => {
  const g = start();
  assert.ok(g.ev("CITY.ash.P<HS_MIN_P"), 'still a small town by population');
  assert.equal(g.ev("hsSite('ash')"), true);
  assert.equal(g.ev("hsNeverWhy('ash')"), '');
  assert.deepEqual(JSON.parse(g.ev("JSON.stringify(CITIES.filter(c=>hsHub(c.id)&&!siteOk(c.id,HS_MIN_P)).map(c=>c.id))")), ['ash'], 'the only town that is a hub');
  // The grid is the data centers'; the town draws what a town its size does.
  assert.ok(g.ev("hsGrid('ash')") >= 500, 'grid ' + g.ev("hsGrid('ash')"));
  assert.ok(g.ev("hsTown('ash')") < 100);
  const most = g.ev("CITIES.filter(c=>!c.off&&hsSite(c.id)).sort((a,b)=>(hsGrid(b.id)-hsTown(b.id))-(hsGrid(a.id)-hsTown(a.id))||(a.id<b.id?-1:1))[0].id");
  assert.equal(most, 'ash', 'the most spare megawatts of any region metro');
  // Other metros keep their grid.
  for (const c of ['nyc', 'fra', 'lys']) assert.equal(g.ev(`hsGrid('${c}')`), g.ev(`hsGridP('${c}')`));
  // A region there, from the Cloud view.
  for (const w of [1280, 360]) assert.doesNotMatch(rg(g, 'ash', w), /Never a region here/);
  g.ev("ACT.buildPop({city:'ash'});ACT.buyTransit({city:'ash',net:'cog',tier:1});ACT.hsRegion({city:'ash'})");
  assert.ok(g.ev("!!S.hs.rg.ash"), 'a region in Ashburn');
  // It survives a save round trip.
  g.ev("const t=JSON.parse(JSON.stringify(S));S=sanitize(t);compute()");
  assert.ok(g.ev("!!S.hs.rg.ash"));
  assert.deepEqual(g.errors, []);
});

// The demand gauge (38-hyper-pull.js) and late-game region prices (HS_LATE, 37-hyper.js).
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./harness');

// A cloud whose only region is in Ashburn, with users all over the US and front doors where they live.
function us(lv = 6) {
  const g = load({ seed: 5 });
  g.ev("beginGame('Cloud','ash',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});S.cash=1e10;S.nextFail=S.nextEvent=1e9;S.lvl=" + lv);
  g.ev("for(const c of ['lax','chi','dal','sea'])ACT.buildPop({city:c});for(const c of ['ash','lax','chi','dal','sea'])ACT.buyTransit({city:c,net:'lvl',tier:1});ACT.hsLaunch({cc:'US'});S.hs.cc.US.d=3000;compute()");
  return g;
}
const J = (g, x) => JSON.parse(g.ev(`JSON.stringify(${x})`));

test('users far from every region pull towards the sites nearest them', () => {
  const g = us();
  const L = J(g, 'hsPull().map(x=>[x.c,x.g,x.far,x.law])');
  assert.ok(L.length >= 3, JSON.stringify(L));
  const top = L.slice(0, 3).map(x => x[0]);
  for (const c of top) assert.ok(['dal', 'lax', 'sjc', 'phx', 'slc', 'chi', 'cbf', 'qcy', 'bdm'].includes(c), 'a western or central site: ' + top);
  assert.ok(!L.some(x => x[0] === 'ash'), 'never a site that has a region already');
  assert.ok(L.every(x => x[1] > 0 && Math.abs(x[1] - x[2] - x[3]) < 1e-6));
  // A region there takes the pull away.
  const c = L[0][0];
  g.ev(`ACT.buildPop({city:'${c}'});ACT.buyTransit({city:'${c}',net:'lvl',tier:1});ACT.hsRegion({city:'${c}'});S.hs.rg.${c}.ready=0;compute()`);
  assert.ok(!J(g, 'hsPull().map(x=>x.c)').includes(c));
  assert.deepEqual(g.errors, []);
});

test('users held by a residency law pull towards a site in their own country', () => {
  const g = us();
  g.ev("ACT.hsLaunch({cc:'IN'});compute()");
  const x = J(g, "hsPull().filter(x=>x.law>0)");
  assert.ok(x.length, 'India waits for a region');
  assert.equal(g.ev(`CITY.${x[0].c}.cc`), 'IN');
  assert.deepEqual(g.errors, []);
});

test('the gauge shows on the Cloud card, on the city and as the next step, on a phone too', () => {
  const g = us();
  const top = g.ev('hsPull()[0].c');
  for (const w of [1280, 360]) {
    g.ev(`window.innerWidth=${w};UI.fold=UI.fold||{};renderAll()`);
    assert.match(g.dom.window.document.body.textContent, /Where users want a region/);
    g.ev(`selectCity('${top}');UI.tab='cust';renderAll()`);
    assert.match(g.dom.window.document.getElementById('panelBody').textContent, /would be much nearer a region here/);
  }
  // With the doors and region big enough and nothing forecast to fill (stubbed here), it is the next step.
  g.ev("S.hs.rg.ash.t=3;S.hs.rg.ash.mw=HS_T[3].mw;for(let i=0;i<3;i++)ACT.buyTransit({city:'ash',net:'lvl',tier:3});S.hs.cc.US.d=60;hpNextHtml=()=>'';compute();renderAll()");
  const t = g.dom.window.document.body.textContent;
  assert.match(t, /want a region in/, (t.match(/👉[^.]*\./) || [''])[0]);
  assert.deepEqual(g.errors, []);
});

test('late in the game regions cost more to build and grow, and calling one off returns what was paid', () => {
  const g = us(6);
  assert.equal(g.ev('hsCost(1)'), g.ev('HS_T[1].cost'), 'list price up to level 6');
  g.ev('S.lvl=10');
  assert.equal(g.ev('hsLateF()'), 1.6);
  assert.equal(g.ev('hsCost(2)'), Math.round(g.ev('HS_T[2].cost') * 1.6));
  // A new region pays the late price and remembers it.
  let cash = g.ev('S.cash');
  g.ev("ACT.buildPop({city:'dal'});ACT.hsRegion({city:'dal'})");
  assert.ok(g.ev('!!S.hs.rg.dal'));
  assert.ok(cash - g.ev('S.cash') >= g.ev('hsCost(1)'), 'paid at least the late price');
  assert.equal(g.ev('S.hs.rg.dal.pf'), 1.6);
  // Kept through a save.
  g.ev("S=sanitize(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(g.ev('S.hs.rg.dal.pf'), 1.6);
  // Called off for a protest at a higher level: 90% of what was paid, not of the new price.
  g.ev("S.lvl=13;S.hs.prot=S.hs.prot||{};S.hs.prot.dal={g:0,on:'rg',kind:'block',d:S.day,until:S.day+30}");
  if (g.ev("!!hsProt('dal')&&hsProtHeld('dal')")) {
    cash = g.ev('S.cash');
    g.ev("ACT.hsMove({city:'dal'})");
    assert.equal(g.ev('S.cash') - cash, Math.round(g.ev('HS_T[1].cost') * 0.9 * 1.6));
  }
  // The card says why.
  g.ev("compute();selectCity('lax');UI.tab='cust';renderAll()");
  assert.match(g.dom.window.document.getElementById('panelBody').textContent, /Late-game prices/);
  assert.deepEqual(g.errors, []);
});

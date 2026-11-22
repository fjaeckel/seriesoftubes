// The Hyperscaler's soft region limit (#449, 37-hyper.js): your level runs hsRgMax() regions at the plain price and any
// number past that line, each one adding HS_OVER to the monthly cost of every region. A region on the continent the
// next level asks for is never out of reach, only dear, and there is no ceiling (#452): your wallet is the limit.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A level-8 Hyperscaler in Frankfurt with Server Barns in eight cities on three continents (Europe, the Americas, Asia):
// its level's whole allowance, while level 9 asks for a fourth continent (the report in #449). POPs in Sydney and São
// Paulo are ready for a region on a new continent.
const EIGHT = ['fra', 'par', 'ams', 'lon', 'nyc', 'chi', 'sin', 'tok'];
function full(seed = 5) {
  const g = load({ seed });
  g.ev("beginGame('Cloud','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});S.cash=1e10;S.lvl=8;S.nextFail=S.nextEvent=1e9;" +
    `for(const c of ${JSON.stringify(EIGHT.slice(1).concat(['syd', 'sao', 'mia', 'dal']))})ACT.buildPop({city:c});` +
    `for(const c of ${JSON.stringify(EIGHT)})S.hs.rg[c]={t:c==='fra'?0:1,ready:0,mw:HS_T[c==='fra'?0:1].mw};compute()`);
  return g;
}
// The regions' own rent, the part the surcharge multiplies.
const RENT = 'Object.values(S.hs.rg).reduce((a,d)=>a+HS_T[d.t].mo,0)';
const REST = 'CX_COST.reduce((a,f)=>a+f(R),0)+Object.keys(S.hs.edge).length*HS_EDGE_MO';

test('#449: a full level-8 cloud can still open a region on a fourth continent, two taps, and every region costs more', () => {
  const { ev, dom, errors } = full();
  assert.equal(ev('hsRgMax()'), 8);
  assert.equal(ev('hsRgN()'), 8);
  assert.equal(ev('hsCont()'), 3);
  assert.equal(ev('R.cost.cloud'), ev(`${RENT}+${REST}`), 'at the line nothing extra');
  // The panel says what going past the line costs before anything is spent.
  ev("selectCity('syd');UI.tab='cust';renderAll()");
  assert.match(dom.window.document.getElementById('panelBody').textContent, /Each region past that makes every region cost 25% more to run\./);
  const cash = ev('S.cash');
  ev("ACT.hsRegion({city:'syd'})");
  assert.equal(ev('!!S.hs.rg.syd'), false, 'the first tap only arms');
  assert.equal(ev('S.cash'), cash);
  ev('renderAll()');
  assert.match(dom.window.document.getElementById('panelBody').textContent, /Tap again: every region costs 25% more to run/);
  ev("ACT.hsRegion({city:'syd'})");
  assert.equal(ev('!!S.hs.rg.syd'), true, 'the second tap builds');
  assert.ok(ev('S.cash') < cash, 'and is paid for (a goal may pay part of it back)');
  assert.equal(ev('hsRgOver()'), 1);
  ev('compute()');
  assert.equal(ev('R.cost.cloud'), ev(`Math.round(${RENT}*1.25)+${REST}`), 'a quarter more on every region\'s rent');
  ev('S.hs.rg.syd.ready=0;compute()');
  assert.equal(ev('hsCont()'), 4, 'the fourth continent the next level asks for');
  assert.match(ev('hsCard()'), /1 past your level's 8 regions: every region costs 25% more to run/, 'the charter card says so');
  // Levelling up moves the line: the same nine regions now cost the plain price.
  ev('S.lvl=9;compute()');
  assert.equal(ev('hsRgOver()'), 0);
  assert.equal(ev('R.cost.cloud'), ev(`${RENT}+${REST}`));
  assert.doesNotMatch(ev('hsCard()'), /past your level's/);
  assert.deepEqual(errors, []);
});

test('#452: no ceiling: the surcharge grows with every region past the line, cages too, and the panel never says no room', () => {
  const { ev, dom, errors } = full();
  for (const c of ['syd', 'sao']) ev(`ACT.hsRegion({city:'${c}'});ACT.hsRegion({city:'${c}'})`);
  assert.equal(ev('hsRgN()'), 10);
  ev('compute()');
  assert.equal(ev('R.cost.cloud'), ev(`Math.round(${RENT}*1.5)+${REST}`), 'two past the line: half again');
  // The old ceiling (two past the line) is gone: Ashburn and a cage in Dallas, still two taps each.
  ev("ACT.buildPop({city:'ash'});ACT.buildPop({city:'lax'});selectCity('ash');UI.tab='cust';renderAll()");
  const txt = dom.window.document.getElementById('panelBody').textContent;
  assert.doesNotMatch(txt, /No room at your level|allows \d+ regions/);
  assert.match(txt, /Each region past that makes every region cost 25% more to run\./);
  ev("ACT.hsRegion({city:'ash'})");
  assert.equal(ev('!!S.hs.rg.ash'), false, 'the first tap only arms');
  ev("ACT.hsRegion({city:'ash'})");
  assert.equal(ev('!!S.hs.rg.ash'), true, 'past the old ceiling of 10');
  assert.equal(ev("hsColoWhy('dal')"), '');
  ev("ACT.hsColo({city:'dal'});ACT.hsColo({city:'dal'})");
  assert.equal(ev('S.hs.rg.dal.t'), ev('HS_CAGE'), 'a cage is a region too, and is allowed');
  assert.equal(ev('hsRgOver()'), 4);
  ev('compute()');
  assert.equal(ev('R.cost.cloud'), ev(`Math.round(${RENT}*2)+${REST}`), 'four past the line: double rent on every region');
  // Only money stops you.
  ev('S.cash=0;renderAll()');
  const cash = ev('S.cash');
  ev("ACT.hsRegion({city:'lax'});ACT.hsRegion({city:'lax'})");
  assert.equal(ev('!!S.hs.rg.lax'), false, 'no money, no region');
  assert.equal(ev('S.cash'), cash);
  // Closing one lowers the bill.
  ev("ACT.hsRgClose({city:'sao'});ACT.hsRgClose({city:'sao'});compute()");
  assert.equal(ev('hsRgOver()'), 3);
  assert.equal(ev('R.cost.cloud'), ev(`Math.round(${RENT}*1.75)+${REST}`));
  assert.deepEqual(errors, []);
});

test('a leased cage past the line arms first, like a region', () => {
  const { ev, errors } = full();
  const cash = ev('S.cash');
  ev("ACT.hsColo({city:'sao'})");
  assert.equal(ev('!!S.hs.rg.sao'), false);
  assert.equal(ev('S.cash'), cash);
  ev("ACT.hsColo({city:'sao'})");
  assert.equal(ev('S.hs.rg.sao.t'), ev('HS_CAGE'));
  assert.equal(ev('hsRgOver()'), 1);
  assert.deepEqual(errors, []);
});

test('below the line a region is one tap, and the top level runs thirteen at the plain price', () => {
  const { ev, errors } = full();
  ev("ACT.hsRgClose({city:'tok'});ACT.hsRgClose({city:'tok'});ACT.hsRegion({city:'syd'})");
  assert.equal(ev('!!S.hs.rg.syd'), true, 'back at the line, the first tap builds');
  ev('S.lvl=13');
  assert.equal(ev('hsRgMax()'), 13);
  assert.deepEqual(errors, []);
});

test('a save past the line keeps every region and its surcharge', () => {
  const { ev, errors } = full();
  for (const c of ['syd', 'sao']) ev(`ACT.hsRegion({city:'${c}'});ACT.hsRegion({city:'${c}'})`);
  ev('compute()');
  const before = ev('R.cost.cloud');
  ev('S=sanitize(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev('hsRgN()'), 10);
  assert.equal(ev('R.cost.cloud'), before);
  assert.deepEqual(errors, []);
});

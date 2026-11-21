// A big country's users are not all in its biggest city (37-hyper.js hsZones): they are spread over its biggest cities
// by eyeballs, each part enters at the front door nearest it, latency is from where those users are, and the backbone
// hauls each part from its region to its door. A country with one city behaves as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
function us() {
  const g = load({ seed: 5 });
  g.ev("UI.startCity='nyc';ACT.start({});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});S.cash=1e10;S.lvl=10;S.nextFail=S.nextEvent=1e9;" +
    "S.pops.nyc.rgen=RG_TOP;ACT.buyTransit({city:'nyc',net:'lvl',tier:3});ACT.hsLaunch({cc:'US'});S.hs.cc.US.d=600;" +
    "S.hs.rg.nyc={t:3,ready:0,mw:HS_T[3].mw};S.hs.pw.nyc=hsPwDef('nyc');S.hs.pw.nyc.cap=5000;compute()");
  return g;
}

test('the US is many cities: users enter at the door nearest them, and far doors cost latency and haul', () => {
  const { ev, errors } = us();
  const z = J(ev, "hsZones('US')");
  assert.equal(z.length, 8, 'the eight biggest US cities');
  assert.equal(z[0][0], 'nyc');
  assert.ok(Math.abs(z.reduce((a, x) => a + x[1], 0) - 1) < 1e-9, 'shares add up');
  assert.ok(z.some(([c]) => c === 'lax') && z.some(([c]) => c === 'chi'));
  // One door: everyone comes in at New York, and the West Coast is far away.
  assert.deepEqual(J(ev, 'R.hs.cc.US.vs'), [['nyc', 1]]);
  const q1 = ev("hsQ(R,'US')");
  // A door in Los Angeles: the West takes it, the backbone hauls to it, and quality goes up once the haul fits.
  ev("ACT.buildPop({city:'lax'});S.pops.lax.rgen=RG_TOP;ACT.buyTransit({city:'lax',net:'lvl',tier:3});S.links.push({id:'nl',a:'nyc',b:'lax',kind:'wave',tier:4,km:Math.round(kmBetween('nyc','lax')),mo:1,cut:0,ready:0,trench:'nl',day:-30});compute()");
  const vs = J(ev, 'R.hs.cc.US.vs');
  assert.deepEqual(vs.map((x) => x[0]), ['nyc', 'lax']);
  assert.ok(vs[1][1] > 0.3, 'the West enters at Los Angeles: ' + vs[1][1]);
  assert.ok(ev('R.hs.cc.US.want') > 100, 'hauled over the backbone to Los Angeles');
  // A region in the West: the West Coast is served close by, and the US as a whole far better than from New York.
  ev("S.hs.rg.lax={t:3,ready:0,mw:HS_T[3].mw};S.hs.pw.lax=hsPwDef('lax');S.hs.pw.lax.cap=5000;compute()");
  assert.ok(q1 < 0.95, 'one coast cannot serve a continent well: ' + q1);
  assert.ok(ev("hsQ(R,'US')") > 0.98, `a region on each coast: ${ev("hsQ(R,'US')")}`);
  // The panel says where they come in.
  ev("window.innerWidth=360;selectCity('nyc');UI.tab='cust';renderAll()");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Users enter at New York \d+%, Los Angeles \d+%/);
  assert.deepEqual(errors, []);
});

test('a country with one city keeps one zone at its main city', () => {
  const { ev, errors } = us();
  const cc = ev("[...new Set(CITIES.map(c=>c.cc))].sort().find(cc=>ccInfo(cc)&&CITIES.filter(c=>c.cc===cc&&!c.off&&c.P>0).length===1)");
  assert.ok(cc);
  assert.deepEqual(J(ev, `hsZones(${JSON.stringify(cc)})`), [[ev(`ccInfo(${JSON.stringify(cc)}).main`), 1]]);
  assert.deepEqual(errors, []);
});

// The Hyperscaler's own video platform, Tubular (38-hyper-video.js): launched once from level 6, its audience builds up
// to 1.5 times what users pulled before; most of it is servable from edge stacks at the front doors, a Gbps of it earns
// less than other traffic, and its uploads are copied to the replica.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function cloud() {
  const g = load({ seed: 3 });
  g.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;HS_ZC.m.set('DE',[[ccInfo('DE').main,1]]);HS_LAKE[0]=99;S.cash=1e9;S.nextFail=S.nextEvent=1e9;" +
    "S.pops[S.home].rgen=RG_TOP;ACT.buyTransit({city:S.home,net:'cog',tier:3});S.hs.rg[S.home]={t:2,ready:0,mw:60};S.hs.pw[S.home]=hsPwDef(S.home);S.hs.pw[S.home].cap=1000;" +
    "ACT.hsLaunch({cc:'DE'});S.hs.cc.DE.d=400;compute()");
  return g;
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('Tubular launches once from level 6, and its audience builds up over half a year', () => {
  const { ev, errors } = cloud();
  ev('S.lvl=5;renderAll()');
  assert.match(ev("hsVidWhy()"), /from level 6/);
  const c0 = ev('S.cash');
  ev('ACT.hsVidLaunch()');
  assert.equal(ev('!!S.hs.vid'), false, 'not before level 6');
  ev('S.lvl=6;renderAll()');
  assert.match(ev('document.body.textContent'), /Your own video platform, Tubular/);
  ev('ACT.hsVidLaunch()');
  assert.equal(ev('S.hs.vid.since'), ev('S.day'));
  assert.equal(c0 - ev('S.cash'), 5000000);
  ev('ACT.hsVidLaunch()');
  assert.equal(c0 - ev('S.cash'), 5000000, 'once');
  assert.equal(ev('hsVidF()'), 0, 'no audience on day one');
  ev('S.day+=90');
  assert.ok(near(ev('hsVidF()'), 0.75));
  ev('S.day+=200');
  assert.equal(ev('hsVidF()'), 1.5, 'then 1.5 times what users pulled before');
  // Saves keep it.
  ev('const t=JSON.parse(JSON.stringify(S));S=sanitize(t);compute()');
  assert.ok(ev('!!S.hs.vid'));
  assert.deepEqual(errors, []);
});

test('video is mostly served at the edge, earns less per Gbps, and copies its uploads to the replica', () => {
  const { ev, errors } = cloud();
  const D0 = ev('R.hs.cc.DE.D');
  ev(`S.lvl=6;ACT.hsVidLaunch();S.day+=${200};compute()`);
  assert.ok(near(ev('R.hs.cc.DE.D'), D0 * 2.5), 'users pull 2.5 times as much');
  // Revenue: the 1.5x of video earns 30% a Gbps: 1.45 times as much in all (as served).
  const want = ev("S.hs.cc.DE.d*2.5*hsVidRev()*hsQ(R,'DE')*HS_RATE*hsRateF('DE')*cxMul('rev','DE')*hsFreshF(R)");
  assert.ok(near(ev("hsRev(R,'DE')"), want, 1e-6), 'revenue counts the video at its own price');
  assert.ok(near(ev('hsVidRev()') * 2.5, 1.45));
  // An edge stack at the door: the edge share grows from a quarter to (0.25 + 1.5 x 0.8) / 2.5 = 58%.
  ev(`S.hs.edge[S.home]=1;compute()`);
  assert.ok(near(ev('hsEdgeSh()'), (0.25 + 1.2) / 2.5));
  assert.ok(near(ev('R.hs.cc.DE.st'), ev('R.hs.cc.DE.D') * ev('hsEdgeSh()'), 1e-3), 'served at the door');
  // The card tells the audience and the edge share.
  ev('renderAll()');
  assert.match(ev('document.body.textContent'), /Tubular: .* of video, 100% of its audience · \d+% served by edge stacks near users\./);
  assert.deepEqual(errors, []);
});

// #474: a moratorium pauses new grid connections in a metro, and the refusal says to build elsewhere or build your own
// generation. Own generation that runs now powers a new region, an upgrade or the move out of a cage there, as far as
// its megawatts reach; the grid gives nothing new, the utility still takes no request, and no zone is built (M14).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
// A Server Barn in Frankfurt and in Amsterdam (20 MW each) on big grids, a moratorium in Amsterdam from today.
function cloud(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;S.rules=makeRules('freeze');ACT.buildPop({city:'ams'});ACT.buildPop({city:'par'});" +
    "HS_ZC.s=S;for(const k of ['DE','NL','FR'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);HS_LAKE[0]=99;for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','ams','par'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.ams={t:1,ready:0,mw:20};for(const c of ['fra','ams','par']){S.hs.pw[c]=hsPwDef(c);S.hs.pw[c].cap=hsTown(c)+500;}" +
    "S.hs.cc.DE={d:300,since:0};S.hs.cc.NL={d:100,since:0};S.links=[];" + wave('fa', 'fra', 'ams', 3) +
    "compute();hsDay(S.day);S.hs.law.mor.ams={a:S.day,f:S.day,u:S.day+300,m:0};S.hs.law.mor.par={a:S.day,f:S.day,u:S.day+300,m:0};S.log=[]");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const said = ev => ev("document.getElementById('toasts').textContent");
const solar = (ev, c, ready) => ev(`S.hs.pw[${lit(c)}].own.push({k:'sol',ready:${ready}})`);

test('#474 own generation that runs powers an upgrade during a moratorium; the grid alone does not', (t) => {
  const { ev, errors } = cloud(t);
  const c0 = ev('S.cash');
  ev("ACT.hsRegion({city:'ams'})");
  assert.equal(ev('S.hs.rg.ams.up'), undefined, 'no own generation: refused, though the grid has room');
  assert.equal(ev('S.cash'), c0);
  // A solar farm still being built does not count.
  solar(ev, 'ams', 'S.day+10');
  ev("ACT.hsRegion({city:'ams'})");
  assert.equal(ev('S.hs.rg.ams.up'), undefined, 'the solar farm is not running yet');
  // Once it runs, its 40 MW carry a Campus (60 MW, 40 more than the Barn).
  ev("S.hs.pw.ams.own[0].ready=S.day;ACT.hsRegion({city:'ams'})");
  assert.equal(J(ev, 'S.hs.rg.ams.up').t, 2, 'the upgrade starts on own generation');
  assert.ok(ev('S.cash') < c0);
  // The next step (a Gulch, 140 MW more) is more than the farm makes: refused, and the notice says by how much.
  ev("S.hs.rg.ams={t:2,ready:0,mw:60};document.getElementById('toasts').innerHTML='';ACT.hsRegion({city:'ams'})");
  assert.equal(ev('S.hs.rg.ams.up'), undefined);
  assert.match(said(ev), /your own generation has 40 MW to spare, and this needs 140 MW/i);
  // The utility still takes no request.
  ev("ACT.hsUtil({city:'ams'})");
  assert.equal(ev('S.hs.pw.ams.q'), null);
  assert.deepEqual(errors, []);
});

test('#474 a new region and the move out of a cage run on own generation in a moratorium; a zone never does (M14)', (t) => {
  const { ev, errors } = cloud(t);
  ev("ACT.hsRegion({city:'par'})");
  assert.equal(ev('S.hs.rg.par'), undefined, 'no own generation in Paris: no new region');
  // Own generation needs a region in the metro to build, so a running farm is set up directly.
  solar(ev, 'par', 0);
  ev("ACT.hsRegion({city:'par'})");
  assert.equal(ev('S.hs.rg.par.t'), 1, 'a Server Barn on the solar farm');
  // A cage moves out into a Barn on own generation too.
  ev("S.hs.rg.par={t:HS_CAGE,ready:0,mw:0};ACT.hsColoOut({city:'par'})");
  assert.equal(J(ev, 'S.hs.rg.par.up').t, 1);
  // A zone: no new building in the metro, own generation or not.
  solar(ev, 'ams', 0);
  ev("document.getElementById('toasts').innerHTML='';ACT.hsZone({city:'ams'})");
  assert.equal(J(ev, "S.hs.az.ams||[]").length, 0);
  assert.doesNotMatch(said(ev), /own generation/i, 'the zone refusal does not send you to build generation');
  assert.deepEqual(errors, []);
});

test('#474 the intern grows a region on own generation in a moratorium, and the plan says it can', (t) => {
  const { ev, errors } = cloud(t);
  ev("S.hs.cc.NL.d=1400;compute();hsDay(S.day);ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();S.ops.on.hsrg=true;S.ops.p.hsrg={at:70,how:'grow'};S.ops.cap.hsrg=1e7");
  assert.equal(ev("hpRgFix('ams').fix"), 'mor', 'without own generation the plan waits on the law');
  solar(ev, 'ams', 0);
  assert.equal(ev("hpRgFix('ams').fix"), 'up');
  // A cloud that earns well: the Campus's monthly price never takes the month into a loss (hsOpsAfford).
  ev('compute();R.revMo=R.costMo+1e7;opsDay(S.day)');
  assert.equal(J(ev, 'S.hs.rg.ams.up').t, 2, 'the intern grows Amsterdam on the solar farm');
  assert.deepEqual(errors, []);
});

// #472: a failover drill the NOC intern ran fails. The intern must not drain the same region again the next day (and
// the day after…): it says so loudly and leaves the pair alone until the order's interval has passed, while the
// player can still drill it by hand. Saves keep the failed drill's day.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)},day:-30});`;
// Regions in Frankfurt and Amsterdam, each the other's replica, behind a thin 10G wave and both nearly full (German users
// in Frankfurt, Dutch users in Amsterdam): every drill of the pair fails.
function cloud(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);HS_LAKE[0]=99;S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;S.rules=makeRules('freeze');ACT.buildPop({city:'ams'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','ams'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.ams={t:0,ready:0,mw:5};S.hs.cc.DE={d:1400,since:0};S.hs.cc.NL={d:400,since:0};S.hs.rep.fra='ams';S.hs.rep.ams='fra';S.links=[];" +
    wave('fa', 'fra', 'ams', 0) +
    "S.hs.pw.fra=hsPwDef('fra');S.hs.pw.fra.cap=1000;compute();hsDay(S.day);ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();S.log=[];" +
    "S.ops.on.hsdrill=true;S.ops.p.hsdrill={days:90,ready:false}");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const judge = ev => ev("S.day++;compute();hsDay(S.day);compute()");

test('#472 a failed drill is not run again every day by the intern, and the intern says so', (t) => {
  const { ev, errors } = cloud(t);
  ev('opsDay(S.day)');
  const dx = J(ev, 'S.hs.dx');
  assert.ok(dx && dx.c === 'ams' && dx.b === 'fra', 'the intern drills Amsterdam into Frankfurt: ' + JSON.stringify(dx));
  ev("document.getElementById('toasts').innerHTML=''");
  judge(ev);
  assert.deepEqual(J(ev, 'S.hs.drill'), {}, 'the drill failed');
  const pk = ev("hsPk('fra','ams')");
  assert.equal(J(ev, 'S.hs.dfail')[pk], ev('S.day'), 'the failure is remembered');
  const say = ev("document.getElementById('toasts').textContent");
  assert.match(say, /Drill failed/);
  assert.match(say, /Kevin won't drill Amsterdam ⇄ Frankfurt again for 90 days/);
  // Day after day: no new drill, no money spent.
  for (let i = 0; i < 5; i++) {
    const c = ev('S.cash');
    ev('opsDay(S.day)');
    assert.equal(J(ev, 'S.hs.dx'), null, 'no drill on day ' + i);
    assert.equal(ev('S.cash'), c);
    judge(ev);
  }
  // Once the order's interval has passed, the intern tries again.
  ev(`S.day=S.hs.dfail[${lit(pk)}]+90;compute()`);
  ev('opsDay(S.day)');
  assert.equal(J(ev, 'S.hs.dx').c, 'ams');
  // The player may still drill it by hand at any time.
  const B = cloud(t);
  B.ev("S.hs.dfail={[hsPk('fra','ams')]:S.day};ACT.hsDrill({city:'fra'})");
  assert.equal(J(B.ev, 'S.hs.dx').c, 'fra');
  for (const e of [errors, B.errors]) assert.deepEqual(e, []);
});

test('#472 a failed drill with no intern on drills says nothing about the intern', (t) => {
  const { ev, errors } = cloud(t);
  ev("S.ops.on.hsdrill=false;ACT.hsDrill({city:'fra'});document.getElementById('toasts').innerHTML=''");
  judge(ev);
  const say = ev("document.getElementById('toasts').textContent");
  assert.match(say, /Drill failed/);
  assert.doesNotMatch(say, /won't drill/);
  assert.deepEqual(errors, []);
});

test('#472 saves keep failed drills; old saves and junk load', (t) => {
  const { ev, errors } = cloud(t);
  ev("S.hs.dfail={[hsPk('fra','ams')]:12,'fra|zzz':3,'fra|ams':4,x:5}");
  const back = J(ev, "(()=>{const s=sanitize(JSON.parse(JSON.stringify(S)));return s.hs.dfail})()");
  assert.deepEqual(back, { [ev("hsPk('fra','ams')")]: 12 });
  const old = J(ev, "(()=>{const o=JSON.parse(JSON.stringify(S));delete o.hs.dfail;return sanitize(o).hs.dfail})()");
  assert.deepEqual(old, {});
  assert.deepEqual(errors, []);
});

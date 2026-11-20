// The Hyperscaler's leased colo cages (60-features/38-hyper-zones.js): a cage opens in about two weeks for a small setup
// fee, costs a lease and the provider's power bill every month and draws nothing from your grid; it is a live region for
// replication, failover, drills, levels and Cloud Nine; it never grows in place and takes no zones; moving out into your
// own Server Barn keeps its users and tenants where they are and ends the lease; a moratorium stops the move, not the
// lease; saves; the Cloud tab at 360 px and on a desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
/* Frankfurt (home: the free Rack Shack) with German users (300G), a POP in Paris with transit and French users (200G),
   fat waves between them. Level 2: cages allowed, two regions. */
function net(t, lv = 2) {
  const h = load({ seed: 11 });
  t.after(() => h.dom.window.close());
  h.ev(`ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=${lv};S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'lon'});` +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','lon'])ACT.buyTransit({city:c,net:'cog',tier:4});" +
    "S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:200,since:0};S.links=[];" + wave('fp', 'fra', 'par', 4) + wave('fp2', 'fra', 'par', 4) + wave('pl', 'par', 'lon', 4) +
    'compute();hsDay(S.day);checkGoals();compute();checkGoals();S.log=[]');
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
// Days go by until the cage (or whatever else) opens.
const days = (ev, n) => ev(`for(let i=0;i<${n};i++)dayTick();compute()`);

test('a cage opens in two weeks for a small setup fee, then costs a lease and its power every month, none of it from your grid', (t) => {
  const { ev, errors } = net(t);
  const c0 = ev('S.cash'), free0 = ev("hsMwFree('par')"), cost0 = ev('R.cost.cloud');
  ev("ACT.hsColo({city:'par'})");
  assert.equal(c0 - ev('S.cash'), 40000, 'a setup fee, not a Server Barn');
  assert.equal(ev('S.hs.rg.par.t'), ev('HS_CAGE'));
  assert.equal(ev('S.hs.rg.par.ready-S.day'), ev('leadDays(14)'));
  assert.ok(ev('leadDays(14)') < ev('leadDays(HS_T[1].days)') / 3, 'much faster than a Barn');
  assert.equal(ev("hsLive('par')"), false, 'not yet');
  days(ev, ev('leadDays(14)'));
  assert.equal(ev("hsLive('par')"), true, 'live after two weeks');
  assert.equal(ev('R.hs.rg.par.g'), 600);
  assert.equal(ev("hsSlots('par')"), 3);
  assert.equal(ev("hsMwUsed('par')"), 0, 'the provider\'s power, not your grid');
  assert.equal(ev("hsMwFree('par')"), free0, 'the metro\'s grid budget untouched');
  assert.equal(ev("hsCut('par')"), 1, 'never cut by your grid');
  const pw = ev("hsColoPw('par')");
  assert.ok(pw > 0, 'the provider bills its power');
  assert.equal(pw, Math.round(ev('(HS_COLO_MW)*hsColoPrice("par")')), 'four MW at the metro price plus the markup');
  assert.equal(ev("hsColoPrice('par')"), Math.round(ev("hsPwPrice('par')") * 1.4));
  assert.equal(Math.round(ev('R.cost.cloud') - cost0), 30000 + pw, 'the lease and the power, every month');
  // A tenant in the cage draws on the provider too, and the bill shows it.
  ev("S.offers.push(hsOffer('startup','par',5));ACT.accept({id:S.offers[S.offers.length-1].id});compute()");
  assert.equal(ev("S.biz.find(b=>b.type==='cloud').rg"), 'par');
  assert.equal(ev("hsMwUsed('par')"), 0);
  assert.equal(ev("hsColoPw('par')"), Math.round(ev('(HS_COLO_MW+HS_MW_SLOT)*hsColoPrice("par")')));
  assert.deepEqual(errors, []);
});

test('a cage is a region: replication, failover, a drill, levels and Cloud Nine count it', (t) => {
  const { ev, errors } = net(t);
  ev("ACT.hsColo({city:'par'})");
  days(ev, ev('leadDays(14)'));
  assert.deepEqual(J(ev, 'hsRgs()'), ['fra', 'par']);
  assert.equal(ev('lvPlaces()'), 2, 'two regions for the level ladder');
  assert.ok(ev('hsRgBuilt().includes("par")'), 'and for Cloud Nine\'s continents');
  ev("ACT.hsReplica({city:'fra',v:'par'});compute()");
  assert.equal(ev('R.hs.rep.fra.b'), 'par', 'Frankfurt replicates into the cage');
  assert.ok(ev('R.hs.rep.fra.got') > 0);
  assert.equal(ev("hsFailReady('fra','par')"), true, 'the cage has room for Germany');
  // A drill: Frankfurt drained into the cage for a day, and passed.
  ev("ACT.hsDrill({city:'fra'})");
  assert.equal(J(ev, 'S.hs.dx').b, 'par');
  days(ev, 2);
  assert.ok(ev("S.hs.drill['fra|par']") > 0, 'the drill passed');
  // A real failure fails over into it.
  ev("hsRegionFail('fra',2,'test');compute()");
  assert.equal(ev('R.hs.fo.fra'), 'par');
  assert.deepEqual([...new Set(J(ev, 'R.hs.cc.DE.parts.filter(p=>p[3]).map(p=>p[3])'))], ['par']);
  // It counts toward the regions your level allows, too.
  ev("S.lvl=2;ACT.hsColo({city:'lon'});ACT.buildPop({city:'ams'});ACT.hsColo({city:'ams'})");
  assert.equal(ev('S.hs.rg.lon.t'), ev('HS_CAGE'));
  assert.equal(ev('S.hs.rg.ams'), undefined, 'level 2 runs three regions, cages included');
  assert.deepEqual(errors, []);
});

test('a cage never grows in place and takes no zones; moving out keeps users and tenants and ends the lease', (t) => {
  const { ev, errors } = net(t);
  ev("ACT.hsColo({city:'par'})");
  days(ev, ev('leadDays(14)'));
  ev("S.offers.push(hsOffer('startup','par',5));ACT.accept({id:S.offers[S.offers.length-1].id});compute();hsDay(S.day)");
  const id = ev("S.biz.find(b=>b.type==='cloud').id");
  assert.equal(ev('S.hs.cc.FR.home'), 'par');
  const c0 = ev('S.cash');
  ev("ACT.hsRegion({city:'par'})");
  assert.equal(ev('S.hs.rg.par.t'), ev('HS_CAGE'), 'no upgrade in place');
  assert.equal(ev('S.hs.rg.par.up'), undefined);
  ev("ACT.hsZone({city:'par'})");
  assert.equal(ev('S.hs.az.par'), undefined, 'no zones in a cage');
  assert.equal(ev('S.cash'), c0, 'and nothing paid for either');
  // The plan's fix for a full cage is moving out.
  ev("S.hs.cc.FR.d=590;HP.k='';compute()");
  assert.equal(ev("(hp().P.find(x=>x.k==='rg'&&x.c==='par')||{}).fix"), 'move');
  ev("S.hs.cc.FR.d=200;compute()");
  // Moving out: a Server Barn of your own, built while the cage serves.
  ev("ACT.hsColoOut({city:'par'})");
  assert.equal(c0 - ev('S.cash'), ev('HS_T[1].cost'));
  assert.deepEqual(J(ev, 'S.hs.rg.par.up'), { t: 1, ready: ev('S.day+leadDays(HS_T[1].days)') });
  assert.ok(ev("hsMwRes('par')") >= 20, 'the Barn holds its megawatts on your grid');
  assert.equal(ev("hsLive('par')"), true, 'the cage serves meanwhile');
  ev("ACT.hsColoOut({city:'par'})");
  assert.equal(c0 - ev('S.cash'), ev('HS_T[1].cost'), 'only once');
  const left = ev('S.hs.rg.par.up.ready-S.day');
  days(ev, left);
  assert.equal(ev('S.hs.rg.par.t'), 1, 'your own Server Barn');
  assert.equal(ev('S.hs.rg.par.up'), undefined);
  assert.equal(ev(`S.biz.find(b=>b.id===${lit(id)}).rg`), 'par', 'the tenant stayed');
  assert.equal(ev('S.hs.cc.FR.home'), 'par', 'and so did the users');
  assert.equal(ev("hsColoPw('par')"), 0, 'the provider\'s power bill ended');
  assert.ok(ev("hsMwUsed('par')") >= 20, 'your own grid now');
  assert.equal(ev('R.hs.rg.par.g'), 1500);
  ev("ACT.hsZone({city:'par'})");
  assert.equal(ev('S.hs.az.par.length'), 1, 'and now it may have zones');
  assert.deepEqual(errors, []);
});

test('a moratorium stops the move out, not the lease; a cage needs a POP, a region metro and its level', (t) => {
  const { ev, errors } = net(t, 1);
  ev("ACT.hsColo({city:'par'})");
  assert.equal(ev('S.hs.rg.par'), undefined, 'not at level 1');
  ev("S.lvl=2;S.hs.law.mor.par={a:S.day,f:S.day,u:S.day+300,m:0};ACT.hsColo({city:'par'})");
  assert.equal(ev('S.hs.rg.par.t'), ev('HS_CAGE'), 'the provider\'s building is connected already');
  days(ev, ev('leadDays(14)'));
  const c0 = ev('S.cash');
  ev("ACT.hsColoOut({city:'par'})");
  assert.equal(ev('S.hs.rg.par.up'), undefined, 'no new grid connection for your own Barn');
  assert.equal(ev('S.cash'), c0);
  ev("S.lvl=5;ACT.hsColo({city:'mad'})");
  assert.equal(ev('S.hs.rg.mad'), undefined, 'no POP in Madrid');
  assert.deepEqual(errors, []);
});

test('saves: a cage and its move out survive a round trip, nothing on the ladder grows into a cage', (t) => {
  const { ev, errors } = net(t);
  ev("ACT.hsColo({city:'par'})");
  days(ev, ev('leadDays(14)'));
  ev("ACT.hsColoOut({city:'par'})");
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  assert.deepEqual(back.hs.rg, s.hs.rg);
  assert.equal(back.hs.rg.par.up.t, 1);
  const junk = { ...s, hs: { ...s.hs, rg: { fra: { t: 3, ready: 0, up: { t: 4, ready: 9 } }, par: { t: 4, ready: 'x', up: { t: 3, ready: 7 } } } } };
  const m = J(ev, `migrate(${JSON.stringify(junk)})`);
  assert.deepEqual(m.hs.rg.fra, { t: 3, ready: 0, mw: 200 }, 'a Gulch never grows into a cage');
  assert.deepEqual(m.hs.rg.par, { t: 4, ready: 0, up: { t: 1, ready: 7 }, mw: 0 }, 'a cage only ever moves into a Server Barn');
  ev(`S=migrate(${JSON.stringify(s)});compute();for(let i=0;i<3;i++)dayTick()`);
  assert.deepEqual(errors, []);
});

test('the cage sections and the plan render on a phone and a desktop, two buttons a row at most', (t) => {
  const { ev, dom, errors } = net(t);
  const doc = dom.window.document;
  const sec = () => doc.querySelector('#panel [data-sec="hsaz"]');
  for (const [w, h] of [[360, 740], [740, 360], [1280, 800]]) {
    ev(`innerWidth=${w};innerHeight=${h};ACT.focusCity({city:'par'});UI.tab='cust';ACT.panelFold({k:'s:hsaz',o:1});renderAll()`);
    assert.match(sec().textContent, /Lease a cage[\s\S]*a region in two weeks[\s\S]*600 Gbps, 3 compute slots/);
    assert.ok(sec().querySelector('[data-act="hsColo"]:not([disabled])'));
    assert.ok([...doc.querySelectorAll('#panel .btns')].every((b) => b.querySelectorAll('button').length <= 2), `rows of two (${w})`);
  }
  ev("ACT.hsColo({city:'par'})");
  days(ev, ev('leadDays(14)'));
  for (const [w, h] of [[360, 740], [1280, 800]]) {
    ev(`innerWidth=${w};innerHeight=${h};ACT.focusCity({city:'par'});UI.tab='cust';ACT.panelFold({k:'s:hsaz',o:1});ACT.panelFold({k:'s:hspw',o:1});renderAll()`);
    assert.match(sec().textContent, /Leased cage[\s\S]*their building, their power[\s\S]*Move out \(\$400k\)/);
    assert.match(doc.getElementById('panel').textContent, /Power comes from .+'s own supply, not your grid/);
    assert.ok([...doc.querySelectorAll('#panel .btns')].every((b) => b.querySelectorAll('button').length <= 2), `rows of two (${w})`);
    ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderAll()");
    assert.match(doc.querySelector('#leftBody .hsc').textContent, /Cage in Paris at /);
  }
  assert.deepEqual(errors, []);
});

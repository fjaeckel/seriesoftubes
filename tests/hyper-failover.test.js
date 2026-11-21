// The Hyperscaler's failures, phase 4 (38-hyper-failover.js): a failed region's users and tenants go to its replica and
// only there, as far as it has room and the backbone carries them (a failover never invents capacity); backlog over the
// limit at the moment of failure is lost data; outages come as incidents (their own kind, a dark POP, a tripped grid,
// Chaos Kong) and never in a classic game; drills drain a region on purpose and pass or fail with a reason; failover
// readiness for the NOC; saves; and the card and Cloud tab on a phone and a desktop.
// These mechanics tests pin each country's users to its main city (one user zone); zones have their own test
// (hyper-zones-users.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
/* Regions in Frankfurt (home, a Server Barn: 1.5T), Paris and Amsterdam (Rack Shacks: 400G each), with transit at
   each. German users (300G) call Frankfurt home, French users (200G) Paris. Waves: Frankfurt–Paris (tier fp),
   Frankfurt–Amsterdam and Amsterdam–Paris 800G. Frankfurt's replica is pinned to Amsterdam. */
// The director (38-hyper-director.js) lets whole-region failures in from day HS_DIR_BIG, at their level, once introduced,
// with budget to spend: these tests start past all of it.
const DIR = 'S.day=Math.max(S.day,HS_DIR_BIG);Object.assign(S.hs.dir,{b:9,t:S.day,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});';
function net(t, fp = 3) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','ams'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.par={t:0,ready:0,mw:5};S.hs.rg.ams={t:0,ready:0,mw:5};S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:200,since:0};S.hs.rep.fra='ams';S.links=[];" +
    wave('fp', 'fra', 'par', fp) + wave('fa', 'fra', 'ams', 3) + wave('ap', 'ams', 'par', 3) + DIR + 'compute();hsDay(S.day);checkGoals();S.log=[]');
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const regionsOf = (ev, cc) => J(ev, `R.hs.cc.${cc}.parts.filter(p=>p[3]).map(p=>p[3])`);

test('a failed region\'s users and tenants fail over to its replica, and only there', (t) => {
  const { ev, errors } = net(t);
  assert.equal(ev('S.hs.cc.DE.home'), 'fra');
  ev("S.offers.push(hsOffer('startup','fra',10));ACT.accept({id:S.offers[0].id});compute()");
  assert.equal(ev('S.biz[0].rg'), 'fra');
  ev("hsRegionFail('fra',2,'test');compute()");
  assert.equal(ev("hsLive('fra')"), false);
  assert.equal(ev("hsOut('fra')"), true);
  assert.equal(ev('R.hs.fo.fra'), 'ams', 'its replica takes over');
  assert.deepEqual([...new Set(regionsOf(ev, 'DE'))], ['ams'], 'Germany is served from Amsterdam only, though Paris is nearer by backbone');
  assert.equal(ev('R.hs.ten[S.biz[0].id].r'), 'ams', 'so is the tenant');
  assert.equal(ev('S.biz[0].rg'), 'fra', 'the tenant keeps its home region');
  // The days go by: Germany keeps Frankfurt as its home while visiting, then comes back.
  ev('dayTick()');
  assert.equal(ev('S.hs.cc.DE.home'), 'fra');
  assert.equal(ev("S.inc.some(i=>i.type==='region'&&i.ref==='fra')"), true, 'an incident like any other');
  ev('dayTick();dayTick()');
  assert.equal(ev("hsLive('fra')"), true);
  assert.deepEqual([...new Set(regionsOf(ev, 'DE'))], ['fra']);
  assert.equal(ev('S.hs.down.fra'), undefined);
  assert.deepEqual(errors, []);
});

test('a failover never invents capacity: no room or no backbone at the replica, and users go without', (t) => {
  const { ev, errors } = net(t);
  // Amsterdam (400G) with 300G of its own Dutch users has 100G left for Germany's 300G.
  ev("S.hs.cc.NL={d:300,since:0};compute();hsDay(S.day)");
  assert.equal(ev('S.hs.cc.NL.home'), 'ams');
  const I = J(ev, "hsFailInfo('fra')");
  assert.equal(I.b, 'ams');
  assert.ok(I.room < I.need, 'not enough room: ' + JSON.stringify(I));
  assert.equal(ev("hsFailReady('fra')"), false);
  ev("hsRegionFail('fra',2,'test');compute()");
  const de = J(ev, 'R.hs.cc.DE');
  assert.ok(de.short > 150, 'what Amsterdam has no room for is not served: ' + de.short);
  assert.ok(J(ev, 'R.hs.rg.ams').load <= 400 + 1e-6, 'Amsterdam serves no more than it has');
  assert.ok(ev("hsQ(R,'DE')") < 0.5);
  assert.equal(ev("R.hs.cc.DE.parts.some(p=>p[3]==='par')"), false, 'Paris, with room to spare, is not its replica');
  // Room, but no backbone: Amsterdam alone and joined by a thin wave.
  ev("delete S.hs.cc.NL;S.hs.down={};S.hs.out={};S.inc=[];S.links=S.links.filter(l=>l.id!=='fa'&&l.id!=='ap');" + wave('fa2', 'fra', 'ams', 0) + 'compute()');
  const I2 = J(ev, "hsFailInfo('fra')");
  assert.ok(I2.room >= I2.need && I2.bw < I2.need, 'room, no backbone: ' + JSON.stringify(I2));
  assert.equal(ev("hsFailReady('fra')"), false);
  assert.deepEqual(errors, []);
});

test('backlog over the limit at the moment of failure is lost data: users leave, a fine, a headline', (t) => {
  const { ev, errors } = net(t);
  const cash = ev('S.cash'), fr = ev('S.hs.cc.FR.d');
  ev("S.hs.lag['fra>ams']=30;hsRegionFail('fra',1,'test')");
  assert.equal(ev('S.hs.flost'), 0, '30 TB is under the limit');
  assert.equal(ev('S.hs.cc.DE.d'), J(ev, 'S.hs.cc.DE').d);
  assert.equal(ev('S.hs.out.fra.lost'), 0);
  ev("S.hs.out={};S.hs.down={};S.inc=[];compute();const d0=S.hs.cc.DE.d;S.hs.lag['fra>ams']=500;S.hs.lag['par>fra']=999;window.__d0=d0;hsRegionFail('fra',1,'test')");
  assert.equal(ev('S.hs.flost'), 1);
  assert.ok(Math.abs(ev('S.hs.cc.DE.d') - ev('__d0') * 0.8) < 1e-6, 'a fifth of the users homed there leave');
  assert.equal(ev('S.hs.cc.FR.d'), fr, 'users homed elsewhere stay');
  assert.equal(ev("S.hs.lag['fra>ams']"), undefined, 'the backlog is gone with them');
  assert.equal(ev("S.hs.lag['par>fra']"), 999, 'what Paris owes Frankfurt is not');
  assert.ok(cash - ev('S.cash') >= Math.min(ev('HS_LOSS_FEE'), ev('R.revMo')) - 1, 'a fine: the base, or a month of revenue for a young cloud');
  assert.match(ev("(S.log||[]).map(x=>x.t).join(' ')"), /📰|BREAKING|HEADLINE|SCANDAL|TRAGEDY/);
  // When it is back, it does not count as survived.
  ev('S.hs.down.fra=0;dayTick()');
  assert.equal(ev('S.hs.fsv'), 0);
  assert.deepEqual(errors, []);
});

test('outages are incidents: their own failure kind, a dark POP, a tripped grid, Chaos Kong; never in a classic game', (t) => {
  const { ev, errors } = net(t);
  assert.equal(ev('hsFailOn()'), true);
  ev("fireFailure('region')");
  const inc = J(ev, "S.inc.find(i=>i.type==='region')");
  assert.ok(inc && ['fra', 'par', 'ams'].includes(inc.ref), 'a region failed: ' + JSON.stringify(inc));
  assert.ok(ev(`S.hs.down[${lit(inc.ref)}]`) > ev('S.day'));
  assert.equal(ev("incTitle('region')"), 'Region down');
  // Rush repair: back at once.
  ev(`ACT.fixInc({id:${lit(inc.id)}})`);
  assert.equal(ev(`S.hs.down[${lit(inc.ref)}]`), undefined);
  assert.equal(ev(`hsLive(${lit(inc.ref)})`), true);
  // A router crash at a region's POP is a region failure too: its users go to the replica.
  ev("S.pops.fra.down=S.day+2;compute();hsFailDay(S.day)");
  assert.equal(ev('R.hs.fo.fra'), 'ams');
  assert.ok(ev('!!S.hs.out.fra'));
  ev('S.pops.fra.down=0;compute();hsFailDay(S.day)');
  assert.equal(ev('!!S.hs.out.fra'), false);
  // A grid cut deep enough trips the region (only with chaos on), announced the day before (38-hyper-director.js).
  const trip = "S.hs.dir.c=null;S.hs.dir.q=0;let d=S.day+1;while(hstr(S.asn+'|trip|ams|'+d)%1000>=250)d++;S.day=d;hsFailDay(d);S.day=d+1;hsFailDay(d+1)";
  ev("hsPwMk('ams').cap=1;S.inc=[];" + trip);
  assert.ok(ev("S.inc.some(i=>i.type==='region'&&i.ref==='ams')"), 'a deep cut trips the grid');
  ev("S.hs.down={};S.hs.out={};S.inc=[];S.hs.pw.ams.cap=hsGrid('ams');S.rules.chaos='none';S.hs.pw.ams.cap=1;" + trip);
  assert.equal(ev("S.inc.some(i=>i.type==='region')"), false, 'no chaos, no trips');
  ev("S.rules.chaos='normal';S.hs.pw.ams.cap=hsGrid('ams');compute()");
  // Chaos Kong takes out a whole region instead of a snip.
  ev("S.monkey={on:1,start:S.day,until:S.day+99,snip:S.day,n:0,hurt:0,c:'fra'};S.inc=[];runNow(hsKongRun())");
  assert.equal(ev("S.inc.filter(i=>i.type==='region').length"), 1);
  assert.equal(ev('S.monkey.n'), 1);
  // A classic game never meets any of it.
  const c = load({ seed: 7 });
  t.after(() => c.dom.window.close());
  c.ev("ACT.start({});ACT.charter({k:'global'});ACT.buildPop({city:'par'});S.monkey={on:1,start:0,until:99,snip:0,n:0,hurt:0,c:'fra'}");
  assert.equal(c.ev('hsFailOn()'), false);
  assert.equal(c.ev('hsKong()'), false);
  for (let i = 0; i < 40; i++) c.ev('fireFailure()');
  assert.equal(c.ev("S.inc.some(i=>i.type==='region')"), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(c.errors, []);
});

test('drills: a day drained on purpose, passed or failed with a reason', (t) => {
  const { ev, errors } = net(t);
  const cash = ev('S.cash');
  ev("ACT.hsDrill({city:'fra'})");
  assert.equal(cash - ev('S.cash'), ev('HS_DRILL'));
  assert.deepEqual(J(ev, 'S.hs.dx'), { c: 'fra', b: 'ams', d: ev('S.day') + 1 });
  assert.equal(ev("hsLive('fra')"), false, 'drained at once');
  assert.deepEqual([...new Set(regionsOf(ev, 'DE'))], ['ams']);
  assert.match(ev("hsDrillWhy('par')"), /already under way/);
  ev('dayTick()');
  assert.equal(ev('S.hs.dx'), null);
  assert.equal(ev("S.hs.drill['ams|fra']"), ev('S.day'), 'passed');
  assert.equal(ev('S.hs.flost'), 0, 'a drill is no failure');
  assert.equal(ev('!!S.hs.out.fra'), false);
  assert.equal(ev("hsLive('fra')"), true);
  // Failed: Amsterdam too full, the backbone too thin, the backlog too big.
  const fail = (setup) => { ev(setup + ";S.hs.dx=null;ACT.hsDrill({city:'fra'});dayTick()"); return ev("(S.log||[]).find(x=>/Drill failed/.test(x.t)).t"); };
  assert.match(fail("S.hs.cc.NL={d:350,since:0};compute();hsDay(S.day)"), /ran out of room/);
  ev('delete S.hs.cc.NL;S.hs.cc.DE.d=300;compute();hsDay(S.day)');
  assert.match(fail("S.log=[];S.links=S.links.filter(l=>l.id!=='fa'&&l.id!=='ap');" + wave('fa2', 'fra', 'ams', 0) + 'compute()'), /could not carry/);
  ev("S.log=[];S.links=S.links.filter(l=>l.id!=='fa2');" + wave('fa', 'fra', 'ams', 4) + "compute()");
  assert.match(fail("S.hs.lag['fra>ams']=5e5"), /still owed its replica/);
  // No replica, no drill; nor while down.
  ev("S.hs.lag={};delete S.hs.rg.ams;delete S.hs.rg.par;delete S.hs.rep.fra;compute()");
  assert.match(ev("hsDrillWhy('fra')"), /second region/);
  assert.deepEqual(errors, []);
});

test('surviving a real failure: no data lost and users served well while it lasted', (t) => {
  const { ev, errors } = net(t);
  ev("hsRegionFail('fra',2,'test');compute()");
  assert.ok(ev("hsQ(R,'DE')") >= 0.9, 'Amsterdam carries Germany: ' + ev("hsQ(R,'DE')"));
  for (let i = 0; i < 3; i++) ev('dayTick()');
  assert.equal(ev('S.hs.fsv'), 1);
  assert.notEqual(ev('S.done.hs_survive'), undefined, 'the goal');
  assert.deepEqual(errors, []);
});

test('saves: outages and drills repaired against the regions the save has; classic saves carry none of it', (t) => {
  const { ev, errors } = net(t);
  ev("ACT.hsDrill({city:'fra'});S.hs.drill['ams|par']=3;hsRegionFail('par',3,'test');S.hs.bpk=1234;compute()");
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  for (const k of ['down', 'drill', 'dx', 'out', 'fsv', 'flost', 'bpk']) assert.deepEqual(back.hs[k], s.hs[k], k);
  const junk = { ...s, hs: { ...s.hs, down: { par: 'x', zzz: 9, ams: 7 }, drill: { 'par|ams': 1, 'ams|par': 'y', 'ams|fra|x': 2, 'fra|nyc': 3 }, dx: { c: 'fra', b: 'fra', d: 1 }, out: { fra: 'z', ams: { d: 'q', lost: 'yes', q: 7, n: -2 } }, fsv: -1, flost: 'many', bpk: 'lots' } };
  const m = J(ev, `migrate(${JSON.stringify(junk)})`);
  assert.deepEqual(m.hs.down, { ams: 7 });
  assert.deepEqual(m.hs.drill, { 'ams|par': 0 });
  assert.equal(m.hs.dx, null);
  assert.deepEqual(m.hs.out, { ams: { d: 0, lost: 1, q: 1, n: 0 } });
  assert.deepEqual([m.hs.fsv, m.hs.flost, m.hs.bpk], [0, 0, 0]);
  const o = J(ev, `migrate(${JSON.stringify({ ...s, hs: { cc: {}, rg: s.hs.rg } })})`);
  assert.deepEqual([o.hs.down, o.hs.drill, o.hs.dx, o.hs.out, o.hs.fsv, o.hs.flost, o.hs.bpk], [{}, {}, null, {}, 0, 0, 0], 'an older Hyperscaler save gets the defaults');
  assert.equal(J(ev, `migrate(${JSON.stringify({ ...s, charter: 'global' })})`).hs, undefined);
  assert.deepEqual(errors, []);
});

test('the failover card and Cloud tab render on a phone and on a desktop', (t) => {
  const { ev, dom, errors } = net(t);
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};S.hs.dx=null;S.hs.down={};S.hs.out={};compute();selectCity('fra');UI.tab='cust';renderAll()`);
    const panel = dom.window.document.getElementById('panelBody').textContent;
    assert.match(panel, /Failover/);
    assert.match(panel, /Room in Amsterdam/);
    assert.match(panel, /Failover ready/);
    assert.match(panel, /Run a drill/);
    assert.match(panel, /Data residency/, 'Germany is in the EU');
    assert.match(ev('hsCard()'), /never been drilled/);
    assert.match(ev('hsCard()'), /Regions on 1 of 5 continents/);
    ev("hsRegionFail('fra',2,'test');compute();renderAll()");
    assert.match(ev('hsCard()'), /Frankfurt is down until .*: its users run on Amsterdam/);
    assert.match(dom.window.document.getElementById('panelBody').textContent, /Frankfurt is down/);
    ev("S.hs.down={};S.hs.out={};S.inc=[];ACT.hsDrill({city:'fra'});renderAll()");
    assert.match(ev('hsCard()'), /Drill: Frankfurt drained into Amsterdam/);
    assert.match(dom.window.document.getElementById('panelBody').textContent, /Drill under way/);
  }
  assert.deepEqual(errors, []);
});

// Users grow into every Gbps a region has, so a replica has room for a failover only if it holds some back: room held
// for failover (S.hs.hold) keeps free what the regions replicating to it carried, and is released when they fail over.
test('room held in a replica keeps its partner\'s load free, users never grow into it, and a failover uses it', (t) => {
  const { ev, errors } = net(t);
  // Amsterdam full of Dutch users: no room for Frankfurt's failover.
  ev("S.hs.rg.ams={t:2,ready:0,mw:60};S.hs.pw.ams=hsPwDef('ams');S.hs.pw.ams.cap=1000;S.hs.cc.NL={d:8000,since:0};HS_ZC.m.set('NL',[['ams',1]]);for(const l of S.links)l.tier=LT.length-1;compute();compute()");
  assert.ok(ev("R.hs.rg.ams.g-R.hs.rg.ams.load") < 1, 'Amsterdam is full');
  assert.equal(ev("hsFailReady('fra')"), false);
  ev("ACT.hsHold({city:'ams'});compute()");
  const need = ev('R.hs.rg.fra.load'), res = ev('R.hs.rg.ams.res');
  const all = ev("hsRgs().filter(c=>c!=='ams'&&R.hs.rg[c].rep==='ams').reduce((a,c)=>a+R.hs.rg[c].load,0)");
  assert.ok(Math.abs(res - all) < 1 && res >= need, `Amsterdam holds what replicates to it: ${res} for ${all}`);
  assert.ok(ev("R.hs.rg.ams.g-R.hs.rg.ams.load") >= need - 0.5, 'the room stays free');
  assert.equal(ev("hsFailReady('fra')"), true, 'so the failover is ready');
  assert.ok(ev('R.hs.cc.NL.short') > 0, 'the Dutch users do not grow into it');
  // Frankfurt fails: the held room is released for it, and its users are served in Amsterdam.
  ev("hsRegionFail('fra',2,'test');compute()");
  assert.equal(ev('R.hs.rg.ams.res'), 0, 'released while its partner is failed over');
  const de = J(ev, 'R.hs.cc.DE');
  assert.ok(de.parts.every((p) => p[3] === 'ams') && de.short < 0.5, 'every German placed in Amsterdam\'s held room, none short');
  // The section says so, and the room can be released; saves keep the choice.
  ev("S.hs.down={};S.hs.out={};compute();window.innerWidth=360;selectCity('fra');UI.tab='cust';renderAll()");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Amsterdam holds .* free for failover/);
  ev("const t=JSON.parse(JSON.stringify(S));S=sanitize(t);compute()");
  assert.equal(ev('S.hs.hold.ams'), 1);
  ev("ACT.hsHold({city:'ams'})");
  assert.equal(ev('S.hs.hold.ams'), undefined);
  assert.deepEqual(errors, []);
});

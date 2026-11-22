// The NOC intern at a Hyperscaler (95-hyper-orders.js): five orders only a cloud sees (regions, waves for the backlog,
// failover drills, protests, zones after local outages), run through the player's own clicks within their budgets, never during a launch freeze;
// the classic order with nothing to do here hidden, and the classic game's orders untouched; the intern's cloud moods;
// saves; and the Ops sheet on a phone and a desktop.
// These mechanics tests pin each country's users to its main city (one user zone); zones have their own test
// (hyper-zones-users.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)},day:-30});`;
/* Regions in Frankfurt (home, a Server Barn: 1.5T), Paris and Amsterdam (Rack Shacks), transit at each, German users
   (1.4T, nearly filling Frankfurt) and French users; Frankfurt replicates to Amsterdam over a thin 10G wave. An intern
   with every order off, no cash floor and Change Freeze rules (no fat fingers, no outages). */
function cloud(t, seed = 7) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);HS_LAKE[0]=99;S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;S.rules=makeRules('freeze');ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','ams'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.par={t:0,ready:0,mw:5};S.hs.rg.ams={t:0,ready:0,mw:5};S.hs.cc.DE={d:1400,since:0};S.hs.cc.FR={d:100,since:0};S.hs.rep.fra='ams';S.links=[];" +
    wave('fa', 'fra', 'ams', 0) + wave('fp', 'fra', 'par', 3) + wave('ap', 'ams', 'par', 3) +
    "S.hs.pw.fra=hsPwDef('fra');S.hs.pw.fra.cap=1000;compute();hsDay(S.day);ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();S.log=[]");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const on = (ev, k, p = {}, cap) => ev(`S.ops.on.${k}=true;S.ops.p.${k}=${lit(p)};${cap === undefined ? '' : `S.ops.cap.${k}=${cap};`}`);
const shift = ev => ev('opsDay(S.day)');
const cash = ev => ev('S.cash');
const did = (ev, k) => J(ev, `(S.ops.log[0]||{r:[]}).r.filter(x=>x[0]===${lit(k)})`);

test('a cloud\'s intern has four orders of its own and no caches order; a classic game has none of them', (t) => {
  const { ev, errors } = cloud(t);
  const shown = J(ev, 'OPS.filter(d=>opsUse(d.k)).map(d=>d.k)');
  for (const k of ['hsrg', 'hswave', 'hsdrill', 'hsfund']) assert.ok(shown.includes(k), k);
  assert.ok(!shown.includes('caches'), 'a Hyperscaler has no eyeballs for free caches');
  assert.ok(ev("OPS_POP.includes('hsrg')"), 'the region order can be switched off per POP');
  const c = load({ seed: 3 });
  t.after(() => c.dom.window.close());
  c.ev("ACT.start({});S.cash=1e8;S.lvl=3;compute()");
  const classic = J(c.ev, 'OPS.filter(d=>opsUse(d.k)).map(d=>d.k)');
  assert.ok(classic.includes('caches'));
  for (const k of ['hsrg', 'hswave', 'hsdrill', 'hsfund']) assert.ok(!classic.includes(k), k + ' never shows in a classic game');
  // Switched on in a classic game by a bad save, they do nothing and draw no random numbers.
  c.ev("ACT.opsHire({id:'kevin'});S.ops.floor=0;S.rules=makeRules('freeze');for(const k of ['hsrg','hswave','hsdrill','hsfund'])S.ops.on[k]=true");
  assert.equal(c.ev("window.__n=0;window.__r=Math.random;Math.random=()=>{__n++;return __r()};const s=JSON.stringify([S.cash,S.links,S.pops]);opsDay(S.day);Math.random=__r;s===JSON.stringify([S.cash,S.links,S.pops])&&__n===0"), true);
  assert.deepEqual(errors, []); assert.deepEqual(c.errors, []);
});

test('regions: a full one gets the next tier when power allows, the same click at the same price; short of power the utility is asked early', (t) => {
  const A = cloud(t), B = cloud(t);
  // Level 8 builds at the late price (HS_LATE): above the order's default budget, so it gets a bigger one.
  on(A.ev, 'hsrg', { at: 85 }, 1e7);
  const a0 = cash(A.ev); shift(A.ev); const a1 = cash(A.ev);
  const b0 = cash(B.ev); B.ev("ACT.hsRegion({city:'fra'})"); const b1 = cash(B.ev);
  assert.ok(a0 - a1 > 0);
  assert.equal(a0 - a1, b0 - b1, 'the shift cost exactly what the click costs');
  assert.deepEqual(J(A.ev, 'S.hs.rg.fra.up'), J(B.ev, 'S.hs.rg.fra.up'));
  assert.deepEqual(did(A.ev, 'hsrg').map(x => x[2]), [['fra ⇧']]);
  assert.equal(A.ev('S.ops.addMo.hsrg'), A.ev('HS_T[2].mo-HS_T[1].mo'), 'the bigger region\'s running cost is booked');
  // A region under the mark is left alone.
  A.ev('S.ops.log=[]'); shift(A.ev); assert.equal(did(A.ev, 'hsrg').length, 0);
  // No megawatts for the next tier: the utility, once.
  const C = cloud(t);
  on(C.ev, 'hsrg', { at: 85 });
  C.ev('S.hs.pw.fra.cap=hsTown(\'fra\')+25');
  const c0 = cash(C.ev); shift(C.ev);
  assert.equal(C.ev('S.hs.rg.fra.up'), undefined, 'no upgrade without the power');
  assert.equal(c0 - cash(C.ev), C.ev('HS_Q_FEE'), 'a utility request instead');
  assert.equal(C.ev('S.hs.pw.fra.q.mw'), C.ev('HS_Q_MW'));
  assert.equal(did(C.ev, 'hsutil').length, 1);
  const c1 = cash(C.ev); shift(C.ev);
  assert.equal(cash(C.ev), c1, 'one request per metro');
  assert.deepEqual(did(C.ev, 'rgfull').map(x => x[2]), [['fra']], 'then only a note');
  // Told only to warn: a note, nothing bought; the note once a week.
  const D = cloud(t);
  on(D.ev, 'hsrg', { at: 85, how: 'warn' });
  const d0 = cash(D.ev); shift(D.ev);
  assert.equal(cash(D.ev), d0);
  assert.equal(did(D.ev, 'rgfull').length, 1);
  D.ev('S.day++;S.ops.log=[]'); shift(D.ev);
  assert.equal(did(D.ev, 'rgfull').length, 0, 'once a week per region');
  // A budget too small for a campus: nothing, and the log says the budget stopped it.
  const E = cloud(t);
  on(E.ev, 'hsrg', { at: 85 }, 1e6);
  const e0 = cash(E.ev); shift(E.ev);
  assert.equal(E.ev('S.hs.rg.fra.up'), undefined);
  assert.ok(e0 - cash(E.ev) <= 1e6);
  for (const h of [A, B, C, D, E]) assert.deepEqual(h.errors, []);
});

test('a moratorium stops the region order: no build, no utility request, only a note', (t) => {
  const { ev, errors } = cloud(t);
  on(ev, 'hsrg', { at: 85 });
  ev("S.hs.law.mor.fra={a:0,f:0,u:S.day+100,m:0}");
  const c0 = cash(ev); shift(ev);
  assert.equal(cash(ev), c0, 'no build, no utility request during a moratorium');
  assert.equal(ev('S.hs.rg.fra.up'), undefined);
  assert.deepEqual(did(ev, 'rgfull').map(x => x[2]), [['fra']]);
  assert.deepEqual(errors, []);
});

test('waves: a region pair whose backlog grows gets the smallest wave that carries what was missing, through the same click', (t) => {
  const A = cloud(t), B = cloud(t);
  const x = J(A.ev, "R.hs.rep.fra");
  assert.equal(x.b, 'ams');
  assert.ok(x.base - x.got > 100, 'Frankfurt cannot send its copies to Amsterdam over 10G: ' + JSON.stringify(x));
  assert.ok(A.ev("S.hs.lag['fra>ams']") > 50, 'and the backlog has grown');
  on(A.ev, 'hswave', { tb: 50 });
  const q = J(A.ev, "hsOpsWaveQuote('fra','ams',(R.hs.rep.fra.base-R.hs.rep.fra.got+S.hs.lag['fra>ams']/TB_DAY/7)*opsAhead())");
  const n0 = A.ev('S.links.length'), a0 = cash(A.ev); shift(A.ev); const a1 = cash(A.ev);
  assert.equal(A.ev('S.links.length'), n0 + 1);
  const l = J(A.ev, 'S.links[S.links.length-1]');
  assert.equal(l.kind, 'wave'); assert.deepEqual([l.a, l.b].sort(), ['ams', 'fra']); assert.equal(l.tier, q.t);
  assert.ok(A.ev(`LT[${q.t}].g`) >= x.base - x.got, 'big enough for what replication missed');
  const b0 = cash(B.ev); B.ev(`UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:${q.t}})`); const b1 = cash(B.ev);
  assert.equal(a0 - a1, b0 - b1, 'the shift cost what the click costs');
  assert.deepEqual(did(A.ev, 'hswave').map(y => y[2]), [[`ams|fra ${A.ev(`LT[${q.t}].n`)}`]]);
  // The next evening the copies get through; and no second wave on the pair for a week anyway.
  A.ev('compute();hsDay(S.day)');
  assert.ok(A.ev('R.hs.rep.fra.got') > x.got);
  const n1 = A.ev('S.links.length'); shift(A.ev);
  assert.equal(A.ev('S.links.length'), n1);
  // Under the mark: nothing.
  const C = cloud(t);
  on(C.ev, 'hswave', { tb: 500 });
  C.ev("S.hs.lag['fra>ams']=100");
  const n2 = C.ev('S.links.length'); shift(C.ev);
  assert.equal(C.ev('S.links.length'), n2);
  for (const h of [A, B, C]) assert.deepEqual(h.errors, []);
});

test('drills: the pair never drilled first, one at a time, only where ready, not again too soon, never into a launch freeze', (t) => {
  const { ev, errors } = cloud(t);
  // Make every failover ready: fat waves everywhere and small users.
  ev("S.hs.cc.DE.d=200;for(const l of S.links)l.tier=4;compute();hsDay(S.day)");
  on(ev, 'hsdrill', { days: 180, ready: true });
  const ready = J(ev, "hsRgs().filter(c=>hsFailReady(c))");
  assert.ok(ready.length >= 2, JSON.stringify(ready));
  const c0 = cash(ev); shift(ev);
  assert.equal(c0 - cash(ev), ev('HS_DRILL'));
  const dx = J(ev, 'S.hs.dx');
  assert.ok(dx && ready.includes(dx.c));
  const c1 = cash(ev); shift(ev);
  assert.equal(cash(ev), c1, 'one drill at a time');
  // The drill is judged; the next shift drills another pair, never drilled, not the one just passed.
  ev('S.day++;compute();hsDay(S.day)');
  const k = Object.keys(J(ev, 'S.hs.drill'));
  assert.equal(k.length, 1, 'the drill passed: ' + JSON.stringify(J(ev, 'S.hs.drill')));
  ev('compute()'); shift(ev);
  const dx2 = J(ev, 'S.hs.dx');
  assert.ok(dx2 && ev(`hsPk(${lit(dx2.c)},${lit(dx2.b)})`) !== k[0], 'another pair');
  // A launch freeze starting tomorrow: no drill today.
  const B = cloud(t);
  B.ev("S.hs.cc.DE.d=200;for(const l of S.links)l.tier=4;compute();hsDay(S.day)");
  on(B.ev, 'hsdrill', {});
  B.ev("S.offers.push(hsOffer('game','fra',20));ACT.accept({id:S.offers[0].id});S.hs.lf={id:S.biz[0].id,g:0,ann:S.day,from:S.day+2,until:S.day+4,f:3,q:0,k:0};compute()");
  const b0 = cash(B.ev); shift(B.ev);
  assert.equal(cash(B.ev), b0); assert.equal(J(B.ev, 'S.hs.dx'), null);
  // Not ready (the thin 10G wave): with "only when ready" on, nothing.
  const C = cloud(t);
  on(C.ev, 'hsdrill', { ready: true });
  C.ev("S.hs.rep={fra:'ams',ams:'fra',par:'fra'};compute()");
  const r = J(C.ev, "hsRgs().filter(c=>hsFailReady(c))");
  const c2 = cash(C.ev); shift(C.ev);
  if (!r.length) assert.equal(cash(C.ev), c2);
  else assert.ok(r.includes(J(C.ev, 'S.hs.dx').c));
  for (const e of [errors, B.errors, C.errors]) assert.deepEqual(e, []);
});

test('protests: answered with community funds when cheap enough, through the same click; dear ones are left to the player', (t) => {
  const { ev, errors } = cloud(t);
  on(ev, 'hsfund', { max: 500000 });
  ev("S.hs.pw.fra.gw=40;S.hs.prot.fra={until:S.day+60,kind:'delay',g:1,on:'rg'};S.hs.pw.par=hsPwDef('par');S.hs.pw.par.gw=0;S.hs.prot.par={until:S.day+60,kind:'cost',g:2,on:'rg'}");
  const c0 = cash(ev); shift(ev);
  assert.equal(c0 - cash(ev), 2 * ev('HS_FUND'), 'Frankfurt needs two funds to reach the mark');
  assert.equal(ev('hsProt("fra")'), null, 'won');
  assert.ok(ev('hsProt("par")'), 'Paris needs four funds, more than the order may spend on one protest');
  assert.equal(ev('S.hs.pw.par.gw'), 0);
  assert.deepEqual(did(ev, 'hsfund').map(x => x[2]), [['fra']]);
  assert.deepEqual(errors, []);
});

test('zones: a region that met local outages gets another zone, one a shift, through the same click', (t) => {
  const { ev, errors } = cloud(t);
  on(ev, 'hsaz', { out: 2 });
  ev('S.hs.azo={par:1};compute()');
  let c0 = cash(ev); shift(ev);
  assert.equal(cash(ev), c0, 'one outage is under the mark');
  ev('S.hs.azo={par:3,ams:2};compute()');
  c0 = cash(ev); shift(ev);
  assert.equal(c0 - cash(ev), ev("hsAzCost('par')"), 'the worst first, one a shift');
  assert.equal(ev('S.hs.az.par.length'), 1);
  assert.equal(ev('S.hs.az.ams'), undefined);
  assert.deepEqual(did(ev, 'hsaz').map((x) => x[2]), [['par']]);
  assert.equal(ev('S.ops.addMo.hsaz'), ev("hsAzMo('par')"), 'its running cost is booked');
  // A moratorium or a full level stops it.
  ev("S.hs.law.mor.ams={a:S.day,f:S.day,u:S.day+100,m:0};S.lvl=2;compute()");
  c0 = cash(ev); shift(ev);
  assert.equal(cash(ev), c0);
  assert.deepEqual(errors, []);
});

test('a launch freeze: no order runs; the log and the mood say so', (t) => {
  const { ev, errors } = cloud(t);
  for (const k of ['hsrg', 'hswave', 'hsdrill', 'hsfund']) on(ev, k);
  ev("S.offers.push(hsOffer('game','fra',20));ACT.accept({id:S.offers[0].id});S.hs.lf={id:S.biz[0].id,g:0,ann:S.day,from:S.day,until:S.day+3,f:3,q:0,k:0};compute()");
  assert.ok(ev('!!chFrozen()'));
  const s = ev('JSON.stringify([S.cash,S.links.length,S.hs.rg,S.hs.dx])'); shift(ev);
  assert.equal(ev('JSON.stringify([S.cash,S.links.length,S.hs.rg,S.hs.dx])'), s);
  assert.deepEqual(J(ev, 'S.ops.log[0].r'), [['freeze', 1, []]]);
  assert.match(ev('opsMood()'), /Battle Royale with Cheese/);
  assert.deepEqual(errors, []);
});

test('the intern\'s cloud moods: what is going on first, then flavour, the same day always the same', (t) => {
  const { ev, errors } = cloud(t);
  ev('S.ops.hired=-30;S.ops.wk=null');
  const m = ev('opsMood()');
  assert.equal(ev('opsMood()'), m);
  const flavour = J(ev, "HS_OPS_MOOD.map(k=>tr(k,{name:opsName()}))");
  // Frankfurt's backlog is over the risk mark in this setup.
  assert.equal(m, ev("tr('hyper_ops.mood_backlog',{name:opsName(),city:CITY.fra.name})"));
  ev("S.hs.lag={};S.hs.prot={}");
  assert.ok(flavour.includes(ev('opsMood()')), 'flavour on a quiet day');
  ev("hsRegionFail('ams',2,'test');compute()");
  assert.equal(ev('opsMood()'), ev("tr('hyper_ops.mood_down',{name:opsName(),city:CITY.ams.name})"));
  assert.deepEqual(errors, []);
});

test('saves: the orders\' settings and logs survive a round trip; junk is repaired', (t) => {
  const { ev, errors } = cloud(t);
  on(ev, 'hsrg', { at: 90, how: 'ask' }, 1e7); on(ev, 'hswave', { tb: 'lots' }); on(ev, 'hsdrill', { days: 180 }); on(ev, 'hsfund', { max: 1 }, 123);
  shift(ev);
  const back = J(ev, '(()=>{const r=parseSave(JSON.stringify(S));return migrate(r.s).ops;})()');
  assert.equal(back.on.hsrg, true);
  assert.deepEqual(back.p.hsrg, { at: 90, how: 'ask' });
  assert.equal(back.cap.hsrg, 1e7);
  assert.deepEqual(back.p.hswave, {}, 'junk setting dropped');
  assert.deepEqual(back.p.hsfund, {}, 'junk setting dropped');
  assert.equal(back.cap.hsfund, undefined, 'a budget not on the list goes back to the default');
  assert.deepEqual(back.log[0], J(ev, 'S.ops.log[0]'));
  assert.deepEqual(errors, []);
});

test('the Ops sheet shows the cloud orders on a phone and a desktop', (t) => {
  const { ev, errors, dom } = cloud(t);
  on(ev, 'hsrg'); on(ev, 'hswave'); on(ev, 'hsdrill'); on(ev, 'hsfund');
  shift(ev);
  for (const w of [360, 1280]) {
    dom.window.innerWidth = w;
    ev('opsModal()');
    const doc = dom.window.document, ks = [...doc.querySelectorAll('#modal [data-act="opsToggle"]')].map(b => JSON.parse(b.dataset.args).k);
    for (const k of ['hsrg', 'hswave', 'hsdrill', 'hsfund']) assert.ok(ks.includes(k), k + ' at ' + w);
    assert.ok(!ks.includes('caches'));
    assert.ok(doc.querySelector('#modal').textContent.includes(ev("tr('hyper_ops.o_rg')")));
    ev('closeModal()');
  }
  assert.deepEqual(errors, []);
});

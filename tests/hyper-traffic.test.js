// The Hyperscaler between regions, phase 3 (38-hyper-traffic.js): replication carved after every interactive flow on what
// the backbone has left, the backlog it leaves and how it drains, Auto-TE and diverse paths for bulk, AI labs' training
// runs (paid on time, half late, given up), your own models (shipped and boosting, or flopping in public), no classic AI
// circuits in this charter, saves, and the Cloud tab and charter card on a phone and on a desktop.
// These mechanics tests pin each country's users to its main city (one user zone); zones have their own test
// (hyper-zones-users.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
/* Regions in Frankfurt (a Rack Shack, 400 Gbps) and Paris (one more), a POP in Amsterdam. German users enter at home;
   French users enter in Paris, which has room for 400 of them, so 100 ride the backbone from Frankfurt (the haul). The
   direct Frankfurt–Paris wave is `fp` (tier fp), the way round through Amsterdam 800G each. */
function net(t, fp = 1) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;ACT.buyTransit({city:S.home,net:'cog',tier:3});ACT.buyTransit({city:'par',net:'cog',tier:3});" +
    "S.hs.rg.par={t:0,ready:0,mw:5};S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:500,since:0};S.links=[];" +
    wave('fp', 'fra', 'par', fp) + wave('fa', 'fra', 'ams', 3) + wave('ap', 'ams', 'par', 3) + 'compute()');
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const cut = (ev, ids) => ev(`for(const l of S.links)if(${lit(ids)}.includes(l.id))l.cut=S.day+999;compute()`);
// Interactive results: what users got, the hauls, served traffic and router loads.
const inter = (ev) => J(ev, '{cc:R.hs.cc,served:R.served,door:R.hs.door,egT:R.egT}');

test('replication is carved on what interactive traffic left, and never pushes it aside', (t) => {
  const { ev, errors } = net(t, 1);
  ev('S.lvl=2'); // no data lake yet: this counts the haul and the copies alone
  cut(ev, ['fa', 'ap']);
  const fr = J(ev, 'R.hs.cc.FR');
  assert.ok(near(fr.want, 100) && near(fr.got, 100), 'the haul fills the 100G wave');
  const rep = J(ev, 'R.hs.rep.fra');
  assert.equal(rep.b, 'par', 'the replica is the other region until the player picks one');
  assert.ok(near(rep.base, 0.3 * 400), '30% of what its users ask for: ' + rep.base);
  assert.equal(rep.got, 0, 'nothing left for replication');
  const withBulk = inter(ev);
  ev('CX_BULK.length=0;compute()');
  assert.deepEqual(inter(ev), withBulk, 'interactive traffic is the same with or without bulk');
  ev('CX_BULK.push(hsBulk);S.links.find(l=>l.id===\'fp\').tier=3;compute()');
  assert.ok(near(ev('R.hs.rep.fra.got'), 120) && near(ev('R.hs.rep.par.got'), 120), 'room for both directions on 800G');
  assert.ok(near(ev('R.load.fp'), 100 + 240), 'the haul and both copies on the link: ' + ev('R.load.fp'));
  assert.ok(near(ev('R.hs.cc.FR.got'), 100));
  assert.deepEqual(J(ev, 'R.hs.rep.fra.paths'), [{ ns: ['fra', 'par'], share: 1 }]);
  assert.ok(ev('R.hs.btw') >= 240 - 1e-6, 'everything between regions tonight');
  // A tenant's database copies go to the region's replica too, as bulk.
  ev("S.offers.push(Object.assign(hsOffer('ent',S.home,40),{p:['vm','db']}));ACT.accept({id:S.offers[0].id});compute()");
  const T = J(ev, 'R.hs.ten[S.biz[0].id]');
  assert.equal(T.r2, 'par');
  assert.ok(T.bt > 0 && near(T.btg, T.bt), 'its copies are sent');
  assert.ok(near(ev('R.hs.rep.fra.bt'), T.bt));
  assert.deepEqual(errors, []);
});

test('the player picks a replica; the backlog grows when the backbone is thin, moves with the replica, and drains later', (t) => {
  const { ev, errors } = net(t, 1);
  cut(ev, ['fa', 'ap']);
  ev('hsTrafficDay(S.day)');
  const lag1 = ev("S.hs.lag['fra>par']");
  assert.ok(near(lag1, 120 * ev('TB_DAY'), 1e-3), 'a day of 120 Gbps unsent: ' + lag1);
  assert.ok(near(ev("hsLagAt('fra')"), lag1, 1e-3));
  ev('compute();hsTrafficDay(S.day)');
  assert.ok(near(ev("S.hs.lag['fra>par']"), 2 * lag1, 1e-3), 'and grows day by day');
  // A third region, picked as Frankfurt's replica: what Paris was owed goes to Amsterdam.
  ev("S.hs.rg.ams={t:1,ready:0,mw:20};ACT.hsReplica({city:'fra',v:'ams'})");
  assert.equal(ev('S.hs.rep.fra'), 'ams');
  ev('hsTrafficDay(S.day)');
  assert.equal(ev("S.hs.lag['fra>par']"), undefined);
  assert.ok(ev("S.hs.lag['fra>ams']") >= 2 * lag1 - 1e-3, 'the backlog follows the replica');
  ev("ACT.hsReplica({city:'fra',v:''})");
  assert.equal(ev('S.hs.rep.fra'), undefined, 'back to the suggestion');
  ev("ACT.hsReplica({city:'fra',v:'par'});delete S.hs.rg.ams;S.links.find(l=>l.id==='fp').tier=4;compute();hsTrafficDay(S.day)");
  // A wider wave: the day's copies and the backlog on top, until it is gone.
  const before = ev("hsLagAt('fra')");
  ev('compute()');
  assert.ok(ev('R.hs.rep.fra.drain') > 0 && ev('R.hs.rep.fra.got') > ev('R.hs.rep.fra.base'), 'the backlog is sent on top of the day\'s copies');
  ev('hsTrafficDay(S.day)');
  assert.ok(ev("hsLagAt('fra')") < before, 'it drains');
  for (let i = 0; i < 5; i++) ev('compute();hsTrafficDay(S.day)');
  assert.equal(ev("hsLagAt('fra')"), 0, 'and is gone');
  assert.deepEqual(errors, []);
});

test('bulk takes diverse halves when asked, and Auto-TE spills it around a full link', (t) => {
  const { ev, errors } = net(t, 3);
  ev("ACT.hsPath({a:'par',b:'fra',v:'diverse'})");
  assert.equal(ev("S.hs.pp['fra|par']"), 'diverse');
  ev('compute()');
  const ps = J(ev, 'R.hs.rep.fra.paths').map((p) => p.ns.join('-')).sort();
  assert.deepEqual(ps, ['fra-ams-par', 'fra-par'], 'two separate paths');
  assert.equal(ev('R.hs.rep.fra.mode'), 'diverse');
  ev("ACT.hsPath({a:'fra',b:'par',v:'scenic'})");
  assert.equal(ev("S.hs.pp['fra|par']"), 'scenic');
  ev("ACT.hsPath({a:'fra',b:'par',v:'warp'})");
  assert.equal(ev("S.hs.pp['fra|par']"), 'scenic', 'unknown modes are ignored');
  ev("ACT.hsPath({a:'fra',b:'par',v:''})");
  assert.equal(ev("S.hs.pp['fra|par']"), undefined);
  // The direct wave full of the haul: without Auto-TE replication waits, with it it goes round through Amsterdam.
  ev("S.links.find(l=>l.id==='fp').tier=1;compute()");
  assert.equal(ev('R.hs.rep.fra.got'), 0);
  ev("S.core={lv:2,run:2,legacy:true};S.te={on:true,l2:false,day:0,script:''};compute()");
  const r = J(ev, 'R.hs.rep.fra');
  assert.equal(r.te, true);
  assert.ok(near(r.got, 120), 'Auto-TE found room: ' + r.got);
  assert.deepEqual(r.paths.map((p) => p.ns), [['fra', 'ams', 'par']]);
  assert.ok(near(ev('R.hs.cc.FR.got'), 100), 'the haul keeps the direct wave');
  assert.deepEqual(errors, []);
});

// A training run offered by an AI lab, between Frankfurt and Paris (both Server Barns, 12 slots).
const offer = (g = 3200) => `S.hs.rg.fra.t=1;S.hs.rg.par.t=1;S.hs.jo.push({id:'j1',n:'Overfit and Sons',a:'fra',b:'par',g:${g},wk:6,tb:${g}*TB_DAY*42,fee:5000000,exp:S.day+20});`;

test('an AI lab\'s run: needs slots and power, moves its terabytes as bulk, pays on time, half late, only what it paid along the way when it gives up', (t) => {
  const { ev, errors } = net(t, 6);
  ev(offer(12800) + 'S.hs.rg.par.t=0;compute()');
  assert.match(ev("hsTrainWhy('fra','par',12800)"), /needs 16 free compute slots/);
  ev("ACT.hsJobTake({id:'j1'})");
  assert.equal(ev('S.hs.jobs.length'), 0, 'no slots, no run');
  ev('S.hs.rg.par.t=1;S.hs.jo[0].g=3200;ACT.hsJobTake({id:\'j1\'})');
  assert.equal(ev('S.hs.jo.length'), 0);
  const j = J(ev, 'S.hs.jobs[0]');
  assert.deepEqual([j.a, j.b, j.g, j.done], ['fra', 'par', 3200, 0]);
  assert.equal(j.due, ev('S.day') + Math.ceil(42 * 1.25));
  assert.equal(ev("hsSlotsUsed('fra')"), 4, 'the run holds compute slots in both regions');
  assert.equal(ev("hsTrainMwAt('par')"), 8);
  assert.equal(ev('R.cost.train'), 2 * 8 * ev('HS_MW_MO'), 'its megawatts on the bill, on their own line');
  const x = J(ev, 'R.hs.jobs.j1');
  assert.equal(x.k, 'job');
  assert.ok(near(x.want, 3200) && x.got > 0 && x.got <= x.want, `got ${x.got}`);
  assert.ok(near(ev('R.hs.rep.fra.got'), ev('R.hs.rep.fra.want')), 'replication goes before training');
  // On time: the last terabytes arrive, the lab pays in full.
  ev(`S.hs.jobs[0].done=S.hs.jobs[0].tb-1;compute()`);
  let cash = ev('S.cash');
  ev('hsTrafficDay(S.day)');
  assert.equal(ev('S.cash') - cash, 5000000);
  assert.equal(ev('S.hs.jobs.length'), 0);
  assert.equal(ev('S.hs.jd'), 1, 'one run delivered on time');
  // Late: half.
  ev(offer() + "ACT.hsJobTake({id:'j1'});S.hs.jobs[0].done=S.hs.jobs[0].tb-1;S.hs.jobs[0].due=S.day-1;compute()");
  cash = ev('S.cash');
  ev('hsTrafficDay(S.day)');
  assert.equal(ev('S.cash') - cash, 2500000);
  assert.equal(ev('S.hs.jd'), 1);
  // Far too late: the lab leaves; what it paid along the way stays paid, nothing more.
  ev(offer() + "ACT.hsJobTake({id:'j1'});S.hs.jobs[0].due=S.day-31;S.hs.jobs[0].paid=400000;compute()");
  cash = ev('S.cash');
  ev('hsTrafficDay(S.day)');
  assert.ok(ev('S.cash') - cash < 2500000 - 400000, 'at most the rest of its first half for today\'s data');
  assert.equal(ev('S.hs.jobs.length'), 0);
  // Declined offers go.
  ev(offer() + "ACT.hsJobNo({id:'j1'})");
  assert.equal(ev('S.hs.jo.length'), 0);
  assert.deepEqual(errors, []);
});

test('AI labs call now and then with runs of 3.2 to 12.8 Tbps for 4 to 8 weeks, $2M to $20M', (t) => {
  const { ev, errors } = net(t, 3);
  ev('S.lvl=2;for(let d=0;d<300;d++)hsTrafficDay(S.day)');
  assert.equal(ev('S.hs.jo.length'), 0, 'not before the AI labs\' level, without a lab tenant');
  ev('S.lvl=4;S.hs.dir.i.ai=0;const seen=[];for(let d=0;d<600;d++){hsTrafficDay(S.day+d);for(const o of S.hs.jo)if(!seen.some(x=>x.id===o.id))seen.push(o);}window.SEEN=seen');
  const seen = J(ev, 'SEEN');
  assert.ok(seen.length >= 5, 'offers come: ' + seen.length);
  for (const o of seen) {
    assert.ok([3200, 6400, 9600, 12800].includes(o.g) && o.wk >= 4 && o.wk <= 8, JSON.stringify(o));
    assert.ok(o.fee >= 2e6 && o.fee <= 2.1e7, 'fee ' + o.fee);
    assert.ok(near(o.tb, Math.round(o.g * 10.8 * o.wk * 7), 1));
    assert.deepEqual([o.a, o.b].sort(), ['fra', 'par']);
  }
  assert.ok(ev('S.hs.jo.length') <= 2);
  assert.deepEqual(errors, []);
});

// A start day whose seeded roll ships (or flops) a model between Frankfurt and Paris.
const rollAt = (ev, want) => ev(`(()=>{for(let s=0;s<500;s++){const m={a:'fra',b:'par',start:s,n:hstr('fra|par|'+s)%HS_MODELS.length,k:0};const r=hsFlopRoll(m);if(${want}(r))return s;}return -1})()`);

test('your own model: slots, power and backbone for weeks; shipped it boosts users and sells inference', (t) => {
  const { ev, errors } = net(t, 6);
  ev('S.hs.rg.fra.t=1;S.hs.rg.par.t=1');
  const s = rollAt(ev, 'r=>r>0.5');
  ev(`S.day=${s};ACT.hsTrain({city:'fra',k:0})`);
  const m = J(ev, 'S.hs.own[0]');
  assert.deepEqual([m.a, m.b, m.k, m.g, m.start], ['fra', 'par', 0, 1600, s], 'with its replica');
  assert.ok(ev("HS_MODELS.includes(HS_MODELS[S.hs.own[0].n])"));
  ev("ACT.hsTrain({city:'fra',k:1})");
  assert.equal(ev('S.hs.own.length'), 1, 'one at a time');
  assert.equal(ev("hsSlotsUsed('par')"), 2);
  const x = J(ev, `R.hs.jobs[${lit(m.id)}]`);
  assert.equal(x.k, 'own');
  assert.ok(near(x.got, 1600), 'fed in full tonight');
  const rev0 = ev('R.rev.eyeballs'), grow0 = ev("cxMul('grow','DE')");
  assert.equal(ev('hsAiOn()'), false);
  ev('S.hs.own[0].done=S.hs.own[0].tb-1;compute();hsTrafficDay(S.day)');
  assert.equal(ev('S.hs.own.length'), 0);
  assert.equal(ev('S.hs.ai'), 1);
  const B = J(ev, 'S.hs.boost');
  assert.ok(near(B.f, 0.15) && B.until === s + 180, JSON.stringify(B));
  ev('compute()');
  assert.ok(ev("cxMul('rev','DE')") > 1 && ev("cxMul('grow','DE')") > grow0, 'users pay more and grow faster');
  assert.ok(ev('R.hs.ai') > 0, 'inference sells');
  assert.ok(ev('R.rev.eyeballs') > rev0 * 1.15, 'and the revenue shows it');
  assert.equal(ev('hsAiOn()'), true);
  ev("S.offers=[];for(let i=0;i<60;i++)S.offers.push(hsOffer('startup',S.home,5))");
  assert.ok(ev("S.offers.some(o=>o.p.includes('ai'))"), 'tenants now buy Azzure ClosedAI Service');
  // When the boost runs out, things go back to normal.
  ev('S.day=S.hs.boost.until;hsTrafficDay(S.day);compute()');
  assert.equal(ev("cxMul('rev','DE')"), 1);
  assert.equal(ev('R.hs.ai'), 0);
  assert.deepEqual(errors, []);
});

test('a model fed badly is likely to flop in public: no boost, a headline, a small dent', (t) => {
  const { ev, errors } = net(t, 6);
  ev('S.hs.rg.fra.t=1;S.hs.rg.par.t=1');
  assert.ok(ev('hsFlopP(1)') < 0.1 && ev('hsFlopP(0)') > 0.9 && ev('hsFlopP(0.5)') > ev('hsFlopP(0.9)'), 'odds grow the worse it was fed');
  const s = rollAt(ev, 'r=>r<0.5');
  ev(`S.day=${s};ACT.hsTrain({city:'fra',k:0});S.day=S.hs.own[0].due;compute();S.log=[]`);
  ev('S.hs.own[0].done=S.hs.own[0].tb*0.2;hsTrafficDay(S.day)');
  assert.equal(ev('S.hs.own.length'), 0);
  assert.equal(ev('S.hs.ai'), 0, 'nothing to sell');
  assert.ok(ev('S.hs.boost.f') < 0, 'a small dent');
  ev('compute()');
  assert.ok(ev("cxMul('rev','DE')") < 1);
  const log = ev('JSON.stringify(S.log||[])');
  assert.match(log, /🦜/, 'the headline');
  assert.deepEqual(errors, []);
});

test('the classic AI circuits (aiwan, mtrain) never spawn in this charter', (t) => {
  const h = load({ seed: 11 });
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=13;for(const m of MEGA.slice(0,6))ACT.buildPop({city:m.c});ACT.buyTransit({city:S.home,net:'cog',tier:1});compute()");
  ev("for(let i=0;i<300;i++)spawnOffer();for(const t of ['aiwan','mtrain','agi','ingest'])for(let i=0;i<20;i++)spawnSpecial(t);for(let i=0;i<40;i++)dayTick()");
  const kinds = J(ev, '[...new Set(S.offers.concat(S.biz).map(o=>o.type))]');
  assert.ok(!kinds.includes('aiwan') && !kinds.includes('mtrain'), kinds.join());
  assert.ok(kinds.every((k) => k === 'cloud'));
  assert.deepEqual(errors, []);
});

test('saves: every field repaired, junk dropped, old Hyperscaler saves load, a round trip keeps it all', (t) => {
  const { ev, errors } = net(t, 3);
  ev("S.hs.rg.fra.t=1;S.hs.rg.par.t=1;" + offer() + "S.hs.jo.push({id:'j2',n:'DeepThink Tank',a:'par',b:'fra',g:6400,wk:5,tb:1e6,fee:3e6,exp:S.day+5});ACT.hsJobTake({id:'j1'});ACT.hsTrain({city:'par',k:1});ACT.hsReplica({city:'fra',v:'par'});ACT.hsPath({a:'fra',b:'par',v:'scenic'});S.hs.lag['fra>par']=42;S.hs.boost={until:S.day+9,f:0.2};S.hs.ai=2;compute()");
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  for (const k of ['rep', 'lag', 'jobs', 'own', 'boost', 'jo', 'pp', 'ai', 'jd']) assert.deepEqual(back.hs[k], s.hs[k], k);
  // An old Hyperscaler save from before phase 3: none of these fields.
  const old = { ...s, hs: { cc: s.hs.cc, rg: s.hs.rg, edge: {}, t1: 0, won: 0 } };
  const o = J(ev, `migrate(${JSON.stringify(old)}).hs`);
  assert.deepEqual([o.rep, o.lag, o.jobs, o.own, o.boost, o.jo, o.pp, o.ai, o.jd], [{}, {}, [], [], { until: 0, f: 0 }, [], {}, 0, 0]);
  const junk = {
    ...s, hs: {
      ...s.hs,
      rep: { fra: 'fra', par: 'zzz', ams: 'fra', nyc: 7, x: [] }, lag: { 'fra>par': 'lots', 'par>fra': 5, 'fra>fra': 3, 'fra>zzz': 9, 'a>b>c': 1, 'par>fra>': 2 },
      jobs: [{ id: 'a', a: 'fra', b: 'par', g: 'x', tb: -5, done: 99, due: 'soon', fee: -3 }, { id: 'a', a: 'fra', b: 'par' }, { a: 'fra', b: 'par' }, { id: 'c', a: 'fra', b: 'fra' }, 'junk'],
      own: [{ id: 'o', a: 'par', b: 'fra', k: 9, n: -2, done: 'x' }, { id: 'p', a: 'par', b: 'fra' }],
      boost: { until: 'later', f: 7 }, jo: [{ id: 'q', a: 'fra', b: 'atlantis' }, { id: 'r', a: 'fra', b: 'par', wk: 99, g: 1e9 }], pp: { 'fra|par': 'warp', 'par|fra': 'scenic', 'ams|fra': 'diverse' }, ai: 'many', jd: -1,
    },
  };
  const m = J(ev, `migrate(${JSON.stringify(junk)}).hs`);
  assert.deepEqual(m.rep, {});
  assert.deepEqual(m.lag, { 'par>fra': 5 });
  assert.equal(m.jobs.length, 1);
  assert.deepEqual([m.jobs[0].g, m.jobs[0].tb, m.jobs[0].done, m.jobs[0].due, m.jobs[0].fee], [3200, 1, 1, 0, 0]);
  assert.equal(m.own.length, 1);
  assert.deepEqual([m.own[0].k, m.own[0].n, m.own[0].done, m.own[0].g], [2, 0, 0, 6400]);
  assert.deepEqual(m.boost, { until: 0, f: 1 });
  assert.deepEqual(m.jo.map((x) => [x.id, x.wk, x.g]), [['r', 8, 30000]], 'capped at 30 Tbps (a supercluster leg runs up to 25.6)');
  assert.deepEqual(m.pp, {});
  assert.deepEqual([m.ai, m.jd], [0, 0]);
  ev(`S=migrate(${JSON.stringify(junk)});compute();for(let i=0;i<3;i++)dayTick()`);
  // Outside the charter none of it exists.
  assert.equal(ev(`(()=>{const x=migrate(${JSON.stringify({ ...s, charter: 'global' })});return x.hs===undefined})()`), true);
  assert.deepEqual(errors, []);
});

test('between regions in the Cloud tab and on the charter card, on a phone and on a desktop', (t) => {
  const { ev, dom, errors } = net(t, 1);
  cut(ev, ['fa', 'ap']);
  ev("S.hs.rg.fra.t=1;S.hs.rg.par.t=1;" + offer() + "S.hs.jo.push({id:'j2',n:'DeepThink Tank',a:'fra',b:'par',g:3200,wk:6,tb:1e6,fee:3e6,exp:S.day+5});ACT.hsJobTake({id:'j2'});S.hs.rg.par.t=0;compute();hsTrafficDay(S.day);compute()");
  const doc = dom.window.document;
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};selectCity(S.home);UI.tab='cust';renderAll()`);
    const panel = doc.getElementById('panelBody');
    const txt = panel.textContent;
    assert.match(txt, /Between regions/);
    assert.match(txt, /Replica/);
    assert.match(txt, /Paris \(suggested\)/);
    assert.match(txt, /Replication tonight/);
    assert.match(txt, /Backlog/);
    assert.match(txt, /data at risk/);
    assert.match(txt, /DeepThink Tank/);
    assert.match(txt, /Overfit and Sons/, 'the offer touching this region');
    assert.match(txt, /Small model/);
    assert.ok(panel.querySelector('select[data-chg="hsReplica"]') && panel.querySelector('select[data-chg="hsPath"]'));
    for (const b of panel.querySelectorAll('.btns')) assert.ok(b.querySelectorAll('button').length <= 2, 'rows of two at most');
    const card = ev('hsCard()');
    assert.match(card, /Replication .* of /);
    assert.match(card, /backlog/);
    assert.match(card, /1 AI run · next due/);
    assert.match(card, /Take the run/);
  }
  // The selects drive the actions, as a player's change would.
  const sel = doc.querySelector('select[data-chg="hsPath"]');
  sel.value = 'diverse';
  sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(ev("S.hs.pp['fra|par']"), 'diverse');
  ev("selectCity('par');renderAll()");
  assert.match(doc.getElementById('panelBody').textContent, /Between regions/);
  ev("selectCity('ams');renderAll()");
  assert.doesNotMatch(doc.getElementById('panelBody').textContent, /Between regions/, 'no region, no section');
  // Starting a model from the tab.
  ev("S.hs.rg.par.t=1;ACT.hsTrain({city:'fra',k:0});selectCity(S.home);renderAll()");
  assert.match(doc.getElementById('panelBody').textContent, /🧠/);
  assert.match(ev('hsCard()'), /Training /);
  assert.deepEqual(errors, []);
});

// A run costs its GPUs and power every day; a fee paid only at the end once sank clouds that could serve the run.
test('a run pays half its fee as the data moves, the rest on time, and its offer says what it costs', (t) => {
  const { ev, errors } = net(t, 6);
  ev(offer() + 'compute()');
  const row = ev("hsOfferRow(S.hs.jo[0])").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(row, /Costs \$400k\/mo in GPUs and power while it runs, about \$553k in all/);
  ev("ACT.hsJobTake({id:'j1'});compute()");
  const g = ev('R.hs.jobs.j1.got');
  assert.ok(g > 0);
  // A day of data: its share of half the fee.
  let cash = ev('S.cash');
  ev('hsTrafficDay(S.day)');
  const day = ev('S.cash') - cash, want = Math.round(2500000 * g * ev('TB_DAY') / ev('S.hs.jobs[0].tb'));
  assert.ok(Math.abs(day - want) <= 1, `paid ${day} for a day of data, expected ${want}`);
  assert.equal(ev('S.hs.jobs[0].paid'), day);
  // Never more than half before the end, whatever moves.
  ev('S.hs.jobs[0].done=S.hs.jobs[0].tb*0.5;S.hs.jobs[0].paid=2499000;hsTrafficDay(S.day)');
  assert.ok(ev('S.hs.jobs[0].paid') <= 2500000);
  // On time, the rest: five million in all.
  ev('S.hs.jobs[0].done=S.hs.jobs[0].tb-1');
  cash = ev('S.cash'); const paid = ev('S.hs.jobs[0].paid');
  ev('hsTrafficDay(S.day)');
  assert.equal(ev('S.cash') - cash + paid, 5000000, 'the whole fee, half along the way');
  // An old save's run (nothing paid yet) still gets its fee.
  ev(offer() + "ACT.hsJobTake({id:'j1'});delete S.hs.jobs[0].paid;S.hs.jobs[0].done=S.hs.jobs[0].tb-1;compute()");
  cash = ev('S.cash'); ev('hsTrafficDay(S.day)');
  assert.equal(ev('S.cash') - cash, 5000000);
  // The dashboard names the cost.
  ev(offer() + "ACT.hsJobTake({id:'j1'});compute();ACT.dash({})");
  assert.match(ev("document.getElementById('dash').textContent"), /AI training runs \(GPUs and power\)/);
  assert.deepEqual(errors, []);
});

// East-west traffic as real clouds have it: every region ships logs, analytics and training data to the data lake (the
// biggest region), a share of its users' traffic that grows with the level; what does not arrive costs revenue.
test('the data lake: regions ship data to the biggest region, more with each level, and stale data costs revenue', (t) => {
  const { ev, errors } = net(t, 3);
  ev('S.hs.rg.fra.t=1;compute()');
  assert.equal(ev('R.hs.lake.c'), 'fra', 'the biggest region holds the lake');
  const u = ev('R.hs.rg.par.u');
  assert.ok(u > 100, 'Paris serves its users');
  assert.equal(ev('hsLakeF()'), 0.5, 'level 8: half of the users\' traffic');
  assert.ok(near(ev("R.hs.lake.rg.par.want"), u * 0.5));
  assert.ok(near(ev('R.hs.lake.got'), ev('R.hs.lake.want')), 'a fat backbone carries it all');
  assert.equal(ev('hsFresh(R)'), 1);
  assert.ok(ev('R.hs.btw') >= ev('R.hs.lake.got') + ev('R.hs.rep.par.got') - 1e-6, 'it counts between regions');
  const rev = ev("hsRev(R,'DE')+hsRev(R,'FR')");
  // Early levels have no lake; the share grows to 80% at the top.
  ev('S.lvl=2;compute()');
  assert.equal(ev('R.hs.lake.want'), 0);
  ev('S.lvl=13;compute()');
  assert.ok(near(ev('hsLakeF()'), 0.8));
  // A thin backbone: the lake goes stale, and revenue falls by up to a tenth.
  ev("S.lvl=8;for(const l of S.links)l.tier=0;compute()");
  const f = ev('hsFresh(R)');
  assert.ok(f < 1, 'stale: ' + f);
  assert.ok(near(ev("hsRev(R,'DE')+hsRev(R,'FR')") / (rev * ev("(hsQ(R,'DE')*S.hs.cc.DE.d+hsQ(R,'FR')*S.hs.cc.FR.d)") / ev("(hsQ(R,'DE')*S.hs.cc.DE.d+hsQ(R,'FR')*S.hs.cc.FR.d)")), ev('hsFreshF(R)'), 0.2));
  assert.ok(near(ev('hsFreshF(R)'), 1 - 0.1 * (1 - f)));
  // The cloud card says so.
  ev('renderAll()');
  assert.match(ev("document.body.textContent"), /Data lake in Frankfurt: .* arrive · \d+% fresh\. Stale data costs/);
  assert.deepEqual(errors, []);
});

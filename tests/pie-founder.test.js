// The Founder's antics and the market's jitters (src/game/60-features/99-pie-jitters.js): seeded; each antic is forced
// with pieAntic(k), the clock moved with dayTick().
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// On-call with open gates: real chaos, everything buildable. Dishes in Amsterdam, Brussels, Frankfurt and Singapore, a
// baked Shortcrust, the 90 quiet days over, and 40 orbit customers in Frankfurt and Amsterdam.
const sky = (ev, o = {}) => {
  ev(`beginGame('Sky','fra',{mode:'normal',preset:'oncall',rules:${JSON.stringify(Object.assign({ gates: 'open' }, o))}});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;S.nextFail=1e9;S.nextEvent=1e9;S.monkey&&(S.monkey.next=1e9)`);
  ev("for(const c of ['sin','ams','bru'])ACT.buildPop({city:c});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});for(const c of ['ams','bru','fra','sin'])ACT.pieDish({city:c});for(const cc of ['NL','BE','DE','SG'])ACT.pieLic({cc})");
  ev("for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX;pieCohort('short',1200,true);S.day=S.pie.born+120;compute();S.pie.stock=400");
  ev("for(const c of ['fra','ams'])ACT.buyTransit({city:c,net:'cog',tier:1});for(let i=0;i<40;i++)S.biz.push({id:'o'+i,type:'pizza',city:i%2?'fra':'ams',city2:null,bw:1,rate:BIZ_T.pizza.rate,reqs:[],latMax:null,route:'normal',name:'o'+i,mood:80,since:0,sites:null});compute()");
  // No antic of its own while a test drives them; no other orbit incidents or spats by chance.
  ev('S.pie.founder.next=1e9;for(const f of [pieIncDay,pieSpatDayAll])PIE_ON.day.splice(PIE_ON.day.indexOf(f),1)');
};
const F = (ev) => JSON.parse(ev('JSON.stringify(S.pie.founder)'));
const days = (ev, n) => ev(`for(let i=0;i<${n};i++)dayTick()`);
const orbitMood = (ev) => ev("S.biz.filter(b=>BIZ_T[b.type].orbit).reduce((a,b)=>a+b.mood,0)/S.biz.filter(b=>BIZ_T[b.type].orbit).length");

test('the kid is named once: orbit billing stops for 3 to 5 days, then comes back from backup, and he is remembered', () => {
  const { ev, errors } = load();
  sky(ev);
  const rev = ev('R.pie.rev');
  assert.ok(rev > 0, 'orbit earns before');
  assert.equal(ev("pieAntic('kid')"), true);
  const f = F(ev), kid = ev('pieKid().n'), n = f.bill - ev('S.day') - 1;
  assert.ok(n >= 3 && n <= 5, `billing down 3 to 5 days (${n})`);
  assert.match(kid, /'\);/, 'a name that injects');
  assert.match(ev('S.log[0].t'), /Ooooh\. Uuuuuh\./);
  assert.ok(ev("S.log[0].t.includes(pieKid().n)"), 'the toast says his name');
  for (let i = 0; i < n; i++) {
    days(ev, 1);
    assert.equal(ev('R.pie.rev'), 0, `no orbit income on day ${i + 1}`);
    assert.ok(ev('R.pie.billOff') > 0, 'what it would have been is kept');
  }
  assert.equal(F(ev).bill, 0, 'billing is back after the last day');
  assert.equal(ev('S.pie.founder.posts[0].k'), 'pie.fp_backup', 'restored from backup');
  assert.match(ev('pieFpText(S.pie.founder.posts[0])'), / Tables /, 'the post calls him by his nickname');
  days(ev, 1);
  assert.ok(ev('R.pie.rev') > 0, 'orbit earns again');
  // Once a game, and later posts bring him back.
  assert.equal(ev("pieAntic('kid')"), false, 'never twice');
  assert.equal(ev("PIE_ANTIC_KEYS.filter(x=>PIE_ANTICS[x].ok(S.pie.founder)).includes('kid')"), false, 'not in the draw any more');
  ev("pieAntic('spree')");
  assert.equal(ev('S.pie.founder.posts[0].k'), 'pie.fp_spree_kid');
  assert.ok(ev('pieFpText(S.pie.founder.posts[0]).includes(pieKid().k)'), 'the running gag');
  assert.deepEqual(errors, []);
});

test('a 3 a.m. spree: fewer orbit calls and grumpier customers for two weeks, then the market calms down', () => {
  const { ev, errors } = load();
  sky(ev);
  const m0 = orbitMood(ev);
  assert.equal(ev('pieOfferMul()'), 1);
  ev("pieAntic('spree')");
  assert.ok(orbitMood(ev) <= m0 - 3.5, 'a dip at once');
  const j = F(ev).jit;
  assert.equal(j, 0.6);
  assert.ok(ev('pieOfferMul()') < 0.55, `offers well down (${ev('pieOfferMul()')})`);
  days(ev, 14);
  assert.ok(ev('pieOfferMul()') > 0.5 && ev('pieOfferMul()') < 1, 'nerves gone, jitters left');
  days(ev, 5);
  assert.equal(F(ev).jit, 0, 'jitters fade within 30 days of a 0.6 bump');
  assert.equal(ev('pieOfferMul()'), 1, 'back to normal');
  days(ev, 20);
  assert.ok(orbitMood(ev) >= m0, 'happiness recovers');
  assert.equal(ev('S.biz.filter(b=>BIZ_T[b.type].orbit).length'), 40, 'nobody left over a spree');
  assert.deepEqual(errors, []);
});

test('jitters stack up to 1 and fade to nothing over 30 days, nudging offers and moods while high', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("pieAntic('leak');pieAntic('spree');pieAntic('leak')");
  assert.equal(F(ev).jit, 1, 'capped at 1');
  ev('S.pie.founder.nerv=0');
  assert.equal(ev('pieOfferMul()'), 0.7);
  ev("for(const b of S.biz)b.mood=100");
  days(ev, 10);
  assert.ok(Math.abs(orbitMood(ev) - (100 - 25 * 20 / 30)) < 1, `the happiest are held under 100 while jitters are high (${orbitMood(ev)})`);
  assert.ok(orbitMood(ev) > 50, 'never low enough to cancel at renewal');
  assert.ok(Math.abs(F(ev).jit - 20 / 30) < 0.01, 'a thirtieth a day');
  days(ev, 20);
  assert.equal(F(ev).jit, 0);
  assert.equal(ev('pieOfferMul()'), 1);
  days(ev, 15);
  assert.equal(orbitMood(ev), 100, 'and back to happy');
  // The orbit sales desk rolls its odds through pieOfferMul().
  assert.match(ev("PIE_ON.day.map(String).join()"), /PIE_OFFER_RATE\*pieOfferMul\(\)/);
  assert.deepEqual(errors, []);
});

test('picking a fight with a regulator starts a spat in a country with a dish of yours', () => {
  const { ev, errors } = load();
  sky(ev);
  assert.equal(ev("pieAntic('reg')"), true);
  const sp = JSON.parse(ev('JSON.stringify(S.pie.spat)')), ks = Object.keys(sp);
  assert.equal(ks.length, 1, 'one spat');
  assert.ok(['lic', 'kill'].includes(ks[0]), `a regulator's spat (${ks[0]})`);
  assert.ok(['NL', 'BE', 'DE', 'SG'].includes(sp[ks[0]].cc), `where you have a dish (${sp[ks[0]].cc})`);
  assert.ok(ev("S.pie.founder.posts.some(p=>p.k==='pie.fp_reg')"));
  assert.equal(F(ev).jit, 0.4);
  // At the spat limit he still rants, but nothing new starts.
  ev("S.pie.spat.grab={st:'on',ask:S.day,until:S.day+100,c:0,m:0.1,left:5}");
  assert.equal(ev("pieAntic('reg')"), true);
  assert.equal(ev('Object.keys(S.pie.spat).length'), 2);
  assert.deepEqual(errors, []);
});

test('a leaked launch date makes launch insurance dearer for 30 days', () => {
  const { ev, errors } = load();
  sky(ev);
  const q = () => JSON.parse(ev("JSON.stringify(pieQuote('falcon','short',{ins:true}))"));
  const q0 = q(), base = q0.cost - Math.round(q0.insured * 0.08);
  ev("pieAntic('leak')");
  const q1 = q();
  assert.equal(q1.cost - base, Math.round(q1.insured * 0.08 * 1.75), 'premium 14% instead of 8%');
  ev("S.pie.opt.ins=true;UI.pieTab='crust';ACT.pieOpen()");
  assert.match(ev("document.querySelector('#modal').textContent"), /Insurance: on \(14%\)/);
  ev('closeModal()');
  days(ev, 29);
  assert.ok(q().cost > q0.cost, 'still dear on day 29');
  days(ev, 1);
  assert.equal(q().cost, q0.cost, 'back to normal after 30 days');
  assert.deepEqual(errors, []);
});

test('Mars next year: two weeks of hype, then the slip costs a few orbit customers', () => {
  const { ev, errors } = load();
  sky(ev);
  const p0 = F(ev).promises;
  ev("pieAntic('mars')");
  const f = F(ev);
  assert.equal(f.promises, p0 + 1, 'a promise');
  assert.ok(f.due.includes(f.mars), 'due like the others');
  assert.equal(ev("pieAntic('mars')"), false, 'one Mars at a time');
  assert.ok(ev('pieOfferMul()') > 1, 'hype: more calls');
  days(ev, 14);
  assert.ok(ev('pieOfferMul()') <= 1, 'hype over');
  // Bring the due day forward instead of playing a year.
  ev('{const F=S.pie.founder,i=F.due.indexOf(F.mars);F.due[i]=F.mars=S.day+1;F.due.sort((a,b)=>a-b);for(const d of F.due)if(d<F.mars)F.due.splice(F.due.indexOf(d),1)}');
  ev("S.biz.find(b=>b.id==='o7').mood=5");
  const b0 = F(ev).broken;
  days(ev, 1);
  assert.equal(F(ev).broken, b0 + 1, 'broken');
  assert.equal(F(ev).mars, 0);
  assert.equal(ev('S.pie.founder.posts[0].k'), 'pie.fp_mars_slip');
  assert.equal(ev('S.biz.filter(b=>BIZ_T[b.type].orbit).length'), 39, '2% of 40 cancel');
  assert.equal(ev("S.biz.some(b=>b.id==='o7')"), false, 'the unhappiest one');
  assert.match(ev('S.log[0].t'), /1 orbit customer quietly cancelled/);
  assert.deepEqual(errors, []);
});

test('with chaos off he still posts, and nothing else happens', () => {
  const { ev, errors } = load();
  sky(ev, { chaos: 'none' });
  const n0 = ev('S.log.length'), cash = ev('S.cash');
  for (const k of ['kid', 'spree', 'reg', 'leak', 'mars']) assert.equal(ev(`pieAntic('${k}')`), true, k);
  const f = F(ev);
  for (const k of ['fp_kid', 'fp_spree_kid', 'fp_reg', 'fp_leak_kid', 'fp_mars_kid']) assert.ok(f.posts.some((p) => p.k === 'pie.' + k), k);
  assert.equal(f.jit, 0);
  assert.equal(f.bill, 0);
  assert.equal(ev('Object.keys(S.pie.spat).length'), 0, 'no spat');
  assert.equal(ev('S.log.length'), n0, 'no toasts');
  assert.equal(ev('pieOfferMul()'), 1);
  assert.equal(ev('pieInsMul()'), 1);
  assert.equal(ev('S.cash'), cash);
  days(ev, 1);
  assert.ok(ev('R.pie.rev') > 0, 'billing never stops');
  ev('{const F=S.pie.founder,i=F.due.indexOf(F.mars);F.due=[F.mars=S.day+1]}');
  days(ev, 1);
  assert.equal(ev('S.biz.filter(b=>BIZ_T[b.type].orbit).length'), 40, 'Mars slips, nobody leaves');
  assert.equal(ev('S.pie.founder.posts[0].k'), 'pie.fp_mars_slip');
  // The schedule still runs: he posts every 60 to 120 days.
  ev('S.pie.founder.next=S.day+1;S.stats.pieAnt=0');
  days(ev, 1 + 121 * 2);
  assert.ok(ev('S.stats.pieAnt') >= 2, 'antics keep coming');
  assert.equal(F(ev).jit, 0);
  assert.deepEqual(errors, []);
});

test('antics come every 60 to 120 days, and only with a rocket company', () => {
  const { ev, errors } = load();
  sky(ev);
  ev('S.pie.founder.next=0;S.stats.pieAnt=0');
  days(ev, 1);
  const first = F(ev).next;
  assert.equal(first, ev('S.day') + 90, 'the first one comes 90 days on, no dice');
  ev('{const f=pieAntic;pieAntic=k=>{(window.__ant=window.__ant||[]).push(S.day);return f(k);}}');
  days(ev, 90 + 360);
  const at = JSON.parse(ev('JSON.stringify(window.__ant)'));
  assert.ok(at.length >= 4, `several antics in a year (${at.length})`);
  assert.equal(at[0], first);
  for (let i = 1; i < at.length; i++) { const g = at[i] - at[i - 1]; assert.ok(g >= 60 && g <= 120, `gap ${g}`); }
  // Unlocked but no company: no plan, no dice.
  const q = load();
  q.ev(`beginGame('Sky','fra',{mode:'normal',preset:'oncall',rules:{gates:'open'}});if(UI.pendGame)ACT.pitchSkip();pieInit()`);
  q.ev('{const r=Math.random;window.__rolls=0;Math.random=()=>{window.__rolls++;return r();};for(let i=0;i<200;i++)pieAnticDay(S.day+i);Math.random=r}');
  assert.equal(q.ev('__rolls'), 0, 'no dice without a company');
  assert.equal(q.ev('S.pie.founder.next'), 0);
  assert.equal(q.ev('S.stats.pieAnt|0'), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(q.errors, []);
});

test('saves keep the antics, old saves load calm, and junk is repaired', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("pieAntic('kid');pieAntic('spree');pieAntic('leak');pieAntic('mars');S.pie.founder.next=S.day+50");
  const before = F(ev);
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.deepEqual(F(ev), before, 'a round trip keeps everything');
  assert.equal(ev('R.pie.rev'), 0, 'billing still down after loading');
  // A save from before the antics: no fields at all.
  ev("{const o=JSON.parse(JSON.stringify(S));for(const k of ['jit','next','kid','bill','nerv','hype','leak','mars'])delete o.pie.founder[k];S=migrate(o);compute()}");
  const old = F(ev);
  for (const k of ['jit', 'next', 'kid', 'bill', 'nerv', 'hype', 'leak', 'mars']) assert.equal(old[k], 0, `${k} defaults to 0`);
  assert.ok(ev('R.pie.rev') > 0);
  assert.equal(ev('pieKid()'), null);
  // Junk.
  ev("{const o=JSON.parse(JSON.stringify(S)),F=o.pie.founder;Object.assign(F,{jit:7,next:'x',kid:99,bill:S.day-3,nerv:1e9,hype:-5,leak:'soon',mars:S.day+12345});S=migrate(o)}");
  const j = F(ev), d = ev('S.day');
  assert.equal(j.jit, 1);
  assert.equal(j.next, 0);
  assert.ok(j.kid >= 0 && j.kid <= ev('PIE_KIDS.length'));
  assert.ok(ev('!S.pie.founder.kid||!!pieKid()'), 'a kid that exists');
  assert.equal(j.bill, 0, 'a pause in the past is over');
  assert.ok(j.nerv <= d + 14);
  assert.equal(j.hype, 0);
  assert.equal(j.leak, 0);
  assert.equal(j.mars, 0, 'a Mars promise that is not due is dropped');
  ev("{const o=JSON.parse(JSON.stringify(S));o.pie.founder.posts.push({d:1,k:'pie.fp_kid'},{d:1,k:'pie.fp_nonsense'});S=migrate(o)}");
  assert.ok(ev("S.pie.founder.posts.some(p=>p.k==='pie.fp_kid')"), 'antic posts survive');
  assert.equal(ev("S.pie.founder.posts.some(p=>p.k==='pie.fp_nonsense')"), false);
  assert.deepEqual(errors, []);
});

test('the Company tab shows the jitters in one line at 360 px, next to the feed', () => {
  const { dom, ev, errors } = load();
  sky(ev);
  ev("window.innerWidth=360;UI.pieTab='co';ACT.pieOpen()");
  const card = () => dom.window.document.querySelector('#modalCard');
  assert.match(card().querySelector('.pie-feed .pie-jit').textContent, /^Market jitters: 😌 calm$/);
  ev("pieAntic('kid');pieAntic('spree');ACT.pieTab({t:'co'})");
  const feed = card().querySelector('.pie-feed');
  const line = feed.querySelector('p.pie-jit').textContent;
  assert.match(line, /^Market jitters: 😬 high, calming down in ~30 days$/);
  assert.ok(line.length < 60, 'short enough for a phone line');
  assert.ok(feed.querySelector('.bar.pie-jit-bar'), 'a small meter');
  assert.match(feed.textContent, /Orbit billing is down until/);
  assert.match(feed.textContent, /3 a\.m\. again\. Little \w+ Tables/);
  assert.doesNotMatch(feed.textContent, /pie_ant\.|pie\.fp_|undefined|NaN/);
  assert.equal(/style="[^"]*width:\s*\d{3,}px/.test(card().innerHTML), false, 'no fixed widths');
  days(ev, 20);
  ev("ACT.pieTab({t:'co'})");
  assert.match(card().querySelector('.pie-feed p.pie-jit').textContent, /calming down in ~1\d days|calming down in ~\d days/);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

// Pie in the Sky (docs/plans/pie-in-the-sky.md): the rocket-company endgame. Seeded; state is set directly where luck would decide.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A transit-free network in Frankfurt with a PNI to every Tier 1 it needs (as in tier1-cone.test.js), one goal short of the win.
const t1Club = (ev) => {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e11;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;delete S.done.t1;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=500");
  ev("S.transit=[];S.ixp={};S.peers={};S.pni=[];S.grace=null;for(const n of t1Need())S.pni.push({id:'p'+n.id,net:n.id,city:'fra',tier:2});S.nextFail=1e9;S.nextEvent=1e9;compute()");
  // and peer directly with the networks in nobody's cone (tier1-cone.test.js)
  ev("for(const n of NETS)if(!R.reachable[n.id]){if(!S.pops[n.pops[0]])S.pops[n.pops[0]]={day:0,bb:null,boost:0,down:0,routers:1,gen:false};S.pni.push({id:'i'+n.id,net:n.id,city:n.pops[0],tier:0});}compute()");
};
const won = (ev) => { t1Club(ev); ev('checkGoals()'); };
// A company with a factory, a pad in Singapore (1.4°N) and pies on the shelf.
const company = (ev) => ev("ACT.buildPop({city:'sin'});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});S.pie.stock=400");
const sandbox = (ev) => ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip()");

test('unlocks once, on the Tier 1 win, in a save of this version', () => {
  const { ev, errors } = load();
  t1Club(ev);
  assert.equal(ev('S.pieV'), 1);
  assert.equal(ev('S.pie'), null, 'locked before the win');
  assert.equal(ev('pieOn()'), false);
  ev('checkGoals()');
  assert.equal(ev('S.won'), true);
  assert.equal(ev('!!S.pie&&pieOn()&&pieCanBuild()'), true, 'unlocked on the transition');
  assert.ok(ev("S.log.some(e=>/Pie in the Sky is unlocked/.test(e.t))"), 'the player is told');
  const born = ev('S.pie.born');
  ev('S.day+=5;checkGoals();pieUnlock()');
  assert.equal(ev('S.pie.born'), born, 'only once');
  // reachable from the NOC tab
  ev("UI.started=true;UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.ok(ev("!!document.querySelector('[data-act=pieOpen]')"), 'the NOC tab has the Pie Control button');
  assert.deepEqual(errors, []);
});

test('an old won save stays locked, and so do puzzles and scenarios', () => {
  const { ev, errors } = load();
  won(ev);
  ev("window.__old=JSON.parse(JSON.stringify(S));delete __old.pieV;delete __old.pie");
  ev('S=migrate(JSON.parse(JSON.stringify(__old)));compute();checkGoals()');
  assert.equal(ev('S.pieV'), 0, 'missing pieV loads as 0');
  assert.equal(ev('S.pie'), null);
  assert.equal(ev('pieOn()'), false, 'already won: never unlocks');
  // even a hand-made pie in an old save is dropped
  ev("__old.pie={co:{name:'x'}};S=migrate(JSON.parse(JSON.stringify(__old)))");
  assert.equal(ev('S.pie'), null);
  // a scenario save never has it
  ev("const o=JSON.parse(JSON.stringify(__old));o.pieV=1;o.pie={};o.scn={id:'redsea'};S=migrate(o)");
  assert.equal(ev('S.pie'), null);
  assert.deepEqual(errors, []);
});

test('sandbox has it from day 0, at real prices, counting what it would have cost', () => {
  const { ev, errors } = load();
  sandbox(ev);
  assert.equal(ev('S.day'), 0);
  assert.equal(ev('pieOn()&&pieCanBuild()'), true);
  assert.equal(ev('S.pie'), null, 'created on the first action');
  const c0 = ev('S.cash');
  ev('ACT.pieFound()');
  assert.equal(ev('S.cash'), c0, 'no real money');
  assert.equal(ev('S.pie.book.wouldHave'), ev('piePrice(PIE_CO)'));
  assert.equal(ev('S.pie.book.spent'), 0);
  assert.deepEqual(errors, []);
});

test('actions cost what they should', () => {
  const { ev, errors } = load();
  won(ev);
  ev("ACT.buildPop({city:'sin'})");
  const step = (code) => { const c = ev('S.cash'); ev(code); return Math.round(c - ev('S.cash')); };
  assert.equal(step('ACT.pieFound()'), ev('piePrice(PIE_CO)'));
  assert.equal(ev('S.pie.co.name'), 'pie.co_mid_life_crisis_aerospace', 'the default name, kept as a label');
  assert.equal(step('ACT.pieFactory()'), ev('piePrice(PIE_FAC)'));
  assert.equal(step("ACT.piePad({city:'sin'})"), ev('piePrice(PIE_PAD)'));
  assert.equal(step("ACT.piePad({city:'fra'})"), 0, 'Frankfurt is not on the coast');
  assert.equal(step("ACT.pieRd({k:'reuse'})"), ev('piePrice(PIE_REUSE)'));
  assert.equal(step("ACT.pieDish({city:'fra'})"), ev('piePrice(PIE_DISH+PIE_ANT)'));
  const id = ev('S.pie.dishes[0].id');
  assert.equal(step(`ACT.pieAnt({id:'${id}'})`), ev('piePrice(PIE_ANT)'));
  assert.equal(step("ACT.pieLic({cc:'DE'})"), ev("pieLicPrice('DE')"));
  assert.ok(ev("pieLicPrice('US')") > ev("pieLicPrice('LU')"), 'big markets cost more');
  assert.ok(ev("pieLicPrice('US')<=PIE_LIC_MAX") && ev("pieLicPrice('MH')") >= 10e6);
  assert.equal(ev("pieLicOk('DE')&&pieDishes().length"), 1, 'a licensed dish is live');
  // a launch: rocket with the equatorial discount, 20 pies, the party later
  ev('S.pie.stock=100');
  const want = ev("Math.round(piePrice(60e6)*(1-pieEq('sin'))+20*piePrice(PIE_PIE))");
  assert.equal(step("ACT.pieLaunch({rk:'falcon',cr:'short'})"), want);
  assert.ok(ev("pieEq('sin')") > 0.14 && ev("pieEq('lon')") === 0, 'near the equator is cheaper');
  assert.equal(ev('S.pie.stock'), 80, 'pies come off the shelf');
  // the pad is busy: the next launch waits for it
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'})");
  assert.ok(ev('S.pie.q[1].day') >= ev('S.pie.q[0].day') + ev('leadDays(ROCKETS.falcon.gap)'), 'pad cadence');
  // insurance adds 8%
  ev('S.pie.opt.ins=true');
  const q = JSON.parse(ev("JSON.stringify(pieQuote('falcon','short',{ins:true}))"));
  assert.equal(q.cost - q.insured, Math.round(q.insured * 0.08));
  // running costs show up in the monthly bill
  ev('compute()');
  assert.equal(ev('R.cost.pie'), ev('PIE_CO_MO+PIE_FAC_MO+PIE_PAD_MO+PIE_DISH_MO'));
  assert.deepEqual(errors, []);
});

test('launches fill crusts, the party is billed, heavy test flights explode', () => {
  const { ev, errors } = load();
  won(ev);
  company(ev);
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'})");
  const due = ev('S.pie.q[0].day');
  const spent = ev('S.pie.book.spent');
  ev(`while(S.day<${due})dayTick()`);
  assert.equal(ev('S.pie.q.length'), 0);
  assert.equal(ev("pieLive('short')"), 20, 'the pies are up (no failures in the first 90 days)');
  assert.ok(ev('S.pie.book.spent') - spent >= 2e6, 'the launch party is billed');
  assert.ok(ev('S.pie.founder.posts.length') >= 1);
  // the heavy rocket's first three flights carry nothing and explode
  ev("ACT.pieRd({k:'heavy'})");
  for (let i = 0; i < 3; i++) { ev("S.pie.pads[0].next=S.day;ACT.pieLaunch({rk:'heavy',cr:'short'})"); }
  assert.equal(ev('S.pie.q.filter(L=>L.test).length'), 3);
  ev("S.pie.pads[0].next=S.day;ACT.pieLaunch({rk:'heavy',cr:'short'})");
  assert.equal(ev('S.pie.q.filter(L=>L.test).length'), 3, 'the fourth is a real one');
  assert.equal(ev('S.pie.q[3].n'), 100);
  ev('for(let i=0;i<60;i++)dayTick()');
  assert.equal(ev('S.pie.rd.heavyTests'), 3);
  assert.equal(ev("pieLive('short')"), 120);
  assert.deepEqual(errors, []);
});

test('cohorts wear out over the end of their life, and a crust carries a share from 40%, all of it from 60%', () => {
  const { ev, errors } = load();
  won(ev);
  company(ev);
  ev("S.pie.crusts.short.cohorts.push({n:600,day:S.day,las:false})");
  assert.equal(ev("pieUp('short')"), false, `${ev("pct(pieCov('short'))")} carries nothing`);
  ev("S.pie.crusts.short.cohorts[0].n=Math.round(CRUSTS.short.full*0.5)");
  assert.equal(ev("pieBaked('short')"), false, `${ev("pct(pieCov('short'))")} is half-baked`);
  assert.equal(ev("pieUp('short')"), true, 'but over 40% it carries something');
  assert.ok(Math.abs(ev("pieCarry('short')") - 0.5) < 0.01, 'half way from 40% to 60%: half of it');
  assert.ok(Math.abs(ev("pieCap('short')") - ev('CRUSTS.short.g*0.25')) < ev('CRUSTS.short.g') * 0.01, 'half its capacity at half coverage');
  ev("S.pie.crusts.short.cohorts[0].n=900");
  ev("S.pie.crusts.short.cohorts.push({n:60,day:S.day,las:true})");
  assert.equal(ev("pieBaked('short')&&pieUp('short')"), true, '60% bakes it');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(pieHubs())')), ['short']);
  ev('S.pie.safe=true');
  assert.equal(ev("pieUp('short')"), false, 'safe mode parks it');
  ev('S.pie.safe=false;pieDay(S.day)');
  assert.equal(ev('S.pie.crusts.short.bk'), 1);
  const g = JSON.parse(ev('JSON.stringify(pieGlobeData())'));
  assert.equal(g.crusts.find((c) => c.id === 'short').n, 960);
  assert.equal(g.crusts.find((c) => c.id === 'short').las, 60);
  assert.equal(g.pads[0].city, 'sin');
  // wear: in full until the last PIE_WEAR of their life, then a few fewer every day, gone at its end
  const life = ev('CRUSTS.short.life'), w = Math.round(life * ev('PIE_WEAR'));
  const at = (d) => ev(`S.day=S.pie.crusts.short.cohorts[0].day+${d};pieLive('short')`);
  assert.equal(at(life - w), 960, 'in full until they start to wear');
  const mid = at(life - w / 2), late = at(life - 10);
  assert.ok(Math.abs(mid - 480) <= 1, `half worn out half way (${mid})`);
  assert.ok(late > 0 && late < mid && late <= 960 * 10 / w + 1, `a few left near the end (${late})`);
  for (let d = life - w; d < life; d += 7) assert.ok(at(d) - at(d + 7) <= Math.ceil(960 * 7 / w) + 1, `no cliff at day ${d}`);
  ev("S.day=S.pie.crusts.short.cohorts[0].day+CRUSTS.short.life;pieDay(S.day)");
  assert.equal(ev("pieLive('short')"), 0, 'old pies deorbit');
  assert.equal(ev('S.pie.crusts.short.cohorts.length'), 0);
  assert.deepEqual(errors, []);
});

test('promises slip a year and get broken', () => {
  const { ev, errors } = load();
  won(ev);
  company(ev);
  assert.equal(ev('S.pie.founder.promises'), 1);
  assert.ok(ev('S.pie.founder.due[0]-S.day') >= 359, 'due a year from the promise');
  // Then a year passes: rather than play 360 days, the due date moves to tomorrow.
  ev('S.pie.founder.due[0]=S.day+1;for(let i=0;i<2;i++)dayTick()');
  assert.equal(ev('S.pie.founder.broken'), 1);
  assert.ok(ev("S.pie.founder.posts.some(p=>p.k==='pie.fp_slip')"));
  assert.match(ev('pieFpText(S.pie.founder.posts[0])'), /\w/);
  assert.deepEqual(errors, []);
});

test('sanitize repairs a hand-broken S.pie', () => {
  const { ev, errors } = load();
  won(ev);
  company(ev);
  ev("S.pie.crusts.bogus={cohorts:[{n:5,day:0}]};S.pie.crusts.short.cohorts=[{n:'lots',day:-5},{n:1e9,day:S.day},null,{n:20,day:S.day,las:1}]");
  ev("S.pie.pads.push({city:'atlantis'},{city:'fra',next:'soon'},{city:'sin'},'x');S.pie.dishes=[{city:'fra',ant:999},{city:'fra',ant:2},{city:'ber'},{city:'zzz'}]");
  ev("S.pie.q=[{rk:'warp',cr:'short',pad:'sin'},{rk:'heavy',cr:'short',pad:'sin'},{rk:'falcon',cr:'nope',pad:'sin'},{rk:'falcon',cr:'short',pad:'sin',n:9999,day:'x'}]");
  ev("S.pie.lic={DE:{state:'ok',until:1e12},XX:{state:'ok'},FR:{state:'weird'}};S.pie.founder.posts=[{k:'evil.label',d:0},{k:'pie.fp_launch',n:-4,c:'hack'}];S.pie.book={spent:NaN,earned:'1'};S.pie.co={name:'  My   Rockets  '}");
  ev("S.pie.spat={nothing:{until:9}};S.pie.stock=1e9;S.pie.rd={heavyTests:99}");
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  const P = JSON.parse(ev('JSON.stringify(S.pie)'));
  assert.deepEqual(Object.keys(P.crusts).sort(), ['flaky', 'frozen', 'short', 'upper']);
  assert.ok(P.crusts.short.cohorts.every((k) => Number.isInteger(k.n) && k.n <= 3168 && k.n >= 1));
  assert.deepEqual(P.pads.map((p) => p.city), ['sin'], 'only pads at your coastal POPs');
  assert.deepEqual(P.dishes.map((d) => [d.city, d.ant]), [['fra', 16]], 'one dish per POP city, antennas capped');
  assert.deepEqual(P.q.map((L) => [L.rk, L.n]), [['falcon', 20]], 'no unknown rockets or crusts, no heavy without its research');
  assert.equal(P.lic.DE.until <= ev('S.day') + 3600, true);
  assert.equal(P.lic.XX, undefined);
  assert.equal(P.lic.FR.state, 'ok');
  assert.deepEqual(P.founder.posts.map((p) => p.k), ['pie.fp_launch']);
  assert.equal(P.founder.posts[0].c, undefined);
  assert.equal(P.book.spent, 0);
  assert.equal(P.co.name, 'My Rockets');
  assert.deepEqual(P.spat, {});
  assert.equal(P.stock, 480);
  assert.equal(P.rd.heavyTests, 0, 'no tests without the research');
  assert.equal(P.crusts.short.queued, 20);
  // a save from this version without a company loads too, and garbage becomes nothing
  ev("S.pie='pie';S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.pie'), null);
  assert.deepEqual(errors, []);
});

test('losing Tier 1 blocks new building, keeps what flies, and earns the Listening Tour', () => {
  const { ev, errors } = load();
  won(ev);
  company(ev);
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'});dayTick()");
  ev("S.transit.push({id:'tt',city:'fra',net:'cog',tier:1,n:1,down:0});compute()");
  assert.equal(ev('pieCanBuild()'), false);
  const c = ev('S.cash');
  ev("ACT.piePad({city:'sin'});ACT.pieDish({city:'sin'});ACT.pieLaunch({rk:'falcon',cr:'short'});ACT.pieRd({k:'heavy'})");
  assert.equal(ev('S.cash'), c, 'nothing new');
  assert.equal(ev('S.pie.q.length'), 1, 'the queued launch stays');
  ev('dayTick()');
  assert.equal(ev('S.stats.pieTour'), 1);
  ev('checkBadges()');
  assert.ok(ev("S.ach.tour!==undefined"), 'Listening Tour');
  ev('for(let i=0;i<20;i++)dayTick()');
  assert.equal(ev("pieLive('short')"), 20, 'it still flies');
  assert.deepEqual(errors, []);
});

test('Burned a Billion and Fully Baked', () => {
  const { ev, errors } = load();
  won(ev);
  company(ev);
  ev('checkBadges()');
  assert.ok(ev("S.ach.billion!==undefined"), 'a company, a factory and a pad cost over a billion');
  ev("S.pie.crusts.frozen.cohorts.push({n:520,day:S.day,las:false});checkBadges()");
  assert.ok(ev("S.ach.baked!==undefined"));
  assert.deepEqual(errors, []);
});

test('saves without a rocket company pay nothing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();compute()");
  assert.equal(ev('R.cost.pie'), undefined);
  assert.equal(ev("pieDay(S.day)"), undefined);
  assert.equal(ev('pieDishes().length+pieHubs().length'), 0);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(pieGlobeData())')), { crusts: [], dishes: [], pads: [], launches: [] });
  assert.equal(ev("pieNocBtn()"), '', 'no Pie Control button while locked');
  assert.deepEqual(errors, []);
});

test('Pie Control renders every tab on a phone', () => {
  const { dom, ev, errors } = load();
  ev('window.innerWidth=360');
  won(ev);
  company(ev);
  for (const t of ['home', 'fix', 'crust', 'dish', 'cust', 'co']) {
    ev(`ACT.pieTab({t:'${t}'})`);
    assert.equal(ev("$('modal').hidden"), false);
    assert.ok(dom.window.document.querySelectorAll('#modalCard [data-act]').length > 2, t);
  }
  ev("ACT.pieTab({t:'co'});ACT.pieName()");
  assert.equal(ev('S.pie.co.name'), 'pie.co_hubris_heavy_industries');
  ev("$('pieNm').value='Rocket Pie Co';ACT.pieRename()");
  assert.equal(ev('pieCoName()'), 'Rocket Pie Co');
  ev('closeModal()'); // an open globe keeps its animation loop, and this process, alive
  assert.deepEqual(errors, []);
});

test('the globe spins only while Pie Control is open', () => {
  const { dom, ev, errors } = load();
  won(ev);
  company(ev);
  assert.equal(ev('PG.raf'), 0, 'nothing runs before the panel opens');
  ev("ACT.pieTab({t:'home'})");
  assert.ok(dom.window.document.querySelector('#modal .pgcv'), 'the overview carries the globe');
  assert.ok(ev('PG.raf') > 0, 'and it spins');
  ev('closeModal()');
  assert.equal(ev('PG.raf'), 0, 'closing the panel stops it');
  assert.equal(ev('PG.cv'), null);
  assert.deepEqual(errors, []);
});

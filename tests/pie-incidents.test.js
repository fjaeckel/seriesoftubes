// Pie in the Sky incidents (docs/plans/pie-in-the-sky.md, rule O5): seeded, and each incident is forced where luck would decide.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// An On-call network in Frankfurt with a rocket company: open gates (as in sandbox) but real chaos, so incidents can fire.
const sky = (ev, preset = 'oncall', o = {}) => {
  ev(`beginGame('Sky','fra',{mode:'normal',preset:'${preset}',rules:${JSON.stringify(Object.assign({ gates: 'open' }, o))}});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;S.nextFail=1e9;S.nextEvent=1e9;S.monkey&&(S.monkey.next=1e9)`);
  ev("for(const c of ['sin','jkt','ams','bru'])ACT.buildPop({city:c});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});for(const c of ['sin','jkt','ams','bru','fra'])ACT.pieDish({city:c});for(const cc of ['SG','ID','NL','BE','DE'])ACT.pieLic({cc})");
  ev("pieCohort('short',1200,true);pieCohort('upper',300,false);S.day=S.pie.born+120;compute()");
};
const close = (ev) => ev('closeModal()');

test('O5: quiet for 90 days after the unlock, and a quiet ruleset gives a quiet year', () => {
  const { ev, errors } = load();
  sky(ev);
  ev('S.day=S.pie.born;pieIncDay(S.day)');
  ev('Math.random=()=>0'); // every roll would fire
  ev('for(let d=0;d<89;d++){S.day=S.pie.born+d;pieIncDay(S.day);pieSpatDayAll(S.day)}');
  assert.equal(ev("S.inc.filter(i=>i.type.startsWith('pie')).length+Object.keys(S.pie.spat).length"), 0, 'O5: 90 quiet days');
  ev('S.day=S.pie.born+90;pieIncDay(S.day)');
  assert.ok(ev("S.inc.some(i=>i.type.startsWith('pie'))||S.stats.survived>0"), 'then chaos may bite');
  // chaos none: a whole year of dayTick with the dice always saying yes
  const q = load();
  sky(q.ev, 'oncall', { chaos: 'none' });
  q.ev('__reseed(77);for(let i=0;i<360;i++)dayTick()');
  assert.equal(q.ev("S.inc.filter(i=>i.type.startsWith('pie')).length+Object.keys(S.pie.spat).length+(S.stats.pieSpat||0)"), 0, 'M3: chaos none, nothing in orbit');
  assert.deepEqual(errors, []);
  assert.deepEqual(q.errors, []);
});

test('a seeded year in orbit is the same every time, and things do happen', () => {
  const run = () => {
    const g = load();
    sky(g.ev, 'bgp');
    g.ev('__reseed(4242);for(let i=0;i<360;i++){dayTick();for(const k in S.pie.spat)if(S.pie.spat[k].st===\'ask\')pieSpatChoose(k,1,false)}');
    assert.deepEqual(g.errors, []);
    return g.ev("JSON.stringify([S.stats.by,S.stats.pieSpat||0,Object.keys(CRUSTS).map(pieLive)])");
  };
  const a = run();
  assert.equal(a, run(), 'deterministic per seed');
  assert.match(a, /pie/, 'a year of BGP at 3 a.m. brings something to orbit');
});

test('solar storm: a crust loses 2 to 10% in a week, safe mode saves most of it', () => {
  const storm = (safe) => {
    const { ev, errors } = load();
    sky(ev);
    ev(`window.__n0={};for(const id in CRUSTS)__n0[id]=pieLive(id);S.pie.safe=${safe};Math.random=()=>0.99;pieIncFire('storm')`);
    const i = ev("JSON.stringify(S.inc.find(i=>i.type==='piestorm'))");
    const o = JSON.parse(i), cr = o.ref, n0 = ev(`__n0['${cr}']`);
    assert.ok(o.f >= 0.02 && o.f <= 0.1, `loss share ${o.f}`);
    assert.equal(o.until - ev('S.day'), 7, 'a week');
    assert.ok(ev("S.log.some(e=>/press office/i.test(e.t))"), 'the press office has a line');
    ev('for(let d=0;d<7;d++){S.day++;pieIncDay(S.day)}');
    const lost = 1 - ev(`pieLive('${cr}')`) / n0;
    assert.deepEqual(errors, []);
    return [lost, o.f];
  };
  const [open, f] = storm(false), [safe] = storm(true);
  assert.ok(Math.abs(open - f) < 0.02, `about ${f} lost without safe mode (${open})`);
  assert.ok(safe < open / 2, `safe mode saves most (${safe} vs ${open})`);
});

test('food fight: a slice gone, launches dearer for a year, a Space Roomba fixes it', () => {
  const { ev, errors } = load();
  sky(ev);
  const before = ev("pieQuote('falcon','short').cost");
  const n0 = ev("pieLive('short')+pieLive('upper')");
  ev("Math.random=()=>0;pieIncFire('food')");
  const i = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='piefood'))"));
  assert.ok(i, 'debris');
  assert.equal(i.until - ev('S.day'), 360, 'a year');
  assert.ok(ev("pieLive('short')+pieLive('upper')") < n0, 'a slice of the crust is gone');
  ev("S.pie.opt.ins=false");
  const q = ev(`pieQuote('falcon','${i.ref}').cost`), q0 = i.ref === 'short' ? before : null;
  if (q0) assert.ok(q > q0, `launches cost more (${q} > ${q0})`);
  ev(`ACT.fixInc({id:'${i.id}'})`);
  assert.equal(ev("S.inc.some(i=>i.type==='piefood')"), false, 'the Roomba cleans it up');
  if (q0) assert.equal(ev(`pieQuote('falcon','${i.ref}').cost`), q0, 'and prices are back');
  assert.deepEqual(errors, []);
});

test('rain fade: a tropical dish runs at 30% for a few days', () => {
  const { ev, errors } = load();
  sky(ev);
  const g = (c) => ev(`(pieDishes().find(x=>x.city==='${c}')||{}).g`);
  const sin = g('sin'), ams = g('ams');
  ev("Math.random=()=>0;pieIncFire('rain')");
  const c = ev("S.inc.find(i=>i.type==='pierain').ref");
  assert.ok(['sin', 'jkt'].includes(c), 'only in the tropics');
  assert.equal(g(c), Math.round(sin * 0.3 * 1000) / 1000 || sin * 0.3);
  assert.equal(g('ams'), ams, 'Amsterdam is dry');
  ev('S.day+=10;dayTick()');
  assert.equal(g(c), sin, 'the clouds move on');
  assert.deepEqual(errors, []);
});

test('backhoe at the dish: its backhaul is down until fixed or healed', () => {
  const { ev, errors } = load();
  sky(ev);
  const n = ev('pieDishes().length');
  ev("Math.random=()=>0;pieIncFire('dig')");
  const i = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='piedig'))"));
  assert.equal(ev('pieDishes().length'), n - 1, 'one dish carries nothing');
  assert.ok(i.cost > 0);
  ev(`ACT.fixInc({id:'${i.id}'})`);
  assert.equal(ev('pieDishes().length'), n, 'a rush splice brings it back');
  ev("pieIncFire('dig')");
  ev('for(let d=0;d<4;d++)dayTick()');
  assert.equal(ev('pieDishes().length'), n, 'or it heals by itself');
  assert.deepEqual(errors, []);
});

test('astronomers: pay for VisorSat, or science customers sulk', () => {
  const run = (c) => {
    const { ev, errors } = load();
    sky(ev);
    ev("S.biz.push({id:'u1',type:'edu',city:'fra',bw:20,rate:90,mood:80,since:0,name:'Uni'},{id:'d1',type:'dia',city:'fra',bw:1,rate:600,mood:80,since:0,name:'Shop'})");
    ev("Math.random=()=>0;pieIncFire('astro')");
    assert.equal(ev("S.pie.spat.astro.st"), 'ask');
    const cash = ev('S.cash');
    ev(`ACT.pieSpatOpen({id:'astro'})`);
    assert.ok(ev("!!document.querySelector('#modal [data-act=pieSpatPick]')"), 'a sheet with the choices');
    ev(`ACT.pieSpatPick({id:'astro',c:${c}})`);
    const r = { paid: cash - ev('S.cash'), edu: ev("S.biz.find(b=>b.id==='u1').mood"), dia: ev("S.biz.find(b=>b.id==='d1').mood") };
    ev('dayTick()');
    assert.equal(ev('!!S.pie.spat.astro'), false, 'over');
    close(ev);
    assert.deepEqual(errors, []);
    return r;
  };
  const pay = run(0), no = run(1);
  assert.ok(pay.paid > 0 && pay.edu === 80, 'VisorSat costs money and keeps the peace');
  assert.ok(no.paid <= 0 && no.edu === 60 && no.dia === 80, 'only science customers lose mood');
});

test('the Founder posts at 3 a.m.: a mood dip or a demand spike', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("S.biz.push({id:'d1',type:'dia',city:'fra',bw:1,rate:600,mood:80,since:0,name:'Shop'})");
  ev("Math.random=()=>0.1;pieIncFire('founder')");
  assert.equal(ev("S.biz[0].mood"), 75, 'a dip');
  ev("Math.random=()=>0.9;pieIncFire('founder')");
  assert.ok(ev('S.ev.viral>S.day'), 'or a spike');
  assert.equal(ev("S.pie.founder.posts[0].k"), 'pie.fp_3am');
  assert.deepEqual(errors, []);
});

test('F4: the chaos monkey snips a laser link while it visits, healed within a week', () => {
  const { ev, errors } = load();
  sky(ev);
  assert.ok(ev("pieLiveLas('short')") > 0);
  ev("S.monkey={on:1,start:S.day,until:S.day+100,snip:1e9,n:0,hurt:0,c:'fra',next:0};Math.random=()=>0.01");
  assert.equal(ev('mkOn()'), true);
  ev('pieIncDay(S.day)');
  const i = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='pielaser'))"));
  assert.ok(i, 'snipped');
  assert.ok(i.until - ev('S.day') <= 7, 'heals within a week');
  assert.equal(ev(`pieLiveLas('${i.ref}')`), 0, 'no lasers in that crust meanwhile');
  ev('Math.random=()=>0.99;for(let d=0;d<8;d++)dayTick()');
  assert.ok(ev(`pieLiveLas('${i.ref}')`) > 0, 'lasers back');
  // and never outside a monkey visit
  ev("S.monkey.on=0;S.inc=S.inc.filter(i=>i.type!=='pielaser');Math.random=()=>0.01;pieIncDay(S.day)");
  assert.equal(ev("S.inc.some(i=>i.type==='pielaser')"), false);
  assert.deepEqual(errors, []);
});

test('sanitize drops orbit incidents that make no sense, and old saves are untouched', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("Math.random=()=>0;pieIncFire('storm');pieIncFire('dig')");
  ev("S.inc.push({id:'x1',type:'piestorm',ref:'nope',until:S.day+3,msg:'',cost:0},{id:'x2',type:'pierain',ref:'atlantis',until:S.day+3,msg:'',cost:0},{id:'x3',type:'piestorm',ref:'short',start:-5,until:1e9,f:9,msg:'',cost:0})");
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev("S.inc.filter(i=>i.type.startsWith('pie')).length"), 3);
  assert.ok(ev("S.inc.filter(i=>i.type==='piestorm').every(i=>i.f<=0.1&&i.until<=S.day+400)"), 'clamped');
  // an old save: no pie, no orbit incidents survive
  ev("const o=JSON.parse(JSON.stringify(S));delete o.pieV;delete o.pie;S=migrate(o)");
  assert.equal(ev("S.inc.some(i=>i.type.startsWith('pie'))"), false);
  assert.equal(ev('S.pie'), null);
  ev('for(let i=0;i<30;i++)dayTick()');
  assert.deepEqual(errors, []);
});

test('no single incident takes more than a tenth of a crust', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("window.__n0={};for(const id in CRUSTS)__n0[id]=pieLive(id);Math.random=()=>0.9999;pieIncFire('food')");
  const i = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='piefood'))")), n0 = ev(`__n0['${i.ref}']`), after = ev(`pieLive('${i.ref}')`);
  assert.ok(n0 - after > 0 && (n0 - after) / n0 <= ev('PIE_HIT') + 0.005, `a food fight took ${n0 - after} of ${n0}`);
  ev("S.inc=[];Math.random=()=>0.9999;pieIncFire('storm')");
  const s = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='piestorm'))")), m0 = ev(`pieLive('${s.ref}')`);
  ev('for(let d=0;d<7;d++){S.day++;pieIncDay(S.day)}');
  const lost = 1 - ev(`pieLive('${s.ref}')`) / m0;
  assert.ok(s.f <= 0.1 && lost <= 0.1 + 0.005, `the worst storm took ${lost}`);
  assert.deepEqual(errors, []);
});

// Pie in the Sky geopolitical spats (docs/plans/pie-in-the-sky.md): seeded; each spat is started directly, with Math.random
// pinned so the country it picks is known.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// On-call with open gates: real chaos, everything buildable. Dishes in Amsterdam (NL), Brussels (BE), Singapore, Frankfurt.
const sky = (ev, o = {}) => {
  ev(`beginGame('Sky','fra',{mode:'normal',preset:'oncall',rules:${JSON.stringify(Object.assign({ gates: 'open' }, o))}});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;S.nextFail=1e9;S.nextEvent=1e9;S.monkey&&(S.monkey.next=1e9)`);
  ev("for(const c of ['sin','ams','bru'])ACT.buildPop({city:c});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});for(const c of ['ams','bru','fra','sin'])ACT.pieDish({city:c});for(const cc of ['NL','BE','DE','SG'])ACT.pieLic({cc})");
  ev("pieCohort('short',1200,true);S.day=S.pie.born+120;compute();S.pie.stock=400");
};
// Start spat id against country cc (the candidate list is pinned to it).
const start = (ev, id, cc) => ev(`{const D=PIE_SPAT_DEF['${id}'],c=D.can;${cc ? `D.can=()=>c().includes('${cc}')?['${cc}']:[];` : ''}const r=pieSpatStart('${id}');D.can=c;r}`);
const sp = (ev, id) => JSON.parse(ev(`JSON.stringify(S.pie.spat['${id}']||null)`));
const lic = (ev, cc) => ev(`pieLicOk('${cc}')`);
const days = (ev, n) => ev(`for(let i=0;i<${n};i++)dayTick()`);

test('every spat asks with two answers on a phone-sized sheet, and the NOC lists it', () => {
  const { dom, ev, errors } = load();
  sky(ev);
  ev("window.innerWidth=360;ACT.buildPop({city:'lon'})");
  for (const [id, cc] of [['air', 'NL'], ['astro'], ['band', 'NL'], ['grab'], ['home', 'GB'], ['jam', 'NL'], ['kill', 'DE'], ['lic', 'SG'], ['pad']]) {
    ev('S.pie.spat={};S.pie.lic={};for(const cc of [\'NL\',\'BE\',\'DE\',\'SG\'])S.pie.lic[cc]={state:\'ok\',until:S.day+360}');
    assert.equal(start(ev, id, cc), true, `${id} starts`);
    assert.ok(ev("S.log[0].t.length>10"), `${id} is announced`);
    ev(`ACT.pieSpatOpen({id:'${id}'})`);
    const b = dom.window.document.querySelectorAll('#modal [data-act=pieSpatPick]');
    assert.equal(b.length, 2, `${id}: two choices`);
    assert.ok(/press office/i.test(dom.window.document.querySelector('#modal').textContent), `${id}: a press office line`);
    assert.doesNotMatch(dom.window.document.querySelector('#modal').textContent, /pie_spat\.|undefined|NaN/, `${id}: no raw labels`);
    ev("UI.started=true;UI.left='noc';UI.leftOpen=true;renderLeft()");
    assert.ok(ev(`!!document.querySelector('[data-act=pieSpatOpen][data-args*="${id}"]')`), `${id}: on the NOC card`);
  }
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('landing rights refused, then given back with the days you had', () => {
  const { ev, errors } = load();
  sky(ev);
  const left = ev("S.pie.lic.SG.until-S.day");
  start(ev, 'lic', 'SG');
  ev("ACT.pieSpatPick({id:'lic',c:1})");
  assert.equal(ev("S.pie.lic.SG.state"), 'refused', "a 'refused' state");
  assert.equal(lic(ev, 'SG'), false);
  assert.equal(ev("pieDishes().some(x=>x.cc==='SG')"), false, 'the dish there carries nothing');
  ev("ACT.pieLic({cc:'SG'})");
  assert.equal(lic(ev, 'SG'), false, 'cannot buy your way past it');
  const until = sp(ev, 'lic').until, n = until - ev('S.day');
  assert.ok(n >= 90 && n <= 180, `refused 90 to 180 days (${n})`);
  days(ev, n + 1);
  assert.equal(lic(ev, 'SG'), true, 'back');
  assert.equal(ev("S.pie.lic.SG.until-S.day"), left - 1, 'with the days you had left');
  assert.deepEqual(errors, []);
});

test('the lobbyist shortens a refusal to 30 days', () => {
  const { ev, errors } = load();
  sky(ev);
  start(ev, 'lic', 'SG');
  const cash = ev('S.cash');
  ev("ACT.pieSpatPick({id:'lic',c:0})");
  assert.ok(ev('S.cash') < cash);
  assert.equal(sp(ev, 'lic').until - ev('S.day'), 30);
  assert.deepEqual(errors, []);
});

test('spectrum squabble: neighbours, pick a side, the other suspends for 180 days', () => {
  const { ev, errors } = load();
  sky(ev);
  start(ev, 'band', 'NL');
  const o = sp(ev, 'band');
  assert.equal(o.cc, 'NL');
  assert.equal(o.cc2, 'BE', 'the neighbour comes from the city table');
  ev("ACT.pieSpatPick({id:'band',c:0})");
  assert.equal(lic(ev, 'NL'), true, 'the side you took keeps you');
  assert.equal(ev("S.pie.lic.BE.state"), 'sus', "a 'sus' state");
  assert.equal(sp(ev, 'band').until - ev('S.day'), 180);
  days(ev, 181);
  assert.equal(lic(ev, 'BE'), true, 'forgiven after 180 days');
  // no answer: both suspend for 90
  ev('S.pie.spat={}');
  start(ev, 'band', 'NL');
  days(ev, 21);
  assert.equal(lic(ev, 'NL') || lic(ev, 'BE'), false, 'no side: both annoyed');
  assert.deepEqual(errors, []);
});

test('kill switch: comply costs mood there, refuse suspends 90 days', () => {
  const run = (c) => {
    const { ev, errors } = load();
    sky(ev);
    ev("S.biz.push({id:'b1',type:'dia',city:'fra',bw:1,rate:600,mood:80,since:0,name:'Shop'},{id:'b2',type:'dia',city:'ams',bw:1,rate:600,mood:80,since:0,name:'Shop2'})");
    start(ev, 'kill', 'DE');
    ev(`ACT.pieSpatPick({id:'kill',c:${c}})`);
    const r = { de: ev("S.biz[0].mood"), nl: ev("S.biz[1].mood"), lic: lic(ev, 'DE'), n: (sp(ev, 'kill') || {}).until - ev('S.day') };
    assert.deepEqual(errors, []);
    return r;
  };
  const yes = run(0), no = run(1);
  assert.deepEqual([yes.de, yes.nl, yes.lic], [65, 80, true], 'comply: customers there lose 15');
  assert.deepEqual([no.de, no.lic, no.n], [80, false, 90], 'refuse: licence suspended 90 days');
});

test('data stays home: a dish in the country settles it, or a fine at the end', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("ACT.buildPop({city:'lon'});S.biz.push({id:'b1',type:'dia',city:'lon',bw:1,rate:600,mood:80,since:0,name:'Shop'})");
  start(ev, 'home', 'GB');
  ev("ACT.pieSpatPick({id:'home',c:0})");
  assert.equal(ev("pieSpatHome('GB')"), true, 'British customers must land in Britain');
  ev("ACT.pieDish({city:'lon'});S.biz[0].mood=50;PIE_SPAT_DEF.home.day(S.pie.spat.home,S.day)");
  assert.equal(ev("pieSpatHome('GB')"), false, 'a dish there settles it');
  assert.equal(ev('S.biz[0].mood'), 55, 'and the customers there are pleased');
  // and when nobody builds one
  ev("S.pie.dishes=S.pie.dishes.filter(x=>x.city!=='lon');S.pie.spat={}");
  start(ev, 'home', 'GB');
  ev("ACT.pieSpatPick({id:'home',c:0})");
  const spent = ev('S.cash');
  days(ev, 91);
  assert.equal(ev('!!S.pie.spat.home'), false);
  assert.ok(ev("S.log.some(e=>/a fine of/.test(e.t))"), 'fined');
  assert.ok(ev('S.cash') < spent - 1e6);
  assert.deepEqual(errors, []);
});

test('orbital land grab: the next launches cost more, then prices are back', () => {
  const { ev, errors } = load();
  sky(ev);
  const q0 = ev("pieQuote('falcon','short').cost");
  start(ev, 'grab');
  ev("ACT.pieSpatPick({id:'grab',c:1})");
  const q1 = ev("pieQuote('falcon','short').cost");
  assert.ok(q1 > q0, `dearer (${q1} > ${q0})`);
  for (let i = 0; i < 5; i++) ev("S.pie.pads[0].next=0;ACT.pieLaunch({rk:'falcon',cr:'short'})");
  assert.equal(ev('S.pie.spat.grab.left'), 0);
  ev('dayTick()');
  assert.equal(ev('!!S.pie.spat.grab'), false, 'over after five launches');
  ev('S.pie.pads[0].next=0');
  assert.equal(ev("pieQuote('falcon','short').cost"), q0);
  // lawyers cut the surcharge
  start(ev, 'grab');
  ev("ACT.pieSpatPick({id:'grab',c:0})");
  assert.ok(ev("pieQuote('falcon','short').cost") < q1);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('jamming near a border: dishes there drop for some days, filters help', () => {
  const { ev, errors } = load();
  sky(ev);
  const g = (c) => ev(`(pieDishes().find(x=>x.city==='${c}')||{g:0}).g`);
  const ams = g('ams'), sin = g('sin');
  start(ev, 'jam', 'NL');
  const o = sp(ev, 'jam'), n = o.until - ev('S.day');
  assert.ok(n >= 5 && n <= 10, `some days (${n})`);
  assert.equal(g('ams'), ams * 0.4);
  assert.equal(g('bru'), ams * 0.4, 'both sides of the border');
  assert.equal(g('sin'), sin, 'far away is fine');
  ev("ACT.pieSpatPick({id:'jam',c:0})");
  assert.equal(g('ams'), ams * 0.8, 'filters');
  days(ev, n + 1);
  assert.equal(g('ams'), ams, 'quiet again');
  assert.deepEqual(errors, []);
});

test('launch diplomacy: three dishes there bring a free pad', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("for(const c of ['bom','maa','del'])ACT.buildPop({city:c})");
  start(ev, 'pad', 'IN');
  ev("ACT.pieSpatPick({id:'pad',c:0})");
  const pads = ev('S.pie.pads.length');
  for (const c of ['bom', 'maa', 'del']) ev(`ACT.pieDish({city:'${c}'})`);
  ev('dayTick()');
  assert.equal(ev('S.pie.pads.length'), pads + 1, 'a pad, free');
  assert.ok(ev("S.pie.pads.some(p=>CITY[p.city].cc==='IN')"));
  // a broken promise suspends landing rights
  ev("S.pie.spat={};S.pie.pads=S.pie.pads.filter(p=>CITY[p.city].cc!=='IN');S.pie.dishes=S.pie.dishes.filter(x=>CITY[x.city].cc!=='IN');ACT.pieLic({cc:'IN'})");
  start(ev, 'pad', 'IN');
  ev("ACT.pieSpatPick({id:'pad',c:0})");
  days(ev, 181);
  assert.equal(ev("S.pie.lic.IN.state"), 'sus');
  assert.deepEqual(errors, []);
});

test('not over my airspace: split the network, or both suspend', () => {
  const run = (c) => {
    const { ev, errors } = load();
    sky(ev);
    const ams = ev("pieDishes().find(x=>x.city==='ams').g");
    start(ev, 'air', 'NL');
    ev(`ACT.pieSpatPick({id:'air',c:${c}})`);
    const r = { blk: ev("pieAirBlock('NL','BE')"), g: ev("(pieDishes().find(x=>x.city==='ams')||{g:0}).g") / ams, nl: lic(ev, 'NL'), be: lic(ev, 'BE'), n: sp(ev, 'air').until - ev('S.day') };
    days(ev, r.n + 1);
    r.after = lic(ev, 'NL') && lic(ev, 'BE') && !ev("pieAirBlock('NL','BE')");
    assert.deepEqual(errors, []);
    return r;
  };
  assert.deepEqual(run(0), { blk: true, g: 0.75, nl: true, be: true, n: 120, after: true });
  assert.deepEqual(run(1), { blk: false, g: 0, nl: false, be: false, n: 60, after: true });
});

test('an unanswered spat decides itself on its deadline, deterministically', () => {
  const run = () => {
    const { ev, errors } = load();
    sky(ev, { chaos: 'spicy' });
    ev('__reseed(99);for(let i=0;i<500;i++)dayTick()');
    assert.deepEqual(errors, []);
    return ev("JSON.stringify([S.stats.pieSpat||0,S.pie.lic,Object.keys(S.pie.spat)])");
  };
  const a = run();
  assert.equal(a, run());
  assert.ok(JSON.parse(a)[0] >= 1, 'spats happen with chaos on');
});

test('quiet: no spat in the first 90 days, nor ever without chaos', () => {
  const { ev, errors } = load();
  sky(ev);
  ev('Math.random=()=>0;S.day=S.pie.born+10;pieSpatDayAll(S.day)');
  assert.equal(ev('Object.keys(S.pie.spat).length'), 0, 'O5');
  ev('S.day=S.pie.born+100;pieSpatDayAll(S.day)');
  assert.equal(ev('Object.keys(S.pie.spat).length'), 1, 'then they come');
  const q = load();
  sky(q.ev, { chaos: 'none' });
  q.ev('Math.random=()=>0;for(let d=0;d<400;d++){S.day++;pieSpatDayAll(S.day)}');
  assert.equal(q.ev('Object.keys(S.pie.spat).length'), 0, 'chaos none');
  // a sandbox (chaos none) neither
  const s = load();
  s.ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();ACT.pieFound();Math.random=()=>0;for(let d=0;d<400;d++){S.day++;pieSpatDayAll(S.day);pieIncDay(S.day)}");
  assert.equal(s.ev('Object.keys(S.pie.spat).length+S.inc.length'), 0, 'sandbox');
  assert.deepEqual(errors, []);
  assert.deepEqual(q.errors, []);
  assert.deepEqual(s.errors, []);
});

test('sanitize repairs broken spat state; old saves are unaffected', () => {
  const { ev, errors } = load();
  sky(ev);
  start(ev, 'band', 'NL');
  ev("S.pie.spat.air={st:'on',cc:'NL',cc2:'NL',until:S.day+5}");          // same country twice
  ev("S.pie.spat.kill={st:'weird',cc:'XX',until:S.day+5}");              // no such country
  ev("S.pie.spat.jam={st:'on',cc:'NL',cc2:'BE',until:1e12,ask:-4,c:7,hold:{NL:-1,ZZ:5}}");
  ev("S.pie.spat.home={st:'ask',cc:'DE',until:S.day+30,ask:S.day+20,evil:'<script>'}");
  ev("S.pie.spat.nope={st:'on'};S.pie.spat.grab=[1,2]");
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  const s = JSON.parse(ev('JSON.stringify(S.pie.spat)'));
  assert.deepEqual(Object.keys(s).sort(), ['band', 'home', 'jam']);
  assert.ok(s.jam.until <= ev('S.day') + 720 && s.jam.c === 1 && s.jam.ask >= 0, 'clamped');
  assert.deepEqual(s.jam.hold, { NL: 0 });
  assert.equal(s.home.evil, undefined);
  days(ev, 30);
  // an old save: no pie at all, and nothing new to answer
  ev("const o=JSON.parse(JSON.stringify(S));delete o.pieV;delete o.pie;S=migrate(o);for(let i=0;i<30;i++)dayTick()");
  assert.equal(ev('S.pie'), null);
  assert.deepEqual(errors, []);
});

test('answers and countries never name a person; countries come from the city table', () => {
  const { ev, errors } = load();
  // every country a spat can pick is on the map
  const ccs = JSON.parse(ev('JSON.stringify(Object.keys(pieCcAll()))'));
  assert.ok(ccs.includes('NL') && ccs.includes('BE'));
  assert.equal(ev("pieNb('NL')"), 'BE');
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// The optical engineering team: a department from Big League on, at least $1.2M a year, that takes the intern's optical
// orders over, moves hot leased waves up a size, plans routes from Lambda Bazaar demand (asking first, or building on
// its own within a budget), and now and then gets something wrong. A network in Western Europe with plenty of cash, no
// failures and no fat fingers (Change Freeze).
const BASE = "ACT.start({});S.cash=5e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=6;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "for(const c of ['ams','par','lon','mad'])ACT.buildPop({city:c});ACT.launchBB({city:'fra'});for(const c in S.pops)S.pops[c].rgen=3;S.ops.floor=0;compute()";
function game(t) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  return h;
}
const hire = (ev, size = 'm') => ev(`ACT.optxHire({size:'${size}'});closeModal()`);
// One day of the team only, and of the intern only, as dayTick runs them.
const teamDay = ev => ev('dayGo(optxRun(S.day),(g,v)=>g.next(v))');
const internDay = ev => ev('opsDay(S.day)');
// Leased dark fiber Frankfurt–Amsterdam, ready today with nothing lit yet.
const fiber = ev => ev("UI.pending={a:'fra',b:'ams'};UI.lmode='df';UI.dfSrc='lease';UI.dfSys='lite';ACT.orderDf();const l=S.links.at(-1);l.ready=S.day;closeModal();compute();l.id");
// A leased 100G wave Paris–Madrid.
const wave = ev => ev("UI.pending={a:'par',b:'mad'};UI.lmode='wave';ACT.buildLink({tier:1});closeModal();compute();S.links.at(-1).id");
// The first day from today on which the team's dice say "mistake".
const oopsDay = ev => ev('(()=>{const e=OPTX[S.optx.size].err;for(let d=S.day;d<S.day+5000;d++)if(optxR(d+"|e")<1/e)return d;return -1;})()');

test('the team opens at level 4, comes in three sizes of at least $1.2M a year, and its salary is a monthly cost', t => {
  const { ev, errors } = game(t);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(Object.keys(OPTX))')), ['s', 'm', 'l']);
  for (const k of ['s', 'm', 'l']) assert.ok(ev(`OPTX.${k}.mo`) * 12 >= 1.2e6, `${k} costs at least $1.2M a year`);
  assert.ok(ev('OPTX.s.proj<OPTX.m.proj&&OPTX.m.proj<OPTX.l.proj&&OPTX.s.err<OPTX.m.err&&OPTX.m.err<OPTX.l.err'), 'bigger teams run more projects and slip less');
  ev('S.lvl=3;S.done={}');
  assert.equal(ev('optxCanHire()'), false);
  hire(ev); assert.equal(ev('optxOn()'), false, 'locked below level 4');
  ev('S.lvl=6;for(const g of GOALS)S.done[g.id]=0');
  const c0 = ev('S.cash'); const x0 = ev('R.cost.extras');
  hire(ev, 's');
  assert.equal(ev('optxOn()'), true);
  assert.equal(c0 - ev('S.cash'), ev('OPTX.s.mo'), 'the first month up front');
  ev('compute()');
  assert.equal(ev('R.cost.extras') - x0, ev('OPTX.s.mo'), 'then a salary every month');
  ev("ACT.optxSize({size:'l'});compute()");
  assert.equal(ev('R.cost.extras') - x0, ev('OPTX.l.mo'), 'a bigger team, a bigger salary');
  assert.deepEqual(errors, []);
});

test('the optical orders move from the intern to the team, at the same price, and back when it is disbanded', t => {
  const A = game(t), B = game(t);
  for (const h of [A, B]) { h.ev("ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal()"); fiber(h.ev); h.ev('S.ops.on.optics=true'); }
  // A: the intern lights the new fiber. B: the team does, and the intern leaves it alone.
  const a0 = A.ev('S.cash'); internDay(A.ev); const a1 = A.ev('S.cash');
  hire(B.ev); assert.equal(B.ev("opsMine('optics')"), false); assert.equal(B.ev("opsTeam('optics')"), true);
  internDay(B.ev);
  assert.equal(B.ev("S.links.find(l=>l.kind==='df').ch.length"), 0, 'the intern no longer runs optics');
  const b0 = B.ev('S.cash'); teamDay(B.ev); const b1 = B.ev('S.cash');
  assert.ok(a0 - a1 > 0, 'lighting costs something');
  assert.equal(b0 - b1, a0 - a1, 'the team pays what the intern paid');
  assert.equal(B.ev("S.links.find(l=>l.kind==='df').ch.join()"), A.ev("S.links.find(l=>l.kind==='df').ch.join()"));
  assert.match(B.ev('optxLine(S.optx.log[0])'), /^The optical team /);
  // The sheets: the intern's no longer lists the order, the team's does, with the same controls.
  B.ev('ACT.opsOpen()');
  assert.ok(!B.ev("[...document.querySelectorAll('#modalCard [data-act=opsToggle]')].some(b=>b.dataset.args.includes('optics'))"), 'not in the intern sheet');
  B.ev('ACT.optxOpen()');
  assert.ok(B.ev("[...document.querySelectorAll('#modalCard [data-act=opsToggle]')].some(b=>b.dataset.args.includes('optics'))"), 'in the team sheet');
  B.ev("ACT.opsToggle({k:'optics'})");
  assert.equal(B.ev('S.ops.on.optics'), false, 'switched from the team sheet');
  assert.equal(B.ev("$('modal').className"), 'optx', 'and the team sheet stays open');
  // Disbanded: the intern has them again; the team-only wave order stays with nobody.
  B.ev('ACT.optxFire();ACT.optxFire()');
  assert.equal(B.ev('optxOn()'), false);
  assert.equal(B.ev("opsMine('optics')"), true);
  assert.equal(B.ev("opsMine('waveup')"), false);
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
});

test('a hot leased wave moves up a size, at the price of the click, but not where your own glass is coming', t => {
  const A = game(t), B = game(t);
  for (const h of [A, B]) { hire(h.ev); h.ev('S.ops.on.waveup=true'); }
  const ia = wave(A.ev), ib = wave(B.ev);
  A.ev(`R.load['${ia}']=95`);
  const a0 = A.ev('S.cash'); teamDay(A.ev);
  assert.equal(A.ev(`S.links.find(l=>l.id==='${ia}').tier`), 2, '100G → 400G');
  const b0 = B.ev('S.cash'); B.ev(`ACT.upLink({id:'${ib}',tier:2})`);
  assert.equal(a0 - A.ev('S.cash'), b0 - B.ev('S.cash'), 'what upLink costs');
  assert.match(A.ev('optxLine(S.optx.log[0])'), /moved a leased wave up a size on Paris–Madrid/);
  // Quiet waves stay; and with dark fiber of your own being built on the route, a hot one waits for it.
  teamDay(A.ev); assert.equal(A.ev(`S.links.find(l=>l.id==='${ia}').tier`), 2);
  B.ev(`UI.pending={a:'par',b:'mad'};UI.lmode='df';UI.dfSrc='build';ACT.orderDf();closeModal();R.load['${ib}']=380`);
  teamDay(B.ev);
  assert.equal(B.ev(`S.links.find(l=>l.id==='${ib}').tier`), 2, 'own fiber on the way: no bigger wave');
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
});

test('asking first: routes that pay back in time are proposed on Wednesday, and one tap builds one at the quoted price', t => {
  const { ev, errors } = game(t);
  hire(ev, 's');
  ev('S.day+=(9-S.day%7)%7');
  assert.equal(ev('S.day%7'), 2);
  teamDay(ev);
  const props = JSON.parse(ev('JSON.stringify(S.optx.prop)'));
  assert.ok(props.length > 0 && props.length <= 3, 'up to three proposals');
  for (const p of props) assert.ok(p.pb <= 36 && p.mo > 0 && p.cost > 0 && !p.sub, `${p.k} pays back in ${p.pb} months`);
  assert.ok(props.every((p, i) => !i || props[i - 1].pb <= p.pb), 'quickest payback first');
  assert.ok(ev('S.links.every(l=>l.kind!=="df")'), 'nothing built without a yes');
  const q = JSON.parse(ev('JSON.stringify(optxQuote(S.optx.prop[0].a,S.optx.prop[0].b))'));
  const c0 = ev('S.cash'); ev('ACT.optxBuild({i:0})');
  const l = JSON.parse(ev("JSON.stringify(S.links.find(l=>l.kind==='df'))"));
  assert.deepEqual([[l.a, l.b].sort().join('|'), l.own], [q.k, true], 'their route, your own dug fiber');
  assert.equal(c0 - ev('S.cash'), q.cost, 'at the price they quoted');
  assert.equal(ev('S.optx.spent'), q.cost, 'counted against this year');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.optx.jobs)')), [l.id]);
  // A small team runs one project at a time.
  assert.equal(ev('optxBusy()'), true);
  const n = ev('S.links.length'); ev('ACT.optxBuild({i:0})');
  assert.equal(ev('S.links.length'), n, 'busy: no second build');
  ev('ACT.optxOpen()');
  assert.match(ev("$('modalCard').textContent"), /as many routes as it can run at once/);
  // Once it is lit the slot is free again.
  ev(`S.links.find(x=>x.id==='${l.id}').ready=S.day`);
  assert.equal(ev('optxBusy()'), false);
  assert.deepEqual(errors, []);
});

test('on their own: they build within the year\'s budget and the cash floor, as many as the team runs at once', t => {
  const { ev, errors } = game(t);
  hire(ev, 'm');
  ev("ACT.optxMode({v:'auto'});S.optx.bud=1e6;S.day+=(9-S.day%7)%7");
  const plan = JSON.parse(ev('JSON.stringify(optxPlan())'));
  assert.ok(plan.length >= 3, 'enough routes worth building');
  teamDay(ev);
  const built = ev('S.optx.jobs.length');
  assert.equal(built, Math.min(2, built), 'two at a time for a medium team');
  assert.ok(built >= 1);
  assert.ok(ev('S.optx.spent') <= 1e6, 'within a $1M year');
  assert.match(ev('optxLine(S.optx.log[0])'), /broke ground on/);
  // A new year starts a fresh budget; a floor above the cash stops them.
  const n = ev('S.links.length');
  ev('S.optx.jobs=[];S.ops.floor=5e6;S.cash=5e6;S.day+=7');
  teamDay(ev);
  assert.equal(ev('S.links.length'), n, 'never below the cash floor');
  assert.deepEqual(errors, []);
});

test('mistakes: rare, from the day\'s dice, and only things a save recovers from', t => {
  const { ev, errors } = game(t);
  hire(ev, 's');
  // Only lit fiber: a fat-fingered config darkens it until tomorrow (it has another way around: a wave beside it).
  const id = fiber(ev); ev(`ACT.addCh({id:'${id}',o:Object.keys(OPT).find(o=>!chWhy(S.links.find(l=>l.id==='${id}'),o))})`);
  ev("UI.pending={a:'fra',b:'ams'};UI.lmode='wave';ACT.buildLink({tier:1});closeModal();compute()");
  const d = oopsDay(ev);
  assert.ok(d >= 0);
  ev(`S.day=${d}`);
  const m = JSON.parse(ev(`JSON.stringify(optxOops(${d}))`));
  assert.equal(m.k, 'dark');
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').eqDown`), d + 1, 'dark until tomorrow');
  assert.match(ev(`optxMissLine(${JSON.stringify(m)})`), /fat-fingered a config: Frankfurt–Amsterdam is dark until tomorrow/);
  // Only a build under way: it slips or costs more.
  ev(`S.links=S.links.filter(l=>l.kind!=='df'&&l.kind!=='wave');UI.pending={a:'par',b:'mad'};UI.lmode='df';UI.dfSrc='build';ACT.orderDf();closeModal();S.optx.jobs=[S.links.at(-1).id]`);
  const r0 = ev('S.links.at(-1).ready'), c0 = ev('S.cash');
  const m2 = JSON.parse(ev(`JSON.stringify(optxOops(${d}))`));
  assert.ok(['slip', 'over'].includes(m2.k));
  if (m2.k === 'slip') assert.equal(ev('S.links.at(-1).ready'), r0 + m2.n, `slips ${m2.n} days`);
  else assert.equal(c0 - ev('S.cash'), m2.c, `costs ${m2.c} more`);
  // A day the dice say no: nothing happens.
  ev('S.links.at(-1).ready=S.day+400');
  let quiet = d + 1; while (ev(`optxR(${quiet}+"|e")<1/OPTX.s.err`)) quiet++;
  assert.equal(ev(`optxOops(${quiet})`), null);
  assert.deepEqual(errors, []);
});

test('saves: an old save has no team, a team survives a reload, and junk is repaired', t => {
  const { ev, errors } = game(t);
  const s = JSON.parse(ev('JSON.stringify(S)')); delete s.optx;
  ev(`S=${JSON.stringify(s)};sanitize(S)`);
  assert.equal(ev('optxOn()'), false);
  assert.equal(ev('S.optx.mode'), 'ask');
  hire(ev, 'l'); ev("ACT.optxMode({v:'auto'});ACT.optxBud({v:'2'});ACT.optxPay({v:'2'})");
  const keep = ev('JSON.stringify(S.optx)');
  ev('S=JSON.parse(JSON.stringify(S));sanitize(S)');
  assert.equal(ev('JSON.stringify(S.optx)'), keep, 'the same team after a reload');
  ev("S.optx={size:'xl',mode:'yolo',bud:-5,pay:7,jobs:['nope',3],prop:[{a:'zz',b:'fra'},{a:'ams',b:'fra',cost:'lots'}],log:[{d:1,r:[['hack',1,['<b>']]],m:{k:'boom',w:'x'}},'junk']};sanitize(S)");
  const o = JSON.parse(ev('JSON.stringify(S.optx)'));
  assert.deepEqual([o.size, o.mode, o.bud, o.pay, o.jobs, o.log], [null, 'ask', 5e6, 36, [], []]);
  assert.deepEqual(o.prop.map(p => [p.k, p.cost]), [['ams|fra', 0]]);
  assert.deepEqual(errors, []);
});

test('on a 360 px phone the card and the sheet work: hire, proposals with one-tap build', t => {
  const { ev, errors, dom } = game(t);
  dom.window.innerWidth = 360;
  ev("UI.left='noc';renderLeft()");
  assert.ok(ev("!!document.querySelector('[data-act=optxOpen]')"), 'a card in the NOC tab');
  ev('ACT.optxOpen()');
  assert.equal(ev("document.querySelectorAll('#modalCard [data-act=optxHire]').length"), 3, 'three teams to hire');
  hire(ev, 's'); ev('S.day+=(9-S.day%7)%7'); teamDay(ev); ev('ACT.optxOpen()');
  assert.ok(ev("document.querySelectorAll('#modalCard [data-act=optxBuild]').length") > 0, 'proposals with a Build button');
  assert.ok(ev("document.querySelectorAll('#modalCard [data-act=optxMode]').length") === 2);
  assert.deepEqual(errors, []);
});

// #424: the team counted every managed wave the Bazaar's buyers want on a route, also 1.6T waves your own cable can never
// carry across a long ocean, so a $100M Hong Kong–New York cable looked like it paid back in months.
test('#424 a route is worth only the waves its glass can carry: no 1.6T across a long ocean', t => {
  const { ev, errors } = game(t);
  ev("S.lvl=12;for(const c of ['hkg','nyc'])ACT.buildPop({city:c});compute()");
  const g = (a, b) => ev(`(()=>{const sub=isSub('${a}','${b}');return cmBuildG(sub?seaQuote('${a}','${b}','standard').km:kmBetween('${a}','${b}'),sub,sub?optxUps(seaQuote('${a}','${b}','standard').km):null)})()`);
  assert.ok(g('hkg', 'nyc') < 1600, `16,000 km of your own cable: no 1.6T (${g('hkg', 'nyc')}G at most)`);
  assert.ok(g('lon', 'nyc') >= 1600, 'London–New York is short enough for 1.6T');
  assert.ok(g('fra', 'ams') >= 1600, 'on land, ROADM glass carries the biggest waves');
  // What the team counts is what can be sold: less than every product buyers want, by the waves left out.
  const r = "cmRoute('hkg','nyc')", all = ev(`CM_P.reduce((s,p)=>s+cmDem(${r},p,S.day)*cmList(${r},p),0)`);
  const gm = g('hkg', 'nyc'), can = ev(`cmBuildVal(${r},${gm})`);
  const out = ev(`CM_P.filter(p=>CM_G[p]>${gm}).reduce((s,p)=>s+cmDem(${r},p,S.day)*cmList(${r},p),0)`);
  assert.ok(ev(`cmDem(${r},'w1600',S.day)*cmList(${r},'w1600')`) > 0, 'buyers do want 1.6T there');
  assert.ok(out > 0 && Math.abs(all - out - can) < 1e-6 * all, 'the waves too big for the cable are left out, and nothing else');
  const q = JSON.parse(ev("JSON.stringify(optxQuote('hkg','nyc'))") || 'null');
  if (q) assert.ok(q.mo <= Math.round(can * ev('mkt()*cmCut()')), 'the quote counts only what the cable can sell');
  // And the Bazaar's "To build" list ranks routes by the same rule.
  assert.equal(ev("typeof cmScout(6)"), 'object');
  assert.deepEqual(errors, []);
});

// The Hyperscaler's forecasts and plan (60-features/38-hyper-forecast.js, 93-ui/58-hyper-plan.js): a region fills on
// the day its forecast said (within 10%), a fix that takes longer than the time left is marked "order now", the card's
// next step takes the most urgent forecast when nothing is on fire, the calendar lists the known dates in order, the
// NOC's plan and calendar and the Cloud tab's lines render at 360 px and at desktop width, the forecasts cost little
// and are worked out once, and the load history survives saves with junk repaired.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
const J = (ev, x) => JSON.parse(ev(`JSON.stringify((${x})??null)`));
/* Frankfurt (home, a Server Barn) and Paris (a Rack Shack, 400 Gbps) with fat waves between them and big ports; French
   users fill Paris within weeks, German users have room in Frankfurt. Nothing on fire. */
function net(t, seed) {
  const h = load({ seed: seed || 11 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=3;S.nextFail=S.nextEvent=1e9;for(const c of ['par','ams','lon','mad'])ACT.buildPop({city:c});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par'])for(const n of ['cog','lvl'])ACT.buyTransit({city:c,net:n,tier:4});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.par={t:0,ready:0,mw:5};S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:250,since:0};S.links=[];" +
    wave('fp', 'fra', 'par', 4) + wave('fp2', 'fra', 'par', 4) + wave('pa', 'par', 'ams', 3) + wave('pl', 'ams', 'lon', 3) + wave('pm', 'par', 'mad', 3) +
    "compute();hsDay(S.day);for(let i=0;i<4;i++)dayTick();S.log=[];UI.left='goals';UI.leftOpen=true;UI.sel=null;renderAll()");
  return h;
}
const sizes = [[360, 740, 'portrait'], [740, 360, 'landscape'], [1280, 800, 'desktop']];
const rows2 = (ev, sel) => ev(`[...document.querySelectorAll('${sel} .btns')].every(b=>b.querySelectorAll('button').length<=2)`);

test('a region fills on the day its forecast said, within 10%', (t) => {
  const h = load({ seed: 21 }), { ev } = h;
  t.after(() => h.dom.window.close());
  // The home Rack Shack (400 Gbps) and German users growing into it; ports out far bigger, so the region is what fills.
  ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=3;S.nextFail=S.nextEvent=1e9;for(const c in S.pops)S.pops[c].rgen=RG_TOP;" +
    "ACT.buyTransit({city:'fra',net:'cog',tier:4});ACT.buyTransit({city:'fra',net:'lvl',tier:4});S.hs.cc.DE={d:120,since:0};compute();for(let i=0;i<4;i++)dayTick()");
  const f = J(ev, 'hp().F.rg.fra'), d0 = ev('S.day');
  assert.ok(f.d > 10 && f.d < 120, `a forecast within reach (${f.d} days)`);
  assert.ok(f.rate > 0, 'it grows');
  assert.equal(J(ev, 'S.hs.lh.fra').length, 4, 'four days of history');
  assert.ok(f.hd !== null, 'the history makes a second guess');
  let full = null;
  for (let i = 0; i < 200 && full === null; i++) {
    ev('dayTick()');
    if (ev('R.hs.short>0.5||R.hs.rg.fra.load>=R.hs.rg.fra.g-0.5')) full = ev('S.day') - d0;
  }
  assert.ok(full !== null, 'it filled');
  assert.ok(Math.abs(full - f.d) <= Math.ceil(f.d * 0.1), `full on day ${full}, forecast ${f.d}`);
  assert.ok(J(ev, 'S.hs.lh.fra').length <= 14, 'history keeps two weeks');
});

test('the plan: soonest first, red "order now" when the fix takes longer than the time left', (t) => {
  const { ev } = net(t);
  const P = J(ev, 'hp().P');
  assert.ok(P.length > 0);
  assert.deepEqual(P.map((x) => x.d), P.map((x) => x.d).sort((a, b) => a - b), 'soonest first');
  const par = P.find((x) => x.k === 'rg' && x.c === 'par');
  assert.ok(par, 'Paris fills');
  assert.equal(par.fix, 'up');
  assert.equal(par.lead, 60, 'a Server Barn takes 60 days');
  assert.ok(par.d < 60 && par.red, `full in ${par.d} days, the barn takes 60: order now`);
  for (const x of P) assert.equal(x.red, x.lead === null || x.lead >= x.d, `red exactly when the fix is late (${x.k} ${x.c})`);
  // Not enough megawatts for the next tier: the fix is the utility first, and its lead adds up.
  ev("hsPwMk('par').cap=hsTown('par')+6;HP.k=''");
  const p2 = J(ev, "hp().P.find(x=>x.k==='rg'&&x.c==='par')");
  assert.equal(p2.fix, 'pw');
  assert.equal(p2.lead, 180 + 60);
  ev("hsPwMk('par').cap=hsGrid('par');HP.k=''");
  // A fix far enough ahead is in time; a front door whose ports fill in weeks gets a bigger port the same day.
  ev("S.transit=S.transit.filter(x=>x.city!=='fra');ACT.buyTransit({city:'fra',net:'cog',tier:3});compute()");
  const door = J(ev, "hp().P.find(x=>x.k==='door'&&x.c==='fra')");
  assert.ok(door && door.d > 1 && door.d <= 365, 'the smaller port fills within the year');
  assert.equal(door.fix, 'port');
  assert.equal(door.red, false, 'a port is ready the same day: in time');
  // The NOC row says so.
  ev("$('dash').hidden=false;UI.dtab='cloud';renderDash()");
  const row = ev("[...document.querySelectorAll('#hpPlan .hprow')].find(r=>/Paris region/.test(r.textContent)).outerHTML");
  assert.match(row, /hprow red/);
  assert.match(row, /Order now/);
  assert.match(row, /Takes: 60 days/);
  assert.match(row, /data-act="hsRegion"/);
  // Buying the barn moves the plan on the same day: the upgrade is coming.
  ev("ACT.hsRegion({city:'par'})");
  const p3 = J(ev, "hp().P.find(x=>x.k==='rg'&&x.c==='par')");
  assert.equal(p3.fix, 'coming');
});

test("the card's next step takes the most urgent forecast when nothing is on fire", (t) => {
  const { ev, dom, errors } = net(t);
  const doc = dom.window.document;
  assert.equal(ev('R.hs.short>0.5||hsDoorsFull().length>0'), false, 'nothing on fire');
  const nx = doc.querySelector('#leftBody .hsc .hsc-nx');
  assert.ok(nx);
  // A Barn takes longer than Paris has left, and the level allows another region: a leased cage nearby comes first.
  assert.match(nx.textContent, /Paris is full in ~\d+ days and a Barn is far off: lease a cage at .+ in (London|Amsterdam|Madrid), live in 14 days\. Start now\./);
  assert.ok(doc.querySelector('#leftBody .hsc [data-act="hsColo"]'), 'with the button that leases it');
  // Without room for another region (level 1 runs two), the Barn is the fix.
  ev("S.lvl=1;HP.k='';renderAll()");
  assert.match(doc.querySelector('#leftBody .hsc .hsc-nx').textContent, /Paris is full in ~\d+ days; a Server Barn takes 60 days\. Start now\./);
  assert.ok(doc.querySelector('#leftBody .hsc [data-act="hsRegion"]'), 'with the button that fixes it');
  // Once the barn is ordered and arrives in time, the card goes back to its usual advice.
  ev("S.hs.rg.par.up={t:1,ready:S.day+2};HP.k='';renderAll()");
  assert.doesNotMatch(doc.querySelector('#leftBody .hsc .hsc-nx').textContent, /Paris is full/);
  // On fire beats forecasts: users with no room take the next step.
  ev("delete S.hs.rg.par.up;S.hs.cc.FR.d=900;compute();renderAll()");
  assert.match(doc.querySelector('#leftBody .hsc .hsc-nx').textContent, /no room|get nothing|full/i);
  assert.deepEqual(errors, []);
});

test('the calendar lists the known dates in order, in the plan and the next two on the card', (t) => {
  const { ev, dom, errors } = net(t);
  const doc = dom.window.document;
  ev("const d=S.day;S.hs.pw.fra.q={mw:100,ready:d+100,late:0};S.hs.rg.par.up={t:1,ready:d+60};S.hs.law.cc.PL={a:d,f:d+150,m:0};" +
    "S.hs.jobs.push({id:'job0',n:'Overfit and Sons',a:'fra',b:'par',g:800,tb:1e5,done:0,due:d+40,fee:1e6,start:d});S.hs.prot.par={until:d+20,kind:'delay',g:1,on:'rg'};" +
    "S.hs.dx={c:'par',b:'fra',d:d+1};S.hs.law.mor.ams={a:d,f:d+30,u:d+200,m:0};HP.k='';compute()");
  const C = J(ev, 'hp().C'), d = ev('S.day');
  const want = [[1, 'drill'], [20, 'prot'], [30, 'mor'], [40, 'run'], [60, 'up'], [100, 'util'], [150, 'law'], [200, 'morend']];
  for (const [n, k] of want) assert.ok(C.some((e) => e.d === d + n && e.k === k), `${k} on day +${n}`);
  assert.deepEqual(C.map((e) => e.d), C.map((e) => e.d).sort((a, b) => a - b), 'in order');
  assert.ok(C.every((e) => e.d >= d), 'nothing past');
  ev("$('dash').hidden=false;UI.dtab='cloud';renderDash()");
  const cal = doc.getElementById('hpCal').textContent;
  assert.match(cal, /Drill verdict: Paris drained into Frankfurt[\s\S]*go home from Paris[\s\S]*Moratorium on new grid connections starts in Amsterdam[\s\S]*AI run due: Overfit and Sons[\s\S]*takes over in Paris[\s\S]*answers about 100 MW in Frankfurt[\s\S]*Data law in force in Poland/);
  ev("$('dash').hidden=true;UI.fold={hsmore:1};UI._lh=null;renderAll()");
  const more = doc.querySelector('#leftBody .hsc-more');
  assert.ok(more, 'details open');
  const lines = [...more.querySelectorAll('.meta')].filter((m) => m.textContent.startsWith('📅'));
  assert.equal(lines.length, 2, 'the next two dates');
  assert.match(lines[0].textContent, /Drill verdict/);
  assert.match(lines[1].textContent, /go home from Paris/);
  assert.deepEqual(errors, []);
});

test('plan, calendar and forecast lines render at 360 px and desktop, two buttons a row at most', (t) => {
  const { ev, dom, errors } = net(t);
  const doc = dom.window.document;
  ev("S.hs.pw.fra.q={mw:100,ready:S.day+100,late:0};S.hs.lag['par>fra']=30;HP.k='';compute()");
  for (const [w, h, name] of sizes) {
    ev(`innerWidth=${w};innerHeight=${h};$('dash').hidden=false;UI.dtab='cloud';UI._dh=null;renderDash()`);
    const card = doc.getElementById('dashCard');
    assert.match(card.textContent, /Plan: what runs out first[\s\S]*Calendar[\s\S]*Countries[\s\S]*Regions[\s\S]*Region pairs/, name);
    assert.ok(card.querySelectorAll('#hpPlan .hprow').length > 0, `plan rows (${name})`);
    assert.equal(rows2(ev, '#dashCard'), true, `rows of two at most (${name})`);
    const acts = J(ev, "[...new Set([...document.querySelectorAll('#dashCard [data-act]')].map(e=>e.dataset.act))]"), lists = J(ev, '[...NOC_LOCAL,...NOC_GO]');
    assert.deepEqual(acts.filter((x) => !lists.includes(x)), [], 'every button on the NOC window\'s lists');
    ev("$('dash').hidden=true;ACT.focusCity({city:'par'});UI.tab='cust';ACT.panelFold({k:'s:hsdoor',o:1});ACT.panelFold({k:'s:hsrg',o:1});renderPanel()");
    const panel = doc.getElementById('panel').textContent;
    assert.match(panel, /Full in ~\d+ days at this growth/, `the region's full-in line (${name})`);
    assert.match(panel, /MW free; a Server Barn needs \d+ more/, `grid headroom (${name})`);
    assert.match(panel, /Ports out/, `the front door's line (${name})`);
    assert.equal(rows2(ev, '#panel'), true);
    ev(`UI.fold={};UI._lh=null;renderAll()`);
    assert.equal(rows2(ev, '#leftBody'), true);
  }
  // A country held by the law says why its growth is capped.
  ev("S.hs.cc.IN={d:50,since:0};compute();HP.k='';ACT.focusCity({city:'par'});renderPanel()");
  assert.ok(J(ev, 'hp().F.cc.IN').includes('law'));
  assert.deepEqual(errors, []);
});

test('worked out once, and cheap: a big cloud costs a few milliseconds a day', (t) => {
  const { ev } = net(t);
  // Sixty countries and more regions.
  ev("for(const c of ['ams','lon','mad']){S.hs.rg[c]={t:1,ready:0,mw:20};hsPwMk(c);}for(const cc of ccAll().filter(k=>!hsWhy(k)).slice(0,60))if(!S.hs.cc[cc])S.hs.cc[cc]={d:30,since:0};compute();for(let i=0;i<14;i++)dayTick()");
  const a = ev('(()=>{const h=hp();return h.F;})()'), same = ev('(()=>{const F=hp().F;renderAll();return hp().F===F;})()');
  assert.ok(a);
  assert.equal(same, true, 'kept between renders on the same day');
  ev('dayTick()');
  assert.equal(ev('(()=>{const F=HP.F;return hp().F!==F;})()'), true, 'worked out again the next day');
  const ms = ev("(()=>{const t0=performance.now();for(let i=0;i<20;i++){HP.k='';hp();}return (performance.now()-t0)/20;})()");
  t.diagnostic(`forecasts, plan and calendar: ${ms.toFixed(2)} ms a day`);
  assert.ok(ms < 25, `${ms.toFixed(2)} ms a day`);
  assert.ok(ev('Object.keys(hp().F.cc).length+Object.keys(hp().F.rg).length') > 0);
});

test('saves: the load history repaired, absent in old saves and classic games', (t) => {
  const { ev } = net(t);
  const s = J(ev, 'S');
  assert.ok(Array.isArray(s.hs.lh.fra) && s.hs.lh.fra.length >= 4);
  const junk = { ...s, hs: { ...s.hs, lh: { fra: ['x', -5, 1e99, 12, ...Array(20).fill(3)], par: 'nope', zzz: [1, 2], lon: [4] } } };
  const m = J(ev, `migrate(${JSON.stringify(junk)}).hs.lh`);
  assert.equal(m.fra.length, 14);
  assert.ok(m.fra.every((v) => Number.isFinite(v) && v >= 0 && v <= 1e7));
  assert.equal(m.par, undefined);
  assert.equal(m.zzz, undefined, 'only regions the save has');
  assert.equal(m.lon, undefined);
  const old = { ...s, hs: { ...s.hs } };
  delete old.hs.lh;
  assert.deepEqual(J(ev, `migrate(${JSON.stringify(old)}).hs.lh`), {});
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s).hs.lh;})()`);
  assert.deepEqual(back, s.hs.lh);
  assert.equal(ev(`migrate(${JSON.stringify({ ...s, charter: 'global' })}).hs`), undefined, 'no S.hs outside the charter');
  ev(`S=migrate(${JSON.stringify(junk)});compute();for(let i=0;i<3;i++)dayTick()`);
  assert.ok(ev('S.hs.lh.fra.length') <= 14);
});

test('in Autarky the Hyperscaler plans glass, not waves, and the intern never tries to lease one', () => {
  const { ev, errors } = load();
  ev("beginGame('Autarky Cloud','fra',{mode:'normal',preset:'oncall',rules:{mods:['autarky']}});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'})");
  assert.equal(ev("modeOn('autarky')&&hyper()"), true);
  assert.equal(ev("opsCtl('hswave')"), false, 'the wave order is off: there are no waves to lease');
  // A pair's wave fix now takes a dig's time and says so.
  ev("S.hs.rg.par={t:1,ready:0,mw:20};S.pops.par=S.pops.par||JSON.parse(JSON.stringify(S.pops.fra));S.hs.rep={fra:'par',par:'fra'}");
  const x = { fix: 'wave', c: 'fra', b: 'par' };
  assert.match(ev(`hpFixBtn(${JSON.stringify(x)},'sm')`), /Dig fiber/);
  assert.ok(ev("dfBuildDays(kmBetween('fra','par'))") > 1);
  assert.deepEqual(errors, []);
});

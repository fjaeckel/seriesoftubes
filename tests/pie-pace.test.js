// Pie in the Sky, the early game: the Launch tab's pace forecast and pad nudge (piePace, piePadTip), patchy-sky customers
// who pay before a crust carries anything (60-features/99-pie-patchy.js), and the Dishes tab's hint to wait.
// Seeded; state is set directly where luck would decide.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A sandbox rocket company (with real lead times, as on On-call) with a factory and a pad in Lisbon (39°N), 20 pies on the shelf.
const company = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;S.rules.lead='real'");
  ev("for(const c of ['fra','sin','lis'])if(!S.pops[c])ACT.buildPop({city:c});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'lis'});S.pie.stock=20;compute()");
};
const cover = (ev, cov, id = 'short') => ev(`S.pie.crusts.${id}.cohorts=[{n:Math.ceil(CRUSTS.${id}.full*${cov}),day:S.day,las:false}];compute()`);
const dish = (ev, c) => ev(`ACT.pieDish({city:'${c}'});S.pie.lic[CITY['${c}'].cc]={state:'ok',until:1e6};compute()`);
const doc = (dom) => dom.window.document;

test('the Launch tab says when a crust is full at this pace, and nudges for a pad near the equator when it is slow', () => {
  const { ev, dom, errors } = load();
  company(ev);
  assert.equal(ev("S.pie.pads.length"), 1);
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'})");
  // One pad, a Falcon every 14 days: 20/14 pies a day, slower than the factory's 4, so the pad sets the pace.
  const f = JSON.parse(ev("JSON.stringify(piePace('short'))"));
  assert.equal(f.rk, 'falcon');
  assert.equal(f.pad, true);
  assert.equal(f.mo, 43);
  assert.equal(f.days, Math.ceil(1584 / (20 / 14)), 'the whole crust at one launch per gap');
  ev("ACT.pieTab({t:'crust'})");
  const html = () => doc(dom).getElementById('modal').innerHTML;
  assert.match(html(), /At this pace \(43 pies a month\), this crust is full in about 3 years\./);
  // The nudge names the coastal POP nearest the equator (Singapore, 1°N) and builds a pad there in one tap.
  assert.equal(ev("piePadTip('short')"), 'sin');
  assert.match(html(), /Your coastal POP nearest the equator is Singapore, where a launch costs 15% less\./);
  const b = doc(dom).querySelector('#modal .pie-nudge + .btns [data-act=piePad]');
  assert.ok(b && !b.disabled, 'a pad button under the nudge');
  assert.equal(JSON.parse(b.dataset.args).city, 'sin');
  assert.equal(doc(dom).querySelectorAll('#modal .pie-nudge').length, 1, 'one nudge, not one per crust');
  // Only started crusts get a forecast: Shortcrust is the only one with pies on the way.
  assert.equal(doc(dom).querySelectorAll('#modal .pie-pace').length, 1);
  b.click();
  assert.equal(ev("S.pie.pads.length"), 2);
  // Two pads: twice the pace, under two years, no nudge.
  const g = JSON.parse(ev("JSON.stringify(piePace('short'))"));
  assert.equal(g.days, Math.ceil(1584 / (40 / 14)));
  assert.match(html(), /full in about 19 months\./);
  assert.equal(doc(dom).querySelectorAll('#modal .pie-nudge').length, 0);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('the pace counts the factory: pads that outrun it fly from the shelf, then at its pace, and get no nudge', () => {
  const { ev, errors } = load();
  company(ev);
  ev("ACT.pieRd({k:'reuse'});ACT.piePad({city:'sin'});ACT.buildPop({city:'mia'});ACT.piePad({city:'mia'});S.pie.stock=200;ACT.pieLaunch({rk:'again',cr:'short'})");
  const f = JSON.parse(ev("JSON.stringify(piePace('short'))"));
  // Three reusable pads lift 6 a day, the factory bakes 4: 180 pies on the shelf and 20 queued last 100 days at 6 a day.
  assert.equal(f.rk, 'again');
  assert.equal(f.pad, false, 'the factory sets the pace');
  assert.equal(f.mo, 120);
  assert.equal(f.days, Math.ceil(100 + (1584 - 600) / 4));
  // Nothing to forecast without a factory, or once the crust is full.
  cover(ev, 1);
  ev("ACT.pieTab({t:'crust'})");
  assert.equal(ev("document.querySelectorAll('#modal .pie-pace').length"), 0);
  ev("S.pie.fac=false");
  assert.equal(ev("piePace('short')"), null);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('patchy-sky customers pay a little from 10% coverage and hand over to regular orbit customers from 40% to 60%', () => {
  const { ev, errors } = load();
  company(ev);
  const mo = (cov) => { cover(ev, cov); return ev('R.pie.patchy.mo'); };
  assert.equal(mo(0.25), 0, 'nothing without a working dish');
  dish(ev, 'sin');
  const at = [0.05, 0.1, 0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.8].map((c) => [c, mo(c)]);
  const v = Object.fromEntries(at);
  assert.equal(v[0.05], 0);
  assert.ok(v[0.1] < 0.1e6, 'from 10%');
  assert.ok(Math.abs(v[0.4] - 30e6) < 0.2e6, `the most it pays is tens of $M a month (${v[0.4]})`);
  for (let i = 1; i < at.length; i++) {
    const [c, x] = at[i], p = at[i - 1][1];
    if (c <= 0.4) assert.ok(x >= p, `grows up to 40% (${c}: ${x} < ${p})`);
    else assert.ok(x <= p, `shrinks from 40% (${c}: ${x} > ${p})`);
  }
  assert.equal(v[0.6], 0, 'gone once the crust is baked');
  assert.equal(v[0.8], 0);
  // No double counting: what is left of it plus the share the crust carries is the whole sky, never more.
  cover(ev, 0.5);
  assert.ok(Math.abs(ev("piePatchyShare('short')+pieCarry('short')") - 1) < 1e-9);
  // It is orbit income: in R.pie.rev, the month's revenue and the books, and never a flow, so routing is unchanged.
  cover(ev, 0.3);
  const r = JSON.parse(ev("JSON.stringify({rev:R.pie.rev,p:R.pie.patchy.mo,flows:R.pie.flows.length,cr:R.pie.patchy.cr})"));
  assert.ok(r.p > 15e6 && r.p < 25e6, `${r.p}`);
  assert.equal(r.rev, r.p, 'no other orbit customers yet');
  assert.equal(r.flows, 0);
  assert.deepEqual(Object.keys(r.cr), ['short']);
  assert.ok(ev('R.revMo') >= r.p);
  const e0 = ev('S.pie.book.earned');
  ev('dayTick()');
  assert.ok(Math.abs(ev('S.pie.book.earned') - e0 - r.p / 30) < r.p / 300, 'booked day by day');
  // Safe mode, a crust down for a storm: nothing.
  ev("S.pie.safe=true;compute()");
  assert.equal(ev('R.pie.patchy.mo'), 0);
  ev("S.pie.safe=false;S.pie.crusts.short.down=S.day+5;compute()");
  assert.equal(ev('R.pie.patchy.mo'), 0);
  ev("S.pie.crusts.short.down=0;compute()");
  assert.ok(ev('R.pie.patchy.mo') > 0);
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('the overview shows patchy-sky customers with their names, and a game without a rocket company has none', () => {
  const { ev, dom, errors } = load();
  company(ev);
  dish(ev, 'sin');
  cover(ev, 0.3);
  ev("ACT.pieTab({t:'home'})");
  const row = doc(dom).querySelector('#modal .pft-patchy');
  assert.ok(row, 'a patchy-sky row');
  assert.match(row.textContent, /Patchy-sky customers/);
  assert.match(row.textContent, /Store and Forward Thinking/);
  assert.match(row.textContent, /\$20(\.\d)?M\/mo/);
  // Phones: the row is a plain block in the sheet, nothing wider than the screen.
  assert.ok(!/width:\s*\d{3,}px/.test(row.outerHTML));
  ev('closeModal()');
  // Without pies: no orbit at all.
  const g = load();
  g.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();ACT.launchBB({city:'fra'});compute()");
  assert.equal(g.ev('R.pie'), undefined);
  assert.deepEqual(errors, []);
  assert.deepEqual(g.errors, []);
});

test('the Dishes tab says dishes earn nothing while the sky is nearly empty, and still lets you build', () => {
  const { ev, dom, errors } = load();
  company(ev);
  cover(ev, 0.12);
  ev("ACT.pieCc({cc:'SG'});ACT.pieTab({t:'dish'})");
  const hint = () => doc(dom).querySelector('#modal .pie-wait');
  assert.ok(hint(), 'the hint');
  assert.match(hint().textContent, /Dishes earn nothing until a crust is 40% covered, and your fullest is at 12%\./);
  assert.match(hint().textContent, /\$300k a month/);
  const b = doc(dom).querySelector('#modal [data-act=pieDish]');
  assert.ok(b && !b.disabled, 'building is not blocked');
  cover(ev, 0.35);
  ev("ACT.pieTab({t:'dish'})");
  assert.equal(hint(), null, 'gone from 30%');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

// The playtest: one pad, dishes in every city on day one, launches as fast as the pad allows. Year one now shows a
// small orbit income before the crust carries anything: tens of $M a month at most, never hundreds.
test('a hasty player sees a small orbit income in the first year', { timeout: 120000 }, () => {
  const { ev, errors } = load();
  company(ev);
  ev("S.pie.stock=40;for(const c of Object.keys(S.pops))dish(c);function dish(c){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}compute()");
  ev("window.__m=[];for(let d=0;d<360;d++){if(pieQuote('falcon','short').ok)ACT.pieLaunch({rk:'falcon',cr:'short'});S.nextFail=1e9;S.nextEvent=1e9;dayTick();if(d%30===29){compute();__m.push([pieCov('short'),R.pie.patchy.mo,R.pie.rev]);}}");
  const m = JSON.parse(ev('JSON.stringify(__m)'));
  const top = Math.max(...m.map((x) => x[1]));
  assert.ok(m[m.length - 1][0] < 0.4, `still under 40% after a year on one pad (${m[m.length - 1][0]})`);
  assert.ok(top >= 5e6, `visible: ${top}`);
  assert.ok(top <= 50e6, `small: ${top}`);
  assert.ok(m.every((x) => x[2] === x[1]), 'all of it from patchy-sky customers');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('a crust that starts carrying traffic gets a grand opening: a call a day for 30 days, then the usual pace', () => {
  const { ev, errors } = load({ seed: 5 });
  company(ev);
  dish(ev, 'sin');
  ev('S.pie.dishes[0].ant=16'); // 320 Gbps: room for every size of orbit customer
  cover(ev, 0.3);
  ev('dayTick()');
  assert.equal(ev("S.pie.crusts.short.open"), undefined, 'nothing opens while the crust carries nothing');
  cover(ev, 0.7);
  const open = (n) => ev(`(()=>{let k=0;for(let i=0;i<${n};i++){S.offers=S.offers.filter(o=>!BIZ_T[o.type].orbit);dayTick();k+=S.offers.filter(o=>BIZ_T[o.type].orbit).length;}return k;})()`);
  const d0 = ev('S.day');
  const first = open(10);
  assert.ok([d0, d0 + 1].includes(ev("S.pie.crusts.short.open")), 'the opening day is kept (the day tick moves the date first)');
  assert.ok(first >= 7, 'nearly every day of the opening brings a call (a type that fits nowhere spawns nothing): ' + first);
  ev(`S.day=${d0}+40`);
  const later = open(30);
  assert.ok(later < 20, 'after the opening, about one call in three days: ' + later);
  // The opening day survives a save, and garbage is dropped.
  ev(`S.pie.crusts.short.open=${d0};S=migrate(JSON.parse(JSON.stringify(S)))`);
  assert.equal(ev("S.pie.crusts.short.open"), d0);
  ev("S.pie.crusts.short.open='soon';S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(typeof ev("S.pie.crusts.short.open"), 'number');
  assert.deepEqual(errors, []);
});

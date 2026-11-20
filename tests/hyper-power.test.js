// The Hyperscaler's power (38-hyper-power.js): grid budgets seeded per metro and shared with the town, the build gate
// that explains itself, the utility queue (and its lack of a promise), protests rolled on the AS number and the day,
// every answer to them, a protest won, heat reuse, own generation, the power bill in the month's costs, a region that
// serves less when a heatwave squeezes its grid, saves, and the power section on a phone and on a desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
// A Hyperscaler in Frankfurt with plenty of cash, its home country launched, transit at home and a POP in Amsterdam
// joined to it (Amsterdam: a small grid, 130 MW, the town drawing 87).
// Level 3, with the director (38-hyper-director.js) holding budget and every system introduced: protests come in every
// kind from level 3 (before it, only small ones).
const DIR = 'S.lvl=3;Object.assign(S.hs.dir,{b:9,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});';
function start(opts = {}) {
  const page = load({ seed: 5, ...opts });
  page.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e9;ACT.hsLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});"
    + "ACT.buildPop({city:'ams'});UI.via=null;UI.route=null;openLinkModal(S.home,'ams');ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'ams',net:'cog',tier:1});" + DIR + "compute()");
  return page;
}
const lastLog = (ev, n = 3) => ev(`S.log.slice(0,${n}).map(x=>x.t).join(' | ')`);
/* The first day from S.day on whose protest roll for a Server Barn in Amsterdam (with goodwill gw) comes out as kind
   (null: no protest), found on a copy of the state, so the real build can then be made on that day. */
function dayFor(ev, kind, gw = 0, city = 'ams') {
  return ev(`(()=>{const s0=JSON.stringify(S.hs),d0=S.day,n0=S.log.length;let f=-1;
    for(let d=d0;d<d0+4000&&f<0;d++){S.hs=JSON.parse(s0);S.day=d;Object.assign(S.hs.dir,{c:null,q:0,b:9,ib:0});hsPwMk('${city}').gw=${gw};S.hs.rg['${city}']={t:1,ready:d+60,mw:20};const p=hsProtRoll('${city}','rg');
      const want=${JSON.stringify(kind)};if(want===null?!p:p&&p.kind===want)f=d;}
    S.hs=JSON.parse(s0);S.day=d0;S.log.splice(0,S.log.length-n0);return f;})()`);
}
// Build a Server Barn in Amsterdam on day d with goodwill gw.
// (Past the director's one crisis at a time: these tests are about the protests themselves.)
const barnOn = (ev, d, gw = 0) => ev(`S.day=${d};Object.assign(S.hs.dir,{c:null,q:0,b:9,ib:0});hsPwMk('ams').gw=${gw};ACT.hsRegion({city:'ams'})`);

test('grid budgets are seeded per metro, 40 to 600 MW, bigger in big metros, shared with the town', () => {
  const { ev, errors } = start();
  const g = J(ev, "CITIES.filter(c=>!c.off&&hsSite(c.id)).map(c=>[c.id,c.P,hsGrid(c.id),hsTown(c.id)])");
  assert.ok(g.length > 20);
  for (const [, , cap, town] of g) {
    assert.ok(cap >= 40 && cap <= 600, `cap ${cap}`);
    assert.ok(town >= cap * 0.5 - 1 && town <= cap * 0.7 + 1, 'the town draws half to seven tenths');
  }
  const by = g.slice().sort((a, b) => a[1] - b[1]), q = Math.floor(by.length / 4), avg = (L) => L.reduce((a, x) => a + x[2], 0) / L.length;
  assert.ok(avg(by.slice(-q)) > avg(by.slice(0, q)) + 50, 'big metros have bigger grids');
  // Seeded by the city, not by the game: another seed, the same grids.
  const other = load({ seed: 99 });
  other.ev("ACT.start({});ACT.charter({k:'hyper'})");
  assert.deepEqual(J(other.ev, "['fra','ams','lon','tok'].map(c=>[hsGrid(c),hsTown(c)])"), J(ev, "['fra','ams','lon','tok'].map(c=>[hsGrid(c),hsTown(c)])"));
  // A new Hyperscaler has power at home; the starter's 5 MW are drawn there, and free is what the town leaves.
  const P = J(ev, 'S.hs.pw.fra');
  assert.equal(P.cap, ev("hsGrid('fra')"));
  assert.equal(P.q, null);
  assert.ok(P.gw >= 25 && P.gw <= 50);
  assert.deepEqual(P.own, []);
  assert.equal(ev("hsMwUsed('fra')"), 5);
  assert.equal(ev("hsMwFree('fra')"), P.cap - ev("hsTown('fra')") - 5);
  assert.equal(ev("hsMwFree('ams')"), 130 - 87, 'no region yet in Amsterdam');
  assert.deepEqual(errors, []);
});

test('a build without the megawatts is refused, says why, and offers the utility queue', () => {
  const { ev, errors } = start();
  ev("hsPwMk('ams').cap=100");
  const cash = ev('S.cash');
  ev("ACT.hsRegion({city:'ams'})");
  assert.equal(ev("!!S.hs.rg.ams"), false);
  assert.equal(ev('S.cash'), cash, 'nothing paid');
  assert.match(lastLog(ev, 1), /No power for a Server Barn in Amsterdam: it needs 20 MW more, the grid has 13 MW free/);
  assert.match(ev("document.getElementById('toasts').innerHTML"), /hsUtil/, 'the toast offers the queue');
  // An upgrade is gated the same way: a Compute Campus needs 40 MW more than the Barn.
  ev("S.lvl=4;hsPwMk('ams').cap=130;S.hs.rg.ams={t:1,ready:0,mw:20};ACT.hsRegion({city:'ams'})");
  assert.equal(ev("!!S.hs.rg.ams.up"), false);
  assert.match(lastLog(ev, 1), /it needs 40 MW more, the grid has 23 MW free/);
  ev("hsPwMk('ams').cap=200;ACT.hsRegion({city:'ams'})");
  assert.equal(ev("S.hs.rg.ams.up.t"), 2, 'with the megawatts it goes ahead');
  assert.equal(ev("hsMwRes('ams')"), 60, 'and holds the new tier\'s megawatts while it is built');
  assert.deepEqual(errors, []);
});

test('the utility queue: a fee, 90 to 270 days, then the megawatts, or less, or later', () => {
  const { ev, errors } = start();
  const cash = ev('S.cash'), d0 = ev('S.day');
  ev("ACT.hsUtil({city:'ams'})");
  assert.equal(ev('S.cash'), cash - 1e6);
  const q = J(ev, 'S.hs.pw.ams.q');
  assert.equal(q.mw, 100);
  assert.ok(q.ready >= d0 + 90 && q.ready <= d0 + 270, `ready ${q.ready - d0} days on`);
  ev("ACT.hsUtil({city:'ams'})");
  assert.equal(ev('S.cash'), cash - 1e6, 'one request at a time');
  // Each answer is seeded on the day it falls due: find one of each.
  const find = (lo, hi) => ev(`(()=>{for(let d=S.day+1;d<S.day+5000;d++){const r=hstr(S.asn+'|'+d+'|ams|qr')%100;if(r>=${lo}&&r<${hi})return d;}return -1})()`);
  const full = find(45, 100), less = find(20, 45), late = find(0, 20);
  const s0 = ev('JSON.stringify(S.hs)');
  const due = (d) => ev(`S.hs=JSON.parse(${JSON.stringify(s0)});S.hs.pw.ams.q.ready=${d};S.day=${d};hsPwDay(${d})`);
  due(full);
  assert.equal(ev('S.hs.pw.ams.cap'), 230, 'the full +100 MW');
  assert.equal(ev('S.hs.pw.ams.q'), null);
  assert.match(lastLog(ev, 1), /gets its \+100 MW/);
  due(less);
  assert.equal(ev('S.hs.pw.ams.cap'), 180, 'half of it, found behind a vending machine');
  assert.match(lastLog(ev, 1), /vending machine/);
  due(late);
  assert.equal(ev('S.hs.pw.ams.cap'), 130, 'nothing yet');
  const q2 = J(ev, 'S.hs.pw.ams.q');
  assert.equal(q2.late, 1);
  assert.ok(q2.ready >= late + 60 && q2.ready <= late + 120);
  assert.match(lastLog(ev, 1), /squirrel/);
  ev(`S.day=S.hs.pw.ams.q.ready;hsPwDay(S.day)`);
  assert.ok(ev('S.hs.pw.ams.cap') > 130, 'late, but it comes: once late, never late again');
  assert.equal(ev('S.hs.pw.ams.q'), null);
  assert.deepEqual(errors, []);
});

test('protests roll from the AS number and the day, the town and goodwill, and only past a size', () => {
  const { ev, errors } = start();
  // The same day and network, the same outcome, in two separate games.
  const d = dayFor(ev, 'delay');
  assert.ok(d >= 0);
  const other = start();
  other.ev(`S.day=${d};hsPwMk('ams').gw=0;ACT.hsRegion({city:'ams'})`);
  barnOn(ev, d);
  assert.deepEqual(J(ev, 'S.hs.prot.ams'), J(other.ev, 'S.hs.prot.ams'));
  assert.equal(ev('S.hs.prot.ams.kind'), 'delay');
  assert.match(lastLog(ev, 1), /packed the permit hearing in Amsterdam/);
  assert.equal(ev('S.hs.rg.ams.ready'), d + ev('leadDays(60)') + (ev('S.hs.prot.ams.until') - d), 'the build waits as long as the protest');
  // Chance: more megawatts against the town raise it, goodwill lowers it.
  assert.ok(ev("hsProtP('ams',200)") > ev("hsProtP('ams',20)"));
  ev("S.hs.pw.ams.gw=90");
  assert.ok(ev("hsProtP('ams',20)") < ev("(S.hs.pw.ams.gw=0,hsProtP('ams',20))"));
  // The starter's 5 MW are below the size that draws one.
  assert.equal(ev("hsProtRoll('fra','rg')"), null);
  // Every kind happens on some day (none, delay, cost, block), never by luck.
  for (const k of [null, 'cost', 'block']) assert.ok(dayFor(ev, k) >= 0, String(k));
  assert.deepEqual(errors, []);
});

test('a protest can be won: goodwill from a community fund and heat reuse ends a blockade', () => {
  const { ev, errors } = start();
  const d = dayFor(ev, 'block');
  barnOn(ev, d);
  assert.equal(ev('S.hs.prot.ams.kind'), 'block');
  const ready = ev('S.hs.rg.ams.ready');
  // While blocked, the site waits day by day, and no other build goes ahead there.
  ev('for(let i=0;i<5;i++)dayTick()');
  assert.equal(ev('S.hs.rg.ams.ready'), ready + 5);
  // Heat reuse needs a live region to make the heat: say the old Barn next door is running.
  ev("S.hs.rg.ams={t:1,ready:S.day,mw:20};after()");
  const cash = ev('S.cash');
  ev("ACT.hsFund({city:'ams'})");
  assert.equal(ev('S.cash'), cash - 250000);
  assert.equal(ev('S.hs.pw.ams.gw'), 20);
  assert.equal(ev('!!hsProt("ams")'), true, 'not won yet');
  ev("ACT.hsHeat({city:'ams'})");
  assert.equal(ev('S.hs.pw.ams.gw'), 55);
  ev("ACT.hsFund({city:'ams'})");
  assert.equal(ev('S.hs.pw.ams.gw'), 75);
  assert.equal(ev('!!S.hs.prot.ams'), false, 'won');
  // The headline, and the badge for it right after (26-hyper-badges.js).
  assert.match(lastLog(ev, 2), /won over/);
  assert.match(lastLog(ev, 1), /Hearts, Minds and a Heated Pool/);
  assert.deepEqual(errors, []);
});

test('a delayed permit, won, gives its days back; waited out, the protest goes home', () => {
  const { ev, errors } = start();
  const d = dayFor(ev, 'delay');
  barnOn(ev, d);
  const p = J(ev, 'S.hs.prot.ams'), ready = ev('S.hs.rg.ams.ready');
  ev("S.hs.pw.ams.gw=60;ACT.hsFund({city:'ams'})");
  assert.equal(ev('!!S.hs.prot.ams'), false);
  assert.equal(ev('S.hs.rg.ams.ready'), ready - (p.until - d), 'the hearing\'s days come back');
  // Another one, waited out.
  const d2 = dayFor(ev, 'cost');
  ev("delete S.hs.rg.ams");
  barnOn(ev, d2);
  assert.equal(ev('S.hs.prot.ams.kind'), 'cost');
  ev("S.hs.rg.ams.ready=S.day");
  const price = ev("hsPwPrice('ams')");
  ev('dayTick()');
  ev("S.hs.prot.ams.until=S.day+1;dayTick()");
  assert.equal(ev('!!S.hs.prot.ams'), false, 'gone home');
  assert.ok(ev("hsPwPrice('ams')") < price, 'and the special tariff with them');
  assert.match(ev("S.log.map(x=>x.t).join(' ')"), /gone home from Amsterdam/);
  assert.deepEqual(errors, []);
});

test('answers: build smaller, or take it to another metro', () => {
  const { ev, errors } = start();
  const d = dayFor(ev, 'block');
  barnOn(ev, d);
  let cash = ev('S.cash');
  ev("ACT.hsShrink({city:'ams'})");
  assert.equal(ev('S.hs.rg.ams.t'), 0, 'a Rack Shack instead');
  assert.equal(ev('S.cash'), cash + 0.8 * ev('HS_T[1].cost'), '80% of the difference back');
  assert.equal(ev('!!S.hs.prot.ams'), false);
  ev('dayTick();dayTick()');
  assert.equal(ev("hsLive('ams')"), true, 'and it opens');
  // The upgrade to a Barn draws a blockade again: take it elsewhere.
  ev("hsPwMk('ams').cap=200;S.hs.rg.ams.up={t:1,ready:S.day+60};S.hs.prot.ams={until:S.day+200,kind:'block',g:1,on:'rg'}");
  cash = ev('S.cash');
  ev("ACT.hsMove({city:'ams'})");
  assert.equal(ev('!!S.hs.rg.ams.up'), false);
  assert.equal(ev('S.hs.rg.ams.t'), 0, 'the Shack stays');
  assert.equal(ev('S.cash'), cash + 0.9 * ev('HS_T[1].cost'));
  assert.equal(ev('!!S.hs.prot.ams'), false);
  // A new region called off is gone altogether.
  ev("delete S.hs.rg.ams");
  barnOn(ev, dayFor(ev, 'delay'));
  ev("ACT.hsMove({city:'ams'})");
  assert.equal(ev('!!S.hs.rg.ams'), false);
  assert.deepEqual(errors, []);
});

test('heat reuse: goodwill, and a monthly saving or cost in the bill', () => {
  const { ev, errors } = start();
  ev("S.hs.rg.ams={t:1,ready:0,mw:20};compute()");
  const c0 = ev('R.cost.cloud'), gw = ev("hsPw('ams').gw");
  ev("ACT.hsHeat({city:'nowhere'});ACT.hsHeat({city:'ams'})");
  const heat = ev('S.hs.pw.ams.heat');
  assert.equal(heat, ev("hsHeatMo('ams')"));
  assert.ok(heat !== 0);
  assert.equal(ev('S.hs.pw.ams.gw'), Math.min(100, gw + 35));
  assert.ok(Math.abs(ev('R.cost.cloud') - (c0 + heat)) < 1e-6, 'in the month\'s costs');
  const cash = ev('S.cash');
  ev("ACT.hsHeat({city:'ams'})");
  assert.equal(ev('S.cash'), cash, 'once per metro');
  // Some towns pay for the heat, some need heat pumps.
  const signs = J(ev, "[...new Set(CITIES.filter(c=>hsSite(c.id)).map(c=>Math.sign(hsHeatMo(c.id))))].sort()");
  assert.deepEqual(signs, [-1, 1]);
  assert.deepEqual(errors, []);
});

test('own generation: solar, a substation, and a reactor that brings its own protest', () => {
  const { ev, errors } = start();
  const sup = ev("hsSupply('fra')");
  ev("S.lvl=2;ACT.hsGen({city:'fra',k:'sol'})");
  assert.equal(ev('S.hs.pw.fra.own.length'), 0, 'level 3');
  ev("S.lvl=3;ACT.hsGen({city:'fra',k:'sol'});ACT.hsGen({city:'ams',k:'sol'})");
  assert.equal(ev('S.hs.pw.fra.own.length'), 1);
  assert.equal(ev('!!(S.hs.pw.ams&&S.hs.pw.ams.own.length)'), false, 'only next to a region');
  assert.equal(ev("hsSupply('fra')"), sup, 'not before it is built');
  ev("S.day=S.hs.pw.fra.own[0].ready-1;dayTick()");
  assert.equal(ev("hsSupply('fra')"), sup + 40);
  assert.match(ev("S.log.slice(0,5).map(x=>x.t).join(' ')"), /Solar farm with batteries in Frankfurt is running/);
  // Its megawatts cost less than the grid's.
  ev("S.hs.rg.fra={t:2,ready:0,mw:60}");
  const withSun = ev("hsPwBill('fra')");
  ev("S.hs.pw.fra.own=[]");
  assert.ok(withSun < ev("hsPwBill('fra')"));
  // The reactor at level 9: the Cooling Tower Truthers turn up every time.
  ev("S.lvl=9;delete S.hs.prot.fra;ACT.hsGen({city:'fra',k:'smr'})");
  assert.equal(ev("S.hs.pw.fra.own[0].k"), 'smr');
  const p = J(ev, 'S.hs.prot.fra');
  assert.equal(p.on, 'smr');
  assert.equal(p.g, 3);
  assert.ok(['block', 'delay'].includes(p.kind));
  ev("ACT.hsGen({city:'fra',k:'smr'})");
  assert.equal(ev("S.hs.pw.fra.own.length"), 1, 'one reactor per metro');
  const cash = ev('S.cash');
  ev("ACT.hsMove({city:'fra'})");
  assert.equal(ev("S.hs.pw.fra.own.length"), 0, 'called off');
  assert.equal(ev('S.cash'), cash + 18e6);
  assert.deepEqual(errors, []);
});

test('the power bill: every region\'s megawatts at their country\'s price, swung by events', () => {
  const { ev, errors } = start();
  assert.equal(ev("hsPwBill('fra')"), 0, 'the starter\'s 5 MW at home are on the house');
  ev("S.hs.rg.ams={t:1,ready:0,mw:20};compute()");
  const bill = ev("hsPwBill('ams')");
  assert.equal(bill, 20 * ev("hsPwPrice('ams')"));
  assert.ok(Math.abs(ev('R.cost.cloud') - (ev('HS_T[0].mo+HS_T[1].mo') + bill)) < 1e-6, 'regions\' monthly cost includes power');
  assert.ok(ev("hsPwPrice('fra')") > ev("hsPwPrice('dal')"), 'German power is dearer than Texan');
  ev("S.hs.pev.push({k:'crunch',reg:'EU',until:S.day+30});compute()");
  assert.equal(ev("hsPwPrice('ams')"), ev("Math.round(HS_PW_MO*hsPwF('ams')*2)"));
  assert.ok(ev("hsPwBill('ams')") > bill * 1.9, 'an energy crunch doubles it');
  // Events start seeded on the AS number and the day, toast, and end.
  ev("S.hs.pev=[]");
  const d = ev("(()=>{for(let d=S.day+1;d<S.day+5000;d++)if(hstr(S.asn+'|'+d+'|EU|pev')%1000<4)return d;})()");
  ev(`S.day=${d};hsPwDay(${d})`);
  assert.equal(ev("S.hs.pev[0].k"), 'heat');
  assert.match(lastLog(ev, 1), /Heatwave in Europe/);
  ev("S.day=S.hs.pev[0].until;hsPwDay(S.day)");
  assert.equal(ev("S.hs.pev.length"), 0);
  assert.deepEqual(errors, []);
});

test('a heatwave squeezes a tight grid: the region serves less (CX_ORG), and says so', () => {
  const { ev, errors } = start();
  ev("ACT.hsLaunch({cc:'NL'});S.hs.cc.NL.d=1400;S.hs.rg.ams={t:1,ready:0,mw:20};hsPwMk('ams').cap=hsTown('ams')+30;compute()");
  assert.equal(ev("hsCut('ams')"), 1);
  assert.equal(ev('R.hs.rg.ams.g'), 1500);
  ev("S.hs.pev.push({k:'heat',reg:'EU',until:S.day+10});compute()");
  const f = ev("hsCut('ams')");
  assert.ok(f < 1 && f > 0.3, 'cut to ' + f);
  assert.ok(Math.abs(ev('R.hs.rg.ams.g') - 1500 * f) < 1e-6);
  assert.ok(ev('R.hs.rg.ams.load') <= 1500 * f + 1e-6);
  assert.match(ev('hsCard()'), /Amsterdam serves only/);
  assert.match(ev("hsPwSection('ams')"), /only enough to serve/);
  // The home region on its big grid does not notice.
  assert.equal(ev("hsCut('fra')"), 1);
  // A tenant cannot sign where the grid has nothing left.
  ev("hsPwMk('fra').cap=hsTown('fra')+5;S.offers.push(hsOffer('startup',S.home,5));ACT.accept({id:S.offers[0].id})");
  assert.equal(ev('S.biz.length'), 0);
  assert.match(lastLog(ev, 1), /No power for another tenant/);
  assert.deepEqual(errors, []);
});

test('saves: power fields repaired, old Hyperscaler saves get seeded defaults, classic games have no S.hs', () => {
  const { ev, errors } = start();
  ev("S.hs.rg.ams={t:1,ready:0,mw:20};ACT.hsUtil({city:'ams'});S.lvl=3;ACT.hsGen({city:'fra',k:'sol'});S.hs.prot.ams={until:S.day+50,kind:'cost',g:2,on:'rg'};S.hs.pev.push({k:'heat',reg:'EU',until:S.day+9});ACT.hsHeat({city:'ams'})");
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  assert.deepEqual(back.hs, s.hs, 'a round trip keeps everything');
  const junk = { ...s, hs: { ...s.hs,
    pw: { fra: { cap: 'lots', q: { mw: -5, ready: 'soon' }, gw: 500, own: [{ k: 'sol', ready: 3 }, { k: 'sol' }, { k: 'sol' }, { k: 'fusion' }, 7], heat: 'warm' }, zzz: { cap: 5 }, ams: 'x' },
    prot: { ams: { until: 'never', kind: 'riot' }, fra: { until: 9, kind: 'block', g: 99, on: 'moon' }, zzz: { kind: 'delay' } },
    pev: [{ k: 'heat', reg: 'EU', until: 5 }, { k: 'heat', reg: 'EU', until: 6 }, { k: 'snow', reg: 'EU' }, { k: 'crunch', reg: 'XX' }, null] } };
  const m = J(ev, `migrate(${JSON.stringify(junk)})`);
  const D = J(ev, "hsPwDef('ams')");
  assert.deepEqual(m.hs.pw.fra, { cap: ev("hsGrid('fra')"), q: { mw: 1, ready: 0, late: 0 }, gw: 100, own: [{ k: 'sol', ready: 3 }, { k: 'sol', ready: 0 }] });
  assert.deepEqual(m.hs.pw.ams, D, 'junk becomes the seeded default for a region\'s metro');
  assert.equal(m.hs.pw.zzz, undefined);
  assert.deepEqual(m.hs.prot, { fra: { until: 9, kind: 'block', g: 3, on: 'rg' } });
  assert.deepEqual(m.hs.pev, [{ k: 'heat', reg: 'EU', until: 5 }]);
  // An old Hyperscaler save from before power: seeded defaults.
  const old = { ...s, hs: { ...s.hs } };
  delete old.hs.pw; delete old.hs.prot; delete old.hs.pev;
  const o = J(ev, `migrate(${JSON.stringify(old)})`);
  assert.deepEqual(Object.keys(o.hs.pw).sort(), ['ams', 'fra']);
  assert.deepEqual(o.hs.pw.fra, J(ev, "hsPwDef('fra')"));
  assert.deepEqual([o.hs.prot, o.hs.pev], [{}, []]);
  ev(`S=migrate(${JSON.stringify(old)});compute();for(let i=0;i<3;i++)dayTick()`);
  assert.equal(ev('charter()'), 'hyper');
  // Classic games: no S.hs, and the hooks stay out of the way.
  const g = J(ev, `migrate(${JSON.stringify({ ...s, charter: 'global' })})`);
  assert.equal(g.hs, undefined);
  const c = load({ seed: 5 });
  c.ev("ACT.start({});ACT.charter({k:'global'});compute();dayTick()");
  assert.equal(c.ev('S.hs'), undefined);
  assert.equal(c.ev("siteRoom(100,S.home)"), 100);
  assert.deepEqual(c.errors, []);
  assert.deepEqual(errors, []);
});

test('the power section and the card line render on a phone and on a desktop', () => {
  const { ev, dom, errors } = start();
  ev("S.hs.rg.ams={t:1,ready:0,mw:20};S.lvl=9;ACT.hsUtil({city:S.home});ACT.hsGen({city:S.home,k:'sol'});S.hs.prot.ams={until:S.day+50,kind:'block',g:1,on:'rg'};S.hs.rg.ams.up={t:2,ready:S.day+90};S.hs.pev.push({k:'heat',reg:'EU',until:S.day+9});compute()");
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};selectCity('ams');UI.tab='cust';renderAll()`);
    const body = dom.window.document.getElementById('panelBody');
    const t = body.textContent;
    assert.match(t, /Power/);
    assert.match(t, /Grid \(/);
    assert.match(t, /The town draws/);
    assert.match(t, /Goodwill here/);
    assert.match(t, /Grannies Against Gigawatts block the site/);
    assert.match(t, /Build smaller/);
    assert.match(t, /Another metro/);
    assert.match(t, /Heatwave until/);
    assert.match(t, /Own generation/);
    for (const row of body.querySelectorAll('section .btns')) assert.ok(row.querySelectorAll('button').length <= 2, 'rows of two buttons at most');
    ev("selectCity(S.home);renderAll()");
    assert.match(dom.window.document.getElementById('panelBody').textContent, /promises \+100 MW/);
    const card = ev('hsCard()');
    assert.match(card, /Power: your regions draw/);
    assert.match(card, /Grannies Against Gigawatts at Amsterdam/);
    assert.match(card, /Heatwave in Europe/);
  }
  assert.deepEqual(errors, []);
});

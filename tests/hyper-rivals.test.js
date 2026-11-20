// Rival clouds, phase 6 (38-hyper-rivals.js): bids on tenant offers (won on fit, matched on price, lost when you wait),
// tenants courted and poached at renewal, price wars matched or ignored, AI runs taken when you let them wait, a rival's
// outage sending refugees, all seeded; saves; the Market line on the charter card and the bid under an offer.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

/* A Hyperscaler at home in Frankfurt (its Rack Shack, transit there: a front door), a POP in Paris with transit, and a
   POP in New York with nothing: far from any region, no way out. */
// The director (38-hyper-director.js) lets rivals in at their level, once introduced, with budget to spend: these tests
// start with all three.
const DIR = 'Object.assign(S.hs.dir,{b:9,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});';
function net(t, seed = 7) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'nyc'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;ACT.buyTransit({city:S.home,net:'cog',tier:3});ACT.buyTransit({city:'par',net:'cog',tier:3});S.offers=[];" + DIR + "compute()");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
// A tenant signed in city c (kind k), with its contract's end and happiness.
const tenant = (c, k = 'startup') => `(()=>{const o=hsOffer('${k}','${c}',10);S.offers.push(o);ACT.accept({id:o.id});return S.biz.find(b=>b.id===o.id).id})()`;

test('a rival bids on a tenant offer: you sign at your price when you fit better, at theirs otherwise, and lose it if you wait', (t) => {
  const { ev, errors } = net(t);
  assert.equal(ev("S.home"), 'fra');
  // Near your region, with a front door: you fit better than Goggle Cloud.
  ev("S.offers.push(Object.assign(hsOffer('startup','fra',10),{id:'o1',rate:200}));S.hs.rv.of.o1={w:2,bid:170,d:S.day+5}");
  const f1 = J(ev, "hsRvFit(S.offers[0],S.hs.rv.of.o1)");
  assert.ok(f1.win && f1.you >= 0.79, JSON.stringify(f1));
  const note = ev("bRisk(S.offers[0])");
  assert.match(note, /Goggle Cloud also bid: \$1.7k\/mo, decides by/);
  assert.match(note, /You fit them better/);
  ev("ACT.accept({id:'o1'})");
  assert.equal(ev("S.biz.find(b=>b.id==='o1').rate"), 200, 'your own price');
  assert.equal(ev("S.hs.rv.bt"), 1);
  assert.equal(ev("S.hs.rv.of.o1"), undefined);
  // In New York: no region nearby, no front door. AliBubble fits better; signing matches its price.
  ev("S.offers.push(Object.assign(hsOffer('startup','nyc',10),{id:'o2',rate:200}));S.hs.rv.of.o2={w:3,bid:150,d:S.day+5}");
  assert.equal(ev("hsRvFit(S.offers[0],S.hs.rv.of.o2).win"), false);
  assert.match(ev("bRisk(S.offers[0])"), /AliBubble Cloud fits them better \(you lack a region nearby, a front door in their city\)/);
  ev("ACT.accept({id:'o2'})");
  assert.equal(ev("S.biz.find(b=>b.id==='o2').rate"), 150, 'matched');
  // Wait past the rival's day and the rival signs them.
  ev("S.offers.push(Object.assign(hsOffer('startup','fra',10),{id:'o3'}));S.hs.rv.of.o3={w:0,bid:100,d:S.day};S.log=[];hsRvDay(S.day)");
  assert.equal(ev("S.offers.some(o=>o.id==='o3')"), false);
  assert.equal(ev("S.hs.rv.lt"), 1);
  assert.match(ev('JSON.stringify(S.log||[])'), /Amazin' Web Services/);
  assert.deepEqual(errors, []);
});

test('bids are decided once, seeded on the offer, cheaper than yours, with a decision day a week or two out', (t) => {
  const run = () => {
    const { ev, errors } = net(t, 3);
    ev("S.offers=[];const ns=['Uber for Hamsters','Blockchain for Bees','Yet Another To-Do App','Pivot Pivot Pivot Inc.','Disruptive Toaster Labs','Synergy Sandwiches','Moonshot Muffins','Hockey Stick Growth Co.'];" +
      "for(const n of ns)S.offers.push(Object.assign(hsOffer('startup','par',10),{name:n,exp:S.day+40}));hsRvDay(S.day)");
    const x = J(ev, "S.offers.map(o=>[o.name,o.rate,S.hs.rv.of[o.id]])");
    assert.deepEqual(errors, []);
    return x;
  };
  const a = run(), b = run();
  assert.deepEqual(a.map((x) => [x[0], x[2].w, x[2].bid, x[2].d]), b.map((x) => [x[0], x[2].w, x[2].bid, x[2].d]), 'the same every time');
  const bids = a.filter((x) => x[2].w >= 0);
  assert.ok(bids.length >= 2 && bids.length < a.length, `some offers contested, not all: ${bids.length}/${a.length}`);
  for (const [, rate, x] of bids) {
    assert.ok(x.bid < rate && x.bid >= rate * 0.79, `${x.bid} vs ${rate}`);
    assert.ok(x.d >= 7 && x.d <= 14, 'decides in a week or two: ' + x.d);
  }
});

test('renewals: an unhappy tenant is courted, then poached; a happy one stays', (t) => {
  const { ev, errors } = net(t);
  const sad = ev(tenant('fra')), glad = ev(tenant('fra', 'ent'));
  ev(`S.log=[];const a=S.biz.find(b=>b.id==='${sad}'),b=S.biz.find(b=>b.id==='${glad}');a.te=S.day+20;a.mood=40;b.te=S.day+2;b.mood=100;hsRvDay(S.day)`);
  assert.equal(ev(`S.hs.rv.wn['${sad}']`), ev(`S.biz.find(b=>b.id==='${sad}').te`), 'warned once for this term');
  assert.match(ev('JSON.stringify(S.log)'), /is courting/);
  assert.equal(ev(`S.biz.some(b=>b.id==='${glad}')`), true);
  assert.equal(ev('S.hs.rv.bt'), 1, 'kept');
  ev(`S.biz.find(b=>b.id==='${sad}').te=S.day+2;hsRvDay(S.day)`);
  assert.equal(ev(`S.biz.some(b=>b.id==='${sad}')`), false, 'poached');
  assert.equal(ev('S.hs.rv.lt'), 1);
  assert.match(ev('JSON.stringify(S.log)'), /🥊/);
  assert.deepEqual(errors, []);
});

test('a price war: matched it costs its cut of those tenants\' bills; ignored, renewals there ask for the rival\'s price', (t) => {
  const { ev, errors } = net(t);
  const a = ev(tenant('fra')), b = ev(tenant('par', 'ent'));
  ev('S.hs.rv.nw=S.day;S.log=[];hsRvDay(S.day)');
  const P = J(ev, 'S.hs.rv.pw');
  assert.equal(P.reg, 'EU');
  assert.ok(P.f >= 0.15 && P.f <= 0.25 && P.until - P.from >= 45, JSON.stringify(P));
  assert.equal(P.m, 0);
  assert.match(ev('JSON.stringify(S.log)'), /📉/);
  assert.match(ev('hsCard()'), /price war in Europe/);
  ev('compute()');
  const v0 = ev('R.rev.business');
  ev('ACT.hsRvMatch({on:1});compute()');
  assert.equal(ev('S.hs.rv.pw.m'), 1);
  const cut = ev('R.hs.pwc');
  assert.ok(cut > 0, 'the cut');
  assert.ok(Math.abs(v0 - cut - ev('R.rev.business')) < 1e-6, 'off the bills');
  assert.match(ev('hsCard()'), /matching/);
  // Ignored: a tenant renewing during the war under 80% happiness leaves; a delighted one renews at the rival's price.
  ev(`ACT.hsRvMatch({on:0});const x=S.biz.find(z=>z.id==='${a}'),y=S.biz.find(z=>z.id==='${b}');x.te=S.day+2;x.mood=75;y.te=S.day+2;y.mood=100;compute()`);
  assert.equal(ev('R.hs.pwc'), 0);
  const r0 = ev(`S.biz.find(z=>z.id==='${b}').rate`);
  ev('hsRvDay(S.day)');
  assert.equal(ev(`S.biz.some(z=>z.id==='${a}')`), false, 'poached in the war');
  assert.equal(ev(`S.biz.find(z=>z.id==='${b}').rate`), Math.round(r0 * (1 - P.f)));
  ev('S.day=S.hs.rv.pw.until;hsRvDay(S.day)');
  assert.equal(ev('S.hs.rv.pw'), undefined, 'over');
  assert.ok(ev('S.hs.rv.nw') > ev('S.day') + 80, 'the next one is months away');
  assert.deepEqual(errors, []);
});

test('an AI run left waiting goes to a rival; a rival\'s outage sends a flash of refugees', (t) => {
  const { ev, errors } = net(t);
  ev("S.hs.rg.par={t:1,ready:0,mw:20};S.hs.jo.push({id:'j1',n:'Overfit and Sons',a:'fra',b:'par',g:3200,wk:6,tb:1e6,fee:5e6,exp:S.day+20});hsRvDay(S.day)");
  assert.ok(ev("'j1' in S.hs.rv.jo"), 'decided');
  ev("S.hs.rv.jo.j1={w:1,d:S.day+1};hsRvDay(S.day)");
  assert.match(ev("hsCard()"), /Microsnoft Azzure takes this run on/);
  ev("S.log=[];S.day++;hsRvDay(S.day)");
  assert.equal(ev('S.hs.jo.length'), 0, 'taken');
  assert.match(ev('JSON.stringify(S.log)'), /Microsnoft Azzure/);
  // An outage: refugees call, at your price, no rival bidding.
  ev(tenant('fra'));
  ev('S.offers=[];S.hs.rv.nd=S.day;S.log=[];hsRvDay(S.day)');
  const D = J(ev, 'S.hs.rv.dn');
  assert.ok(D && D.until > ev('S.day') && D.until <= ev('S.day') + 3, JSON.stringify(D));
  const n = ev("S.offers.filter(o=>o.type==='cloud').length");
  assert.ok(n >= 2 && n <= 3, 'a flash of offers: ' + n);
  assert.ok(ev("S.offers.every(o=>S.hs.rv.of[o.id].w===-1&&o.exp===S.day+10)"));
  assert.match(ev('JSON.stringify(S.log)'), /🔥/);
  assert.match(ev('hsCard()'), /down in /);
  // While it is down, that rival bids on nothing.
  assert.equal(ev(`hsRvWho('${'EU'}','x')===S.hs.rv.dn.w`), false);
  assert.deepEqual(errors, []);
});

test('saves: rival state repaired, junk dropped, an old save gets the defaults; the Market line on a phone and a desktop', (t) => {
  const { ev, dom, errors } = net(t);
  ev(tenant('fra'));
  ev("S.offers.push(Object.assign(hsOffer('startup','fra',10),{id:'o9'}));S.hs.rv.of.o9={w:2,bid:99,d:S.day+9};S.hs.rv.pw={w:1,reg:'EU',from:S.day,until:S.day+50,f:0.2,m:1};S.hs.rv.lt=2;compute()");
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  assert.deepEqual(back.hs.rv, s.hs.rv);
  const old = { ...s, hs: { ...s.hs } };
  delete old.hs.rv;
  const o = J(ev, `migrate(${JSON.stringify(old)}).hs.rv`);
  assert.deepEqual([o.of, o.jo, o.lt, o.bt, o.nw - s.day, o.nd - s.day], [{}, {}, 0, 0, 60, 120]);
  const junk = { ...s, hs: { ...s.hs, rv: { of: { o9: { w: 99, bid: 'x', d: 'y' }, gone: { w: 1, bid: 5, d: 1 } }, jo: { nope: { w: 1 } }, pw: { w: 'x', reg: 'MOON' }, dn: { w: 2, reg: 'AS', until: 'z' }, lt: -4, bt: 'many', wn: [], pc: { zz: 4 } } } };
  const m = J(ev, `migrate(${JSON.stringify(junk)}).hs.rv`);
  assert.deepEqual(m.of, { o9: { w: 4, bid: 1, d: 0 } });
  assert.deepEqual([m.jo, m.pw, m.dn, m.lt, m.bt, m.wn, m.pc], [{}, undefined, { w: 2, reg: 'AS', until: 0 }, 0, 0, {}, {}]);
  ev(`S=migrate(${JSON.stringify(junk)});compute();for(let i=0;i<3;i++)dayTick()`);
  ev(`S=migrate(${JSON.stringify(s)});compute()`);
  const doc = dom.window.document;
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};renderAll()`);
    const card = ev('hsCard()');
    assert.match(card, /Market:/);
    assert.match(card, /Microsnoft Azzure price war in Europe: −20%/);
    assert.match(card, /Stop matching/);
    assert.match(card, /1 offer contested · lost 2 to rivals/);
    ev("selectCity('fra');UI.tab='cust';renderAll()");
    assert.match(doc.getElementById('panelBody').textContent, /Goggle Cloud also bid/);
    for (const b of doc.querySelectorAll('#panelBody .btns')) assert.ok(b.querySelectorAll('button').length <= 2, 'rows of two at most');
  }
  // Outside the charter none of it exists.
  assert.equal(ev(`(()=>{const x=migrate(${JSON.stringify({ ...s, charter: 'global' })});return x.hs===undefined})()`), true);
  assert.deepEqual(errors, []);
});

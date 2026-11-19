const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A level-5 Streaming service in Frankfurt with a big origin, live in Germany, well served.
const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;S.lvl=5;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.cnt.dc[S.home].t=3;compute()");
  page.ev("for(const g of [...GOALS,...CONTENT_GOALS])S.done[g.id]=S.done[g.id]||0");
  return page;
};
// The strongest rival in Germany (presence is a hash of the game, so the test asks rather than assumes).
const top = "rvIn('DE').sort((a,b)=>b.q-a.q)[0]";

test('rivals share a country, and your picture against theirs sets your ceiling and growth there', () => {
  const { ev, errors } = start();
  assert.ok(ev("rvIn('DE').length") >= 1, 'NetChill-sized rivals stream in Germany');
  assert.equal(ev("rvIn('CN').length"), 0, 'never where foreign streaming is kept out');
  const base = JSON.parse(ev("JSON.stringify(rvEdge('DE'))"));
  assert.ok(base.q >= 0.9);
  // The best rival goes down: your edge, ceiling and growth go up.
  ev(`S.cnt.rv.out={r:${top}.id,reg:'EU',until:S.day+3,c:2}`);
  const down = JSON.parse(ev("JSON.stringify(rvEdge('DE'))"));
  assert.ok(down.pot > base.pot && down.grow > base.grow, 'a rival outage lifts your ceiling and growth');
  assert.ok(ev("ccPot('DE')") > 0);
  // Your picture falls apart: ceiling and growth fall below the rivals'.
  ev("S.cnt.rv.out=null;S.cnt.cc.DE.d=5000;compute()");
  const bad = JSON.parse(ev("JSON.stringify(rvEdge('DE'))"));
  assert.ok(bad.q < 0.9 && bad.pot < base.pot && bad.churn > 1, 'buffering against sharp rivals costs ceiling and sends viewers away');
  assert.match(ev("streamHere(S.home)"), /Rival streamers in/);
  assert.match(ev("cntCard()"), /Rivals in your countries/);
  assert.deepEqual(errors, []);
});

test('a rival bids for an event on offer: the price rises, and if you wait it streams it instead', () => {
  const { ev, errors } = start();
  ev("S.cnt.rnext=S.day;evDay(S.day);rvDay(S.day)");
  assert.equal(ev("S.cnt.roff.length"), 1);
  const fee0 = ev("S.cnt.roff[0].fee"), id = ev("S.cnt.roff[0].id");
  let d = 0;
  while (d < 20 && !ev(`S.cnt.rv.bid['${id}'].r`)) { ev("S.day++;evDay(S.day);rvDay(S.day)"); d++; }
  assert.ok(ev(`S.cnt.rv.bid['${id}'].r`), 'a rival bids within the offer');
  assert.ok(ev("S.cnt.roff[0].fee") > fee0, 'the price rises');
  assert.ok(ev("S.cnt.roff[0].exp") <= ev("S.day") + ev("RV_BID"), 'and the offer ends sooner');
  assert.match(ev("cntCard()"), /bid .* buy before/);
  const who = ev(`S.cnt.rv.bid['${id}'].r`);
  for (let i = 0; i < 6; i++) ev("S.day++;evDay(S.day);rvDay(S.day)");
  assert.equal(ev("S.cnt.roff.length"), 0);
  assert.equal(ev("S.cnt.rv.evs.length"), 1, 'the rival streams it');
  assert.equal(ev("S.cnt.rv.evs[0].r"), who);
  assert.match(ev("cntCard()"), /streams .* in \d+ days/);
  assert.deepEqual(errors, []);
});

test('outbid the rival and the event is yours', () => {
  const { ev, errors } = start();
  ev("S.cnt.rnext=S.day;evDay(S.day);rvDay(S.day)");
  const id = ev("S.cnt.roff[0].id");
  while (!ev(`S.cnt.rv.bid['${id}'].r`)) ev("S.day++;evDay(S.day);rvDay(S.day)");
  const fee = ev("S.cnt.roff[0].fee"), cash = ev("S.cash");
  ev(`ACT.cntRights({id:'${id}'})`);
  assert.equal(ev("S.cash"), cash - fee, 'you pay the bid');
  ev("S.day++;rvDay(S.day)");
  assert.equal(ev("S.cnt.evs.length"), 1);
  assert.equal(ev("S.cnt.rv.evs.length"), 0);
  assert.equal(ev("Object.keys(S.cnt.rv.bid).length"), 0);
  assert.deepEqual(errors, []);
});

test('a rival event that buffers opens a window: ads bring viewers over if your picture holds', () => {
  const { ev, errors } = start();
  // While the rival is down its event certainly buffers.
  ev(`(()=>{const r=${top};S.cnt.rv.out={r:r.id,reg:'EU',until:S.day+9,c:0};S.cnt.rv.evs.push({id:'x',r:r.id,n:3,reg:'EU',day:S.day+1,b:0});})()`);
  ev("S.day++;rvDay(S.day)");
  assert.equal(ev("S.cnt.rv.evs[0].b"), 1);
  assert.equal(ev("S.cnt.rv.sw.DE.k"), 1);
  assert.match(ev("cntCard()"), /looking for a new service/);
  assert.ok(ev("rvEdge('DE').grow") > 2, 'switchers sign up fast');
  const d = ev("S.cnt.cc.DE.d"), cash = ev("S.cash"), cost = ev("rvAdPlan().cost");
  ev("ACT.rvAd({})");
  assert.ok(ev("S.cnt.cc.DE.d") > d, 'switchers came over');
  assert.equal(ev("S.cash"), cash - cost);
  assert.equal(ev("rvAdPlan().ks.length"), 0, 'once per window');
  ev("S.day+=RV_SW+10;rvDay(S.day)");
  assert.equal(ev("!!S.cnt.rv.sw.DE"), false, 'the window closes');
  assert.deepEqual(errors, []);
});

test('ads while you buffer too backfire, and a clean rival night keeps viewers put', () => {
  const { ev, errors } = start();
  ev(`S.cnt.rv.sw.DE={r:${top}.id,until:S.day+5,k:1,ad:0};S.cnt.cc.DE.d=5000;compute()`);
  assert.ok(ev("ccQ(R,'DE')") < 0.9);
  ev("ACT.rvAd({})");
  assert.ok(ev("S.cnt.cc.DE.d") < 5000, 'viewers laugh and cancel');
  // A clean night: find one by the hash, as the game would roll it.
  const n = ev(`(()=>{const r=${top};for(let n=0;n<12;n++)if(hstr(S.asn+'|rvbuf|'+n+'|'+(S.day+1)+'|'+r.id)%100>=r.buf)return n;return -1;})()`);
  assert.ok(n >= 0);
  ev(`S.cnt.rv.sw={};S.cnt.rv.evs.push({id:'y',r:${top}.id,n:${n},reg:'EU',day:S.day+1,b:0});S.day++;rvDay(S.day)`);
  assert.equal(ev("S.cnt.rv.evs[0].b"), -1);
  assert.equal(ev("S.cnt.rv.sw.DE.k"), -1);
  assert.ok(ev("rvEdge('DE').grow") < ev(`(()=>{const w=S.cnt.rv.sw.DE;delete S.cnt.rv.sw.DE;const g=rvEdge('DE').grow;S.cnt.rv.sw.DE=w;return g;})()`), 'their viewers stay put');
  assert.deepEqual(errors, []);
});

test('a price war: match it and earn less there, or hold and watch subscribers drift', () => {
  const { ev, errors } = start();
  ev(`S.cnt.rv.pw={r:${top}.id,reg:'EU',until:S.day+30,m:0}`);
  assert.match(ev("cntCard()"), /price war/);
  const d = ev("S.cnt.cc.DE.d"), g0 = ev("rvEdge('DE').grow"), rev0 = ev("cntMul('rev','DE')");
  ev("S.day++;rvDay(S.day)");
  assert.ok(ev("S.cnt.cc.DE.d") < d, 'holding: subscribers drift');
  ev("ACT.rvMatch({m:1})");
  assert.equal(ev("S.cnt.rv.pw.m"), 1);
  assert.ok(Math.abs(ev("cntMul('rev','DE')") - rev0 * ev('RV_PW_CUT')) < 1e-9, 'matching: less revenue there');
  assert.ok(ev("rvEdge('DE').grow") > g0, 'and growth back');
  const d2 = ev("S.cnt.cc.DE.d");
  ev("S.day++;rvDay(S.day)");
  assert.equal(ev("S.cnt.cc.DE.d"), d2, 'no drift while matching');
  ev("S.day+=40;rvDay(S.day)");
  assert.equal(ev("S.cnt.rv.pw"), null, 'it ends');
  assert.deepEqual(errors, []);
});

test('rivals move only after a quiet start: launches in your countries, price wars, outages', () => {
  const { ev, errors } = start();
  ev("ACT.cntLaunch({cc:'FR'});ACT.cntLaunch({cc:'IT'});ACT.cntLaunch({cc:'ES'});compute()");
  assert.ok(ev("S.cnt.rv.next") >= ev("S.day") + 60);
  const kinds = ev(`(()=>{const seen=new Set(),V=S.cnt.rv;V.next=S.day;for(let i=0;i<400;i++){S.day++;rvDay(S.day);if(V.pw)seen.add('pw');if(V.out)seen.add('out');}
    if(Object.values(V.in).some(l=>l.length))seen.add('launch');return [...seen];})()`);
  for (const k of ['launch', 'pw', 'out']) assert.ok(kinds.includes(k), `rivals ${k} within a year`);
  assert.equal(ev("Object.values(S.cnt.rv.in).flat().filter(k=>!S.cnt.cc[k]).length"), 0, 'rivals launch only in your countries');
  assert.deepEqual(errors, []);
});

test('old streaming saves load with quiet rivals; broken rival state is repaired; a carrier has none', () => {
  const { ev, errors } = start();
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.cnt.rv;sanitize(s);return s.cnt.rv.evs.length===0&&s.cnt.rv.pw===null&&s.cnt.rv.next>=s.day+RV_START;})()"), true);
  const v = JSON.parse(ev(`(()=>{const s=JSON.parse(JSON.stringify(S));s.cnt.rv={in:{nfx:['DE','XX',3],zzz:['DE']},next:'x',bid:{a:{r:'zzz',n:99,reg:'EU',day:5},b:{reg:'MOON'}},evs:[{r:'nfx',reg:'EU',n:-4,day:9},{r:'bad',reg:'EU'}],sw:{DE:{r:'ggl',until:9,k:-3},XX:{r:'ggl'}},pw:{r:'nfx',reg:'NOPE'},out:{r:'hul',reg:'AM',until:4,c:77}};sanitize(s);return JSON.stringify(s.cnt.rv);})()`));
  assert.deepEqual(v.in, { nfx: ['DE'] });
  assert.equal(typeof v.next, 'number');
  assert.deepEqual(Object.keys(v.bid), ['a']);
  assert.equal(v.bid.a.r, '');
  assert.equal(v.evs.length, 1);
  assert.equal(v.evs[0].n, 0);
  assert.deepEqual(Object.keys(v.sw), ['DE']);
  assert.equal(v.sw.DE.k, -1);
  assert.equal(v.pw, null);
  assert.equal(v.out.c, ev('RV_OUT.length') - 1);
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;rvDay(S.day)");
  assert.equal(g.ev("rvOn()"), false);
  assert.equal(g.ev("S.cnt"), undefined);
  assert.deepEqual(errors, []);
  assert.deepEqual(g.errors, []);
});

test('the rivals fit a phone', () => {
  const { ev, dom, errors } = start();
  ev(`S.cnt.rv.pw={r:${top}.id,reg:'EU',until:S.day+30,m:0};S.cnt.rv.sw.DE={r:${top}.id,until:S.day+5,k:1,ad:0}`);
  dom.window.innerWidth = 360;
  ev("renderAll()");
  assert.match(ev("cntCard()"), /Match it/);
  assert.match(ev("cntCard()"), /We don't buffer/);
  assert.deepEqual(errors, []);
});

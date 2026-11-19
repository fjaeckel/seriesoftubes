const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A Streaming service in Frankfurt, live in Germany, served from its starter origin.
const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;S.lvl=5;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});compute()");
  return page;
};

test('a home ISP offers a bundle: subscribers at its wholesale price, free hosting, no disputes, and some leave at the end', () => {
  const { ev, errors } = start();
  ev("S.cnt.bnext=S.day;bundDay(S.day)");
  assert.equal(ev("S.cnt.boff.length"), 1, 'an ISP calls even with nobody at the sales desk');
  const net = ev("S.cnt.boff[0].net");
  assert.equal(ev(`eyeNet(NET['${net}'])&&homeOf(NET['${net}']).has('DE')`), true);
  const d = ev("S.cnt.cc.DE.d"), add = ev("S.cnt.boff[0].g.DE");
  ev("compute()");const rev0 = ev("R.rev.eyeballs");
  ev(`S.cnt.disp={net:'${net}',fee:9000,day:S.day,camp:0,cut:0.8};ACT.cntBund({id:S.cnt.boff[0].id})`);
  assert.ok(Math.abs(ev("S.cnt.cc.DE.d") - d - add) < 1e-9, 'its subscribers arrive at once');
  assert.equal(ev("S.cnt.disp"), null, 'a partner ends its dispute');
  assert.equal(ev(`boxFree(NET['${net}'])`), true, 'and hosts boxes for free');
  assert.equal(ev(`boxFreeOwn(NET['${net}'])`), ev(`NET['${net}'].pol!=='paid'`), 'which Must-Carry does not count');
  ev("compute()");
  const perSub = (ev("R.rev.eyeballs") - rev0) / add, full = ev("CNT_RATE*ccQ(R,'DE')");
  assert.ok(perSub < full * 0.7, 'bundled subscribers pay less: ' + perSub + ' vs ' + full);
  const keep = ev("S.cnt.bund[0].keep"), now = ev("S.cnt.cc.DE.d");
  ev("S.cnt.bund[0].until=S.day;bundDay(S.day)");
  assert.equal(ev("S.cnt.bund.length"), 0);
  assert.ok(Math.abs(ev("S.cnt.cc.DE.d") - (now - add * (1 - keep))) < 1e-9, 'some bundled subscribers cancel');
  assert.deepEqual(errors, []);
});

test('who sells shapes the bundles, and the CEO signs one on the golf course', () => {
  const { ev, errors } = start();
  const of = who => JSON.parse(ev(`(()=>{S.sales={p:${who ? `'${who}'` : 'null'}};S.cnt.boff=[];S.cnt.bnext=S.day;bundDay(S.day);const o=S.cnt.boff[0];return JSON.stringify(o?{days:o.days,cut:o.cut,keep:o.keep,by:o.by}:null);})()`));
  const eng = of('eng'), shark = of('shark');
  assert.ok(eng.days > shark.days && eng.keep > shark.keep && eng.cut < shark.cut, 'the engineer sells long fair bundles, the shark short cheap ones');
  assert.equal(of('ceo'), null, 'the CEO does not wait for calls');
  ev("S.sales={p:'ceo'};S.cnt.boff=[];salesGolf(S.day)");
  assert.equal(ev("S.cnt.bund.length"), 1);
  assert.equal(ev("S.cnt.bund[0].by"), 'ceo');
  assert.equal(ev("S.biz.length"), 0, 'no customers from the golf course');
  assert.deepEqual(errors, []);
});

test('bundles and the sales desk lines show only for a Streaming service', () => {
  const { ev, errors } = start();
  ev("S.cnt.bnext=S.day;bundDay(S.day)");
  assert.match(ev("cntCard()"), /wants to bundle you/);
  ev("salesModal()");
  assert.match(ev("document.getElementById('modal').innerHTML"), /bundles/);
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;S.lvl=5;salesModal()");
  assert.doesNotMatch(g.ev("document.getElementById('modal').innerHTML"), /bundle/i);
  assert.equal(g.ev("typeof S.cnt"), 'undefined');
  assert.deepEqual(errors, []);
  assert.deepEqual(g.errors, []);
});

test('a streaming service grows at home first: no second continent before level 6', () => {
  const { ev, errors } = start();
  ev("S.lvl=1;S.stats.peak=1e9;for(const k of ['FR','NL','BE','AT','CH','PL','IT','ES','DK','CZ','PT','SE','NO','FI','IE','HU','GR','RO','SK'])S.cnt.cc[k]={d:1,since:0}");
  assert.equal(ev("custLevel()"), 6, 'twenty European countries reach level 6 and stop at its second continent');
  ev("S.cnt.cc.US={d:1,since:0}");
  assert.ok(ev("custLevel()") >= 7);
  assert.equal(ev("CONTENT_GOALS.find(g=>g.id==='ct_cc5').ok()"), true, 'five countries, any continent');
  assert.deepEqual(errors, []);
});

test('bundles survive a save and old saves without them load', () => {
  const { ev, errors } = start();
  ev("S.cnt.bnext=S.day;bundDay(S.day);ACT.cntBund({id:S.cnt.boff[0].id});S.cnt.bnext=S.day;bundDay(S.day)");
  const back = JSON.parse(ev("(()=>{const s=JSON.parse(JSON.stringify(S));sanitize(s);return JSON.stringify({b:s.cnt.bund.length,o:s.cnt.boff.length});})()"));
  assert.equal(back.b, 1);
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.cnt.bund;delete s.cnt.boff;sanitize(s);return s.cnt.bund.length+s.cnt.boff.length;})()"), 0);
  assert.deepEqual(errors, []);
});

test('a peak capped a hair below the level mark still levels up', () => {
  const { ev, errors } = start();
  ev("S.lvl=4;for(const k of ['FR','NL','BE','AT','CH','PL','IT','ES'])S.cnt.cc[k]={d:1,since:0};S.stats.peak=LV_REQ[4].pk-1e-6");
  assert.equal(ev("custLevel()"), 5, '5,999.999999 Gbps of a 6 Tbps mark');
  ev("S.stats.peak=LV_REQ[4].pk-5");
  assert.equal(ev("custLevel()"), 4, 'but not 5 Gbps short');
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A level-5 Streaming service in Frankfurt with a big origin, live in Germany.
const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;S.lvl=5;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.cnt.dc[S.home].t=3;compute()");
  return page;
};

test('a rights agent offers a ridiculous live event, priced by the audience it reaches', () => {
  const { ev, errors } = start();
  ev("S.cnt.rnext=S.day;evDay(S.day)");
  assert.equal(ev("S.cnt.roff.length"), 1);
  const o = JSON.parse(ev("JSON.stringify(S.cnt.roff[0])"));
  assert.equal(o.reg, 'EU');
  assert.ok(o.mul >= 3 && o.fee >= 25000 && o.day > ev('S.day'));
  assert.match(ev("cntCard()"), /Buy rights/);
  ev("ACT.cntRightsNo({id:S.cnt.roff[0].id})");
  assert.equal(ev("S.cnt.roff.length"), 0);
  assert.deepEqual(errors, []);
});

test('a bought event multiplies the evening, beats the boxes, and pays off when it streams clean', () => {
  const { ev, errors } = start();
  ev("S.cnt.rnext=S.day;evDay(S.day);ACT.cntRights({id:S.cnt.roff[0].id})");
  assert.equal(ev("S.cnt.evs.length"), 1);
  const base = ev("S.cnt.cc.DE.d"), mul = ev("S.cnt.evs[0].mul"), gain = ev("S.cnt.evs[0].gain");
  ev("S.day=S.cnt.evs[0].day;compute()");
  assert.ok(Math.abs(ev("R.cnt.cc.DE.D") - base * mul) < 1e-6);
  assert.equal(ev("evLiveAt('EU')"), true);
  ev("S.cnt.cc.DE.d=1;compute();S.day--;for(let i=0;i<3;i++)dayTick()");
  assert.equal(ev("S.cnt.evs.length"), 0);
  assert.equal(ev("S.cnt.evOk"), 1);
  assert.equal(ev("S.done.ct_event!==undefined"), true);
  assert.ok(gain > 0);
  assert.deepEqual(errors, []);
});

test('the network is in a change freeze from two days before an event until it ends', () => {
  const { ev, errors } = start();
  ev("S.cnt.evs.push({id:'e',n:0,reg:'EU',mul:3,gain:0.2,fee:0,day:S.day+5,w:1})");
  assert.equal(ev("cntFrozen()"), null);
  ev("S.day+=3");
  assert.ok(ev("cntFrozen()"));
  const n = ev("S.transit.length");
  ev("ACT.buyTransit({city:S.home,net:'lvl',tier:1});ACT.buildPop({city:'ams'})");
  assert.equal(ev("S.transit.length"), n, 'no new transit');
  assert.equal(ev("!!S.pops.ams"), false, 'no new POP');
  assert.match(ev("cntCard()"), /Change freeze/);
  ev("S.cnt.prem=null;S.cnt.cc.DE.d=5;compute();ACT.cntLaunch({cc:'FR'})");
  assert.equal(ev("!!S.cnt.cc.FR"), true, 'launching a country is no network change');
  ev("S.day+=4");
  assert.equal(ev("cntFrozen()"), null);
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev("!!S.pops.ams"), true);
  assert.deepEqual(errors, []);
});

test('a classic network never freezes, and old streaming saves load without events', () => {
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;ACT.buildPop({city:'ams'})");
  assert.equal(g.ev("cntFrozen()"), null);
  assert.equal(g.ev("!!S.pops.ams"), true);
  const { ev, errors } = start();
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.cnt.evs;delete s.cnt.roff;sanitize(s);return s.cnt.evs.length+s.cnt.roff.length;})()"), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(g.errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A level-6 Streaming service in Frankfurt, live in Germany, with a second big origin in Amsterdam.
const start = (o = {}) => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;S.lvl=6;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1})");
  if (o.two) page.ev("ACT.buildPop({city:'ams'});ACT.buyTransit({city:'ams',net:'cog',tier:1});S.cnt.dc[S.home].t=3;S.cnt.dc.ams={t:3,ready:0}");
  page.ev("S.day=100;compute()");
  return page;
};
const box = "S.cnt.box.push({id:'b1',city:S.home,net:boxNets(S.home)[0].id,day:0,f:1})";

test('an origin goes dark: its countries fall back to the other origin, and a rush repair brings it back', () => {
  const { ev, errors } = start({ two: true });
  const g = ev("S.cnt.cc.DE.d");
  const i = JSON.parse(ev("JSON.stringify(cntIncFire('org'))"));
  assert.equal(i.type, 'cntorg');
  assert.ok(i.until > ev('S.day') && i.cost > 0 && i.msg.length > 10);
  assert.equal(ev("incTitle('cntorg')"), 'Origin down');
  ev("compute()");
  const other = i.ref === 'ams' ? 'fra' : 'ams';
  assert.equal(ev(`R.cnt.org['${i.ref}']`), 0, 'the dark origin serves nothing');
  assert.ok(Math.abs(ev(`R.cnt.org['${other}']`) - g) < 1e-6, 'the other origin takes its viewers');
  assert.equal(ev("R.cnt.short"), 0);
  assert.match(ev(`streamHere('${i.ref}')`), /Origin down/);
  ev(`ACT.fixInc({id:'${i.id}'})`);
  assert.equal(ev("S.inc.length"), 0);
  assert.equal(ev("S.cnt.ic.org"), 1);
  assert.deepEqual(errors, []);
});

test('with one origin dark, its viewers go short until the day tick resolves it', () => {
  const { ev, errors } = start();
  ev("cntIncFire('org');compute()");
  assert.ok(ev("R.cnt.short") > 0, 'nobody else can serve Germany');
  assert.match(ev("cntCard()"), /buffering|full/i);
  ev("for(let i=0;i<4;i++)dayTick()");
  assert.equal(ev("S.inc.some(i=>i.type==='cntorg')"), false);
  assert.equal(ev("R.cnt.short"), 0);
  assert.deepEqual(errors, []);
});

test('a bad cache push empties the boxes on a continent, and they stay empty until it is rolled back', () => {
  const { ev, errors } = start();
  ev(box);
  const i = JSON.parse(ev("JSON.stringify(cntIncFire('push'))"));
  assert.equal(i.type, 'cntpush');
  assert.equal(i.reg, 'EU');
  assert.ok(ev("S.cnt.box[0].f") <= 0.1);
  ev("S.rules.chaos='none';dayTick()");
  assert.ok(ev("S.cnt.box[0].f") <= 0.1, 'the push repeats every night while it is live');
  ev(`ACT.fixInc({id:'${i.id}'})`);
  ev("dayTick()");
  assert.ok(ev("S.cnt.box[0].f") > 0.1, 'rolled back, the box fills overnight');
  assert.deepEqual(errors, []);
});

test("a live event's first night melts an origin too small for it: half speed until it is over", () => {
  const { ev, errors } = start();
  ev("S.rules.chaos='spicy';S.cnt.cc.DE.d=300;S.cnt.evs.push({id:'e',n:0,reg:'EU',mul:3,gain:0.2,fee:0,day:S.day,w:1});compute()");
  assert.ok(ev("R.cnt.short") > 0.5, 'the starter cage cannot carry it');
  assert.equal(ev("cntMeltDay(S.day,chaosMul())"), 1);
  const i = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='cntmelt'))"));
  assert.equal(i.ref, ev('S.home'));
  assert.equal(i.until, ev('S.day') + ev('EV_DAYS'));
  ev("compute()");
  assert.ok(Math.abs(ev("R.cnt.org[S.home]") - ev("DC_T[0].g") * 0.5) < 1e-6);
  assert.equal(ev("cntMeltDay(S.day,chaosMul())"), 0, 'one meltdown per origin at a time');
  assert.equal(ev("BADGES.find(b=>b.id==='cnt_melt').ok()"), true);
  assert.deepEqual(errors, []);
});

test('streaming outages follow the chaos rule and the gentle start', () => {
  const { ev, errors } = start({ two: true });
  ev(box);
  const run = (chaos, from, to) => ev(`(()=>{S.inc=[];S.rules.chaos='${chaos}';for(let d=${from};d<${to};d++){S.day=d;cntIncDay(d);}return S.inc.filter(i=>i.type.startsWith('cnt')).length;})()`);
  assert.equal(run('none', 45, 1045), 0, 'no chaos, no outages');
  assert.equal(run('spicy', 1, 45), 0, 'nothing before day 45');
  const calm = run('calm', 45, 1045), spicy = run('spicy', 45, 1045);
  assert.ok(spicy > 0 && spicy > calm, `spicy (${spicy}) breaks more than calm (${calm})`);
  assert.deepEqual(errors, []);
});

test('a carrier never gets streaming outages, and old streaming saves load', () => {
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;S.day=100");
  assert.equal(g.ev("cntIncFire('org')"), null);
  assert.deepEqual(g.errors, []);
  const { ev, errors } = start({ two: true });
  // A save from before the outages, with a stray outage pointing at a city with no origin.
  const s = ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.cnt.ic;s.inc.push({id:'x',type:'cntorg',ref:'lon',until:s.day+2,cost:1,msg:'?'},{id:'y',type:'cntorg',ref:'ams',until:s.day+2,cost:1,msg:'ok'});sanitize(s);return JSON.stringify({ic:s.cnt.ic,inc:s.inc.map(i=>i.id)});})()");
  assert.deepEqual(JSON.parse(s), { ic: { org: 0, push: 0, melt: 0 }, inc: ['y'] });
  assert.deepEqual(errors, []);
});

test('outages show on a phone: the NOC list and the city tab with the rush repair', () => {
  const { ev, dom, errors } = start({ two: true });
  ev("window.innerWidth=360;cntIncFire('org');UI.left='noc';renderAll()");
  assert.match(dom.window.document.body.innerHTML, /Origin down/);
  assert.match(ev("streamHere(S.inc[0].ref)"), /USB stick/);
  assert.deepEqual(errors, []);
});

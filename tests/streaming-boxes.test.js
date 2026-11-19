const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A Streaming service in Frankfurt, live in Germany with enough viewers for the ISPs to want boxes.
const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.lvl=5;S.cnt.cc.DE.d=300;compute()");
  return page;
};
// What R says left the network, by kind, against what it says was served.
const egSum = "Object.values(R.egT).reduce((a,x)=>a+x,0)-(R.egT.l2||0)";

test('a box goes into an ISP in a city with no POP of yours and serves its hits right there', () => {
  const { ev, errors } = start();
  assert.equal(ev("!!S.pops.muc"), false);
  assert.equal(ev("boxWhy('muc','dtk')"), '', 'Doitsche Telekomm racks it in Munich, no POP needed');
  const t0 = ev("R.egT.t"), s0 = ev("R.served"), q0 = ev("ccQ(R,'DE')");
  ev("ACT.cntBox({city:'muc',net:'dtk',d:1})");
  assert.equal(ev("S.cnt.box.length"), 1);
  assert.equal(ev("!!S.pops.muc"), false, 'still no POP');
  const id = ev("S.cnt.box[0].id"), use = ev(`R.useCache['${id}']`);
  assert.ok(use > 0, 'the box serves');
  assert.ok(Math.abs(ev("R.cnt.ins.c") - use) < 1e-9);
  assert.ok(Math.abs(ev("R.egT.c") - use) < 1e-9, 'counted as leaving through a box');
  assert.ok(Math.abs(ev("R.netEg.dtk.c") - use) < 1e-9);
  // What the box serves either leaves transit or is served on top of a full port.
  assert.ok(Math.abs(ev("R.served") - s0 + t0 - ev("R.egT.t") - use) < 1e-6, 'taken off transit or added to what was served');
  assert.ok(Math.abs(ev("R.served") - ev(egSum)) < 1e-6, 'served still adds up by exit kind');
  assert.ok(ev("R.served") <= ev("R.demand") + 1e-9);
  assert.ok(ev("onNet(R)") > 0);
  assert.equal(ev("R.cnt.cc.DE.parts.some(p=>p[0]==='muc'&&p[4]===1)"), true);
  assert.ok(ev("ccQ(R,'DE')") > q0, 'served in full, it lifts the picture');
  assert.equal(ev("R.useCache[S.cnt.box[0].id]>0&&!S.pops.muc&&!(S.links.length)"), true);
  assert.deepEqual(errors, []);
});

test('a box inside an ISP is capped by its size and by a dispute; the rest comes from the origin', () => {
  const { ev, errors } = start();
  ev("S.cnt.cc.DE.d=3000;S.cnt.dc[S.home].t=3;S.cnt.box.push({id:'m1',city:'muc',net:'dtk',day:0,f:1});compute()");
  assert.ok(Math.abs(ev("R.useCache.m1") - ev('BOX_G')) < 1e-6, 'runs full');
  ev("S.cnt.disp={net:'dtk',fee:20000,day:S.day,camp:0,cut:0.5};compute()");
  assert.ok(Math.abs(ev("R.useCache.m1") - ev('BOX_G*0.5')) < 1e-6, 'a dispute squeezes it too');
  assert.ok(Math.abs(ev("R.served") - ev(egSum)) < 1e-6);
  assert.deepEqual(errors, []);
});

test('it fills over peering with that ISP, else slowly over transit, else not at all', () => {
  const { ev, errors } = start();
  ev("ACT.cntBox({city:'muc',net:'dtk',d:1})");
  const f0 = ev('FILL_NEW');
  assert.equal(ev("S.cnt.box[0].f"), f0);
  ev("dayTick()");
  assert.ok(Math.abs(ev("S.cnt.box[0].f") - (f0 + ev('FILL_T'))) < 1e-9, 'transit only: slowly');
  ev("S.cnt.box[0].f=0.25;S.pni.push({id:'pd',city:S.home,net:'dtk',tier:1,n:1,ready:0});compute()");
  assert.equal(ev("boxPeers().has('dtk')"), true);
  ev("for(const f of CNT_DAY)f(S.day)");
  assert.ok(Math.abs(ev("S.cnt.box[0].f") - (0.25 + ev('FILL_NET'))) < 1e-9, 'over the PNI: fast');
  // Nothing to fill it with: no new box there.
  ev("S.pni=[];S.transit=[];compute()");
  assert.match(ev("boxWhy('ham','dtk')"), /Nothing could fill it/);
  ev("S.cnt.box[0].f=0.25;for(const f of CNT_DAY)f(S.day)");
  assert.equal(ev("S.cnt.box[0].f"), 0.25);
  assert.deepEqual(errors, []);
});

test('Must-Carry counts boxes hosted for free in cities with no POP', () => {
  const { ev, errors } = start();
  ev("S.cnt.box.push({id:'k1',city:'ams',net:'kpn',day:0,f:1})");
  assert.equal(ev("!!S.pops.ams"), false);
  assert.equal(ev("mcFree().cc"), 1, 'the Netherlands counts');
  ev("S.cnt.box.push({id:'d1',city:'muc',net:'dtk',day:0,f:1})");
  assert.equal(ev("mcFree().cc"), 1, 'a paid host does not');
  assert.deepEqual(errors, []);
});

// Amsterdam with a link home, an exchange port and the route server: KPN takes your routes there.
const withIx = () => {
  const page = start();
  page.ev("ACT.buildPop({city:'ams'});UI.pending={a:S.home,b:'ams'};ACT.buildLink({tier:1});ACT.buyIx({city:'ams',tier:1});ACT.rs({city:'ams'});ACT.cntLaunch({cc:'NL'});S.cnt.cc.NL.d=200;compute()");
  return page;
};

test('a box on the exchange serves the members you have a session with, holding less than one inside', () => {
  const { ev, errors } = withIx();
  assert.equal(ev("ixSessions('ams').has('kpn')"), true);
  assert.match(ev("xboxWhy('ams~2')"), /Get a port/);
  ev("S.lvl=3");
  assert.match(ev("xboxWhy('ams')"), /level/);
  ev("S.lvl=5");
  assert.equal(ev("xboxWhy('ams')"), '');
  const cash = ev("S.cash");
  ev("ACT.cntXbox({ix:'ams',d:1})");
  assert.equal(ev("S.cash"), cash - ev('XBOX_COST'));
  ev("S.cnt.xbox[0].f=1;compute()");
  const id = ev("S.cnt.xbox[0].id"), use = ev(`R.useCache['${id}']`);
  assert.ok(use > 0);
  assert.ok(Math.abs(ev("R.cnt.ins.ix") - use) < 1e-9);
  assert.ok(ev("R.netEg.kpn.ix") >= use - 1e-9);
  assert.equal(ev("R.netEg.vdp?R.netEg.vdp.ix>0&&!ixSessions('ams').has('vdp'):false"), false, 'no session, no service');
  // It holds XBOX_F of what an embedded box would: KPN's part of the Netherlands times that.
  const kpnW = ev("ccInfo('NL').nets.find(([j])=>NETS[j].id==='kpn')[1]"), D = ev("R.cnt.cc.NL.D");
  assert.ok(Math.abs(use - D * kpnW * ev("boxHit('ams')*XBOX_F")) < 1e-6);
  assert.ok(Math.abs(ev("R.served") - ev(egSum)) < 1e-6);
  assert.ok(ev("R.cost.content") >= ev("DC_T[0].mo+BOX_MO*0+XBOX_MO"));
  // KPN with a box of yours inside skips the exchange box.
  ev("S.cnt.box.push({id:'k1',city:'ams',net:'kpn',day:0,f:1});compute()");
  assert.equal(ev(`R.useCache['${id}']||0`), 0);
  // An exchange outage or a cancelled port silences it; it stays and naps.
  ev("S.cnt.box=[];S.ev.ixdown={ams:S.day+5};compute()");
  assert.equal(ev(`R.useCache['${id}']||0`), 0);
  ev("S.ev.ixdown={};ACT.cntXbox({ix:'ams',d:-1})");
  assert.equal(ev("S.cnt.xbox.length"), 0);
  assert.deepEqual(errors, []);
});

test('exchange boxes fill over your backbone and empty with a new catalogue', () => {
  const { ev, errors } = withIx();
  ev("ACT.cntXbox({ix:'ams',d:1});dayTick()");
  assert.ok(Math.abs(ev("S.cnt.xbox[0].f") - (ev('FILL_NEW') + ev('FILL_NET'))) < 1e-9);
  ev("S.cnt.xbox[0].f=1;S.lvl=13;ACT.cntCat({})");
  assert.ok(ev("S.cnt.xbox[0].f") < 1);
  assert.equal(ev("prefillCost()"), 5000 + 3000);
  assert.deepEqual(errors, []);
});

test('saves keep boxes without a POP and exchange boxes, and repair the rest; old saves load', () => {
  const { ev, errors } = start();
  ev("S.cnt.box.push({id:'in',city:'muc',net:'dtk',day:0,f:0.5},{id:'no',city:'muc',net:'vdp',day:0},{id:'far',city:'nyc',net:'dtk',day:0});S.cnt.xbox.push({id:'x1',ix:'ams',day:0,f:2},{id:'x2',ix:'nowhere',day:0})");
  const c = JSON.parse(ev("(()=>{const s=JSON.parse(JSON.stringify(S));sanitize(s);return JSON.stringify(s.cnt);})()"));
  assert.deepEqual(c.box.map(b => b.id), ['in']);
  assert.deepEqual(c.xbox.map(b => b.id), ['x1']);
  assert.equal(c.xbox[0].f, 1);
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.cnt.xbox;sanitize(s);return JSON.stringify(s.cnt.xbox);})()"), '[]');
  assert.equal(ev("JSON.stringify(cntNew().xbox)"), '[]');
  assert.deepEqual(errors, []);
});

test('the Streaming tab offers both kinds, with and without a POP, also on a phone', () => {
  const { ev, errors } = withIx();
  ev("S.cnt.box.push({id:'m1',city:'muc',net:'dtk',day:0,f:0.5});compute()");
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};UI.sel={t:'city',id:'muc'};UI.tab='cust';renderAll()`);
    const h = ev("cityPanel('muc')");
    assert.match(h, /Binge Boxes/);
    assert.match(h, /No POP of yours here/);
    assert.match(h, /fills over transit, slowly/);
    assert.match(h, /data-act="cntBox"/);
    const a = ev("UI.tab='cust';cityPanel('ams')");
    assert.match(a, /Exchange boxes/);
    assert.match(a, /data-act="cntXbox"/);
    assert.match(a, /home ISP/);
  }
  assert.deepEqual(errors, []);
});

test('the classic game has no boxes outside routing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:S.home});ACT.buyTransit({city:S.home,net:'cog',tier:1});compute()");
  assert.equal(ev("R.cnt"), undefined);
  assert.ok(Math.abs(ev("R.served") - ev(egSum)) < 1e-6);
  assert.deepEqual(errors, []);
});

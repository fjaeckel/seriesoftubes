const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A Streaming service in Frankfurt, live in Germany, with transit at home and plenty of cash.
const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});compute()");
  return page;
};

test('the charter starts a Streaming service with a starter origin at home and no Tier 1', () => {
  const { ev, errors } = start();
  assert.equal(ev("charter()"), 'content');
  assert.equal(ev("S.cnt.dc[S.home].t"), 0);
  assert.equal(ev("Object.keys(S.cnt.cc).join()"), 'DE');
  assert.equal(ev("goals()===CONTENT_GOALS"), true);
  assert.equal(ev("S.done.ct_launch!==undefined"), true);
  // Everything that makes a carrier: no Tier 1, no home broadband, no customers calling.
  ev("S.transit=[];for(const n of t1Need())S.pni.push({id:'x'+n.id,city:S.home,net:n.id,tier:1,n:1});compute()");
  assert.equal(ev("isTier1()"), false);
  assert.equal(ev("t1Card()"), '');
  ev("ACT.launchBB({city:S.home})");
  assert.equal(ev("S.pops[S.home].bb"), null);
  ev("for(let i=0;i<30;i++)spawnOffer()");
  assert.equal(ev("S.offers.length"), 0);
  assert.match(ev("tierLabel()"), /^On-net/);
  assert.deepEqual(errors, []);
});

test('subscribers are served from the origin and pay for it', () => {
  const { ev, errors } = start();
  const d = ev("S.cnt.cc.DE.d");
  assert.ok(d > 0);
  assert.ok(Math.abs(ev("R.cnt.org[S.home]") - d) < 1e-6, 'Germany is served from Frankfurt');
  assert.ok(ev("R.served") > 0);
  assert.ok(Math.abs(ev("R.rev.eyeballs") - d * ev('CNT_RATE') * ev("ccQ(R,'DE')")) < 1e-6);
  assert.ok(ev("R.cost.content") >= ev("DC_T[0].mo"));
  ev("for(let i=0;i<20;i++)dayTick()");
  assert.ok(ev("S.cnt.cc.DE.d") > d, 'well served subscribers grow');
  assert.deepEqual(errors, []);
});

test('an origin with no way out serves nobody, and a full origin leaves viewers short', () => {
  const { ev, errors } = start();
  ev("S.transit=[];compute()");
  assert.equal(ev("R.served"), 0);
  assert.equal(ev("ccQ(R,'DE')"), 0);
  ev("ACT.buyTransit({city:S.home,net:'cog',tier:1});S.cnt.cc.DE.d=1000;compute()");
  assert.ok(Math.abs(ev("R.cnt.short") - (1000 - ev("DC_T[0].g"))) < 1e-6);
  assert.ok(ev("ccQ(R,'DE')") < 0.9);
  assert.deepEqual(errors, []);
});

test('origins are big builds in big metros, capped by level, and keep serving while they grow', () => {
  const { ev, errors } = start();
  const cash = ev('S.cash');
  ev("ACT.cntDc({city:S.home})");
  assert.equal(ev("S.cash"), cash - ev("DC_T[1].cost"));
  assert.equal(ev("S.cnt.dc[S.home].up.t"), 1);
  ev("compute()");
  assert.ok(ev("R.cnt.org[S.home]") > 0, 'the starter cage serves during the build');
  ev("S.day=S.cnt.dc[S.home].up.ready-1;dayTick()");
  assert.equal(ev("S.cnt.dc[S.home].t"), 1);
  // A second origin needs level 3; a small town is no data-center metro.
  ev("ACT.buildPop({city:'nyc'});ACT.cntDc({city:'nyc'})");
  assert.equal(ev("S.cnt.dc.nyc"), undefined);
  ev("S.lvl=3;ACT.cntDc({city:'nyc'})");
  assert.equal(ev("S.cnt.dc.nyc.t"), 1);
  assert.equal(ev("dcSite(CITIES.filter(c=>!c.cn).sort((a,b)=>a.P-b.P)[0].id)"), false);
  assert.deepEqual(errors, []);
});

test('far viewers get a worse picture until an origin is near them', () => {
  const { ev, errors } = start();
  ev("ACT.cntLaunch({cc:'US'});compute()");
  const far = ev("ccQ(R,'US')");
  assert.ok(far < 0.9, 'served across the Atlantic, too poor to grow: ' + far);
  ev("S.lvl=3;ACT.buildPop({city:'nyc'});ACT.buyTransit({city:'nyc',net:'cog',tier:1});ACT.cntDc({city:'nyc'});S.cnt.dc.nyc.ready=S.day;compute()");
  assert.ok(ev("ccQ(R,'US')") > far);
  assert.equal(ev("R.cnt.cc.US.parts[0][0]"), 'nyc');
  assert.deepEqual(errors, []);
});

test('a Binge Box serves its network from inside it, on-net', () => {
  const { ev, errors } = start();
  ev("S.lvl=5;S.cnt.cc.DE.d=300;compute()");
  assert.equal(ev("boxWhy(S.home,'dtk')"), '');
  ev("ACT.cntBox({city:S.home,net:'dtk',d:1})");
  assert.equal(ev("S.cnt.box.length"), 1);
  ev("compute()");
  assert.ok(ev("R.egT.c") > 0, 'the box carries traffic');
  assert.ok(ev("onNet(R)") > 0);
  assert.ok(ev("R.cost.content") > ev("DC_T[0].mo") + ev("BOX_MO"), 'Doitsche Telekomm charges to host it');
  // Somewhere the network sells no homes, or before it wants you, no box.
  assert.notEqual(ev("boxWhy('nyc','dtk')"), '');
  ev("ACT.cntBox({city:S.home,net:'dtk',d:-1})");
  assert.equal(ev("S.cnt.box.length"), 0);
  assert.deepEqual(errors, []);
});

test('a premiere is announced, doubles the evening and is judged on its nights', () => {
  const { ev, errors } = start();
  ev("S.lvl=3;S.cnt.premNext=S.day+1;dayTick()");
  assert.equal(ev("S.cnt.prem.reg"), 'EU');
  const base = ev("S.cnt.cc.DE.d");
  ev("S.day=S.cnt.prem.day-1;dayTick()");
  assert.ok(ev("R.cnt.cc.DE.D") > base * 2, 'premiere night demand');
  ev("for(let i=0;i<3;i++)dayTick()");
  assert.equal(ev("S.cnt.prem"), null);
  assert.equal(ev("S.cnt.premOk"), 1);
  assert.equal(ev("S.done.ct_prem!==undefined"), true);
  assert.deepEqual(errors, []);
});

test('a dispute halves what you have with that network until you pay or win', () => {
  const { ev, errors } = start();
  ev("S.lvl=5;S.cnt.cc.DE.d=300;compute();ACT.cntBox({city:S.home,net:'dtk',d:1});compute()");
  ev("S.cnt.disp={net:'dtk',fee:20000,day:S.day,camp:0};compute()");
  assert.equal(ev("disputeNet()"), 'dtk');
  assert.ok(ev("R.useCache[S.cnt.box[0].id]") <= ev("BOX_G*DISP_CUT") + 1e-6);
  ev("ACT.cntCamp({})");
  ev("window.__reseed(1);S.cnt.cc.DE.d=ccPot('DE');S.day=S.cnt.disp.camp;cntDispDay(S.day)");
  const won = ev("S.cnt.wins") === 1;
  if (won) assert.equal(ev("!!S.cnt.free.dtk&&boxFree(NET.dtk)&&paidFree(NET.dtk)"), true);
  else { ev("ACT.cntPay({})"); assert.ok(ev("S.cnt.paid.dtk") > 20000); }
  assert.equal(ev("S.cnt.disp"), null);
  assert.deepEqual(errors, []);
});

test('Must-Carry needs free boxes in 10 countries on 5 continents, a global premiere and 80% on-net', () => {
  const { ev, errors } = start();
  assert.equal(ev("mustCarry()"), false);
  ev(`S.lvl=13;const hosts=[];for(const C of CITIES){if(hosts.length>=12)break;if(C.cn||hosts.some(h=>CITY[h.c].cc===C.cc))continue;const n=boxNets(C.id).find(n=>n.pol==='open'||n.pol==='selective');if(n)hosts.push({c:C.id,n:n.id});}
    for(const h of hosts){S.pops[h.c]=S.pops[h.c]||{day:0,bb:null,boost:0,down:0,routers:1,gen:false};S.cnt.box.push({id:uid(),city:h.c,net:h.n,day:0});}`);
  assert.ok(ev("mcFree().cc") >= 10);
  ev("S.cnt.premAll=1");
  assert.equal(ev("mustCarry()"), ev("mcFree().reg>=MC_REG&&onNet(R)>=MC_ON"));
  ev("R.egT.c=R.served*0.9;R.egT.p=0");
  if (ev("mcFree().reg") >= 5) { ev("checkGoals()"); assert.ok(ev("S.cnt.won") > 0); }
  assert.deepEqual(errors, []);
});

test('saves keep a Streaming service and repair what is broken; other charters carry no S.cnt', () => {
  const { ev, errors } = start();
  ev("S.cnt.box.push({id:'b1',city:S.home,net:'dtk',day:0},{id:'b2',city:'nyc',net:'dtk',day:0},{id:'b3',city:S.home,net:'nope',day:0});S.cnt.cc.ZZ={d:5};S.cnt.cc.CN={d:5};S.cnt.dc[S.home].up={t:1,ready:99};S.cnt.cat=99");
  const back = ev("(()=>{const s=JSON.parse(JSON.stringify(S));sanitize(s);return JSON.stringify(s.cnt);})()");
  const c = JSON.parse(back);
  assert.deepEqual(c.box.map(b => b.id), ['b1']);
  assert.deepEqual(Object.keys(c.cc), ['DE']);
  assert.equal(c.dc[ev('S.home')].up.t, 1);
  assert.equal(c.cat, ev('CAT_T.length-1'));
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));s.charter='global';sanitize(s);return s.cnt;})()"), undefined);
  // An old save, from before streaming, loads as it was.
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.cnt;s.charter='broker';sanitize(s);return s.cnt;})()"), undefined);
  assert.deepEqual(errors, []);
});

test('the Streaming tab and card render, also on a phone', () => {
  const { ev, dom, errors } = start();
  ev("S.lvl=5;S.cnt.prem={day:S.day+5,reg:'EU',n:0,pf:0,w:1};S.cnt.disp={net:'vdp',fee:9000,day:S.day,camp:0};compute()");
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};UI.sel={t:'city',id:S.home};UI.tab='cust';renderAll()`);
    const h = ev("cityPanel(S.home)");
    assert.match(h, /Viewers in/);
    assert.match(h, /Origin data center/);
    assert.match(h, /Binge Boxes/);
    const card = ev("cntCard()");
    assert.match(card, /Must-Carry/);
    assert.match(card, /premieres in/);
    assert.match(card, /Tell your viewers/);
  }
  assert.match(ev("cityPanel('nyc')"), /Launch in/);
  assert.ok(dom.window.document.body.innerHTML.length > 0);
  assert.deepEqual(errors, []);
});

test('a new country rides the backbone to your POP near its viewers and leaves there (cold potato)', () => {
  const { ev, errors } = start();
  ev("ACT.buildPop({city:'ams'});UI.pending={a:S.home,b:'ams'};ACT.buildLink({tier:1});ACT.buyTransit({city:'ams',net:'cog',tier:1});ACT.cntLaunch({cc:'NL'});compute()");
  assert.equal(ev("R.cnt.cc.NL.parts[0][0]"), 'ams', 'delivered from Amsterdam, not the Frankfurt origin');
  assert.equal(ev("R.cnt.org[S.home]>=R.cnt.cc.NL.D"), true, 'still served by the Frankfurt origin');
  const link = ev("S.links[0].id"), nl = ev("R.cnt.cc.NL.D");
  assert.ok(ev(`R.load['${link}']`) >= nl - 1e-6, 'the haul loads the backbone');
  assert.ok(ev("R.useT[S.transit.find(t=>t.city==='ams').id]") > 0, 'and leaves in Amsterdam');
  assert.ok(ev("Math.abs(R.cnt.haul.ams.got-R.cnt.haul.ams.g)") < 1e-6);
  // A full backbone loses what it cannot carry.
  ev("S.cnt.cc.NL.d=200;compute()");
  assert.ok(ev("R.cnt.haul.ams.got") < ev("R.cnt.haul.ams.g"));
  assert.ok(ev("ccQ(R,'NL')") < 0.9);
  assert.deepEqual(errors, []);
});

test('home networks on an exchange take a streaming service from the route server; paid incumbents still want a PNI', () => {
  const { ev, errors } = start();
  ev("ACT.buildPop({city:'ams'});UI.pending={a:S.home,b:'ams'};ACT.buildLink({tier:1});ACT.buyIx({city:'ams',tier:1});ACT.cntLaunch({cc:'NL'});compute()");
  assert.equal(ev("R.egT.ix||0"), 0, 'no sessions before the route server');
  ev("ACT.rs({city:'ams'});compute()");
  assert.equal(ev("ixSessions('ams').has('kpn')"), true);
  assert.equal(ev("ixSessions('ams').has('vdp')"), false);
  assert.ok(ev("R.egT.ix") > 0, 'traffic leaves over the exchange');
  assert.deepEqual(errors, []);
});

// Frankfurt at level 13 with Germany big enough for Doitsche Telekomm to take a box.
const withBox = () => {
  const page = start();
  page.ev("S.lvl=13;S.cnt.cc.DE.d=300;compute();ACT.cntBox({city:S.home,net:'dtk',d:1});compute()");
  return page;
};

test('a new box starts nearly empty and fills overnight; new titles empty it a little', () => {
  const { ev, errors } = withBox();
  assert.equal(ev("S.cnt.box[0].f"), ev('FILL_NEW'));
  const use0 = ev("R.useCache[S.cnt.box[0].id]");
  ev("for(let i=0;i<4;i++)dayTick()");
  assert.equal(ev("S.cnt.box[0].f"), 1, 'filled from the origin in its own city');
  assert.ok(ev("R.useCache[S.cnt.box[0].id]") > use0, 'a full box holds more of the evening');
  ev("ACT.cntCat({})");
  assert.ok(ev("S.cnt.box[0].f") < 1);
  // A box at a POP with no backbone to an origin and no transit never fills.
  ev("ACT.buildPop({city:'ams'});S.cnt.box.push({id:'far',city:'ams',net:'kpn',day:S.day,f:0.25});compute();cntFillDay(S.day)");
  assert.equal(ev("S.cnt.box[1].f"), 0.25);
  ev("ACT.buyTransit({city:'ams',net:'cog',tier:1});cntFillDay(S.day)");
  assert.ok(Math.abs(ev("S.cnt.box[1].f") - 0.35) < 1e-9, 'over transit only, slowly');
  assert.deepEqual(errors, []);
});

test('a full box spills the rest of its network to the next exit', () => {
  const { ev, errors } = withBox();
  ev("S.cnt.box[0].f=1;S.cnt.cc.DE.d=2000;S.cnt.dc[S.home].t=3;compute()");
  assert.ok(ev("R.useCache[S.cnt.box[0].id]") >= ev('BOX_G') - 1e-6, 'the box runs full');
  assert.ok(ev("(R.egT.t||0)") > 0, 'and the rest leaves elsewhere');
  assert.deepEqual(errors, []);
});

test('a live event cannot be pre-filled and lands on the origins', () => {
  const { ev, errors } = withBox();
  ev("S.cnt.box[0].f=1;S.cnt.dc[S.home].t=3;compute()");
  const org = ev("R.cnt.org[S.home]");
  ev("S.cnt.prem={day:S.day,reg:'EU',n:0,pf:0,w:1,live:1};ACT.cntPrefill({});compute()");
  assert.equal(ev("S.cnt.prem.pf"), 0, 'nothing to pre-fill');
  assert.ok(ev("R.cnt.org[S.home]") > org * 3, 'the origin carries the event');
  ev("S.cnt.prem={day:S.day+5,reg:'EU',n:0,pf:0,w:1,live:0};ACT.cntPrefill({})");
  assert.equal(ev("S.cnt.prem.pf"), 1, 'a series premiere can be');
  assert.deepEqual(errors, []);
});

test('a dispute freezes the ports: worse every evening, then a slow recovery after paying', () => {
  const { ev, errors } = withBox();
  ev("S.cnt.box[0].f=1;S.cnt.disp={net:'dtk',fee:20000,day:S.day,camp:0,cut:1};compute()");
  assert.equal(ev("cntCut('dtk')"), 1);
  ev("for(let i=0;i<10;i++)cntDispDay(S.day)");
  assert.ok(Math.abs(ev("cntCut('dtk')") - 0.75) < 1e-9);
  ev("for(let i=0;i<30;i++)cntDispDay(S.day)");
  assert.equal(ev("cntCut('dtk')"), ev('DISP_CUT'));
  ev("compute()");
  assert.ok(ev("R.useCache[S.cnt.box[0].id]") <= ev("BOX_G*DISP_CUT") + 1e-6);
  ev("ACT.pni({city:S.home,net:'dtk',tier:1})");
  assert.equal(ev("S.pni.some(p=>p.net==='dtk')"), false, 'no new PNI during a dispute');
  ev("ACT.cntPay({})");
  assert.equal(ev("cntCut('dtk')"), ev('DISP_CUT'), 'paying does not fix the ports at once');
  ev("cntFillDay(S.day)");
  assert.ok(ev("cntCut('dtk')") > ev('DISP_CUT'));
  ev("for(let i=0;i<6;i++)cntFillDay(S.day)");
  assert.equal(ev("cntCut('dtk')"), 1);
  assert.deepEqual(errors, []);
});

test('a paid deal that runs out while traffic flows rolls over at a higher price', () => {
  const { ev, errors } = withBox();
  ev("S.cnt.paid.dtk={fee:20000,until:S.day};cntDealDay(S.day)");
  assert.equal(ev("S.cnt.paid.dtk.fee"), 22000);
  ev("ACT.cntBox({city:S.home,net:'dtk',d:-1});S.cnt.paid.dtk.until=S.day;cntDealDay(S.day)");
  assert.equal(ev("S.cnt.paid.dtk"), undefined, 'disconnected in time, it simply ends');
  // Old saves kept a bare fee per network.
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(S));s.cnt.paid={dtk:9000};sanitize(s);return s.cnt.paid.dtk.fee;})()"), 9000);
  assert.deepEqual(errors, []);
});

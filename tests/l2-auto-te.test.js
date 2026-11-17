// L2 Auto-TE is opt-in: ordinary circuits keep their paths until the player enables it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier, km) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:${km},mo:1,cut:0,ready:0,trench:${lit(id)}});`;
const circuit = (id = 'c', bw = 30, from = 'nyc', to = 'ash') => `S.biz.push({id:${lit(id)},type:'l2vpn',name:'Circuit ${id}',city:${lit(from)},city2:${lit(to)},bw:${bw},rate:1,reqs:[],route:'normal',mood:100,since:0});`;
const BASE = "ACT.start({});S.cash=1e12;S.lvl=13;for(const g of GOALS)S.done[g.id]=0;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.pops={};" +
  "for(const c of ['nyc','ash','bos','chi'])S.pops[c]={day:0,bb:null,boost:0,down:0,routers:1,rgen:RG_TOP};" +
  "S.links=[];S.biz=[];S.transit=[];S.ixp={};S.pni=[];S.caches=[];S.core={lv:2,run:2,legacy:true};S.te={on:true,l2:false,day:0,script:''};" +
  wave('direct', 'nyc', 'ash', 0, 100) + wave('north', 'nyc', 'bos', 1, 60) + wave('south', 'bos', 'ash', 1, 60);
function game(t, extra = circuit()) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE + extra + 'compute();');
  return h;
}
const got = (ev, id = 'c') => ev(`R.l2[${lit(id)}]`);
const loadOn = (ev, id) => ev(`R.load[${lit(id)}]||0`);
const signature = ev => ev('JSON.stringify({l2:R.l2,lat:R.l2lat,load:R.load,node:R.nodeLoad,routes:R.l2route,split:R.l2split})');

test('installing Auto-TE leaves L2 off; old and malformed saves do not enable it', t => {
  const { ev, errors } = game(t);
  ev('S.te=null;ACT.buyTE()');
  assert.equal(ev('S.te.l2'), false);
  for (const value of [undefined, null, false, 1, 'true', {}, []]) {
    ev(`window.old=JSON.parse(JSON.stringify(S));${value === undefined ? 'delete old.te.l2;' : `old.te.l2=${lit(value)};`}sanitize(old)`);
    assert.equal(ev('old.te.l2'), false, `an imported ${JSON.stringify(value)} stays off`);
  }
  ev('old.te.l2=true;sanitize(old)');
  assert.equal(ev('old.te.l2'), true, 'the enabled preference survives sanitization');
  assert.deepEqual(errors, []);
});

test('the phone routing window toggles L2 Auto-TE and the preference survives export and reload', t => {
  const { ev, dom, errors } = game(t);
  ev('window.innerWidth=360;ACT.routingOpen()');
  const toggle = () => dom.window.document.querySelector('[data-act="teL2Toggle"]');
  assert.ok(toggle(), 'the control is in Routing & DDoS');
  assert.equal(toggle().getAttribute('aria-pressed'), 'false');
  toggle().click();
  assert.equal(ev('S.te.l2'), true);
  assert.equal(toggle().getAttribute('aria-pressed'), 'true');
  assert.equal(got(ev), 30);
  ev('S=migrate(parseSave(JSON.stringify({app:"series-of-tubes",S})).s);compute()');
  assert.equal(ev('S.te.l2'), true);
  ev('ACT.teToggle()');
  assert.equal(ev('S.te.on'), false);
  assert.equal(ev('S.te.l2'), true, 'the master switch keeps the L2 preference');
  assert.equal(got(ev), 10);
  ev('ACT.teToggle();ACT.routingOpen()');
  assert.equal(got(ev), 30);
  toggle().click();
  assert.equal(ev('S.te.l2'), false);
  assert.equal(got(ev), 10);
  assert.deepEqual(errors, []);
});

test('disabled L2 Auto-TE preserves normal, fastest and scenic allocation', t => {
  const { ev, errors } = game(t);
  for (const mode of ['normal', 'fast', 'scenic']) {
    ev(`S.biz[0].route=${lit(mode)};S.te.l2=false;compute();compute();compute()`);
    const off = signature(ev);
    ev('delete S.te.l2;compute();compute();compute()');
    assert.equal(signature(ev), off, `${mode}: old saves and disabled saves route identically`);
  }
  assert.deepEqual(errors, []);
});

test('an enabled circuit fills its shortest path and sends overflow over the available detour', t => {
  const { ev, errors } = game(t);
  assert.equal(got(ev), 10);
  ev('S.te.l2=true;compute()');
  assert.equal(got(ev), 30);
  assert.equal(loadOn(ev, 'direct'), 10);
  assert.equal(loadOn(ev, 'north'), 20);
  assert.equal(loadOn(ev, 'south'), 20);
  assert.equal(ev('R.teMoved'), 20);
  assert.equal(ev('R.l2split.c'), 2);
  assert.equal(ev('R.nodeLoad.nyc'), 30);
  assert.equal(ev('R.nodeLoad.ash'), 30);
  assert.equal(ev('R.nodeLoad.bos'), 20);
  assert.equal(ev('S.biz[0].bw'), 30, 'routing never changes the purchased bandwidth');
  const on = signature(ev);
  ev('compute();compute()');
  assert.equal(signature(ev), on, 'recomputing does not duplicate or lose traffic');
  assert.deepEqual(errors, []);
});

test('the master Auto-TE switch and backbone support both gate L2 detours', t => {
  const { ev, errors } = game(t, circuit() + 'S.te.l2=true;');
  assert.equal(got(ev), 30);
  ev('S.te.on=false;compute()');
  assert.equal(got(ev), 10);
  assert.equal(ev('R.teMoved'), 0);
  ev('S.te.on=true;S.core={lv:2,run:1};compute()');
  assert.equal(ev('coreTE()'), false);
  assert.equal(got(ev), 10);
  ev('S.core.run=2;compute()');
  assert.equal(got(ev), 30);
  assert.deepEqual(errors, []);
});

test('L2 Auto-TE can use several residual paths and aggregates parallel links', t => {
  const { ev, errors } = game(t, circuit('c', 170) + 'S.te.l2=true;' + wave('parallel', 'nyc', 'ash', 0, 100) + wave('west', 'nyc', 'chi', 1, 70) + wave('east', 'chi', 'ash', 1, 70));
  assert.equal(got(ev), 170);
  assert.equal(loadOn(ev, 'direct') + loadOn(ev, 'parallel'), 20);
  assert.equal(loadOn(ev, 'north'), 100);
  assert.equal(loadOn(ev, 'west'), 50);
  assert.equal(ev('R.l2split.c'), 3);
  assert.equal(ev('R.teMoved'), 150);
  assert.deepEqual(errors, []);
});

test('detours do not steer circuits through a router outside the running core', t => {
  const { ev, errors } = game(t, circuit() + 'S.te.l2=true;S.core={lv:2,run:2};S.pops.bos.rgen=0;');
  assert.equal(ev("inCore('bos')"), false);
  assert.equal(got(ev), 10);
  assert.equal(loadOn(ev, 'north'), 0);
  assert.deepEqual(errors, []);
});

test('a live explicit pin stays authoritative; a broken pin may use Auto-TE fallback', t => {
  const { ev, errors } = game(t, circuit() + "S.te.l2=true;S.biz[0].pin=['nyc','ash'];");
  assert.equal(got(ev), 10);
  assert.equal(loadOn(ev, 'north'), 0);
  assert.equal(ev('R.teMoved'), 0);
  ev("S.links.find(l=>l.id==='direct').cut=S.day+9;compute()");
  assert.equal(got(ev), 30);
  assert.equal(loadOn(ev, 'north'), 30);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.biz[0].pin)')), ['nyc', 'ash']);
  ev("S.links.find(l=>l.id==='direct').cut=0;compute()");
  assert.equal(got(ev), 10, 'the circuit returns to its pin when the link recovers');
  assert.deepEqual(errors, []);
});

test('RouteScript spill lines apply to L2 circuits before their shortest path fills', t => {
  const { ev, errors } = game(t, circuit('c', 9) + "S.te.l2=true;S.te.script='spill at 80%';");
  assert.equal(got(ev), 9);
  assert.equal(loadOn(ev, 'direct'), 8);
  assert.equal(loadOn(ev, 'north'), 1);
  assert.equal(ev('R.teMoved'), 1);
  assert.deepEqual(errors, []);
});

test('latency spill tiers use a detour only when it fits their extra latency budget', t => {
  const { ev, errors } = game(t, circuit('c', 9) + "S.te.l2=true;S.links[0].km=300;S.links[1].km=S.links[2].km=325;");
  ev("S.te.script='spill at 80% within 1 ms';compute()");
  assert.equal(got(ev), 9);
  assert.equal(loadOn(ev, 'direct'), 9, 'the shortest path fills past the line when the detour is too slow');
  assert.equal(loadOn(ev, 'north'), 0);
  ev("S.te.script='spill at 80% within 5 ms';compute()");
  assert.equal(got(ev), 9);
  assert.equal(loadOn(ev, 'direct'), 8);
  assert.equal(loadOn(ev, 'north'), 1);
  assert.deepEqual(errors, []);
});

test('splitting does not invent bandwidth across a shared upstream bottleneck', t => {
  const { ev, errors } = game(t, wave('upstream', 'chi', 'nyc', 0, 10) + circuit('c', 30, 'chi') + 'S.te.l2=true;');
  assert.equal(got(ev), 10);
  assert.equal(loadOn(ev, 'upstream'), 10);
  assert.equal(loadOn(ev, 'direct') + loadOn(ev, 'north'), 10);
  assert.equal(ev('R.teMoved'), 0);
  assert.deepEqual(errors, []);
});

test('a detour respects router room as well as link capacity', t => {
  const { ev, errors } = game(t, circuit('c', 1000) + "S.te.l2=true;S.links[1].tier=S.links[2].tier=4;S.pops.bos.rgen=0;");
  assert.equal(got(ev), 410);
  assert.equal(loadOn(ev, 'north'), 400);
  assert.equal(ev('R.nodeLoad.bos'), ev('R.nodeCap.bos'));
  assert.equal(ev("S.links.every(l=>(R.load[l.id]||0)<=capOf(l)+1e-6)"), true);
  assert.deepEqual(errors, []);
});

test('L2 detours stay within the backbone reach and a circuit latency budget', t => {
  const { ev, errors } = game(t, circuit() + 'S.te.l2=true;S.links[1].km=S.links[2].km=1000;');
  assert.equal(got(ev), 10, 'a roundabout route is outside the TE reach');
  ev("S.links[1].km=S.links[2].km=100;S.biz[0].route='fast';S.biz[0].latMax=1;compute()");
  assert.equal(got(ev), 10, 'overflow does not take a route outside the latency SLA');
  assert.equal(loadOn(ev, 'north'), 0);
  ev('S.biz[0].latMax=2;compute()');
  assert.equal(got(ev), 30);
  assert.deepEqual(errors, []);
});

test('a valid higher metric detour is used when the cheapest detour violates the latency SLA', t => {
  const { ev, errors } = game(t, circuit() + 'S.te.l2=true;S.biz[0].latMax=3;' +
    wave('west', 'nyc', 'chi', 1, 100) + wave('east', 'chi', 'ash', 1, 100) +
    "S.links[1].km=S.links[2].km=1500;S.pairMet={'ash|nyc':{k:'w',v:1},'bos|nyc':{k:'w',v:2},'ash|bos':{k:'w',v:2},'chi|nyc':{k:'w',v:3},'ash|chi':{k:'w',v:3}};");
  assert.equal(got(ev), 30, 'the longer metric is still inside the reach and latency limits');
  assert.equal(loadOn(ev, 'direct'), 10);
  assert.equal(loadOn(ev, 'north'), 0, 'the cheaper 20ms detour is unsuitable');
  assert.equal(loadOn(ev, 'west'), 20, 'the 1.4ms detour carries the overflow');
  assert.ok(ev('R.l2lat.c') <= 3);
  assert.deepEqual(errors, []);
});

test('lowest-latency overflow can find a path satisfying both reach and latency limits', t => {
  const { ev, errors } = game(t, circuit() + "S.te.l2=true;S.biz[0].route='fast';S.biz[0].latMax=3;" +
    wave('west', 'nyc', 'chi', 1, 100) + wave('east', 'chi', 'ash', 1, 100) +
    "S.pairMet={'ash|nyc':{k:'w',v:1},'bos|nyc':{k:'w',v:100},'ash|bos':{k:'w',v:100},'chi|nyc':{k:'w',v:3},'ash|chi':{k:'w',v:3}};");
  assert.equal(got(ev), 30);
  assert.equal(loadOn(ev, 'north'), 0, 'the fastest residual detour is outside the metric reach');
  assert.equal(loadOn(ev, 'west'), 20, 'the next detour meets both constraints');
  assert.ok(ev('R.l2lat.c') <= 3);
  assert.deepEqual(errors, []);
});

test('turning L2 Auto-TE off restores scenic allocation instead of retaining TE path shares', t => {
  const { ev, errors } = game(t, circuit() + "S.biz[0].route='scenic';S.pairMet={'ash|nyc':{k:'w',v:200},'bos|nyc':{k:'w',v:100},'ash|bos':{k:'w',v:100}};");
  assert.equal(got(ev), 25, 'legacy scenic routing shares the request equally, with one 10G bottleneck');
  assert.equal(loadOn(ev, 'north'), 15);
  ev('S.te.l2=true;compute()');
  assert.equal(got(ev), 30, 'TE tops up the path that has room');
  assert.equal(loadOn(ev, 'north'), 20);
  ev('S.te.l2=false;compute()');
  assert.equal(got(ev), 25, 'the previous unequal TE shares do not change legacy behavior');
  assert.equal(loadOn(ev, 'north'), 15);
  const off = signature(ev);
  ev('compute();compute()');
  assert.equal(signature(ev), off, 'restored scenic routes remain stable');
  assert.deepEqual(errors, []);
});

test('split reporting counts paths carrying traffic rather than scenic candidates', t => {
  const { ev, errors } = game(t, circuit('first', 10) + "S.biz[0].pin=['nyc','ash'];" + circuit('c', 20) +
    "S.te.l2=true;S.biz[1].route='scenic';S.pairMet={'ash|nyc':{k:'w',v:200},'bos|nyc':{k:'w',v:100},'ash|bos':{k:'w',v:100}};");
  assert.equal(got(ev, 'first'), 10);
  assert.equal(got(ev), 20);
  assert.equal(loadOn(ev, 'north'), 20, 'one scenic candidate is already full, so the other carries everything');
  assert.equal(ev('R.l2route["c>nyc>ash"].length'), 1);
  assert.ok(ev('R.l2split.c||0') <= 1, 'the UI must not claim this circuit is split');
  assert.deepEqual(errors, []);
});

test('SD-WAN spokes are routed separately and report the weakest spoke bandwidth', t => {
  const { ev, errors } = game(t, circuit() + "S.te.l2=true;S.biz[0].type='sdwan';S.biz[0].sites=['nyc','ash','chi'];" + wave('spoke', 'nyc', 'chi', 0, 30));
  assert.equal(got(ev), 10, 'Ashburn gets 30G but Chicago only 10G');
  assert.equal(ev('R.egT.l2'), 40, 'the backbone carries 30G plus 10G');
  assert.equal(loadOn(ev, 'north'), 20);
  assert.equal(loadOn(ev, 'spoke'), 10);
  assert.deepEqual(errors, []);
});

test('ordinary L2 Auto-TE detours never take orbit edges', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=S.nextEvent=1e9;");
  ev("for(const c of ['lon','nyc'])if(!S.pops[c])ACT.buildPop({city:c});S.links=[];S.biz=[];S.transit=[];S.ixp={};S.pni=[];S.caches=[];" + wave('ocean', 'lon', 'nyc', 0, 5818));
  ev("ACT.pieFound();for(const c of ['lon','nyc']){S.pops[c].rgen=RG_TOP;ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const d of S.pie.dishes)d.ant=PIE_ANT_MAX;S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];S.core={lv:2,run:2};");
  ev(circuit('c', 30, 'lon', 'nyc') + "S.te={on:true,l2:true,day:0,script:'spill at 80% within 100 ms'};compute()");
  assert.equal(got(ev), 10);
  assert.equal(ev("Object.keys(R.ef).some(k=>k.startsWith('pie:')&&(R.ef[k].eg['l2:c']||0)>0)"), false);
  assert.deepEqual(errors, []);
});

test('wholesale waves and subsea capacity stay on one path: L2 Auto-TE cannot deliver a capacity deal', t => {
  const { ev, errors } = game(t, circuit() + "S.te.l2=true;S.biz[0].type='capw';S.biz[0].due=S.day+100;");
  assert.equal(got(ev), 10, 'a wave is one lambda on one route, not an LSP that can be split');
  assert.equal(loadOn(ev, 'north'), 0);
  ev('capPendTick(S.biz[0],S.day)');
  assert.equal(ev('!!S.biz[0].live'), false);
  assert.deepEqual(errors, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('sandbox: endless money, every unlock, nothing breaks, no badges', () => {
  const { ev, errors } = load();
  ev("ACT.modeSet({m:'sandbox'});ACT.start({})");
  assert.equal(ev("S.mode"), 'sandbox');
  assert.equal(ev("S.lvl"), 4);
  ev("S.cash=5;for(let i=0;i<120;i++)dayTick()");
  assert.ok(ev("S.cash") >= 1e8, 'money refills');
  assert.equal(ev("S.stats.incidents"), 0, 'no failures');
  assert.equal(ev("Object.keys(S.ach||{}).length"), 0, 'no badges in sandbox');
  assert.match(ev("document.getElementById('hAsn').textContent"), /Sandbox/);
  assert.deepEqual(errors, []);
});

test('scenarios: rules apply, goals complete, deadlines fail, seeds repeat', () => {
  const { ev, errors } = load();
  ev("ACT.scenarios()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Weekly challenge/);
  ev("ACT.startScn({id:'stg'})");
  assert.equal(ev("S.home"), 'stg');
  ev("ACT.buyTransit({city:'stg',net:'drz',tier:1})");
  assert.equal(ev("S.transit.length"), 0, 'no transit in the Spätzle-IX scenario');
  ev("ACT.startScn({id:'redsea',sure:1})");
  assert.equal(ev("cablesOk('mrs','sin').length"), 0, 'Red Sea routes are gone');
  assert.ok(ev("cablesFor('mrs','sin').length") > 0);
  ev("ACT.startScn({id:'carnaval',sure:1})");
  assert.ok(ev("S.biz.some(b=>b.type==='event'&&b.start===90)"), 'Carnaval is pre-booked');
  ev("S.day=99;S.scn.done=0;dayTick()");
  assert.ok(ev("!!S.scn.failed"), 'deadline passes');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Time's up/);
  // weekly: same seed gives the same first random numbers
  ev("ACT.startWeekly({sure:1})");const a = ev("[Math.random(),Math.random()].join()");
  ev("ACT.startWeekly({sure:1})");const b = ev("[Math.random(),Math.random()].join()");
  assert.equal(a, b);
  ev("S.stats.peak=1234;S.day=364;dayTick()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /score/i);
  assert.ok(ev("!!JSON.parse(localStorage.getItem('sot-scn')).weekly"));
  assert.deepEqual(errors, []);
});

test('completing a scenario records it and unlocks a badge', () => {
  const { ev, errors } = load();
  ev("localStorage.removeItem('sot-scn');ACT.startScn({id:'spat'});R.reach=1;R.served=200;scnTick(10)");
  assert.equal(ev("S.scn.done"), 10);
  assert.ok(ev("!!JSON.parse(localStorage.getItem('sot-scn')).spat"));
  ev("checkBadges()");
  assert.ok(ev("S.ach.scen1!==undefined"));
  assert.deepEqual(errors, []);
});

test('traceroute shows hops, the exit and the AS path', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("ACT.buildPop({city:'ams'});UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'ams',net:'lvl',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'});compute()");
  let r = JSON.parse(ev("JSON.stringify(traceroute('fra',{net:'nfx'}))"));
  assert.match(r.text, /traceroute to/);
  assert.match(r.text, /ams/, 'goes via Amsterdam to transit');
  assert.deepEqual(r.asPath.slice(0, 2), [ev('S.asn'), ev("NET.lvl.asn")]);
  r = JSON.parse(ev("JSON.stringify(traceroute('fra',{net:'akm'}))"));
  assert.match(r.why, /peering/i, 'open network over the IX route server');
  r = JSON.parse(ev("JSON.stringify(traceroute('ams',{city:'fra'}))"));
  assert.match(r.text, /fra/);
  ev("S.links[0].cut=S.day+3;compute()");
  r = JSON.parse(ev("JSON.stringify(traceroute('fra',{net:'nfx'}))"));
  assert.ok(/unreachable/.test(r.text) || /peering/i.test(r.why));
  ev("ACT.trace({city:'fra'})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Traceroute/);
  ev("ACT.share()");
  assert.deepEqual(errors, []);
});

test('conferences: register, attend, and selective peers get easier for a while', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0");
  ev("S.day=confDay(CONFS.find(c=>c.c==='fra'),0)-20;ACT.leftTab({t:'deals'})");
  assert.match(ev("document.body.textContent"), /DENOG-ish/);
  const key = ev("upcomingConfs(30).find(c=>c.c==='fra').key");
  ev(`ACT.confGo({key:'${key}'})`);
  const need0 = ev("(()=>{R.demTo.nfx=0;return peerOk('nfx','ix','fra').why})()");
  ev("for(let i=0;i<21;i++)dayTick()");
  assert.ok(ev("S.conf&&S.conf.until>S.day"), 'conference glow is on');
  const need1 = ev("(()=>{R.demTo.nfx=0;return peerOk('nfx','ix','fra').why})()");
  assert.notEqual(need0, need1, 'threshold dropped');
  ev("checkGoals()");
  assert.ok(ev("S.ach.hallway!==undefined"));
  assert.deepEqual(errors, []);
});

test('the guided tutorial walks through the first steps and can be skipped', () => {
  const { ev, dom, errors } = load();
  dom.window.__TUBES_TUT__ = true;
  ev("localStorage.removeItem('sot-tut');ACT.start({})");
  assert.equal(ev("document.getElementById('coach').hidden"), false);
  assert.match(ev("document.getElementById('coach').textContent"), /Launch broadband/);
  ev("ACT.launchBB({city:S.home});renderAll()");
  assert.match(ev("document.getElementById('coach').textContent"), /Step 2/);
  ev("ACT.tutSkip()");
  assert.equal(ev("document.getElementById('coach').hidden"), true);
  assert.equal(ev("localStorage.getItem('sot-tut')"), '1');
  assert.deepEqual(errors, []);
});

test('animations can be switched off, on or follow the system, and the choice sticks', () => {
  const { ev, errors } = load();
  ev("ACT.start({});ACT.menu()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Animations/);
  ev("ACT.animSet({v:'off'})");
  assert.equal(ev("document.documentElement.classList.contains('no-anim')"), true);
  assert.equal(ev("animOn()"), false);
  ev("floater(0,0,'x','#000')");
  assert.equal(ev("FLOATS.length"), 0, 'no floating text when off');
  assert.equal(ev("localStorage.getItem('sot-anim')"), 'off');
  ev("ACT.animSet({v:'on'})");
  assert.equal(ev("document.documentElement.classList.contains('anim-force')"), true);
  assert.equal(ev("animOn()"), true);
  ev("ACT.soundSet({v:'off'})");
  assert.equal(ev("UI.muted"), true);
  assert.deepEqual(errors, []);
});

test('half speed and deeper zoom', () => {
  const { ev, errors } = load();
  ev("ACT.start({});ACT.speed({v:0.5})");
  assert.equal(ev("UI.speed"), 0.5);
  assert.equal(ev("document.getElementById('sp0.5').classList.contains('on')"), true);
  ev("ACT.speed({v:7})");
  assert.equal(ev("UI.speed"), 0.5, 'bogus speeds are ignored');
  ev("cam.z=1;for(let i=0;i<40;i++)zoomAt(100,100,1.2)");
  assert.equal(ev("cam.z"), 6);
  assert.deepEqual(errors, []);
});

test('the map draws at every zoom, with and without animations, without throwing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;ACT.launchBB({city:'fra'});for(const c of ['ams','lon','nyc'])ACT.buildPop({city:c});UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal();compute()");
  for (const z of [0.35, 0.8, 1.4, 3, 6]) ev(`cam.z=${z};draw(performance.now());draw(0)`);
  ev("ACT.animSet({v:'off'});frame(performance.now()+16)");
  assert.ok(ev("ctx&&ctx.calls.n") > 100, 'the canvas was actually drawn on');
  assert.deepEqual(errors, []);
});

test('RouteScript: parses safely, reports errors helpfully, and changes routing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'lvl',tier:1});ACT.buyTE();compute()");
  let p = JSON.parse(ev("JSON.stringify(teParse('spill at 80%\\ncap transit cogent at 3 gbps\\nprefer ix for google\\nnonsense here\\navoid transit for gogle'))"));
  assert.equal(p.errors.length, 2, 'the nonsense line and the typo fail');
  assert.match(p.errors[1], /Did you mean Google/, 'typos get a suggestion');
  p = JSON.parse(ev("JSON.stringify(teParse('avoid transit for zzzzqqq').errors)"));
  assert.match(p[0], /unknown network/);
  assert.match(ev("teParse('drain pariss').errors[0]"), /Did you mean Paris/);
  assert.equal(ev("teParse('alert(1)').n"), 0, 'nothing is ever evaluated');
  const cog = "R.useT[S.transit.find(t=>t.net==='cog').id]||0";
  const before = ev(cog);
  ev("ACT.teEdit();document.getElementById('teSrc').value='cap transit cogent at 3 gbps';ACT.teDeploy()");
  assert.ok(ev(cog) <= 3.0001 && before > 3, `Cogent capped (${before} -> ${ev(cog)})`);
  assert.ok(ev("R.useT[S.transit.find(t=>t.net==='lvl').id]") > 0, 'overflow went to the other upstream');
  // a fat-fingered deploy earns its badge
  ev("ACT.teEdit();document.getElementById('teSrc').value='drain frankfurt\\ncap transit lumen at 0 gbps\\ncap transit cogent at 0 gbps';ACT.teDeploy();checkGoals()");
  assert.ok(ev("S.ach.fat!==undefined"));
  // errors block a deploy
  ev("ACT.teEdit();document.getElementById('teSrc').value='spill at 5%';ACT.teDeploy()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /commit failed/);
  ev("ACT.teClear()");
  assert.equal(ev("S.te.script"), '');
  assert.deepEqual(errors, []);
});

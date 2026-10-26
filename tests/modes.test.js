const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('sandbox: endless money, every unlock, nothing breaks, no badges', () => {
  const { ev, errors } = load();
  ev("ACT.modeSet({m:'sandbox'});ACT.start({})");
  assert.equal(ev("S.mode"), 'sandbox');
  assert.equal(ev("S.lvl"), ev("LEVELS.length"));
  assert.equal(ev("LEVELS.length"), 13);
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
  assert.match(ev("document.body.textContent"), /DENOG/);
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
  assert.match(ev("document.getElementById('modalCard').textContent"), /Settings/);
  ev("ACT.settings()");
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
  assert.equal(ev("cam.z"), ev("ZMAX"), 'zooming in stops at the maximum');
  assert.ok(ev("ZMAX") >= 16, 'deep enough for dense regions (#126)');
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
  let p = JSON.parse(ev("JSON.stringify(teParse('spill at 80%\\ncap transit cogentle at 3 gbps\\nprefer ix for goggle\\nnonsense here\\navoid transit for gogle'))"));
  assert.equal(p.errors.length, 2, 'the nonsense line and the typo fail');
  assert.match(p.errors[1], /Did you mean Goggle/, 'typos get a suggestion');
  p = JSON.parse(ev("JSON.stringify(teParse('avoid transit for zzzzqqq').errors)"));
  assert.match(p[0], /unknown network/);
  assert.match(ev("teParse('drain pariss').errors[0]"), /Did you mean Paris/);
  assert.equal(ev("teParse('alert(1)').n"), 0, 'nothing is ever evaluated');
  const cog = "R.useT[S.transit.find(t=>t.net==='cog').id]||0";
  const before = ev(cog);
  ev("ACT.teEdit();document.getElementById('teSrc').value='cap transit cogentle at 3 gbps';ACT.teDeploy()");
  assert.ok(ev(cog) <= 3.0001 && before > 3, `Cogentle capped (${before} -> ${ev(cog)})`);
  assert.ok(ev("R.useT[S.transit.find(t=>t.net==='lvl').id]") > 0, 'overflow went to the other upstream');
  // a fat-fingered deploy earns its badge
  ev("ACT.teEdit();document.getElementById('teSrc').value='drain frankfurt\\ncap transit level tree at 0 gbps\\ncap transit cogentle at 0 gbps';ACT.teDeploy();checkGoals()");
  assert.ok(ev("S.ach.fat!==undefined"));
  // errors block a deploy
  ev("ACT.teEdit();document.getElementById('teSrc').value='spill at 5%';ACT.teDeploy()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /commit failed/);
  ev("ACT.teClear()");
  assert.equal(ev("S.te.script"), '');
  assert.deepEqual(errors, []);
});

test('RouteScript BGP: local-pref and prepending move transit, protected customers go first, the optimizer drafts a script', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'lvl',tier:1});ACT.buyTE();for(let i=0;i<30;i++)dayTick();compute()");
  const use = n => ev(`R.useT[S.transit.find(t=>t.net==='${n}').id]||0`);
  const p = JSON.parse(ev("JSON.stringify(teParse('prefer transit level tree\\navoid transit cogentle\\nprepend transit cogentle 2\\nprotect customers\\nprepend transit cogentle 9'))"));
  assert.equal(p.n, 4);
  assert.match(p.errors[0], /prepend 1 to 3/);
  assert.equal(p.up.lvl, 'prefer');
  assert.equal(p.prep.cog, 2);
  ev("S.te.script='prefer transit level tree';compute()");
  assert.ok(use('cog') < 1e-6 && use('lvl') > 0, 'local-pref sends everything to the preferred upstream');
  const tot = use('lvl');
  ev("S.te.script='prepend transit level tree 2';compute()");
  assert.ok(use('lvl') < tot * 0.5 && use('cog') > 0, 'prepending moves traffic off, but not all of it');
  assert.ok(Math.abs(use('lvl') + use('cog') - tot) < 0.5, 'nothing is lost');
  // Congest the city, then protect business customers: they keep their service, home users take the hit.
  ev("S.biz.push({id:uid(),city:'fra',city2:null,reqs:[],name:'Test DIA',type:'dia',bw:5,rate:600,mood:100,since:0});S.pops.fra.bb.d*=40;S.te.script='';compute()");
  const plain = ev("bizSf(S.biz[S.biz.length-1])");
  assert.ok(plain < 0.95, `the city is congested (${plain})`);
  ev("S.te.script='protect customers';compute()");
  assert.ok(ev("bizSf(S.biz[S.biz.length-1])") >= 0.95, 'protected customer stays happy (95%+ served)');
  assert.ok(ev("sfOf(R,'fra')") <= plain + 0.01, 'the city as a whole is not better off');
  const draft = ev('teOptimize()');
  assert.match(draft, /spill at 85%/);
  assert.match(draft, /protect customers/);
  assert.match(draft, /prefer transit cogentle/);
  assert.match(draft, /peers at DE-KICKS/);
  assert.equal(ev('teParse(teOptimize()).errors.length'), 0, 'the draft is a valid script');
  // With room to spare, protecting customers would only cost a second routing pass, so it is not suggested.
  ev("S.pops.fra.bb.d=5;S.te.script='';compute()");
  assert.ok(ev("sfOf(R,'fra')") >= 0.95);
  assert.doesNotMatch(ev('teOptimize()'), /protect customers/);
  ev("S.te.script='';ACT.teEdit();ACT.teOpt()");
  assert.match(ev("document.getElementById('teSrc').value"), /Suggested by the optimizer/);
  assert.deepEqual(errors, []);
});

test('#27 new networks get a random name, and "Another one" never repeats it', () => {
  const { ev, errors } = load();
  assert.ok(ev("NETWORK_NAMES.every(n=>n.length<=24)&&new Set(NETWORK_NAMES).size===NETWORK_NAMES.length"));
  const first = ev("document.getElementById('nmIn').value");
  assert.ok(ev(`NETWORK_NAMES.includes(${JSON.stringify(first)})`));
  let prev = first;
  for (let i = 0; i < 40; i++) {
    ev("ACT.randomName()");
    const now = ev("document.getElementById('nmIn').value");
    assert.notEqual(now, prev);
    prev = now;
  }
  ev("document.getElementById('nmIn').value='My Own Net';ACT.start({})");
  assert.equal(ev("S.name"), 'My Own Net');
  assert.deepEqual(errors, []);
});

test('iPhone home-screen app fills the screen when iOS reports a short viewport', () => {
  const { ev, dom, errors } = load();
  const w = dom.window;
  const set = (o, k, v) => Object.defineProperty(o, k, { value: v, configurable: true });
  set(w.navigator, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
  set(w.navigator, 'standalone', true);
  set(w, 'screen', { width: 390, height: 844 });
  set(w, 'innerWidth', 390); set(w, 'innerHeight', 797);   // one status bar short
  ev('resize()');
  assert.equal(ev("document.documentElement.classList.contains('iosfix')"), true);
  assert.equal(ev("document.documentElement.style.getPropertyValue('--app-h')"), '844px');
  assert.equal(ev('CH'), 844, 'the map is drawn to the real bottom');
  // landscape: the short side of the screen
  set(w, 'innerWidth', 844); set(w, 'innerHeight', 370);
  ev('resize()');
  assert.equal(ev('CH'), 390);
  // once fixed, iOS reports a full viewport: the fix must stay on, or the strip comes back
  set(w, 'innerWidth', 390); set(w, 'innerHeight', 844);
  ev('resize()');
  assert.equal(ev("document.documentElement.classList.contains('iosfix')"), true);
  assert.equal(ev('CH'), 844);
  // Safari in a tab leaves the page alone
  set(w.navigator, 'standalone', false); set(w, 'innerHeight', 700);
  ev('resize()');
  assert.equal(ev("document.documentElement.classList.contains('iosfix')"), false);
  assert.equal(ev('CH'), 700);
  assert.deepEqual(errors, []);
});

test('phones in the browser get the install pitch before a new game, then can still play', () => {
  const { ev, dom, errors } = load();
  const w = dom.window;
  const set = (o, k, v) => Object.defineProperty(o, k, { value: v, configurable: true });
  set(w.navigator, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1');
  set(w, 'innerWidth', 390); set(w, 'innerHeight', 760);
  ev('showTitle()');
  assert.match(ev("document.getElementById('modal').textContent"), /Best played as an app/, 'title screen card');
  ev('ACT.start({})');
  const modal = () => ev("document.getElementById('modal').textContent");
  assert.equal(ev('!!S&&UI.started'), false, 'the game waits for the pitch');
  assert.match(modal(), /Play it as an app/);
  assert.match(modal(), /does not carry over/, 'iPhone players learn to install first');
  assert.match(modal(), /Add to Home Screen/);
  ev('ACT.pitchSkip()');
  assert.equal(ev('UI.started&&!!S.pops[S.home]'), true, 'playing in the browser still works');
  // only once per session
  ev('ACT.newgame();ACT.start({})');
  assert.equal(ev('UI.started'), true);
  assert.deepEqual(errors, []);
});

test('the installed app and desktop browsers start straight away', () => {
  for (const [w0, sa] of [[390, true], [1280, false]]) {
    const { ev, dom, errors } = load();
    const w = dom.window;
    const set = (o, k, v) => Object.defineProperty(o, k, { value: v, configurable: true });
    set(w.navigator, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15');
    set(w.navigator, 'standalone', sa);
    set(w, 'innerWidth', w0); set(w, 'innerHeight', 760);
    ev('ACT.start({})');
    assert.equal(ev('UI.started'), true, `width ${w0}, standalone ${sa}`);
    assert.deepEqual(errors, []);
  }
});

test('#34 scenario goal, progress and customer level are always in view', () => {
  const { ev, dom, errors } = load();
  ev("ACT.startScn({id:'darien',sure:1})");
  ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderAll()");
  const left = () => dom.window.document.getElementById('leftBody').textContent;
  assert.match(left(), /Mind the Gap/);
  assert.match(left(), /POP in Bogotá/);
  assert.match(left(), /days left/);
  assert.match(left(), /Customer level 1 of 13/);
  assert.equal(ev("$('hScn').hidden"), false, 'scenario chip in the top bar');
  const f0 = ev('scnProg().f');
  ev("S.cash=1e8;ACT.buildPop({city:'bog'});ACT.buildPop({city:'lim'});compute();renderAll()");
  assert.ok(ev('scnProg().f') > f0, 'progress moves when a goal step is reached');
  assert.match(ev("$('hScnVal').textContent"), /%/);
  assert.match(ev("$('hTier').textContent"), /Lv 1/);
  // every scenario has measurable progress
  for (const id of JSON.parse(ev("JSON.stringify(SCN.filter(s=>s.ok).map(s=>s.id))"))) {
    ev(`ACT.startScn({id:'${id}',sure:1})`);
    const P = JSON.parse(ev('JSON.stringify(scnProg())'));
    assert.ok(P && P.items.length > 0, `${id} shows progress`);
  }
  ev('ACT.startWeekly({sure:1})');
  assert.match(ev('scnCard()'), /score/);
  assert.deepEqual(errors, []);
});

test('NOC dashboard has a tab bar for its sections', () => {
  const { ev, errors } = load();
  ev("ACT.start({});ACT.dash()");
  const card = () => ev("document.getElementById('dashCard').textContent");
  assert.match(card(), /Traffic by way out/);
  assert.doesNotMatch(card(), /Busiest links/);
  for (const [k, re] of [['cust', /Customers/], ['conn', /Every port that connects/], ['traffic', /Traffic by network/], ['infra', /Busiest links/]]) {
    ev(`ACT.dashTab({k:'${k}'})`);
    assert.match(card(), re, k);
  }
  ev("ACT.dashTab({k:'nope'})");
  assert.equal(ev('UI.dtab'), 'infra', 'unknown tabs are ignored');
  assert.deepEqual(errors, []);
});

test('a brand-new phone player can click through the install pitch and the title screen buttons', () => {
  const { ev, dom, errors } = load();
  const w = dom.window, doc = w.document;
  Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
  ev('showTitle()');
  assert.equal(ev('S'), null, 'no game yet');
  const click = (sel) => { const el = doc.querySelector(sel); assert.ok(el, sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  click('#modal [data-act="settings"]');
  assert.match(doc.getElementById('modal').textContent, /Pause when a customer is furious/, 'Settings opens before any game exists');
  click('#modal [data-act="settingsClose"]');
  click('#modal [data-act="start"]');
  assert.match(doc.getElementById('modal').textContent, /Play it as an app/);
  click('#modal .cta [data-act="pitchSkip"]');
  assert.equal(ev('!!(S&&UI.started)'), true, 'Play in the browser anyway really starts the game');
  assert.deepEqual(errors, []);
});

test('Flood Season: attacks keep coming, grow, and only count when service held', () => {
  const { ev, errors } = load();
  ev("ACT.startScn({id:'flood',sure:1})");
  assert.equal(ev("S.scn.id"), 'flood');
  assert.ok(ev('S.lvl') >= 3, 'starts with bigger gear unlocked');
  // a few weeks in: several attacks start on their own schedule
  let n = 0;
  for (let i = 0; i < 40; i++) { ev('dayTick()'); if (ev('!!(S.ev.ddos&&S.ev.ddos.start===S.day)')) n++; }
  assert.ok(n >= 4, `attacks keep coming (${n} in 40 days)`);
  assert.ok(ev('(S.stats.ddosOk||0)+(S.stats.ddosLost||0)') >= 3, 'finished attacks are scored');
  // scoring: held only if service stayed at 97%+
  ev("S.stats.ddosOk=0;S.stats.ddosOkBig=0;S.stats.ddosLost=0;ddosDone({city:'ams',gbps:1500,worst:0.99});ddosDone({city:'ams',gbps:20,worst:0.5});ddosDone({city:'xyz',gbps:30,worst:1})");
  assert.equal(ev('S.stats.ddosOk'), 2);
  assert.equal(ev('S.stats.ddosOkBig'), 1);
  assert.equal(ev('S.stats.ddosLost'), 1);
  const P = JSON.parse(ev('JSON.stringify(scnProg())'));
  assert.match(P.items.map((x) => x.l).join(' '), /Floods held.*Terabit floods held/);
  ev('S.stats.ddosOk=20;S.stats.ddosOkBig=5;scnTick(S.day)');
  assert.ok(ev('!!S.scn.done'), 'the goal completes');
  assert.deepEqual(errors, []);
});

test('DKNOG in Copenhagen is on the conference calendar', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0");
  const cf = JSON.parse(ev("JSON.stringify(CONFS.find(c=>c.n==='DKNOG'))"));
  assert.equal(cf.c, 'cph');
  assert.equal(ev(`MONTHS[${cf.m}]`), 'Mar', 'held in March, like the real one');
  ev(`S.day=confDay(CONFS.find(c=>c.n==='DKNOG'),0)-20;ACT.leftTab({t:'deals'})`);
  assert.match(ev("document.body.textContent"), /DKNOG/);
  const key = ev("upcomingConfs(30).find(c=>c.n==='DKNOG').key");
  ev(`ACT.confGo({key:'${key}'})`);
  ev("for(let i=0;i<21;i++)dayTick()");
  assert.equal(ev("S.conf&&S.conf.reg"), 'EU', 'the glow helps with European peers');
  assert.match(ev("S.log.map(e=>e.t).join(' | ')"), /just one more drink/, 'and the evening went as DKNOG evenings go');
  assert.deepEqual(errors, []);
});

test('the Signal group is linked from the title screen, the menu and How to play, in every language', () => {
  for (const lang of ['en', 'it', 'pt', 'fr']) {
    const { ev, errors } = load(lang === 'en' ? {} : { lang });
    const links = (setup) => ev(`(()=>{${setup};return [...document.querySelectorAll('#modal a[href^="https://signal.group/#"]')].map(a=>a.target+'|'+a.rel+'|'+a.textContent.trim()).join('\\n');})()`);
    const title = links('showTitle()');
    assert.match(title, /^_blank\|noopener\|/, `${lang}: title footer links the group in a new tab`);
    ev('ACT.start({})');
    for (const [where, setup] of [['menu', 'ACT.menu()'], ['help', 'showHelp()']]) {
      const l = links(setup);
      assert.equal(l.split('\n').length, 1, `${lang}: one chat card in ${where}`);
      if (lang !== 'en') assert.doesNotMatch(l, /Join the NOC chat/, `${lang}: ${where} card is translated`);
    }
    assert.deepEqual(errors, []);
  }
});

test('#114 Only Spätzle-IX can be won by peering alone', () => {
  const { ev, errors } = load();
  ev("ACT.startScn({id:'stg',sure:1})");
  assert.equal(ev("scnRule('local')&&scnRule('noTransit')"), true);
  assert.match(ev("SCN.find(x=>x.id==='stg').goal"), /45%.*300 Gbps/);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(scnProg().items.map(x=>x.max))")), [0.45, 300]);
  // a game saved before the fix picks the rule up on load
  ev("const o=JSON.parse(JSON.stringify(S));delete o.scn.rules.local;migrate(o);window.__mig=o.scn.rules.local");
  assert.equal(ev('window.__mig'), true);
  // peering only, Stuttgart and Frankfurt: broadband grows instead of draining away
  ev("S.cash=1e7;ACT.buyIx({city:'stg',tier:1,signed:true});ACT.peerAll({city:'stg'});ACT.launchBB({city:'stg'})");
  ev("ACT.buildPop({city:'fra'});UI.via=null;openLinkModal('stg','fra');ACT.buildLink({tier:1});closeModal();for(const x of ixIdsIn('fra'))ACT.buyIx({city:x,tier:1,signed:true});ACT.launchBB({city:'fra'})");
  const tick = (n) => { for (let i = 0; i < n; i++) { ev('dayTick()'); if (i % 5 === 0) ev("for(const x of Object.keys(S.ixp))ACT.peerAll({city:x})"); } };
  tick(20);
  const early = ev('R.served');
  assert.ok(ev('R.reach') < 0.9, 'far from the whole internet');
  tick(60);
  assert.ok(ev('R.served') > early * 1.5, `customers stay and grow (${early.toFixed(1)} → ${ev('R.served').toFixed(1)} Gbps)`);
  assert.ok(ev("sfOf(R,'stg')") >= 0.9);
  // the rule stays inside this scenario
  ev("ACT.start({})");
  assert.equal(ev("scnRule('local')"), false);
  assert.deepEqual(errors, []);
});

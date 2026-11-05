const test = require('node:test');
const assert = require('node:assert/strict');
const { load, browser } = require('./harness');
const { until } = require('./net');
const { lit } = require('../scripts/lib/js-literal');

// A game window and its NOC window in one fake browser: shared localStorage, broadcast channels and locks.
// Waits for the page's async work (storage, channels) to land: up to 20 s, as a busy runner may need.
const settle = async (ev, cond, what) => assert.ok(await until(() => ev(cond)), what || cond);
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const START = "UI.pitched=true;ACT.pickStart({city:'fra'});ACT.start({});closeModal();S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});S.pops.fra.bb.d=300;S.pops.fra.rgen=1;ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:0,signed:true});S.pni.push({id:'p1',city:'fra',net:'drz',tier:0,ready:0});compute();save(true)";
const closeAll = (t, ...hs) => t.after(() => { for (const h of hs) h.dom.window.close(); });
async function pair(t) {
  const b = browser();
  const G = load({ browser: b });
  G.ev(START);
  const id = G.ev('UI.slot');
  const W = load({ browser: b, url: 'https://tests.invalid/?noc=' + id });
  closeAll(t, G, W);
  await settle(W.ev, 'UI.started===true', 'the window got its first copy');
  return { b, G, W, id };
}
const pump = (G) => G.ev('NOC.sent=-1e9;nocPump(performance.now())');
const click = (h, sel) => h.ev(`document.querySelector(${lit(sel)}).click()`);

test('with no NOC window nothing is sent and nothing is scheduled', (t) => {
  const b = browser();
  const G = load({ browser: b });
  closeAll(t, G);
  G.ev(START);
  G.ev("window.__posts=0;{const P=BroadcastChannel.prototype.postMessage;BroadcastChannel.prototype.postMessage=function(m){__posts++;return P.call(this,m);};}");
  G.ev('after();after();nocPump(performance.now()+1e6);nocSend(performance.now());frame(performance.now());dayTick()');
  assert.equal(G.ev('__posts'), 0);
  assert.equal(G.ev('NOC.peer'), false);
  assert.deepEqual(G.errors, []);
});

test('the window never claims the network and never writes to localStorage', async (t) => {
  const b = browser();
  const G = load({ browser: b });
  G.ev(START);
  const id = G.ev('UI.slot'), before = JSON.stringify([...b.ls.entries()].filter(([k]) => !k.startsWith('sot-open:')));
  const W = load({ browser: b, url: 'https://tests.invalid/?noc=' + id });
  closeAll(t, G, W);
  await settle(W.ev, 'UI.started===true');
  assert.equal(W.ev('NOC.win'), true);
  assert.ok(!W.ev('UI.slot'), 'the window holds no network');
  assert.equal(G.ev('UI.slot'), id, 'the game keeps its network');
  W.ev('S.cash=1;save(true)');
  await wait();
  assert.equal(JSON.stringify([...b.ls.entries()].filter(([k]) => !k.startsWith('sot-open:'))), before);
  assert.equal(G.ev('SLOT.no.has(UI.slot)'), false, 'and the game was not told it lost it');
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('a malformed ?noc= is just the game', (t) => {
  const b = browser();
  const G = load({ browser: b, url: 'https://tests.invalid/?noc=../evil' });
  closeAll(t, G);
  assert.equal(G.ev('NOC.win'), false);
});

test('every dashboard tab draws the same from the copy as in the game, also during a flood', async (t) => {
  const { G, W } = await pair(t);
  const html = (h) => h.ev("(()=>{const o={};for(const k of DTABS){UI.dtab=k;UI._dh=null;renderDash();o[k]=document.getElementById('dashCard').innerHTML;}return JSON.stringify(o)})()");
  G.ev("$('dash').hidden=false");
  G.ev('NOC.dirty=true'); pump(G); await wait();
  // uid-free views: the same state must render the same.
  assert.deepEqual(JSON.parse(html(W)), JSON.parse(html(G)));
  G.ev("S.day=60;S.ev.ddos={id:'a',city:'fra',tgt:'bb:fra',vec:'http',gbps:20,start:S.day,until:S.day+3};compute();NOC.dirty=true"); pump(G); await wait();
  assert.equal(W.ev('S.day'), 60);
  assert.equal(W.ev("R.ddos.length&&R.ddos[0].attack&&R.ddos[0].attack.id"), 'a', 'the attack points at its copy again');
  assert.deepEqual(JSON.parse(html(W)), JSON.parse(html(G)));
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('every button the dashboard draws is in exactly one list', async (t) => {
  const { G, W } = await pair(t);
  const local = JSON.parse(G.ev('JSON.stringify(NOC_LOCAL)')), go = JSON.parse(G.ev('JSON.stringify(NOC_GO)'));
  assert.deepEqual(local.filter((x) => go.includes(x)), []);
  for (const k of [...local, ...go]) assert.equal(G.ev(`typeof ACT[${lit(k)}]`), 'function', k);
  const seen = JSON.parse(G.ev("(()=>{$('dash').hidden=false;S.biz.push({id:'b1',type:Object.keys(BIZ_T)[0],city:'fra',reqs:[],mood:50,name:'x',g:1,mo:1,day:0});const o=new Set();for(const k of DTABS){UI.dtab=k;UI._dh=null;renderDash();for(const e of document.querySelectorAll('#dashCard [data-act],#dashCard [data-chg]'))o.add(e.dataset.act||e.dataset.chg);}S.biz.pop();return JSON.stringify([...o])})()"));
  assert.ok(seen.includes('lagP') && seen.includes('buyIx'), 'the upgrade buttons are there');
  assert.deepEqual(seen.filter((x) => !local.includes(x) && !go.includes(x)), [], 'a new dashboard button must be sorted into a list');
  assert.deepEqual(W.errors, []);
});

test('an upgrade clicked in the window costs what the click costs and lands in the game', async (t) => {
  const twin = load(); closeAll(t, twin); twin.ev(START);
  const { G, W } = await pair(t);
  const c0 = G.ev('S.cash'), t0 = twin.ev('S.cash');
  W.ev("UI.dtab='conn';UI._dh=null;renderDash()");
  click(W, '#dashCard [data-act="buyIx"]');
  await settle(W.ev, 'S.ixp.fra===1', 'the copy shows the bigger port');
  assert.equal(G.ev('S.ixp.fra'), 1);
  twin.ev("ACT.buyIx({city:'fra',tier:1})");
  assert.equal(c0 - G.ev('S.cash'), t0 - twin.ev('S.cash'));
  assert.equal(W.ev('S.cash'), G.ev('S.cash'), 'the window was told at once');
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('view clicks stay in the window; the game ignores anything off its list', async (t) => {
  const { G, W, id } = await pair(t);
  const c0 = G.ev('S.cash');
  W.ev("nocView('details')");
  click(W, '#dashCard [data-act="dashTab"][data-args*="infra"]');
  assert.equal(W.ev('UI.dtab'), 'infra'); assert.notEqual(G.ev('UI.dtab'), 'infra');
  W.ev(`NOC.ctl.postMessage({t:'act',id:${lit(id)},act:'newgame',args:{}});NOC.ctl.postMessage({t:'act',id:${lit(id)},act:'takeLoan',args:{id:'x'}});ACT.newgame({});ACT.buildPop({city:'ams'})`);
  await wait();
  assert.equal(G.ev('S.cash'), c0);
  assert.equal(G.ev('!!S.pops.ams'), false, 'buildPop is not on the list');
  W.ev(`NOC.ctl.postMessage({t:'act',id:'someoneelse',act:'lagIx',args:{city:'fra',d:1}})`);
  await wait();
  assert.equal(G.ev('(S.ixn||{}).fra||1'), 1, "another network's click");
  assert.deepEqual(G.errors, []);
});

test('remove keeps its Really? step in the window, and a dialog in the game blocks clicks with a note', async (t) => {
  const { G, W } = await pair(t);
  W.ev("UI.dtab='conn';UI._dh=null;renderDash()");
  W.ev("ACT.connCancel({k:'p',id:'p1'})");
  await wait();
  assert.equal(G.ev("S.pni.some(p=>p.id==='p1')"), true, 'one click only asks');
  assert.equal(W.ev('UI.confirm'), 'cc:p:p1');
  W.ev("ACT.connCancel({k:'p',id:'p1'})");
  await settle(G.ev, "!S.pni.some(p=>p.id==='p1')", 'the second click removes it');
  G.ev("openModal('<p>hi</p>')");
  W.ev("ACT.lagIx({city:'fra',d:1})");
  await settle(W.ev, "document.getElementById('toasts').textContent.includes('dialog open')", 'told why');
  assert.equal(G.ev('(S.ixn||{}).fra||1'), 1);
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('copies go out at most once a second, only when something changed, never mid-day, and stop with the window', async (t) => {
  const { G, W } = await pair(t);
  G.ev("window.__n=0;{const f=nocSend;nocSend=function(n){__n++;return f(n);};}window.__tx=0;{const P=NOC.st.postMessage;NOC.st.postMessage=function(m){__tx++;return P.call(this,m);};}");
  G.ev('NOC.dirty=false;NOC.sent=1000;NOC.until=1e12;nocPump(5000)');
  assert.equal(G.ev('__tx'), 0, 'nothing changed');
  G.ev('NOC.sent=1000;NOC.dirty=true;nocPump(1500)');
  assert.equal(G.ev('__tx'), 0, 'too soon');
  G.ev('nocPump(2000)');
  assert.equal(G.ev('__tx'), 1);
  assert.equal(G.ev('NOC.dirty'), false);
  assert.deepEqual(JSON.parse(G.ev(`JSON.stringify(Object.keys(nocR()).filter(k=>['ef','fl','efp','flc'].includes(k)))`)), [], 'the routing tables stay home');
  assert.ok(G.ev("Object.keys(nocR()).includes('usePni')"));
  G.ev('after();RW.job={seq:0};nocPump(9000)');
  assert.equal(G.ev('__tx'), 1, 'half a day is not sent');
  assert.equal(G.ev('NOC.dirty'), true, 'and stays due');
  G.ev('RW.job=null;nocPump(9000)');
  assert.equal(G.ev('__tx'), 2);
  G.ev('NOC.until=10000;NOC.dirty=true;nocPump(20000)');
  assert.equal(G.ev('NOC.peer'), false, 'no sign of the window for a while');
  assert.equal(G.ev('__tx'), 2);
  W.ev('nocBeat()');
  await settle(G.ev, 'NOC.peer===true', 'its next heartbeat reconnects it');
  W.ev("dispatchEvent(new Event('pagehide'))");
  await settle(G.ev, 'NOC.peer===false', 'closing says bye');
  assert.deepEqual(G.errors, []);
});

test('the bar says when the game is paused, hidden or gone, and clears when the game answers', async (t) => {
  const { G, W } = await pair(t);
  const bar = () => W.ev("document.getElementById('nocBar').textContent");
  assert.match(bar(), /paused/);
  assert.match(bar(), /Y1/);
  G.ev('UI.speed=1;NOC.dirty=true'); pump(G); await wait();
  assert.doesNotMatch(bar(), /paused/);
  W.ev('NOC.hid=true;nocBar()'); assert.match(bar(), /hidden/); W.ev('NOC.hid=false');
  W.ev('nocBeat(performance.now()+1e6)');
  assert.match(bar(), /closed or not answering/);
  G.ev("dispatchEvent(new Event('pagehide'))");
  await wait();
  W.ev('nocBeat()'); await wait();
  assert.doesNotMatch(bar(), /closed or not answering/, 'the game answered again');
  assert.deepEqual(W.errors, []);
});

test('the button is in the speed group, asks for a noopener pop-up with the network, and a second click only focuses', async (t) => {
  const { G } = await pair(t);
  assert.equal(G.ev(`!!document.querySelector('.speed [data-act="nocWindow"]')`), true);
  // Only phones lose it: fitHud() hides .hide-md and .hide-md2 when the HUD is crowded, which a big network always is.
  assert.equal(G.ev(`document.querySelector('[data-act="nocWindow"]').className`), 'hide-sm');
  G.ev("window.__open=[];window.open=(...a)=>{__open.push(a);return null;};NOC.peer=false;ACT.nocWindow()");
  const a = JSON.parse(G.ev('JSON.stringify(__open[0])'));
  assert.equal(a[0], '/?noc=' + G.ev('UI.slot'));
  assert.match(a[2], /noopener/); assert.match(a[2], /popup/);
  G.ev('__open.length=0;NOC.peer=true;ACT.nocWindow()');
  assert.equal(G.ev('__open.length'), 0);
  G.ev('__open.length=0;NOC.peer=false;UI.pz=0;S=null;ACT.nocWindow()');
  assert.equal(G.ev('__open.length'), 0, 'no network, no window');
});

test('the window speaks the game\'s language and fits a 360 px screen without the map', async (t) => {
  const b = browser();
  const G = load({ browser: b, lang: 'it' });
  G.ev(START);
  const W = load({ browser: b, lang: 'it', url: 'https://tests.invalid/?noc=' + G.ev('UI.slot') });
  closeAll(t, G, W);
  await settle(W.ev, 'UI.started===true');
  assert.equal(W.ev("document.body.classList.contains('noc-window')"), true);
  assert.equal(W.ev("$('dash').hidden"), true, 'the wallboard comes first');
  assert.equal(W.ev("$('nocWall').hidden"), false);
  assert.match(W.ev("document.getElementById('nocBar').textContent"), /pausa/);
  assert.doesNotMatch(W.ev("$('nocBoard').innerHTML"), /\b(common|noc|dashboard|connections|hud_and_panels)\.[a-z_]+\b/, 'no raw labels');
  W.ev("nocView('details')");
  assert.doesNotMatch(W.ev("$('dashCard').innerHTML"), /\b(common|noc|connections)\.[a-z_]+\b/, 'no raw labels');
  assert.deepEqual(W.errors, []);
});

test('the wallboard opens first, with graphs, the world map, alarms and the hottest ports', async (t) => {
  const { G, W } = await pair(t);
  G.ev("S.pops.fra.bb.d=1;S.caches.push({id:'c1',city:'fra',net:NETS.find(n=>n.cache).id,site:'a'});compute();NOC.dirty=true"); pump(G); await wait();
  assert.ok(W.ev("document.querySelector('.nw-land path').getAttribute('d').length") > 5000, 'land');
  assert.equal(W.ev("document.querySelectorAll('.nw-pop').length"), G.ev('Object.keys(S.pops).length'), 'a dot per POP');
  assert.equal(W.ev("document.querySelectorAll('.nw-tile').length"), 6);
  assert.match(W.ev("$('nwAlarms').textContent"), /Nothing on fire/);
  assert.match(W.ev("$('nocBar').textContent"), /All quiet/);
  assert.equal(W.ev("document.querySelectorAll('.nw-port').length"), 3, 'transit, PNI and IX, no more');
  // Not enough history: the charts say so instead of drawing nothing.
  assert.match(W.ev("$('nwTraffic').textContent"), /ollecting/);
  G.ev('for(let i=0;i<5;i++)dayTick();NOC.dirty=true'); pump(G); await wait();
  assert.ok(W.ev("document.querySelectorAll('#nwTraffic svg path').length") > 0, 'a traffic graph');
  assert.ok(W.ev("document.querySelectorAll('#nwMoney svg path').length") > 0, 'a money graph');
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('links are coloured by how full they are, an antimeridian link wraps, a dead one is dashed', async (t) => {
  const { G, W } = await pair(t);
  G.ev("for(const c of ['ams','tok','sjc'])ACT.buildPop({city:c});for(const [id,a,b] of [['L1','fra','ams'],['L2','tok','sjc']])S.links.push({id,a,b,kind:'wave',tier:1,km:500,sub:false,cable:null,mo:1,mult:1,trench:id,cut:0,day:0});compute();R.load.L1=capOf(S.links[0])*0.95;R.load.L2=0.01;NOC.dirty=true"); pump(G); await wait();
  const links = () => JSON.parse(W.ev("JSON.stringify([...document.querySelectorAll('.nw-link')].map(e=>[e.getAttribute('stroke'),e.getAttribute('d').split('M').length-1,e.classList.contains('down')]))"));
  let L = links();
  assert.equal(L[0][0], W.ev('NW_COL.bad'), '95% is red');
  assert.equal(L[1][0], W.ev('NW_COL.ok'), 'an idle link is green');
  assert.equal(L[1][1], 2, 'Tokyo to San Jose is drawn on both edges of the map');
  assert.equal(L[0][1], 1);
  G.ev('S.links[0].cut=S.day+5;compute();NOC.dirty=true'); pump(G); await wait();
  L = links();
  assert.equal(L[0][2], true, 'a cut link is dashed');
  assert.equal(L[0][0], W.ev('NW_COL.bad'));
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('an incident and a flood raise the alarm, and hot ports only warn', async (t) => {
  const { G, W } = await pair(t);
  G.ev("S.pops.fra.bb.d=1;compute();R.useIx.fra=9.8;NOC.dirty=true"); pump(G); await wait();
  assert.match(W.ev("$('nwAlarms').textContent"), /1 port over 90%/);
  assert.equal(W.ev("document.querySelector('.nb-pill').className.includes('warn')"), true);
  G.ev("S.ev.ddos={id:'a',city:'fra',tgt:'bb:fra',vec:'http',gbps:20,start:S.day,until:S.day+3};compute();S.inc.push({id:'i1',type:'power',ref:'fra',until:S.day+3,msg:'<img src=x onerror=alert(1)>',cost:0});NOC.dirty=true"); pump(G); await wait();
  const A = W.ev("$('nwAlarms').textContent");
  assert.match(A, /under attack/);
  assert.match(A, /<img src=x/, 'the message is shown as text');
  assert.equal(W.ev("document.querySelector('#nwAlarms img')"), null);
  assert.equal(W.ev("document.querySelector('.nb-pill').className.includes('bad')"), true);
  assert.match(W.ev("$('nocBar').textContent"), /2 alarms/);
  assert.ok(W.ev("document.querySelector('.nw-pop.alarm .nw-ring')"), 'the POP rings on the map');
  assert.deepEqual(W.errors, []);
});

test('an upgrade from the wallboard runs in the game; a POP filters the list; the map keeps its elements between updates', async (t) => {
  const { G, W } = await pair(t);
  const c0 = G.ev('S.cash');
  click(W, '#nwPorts [data-act="buyIx"]');
  await settle(W.ev, 'S.ixp.fra===1');
  assert.equal(G.ev('S.ixp.fra'), 1);
  assert.equal(c0 - G.ev('S.cash'), G.ev('ixPortMo("fra",1)'));
  G.ev("ACT.buildPop({city:'ams'});ACT.buyIx({city:'ams',tier:0});compute();NOC.dirty=true"); pump(G); await wait();
  assert.equal(W.ev("[...document.querySelectorAll('.nw-port b')].some(e=>e.textContent==='Amsterdam')"), true);
  W.ev(`document.querySelector('[data-nc="pop:ams"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  assert.equal(W.ev('NOCW.city'), 'ams');
  assert.equal(W.ev("[...document.querySelectorAll('.nw-port b')].some(e=>e.textContent==='Frankfurt')"), false);
  assert.equal(W.ev("document.querySelector('[data-nc-city]').value"), 'ams');
  assert.notEqual(G.ev('UI.sel&&UI.sel.id'), 'ams', 'that click stays in the window');
  W.ev("window.__dot=document.querySelector('.nw-pop .nw-dot')");
  G.ev('NOC.dirty=true;S.cash+=1'); pump(G); await wait();
  assert.equal(W.ev("__dot===document.querySelector('.nw-pop .nw-dot')"), true, 'patched, not rebuilt: animations keep running');
  W.ev(`document.querySelector('[data-nc="details"]').click()`);
  assert.equal(W.ev("$('dash').hidden"), false);
  assert.equal(W.ev("$('nocWall').hidden"), true);
  assert.ok(W.ev("$('dashCard').textContent.length") > 100, 'Details is the dashboard');
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('every button the wallboard draws is on a list, and its motion stops when the game does', async (t) => {
  const { G, W } = await pair(t);
  const seen = JSON.parse(W.ev("JSON.stringify([...new Set([...document.querySelectorAll('#nocBoard [data-act]')].map(e=>e.dataset.act))])"));
  const lists = JSON.parse(G.ev('JSON.stringify([...NOC_LOCAL,...NOC_GO])'));
  assert.ok(seen.length >= 3);
  assert.deepEqual(seen.filter((x) => !lists.includes(x)), []);
  assert.equal(W.ev("document.body.classList.contains('noc-still')"), true, 'paused');
  G.ev('UI.speed=1;NOC.dirty=true'); pump(G); await wait();
  assert.equal(W.ev("document.body.classList.contains('noc-still')"), false);
  W.ev("UI.anim='off';nocRender()");
  assert.equal(W.ev("document.body.classList.contains('noc-still')"), true, 'the Animations setting is respected');
  assert.deepEqual(W.errors, []);
});

test('a dead POP is an alarm, not a list full of Down: the hot ports stay, and picking that POP shows its own', async (t) => {
  const { G, W } = await pair(t);
  G.ev("ACT.buildPop({city:'ams'});ACT.buyIx({city:'ams',tier:0});S.pops.ams.down=S.day+5;compute();NOC.dirty=true"); pump(G); await wait();
  const rows = () => JSON.parse(W.ev("JSON.stringify([...document.querySelectorAll('.nw-port .nw-pt b')].map(e=>e.textContent))"));
  assert.equal(rows().includes('Amsterdam'), false);
  assert.equal(rows().includes('Frankfurt'), true);
  W.ev("NOCW.city='ams';nocRender()");
  assert.deepEqual(rows(), ['Amsterdam']);
  assert.match(W.ev("$('nwPorts').textContent"), /Down/);
  // A remote port at an exchange with no POP of ours is not down just because there is no POP.
  W.ev("NOCW.city=''");
  assert.equal(W.ev("nwDown({city:'syd',down:false})"), false);
  assert.deepEqual(W.errors, []);
});

test('the board\'s light text stays on the board: Details is the game\'s own dashboard on its own card', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'styles', '45-noc-window.css'), 'utf8');
  const body = css.match(/body\.noc-window\{([^}]*)\}/)[1];
  assert.doesNotMatch(body, /(^|;)\s*color:/, 'a colour on body would be inherited by the white dashboard card and its toasts');
  assert.match(css, /#nocBoard\{color:/);
});

test('the wallboard charts have the same tooltip, and the Details legend works in the window', async (t) => {
  const { G, W } = await pair(t);
  G.ev("S.hist=[];for(let d=1;d<=40;d++)S.hist.push({d,dem:100+d,srv:90+d,c:10,p:20,ix:30,t:40+d,l2:5,rev:1000+d*10,cost:900+d*5})");
  G.ev('NOC.dirty=true');pump(G);
  await settle(W.ev, '(S.hist||[]).length===40', 'the window got the history');
  W.ev('nocRender()');
  const doc = W.dom.window.document;
  const svg = doc.querySelector('svg.nw-chart[data-ch="traffic"]');
  assert.ok(svg, 'the wallboard traffic chart is tagged');
  assert.ok(doc.querySelector('svg.nw-chart[data-ch="money"]'), 'and so is the money chart');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 260, right: 900, bottom: 260 });
  svg.dispatchEvent(new W.dom.window.MouseEvent('pointermove', { clientX: 900 - 8, clientY: 100, bubbles: true }));   // the newest day
  const tip = doc.querySelector('.chtip');
  assert.ok(tip && !tip.hidden, 'the tooltip appears in the window');
  assert.match(tip.textContent, /Transit/);
  assert.equal(tip.textContent.includes('80.0 Gbps'), true, 'newest transit 40+40 Gbps');
  W.ev("nocView('details')");
  W.ev("UI.dtab='traffic';renderDash()");
  W.ev("ACT.chartToggle({c:'traffic',k:'t'})");
  assert.equal(W.ev("!!(UI.chartOff&&UI.chartOff.traffic&&UI.chartOff.traffic.t)"), true, "the legend changes the window's own view");
  assert.equal(G.ev("!!(UI.chartOff&&UI.chartOff.traffic)"), false, 'and does not travel to the game');
});

test('the stylesheet of the window leaves the chart tooltip and its cursor line alone', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'styles', '45-noc-window.css'), 'utf8');
  const hide = css.split('\n').find((l) => l.startsWith('body.noc-window>*:not(#nocBoard)'));
  assert.ok(hide, 'the rule that hides the game page is there');
  assert.ok(hide.includes(':not(.chtip)'), 'the tooltip stays');
  assert.ok(hide.includes(':not(.chcur)'), 'and so does its cursor line');
});

// The Streaming service's overview: the NOC dashboard's Streaming tab (src/game/94-dashboard/61-streaming-noc.js) and
// its map layer (src/game/96-map/86-streaming-layer.js). Only a Streaming service has either; the classic game keeps
// its tabs and its map exactly as they were.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A Streaming service in Frankfurt, live in Germany, France and the United States, a link to Amsterdam where the
// Netherlands leave the network (a haul over the backbone), and one Binge Box half full.
const start = (o = {}) => {
  const page = load();
  page.ev(`ACT.start({});ACT.charter({k:'content'});S.cash=1e9;UI.speed=0;S.nextFail=S.day+999;S.nextEvent=S.day+999;
    for(const cc of ['DE','FR','US'])ACT.cntLaunch({cc});ACT.buyTransit({city:S.home,net:'cog',tier:1});
    ACT.buildPop({city:'ams'});UI.pending={a:S.home,b:'ams'};ACT.buildLink({tier:1});ACT.buyTransit({city:'ams',net:'cog',tier:1});ACT.cntLaunch({cc:'NL'});
    S.cnt.box.push({id:'bx1',city:S.home,net:'dtk',day:S.day,f:0.5});${o.width ? `window.innerWidth=${o.width};` : ''}compute()`);
  return page;
};
const html = (ev) => ev("document.getElementById('dashCard').innerHTML");
const rows = (ev, sel) => JSON.parse(ev(`JSON.stringify([...document.querySelectorAll('${sel} .cnocrow')].map(e=>JSON.parse(e.dataset.args).city))`));

test('the classic game has no Streaming tab and draws no streaming layer', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;UI.speed=0;compute();ACT.dash()");
  assert.equal(ev("DTABS.includes('stream')"), false);
  assert.equal(ev("document.querySelectorAll('#dashCard .dtabs button').length"), ev('DTABS.length'));
  ev("ACT.dashTab({k:'stream'})");
  assert.equal(ev("UI.dtab||'overview'"), 'overview', 'the tab cannot be opened');
  ev("const C=CITY[S.home];cam.x=C.x;cam.y=C.y;cam.z=1.5;draw(0)");
  assert.equal(ev("CMAP.R"), null, 'the map never builds the layer');
  assert.deepEqual(errors, []);
});

test('the Streaming tab lists every country worst picture first, with what it earns and where it is served from', () => {
  const { ev, errors } = start();
  ev("ACT.dash();ACT.dashTab({k:'stream'})");
  assert.equal(ev("DTABS[1]"), 'stream', 'right after the overview');
  assert.equal(ev("UI.dtab"), 'stream');
  const cc = JSON.parse(ev("JSON.stringify(Object.keys(S.cnt.cc).map(k=>[k,ccQ(R,k)]).sort((a,b)=>a[1]-b[1]||(a[0]<b[0]?-1:1)))"));
  const shown = rows(ev, '#cnocCc');
  assert.equal(shown.length, 4);
  assert.equal(shown[0], ev(`ccInfo('${cc[0][0]}').main`), 'the worst picture is on top');
  assert.equal(shown[0], ev("ccInfo('US').main"), 'the far country is the worst one');
  const h = html(ev);
  assert.match(h, /Long way round/, 'the United States are flagged as far');
  assert.match(h, /🏛️ Frankfurt/, 'served from the Frankfurt origin');
  assert.match(h, /📡 Amsterdam/, 'the Netherlands leave the network in Amsterdam');
  // The countries add up to what the month bills.
  assert.ok(Math.abs(ev("cnocRows().reduce((a,r)=>a+r.rev,0)") - ev("cntRev(R)")) < 1e-6);
  assert.match(h, new RegExp(ev("tr('streaming_noc.t_picture')")));
  assert.deepEqual(errors, []);
});

test('the country list sorts by subscribers, revenue or name, and a second tap turns it round', () => {
  const { ev, errors } = start();
  ev("ACT.dash();ACT.dashTab({k:'stream'});ACT.cntNocSort({k:'subs'})");
  const big = JSON.parse(ev("JSON.stringify(Object.keys(S.cnt.cc).sort((a,b)=>S.cnt.cc[b].d-S.cnt.cc[a].d).map(k=>ccInfo(k).main))"));
  assert.deepEqual(rows(ev, '#cnocCc'), big);
  ev("ACT.cntNocSort({k:'subs'})");
  assert.deepEqual(rows(ev, '#cnocCc'), big.slice().reverse());
  ev("ACT.cntNocSort({k:'name'})");
  const names = JSON.parse(ev("JSON.stringify(Object.keys(S.cnt.cc).sort((a,b)=>ccName(a).toLowerCase()<ccName(b).toLowerCase()?-1:1).map(k=>ccInfo(k).main))"));
  assert.deepEqual(rows(ev, '#cnocCc'), names);
  ev("ACT.cntNocSort({k:'nonsense'})");
  assert.equal(ev("UI.cnocSort.k"), 'name', 'an unknown key changes nothing');
  assert.deepEqual(errors, []);
});

test('each origin shows its load and its hauls over the backbone, got against wanted', () => {
  const { ev, errors } = start();
  ev("ACT.dash();ACT.dashTab({k:'stream'})");
  assert.equal(ev("R.cnt.hj.filter(J=>J.v==='ams').reduce((a,J)=>a+J.got,0).toFixed(6)"), ev("R.cnt.haul.ams.got.toFixed(6)"), 'the per-origin hauls add up');
  let org = ev("document.getElementById('cnocOrg').textContent");
  assert.match(org, /Frankfurt/);
  assert.match(org, /→ Amsterdam/);
  assert.doesNotMatch(org, /Backbone full/);
  // More Dutch viewers than the wave carries: the haul comes up short, and says so.
  ev("S.cnt.cc.NL.d=200;compute();renderDash()");
  org = ev("document.getElementById('cnocOrg').textContent");
  assert.match(org, /Backbone full/);
  assert.match(ev("document.getElementById('cnocCc').textContent"), /Buffering/);
  assert.deepEqual(errors, []);
});

test('Binge Boxes show their host, how full they are and what they serve', () => {
  const { ev, errors } = start();
  ev("ACT.dash();ACT.dashTab({k:'stream'})");
  const box = ev("document.getElementById('cnocBox').textContent");
  assert.match(box, new RegExp(ev("NET.dtk.name")));
  assert.match(box, /Filling: 50%/);
  assert.match(box, /1 box/);
  ev("S.cnt.box=[];renderDash()");
  assert.match(ev("document.getElementById('cnocBox').textContent"), /No Binge Boxes yet/);
  assert.deepEqual(errors, []);
});

test('a row flies to its city at the Streaming tab', () => {
  const { ev, errors } = start();
  ev("ACT.dash();ACT.dashTab({k:'stream'})");
  ev("document.querySelector('#cnocCc .cnocrow').click()");
  assert.equal(ev("document.getElementById('dash').hidden"), true);
  assert.equal(ev("UI.sel.type+':'+UI.sel.id"), 'city:' + ev("ccInfo('US').main"));
  assert.equal(ev("UI.tab"), 'cust');
  assert.match(ev("document.getElementById('panel').textContent"), /United States/);
  assert.deepEqual(errors, []);
});

test('on a 360 px phone the tab is one column of cards, and long lists come a page at a time', () => {
  const { ev, errors } = start({ width: 360 });
  ev("for(const cc of Object.keys(CITIES.reduce((m,C)=>(m[C.cc]=1,m),{})))if(!S.cnt.cc[cc]&&ccInfo(cc)&&!ccWhy(cc))S.cnt.cc[cc]={d:2,since:S.day};compute();renderAll();ACT.dash();ACT.dashTab({k:'stream'})");
  assert.equal(ev("isPhone()"), true);
  const all = ev("Object.keys(S.cnt.cc).length");
  assert.ok(all > ev("LIST_PG.cntcc[0]"));
  assert.equal(rows(ev, '#cnocCc').length, ev("LIST_PG.cntcc[0]"));
  assert.equal(ev("document.querySelectorAll('#dashCard table').length"), 0, 'cards, no wide table');
  ev("document.querySelector('[data-act=cntNocMore]').click()");
  assert.equal(rows(ev, '#cnocCc').length, Math.min(all, ev("LIST_PG.cntcc[0]+LIST_PG.cntcc[1]")));
  assert.deepEqual(errors, []);
});

test('the map rings each country and marks origins and boxes, worked out once per routing, in 2D and on the card', () => {
  const { ev, errors } = start();
  ev("const C=CITY[S.home];cam.x=C.x;cam.y=C.y;cam.z=1.5;draw(0)");
  assert.equal(ev("CMAP.cc.length"), 4);
  assert.equal(ev("CMAP.org.map(o=>o.c).join()"), ev("S.home"));
  assert.equal(ev("CMAP.box.length"), 1);
  assert.equal(ev("CMAP.cc.find(o=>o.c===ccInfo('US').main).col"), ev("cqCol(ccQ(R,'US'))"), 'coloured by its picture');
  assert.notEqual(ev("CMAP.cc.find(o=>o.c===ccInfo('US').main).col"), '#22C47A', 'the buffering country is not green');
  assert.equal(ev("CMAP.cc.find(o=>o.c===ccInfo('US').main).bad"), true);
  assert.ok(ev("CMAP.cc.find(o=>o.c===ccInfo('US').main).r") > ev("CMAP.cc.find(o=>o.c===ccInfo('NL').main).r"), 'bigger audience, bigger ring');
  const keys = (m) => JSON.parse(ev(`JSON.stringify([...${m}.keys()].map(k=>k.split('|')[0]).filter(k=>/^c(ring|org|box)$/.test(k)))`));
  assert.deepEqual([...new Set(keys('SPRC'))].sort(), ['cbox', 'corg', 'cring'], 'drawn on the 2D map');
  // Another frame reuses the layer; a new routing builds it again.
  ev("window.__cm=CMAP.cc;draw(16);draw(32)");
  assert.equal(ev("CMAP.cc===window.__cm"), true);
  ev("compute();draw(48)");
  assert.equal(ev("CMAP.cc===window.__cm"), false);
  // Zoomed out (level of detail) it still draws.
  ev("cam.z=0.4;draw(64)");
  // On the card: the same pictures go to the atlas.
  ev(`(()=>{const gl=new Proxy({calls:[]},{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;return ()=>({});}});
    const c=document.getElementById('mapgl'),f=document.getElementById('mapfx'),P=()=>({p:{},u:{}}),B=()=>({v:{},b:{}});
    Object.assign(GLX,{want:true,dead:false,gl,c,f,fx:f.getContext('2d'),line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),dv:B(),cl:B(),empty:{},key:[],gpu:'stub'});
    GLS.prog=P();GLS.vao={};GLS.buf={};GLS.tex={};GLS.size=4096;SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;cam.z=1.5;draw(80);})()`);
  assert.equal(ev("glOn()"), true);
  assert.deepEqual([...new Set(keys('SPRS'))].sort(), ['cbox', 'corg', 'cring'], 'drawn on the card');
  assert.deepEqual(errors, []);
});

test('back in a classic game the Streaming tab goes away', () => {
  const { ev, errors } = start();
  ev("ACT.dash();ACT.dashTab({k:'stream'})");
  assert.equal(ev("DTABS.includes('stream')"), true);
  ev("$('dash').hidden=true;ACT.start({});UI.speed=0;compute();ACT.dash()");
  assert.equal(ev("content()"), false);
  assert.equal(ev("DTABS.includes('stream')"), false);
  assert.equal(ev("UI.dtab"), 'overview');
  assert.deepEqual(errors, []);
});

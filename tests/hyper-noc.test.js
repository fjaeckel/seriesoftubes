// The Hyperscaler in the NOC dashboard and on the map (94-dashboard/62-hyper-noc.js, 96-map/87-hyper-layer.js).
// The Cloud tab exists only in this charter: countries worst first, regions with load, power and backlog, region pairs
// with replication and training got against wanted and failover readiness (green when the replica has room and the
// backbone can carry it), hauls got against wanted. Its buttons are sorted into the NOC window's lists. The map layer
// draws rings, region badges, the glow between regions, the backlog's dashed glow and ⚡/📣 marks in 2D (the same frame
// from kept pictures as from fresh ones) and on the card (a recording stand-in), and nothing in a classic game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');
const { KIT, problems } = require('./helpers/map-2d-kit');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
function net(t) {
  const h = load({ seed: 13 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;for(const c of ['par','ams','lon'])ACT.buildPop({city:c});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','ams','lon'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.par={t:0,ready:0,mw:5};S.hs.rg.ams={t:0,ready:0,mw:5};S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:200,since:0};S.hs.cc.GB={d:150,since:0};S.hs.rep.fra='ams';S.links=[];" +
    wave('fp', 'fra', 'par', 3) + wave('fa', 'fra', 'ams', 3) + wave('ap', 'ams', 'par', 3) + wave('al', 'ams', 'lon', 2) +
    "S.hs.jobs.push({id:'job0',n:'Overfit and Sons',a:'fra',b:'par',g:800,tb:1e5,done:0,due:S.day+40,fee:1e6,start:S.day});" +
    "S.hs.prot.par={until:S.day+40,kind:'delay',g:1,on:'rg'};S.hs.lag['par>fra']=70;compute();hsDay(S.day);S.log=[]");
  return h;
}
const sizes = [[360, 740, 'portrait'], [740, 360, 'landscape'], [1280, 800, 'desktop']];

test('the NOC dashboard has a Cloud tab in this charter only', (t) => {
  const { ev, dom, errors } = net(t);
  const doc = dom.window.document;
  for (const [w, h, name] of sizes) {
    ev(`innerWidth=${w};innerHeight=${h};$('dash').hidden=false;UI.dtab='overview';UI._dh=null;renderDash()`);
    const tabs = [...doc.querySelectorAll('#dashCard .dtabs button')].map((b) => JSON.parse(b.dataset.args).k);
    assert.equal(tabs[1], 'cloud', `right after the overview (${name})`);
    ev("ACT.dashTab({k:'cloud'})");
    const card = doc.getElementById('dashCard'), txt = card.textContent;
    assert.match(txt, /Countries[\s\S]*Regions[\s\S]*Region pairs[\s\S]*Hauls to front doors/);
    // Countries worst first.
    const qs = [...card.querySelectorAll('#hnocCc .lpct')].map((b) => parseInt(b.textContent, 10));
    assert.equal(qs.length, 3);
    assert.deepEqual(qs, qs.slice().sort((a, b) => a - b), 'worst served first');
    // Regions: load, power, backlog; the protest flagged.
    assert.match(card.querySelector('#hnocRg').textContent, /Paris[\s\S]*MW of a \d+ MW grid[\s\S]*Protest/);
    // Pairs: replication, training and failover readiness, green or red as hsFailInfo says.
    const pr = card.querySelector('#hnocPr').textContent;
    assert.match(pr, /Frankfurt → Amsterdam: .* of /);
    assert.match(pr, /1 AI run: .* of /);
    assert.match(pr, /Backlog/i);
    const ok = ev("hsFailInfo('fra','ams').ok");
    assert.match(pr, ok ? /Frankfurt → Amsterdam: failover ready/ : /Frankfurt → Amsterdam would not hold/);
    assert.equal(!!card.querySelector('#hnocPr .tag.open'), ev("Object.keys(R.hs.rep).some(a=>hsFailInfo(a,R.hs.rep[a].b).ok)"));
    // Hauls got against wanted, from R.hs.hl.
    assert.ok(ev('Object.keys(R.hs.hl).length') > 0);
    assert.match(card.querySelector('#hnocHl').textContent, / → .* of /);
    assert.equal(ev("[...document.querySelectorAll('#dashCard .btns')].every(b=>b.querySelectorAll('button').length<=2)"), true, `rows of two at most (${name})`);
  }
  // Sorting, paging and a row's tap.
  ev("ACT.hsNocSort({k:'name'})");
  assert.deepEqual([...doc.querySelectorAll('#hnocCc .nm')].map((n) => n.firstChild.textContent.trim()), ['France', 'Germany', 'United Kingdom']);
  ev("ACT.hsNocSort({k:'name'})");
  assert.equal(doc.querySelector('#hnocCc .nm').firstChild.textContent.trim(), 'United Kingdom', 'a second tap turns it round');
  ev("ACT.hsNocMore({k:'hscc'});ACT.hsNocSort({k:'zz'});ACT.hsNocMore({k:'zz'})");
  ev("ACT.hsNocGo({city:'par'})");
  assert.equal(ev("$('dash').hidden"), true);
  assert.equal(ev('UI.sel.id+UI.tab'), 'parcust', 'its Cloud tab');
  // Every button the tab draws is on one of the NOC window's lists.
  const seen = JSON.parse(ev("(()=>{$('dash').hidden=false;UI.dtab='cloud';UI._dh=null;renderDash();return JSON.stringify([...new Set([...document.querySelectorAll('#dashCard [data-act]')].map(e=>e.dataset.act))])})()"));
  const lists = JSON.parse(ev('JSON.stringify([...NOC_LOCAL,...NOC_GO])'));
  assert.deepEqual(seen.filter((x) => !lists.includes(x)), []);
  assert.deepEqual(errors, []);
});

test('a classic game has no Cloud tab, and asking for one changes nothing', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});$('dash').hidden=false;UI.dtab='overview';renderDash()");
  assert.equal(ev("DTABS.includes('cloud')"), false);
  ev("ACT.dashTab({k:'cloud'})");
  assert.equal(ev('UI.dtab'), 'overview');
  assert.equal(ev("hsNocTab()"), '');
  assert.equal(ev('R.hs'), undefined);
  assert.deepEqual(errors, []);
});

test('the map layer draws in 2D, from kept pictures as from fresh ones, and on the card', (t) => {
  const { ev, errors } = net(t);
  ev("UI.started=true;UI.pitched=true;UI.speed=0;window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});mapGl(false);");
  ev(KIT);
  ev("const C=CITY.fra;cam.x=C.x;cam.y=C.y;cam.z=1.4;");
  const M = JSON.parse(ev('(()=>{const M=hmapGet(mapLinks(S.day));return JSON.stringify({cc:M.cc.length,rg:M.rg.map(x=>x.c),mk:M.mk.map(x=>x.c+x.k),glow:M.glow.length,lag:M.lag.length+M.lagG.length})})()'));
  assert.equal(M.cc, 3, 'a ring per country');
  assert.deepEqual(M.rg, ['ams', 'fra', 'par'], 'a badge per region');
  assert.ok(M.mk.includes('parprot'), 'the protest is marked');
  assert.ok(M.glow > 0, 'replication and training glow along the tubes they use');
  assert.ok(M.lag > 0, 'the backlog has its dashed glow');
  for (const [w, h] of sizes) {
    ev(`innerWidth=${w};innerHeight=${h};`);
    const f = JSON.parse(ev('JSON.stringify(__M2D.frame(__T+=16))'));
    assert.ok(f.some((s) => /stroke\(\) .*rgba\(150,110,255/.test(s)), 'the glow is stroked');
    assert.ok(f.some((s) => /setLineDash\(\[10,8\]\)/.test(s)), 'the backlog is dashed');
    const iGlow = f.findIndex((s) => /rgba\(150,110,255/.test(s)), iTube = f.findIndex((s) => /stroke\(\) .*#1E2640/.test(s));
    assert.ok(iGlow < iTube, 'under the tubes');
    // A frame from kept pictures is call for call the frame from fresh ones.
    const p = problems(JSON.parse(ev('JSON.stringify(__M2D.pair(__T))')), `${w}px`);
    assert.deepEqual(p, []);
  }
  // Geometry is worked out once per routing and day, not per frame.
  ev('window.__hm=HMAP.glow;draw(__T+=16);draw(__T+=16)');
  assert.equal(ev('window.__hm===HMAP.glow'), true);
  ev('compute();draw(__T+=16)');
  assert.equal(ev('window.__hm===HMAP.glow'), false);
  // On the card: a recording stand-in for WebGL2.
  ev(`(()=>{const calls=[];const gl=new Proxy({calls},{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;return (...a)=>{calls.push(k);return {};};}});
    const c=document.getElementById('mapgl'),f=document.getElementById('mapfx');const P=()=>({p:{},u:{}}),B=()=>({v:{},b:{}});const fx=document.createElement('canvas').getContext('2d');
    Object.assign(GLX,{want:true,dead:false,gl,c,f,fx,line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),dv:B(),cl:B(),empty:{},key:[],gpu:'stub'});
    GLS.prog=P();GLS.vao={};GLS.buf={};GLS.tex={};GLS.size=4096;SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;})()`);
  ev('GLX.gl.calls.length=0;draw(__T+=16)');
  assert.equal(ev('glOn()&&!GLX.dead'), true, 'still on the card');
  assert.ok(ev('HMAP.glN') > 0, 'the glow went into a buffer');
  const calls = JSON.parse(ev('JSON.stringify(GLX.gl.calls)'));
  assert.ok(calls.filter((c) => c === 'drawArraysInstanced').length > 0);
  const n0 = ev("GLX.gl.calls.filter(c=>c==='bufferData').length");
  ev('GLX.gl.calls.length=0;draw(__T+=16)');
  assert.ok(ev("GLX.gl.calls.filter(c=>c==='bufferData').length") < n0 + 1, 'the glow buffer is not built again every frame');
  assert.deepEqual(errors, []);
});

test('a classic game draws no Hyperscaler layer', () => {
  const { ev, errors } = load({ seed: 3 });
  const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  ev(`S=migrate(JSON.parse(${lit(save)}));UI.started=true;UI.speed=0;compute();mapGl(false);window.__hm=0;const g=hsMapGlow,r=hsMapRings,b=hsMapBadges;hsMapGlow=hsMapRings=hsMapBadges=()=>{__hm++};draw(1000);hsMapGlow=g;hsMapRings=r;hsMapBadges=b;`);
  assert.equal(ev('window.__hm'), 0, 'not even called');
  assert.equal(ev('HMAP.R'), null);
  assert.deepEqual(errors, []);
});

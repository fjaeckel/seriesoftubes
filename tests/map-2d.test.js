// The 2D map, for players who keep it (Settings › Map drawing › Always 2D, or no usable graphics card). The WebGL work
// changed it too: cities, labels and markers are painted once as pictures and reused (59-gl-sprites.js), and each
// tube's look is worked out once per day's routing (mapLinks(), 55-link-look.js). These tests hold the 2D map to what
// it drew before:
// - a frame drawn with the pictures kept from earlier states is, call for call, the frame painted from scratch: no
//   picture is ever shown for a state it was not painted for (on the big network, and in seeded random games);
// - every tube's width, colour, dash and packets follow the formulas main's 2D map used, after every move and day;
// - the 2D map never asks for WebGL, never draws a picture it has no canvas for, and keeps one canvas per picture;
// - every picture starts with the pen main's map had when it drew the same thing straight on the map (round line
//   ends, centred text), or its dashed rings and markers would come out differently.
// The page's clock is set by hand, so nothing depends on how fast the test runs. Comparing pixels with main needs a real
// browser, which npm test does not use: that was done by hand, in Chromium, for this change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./harness');
const page = require('../scripts/lib/page');
const { openPage, playGame, rng } = require('../scripts/lib/route-fuzz');
const { lit } = require('../scripts/lib/js-literal');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

/* In the page: every canvas made from now on records what is drawn on it, and the map's own context records the
   frame. A picture is known by what was painted on it (a hash of its calls), so a frame's calls say which picture went
   where. WebGL is not there (getContext gives null for it), and every request for it is counted. */
const KIT = `window.__M2D=(()=>{
  const N=v=>typeof v==='number'?String(Math.round(v*1000)/1000):v==null?String(v):typeof v==='function'?'fn':
    v instanceof HTMLCanvasElement?v.__cid():Array.isArray(v)?'['+v.map(N).join(',')+']':typeof v==='object'?'obj':String(v);
  const M=['arc','arcTo','beginPath','bezierCurveTo','clearRect','clip','closePath','drawImage','ellipse','fill','fillRect','fillText',
    'lineTo','moveTo','quadraticCurveTo','rect','resetTransform','restore','rotate','roundRect','save','scale','setLineDash','setTransform',
    'stroke','strokeRect','strokeText','transform','translate'];
  // With each call that paints, the state of the context it uses (a picture does not care about the font, say).
  const IMG=['globalAlpha','globalCompositeOperation'],FILL=[...IMG,'fillStyle'],LINE=[...IMG,'strokeStyle','lineWidth','lineDashOffset','lineJoin','lineCap'],
    TXT=['font','textAlign','textBaseline'];
  const PAINT={drawImage:IMG,clearRect:[],fill:FILL,fillRect:FILL,stroke:LINE,strokeRect:LINE,fillText:[...FILL,...TXT],strokeText:[...LINE,...TXT]};
  const DEF={globalAlpha:1,fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,font:'10px sans-serif',lineDashOffset:0,lineJoin:'miter',lineCap:'butt',
    textAlign:'start',textBaseline:'alphabetic',globalCompositeOperation:'source-over'};
  function rec(c,keep){const Q={h:2166136261,n:0,log:keep?[]:null};
    const add=s=>{for(let i=0;i<s.length;i++)Q.h=Math.imul(Q.h^s.charCodeAt(i),16777619)>>>0;Q.n++;if(Q.log)Q.log.push(s);};
    for(const m of M)c[m]=function(...a){let s=m+'('+a.map(N).join(',')+')';for(const k of PAINT[m]||[])s+=' '+N(this[k]);add(s);};
    Object.assign(c,DEF);c.__Q=Q;return c;}
  const blank=()=>new Proxy({},{get(t,k){if(k in t)return t[k];if(k==='measureText')return s=>({width:String(s).length*7});
    if(k==='createLinearGradient'||k==='createRadialGradient'||k==='createPattern')return ()=>({addColorStop(){}});
    if(k==='getImageData')return ()=>({data:new Uint8ClampedArray(4)});if(k==='canvas')return null;return ()=>{};},set(t,k,v){t[k]=v;return true;}});
  const asked=[];
  HTMLCanvasElement.prototype.getContext=function(type){asked.push(type);if(type!=='2d')return null;return this.__ctx||(this.__ctx=rec(blank(),false));};
  HTMLCanvasElement.prototype.__cid=function(){const q=this.__ctx&&this.__ctx.__Q;return q?'cv:'+q.h.toString(36)+'.'+q.n:'cv:?';};
  rec(CTX0,true);
  // A picture drawn in a 2D frame without a canvas of its own would simply not show.
  let lost=0;const blit0=blit;blit=function(e,...a){if(!GLS.frame&&!e.cv)lost++;return blit0(e,...a);};
  // One frame's calls on the map's canvas, from a known state of the context.
  function frame(t){const Q=CTX0.__Q;Q.log.length=0;Q.h=2166136261;Q.n=0;Object.assign(CTX0,DEF);draw(t);return Q.log.slice();}
  function inv(){let dup=0,bad=0;const seen=new Set();
    for(const e of SPRC.values()){if(!e.cv){bad++;continue;}if(seen.has(e.cv))dup++;seen.add(e.cv);if(e.cv.width!==e.pw||e.cv.height!==e.ph)bad++;}
    return {webgl:asked.filter(x=>x!=='2d').length,sprs:SPRS.size,glsFrame:GLS.frame,ctx0:ctx===CTX0,glShown:!document.getElementById('mapgl').hidden,
      pad:!!GLS_PAD.cv,shared:dup,badCanvas:bad,lost};}
  // Without the cache: every picture is painted again for every call, as if nothing were kept, even within a frame.
  let nocache=false;const none={get(){},set(){},has:()=>false,size:0},sprMap0=sprMap;sprMap=function(){const m=sprMap0();return nocache?none:m;};
  /* The same state drawn twice: with the pictures kept from every state before (kept), then painting every picture
     again (fresh). The land picture is settled first, so both frames find it as it is. */
  function pair(t){__T+=1000;if(S)worldLayer(cam.z);lost=0;
    const kept=frame(t),had=SPRC.size;nocache=true;let fresh;try{fresh=frame(t);}finally{nocache=false;}
    let d=-1;for(let i=0,n=Math.max(kept.length,fresh.length);i<n;i++)if(kept[i]!==fresh[i]){d=i;break;}
    return {calls:fresh.length,had,diff:d<0?null:{at:d,kept:kept.slice(Math.max(0,d-2),d+2),fresh:fresh.slice(Math.max(0,d-2),d+2)},...inv()};}
  // How main's 2D map worked out a tube's look, frame by frame (its drawFrame() before this change), word for word.
  function ref(grp,day){const l=grp[0],many=grp.length>1,up=many?grp.filter(x=>!linkDown(x)):null;
    const cap=many?up.reduce((a,x)=>a+capOf(x),0):capOf(l),load=many?grp.reduce((a,x)=>a+(R.load[x.id]||0),0):(R.load[l.id]||0),u=cap?load/cap:0,df=l.kind==='df',bld=df&&l.ready>day,cut=!bld&&(many?!up.length:linkDown(l))&&!(df&&!(l.ch||[]).length),dark=df&&!bld&&!(l.ch||[]).length,vx=l.kind==='vxc',idle=!cut&&!bld&&load<1e-3&&(many?up.length>0&&up.every(x=>x.standby):!!l.standby);
    const w=(vx?2.2:(2.5+Math.max(...grp.map(tierW))*1.8+(many?Math.min(1.5,(grp.length-1)*0.5):0)));
    return {w,dash:cut?[8,8]:vx?[2,7]:bld?[10,8]:idle?[4,6]:[],col:bld?'#C9B27C':dark?'#5D6788':cut?'#FF4D5E':idle?'#9AA3BE':vx?FAB[l.prov].col:l.sub?(u>0.001?utilCol(u):'#7FD8EE'):utilCol(u),
      pk:!cut&&load>0.01?clamp(Math.round(2+u*10),2,12):0,cut,bld,dark,vx,cap,load,up:up&&up.map(x=>x.id)};}
  // The kept looks (mapLinks) against groups, geometry and looks worked out again now, the way main did.
  function looks(){if(!S||!R)return [];const ML=mapLinks(S.day),PI=pairIdx(),LG=linkGroups(),bad=[];
    if(JSON.stringify(ML.LG.map(g=>g.map(l=>l.id)))!==JSON.stringify(LG.map(g=>g.map(l=>l.id))))return ['the tubes are not grouped as now'];
    LG.forEach((g,i)=>{const gm=linkGeom(g[0],PI.get(edgeKey(g[0])));if(JSON.stringify(gm.pts)!==JSON.stringify(ML.GM[i].pts))bad.push('geometry of '+g[0].id);
      const n=ML.looks[i],o=JSON.stringify(ref(g,S.day)),m=JSON.stringify({w:n.w0,dash:LDASH[n.dash],col:n.col,pk:n.pk,cut:n.cut,bld:n.bld,dark:n.dark,vx:n.vx,cap:n.cap,load:n.load,up:n.up&&n.up.map(x=>x.id)});
      if(o!==m)bad.push(g[0].id+': main '+o+' kept '+m);});
    return bad.slice(0,3);}
  /* A view of the map: the camera on a city at a zoom, maybe a city or a tube selected, maybe a city under the
     pointer, at clock t. u: numbers in [0,1) from the test's own seeded generator. */
  function view(u){if(!S)return null;const pops=Object.keys(S.pops),at=pops.length&&u[0]<.7?pops[Math.floor(u[1]*pops.length)]:CITIES[Math.floor(u[1]*CITIES.length)].id,C=CITY[at];
    cam.x=C.x+(u[2]-.5)*80;cam.y=C.y+(u[3]-.5)*60;cam.z=[.45,.7,1,1.6,3.2][Math.floor(u[4]*5)];
    UI.sel=u[5]<.35?null:u[5]<.6?{type:'city',id:at}:S.links.length?{type:'link',id:S.links[Math.floor(u[6]*S.links.length)].id}:null;
    UI.hover=u[7]<.3?at:null;return Math.floor(u[8]*20000);}
  function check(u){const keep={x:cam.x,y:cam.y,z:cam.z,sel:UI.sel,hov:UI.hover};
    try{const t=view(u);if(t===null)return null;const r=pair(t);r.looks=looks();r.view={at:UI.sel,z:cam.z,t};return r;}
    finally{cam.x=keep.x;cam.y=keep.y;cam.z=keep.z;UI.sel=keep.sel;UI.hover=keep.hov;}}
  return {frame,pair,inv,looks,check,view,asked};})();0`;

// What a check returned, as the problems it shows (none: an empty list).
function problems(r, where) {
  if (!r) return [];
  const out = [];
  if (r.diff) out.push(`${where}: a kept picture differs from a fresh one at call ${r.diff.at}\n  kept:  ${r.diff.kept.join('\n         ')}\n  fresh: ${r.diff.fresh.join('\n         ')}`);
  for (const l of r.looks || []) out.push(`${where}: ${l}`);
  if (r.webgl) out.push(`${where}: WebGL asked for ${r.webgl} times`);
  if (r.lost) out.push(`${where}: ${r.lost} pictures drawn without a canvas`);
  if (r.shared || r.badCanvas) out.push(`${where}: ${r.shared} pictures share a canvas, ${r.badCanvas} have none or one of the wrong size`);
  if (r.pad) out.push(`${where}: the card's shared canvas was made`);
  if (r.sprs || r.glsFrame || !r.ctx0 || r.glShown) out.push(`${where}: card state leaked into 2D ${lit({ sprs: r.sprs, glsFrame: r.glsFrame, ctx0: r.ctx0, glShown: r.glShown })}`);
  return out;
}

// A card that records what it is asked (jsdom has no WebGL), as in tests/webgl-zoom-sprites.test.js.
const GLSTUB = `window.__GLSTUB=(()=>{const calls=[];const gl=new Proxy({calls},{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
      return (...a)=>{calls.push(k);return {};};}});
    const c=document.getElementById('mapgl'),f=document.getElementById('mapfx');const P=()=>({p:{},u:{}}),B=()=>({v:{},b:{}});
    const fx=document.createElement('canvas').getContext('2d');
    Object.assign(GLX,{want:true,dead:false,gl,c,f,fx,line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),dv:B(),cl:B(),empty:{},key:[],gpu:'stub'});
    GLS.prog=P();GLS.vao={};GLS.buf={};GLS.tex={};GLS.size=4096;SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;return gl;})();0`;

function open() {
  const h = load({ seed: 777 });
  h.ev(`S=migrate(JSON.parse(${lit(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();S.nextFail=S.day+999;S.nextEvent=S.day+999;compute();
    window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});mapGl(false);`);
  h.ev(KIT);
  return h;
}

test('the 2D map draws the same frame from kept pictures as from fresh ones, whatever happens to a POP', () => {
  const { ev, errors } = open();
  const found = [];
  assert.ok(ev('CW>300&&CH>300'), 'the map has a size');
  // One city goes through every state its picture can show. After each change the map is looked at from the same
  // views (every zoom, plain, under the pointer, selected), so a picture kept from an earlier state is found under its
  // key whenever the key leaves out what changed.
  const STEPS = [
    '0',
    'S.pops[S.home].down=S.day+3',
    'S.pops[S.home].down=0;S.pops[S.home].routers=2',
    'S.pops[S.home].gen=1',
    'S.pops[S.home].rgen=1',
    'S.pops[S.home].site2=S.pops[S.home].site2||{}',
    'S.pops[S.home].ringcut=S.day+2',
    "S.inc.push({id:'t-site',type:'site',ref:S.home,site:'b',until:S.day+5})",
    'R.ddosHot=Object.assign({},R.ddosHot,{[S.home]:1})',
    'UI.hotMap={[S.home]:{r:1,t:1,ix:1}}',
    "S.myIx[S.home]=S.myIx[S.home]||{name:'Test-IX',members:[],next:S.day+4}",
    'S.pops[S.home].routers=3;S.pops[S.home].rgen=0;S.pops[S.home].gen=0',
    'delete R.ddosHot[S.home];UI.hotMap=null;S.pops[S.home].ringcut=0',
    'S.pops[S.home].down=S.day+1',
    // A city without a POP next to it: an incident there, then an exchange.
    "S.inc.push({id:'t-x',type:'cut',ref:__OTHER,until:S.day+3})",
    "S.myIx[__OTHER]={name:'Other-IX',members:[],next:S.day+4}",
  ];
  // The other city: the nearest one without a POP.
  ev("window.__OTHER=CITIES.filter(c=>!S.pops[c.id]&&!c.off).sort((a,b)=>Math.hypot(a.x-CITY[S.home].x,a.y-CITY[S.home].y)-Math.hypot(b.x-CITY[S.home].x,b.y-CITY[S.home].y))[0].id;0");
  let checks = 0;
  // u (see view()): centred on the home POP or on the other city, at zoom index z; nothing selected, the city under
  // the pointer, or selected.
  const VIEWS = [];
  for (const city of ['pop', 'other']) for (let z = 0; z < 5; z++) for (const [sel, hov] of [[0.1, 0.9], [0.1, 0.1], [0.5, 0.9]]) VIEWS.push({ city, u: [city === 'pop' ? 0 : 0.9, 0, 0.5, 0.5, z / 5 + 0.01, sel, 0, hov, (z + 1) / 7] });
  for (const step of STEPS) {
    ev(step);
    // Each change is looked at from the city it touches (both at the start).
    const on = step === '0' ? null : step.includes('__OTHER') ? 'other' : 'pop';
    VIEWS.forEach(({ city, u }, v) => {
      if (on && city !== on) return;
      const at = city === 'pop' ? 'Object.keys(S.pops).indexOf(S.home)/Object.keys(S.pops).length' : 'CITIES.findIndex(c=>c.id===__OTHER)/CITIES.length';
      ev(`window.__U=${lit(u)};__U[1]=${at}+1e-9;0`);
      found.push(...problems(JSON.parse(ev('JSON.stringify(__M2D.check(__U))')), `after "${step}", view ${v} (${city})`));
      checks++;
    });
  }
  assert.ok(checks >= 250);
  assert.deepEqual(found.slice(0, 5), []);
  assert.deepEqual(errors, []);
});

test('the 2D map draws the same from kept pictures as from fresh ones, and tubes as main did, over random views of the big network', () => {
  const { ev, errors } = open();
  const r = rng(99), found = [];
  for (let i = 0; i < 60; i++) {
    // Now and then a day passes (failures and events on), so cuts, builds, floods and offers come and go.
    if (i % 6 === 5) ev('S.nextFail=S.day;S.nextEvent=S.day;dayTick();compute();');
    const u = Array.from({ length: 9 }, () => r());
    found.push(...problems(JSON.parse(ev(`JSON.stringify(__M2D.check(${lit(u)}))`)), `view ${i} (day ${ev('S.day')})`));
  }
  assert.deepEqual(found.slice(0, 5), []);
  assert.deepEqual(errors, []);
});

test('in seeded random games, after every move and day, the 2D map draws the same from kept pictures and tubes as main did', () => {
  const file = path.join(os.tmpdir(), `tubes-map2d-${process.pid}.html`);
  fs.writeFileSync(file, page.assemble().html);
  try {
    // A normal game, a sandbox, a scenario and a puzzle (the seeds of tests/route-fuzz.test.js). The big network is the
    // test above: a whole game of it, routed again after every move on two pages, takes a minute.
    for (const seed of [20, 23, 27, 26]) {
      // Two pages of this checkout play the game in lockstep (scripts/lib/route-fuzz.js): drawing the map on both, between
      // moves, must not make them part (the 2D map must not change the game).
      const P = { base: openPage(file, 'a'), head: openPage(file, 'b') };
      for (const p of [P.base, P.head]) p.ev(`window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});mapGl(false);${KIT}`);
      const r = rng(seed * 7919), found = [];
      let checks = 0;
      const g = playGame(P, seed, { moves: 40, maxDays: 4, onMove: () => {
        const u = Array.from({ length: 9 }, () => r());
        for (const p of [P.base, P.head]) {
          const out = JSON.parse(p.ev(`JSON.stringify(__M2D.check(${lit(u)}))`));
          if (out) checks++;
          found.push(...problems(out, `seed ${seed}, page ${p.label}`));
        }
      } });
      assert.equal(g.div, null, `seed ${seed}: the two pages parted: ${lit(g.div && { where: g.div.where, last: g.div.last })}`);
      assert.ok(checks >= 20, `seed ${seed}: the map was checked (${checks})`);
      assert.deepEqual(found.slice(0, 5), [], `seed ${seed}`);
      assert.deepEqual(g.errors, [], `seed ${seed}`);
    }
  } finally { fs.rmSync(file, { force: true }); }
});

test('a 2D map without WebGL2 never asks for it again, and its pictures each keep their own canvas', () => {
  const h = load({ seed: 777 });
  // Auto mode, in a browser where WebGL2 is not there.
  h.ev(`S=migrate(JSON.parse(${lit(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();
    window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});`);
  h.ev(KIT);
  h.ev('mapGl(true,false);draw(__T);');
  const first = JSON.parse(h.ev('JSON.stringify({asked:__M2D.asked.filter(x=>x!=="2d").length,gl:!!GLX.gl,glOn:glOn()})'));
  assert.equal(first.gl, false);
  assert.equal(first.glOn, false, 'auto mode draws in 2D');
  for (let i = 0; i < 20; i++) h.ev(`cam.z=${0.5 + i * 0.15};__T+=16;draw(__T);`);
  const inv = JSON.parse(h.ev('JSON.stringify(__M2D.inv())'));
  assert.ok(inv.webgl <= first.asked, `WebGL was asked for again (${inv.webgl} after ${first.asked})`);
  assert.deepEqual(problems({ ...inv, webgl: 0 }, 'zoom'), []);
  assert.ok(h.ev('SPRC.size') > 50, 'the pictures are kept');
  assert.deepEqual(h.errors, []);
});

test('the 2D map after the card is given up, or switched off, draws as a 2D map that never had one', () => {
  const { ev, errors } = open();
  // A card (a recording stand-in) draws a few frames and fills its own pictures.
  ev(GLSTUB);
  const views = (tag) => {
    const out = [];
    for (let v = 0; v < 8; v++) {
      const u = [0.2, v / 8, 0.5, 0.5, (v % 5) / 5 + 0.01, v / 8, 0.3, v % 2 ? 0.1 : 0.9, v / 8];
      out.push(...problems(JSON.parse(ev(`JSON.stringify(__M2D.check(${lit(u)}))`)), `${tag}, view ${v}`));
    }
    return out;
  };
  // Switched off in the settings, with the card's pictures still kept.
  for (let i = 0; i < 6; i++) ev(`cam.z=${0.5 + i * 0.4};__T+=16;draw(__T);`);
  assert.ok(ev('SPRS.size') > 20, 'the card painted its pictures');
  ev('mapGl(false)');
  // pad and sprs: the card's own, left from its frames; what matters is that the 2D frames never use them.
  const off = views('switched off').filter((p) => !/card's shared canvas|card state leaked/.test(p) || /ctx0":false|glShown":true|glsFrame":true/.test(p));
  assert.deepEqual(off.slice(0, 5), []);
  // Back on, then the card fails: the session's map stays 2D.
  ev('mapGl(true);__T+=16;draw(__T);glKill(new Error("test"));');
  assert.equal(ev('SPRS.size'), 0, 'the card’s pictures are forgotten');
  const dead = views('given up').filter((p) => !/card's shared canvas/.test(p));
  assert.deepEqual(dead.slice(0, 5), []);
  assert.deepEqual(errors, []);
});

test('the 2D map paints its pictures again for a new pixel density', () => {
  const { ev, errors } = open();
  ev('__T+=16;draw(__T);');
  assert.ok(ev('SPRC.size') > 20);
  ev('DPR=2;__T+=16;draw(__T);');
  const bad = JSON.parse(ev('JSON.stringify([...SPRC.values()].filter(e=>e.pw!==Math.ceil(e.w*2)||e.ph!==Math.ceil(e.h*2)).length)'));
  assert.equal(bad, 0, 'every picture is at the new density');
  const r = JSON.parse(ev('JSON.stringify(__M2D.check([0,0,0.5,0.5,0.5,0.1,0,0.9,0.3]))'));
  assert.deepEqual(problems(r, 'at 2×'), []);
  assert.deepEqual(errors, []);
});

test('money pop-ups on the 2D map fade out as before', () => {
  const { ev, errors } = open();
  const C = 'CITY[S.home]';
  ev(`cam.x=${C}.x;cam.y=${C}.y;cam.z=1;__T+=16;FLOATS.push({x:${C}.x,y:${C}.y,text:'+$1,234',col:'#16A866',s:S,t:__T});`);
  // At 0, 40% and 80% of its life: drawn at opacity 1-a².
  const alphas = [];
  for (const a of [0, 0.4, 0.8]) {
    const log = JSON.parse(ev(`JSON.stringify(__M2D.frame(FLOATS[FLOATS.length-1].t+${a * 1600}))`));
    const last = log.filter((s) => s.startsWith('drawImage(')).pop();
    alphas.push(+last.split(' ')[1]);
  }
  assert.deepEqual(alphas, [1, 0.84, 0.36]);
  ev(`__M2D.frame(FLOATS[FLOATS.length-1].t+1700)`);
  assert.equal(ev('FLOATS.length'), 0, 'gone after its life');
  // The same text in two colours at once: two pictures, each in its own colour.
  ev(`FLOATS.push({x:${C}.x,y:${C}.y,text:'+$500',col:'#16A866',s:S,t:5000},{x:${C}.x+40,y:${C}.y,text:'+$500',col:'#FF4D5E',s:S,t:5000});`);
  const r = JSON.parse(ev('JSON.stringify(__M2D.pair(5400))'));
  assert.deepEqual(problems(r, 'two pop-ups'), []);
  assert.deepEqual(errors, []);
});

test('every picture starts with the pen the map had when it drew them itself: round line ends and corners, centred text', () => {
  const { ev, errors } = open();
  // Drawn straight on the map, main's dashed rings, cones and "zzz" took the state the tubes and labels left there.
  let n = 0;
  const pen = (spoil) => JSON.parse(ev(`(()=>{let o;spriteEntry('t-pen|${n++}',10,10,5,5,g=>{o={cap:g.lineCap,join:g.lineJoin,align:g.textAlign,base:g.textBaseline};
    ${spoil ? "g.lineCap='butt';g.lineJoin='miter';g.textAlign='start';g.textBaseline='alphabetic';" : ''}});return JSON.stringify(o);})()`));
  const want = { cap: 'round', join: 'round', align: 'center', base: 'middle' };
  assert.deepEqual(pen(true), want, 'a 2D picture');
  assert.deepEqual(pen(false), want, 'the next 2D picture');
  // On the card one canvas is reused for every picture: each starts from that pen again, whatever the last one did.
  ev(GLSTUB);
  ev('GLS.frame=true;');
  try {
    assert.deepEqual(pen(true), want, 'a picture on the card');
    assert.deepEqual(pen(false), want, 'the next picture on the card, on the same canvas');
    assert.ok(ev('!!GLS_PAD.cv&&SPRS.size>=2'), 'the card’s pictures went through its shared canvas');
  } finally { ev('GLS.frame=false;'); }
  assert.deepEqual(errors, []);
});

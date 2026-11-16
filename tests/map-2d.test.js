// The 2D map, for players who keep it (Settings › Map drawing › Always 2D, or no usable graphics card). The WebGL work
// changed it too: cities, labels and markers are painted once as pictures and reused (59-gl-sprites.js), and each
// tube's look is worked out once per day's routing (mapLinks(), 55-link-look.js). These tests hold the 2D map to what
// it drew before:
// - a frame drawn with the pictures kept from earlier states is, call for call, the frame painted from scratch: no
//   picture is ever shown for a state it was not painted for (on the big network here, and in the seeded random games
//   of tests/route-fuzz.test.js, which draw the map on this checkout's page between moves: helpers/map-2d-kit.js);
// - every tube's width, colour, dash and packets follow the formulas main's 2D map used, after every move and day;
// - the 2D map never asks for WebGL, never draws a picture it has no canvas for, and keeps one canvas per picture;
// - every picture starts with the pen main's map had when it drew the same thing straight on the map (round line
//   ends, centred text), or its dashed rings and markers would come out differently.
// The page's clock is set by hand, so nothing depends on how fast the test runs. Comparing pixels with main needs a real
// browser, which npm test does not use: that was done by hand, in Chromium, for this change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { rng } = require('../scripts/lib/route-fuzz');
const { KIT, problems } = require('./helpers/map-2d-kit');
const { lit } = require('../scripts/lib/js-literal');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

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
  // u (see view()): centred on the home POP or on the other city, at zoom index z (far, normal and close; the random
  // views below see the zooms between); nothing selected, the city under the pointer, or selected.
  const VIEWS = [];
  for (const city of ['pop', 'other']) for (const z of [0, 2, 4]) for (const [sel, hov] of [[0.1, 0.9], [0.1, 0.1], [0.5, 0.9]]) VIEWS.push({ city, u: [city === 'pop' ? 0 : 0.9, 0, 0.5, 0.5, z / 5 + 0.01, sel, 0, hov, (z + 1) / 7] });
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
  assert.ok(checks >= 150);
  assert.deepEqual(found.slice(0, 5), []);
  assert.deepEqual(errors, []);
});

test('the 2D map draws the same from kept pictures as from fresh ones, and tubes as main did, over random views of the big network', () => {
  const { ev, errors } = open();
  const r = rng(99), found = [];
  for (let i = 0; i < 30; i++) {
    // Now and then a day passes (failures and events on), so cuts, builds, floods and offers come and go.
    if (i % 6 === 5) ev('S.nextFail=S.day;S.nextEvent=S.day;dayTick();compute();');
    const u = Array.from({ length: 9 }, () => r());
    found.push(...problems(JSON.parse(ev(`JSON.stringify(__M2D.check(${lit(u)}))`)), `view ${i} (day ${ev('S.day')})`));
  }
  assert.deepEqual(found.slice(0, 5), []);
  assert.deepEqual(errors, []);
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

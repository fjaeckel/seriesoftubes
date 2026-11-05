// While the zoom moves, the card keeps the pictures of cities at the scale they had when it began (stretched by up to
// 1.25× either way) and paints them again at the right step once the zoom rests (src/game/96-map/59-gl-sprites.js,
// sprQ()). A pinch used to repaint every city at every 1/24 step of its scale. The 2D map is unchanged.
// The page's clock is set by hand, so whether the zoom "rests" never depends on how fast the test runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

function open() {
  const h = load({ seed: 777 });
  h.ev(`S=migrate(JSON.parse(${lit(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();S.nextFail=S.day+999;S.nextEvent=S.day+999;compute();
    window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});`);
  return h;
}

const STUB = `(()=>{const calls=[];const gl=new Proxy({calls},{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
  return (...a)=>{calls.push([k,...a]);return {};};}});
  const c=document.getElementById('mapgl'),f=document.getElementById('mapfx');
  const P=()=>({p:{},u:{}}),B=()=>({v:{},b:{}});
  Object.assign(GLX,{want:true,dead:false,gl,c,f,fx:f.getContext('2d'),line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),dv:B(),cl:B(),empty:{},key:[],gpu:'stub'});
  GLS.prog=P();GLS.vao={};GLS.buf={};GLS.tex={};GLS.size=4096;SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;return gl;})()`;

// One POP's city pictures painted during frames from zoom z0 to z1 (the clock moving 16 ms a frame), by scale.
const ZOOM = (z0, z1, n) => `(()=>{const id=S.home,C=CITY[id];cam.x=C.x;cam.y=C.y;const seen=new Set(),bad=[];
  for(let i=0;i<=${n};i++){cam.z=${z0}+(${z1}-${z0})*i/${n};__T+=16;draw(__T);
    for(const k of SPRS.keys()){const p=k.split('|');if(p[0]==='city'&&p[1]===id)seen.add(+p[3]);}
    const k=cityScale(iconScale()),kq=[...SPRS.keys()].filter(x=>x.split('|')[0]==='city'&&x.split('|')[1]===id).map(x=>+x.split('|')[3]);
    if(kq.length&&!kq.some(q=>Math.max(q/k,k/q)<=1.25*(1+.5/24/0.7)))bad.push(i);}
  return JSON.stringify({steps:[...seen].sort(),bad});})()`;

test('on the card a zoom keeps each city’s picture for a while, and paints it at the right step once it rests', () => {
  const { ev, errors } = open();
  ev(STUB);
  ev(`cam.z=0.6;draw(__T);__T+=1000;draw(__T)`);
  const r = JSON.parse(ev(ZOOM(0.6, 1.6, 60)));
  // Without the hold, every 1/24 step between the two scales gets a picture.
  const plain = ev(`(()=>{const s=new Set();for(let i=0;i<=60;i++){cam.z=0.6+i/60;s.add(Math.round(cityScale(iconScale())*24)/24);}return s.size;})()`);
  assert.ok(plain >= 10, `the zoom crosses many steps (${plain})`);
  assert.ok(r.steps.length <= 4, `the city was painted at ${r.steps.length} scales during the zoom (${r.steps}), not ${plain}`);
  assert.deepEqual(r.bad, [], 'a picture is never stretched more than 1.25× either way (and half a step)');
  assert.equal(ev('zoomMoving()'), true);
  ev('__T+=300;draw(__T)');
  const rest = JSON.parse(ev(`(()=>{const id=S.home,want=Math.round(cityScale(iconScale())*24)/24;
    return JSON.stringify({f:ZH.f,want,has:[...SPRS.keys()].some(k=>{const p=k.split('|');return p[0]==='city'&&p[1]===id&&+p[3]===want;}),moving:zoomMoving()});})()`));
  assert.equal(rest.moving, false);
  assert.equal(rest.f, 1, 'at rest nothing is stretched');
  assert.equal(rest.has, true, 'the city is painted again at its own step');
  assert.deepEqual(errors, []);
});

test('the 2D map paints cities at their own step on every frame of a zoom, as before', () => {
  const { ev, errors } = open();
  ev(`mapGl(false);cam.z=0.8;draw(__T);`);
  const r = JSON.parse(ev(`(()=>{const id=S.home,C=CITY[id];cam.x=C.x;cam.y=C.y;const bad=[];
    for(let i=0;i<=30;i++){cam.z=0.8+i/30;__T+=16;SPRC.clear();draw(__T);const want=Math.round(cityScale(iconScale())*24)/24;
      if(ZH.f!==1||![...SPRC.keys()].some(k=>{const p=k.split('|');return p[0]==='city'&&p[1]===id&&+p[3]===want;}))bad.push(i);}
    return JSON.stringify({bad});})()`));
  assert.deepEqual(r.bad, []);
  assert.deepEqual(errors, []);
});

test('a still map is drawn again when the zoom comes to rest, so the stretched pictures do not stay', () => {
  const { ev, errors } = open();
  ev(STUB);
  // Animations off: the loop skips frames while nothing changes.
  ev(`cam.z=1;draw(__T);mapStill(0,__T);UI.drawnAt=__T;cam.z=1.3;__T+=16;mapStill(0,__T);draw(__T);UI.drawnAt=__T;`);
  ev(`__T+=16`);
  assert.equal(ev('mapStill(0,__T)'), true, 'nothing moved since the last frame');
  ev(`__T+=300`);
  assert.equal(ev('mapStill(0,__T)'), false, 'the zoom has rested: one more frame');
  ev(`draw(__T);UI.drawnAt=__T;__T+=16`);
  assert.equal(ev('ZH.f'), 1);
  assert.equal(ev('mapStill(0,__T)'), true, 'and then the map stays still again');
  assert.deepEqual(errors, []);
});

test('pictures that keep their size whatever the zoom (far-view cities, cones, diggers) are never held or stretched', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{cam.z=1;draw(__T);__T+=1000;cam.z=1;draw(__T);cam.z=1.4;__T+=16;draw(__T);GLS.frame=true;GLS.n=0;ctx=GLX.fx;
    const f=ZH.f;drawCone(100,100,0);drawBackhoe(200,100,0,false);const D=GLS.data,o=[D[2],D[3],D[SPR_STRIDE+2],D[SPR_STRIDE+3]];
    const keys=[...SPRS.keys()].filter(k=>['cone','hoe'].includes(k.split('|')[0]));GLS.frame=false;GLS.n=0;ctx=CTX0;return JSON.stringify({f,o,keys});})()`));
  assert.notEqual(r.f, 1, 'the zoom is moving and city pictures are held');
  assert.deepEqual(r.o, [26, 28, 38, 32], 'drawn at their own size');
  assert.ok(r.keys.length >= 2 && r.keys.every(k => k.endsWith('|1')), 'painted at scale 1: ' + r.keys);
  assert.deepEqual(errors, []);
});

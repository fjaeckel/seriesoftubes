// The card's pictures (src/game/96-map/59-gl-sprites.js): painted on one reused canvas and sent to the atlas at once, so
// a long zoom does not leave the browser holding a canvas per picture (it lost the graphics context and fell back to 2D).
// The 2D map keeps a canvas per picture. jsdom has no WebGL: a stand-in context records what would go to the card.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

function open() {
  const h = load({ seed: 777 });
  h.ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();S.nextFail=S.day+999;S.nextEvent=S.day+999;compute();`);
  return h;
}

const STUB = `(()=>{const calls=[];const gl=new Proxy({calls},{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
  return (...a)=>{calls.push([k,...a]);return {};};}});
  const c=document.getElementById('mapgl'),f=document.getElementById('mapfx');
  const P=()=>({p:{},u:{}}),B=()=>({v:{},b:{}});
  Object.assign(GLX,{want:true,dead:false,gl,c,f,fx:f.getContext('2d'),line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),cl:B(),empty:{},key:[],gpu:'stub'});
  GLS.prog=P();GLS.vao={};GLS.buf={};GLS.tex={};GLS.size=4096;SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;
  // Counts the canvases the page makes from here on.
  const ce=document.createElement.bind(document);window.__canvases=0;document.createElement=function(t){if(String(t).toLowerCase()==='canvas')__canvases++;return ce.apply(document,arguments);};
  return gl;})()`;

// Frames over a zoom from far to near and back, as a player pinching would.
const ZOOM = `(()=>{const h=CITY[S.home];cam.x=h.x;cam.y=h.y;for(let i=0;i<=40;i++){cam.z=0.5*Math.pow(9,(1-Math.cos(i/40*Math.PI*2))/2);draw(1000+i*16);}})()`;

test('on the card, pictures are painted on one canvas and each goes into the atlas as it is painted', () => {
  const { ev, errors } = open();
  ev(STUB);
  ev(ZOOM);
  const r = JSON.parse(ev(`(()=>{const subs=GLX.gl.calls.filter(c=>c[0]==='texSubImage2D'),es=[...SPRS.values()];
    return JSON.stringify({canvases:__canvases,subs:subs.length,sprites:es.length,mine:es.filter(e=>e.cv).length,
      allUp:es.every(e=>e.up),rect:subs.every(c=>c.length===10&&c[9]===GLS_PAD.cv&&c[5]>0&&c[6]>0),
      fit:subs.every(c=>c[5]<=GLS_PAD.cv.width&&c[6]<=GLS_PAD.cv.height),keys:es.length>0&&SPRC.size===0});})()`));
  assert.ok(r.sprites > 50, `a zoom paints many pictures (${r.sprites})`);
  assert.ok(r.canvases <= 1, `one canvas for all of them, not one each (${r.canvases} made)`);
  assert.equal(r.mine, 0, 'no picture keeps a canvas of its own');
  assert.equal(r.allUp, true, 'every picture is in the atlas');
  assert.ok(r.subs >= r.sprites, 'each was sent once, when painted');
  assert.equal(r.rect, true, 'only its corner of the pad, from the pad');
  assert.equal(r.fit, true);
  assert.equal(r.keys, true, 'kept apart from the 2D map’s pictures');
  assert.deepEqual(errors, []);
});

test('a full atlas starts again and the picture that did not fit goes into the new one at once', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{GLS.frame=true;GLS.n=0;ctx=GLX.fx;GLS.shy=GLS.size-4;GLS.shx=GLS.size-2;GLS.shh=4;
    const before=SPRS.size;let draws=0;const gd=glsDraw;glsDraw=function(){draws++;};
    const e=spriteEntry('big',40,40,20,20,g=>{g.fillRect(0,0,40,40);});blit(e,10,10,40,40);
    glsDraw=gd;const r={up:e.up,u0:e.u0,v0:e.v0,kept:SPRS.get('big')===e,size:SPRS.size,n:GLS.n,cv:!!e.cv,shy:GLS.shy};GLS.frame=false;GLS.n=0;ctx=CTX0;return JSON.stringify(r);})()`));
  assert.equal(r.up, true, 'the picture is in the atlas');
  assert.equal(r.u0, 0); assert.equal(r.v0, 0);
  assert.equal(r.kept, true, 'and kept under its key after the restart');
  assert.equal(r.size, 1, 'the old pictures are gone');
  assert.equal(r.n, 1, 'drawn this frame');
  assert.equal(r.cv, false);
  assert.deepEqual(errors, []);
});

test('the 2D map keeps a canvas per picture, and its pictures are not the card’s', () => {
  const { ev, errors } = open();
  ev(`mapGl(false);const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;draw(1000);`);
  const r = JSON.parse(ev(`(()=>{const es=[...SPRC.entries()];return JSON.stringify({n:es.length,cv:SPRS.size===0&&es.every(([k,e])=>e.cv&&e.cv.width===e.pw&&e.cv.height===e.ph),up:es.some(([,e])=>e.up)});})()`));
  assert.ok(r.n > 10);
  assert.equal(r.cv, true, 'each with its own canvas, at its size');
  assert.equal(r.up, false, 'nothing went to a card');
  assert.deepEqual(errors, []);
});

test('giving the card up drops its pictures; the 2D map paints its own', () => {
  const { ev, errors } = open();
  ev(STUB);
  ev(`const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;draw(1000);`);
  assert.ok(ev('SPRS.size') > 10);
  ev(`window.__warn=0;console.warn=function(){__warn++;};glKill('test')`);
  assert.equal(ev('SPRS.size'), 0, 'no picture without a canvas is left behind');
  assert.equal(ev('GLS.shx+GLS.shy+GLS.shh'), 0, 'the atlas is forgotten');
  ev('draw(1016)');
  assert.ok(ev('SPRC.size') > 10);
  assert.equal(ev(`[...SPRC.values()].every(e=>e.cv)`), true, 'the 2D map’s pictures have their canvas');
  assert.ok(ev('ctx===CTX0'));
  assert.deepEqual(errors, []);
});

test('a picture too big for the atlas keeps its own canvas and is painted on the overlay', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{GLS.frame=true;GLS.n=0;ctx=GLX.fx;GLS.size=64;const n0=GLX.fx.calls.n;
    const e=spriteEntry('huge',200,30,100,15,g=>{g.fillRect(0,0,200,30);});blit(e,0,0,200,30);
    const r={cv:!!e.cv,up:e.up,n:GLS.n,fx:GLX.fx.calls.n-n0};GLS.frame=false;GLS.n=0;ctx=CTX0;GLS.size=4096;return JSON.stringify(r);})()`));
  assert.equal(r.cv, true);
  assert.equal(r.up, false);
  assert.equal(r.n, 0, 'not queued for the card');
  assert.ok(r.fx >= 1, 'drawn on the overlay instead');
  assert.deepEqual(errors, []);
});

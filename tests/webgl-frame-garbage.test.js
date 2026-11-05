// A frame on the card makes little garbage (src/game/96-map/57-webgl-background.js, 59-gl-sprites.js, 80-cities.js):
// the keys of the pictures are kept per city and per label and built again only when the picture changes, and the
// waves and the clouds are written into arrays kept from frame to frame. What is drawn stays the same.
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
  Object.assign(GLX,{want:true,dead:false,gl,c,f,fx:f.getContext('2d'),line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),dv:B(),cl:B(),empty:{},key:[],gpu:'stub'});
  GLS.prog=P();GLS.vao={};GLS.buf={};GLS.tex={};GLS.size=4096;SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;return gl;})()`;

// Counts the keys joined during one frame (Array#join with '|', as the picture keys are), but the ships' (a handful).
const JOINS = (body) => `(()=>{let n=0;const j=Array.prototype.join;Array.prototype.join=function(s){if(s==='|'&&this[0]!=='ship')n++;return j.apply(this,arguments);};
  try{${body}}finally{Array.prototype.join=j;}return n;})()`;

for (const [view, z] of [['near', 1.4], ['far', 0.6]]) {
  test(`an unchanged frame on the card joins no picture key again (${view} view)`, () => {
    const { ev, errors } = open();
    ev(STUB);
    ev(`const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=${z};UI.sel=null;draw(1000);draw(1016);`);
    const first = ev(JOINS(`SPRS.clear();CKEY.clear();PILLK.clear();FKEY.clear();QKEY.clear();draw(1032);`));
    const again = ev(JOINS('draw(1048);'));
    assert.ok(first > 20, `a first frame builds its keys (${first})`);
    assert.equal(again, 0, 'the next one builds none');
    assert.deepEqual(errors, []);
  });
}

test('a city whose state changes gets a new picture, and its old one back after', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{const id=S.home,C=CITY[id],p=S.pops[id];cam.x=C.x;cam.y=C.y;cam.z=1.4;UI.sel=null;
    const pic=()=>{draw(1000);return CKEY.get(id).k;};const a=pic();const was=p.down;p.down=S.day+3;const b=pic();p.down=was;const c=pic();
    UI.sel={type:'city',id};const d=pic();UI.sel=null;
    const before=CKEY.get(id).k,gen=p.gen;p.gen=!gen;const e=pic();p.gen=gen;
    return JSON.stringify({a,b,c,d,e,before});})()`));
  assert.notEqual(r.b, r.a, 'down: another picture');
  assert.equal(r.c, r.a, 'back up: the same picture');
  assert.notEqual(r.d, r.a, 'selected: another picture');
  assert.notEqual(r.e, r.before, 'a generator: another picture');
  assert.deepEqual(errors, []);
});

test('labels with the same text but another look are other pictures', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{GLS.frame=true;GLS.n=0;ctx=GLX.fx;const f='800 12px "Baloo 2", sans-serif';
    pill('Lagos',f,50,19,9,'#FFFFFF','#1E2640','#1E2640',2,10,10,.5);pill('Lagos',f,50,19,9,'#FF4F9A','#FFFFFF','#1E2640',2,10,10,.5);pill('Lagos',f,50,19,9,'#FFFFFF','#1E2640','#1E2640',2,10,10,.5);
    const n=GLS.n,L=PILLK.get('Lagos').length,u=new Set([0,1,2].map(i=>GLS.data[i*SPR_STRIDE+4]+','+GLS.data[i*SPR_STRIDE+5])).size;GLS.frame=false;GLS.n=0;ctx=CTX0;
    return JSON.stringify({n,L,u});})()`));
  assert.equal(r.n, 3);
  assert.equal(r.L, 2, 'two looks kept for one text');
  assert.equal(r.u, 2, 'two pictures in the atlas, the third label reuses the first');
  assert.deepEqual(errors, []);
});

test('the waves and the clouds are what they were, written into arrays kept from frame to frame', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{const ks=[-1,0,1],now=12345,gl=GLX.gl;
    glWaves(gl,now,ks);const wa=GLX.wa,ph0=now/900,want=[];let m=0,bad=0;
    for(const [x,y,ph] of WAVES){const o=Math.sin(ph0+ph*6)*3;for(const [x0,cx,cy,x1] of [[x-9+o,x-4.5+o,y-4,x+o],[x+o,x+4.5+o,y+4,x+9+o]]){let px=x0,py=y;
      for(let j=1;j<=4;j++){const t=j/4,u=1-t,qx=u*u*x0+2*u*t*cx+t*t*x1,qy=u*u*y+2*u*t*cy+t*t*y,o2=m*LINE_STRIDE;
        if(wa[o2]!==Math.fround(px)||wa[o2+1]!==Math.fround(py)||wa[o2+2]!==Math.fround(qx)||wa[o2+3]!==Math.fround(qy))bad++;m++;px=qx;py=qy;}}}
    glWaves(gl,now+16,ks);const sameW=GLX.wa===wa;
    glClouds(gl,now,ks);const ca=GLX.ca,A=[];for(const k of ks)for(const c of CLOUDS){const x=((c.x+now/1000*c.v)%(W+200))-100+k*W,y=c.y;A.push(x,y,16*c.s,0, x+18*c.s,y-8*c.s,20*c.s,0, x+40*c.s,y,15*c.s,0);}
    const sent=gl.calls.filter(c=>c[0]==='bufferData').pop()[2],cbad=A.filter((v,i)=>sent[i]!==Math.fround(v)).length;
    glClouds(gl,now+16,ks);
    return JSON.stringify({bad,m,sameW,cbad,clen:sent.length,alen:A.length,sameC:GLX.ca===ca});})()`));
  assert.equal(r.bad, 0, `every wave segment where it was (${r.m} segments)`);
  assert.equal(r.sameW, true);
  assert.equal(r.clen, r.alen, 'one record per puff');
  assert.equal(r.cbad, 0, 'every puff where it was');
  assert.equal(r.sameC, true, 'the clouds’ array is kept');
  assert.deepEqual(errors, []);
});

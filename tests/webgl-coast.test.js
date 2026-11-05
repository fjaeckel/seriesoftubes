// The land on the card per zoom level (src/game/96-map/57-webgl-background.js): zoomed out, the coastlines are
// simplified so that no point moves more than COAST_TOL px on screen at that level, which takes most of the card's
// vertices away. The coastlines themselves (COAST, onLand()) and the 2D map stay as they were.
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
  Object.assign(GLX,{want:true,dead:false,gl,c,f,fx:f.getContext('2d'),line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),dv:B(),cl:B(),empty:{},key:[],gpu:'stub'});return gl;})()`;

test('a simplified coastline never strays more than the tolerance from the full one', () => {
  const { ev, errors } = open();
  const r = JSON.parse(ev(`(()=>{const out=[];let worst=0,rings=0,kept=0,all=0;
    for(const lv of [-2,-1,0,1,3]){const tol=COAST_TOL/Math.pow(2,lv);
      COAST.forEach((ring,ri)=>{if(ring.length<3)return;const P=coastPts(ri),Q=coastSimplify(P,tol),at=new Map(P.map((p,i)=>[p,i]));rings++;kept+=Q.length;all+=P.length;
        if(Q[0]!==P[0]||Q[Q.length-1]!==P[P.length-1])out.push('ends '+ri);
        for(let j=0;j+1<Q.length;j++){const a=at.get(Q[j]),b=at.get(Q[j+1]);if(!(b>a))out.push('order '+ri);
          const ax=P[a][0],ay=P[a][1],dx=P[b][0]-ax,dy=P[b][1]-ay,L=dx*dx+dy*dy||1e-12;
          for(let i=a+1;i<b;i++){let t=((P[i][0]-ax)*dx+(P[i][1]-ay)*dy)/L;t=Math.max(0,Math.min(1,t));const d=Math.hypot(ax+t*dx-P[i][0],ay+t*dy-P[i][1])/tol;if(d>worst)worst=d;}}});}
    return JSON.stringify({bad:out.slice(0,5),worst,rings,share:kept/all});})()`));
  assert.deepEqual(r.bad, [], 'each ring keeps its ends and its order');
  assert.ok(r.worst <= 1 + 1e-9, `no point further than the tolerance (worst ${r.worst.toFixed(3)} of it)`);
  assert.ok(r.rings > 50);
  assert.ok(r.share < 0.6, `points are left out (${(r.share * 100).toFixed(0)} % kept)`);
  assert.deepEqual(errors, []);
});

test('zoomed out the land has a few times fewer segments, and the closer the zoom the more it keeps', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{const full=glLandGeo(GLX.gl,false),n=lv=>glLandGeo(GLX.gl,false,lv).nSeg;
    return JSON.stringify({full:full.nSeg,fullFan:full.nFan,l_1:n(-1),l0:n(0),l1:n(1),l3:n(3),far:glLandGeo(GLX.gl,true,-1).nSeg,once:glLandGeo(GLX.gl,false,0)===glLandGeo(GLX.gl,false,0),
      fan:glLandGeo(GLX.gl,false,-1).nFan});})()`));
  assert.ok(r.l_1 * 3 < r.full, `zoom 0.5–1: ${r.l_1} segments, ${r.full} in full`);
  assert.ok(r.l_1 < r.l0 && r.l0 < r.l1 && r.l1 <= r.l3 && r.l3 <= r.full, JSON.stringify(r));
  assert.ok(r.far < r.l_1, 'the far view still leaves out the islets');
  assert.ok(r.fan * 3 < r.fullFan, 'the fill’s fan shrinks as much');
  assert.equal(r.once, true, 'each level is built once');
  assert.deepEqual(errors, []);
});

test('the zoom level takes the finer level at once and keeps it a little while zooming out', () => {
  const { ev, errors } = open();
  const lv = JSON.parse(ev(`(()=>{delete GLX.coastLv;return JSON.stringify([1.5,2.1,1.95,1.85,1.8,0.9,0.95,0.4].map(coastLevel));})()`));
  assert.deepEqual(lv, [0, 1, 1, 1, 0, -1, -1, -2]);
  assert.deepEqual(errors, []);
});

test('each frame on the card fills the land from its zoom level’s geometry; the coastlines and the 2D map stay as they were', () => {
  const { ev, errors } = open();
  const coast = ev('JSON.stringify(COAST)');
  ev(STUB);
  const fans = JSON.parse(ev(`(()=>{const h=CITY[S.home];cam.x=h.x;cam.y=h.y;delete GLX.coastLv;const o=[];
    for(const z of [0.6,1.4,3.2]){cam.z=z;GLX.gl.calls.length=0;draw(1000);const want=glLandGeo(GLX.gl,lodFar(),coastLevel(z)).nFan;
      o.push(GLX.gl.calls.filter(c=>c[0]==='drawArrays'&&c[1]==='TRIANGLES').every(c=>c[3]===want));}return JSON.stringify(o);})()`));
  assert.deepEqual(fans, [true, true, true]);
  assert.equal(ev('JSON.stringify(COAST)'), coast, 'COAST is never changed (onLand() reads it)');
  let built = 0;
  ev(`mapGl(false);window.__lg=glLandGeo;glLandGeo=function(){__built++;return __lg.apply(this,arguments);};window.__built=0;cam.z=0.6;draw(1016);cam.z=3.2;draw(1032);`);
  built = ev('__built');
  assert.equal(built, 0, 'the 2D map does not use it');
  assert.deepEqual(errors, []);
});

/* Where two coastlines overlap, the land stays land, as the 2D map fills each coast on its own (nonzero). Timor is drawn
   twice (COAST[58] and the finer COAST[154], with Dili): the card counted only odd or even coverings over all the coasts,
   so the two cancelled out and most of the island was sea, its shadow too. The fan now winds every coast the same way
   and the stencil counts windings. w(x,y) is the winding the card counts at a point: the fan's triangles that cover it,
   +1 or -1 by the way they turn. */
const WIND = `window.__wind=(fan,x,y)=>{let w=0;const s=(ax,ay,bx,by)=>(bx-ax)*(y-ay)-(by-ay)*(x-ax);
  for(let i=0;i<fan.length;i+=6){const [ax,ay,bx,by,cx,cy]=fan.slice(i,i+6),d1=s(ax,ay,bx,by),d2=s(bx,by,cx,cy),d3=s(cx,cy,ax,ay);
    if(d1>0&&d2>0&&d3>0)w++;else if(d1<0&&d2<0&&d3<0)w--;}return w;};`;

test('two overlapping coastlines leave their overlap filled (Timor), at every zoom', () => {
  const { ev, errors } = open();
  ev(WIND);
  const r = JSON.parse(ev(`(()=>{const pt=[1692,600],o={both:[58,154].map(i=>inPoly(...pt,coastPts(i)))};
    for(const lv of [undefined,-1,0,1,2,3,4,5]){const tol=lv===undefined?0:COAST_TOL/Math.pow(2,lv),fan=[];
      COAST.forEach((ring,ri)=>{if(ring.length<3)return;const P=coastSimplify(coastPts(ri),tol);if(P.length>=4)coastFan(P,fan);});
      o['lv'+lv]=__wind(fan,...pt);}
    return JSON.stringify(o);})()`));
  assert.deepEqual(r.both, [true, true], 'the point is inside both of Timor’s coastlines');
  for (const lv of [undefined, -1, 0, 1, 2, 3, 4, 5]) assert.equal(r['lv' + lv], 2, `level ${lv}: counted twice, so land (an odd/even count gave 0, sea)`);
  assert.deepEqual(errors, []);
});

test('every coastline counts +1 inside, whichever way it was drawn', () => {
  const { ev, errors } = open();
  ev(WIND);
  const r = JSON.parse(ev(`(()=>{const sq=(x,y,s,cw)=>{const p=[[x,y],[x+s,y],[x+s,y+s],[x,y+s]];return cw?p.reverse():p;};
    const fan=[];coastFan(sq(0,0,10,false),fan);coastFan(sq(5,5,10,true),fan);
    return JSON.stringify({a:__wind(fan,2,1),both:__wind(fan,8,6),b:__wind(fan,12,13),out:__wind(fan,20,20)});})()`));
  assert.deepEqual(r, { a: 1, both: 2, b: 1, out: 0 }, 'one square turned each way: the overlap is 2, not 0');
  assert.deepEqual(errors, []);
});

test('the card fills the land where the winding count is not zero, and leaves the stencil at zero', () => {
  const { ev, errors } = open();
  ev(STUB);
  const c = JSON.parse(ev(`(()=>{const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;GLX.gl.calls.length=0;draw(1000);
    return JSON.stringify(GLX.gl.calls.filter(c=>/^stencil/.test(c[0])).map(c=>c.join(' ')));})()`));
  assert.ok(c.includes('stencilOpSeparate FRONT KEEP KEEP INCR_WRAP') && c.includes('stencilOpSeparate BACK KEEP KEEP DECR_WRAP'), 'counts windings, +1 one way and -1 the other');
  assert.ok(c.includes('stencilFunc NOTEQUAL 0 255'), 'fills where the count is not zero, on all 8 bits');
  assert.ok(c.includes('stencilOp ZERO ZERO ZERO'), 'and sets it back to zero');
  assert.ok(!c.some(s => /INVERT/.test(s)), 'no odd/even count left');
  assert.deepEqual(errors, []);
});

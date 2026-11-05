// Lines on the card are one instance per segment. Where two segments of a line meet, each keeps only its side of the
// corner (glJoin() tells it which way its neighbours run), so a see-through line is blended once there, as the 2D
// canvas strokes a path once: the selected tube's halo, the cables, the waves, the fiber's dots. Also: the link being
// dragged out is drawn on the card, under the cities as in 2D, not on the overlay above them.
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

// For records A of segments: which neighbour directions are wrong. A segment whose start is where the previous one
// ended must point back along it; one that starts a line (or ends one) must say it has no neighbour there.
const CHECK = `const joins=(A,n,lines)=>{const S=LINE_STRIDE,bad=[];let joined=0;
  for(let i=0;i<n;i++){const o=i*S,first=lines?lines.has(i):!(i&&A[o]===A[o-S+2]&&A[o+1]===A[o-S+3]),last=lines?lines.has(i+1)||i+1===n:!(i+1<n&&A[o+2]===A[o+S]&&A[o+3]===A[o+S+1]);
    const pv=first?[0,0]:[Math.fround(A[o-S+2]-A[o-S]),Math.fround(A[o-S+3]-A[o-S+1])],nx=last?[0,0]:[Math.fround(A[o+S+2]-A[o+S]),Math.fround(A[o+S+3]-A[o+S+1])];
    const near=(a,b)=>Math.abs(a-b)<=1e-3*Math.max(1,Math.abs(b));if(!near(A[o+12],pv[0])||!near(A[o+13],pv[1])||!near(A[o+14],nx[0])||!near(A[o+15],nx[1]))bad.push(i);if(!first)joined++;}
  return {bad:bad.slice(0,5),joined,n};};`;

test('the tubes and the selected one’s halo are joined segment to segment, and only within a tube', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{${CHECK}const ML=mapLinks(S.day),{SEG}=glBuild(ML.LG,ML.GM,ML.looks),starts=new Set();let si=0;
    for(const gm of ML.GM){starts.add(si);si+=gm.pts.length-1;}
    const gi=ML.GM.findIndex(gm=>gm.pts.length>4),H=glHalo(ML.LG,ML.GM,ML.looks,ML.LG[gi][0].id);
    return JSON.stringify({tubes:joins(SEG,si,starts),halo:joins(H,H.length/LINE_STRIDE,new Set([0]))});})()`));
  assert.deepEqual(r.tubes.bad, [], 'every tube segment knows its neighbours, and no tube runs into the next');
  assert.ok(r.tubes.joined > r.tubes.n / 2, `most segments have a neighbour before them (${r.tubes.joined} of ${r.tubes.n})`);
  assert.deepEqual(r.halo.bad, []);
  assert.ok(r.halo.joined >= 3, 'the halo is one joined line');
  assert.deepEqual(errors, []);
});

test('coastlines close on themselves; cables and waves are joined along each line', () => {
  const { ev, errors } = open();
  ev(STUB);
  // A closed ring: the first segment's neighbour before it is the last one.
  const ring = JSON.parse(ev(`(()=>{const A=[];const P=[[0,0],[10,0],[10,10],[0,10],[0,0]];for(let i=0;i+1<P.length;i++)glSeg(A,P[i],P[i+1],0,1,0,0,[0,0,0,1]);
    glJoin(A,0,4,true);const S=LINE_STRIDE;return JSON.stringify([A.slice(12,16),A.slice(3*S+12,3*S+16)]);})()`));
  assert.deepEqual(ring[0], [0, -10, 0, 10], 'the first side follows the last and leads to the second');
  assert.deepEqual(ring[1], [-10, 0, 10, 0], 'the last side leads back to the first');
  // The land's coastlines are built that way: no segment of a ring is left without neighbours.
  const land = JSON.parse(ev(`(()=>{GLX.land={};const gl=GLX.gl;gl.calls.length=0;glLandGeo(gl,false,0);
    const sent=gl.calls.filter(c=>c[0]==='bufferData'&&c[2]&&c[2].length%LINE_STRIDE===0&&c[2].length>LINE_STRIDE*10).map(c=>c[2]);
    const A=sent[0];let open=0;for(let i=0;i<A.length/LINE_STRIDE;i++){const o=i*LINE_STRIDE;if(!(A[o+12]||A[o+13])||!(A[o+14]||A[o+15]))open++;}return JSON.stringify({n:A.length/LINE_STRIDE,open});})()`));
  assert.ok(land.n > 1000, 'the coastlines went to the card');
  assert.equal(land.open, 0, 'every coastline is a closed ring');
  const r = JSON.parse(ev(`(()=>{${CHECK}const gl=GLX.gl;GLX.ckey=null;glCables(gl,[0],null,false);
    const F=gl.calls.filter(c=>c[0]==='bufferData').pop()[2],cs=new Set();let ci=0;for(const cp of CABLE_PAIRS){cs.add(ci);ci+=cp.pts.length-1;}const cab=joins(F,F.length/LINE_STRIDE,cs);
    glWaves(gl,1234,[0]);const starts=new Set();for(let i=0;i<WAVES.length;i++)starts.add(i*8);
    return JSON.stringify({cab,wav:joins(GLX.wa,WAVES.length*8,starts)});})()`));
  assert.deepEqual(r.cab.bad, [], 'cable segments are joined where one ends and the next begins');
  assert.ok(r.cab.joined > 100, `cables have corners (${r.cab.joined})`);
  assert.deepEqual(r.wav.bad, [], 'each wave is one line of eight segments');
  assert.deepEqual(errors, []);
});

test('the line shader takes the neighbours and splits each corner along its bisector', () => {
  const { ev } = open();
  const vs = ev('GL_LINE_VS'), fs_ = ev('GL_LINE_FS');
  assert.match(vs, /layout\(location=3\) in vec4 aN/);
  assert.match(fs_, /vEnd\.x>\.5&&x\*vK\.x\+y\*vK\.y<0\./);
  assert.match(fs_, /vEnd\.y>\.5&&\(x-vLen\)\*vK\.z\+y\*vK\.w>0\./);
  // The rule itself: at a corner, every point is painted by exactly one of the two segments that meet there.
  const r = JSON.parse(ev(`(()=>{const norm=v=>{const l=Math.hypot(v[0],v[1]);return [v[0]/l,v[1]/l];},dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
    let both=0,none=0,n=0;
    for(const deg of [5,30,60,90,135,170]){const r=deg*Math.PI/180,J=[0,0],tA=[1,0],tB=[Math.cos(r),Math.sin(r)],m=norm([tA[0]+tB[0],tA[1]+tB[1]]);
      for(let x=-12;x<=12;x+=0.37)for(let y=-12;y<=12;y+=0.41){const P=[x,y];
        // In capsule A (ending at J) or B (starting at J), half-width 6.
        const inA=Math.hypot(x>0?x:x<-20?x+20:0,y)<=6,
          pb=dot(P,tB),qb=Math.max(0,Math.min(20,pb)),inB=Math.hypot(x-qb*tB[0],y-qb*tB[1])<=6;
        if(!inA&&!inB)continue;n++;const ownA=inA&&dot(P,m)<=0,ownB=inB&&dot(P,m)>=0;if(ownA&&ownB&&dot(P,m)!==0)both++;if(!ownA&&!ownB)none++;}}
    return JSON.stringify({n,both,none});})()`));
  assert.ok(r.n > 1000);
  assert.equal(r.both, 0, 'no point is painted twice');
  assert.equal(r.none, 0, 'no point of the joined line is left out');
});

test('the link being dragged out goes to the card, under the cities, and its price label is a picture', () => {
  const { ev, errors } = open();
  ev(`const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;`);
  ev(STUB);
  ev(`(()=>{const fx=GLX.fx;fx.__st=0;fx.stroke=function(){fx.__st++;};})()`);
  ev(`UI.drag=null;draw(1000);`);
  const base = ev('GLX.fx.__st');
  ev(`(()=>{const h=CITY[S.home],[x,y]=toS(h.x,h.y,0);UI.drag={mode:'link',from:S.home,cx:x+120,cy:y+40};UI.snap=null;GLX.gl.calls.length=0;GLX.fx.__st=0;draw(1000);})()`);
  assert.equal(ev('GLX.fx.__st'), base, 'nothing more is stroked on the overlay above the cities');
  const r = JSON.parse(ev(`(()=>{const c=GLX.gl.calls,i=c.findIndex(x=>x[0]==='bufferData'&&x[2]===GLX.da),
    d=c.findIndex((x,j)=>j>i&&x[0]==='drawArraysInstanced'&&x[4]===2),A=GLX.da,S=LINE_STRIDE;
    return JSON.stringify({sent:i>=0,drawn:d>i,dash:[A[6],A[S+6]],w:[A[5],A[S+5]],off:[A[4],A[S+4]],z:cam.z,dash7:LDASH[7]});})()`));
  assert.ok(r.sent && r.drawn, 'the two dotted lines go to the card in one draw');
  assert.deepEqual(r.dash, [7, 7]); assert.deepEqual(r.dash7, [2, 12]);
  assert.deepEqual(r.w, [7, 4], 'the dark line under the pink one, as in 2D');
  assert.equal(r.off[0], 0); assert.ok(Math.abs(r.off[1] - (-1000 / 30 / r.z)) < 1e-3, 'the pink dots run along the line as in 2D');
  // Snapped to a city, the price shows on a pill picture with the cities' pictures, not on the overlay.
  const label = ev(`(()=>{const h=S.home,b=CITIES.find(c=>c.id!==h&&!isSub(h,c.id)).id,[x,y]=toS(CITY[b].x,CITY[b].y,0);UI.snap={id:b,sx:x,sy:y};GLX.fx.__st=0;draw(1016);
    return [...SPRS.keys()].some(k=>k.startsWith('pill|')&&k.includes(' km'));})()`);
  assert.equal(label, true);
  assert.equal(ev('GLX.fx.__st'), base);
  assert.deepEqual(errors, []);
});

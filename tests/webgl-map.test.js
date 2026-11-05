// The WebGL map (src/game/96-map/56-webgl.js to 59-gl-sprites.js): jsdom has no WebGL, so these tests check what can be checked
// without a graphics card. A browser without WebGL2 keeps the 2D map; the instance data the card would draw says the
// same as the 2D map (points, colours, dashes, packets, painting order, selection); with a stand-in context the map
// sends its lines to the card and paints the rest on the overlay, and goes back to its own canvas afterwards.
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

// A WebGL2 stand-in that records draws: enough for glBuild() and glFrame() to run.
const STUB = `(()=>{const calls=[];const gl=new Proxy({calls},{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
  return (...a)=>{calls.push([k,...a]);return {};};}});
  const c=document.getElementById('mapgl'),f=document.getElementById('mapfx');
  const P=()=>({p:{},u:{}}),B=()=>({v:{},b:{}});
  Object.assign(GLX,{want:true,dead:false,gl,c,f,fx:f.getContext('2d'),line:P(),pk:P(),fill:P(),fan:P(),ell:P(),land:{},circ:P(),tex:{},lv:B(),hv:B(),pv:B(),cb:B(),wv:B(),dv:B(),cl:B(),empty:{},key:[],gpu:'stub'});return gl;})()`;

test('without WebGL2 the map stays 2D, and asking for WebGL changes nothing', () => {
  const { ev, errors } = open();
  ev(`mapGl(true);const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;draw(1000);`);
  assert.equal(ev('GLX.dead'), true, 'a context that cannot compile shaders is given up');
  assert.equal(ev('glOn()'), false);
  assert.equal(ev(`document.getElementById('mapgl').hidden`), true, 'the layer stays hidden');
  assert.ok(ev('ctx===CTX0'), 'the map draws on its own canvas');
  assert.ok(ev(`cv.getContext('2d').calls.n`) > 1000, 'the 2D map drew its lines');
  assert.deepEqual(errors, []);
});

test('the instance data says what the 2D map draws: points, colours, dashes, packets and painting order', () => {
  const { ev } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{const PI=pairIdx(),LG=linkGroups(),GM=LG.map(g=>linkGeom(g[0],PI.get(edgeKey(g[0]))));
    const sel=LG[3][0].id,looks=LG.map(g=>linkLook(g,S.day)),{SEG,PK,PT}=glBuild(LG,GM,looks),H=glHalo(LG,GM,looks,sel);let si=0,ki=0,pi=0,hi=0,bad=[];const deps=[];
    for(let gi=0;gi<LG.length;gi++){const gm=GM[gi],L=looks[gi],[r,g,b]=glColor(L.col),hot=LG[gi].some(x=>x.id===sel);
      for(let j=0;j<gm.pts.length;j++){if(PT[pi*4]!==Math.fround(gm.pts[j][0])||PT[pi*4+2]!==Math.fround(gm.cum[j]))bad.push('pt '+gi);pi++;}
      for(let j=0;j+1<gm.pts.length;j++){const o=si*LINE_STRIDE;
        if(SEG[o]!==Math.fround(gm.pts[j][0])||SEG[o+3]!==Math.fround(gm.pts[j+1][1]))bad.push('seg '+gi);
        if(SEG[o+6]!==L.dash||SEG[o+5]!==Math.fround(L.w0)||SEG[o+9]!==Math.fround(r)||SEG[o+11]!==Math.fround(b))bad.push('look '+gi);
        if((SEG[o+7]&1)===1||((SEG[o+7]&2)===2)!==(L.df&&!L.bld&&!L.dark))bad.push('flags '+gi);
        if(hot){const h=hi*LINE_STRIDE;for(let x=0;x<LINE_STRIDE;x++)if(x<12?H[h+x]!==(x===7?1:SEG[o+x]):Math.abs(H[h+x]-SEG[o+x])>1e-3*Math.max(1,Math.abs(SEG[o+x])))bad.push('halo '+gi);hi++;}
        if(j===0)deps.push(SEG[o+8]);si++;}
      const n=!L.cut&&L.load>0.01?clamp(Math.round(2+L.u*10),2,12):0;for(let i=0;i<n;i++){if(PK[ki*8+3]!==n||PK[ki*8+4]!==i)bad.push('pk '+gi);ki++;}}
    return JSON.stringify({bad:bad.slice(0,5),si,segs:SEG.length/LINE_STRIDE,ki,pks:PK.length/8,groups:LG.length,
      order:deps.every((d,i)=>!i||d<deps[i-1]),inRange:deps.every(d=>d>0&&d<1),sel:hi>0&&hi===GLX.nHalo,moving:looks.filter(L=>!L.cut&&L.load>0.01).length});})()`));
  assert.deepEqual(r.bad, []);
  assert.equal(r.si, r.segs, 'one instance per segment');
  assert.equal(r.ki, r.pks, 'one instance per packet');
  assert.ok(r.groups > 50 && r.moving > 20, 'a big map with traffic');
  assert.ok(r.order && r.inRange, 'later tubes are nearer, so they paint over earlier ones as in 2D');
  assert.equal(r.sel, true, 'the selected tube, and only it, gets its halo: its own segments at its own depth');
});

test('with WebGL the lines go to the card, the rest to the overlay, and the map gets its canvas back', () => {
  const { ev, errors } = open();
  ev(`mapGl(false);const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;draw(1000);`);
  const flat = ev(`cv.getContext('2d').calls.n`);
  ev(STUB);
  ev(`cv.getContext('2d').calls.n=0;document.getElementById('mapfx').getContext('2d').calls.n=0;draw(1000);`);
  assert.equal(ev('glOn()'), true);
  const main = ev(`cv.getContext('2d').calls.n`), over = ev(`document.getElementById('mapfx').getContext('2d').calls.n`);
  assert.ok(main < flat / 2, `the map's own canvas only paints sea, land and cables (${main} calls, ${flat} in 2D)`);
  assert.ok(over > 100, 'labels and cities go on the 2D overlay');
  assert.ok(ev('ctx===CTX0'), 'draw() hands the 2D context back');
  assert.equal(ev(`document.getElementById('mapgl').hidden`), false, 'the WebGL layer shows');
  const draws = JSON.parse(ev(`JSON.stringify(GLX.gl.calls.filter(c=>c[0]==='drawArraysInstanced').map(c=>c[4]))`));
  assert.ok(draws.includes(ev('GLX.nSeg')) && draws.includes(ev('GLX.nPk')), 'every segment and every packet in instanced draws');
  // Nothing changed: the next frame reuses the buffers. A cut link changes routing, and the tubes are rebuilt.
  // The tubes' own buffers (segments, packets, points) are what must not be sent again on an ordinary frame; the waves and clouds move every frame by design.
  const uploads = () => ev(`GLX.gl.calls.filter(c=>c[0]==='bufferData'&&c[2]&&c[2].length===GLX.nSeg*LINE_STRIDE).length`);
  const u0 = uploads(); ev('draw(1016)'); assert.equal(uploads(), u0, 'a frame alone uploads no tube data');
  const id = ev(`(()=>{const l=S.links.find(l=>l.kind!=='vxc'&&!linkDown(l));l.cut=S.day+5;compute();draw(1032);return l.id;})()`);
  assert.ok(uploads() > u0, 'a cut rebuilds the tubes');
  assert.equal(ev(`linkLook(linkGroups().find(g=>g.some(x=>x.id===${JSON.stringify(id)})),S.day).dash`), 1, 'drawn dashed like a cut');
  ev('mapGl(false);draw(1048)');
  assert.equal(ev(`document.getElementById('mapgl').hidden`), true, 'switching back hides the layers');
  assert.deepEqual(errors, []);
});

test('a label sits at the middle of its line whichever way the middle is found', () => {
  const { ev } = open();
  const d = ev(`(()=>{let m=0;const PI=pairIdx();for(const g of linkGroups()){const gm=linkGeom(g[0],PI.get(edgeKey(g[0]))),X=gm.pts.map(p=>(p[0]-cam.x)*cam.z+CW/2),Y=gm.pts.map(p=>(p[1]-cam.y)*cam.z+CH/2);
    const a=polyAtXY(X,Y,gm.cum,.5),w=polyAt(gm.pts,gm.cum,.5),b=[(w[0]-cam.x)*cam.z+CW/2,(w[1]-cam.y)*cam.z+CH/2];m=Math.max(m,Math.hypot(a[0]-b[0],a[1]-b[1]));}return m;})()`);
  assert.ok(d < 1e-6, `midpoints agree (${d})`);
});

test('the labels and cities stay on the 2D overlay; the card draws the background and the tubes', () => {
  const { ev, errors } = open();
  ev(STUB);
  ev(`cv.getContext('2d').calls.n=0;document.getElementById('mapfx').getContext('2d').calls.n=0;draw(1000);`);
  assert.ok(ev(`document.getElementById('mapfx').getContext('2d').calls.n`) > 100, 'labels and cities are painted on the 2D overlay');
  assert.ok(ev(`GLX.gl.calls.filter(c=>c[0]==='drawArraysInstanced').length`) > 0, 'the tubes are still drawn on the card');
  assert.equal(ev(`document.getElementById('mapfx').hidden`), false, 'the 2D overlay shows');
  assert.deepEqual(errors, []);
});

test('the land is geometry on the card: one fan per coastline, its outlines, its hills; the far view leaves out islets', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{const all=glLandGeo(GLX.gl,false),far=glLandGeo(GLX.gl,true);
    const pts=COAST.reduce((a,p)=>a+p.length,0);
    GLX.gl.calls.length=0;cam.z=1.4;draw(1000);
    const fans=GLX.gl.calls.filter(c=>c[0]==='drawArrays'&&c[1]==='TRIANGLES').map(c=>c[3]);
    const lv=glLandGeo(GLX.gl,false,coastLevel(1.4));
    return JSON.stringify({nFan:all.nFan,nSeg:all.nSeg,farSeg:far.nSeg,pts,hills:all.nHill,again:glLandGeo(GLX.gl,false)===all,fans,lvFan:lv.nFan,
      wl:GLX.gl.calls.some(c=>c[0]==='texImage2D'&&c[6]===WL.cv)});})()`));
  assert.equal(r.nFan % 3, 0, 'whole triangles');
  assert.equal(r.nSeg, r.pts * 4, 'each curve of the coast in four segments');
  assert.ok(r.farSeg < r.nSeg, 'zoomed out, the islets are left out as in 2D');
  assert.equal(r.hills, ev('HILLS.length'));
  assert.ok(r.again, 'built once');
  assert.ok(r.fans.length >= 2 && r.fans.every(n => n === r.lvFan), 'shadow and grass are filled each frame from the same fan (the zoom level’s)');
  assert.equal(r.wl, false, 'no picture of the land is uploaded');
  assert.deepEqual(errors, []);
});

test('the 2D layers are cleared only when something was painted on them', () => {
  const { ev, errors } = open();
  ev(STUB);
  ev(`(()=>{const f=GLX.fx,c=CTX0,cr=(x)=>{const o=x.clearRect;x.__n=0;x.clearRect=function(){x.__n++;return o.apply(this,arguments);};};cr(f);cr(c);})()`);
  ev('cam.z=1.4;draw(1000);draw(1016)');
  assert.equal(ev('CTX0.__n'), 1, 'the empty map canvas under the card is cleared once');
  ev('GLX.fxUsed=false;GLX.fx.__n=0;draw(1032)');
  assert.equal(ev('GLX.fx.__n'), 0, 'an overlay nothing was painted on is left alone');
  ev('GLX.fxUsed=true;draw(1048)');
  assert.equal(ev('GLX.fx.__n'), 1, 'one that was painted on is cleared');
  assert.equal(ev('GLX.fxUsed'), false);
  assert.deepEqual(errors, []);
});

test('things that bob, pulse or float are pictures on the card, not shapes on the overlay', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{GLS.prog={p:{},u:{}};GLS.frame=true;GLS.n=0;const fx=document.getElementById('mapfx').getContext('2d'),n0=fx.calls.n,c0=CTX0.calls.n;ctx=fx;
    drawCone(100,100,0);drawCone(100,100,500);drawBackhoe(200,100,0,true);shipSprite(300,100,1,1,'#FF4D5E',0,'sail');
    ctx.globalAlpha=.5;textStamp('+$1,000','800 17px "Baloo 2", sans-serif',17,60,'#16A866','#fff',4,50,50);ctx.globalAlpha=1;
    const n=GLS.n,size=SPRS.size,alpha=GLS.data[4*SPR_STRIDE+11];GLS.frame=false;GLS.n=0;ctx=CTX0;
    return JSON.stringify({n,size,alpha,fx:fx.calls.n-n0,main:CTX0.calls.n-c0});})()`));
  assert.equal(r.n, 5, 'one picture each');
  assert.equal(r.fx, 0, 'nothing painted on the overlay');
  assert.equal(r.alpha, 0.5, 'a fading floater keeps its fade');
  assert.ok(r.size >= 4, 'a bobbing cone is the same picture at another place');
  assert.deepEqual(errors, []);
});

test('a frame on the card is a handful of draws, whatever the size of the network', () => {
  const { ev, errors } = open();
  ev(STUB);
  const draws = (body) => ev(`(()=>{${body};const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;draw(1000);GLX.gl.calls.length=0;draw(1016);
    return GLX.gl.calls.filter(c=>/^draw(Arrays|ArraysInstanced)$/.test(c[0])).length;})()`);
  const big = draws(''), links = ev('S.links.length');
  ev('S.links.length=0;compute()');
  const none = draws('');
  assert.ok(links > 100, 'a big network');
  assert.ok(big < 50, `${big} draws for ${links} links`);
  assert.ok(big - none <= 8, `the tubes add their passes, not one draw per link (${none} without links, ${big} with)`);
  assert.deepEqual(errors, []);
});

test('panning on the card repaints no land and sends no geometry again', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{let paints=0;const pw=paintWorld;paintWorld=function(){paints++;return pw.apply(this,arguments);};
    const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;draw(1000);GLX.gl.calls.length=0;
    for(let i=1;i<=30;i++){cam.x+=25;draw(1000+i*16);}
    paintWorld=pw;const c=GLX.gl.calls,static_=c.filter(x=>x[0]==='bufferData'&&x[3]==='STATIC_DRAW').length;
    return JSON.stringify({paints,tex:c.filter(x=>x[0]==='texImage2D').length,static_});})()`));
  assert.equal(r.paints, 0, 'the land is never painted with the 2D canvas');
  assert.equal(r.tex, 0, 'no picture of the land, no tube points uploaded again');
  assert.equal(r.static_, 0, 'the land and the cables were built once');
  assert.deepEqual(errors, []);
});

test('Settings › Map drawing: Auto uses the card, Always 2D keeps the 2D map and is remembered', () => {
  const { ev, errors } = open();
  ev(STUB);
  ev('ACT.settings({})');
  assert.match(ev(`document.getElementById('modal').innerHTML`), /data-act="mapSet"/, 'the setting is in Settings');
  ev(`ACT.mapSet({v:'2d'});draw(1000)`);
  assert.equal(ev(`localStorage.getItem('sot-map')`), '2d');
  assert.equal(ev('glOn()'), false);
  assert.equal(ev(`document.getElementById('mapgl').hidden`), true, 'the card is hidden');
  ev(`ACT.mapSet({v:'sideways'})`);
  assert.equal(ev(`localStorage.getItem('sot-map')`), '2d', 'a value it does not know changes nothing');
  ev(`ACT.mapSet({v:'auto'});draw(1016)`);
  assert.equal(ev(`localStorage.getItem('sot-map')`), null);
  assert.equal(ev('glOn()'), true);
  assert.equal(ev(`document.getElementById('mapgl').hidden`), false);
  assert.deepEqual(errors, []);
});

test('a sprite record that makes the queue grow is kept, for pictures and for discs', () => {
  const { ev, errors } = open();
  // Pictures and discs alternate, so both cross a growth (2048, then 4096 records); each record says which one it is.
  const bad = JSON.parse(ev(`(()=>{const e={up:true,u0:.1,v0:.2,u1:.3,v1:.4,cv:null};GLS.frame=true;GLS.n=0;GLS.data=new Float32Array(SPR_STRIDE*2048);
    for(let i=0;i<4100;i++){ctx.globalAlpha=(i%7+1)/8;if(i%2)dot(i,i*2,3+i%5,'#FF4D5E',(i%3+1)/4);else blit(e,i,i*2,10+i%9,20+i%11);}
    ctx.globalAlpha=1;const D=GLS.data,n=GLS.n,cap=D.length/SPR_STRIDE,bad=[];GLS.frame=false;GLS.n=0;
    for(let i=0;i<n;i++){const o=i*SPR_STRIDE,want=i%2?[i,i*2,3+i%5,1,(i%3+1)/4]:[i,i*2,10+i%9,0,(i%7+1)/8];
      const got=i%2?[D[o],D[o+1],D[o+2],D[o+12],D[o+11]]:[D[o],D[o+1],D[o+2],D[o+12],D[o+11]];
      if(i%2===0&&(D[o+3]!==20+i%11||D[o+4]!==Math.fround(.1)||D[o+7]!==Math.fround(.4)))bad.push(i);
      else if(i%2&&D[o+8]!==1)bad.push(i);
      else if(want.some((v,j)=>Math.fround(v)!==got[j]))bad.push(i);}
    return JSON.stringify({n,cap,bad:bad.slice(0,8),edges:[2047,2048,2049,4096,4097].filter(i=>bad.includes(i))});})()`));
  assert.equal(bad.n, 4100);
  assert.ok(bad.cap >= 4100, 'the queue grew past 4096 records');
  assert.deepEqual(bad.edges, [], 'the records at each growth are where they were drawn');
  assert.deepEqual(bad.bad, [], 'and so is every other record');
  assert.deepEqual(errors, []);
});

test('a city under attack never reuses its picture without the attack ring, and gets it back after', () => {
  const { ev, errors } = open();
  const r = JSON.parse(ev(`(()=>{const id=Object.keys(S.pops).find(c=>!S.pops[c].down||S.pops[c].down<=S.day),C=CITY[id],p=S.pops[id],t=cTier(id);
    const st={down:false,feed:false,sel:false,inc:false,ixDraw:false,ixHot:false,off:false,big:false};
    const spr=now=>{const ph=cityPhase(C,p,false,now);return [ph.dd,citySprite(C,p,t,1,1,ph,st)];};
    R.ddosHot={};const [d0,quiet]=spr(0);
    R.ddosHot={[id]:1};const [d1,hit0]=spr(0),[d2,hit3]=spr(90);
    R.ddosHot={};const [d3,after]=spr(0);
    // Animations off: the map's clock stays at 0, so the attack is always at step 0.
    R.ddosHot={[id]:1};const [d4,still]=spr(0);
    return JSON.stringify({dd:[d0,d1,d2,d3,d4],sameAtZero:quiet===hit0,step:hit0===hit3,back:after===quiet,still:still===hit0});})()`));
  assert.deepEqual(r.dd, [-1, 0, 3, -1, 0]);
  assert.equal(r.sameAtZero, false, 'step 0 of an attack is not the picture without one');
  assert.equal(r.step, false, 'the ring turns');
  assert.equal(r.back, true, 'once over, the plain picture is back');
  assert.equal(r.still, true, 'with animations off the attack keeps its own picture');
  assert.deepEqual(errors, []);
});

test('leaving a game hides the card’s layers, and the next game shows them again', () => {
  const { ev, errors } = open();
  ev(STUB);
  const shown = () => JSON.parse(ev(`JSON.stringify([GLX.shown,!document.getElementById('mapgl').hidden,!document.getElementById('mapfx').hidden])`));
  ev('draw(1000)');
  assert.deepEqual(shown(), [true, true, true], 'a game on the card');
  ev('ACT.toTitle();draw(1016)');
  assert.deepEqual(shown(), [false, false, false], 'back to the title: the old network is not left behind it');
  assert.ok(ev('ctx===CTX0'));
  ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;compute();draw(1032)`);
  assert.deepEqual(shown(), [true, true, true], 'the next game is on the card again');
  ev(`slotBroke(UI.slot||'x');draw(1048)`);
  assert.deepEqual(shown(), [false, false, false], 'a damaged save leaves the title with an empty map too');
  assert.deepEqual(errors, []);
});

// Faults injected into the card at each step of a frame: WebGL is given up once, the same frame is drawn in 2D, the
// layers are hidden, and the next frames are 2D without another try or another error.
for (const [where, inject] of [
  ['the start of a frame', `GLX.gl.clear=()=>{throw new Error('boom')};`],
  ['an upload of the tubes', `GLX.key=[];GLX.gl.texImage2D=()=>{throw new Error('boom')};`],
  ['the pictures’ draw', `GLS.prog={p:{},u:{}};GLS.vao={};GLS.tex={};glsDraw=()=>{throw new Error('boom')};`],
  ['a picture going into the atlas', `GLS.prog={p:{},u:{}};GLS.vao={};GLS.tex={};SPRS.clear();GLX.gl.texSubImage2D=()=>{throw new Error('boom')};`],
]) {
  test(`a fault in ${where} falls back to 2D once and for all`, () => {
    const { ev, errors } = open();
    ev(STUB);
    ev(`draw(1000);${inject}window.__tries=0;const gb=glBegin;glBegin=function(){__tries++;return gb.apply(this,arguments);};
      window.__warn=0;console.warn=function(){__warn++;};`);
    const c0 = ev('CTX0.calls.n');
    ev('draw(1016);draw(1032);draw(1048)');
    assert.equal(ev('GLX.dead'), true, 'WebGL is given up');
    assert.equal(ev('__tries'), 1, 'and not tried again every frame');
    assert.equal(ev('__warn'), 1, 'said once');
    assert.ok(ev('ctx===CTX0'), 'the 2D context is back');
    assert.equal(ev('GLS.frame'), false);
    assert.equal(ev('GLS.n'), 0);
    assert.equal(ev(`document.getElementById('mapgl').hidden&&document.getElementById('mapfx').hidden`), true, 'the layers are hidden');
    assert.ok(ev('CTX0.calls.n') - c0 > 1000, 'the 2D map is drawn, from the frame that failed on');
    assert.deepEqual(errors, []);
  });
}

test('an error outside the card still reaches the loop, and leaves the frame clean', () => {
  const { ev, errors } = open();
  ev(STUB);
  ev(`draw(1000);window.__dc=drawCity;drawCity=function(){throw new Error('not the card');};`);
  assert.throws(() => ev('draw(1016)'), /not the card/);
  assert.equal(ev('GLX.dead'), false, 'WebGL stays on: the card did nothing wrong');
  assert.ok(ev('ctx===CTX0'));
  assert.equal(ev('GLS.frame'), false);
  ev('drawCity=__dc;draw(1032)');
  assert.equal(ev('GLX.shown'), true);
  assert.deepEqual(errors, []);
});

test('selecting a tube sends its halo to the card, not the network again', () => {
  const { ev, errors } = open();
  ev(STUB);
  const r = JSON.parse(ev(`(()=>{const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;draw(1000);const c=GLX.gl.calls,nSeg=GLX.nSeg;
    const sent=()=>{const b=c.filter(x=>x[0]==='bufferData').map(x=>x[2]&&x[2].length||0),t=c.filter(x=>x[0]==='texImage2D').length;c.length=0;return {b,t};};
    sent();const l=S.links.find(l=>l.kind!=='vxc'&&!linkDown(l));UI.sel={type:'link',id:l.id};draw(1016);const on=sent(),halo=GLX.nHalo;
    UI.sel=null;draw(1032);const off=sent();
    return JSON.stringify({nSeg,on,off,halo,haloDraw:GLX.nHalo});})()`));
  const tubes = r.nSeg * ev('LINE_STRIDE');
  assert.ok(r.halo > 0, 'the halo has the selected tube’s segments');
  assert.ok(!r.on.b.includes(tubes) && r.on.t === 0, 'selecting sends no tube, packet or point again');
  assert.ok(r.on.b.includes(r.halo * ev('LINE_STRIDE')), 'only the halo goes up');
  assert.ok(!r.off.b.includes(tubes) && r.off.t === 0, 'nor does unselecting');
  assert.equal(r.haloDraw, 0, 'and the halo is gone');
  assert.deepEqual(errors, []);
});

// A WebGL2 context that compiles everything and names its renderer: enough for glInit() to run to the end.
const FAKE_GL = (name) => `(()=>{window.CanvasRenderingContext2D=window.CanvasRenderingContext2D||class{};const c=document.getElementById('mapgl');c.getContext=(t)=>t!=='webgl2'?null:new Proxy({},{get(t,k){
  if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
  if(k==='getExtension')return ()=>({UNMASKED_RENDERER_WEBGL:'REN'});
  if(k==='getParameter')return (p)=>p==='REN'?${JSON.stringify(name)}:p==='ACTIVE_UNIFORMS'?0:4096;
  if(k==='getShaderParameter'||k==='getProgramParameter')return (x,p)=>p==='ACTIVE_UNIFORMS'?0:true;
  return ()=>({});}});})()`;

test('a graphics card drawn by the processor keeps the 2D map; a real one gets the card', () => {
  for (const [name, gl] of [['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', false],
    ['llvmpipe (LLVM 17.0.6, 256 bits)', false], ['Microsoft Basic Render Driver', false],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', true], ['Apple M2', true], ['Mali-G78', true]]) {
    const { ev } = open();
    ev(FAKE_GL(name));
    ev('console.warn=()=>{}');
    assert.equal(ev('glInit()'), gl, name);
    assert.equal(ev('GLX.dead'), !gl, name);
    assert.equal(ev('GLX.gpu'), name, 'the renderer is still named');
  }
  const { ev } = open();
  ev(FAKE_GL('SwiftShader driver'));
  ev('GLX.soft=true');
  assert.equal(ev('glInit()'), true, 'the GPU benchmark can still measure it');
});

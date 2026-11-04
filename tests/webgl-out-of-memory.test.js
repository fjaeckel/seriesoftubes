// A graphics card short of memory may refuse a texture or a buffer without throwing: the call only leaves
// OUT_OF_MEMORY for getError(), and the atlas then drew every picture as a black box while the map stayed on the card.
// The big uploads now read it (glMem(), src/game/96-map/56-webgl.js): the atlas tries 2048 px before giving up, and
// any other refusal gives the card up for 2D in the same frame, or for a picture within a second. getError() is never
// read on an ordinary frame, and at most once a second while pictures are sent (each read waits for the card).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

/* A WebGL2 context that compiles everything, as tests/webgl-map.test.js's, and that refuses memory as asked in
   window.__FAIL: atlas (the texture sizes refused), land (the first static buffer after setup), tubes (the tubes'
   points), sprites (every picture sent into the atlas). A refusal sets OUT_OF_MEMORY, read once by getError(); the
   reads are counted. It also counts the pictures sent (__SUB), what is deleted (__DEL) and the context let go (__LOST). */
const GL = `(()=>{window.CanvasRenderingContext2D=window.CanvasRenderingContext2D||class{};window.__GE=0;window.__ERR=0;window.__SUB=0;window.__DEL=[];window.__LOST=0;window.__LOSTEV=0;
  const F=window.__FAIL;let setup=true,lost=false;const c=document.getElementById('mapgl');c.addEventListener('webglcontextlost',()=>{__LOSTEV++;});
  c.getContext=(t)=>t!=='webgl2'?null:new Proxy({},{get(t,k){
    if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
    if(k==='getExtension')return (n)=>n==='WEBGL_lose_context'?{loseContext:()=>{__LOST++;lost=true;c.dispatchEvent(new window.Event('webglcontextlost'));}}:{UNMASKED_RENDERER_WEBGL:'REN'};
    if(k==='isContextLost')return ()=>lost||!!window.__lostNow;
    if(k==='deleteTexture'||k==='deleteBuffer')return (x)=>{__DEL.push(x);};
    if(k==='texSubImage2D')return ()=>{__SUB++;if(F.sprites)__ERR='OUT_OF_MEMORY';};
    if(k==='getParameter')return (p)=>p==='REN'?'Stub GPU':p==='ACTIVE_UNIFORMS'?0:4096;
    if(k==='getShaderParameter'||k==='getProgramParameter')return (x,p)=>p==='ACTIVE_UNIFORMS'?0:true;
    if(k==='getError')return ()=>{__GE++;const e=__ERR;__ERR=0;return e;};
    if(k==='texImage2D')return (...a)=>{if(a[2]==='RGBA'&&(F.atlas||[]).includes(a[3]))__ERR='OUT_OF_MEMORY';if(a[2]==='RGBA32F'&&F.tubes)__ERR='OUT_OF_MEMORY';};
    if(k==='bufferData')return (...a)=>{if(a[2]==='STATIC_DRAW'&&F.land&&!setup){F.land=false;__ERR='OUT_OF_MEMORY';}};
    if(k==='useProgram')return ()=>{setup=false;};
    return ()=>({});}});})()`;

function open(fail) {
  const h = load({ seed: 777 });
  h.ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();
    window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});console.warn=()=>{};
    window.__FAIL=${JSON.stringify(fail)};`);
  h.ev(GL);
  return h;
}

test('a card without memory for a 4096 px atlas gets a 2048 px one, and keeps the map', () => {
  const { ev, errors } = open({ atlas: [4096] });
  assert.equal(ev('glInit()'), true);
  assert.equal(ev('GLS.size'), 2048);
  assert.equal(ev('GLX.dead'), false);
  assert.deepEqual(errors, []);
});

test('a card without memory for either atlas leaves the map in 2D', () => {
  const { ev, errors } = open({ atlas: [4096, 2048] });
  assert.equal(ev('glInit()'), false);
  assert.equal(ev('GLX.dead'), true);
  ev('__T+=16;draw(__T);');
  assert.equal(ev('glOn()'), false, 'the map is drawn in 2D');
  assert.equal(ev('document.getElementById("mapgl").hidden'), true);
  assert.deepEqual(errors, []);
});

for (const what of ['land', 'tubes']) {
  test(`a card that refuses the ${what} without throwing gives the map to 2D in the same frame`, () => {
    const { ev, errors } = open({ [what]: true });
    assert.equal(ev('glInit()'), true);
    ev('UI.tickErr=false;__T+=16;draw(__T);');
    assert.equal(ev('GLX.dead'), true, 'the card is given up');
    assert.equal(ev('glOn()'), false);
    assert.equal(ev('document.getElementById("mapgl").hidden'), true);
    assert.equal(ev('ctx===CTX0&&!GLS.frame'), true);
    assert.equal(ev('!!UI.tickErr'), false, 'no glitch for the player: the frame is drawn again in 2D');
    // The next frames are plain 2D ones.
    ev('__T+=16;draw(__T);__T+=16;draw(__T);');
    assert.deepEqual(errors, []);
  });
}

test('an ordinary frame never asks the card for its errors', () => {
  const { ev, errors } = open({});
  assert.equal(ev('glInit()'), true);
  ev('__T+=16;draw(__T);');
  assert.equal(ev('GLX.dead'), false);
  assert.ok(ev('__GE') > 0, 'the first frame checked its uploads');
  // Panning brings new cities into view, whose pictures are sent: they are checked at most once a second (each read
  // waits for the card), the first time a second after the first frame's check.
  const pan = JSON.parse(ev(`(()=>{let sent=0,reads=0,most=0,at=[];for(let i=0;i<120;i++){const s=__SUB,g=__GE;cam.x+=3;__T+=16;draw(__T);
    if(__SUB>s)sent++;if(__GE>g){reads++;at.push(i);}most=Math.max(most,__GE-g);}return JSON.stringify({sent,reads,most,at});})()`));
  assert.ok(pan.sent > 5, 'frames send pictures');
  assert.ok(pan.reads >= 1 && pan.reads <= 2, `about two seconds of panning read the errors once or twice, not once per frame that sends (${JSON.stringify(pan)})`);
  assert.ok(pan.most <= 4, 'one check reads at most four flags');
  // The pan's last pictures are still to be checked: once, on the next frame a second on. Then a still map reads nothing.
  ev('__GE=0;__T+=1100;draw(__T);');
  assert.ok(ev('__GE') <= 4, 'the pictures left over are checked once');
  ev('__GE=0;for(let i=0;i<10;i++){__T+=1100;draw(__T);}');
  assert.equal(ev('__GE'), 0, 'a still map reads nothing');
  assert.deepEqual(errors, []);
});

/* A picture the card refused without throwing (texSubImage2D only leaves OUT_OF_MEMORY) was kept as sent, and drawn
   from an atlas that never got it. The frame now checks its new pictures before drawing them, and gives the map to 2D
   in that same frame: no picture is kept as sent. */
test('a picture the card refuses without throwing gives the map to 2D in the same frame', () => {
  const { ev, errors } = open({ sprites: true });
  assert.equal(ev('glInit()'), true);
  ev('UI.tickErr=false;const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;__T+=16;draw(__T);');
  assert.ok(ev('__SUB') > 0, 'pictures were sent');
  assert.equal(ev('GLX.dead'), true, 'the card is given up');
  assert.equal(ev('SPRS.size'), 0, 'no picture is kept as sent to the card');
  assert.equal(ev('glOn()'), false);
  assert.equal(ev('document.getElementById("mapgl").hidden'), true);
  assert.ok(ev('SPRC.size') > 0, 'the same frame was drawn again in 2D, with its own pictures');
  assert.equal(ev('!!UI.tickErr'), false, 'no glitch for the player');
  ev('__T+=16;draw(__T);');
  assert.deepEqual(errors, []);
});

// The card keeps an error until it is read: a picture refused between two checks is found by the next one.
test('a picture refused after the first check gives the map to 2D within a second', () => {
  const { ev, errors } = open({});
  assert.equal(ev('glInit()'), true);
  ev('UI.tickErr=false;const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;__T+=16;draw(__T);');
  assert.equal(ev('GLX.dead'), false);
  ev('__FAIL.sprites=true;');
  const n = ev('(()=>{let i=0;for(;i<120&&!GLX.dead;i++){cam.x+=5;__T+=16;draw(__T);}return i;})()');
  assert.equal(ev('GLX.dead'), true, 'given up');
  assert.ok(n * 16 <= 1000 + 32, `within a second (${n} frames)`);
  assert.equal(ev('SPRS.size'), 0, 'no picture is kept as sent');
  assert.equal(ev('!!UI.tickErr'), false, 'no glitch for the player');
  assert.deepEqual(errors, []);
});

/* Given up for good while the context still lives (memory refused), the card kept the atlas (64 MB at 4096 px) and the
   rest while the 2D map began painting its own pictures. glKill() now deletes the biggest and lets the context go. */
test('giving the card up for good frees what it holds and lets the context go, and the frame is drawn in 2D', () => {
  const { ev, errors } = open({ tubes: true });
  assert.equal(ev('glInit()'), true);
  ev('window.__atlas=GLS.tex;window.__tubes=GLX.tex;window.__buf=GLS.buf;');
  ev('UI.tickErr=false;__T+=16;draw(__T);');
  assert.equal(ev('GLX.dead'), true);
  assert.equal(ev('__DEL.includes(__atlas)&&__DEL.includes(__tubes)&&__DEL.includes(__buf)'), true, 'the atlas, the tubes’ points and the pictures’ buffer are deleted');
  assert.equal(ev('__LOST'), 1, 'the context is let go');
  assert.equal(ev('__LOSTEV'), 1, 'its loss event came once');
  assert.equal(ev('GLS.tex===null&&GLS.buf===null&&GLX.tex===null&&GLX.gl===null&&GLX.ctx===null'), true, 'nothing on the card is referenced');
  assert.equal(ev('GLX.why'), 'the graphics card is out of memory (the tubes)', 'the loss it caused does not replace the reason');
  assert.equal(ev('!!UI.tickErr'), false, 'the frame was drawn again in 2D');
  ev('__T+=16;draw(__T);');
  assert.deepEqual(errors, []);
});

test('a setup that fails half-way lets its context go too', () => {
  const { ev, errors } = open({ atlas: [4096, 2048] });
  assert.equal(ev('glInit()'), false);
  assert.equal(ev('__LOST'), 1);
  assert.equal(ev('GLX.ctx'), null);
  assert.deepEqual(errors, []);
});

// A context the browser lost may come back (tests/webgl-context-restore.test.js): it is waited for, not let go.
test('a context the browser lost is not let go a second time', () => {
  const { ev, errors } = open({});
  assert.equal(ev('glInit()'), true);
  ev('__T+=16;draw(__T);');
  ev('window.__lostNow=true;document.getElementById("mapgl").dispatchEvent(new window.Event("webglcontextlost",{cancelable:true}));');
  assert.equal(ev('GLX.dead'), false, 'waiting for it to come back');
  assert.equal(ev('GLX.lost&&!glOn()'), true, 'the 2D map draws meanwhile');
  assert.equal(ev('__LOST'), 0, 'nothing to let go: the browser already did');
  ev('__T+=16;draw(__T);');
  assert.deepEqual(errors, []);
});

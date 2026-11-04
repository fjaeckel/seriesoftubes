// A graphics card short of memory may refuse a texture or a buffer without throwing: the call only leaves
// OUT_OF_MEMORY for getError(), and the atlas then drew every picture as a black box while the map stayed on the card.
// The big uploads now read it (glMem(), src/game/96-map/56-webgl.js): the atlas tries 2048 px before giving up, and
// any other refusal gives the card up for 2D in the same frame. getError() is never read on an ordinary frame (each
// read waits for the card).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

/* A WebGL2 context that compiles everything, as tests/webgl-map.test.js's, and that refuses memory as asked in
   window.__FAIL: atlas (the texture sizes refused), land (the first static buffer after setup), tubes (the tubes'
   points). A refusal sets OUT_OF_MEMORY, read once by getError(); the reads are counted. */
const GL = `(()=>{window.CanvasRenderingContext2D=window.CanvasRenderingContext2D||class{};window.__GE=0;window.__ERR=0;
  const F=window.__FAIL;let setup=true;const c=document.getElementById('mapgl');
  c.getContext=(t)=>t!=='webgl2'?null:new Proxy({},{get(t,k){
    if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
    if(k==='getExtension')return ()=>({UNMASKED_RENDERER_WEBGL:'REN'});
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
  ev('__GE=0;for(let i=0;i<30;i++){cam.x+=3;__T+=16;draw(__T);}');
  assert.equal(ev('__GE'), 0, 'panning sends nothing big, so nothing is read');
  assert.deepEqual(errors, []);
});

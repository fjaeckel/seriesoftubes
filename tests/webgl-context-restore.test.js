// A WebGL context can be lost and given back: a driver reset, or on a phone sometimes just leaving the app. The map
// gave the card up for the session at the first loss, so a phone that went to another app came back to the slower 2D
// map until the page was reloaded. It now draws in 2D while the context is away, and builds everything on the card
// again when the browser gives it back (webglcontextrestored), up to GL_LOSSES times a session. Settings › Map drawing
// › Always 2D lets the context go the same way (WEBGL_lose_context), and Auto asks for it back, so a map drawn in 2D
// does not hold 64 MB of atlas on the card. Switching for the GPU benchmark (mapGl(on,false)) keeps the context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

/* A WebGL2 context that compiles everything, as tests/webgl-map.test.js's. It can be lost by the "browser"
   (__browserLose(), __browserRestore()) or through WEBGL_lose_context (counted in __LOST and __RESTORE; without it when
   window.__noExt). Events come at once, which the real ones do not: the code must not rely on either order. Textures
   made are counted (__TEX), so a rebuild shows. */
const GL = `(()=>{window.CanvasRenderingContext2D=window.CanvasRenderingContext2D||class{};window.__LOST=0;window.__RESTORE=0;window.__TEX=0;
  let lost=false;const c=document.getElementById('mapgl'),fire=t=>c.dispatchEvent(new window.Event(t,{cancelable:true}));
  window.__browserLose=()=>{lost=true;fire('webglcontextlost');};window.__browserRestore=()=>{lost=false;fire('webglcontextrestored');};
  const ext={loseContext:()=>{__LOST++;if(lost)return;lost=true;fire('webglcontextlost');},restoreContext:()=>{__RESTORE++;if(!lost)return;lost=false;fire('webglcontextrestored');}};
  const gl=new Proxy({},{get(t,k){
    if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k))return k;
    if(k==='getExtension')return (n)=>n==='WEBGL_lose_context'?(window.__noExt?null:ext):{UNMASKED_RENDERER_WEBGL:'REN'};
    if(k==='isContextLost')return ()=>lost;
    if(k==='createTexture')return ()=>{__TEX++;return {};};
    if(k==='getParameter')return (p)=>p==='REN'?'Stub GPU':p==='ACTIVE_UNIFORMS'?0:4096;
    if(k==='getShaderParameter'||k==='getProgramParameter')return (x,p)=>p==='ACTIVE_UNIFORMS'?0:true;
    if(k==='getError')return ()=>0;
    return ()=>({});}});
  c.getContext=(t)=>t==='webgl2'?gl:null;})()`;

function open(storage) {
  const h = load({ seed: 777, storage });
  h.ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();
    window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});console.warn=()=>{};
    const h=CITY[S.home];cam.x=h.x;cam.y=h.y;cam.z=1.4;`);
  h.ev(GL);
  return h;
}
const frame = (ev) => ev('__T+=16;draw(__T);JSON.stringify({gl:!!GLX.gl&&GLX.shown,dead:GLX.dead,lost:GLX.lost,sprs:SPRS.size,sprc:SPRC.size,err:!!UI.tickErr})');

test('a context the browser loses draws the map in 2D, then on the card again once it is back', () => {
  const { ev, errors } = open();
  assert.equal(JSON.parse(frame(ev)).gl, true, 'drawn on the card');
  ev('UI.tickErr=false;__browserLose();');
  let f = JSON.parse(frame(ev));
  assert.deepEqual([f.gl, f.dead, f.lost, f.err], [false, false, true, false], 'in 2D while it is away, without a glitch');
  assert.equal(f.sprs, 0, 'the card’s pictures are forgotten (its atlas went with the context)');
  assert.ok(f.sprc > 0, 'the 2D map paints its own');
  assert.equal(ev('document.getElementById("mapgl").hidden'), true);
  ev('window.__t0=__TEX;window.__built=0;const gb=glBuild;glBuild=function(){__built++;return gb.apply(this,arguments);};__browserRestore();');
  f = JSON.parse(frame(ev));
  assert.deepEqual([f.gl, f.dead, f.lost], [true, false, false], 'back on the card');
  assert.ok(ev('__TEX-__t0') >= 2, 'the atlas and the tubes’ points are made again');
  assert.equal(ev('__built'), 1, 'the tubes are built again');
  assert.ok(f.sprs > 0, 'the pictures are sent again');
  assert.equal(ev('GLX.losses'), 1);
  assert.deepEqual(errors, []);
});

test(`a card lost more than GL_LOSSES times is given up for the session`, () => {
  const { ev, errors } = open();
  frame(ev);
  const n = ev('GL_LOSSES');
  for (let i = 0; i < n; i++) { ev('__browserLose()'); frame(ev); ev('__browserRestore()'); assert.equal(JSON.parse(frame(ev)).gl, true, `back after loss ${i + 1}`); }
  ev('__browserLose()');
  let f = JSON.parse(frame(ev));
  assert.equal(f.dead, true, 'given up');
  assert.match(ev('GLX.why'), /lost 3 times/);
  assert.equal(ev('__LOST'), 0, 'nothing to let go: the browser already did');
  // A late restore does not bring it back.
  ev('__browserRestore()');
  f = JSON.parse(frame(ev));
  assert.deepEqual([f.gl, f.dead], [false, true]);
  assert.deepEqual(errors, []);
});

test('Always 2D lets the context go, Auto takes it back, and neither counts as a loss', () => {
  const { ev, errors } = open();
  frame(ev);
  ev("ACT.mapSet({v:'2d'})");
  assert.equal(ev('__LOST'), 1, 'the context is let go');
  assert.equal(ev('GLX.gl===null&&GLS.tex===null&&SPRS.size===0'), true, 'nothing on the card is held');
  let f = JSON.parse(frame(ev));
  assert.deepEqual([f.gl, f.dead], [false, false]);
  assert.equal(ev('localStorage.getItem("sot-map")'), '2d');
  ev("ACT.mapSet({v:'auto'})");
  assert.equal(ev('__RESTORE'), 1, 'asked back');
  f = JSON.parse(frame(ev));
  assert.deepEqual([f.gl, f.dead, f.lost], [true, false, false], 'on the card again');
  assert.equal(ev('GLX.losses'), 0, 'the player’s choice is not a failure');
  // Back and forth: still fine, still not counted.
  for (let i = 0; i < 4; i++) { ev("ACT.mapSet({v:'2d'})"); frame(ev); ev("ACT.mapSet({v:'auto'})"); }
  assert.equal(JSON.parse(frame(ev)).gl, true);
  assert.equal(ev('GLX.losses'), 0);
  assert.deepEqual(errors, []);
});

test('a context the browser gives back after the player chose Always 2D is let go again', () => {
  const { ev, errors } = open();
  frame(ev);
  ev('__browserLose()');
  ev("ACT.mapSet({v:'2d'})");
  assert.equal(ev('__LOST'), 0, 'already lost: nothing to let go yet');
  ev('__browserRestore()');
  assert.equal(ev('__LOST'), 1, 'let go as soon as it is back');
  assert.equal(JSON.parse(frame(ev)).gl, false);
  ev("ACT.mapSet({v:'auto'})");
  assert.equal(JSON.parse(frame(ev)).gl, true);
  assert.deepEqual(errors, []);
});

test('the GPU benchmark switches maps without letting the context go', () => {
  const { ev, errors } = open();
  frame(ev);
  ev('mapGl(false,false)');
  assert.equal(JSON.parse(frame(ev)).gl, false);
  ev('mapGl(true,false)');
  assert.equal(JSON.parse(frame(ev)).gl, true);
  assert.equal(ev('__LOST+__RESTORE'), 0);
  assert.deepEqual(errors, []);
});

test('without WEBGL_lose_context, Always 2D keeps the context, as before', () => {
  const { ev, errors } = open();
  ev('window.__noExt=true');
  frame(ev);
  ev("ACT.mapSet({v:'2d'})");
  assert.equal(JSON.parse(frame(ev)).gl, false);
  assert.equal(ev('!!GLX.gl'), true, 'kept for later');
  ev("ACT.mapSet({v:'auto'})");
  assert.equal(JSON.parse(frame(ev)).gl, true);
  assert.deepEqual(errors, []);
});

test('a game started with Always 2D never makes a context', () => {
  const { ev, errors } = open({ 'sot-map': '2d' });
  ev('window.__made=0;const gc=document.getElementById("mapgl").getContext;document.getElementById("mapgl").getContext=t=>{__made++;return gc(t);};');
  frame(ev);
  ev("ACT.settings({})");
  assert.equal(ev('__made'), 0);
  assert.deepEqual(errors, []);
});

// Settings said whether the card could draw the map by setting it up: opening them on the title screen or in a puzzle
// made the context and its 64 MB atlas for a map drawn in 2D. It now says what is known without asking the card.
test('opening Settings never makes a context, and still says when the card cannot', () => {
  const { ev, errors } = open();
  ev('window.WebGL2RenderingContext=function(){};window.__made=0;const c=document.getElementById("mapgl"),gc=c.getContext;c.getContext=t=>{__made++;return gc(t);};');
  const note = () => ev("settingsHtml().includes(tr('settings.this_browser_cannot_so_the_map'))");
  ev('const s=S;S=null;window.__S=s;');
  assert.equal(note(), false, 'title screen: a card not tried yet counts as able');
  ev('S=__S;');
  assert.equal(note(), false);
  assert.equal(ev('__made'), 0, 'no context made by Settings');
  ev('glKill(new Error("no graphics card, only SwiftShader"))');
  assert.equal(note(), true, 'a card given up: Settings says so');
  ev('delete window.WebGL2RenderingContext;GLX.dead=false;');
  assert.equal(note(), true, 'no WebGL2 in this browser: Settings says so');
  assert.deepEqual(errors, []);
});

test('Auto after Always 2D, when the browser will not give the context back, gives the card up instead of waiting all session', () => {
  const { ev, errors } = open();
  assert.equal(JSON.parse(frame(ev)).gl, true);
  ev(`ACT.mapSet({v:'2d'});`);
  assert.equal(ev('GLX.sleep&&GLX.lost'), true, 'Always 2D let the context go');
  ev(`GLX.lose.restoreContext=()=>{throw new Error('not now');};ACT.mapSet({v:'auto'});`);
  const f = JSON.parse(frame(ev));
  assert.deepEqual([f.gl, f.dead, f.lost], [false, true, true], 'given up for 2D, with a reason');
  assert.match(ev('diagMap()'), /map: 2D \(not now\)/, 'Diagnostic info says why, not "waiting for it back"');
  assert.deepEqual(errors, []);
});

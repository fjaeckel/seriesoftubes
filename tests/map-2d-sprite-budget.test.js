// The 2D map keeps a canvas per picture (59-gl-sprites.js). A long zoom on a big network paints every city again at
// each step, and the list, capped only by its length, held up to 180 MB of pictures where a frame shows at most 23 MB.
// It is now held to SPRC_BUDGET bytes: past it, the pictures no frame used since the one before are let go, and those
// in use are always kept. The page's clock is set by hand, so nothing depends on how fast the test runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

// The big network on a 1280×800 screen at 2× in 2D. Canvases are counted as they are made; their contexts take any call.
function open() {
  const h = load({ seed: 777 });
  h.ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();S.nextFail=S.day+999;S.nextEvent=S.day+999;compute();
    window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});mapGl(false,false);
    DPR=2;CW=1280;CH=800;cam.x=CITY.fra.x;cam.y=CITY.fra.y;cam.z=0.6;window.__cv=0;
    const ce=document.createElement.bind(document);document.createElement=function(t){const e=ce(t);if(String(t).toLowerCase()==='canvas')__cv++;return e;};
    HTMLCanvasElement.prototype.getContext=function(){return this.__c||(this.__c=new Proxy({},{get(t,k){if(k in t)return t[k];
      if(k==='measureText')return s=>({width:String(s).length*7});if(k==='createLinearGradient')return ()=>({addColorStop(){}});return ()=>{};},set(t,k,v){t[k]=v;return true;}}));};
    window.__bytes=()=>{let b=0;for(const e of SPRC.values())b+=e.pw*e.ph*4;return b;};
    // What the last frame drew: its pictures and their bytes.
    window.__used=()=>{let n=0,b=0;for(const e of SPRC.values())if(e.f===SPR_F){n++;b+=e.pw*e.ph*4;}return {n,b};};`);
  return h;
}
// A pinch from 0.6 to 3.2 and back in 180 frames of 16 ms: the most bytes held, and the most a frame used.
const PINCH = `(()=>{let held=0,used=0,drift=0;for(let i=0;i<=180;i++){const f=i<=90?i/90:(180-i)/90;cam.z=0.6*Math.pow(3.2/0.6,f);__T+=16;draw(__T);
  const b=__bytes();held=Math.max(held,b);used=Math.max(used,__used().b);drift=Math.max(drift,Math.abs(b-SPRC_B));}return JSON.stringify({held,used,drift});})()`;

test('a long zoom on the 2D map holds its pictures to the budget, plus what one frame needs', () => {
  const { ev, errors } = open();
  const r = JSON.parse(ev(PINCH));
  const MB = 1048576, budget = ev('SPRC_BUDGET');
  assert.equal(r.drift, 0, 'the bytes counted are the bytes held');
  assert.ok(r.used > 5 * MB, `a frame uses a real share of it (${(r.used / MB).toFixed(1)} MB)`);
  // After a frame, over the budget only if that frame alone needs more.
  assert.ok(r.held <= Math.max(budget, r.used), `held ${(r.held / MB).toFixed(1)} MB, budget ${budget / MB} MB`);
  assert.ok(r.held < 80 * MB, `far under the 180 MB it held before (${(r.held / MB).toFixed(1)} MB)`);
  assert.deepEqual(errors, []);
});

test('the pictures a frame uses are never let go, and a still map paints nothing new', () => {
  const { ev, errors } = open();
  ev(PINCH);
  // Every picture the last frame drew is still kept (it was used, so it cannot have been let go).
  ev('window.__keep=[];const b0=blit;blit=function(e,...a){__keep.push(e);return b0(e,...a);};__T+=16;draw(__T);blit=b0;');
  assert.ok(ev('__keep.length') > 50);
  assert.equal(ev('__keep.every(e=>[...SPRC.values()].includes(e))'), true, 'every picture of the frame is kept');
  // The same view again and again: everything comes from the kept pictures.
  ev('window.__c0=__cv;for(let i=0;i<5;i++){__T+=16;draw(__T);}');
  assert.equal(ev('__cv-__c0'), 0, 'no picture painted again');
  assert.deepEqual(errors, []);
});

test('under the budget nothing is let go', () => {
  const { ev, errors } = open();
  ev('cam.z=1.1;__T+=16;draw(__T);window.__n=SPRC.size;window.__b=SPRC_B;');
  assert.ok(ev('__b') < ev('SPRC_BUDGET'));
  // A small pan: new pictures come in, none goes.
  ev('for(let i=0;i<10;i++){cam.x+=4;__T+=16;draw(__T);}');
  assert.ok(ev('SPRC.size') >= ev('__n'), 'the list only grew');
  assert.equal(ev('SPRC_B'), ev('__bytes()'));
  // A reset (a new pixel density) forgets the bytes with the pictures.
  ev('DPR=1;__T+=16;draw(__T);');
  assert.equal(ev('SPRC_B'), ev('__bytes()'));
  assert.deepEqual(errors, []);
});

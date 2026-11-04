// The GPU benchmark's panel (scripts/lib/gpu-bench-client.js): one trial must never reach into the next. A day the route
// worker is still routing lands on the save it was routed for, a pan's frame callback stops with its trial, every
// trial starts from the same random numbers, and the table says which map really drew each run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'gpu-bench-client.js'), 'utf8');

function open(cfg = {}) {
  const h = load({ seed: 777 });
  h.ev(`window.__BENCH__=${JSON.stringify({ expose: true, secs: 0.15, warm: 0, settleMs: 300, ...cfg })};`);
  h.ev(CLIENT);
  h.ev(`__bench.setSave(${JSON.stringify(SAVE)});save=()=>{};`);
  return h;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A day in flight in the worker when the trial ends: rwDone() would run its dayPost() whenever the answer comes.
const IN_FLIGHT = `window.__old=S;RW.seq=41;RW.job={seq:41,d:201,gen:RW.gen-1,t:0};window.__posts=[];
  dayPost=function(d){__posts.push({d,old:S===__old});};`;

test('a late answer from the route worker lands on the trial it belongs to, not the next one', async () => {
  const { ev, errors } = open();
  await ev('__bench.reset()');
  ev(IN_FLIGHT);
  ev('setTimeout(()=>rwDone({seq:41}),60)');
  await ev('__bench.reset()');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__posts)')), [{ d: 201, old: true }], 'its day ran on the old save, before the new one was loaded');
  assert.equal(ev('S!==__old&&RW.job===null'), true);
  assert.deepEqual(errors, []);
});

test('an answer that never comes is dropped, and coming late it changes nothing', async () => {
  const { ev, errors } = open();
  await ev('__bench.reset()');
  ev(IN_FLIGHT);
  ev('console.warn=()=>{}');
  await ev('__bench.reset()');
  assert.equal(ev('RW.job'), null, 'the next trial does not wait for it forever');
  ev('rwDone({seq:41})');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__posts)')), [], 'nothing ran on the new save');
  assert.deepEqual(errors, []);
});

test('a pan stops with its trial: the next trial’s camera is left alone', async () => {
  const { ev, errors } = open();
  const m = JSON.parse(await ev('__bench.measure({id:"pan",pan:true,z:1.4,speed:0},60,"2d").then(JSON.stringify)'));
  assert.ok(m.fps > 0, 'the pan ran');
  ev('cam.x=0');
  await wait(120);
  assert.equal(ev('cam.x'), 0, 'no frame of the pan came after it');
  const x8 = await ev('(async()=>{const p=__bench.measure({id:"x8",z:1.4,speed:8},60,"2d");await new Promise(r=>setTimeout(r,20));const x=cam.x;await p;return [x,cam.x];})()');
  assert.equal(x8[0], x8[1], 'the next scenario keeps its camera where it put it');
  assert.deepEqual(errors, []);
});

test('every trial starts from the same random numbers and an empty clock', async () => {
  const { ev, errors } = open();
  const draws = async () => { await ev('acc=12345;animT=999;__bench.reset()'); return ev('JSON.stringify([acc,animT,Math.random(),Math.random(),Math.random()])'); };
  const a = await draws(), b = await draws();
  assert.equal(a, b);
  assert.deepEqual(JSON.parse(a).slice(0, 2), [0, 0]);
  assert.deepEqual(errors, []);
});

test('the table says which map drew each run, and what each column measures', () => {
  const { ev } = open();
  const md = ev(`(()=>{const m=(drawn,gl,flat,gpu)=>({fps:60,p95:17,drawMs:1,drawn,glFrames:gl,flatFrames:flat,gpuMs:gpu});
    const res={'2d':{'x1-mid':m('2d',0,300,null)},gl:{'x1-mid':m('mixed',12,288,0.8)}};
    return __bench.table(res,{gpu:'stub',ua:'ua',w:1,h:1,dpr:1,hz:60,cores:1,save:'s',reps:1});})()`);
  assert.match(md, /WebGL GPU/, 'a GPU column when the card timed its frames');
  assert.match(md, /CPU time on the main thread/, 'draw() is said to be CPU time');
  assert.match(md, /Not drawn by the map they name: Map at x1 \(zoom 1\.4\) \(WebGL: 288 frames in 2D/, 'a run that fell back to 2D is flagged');
  const merged = JSON.parse(ev(`JSON.stringify(__bench.merge([{fps:50,drawn:'gl',hidden:false,slow:[1]},{fps:70,drawn:'gl',hidden:true,slow:[2]},{fps:60,drawn:'2d',hidden:false,slow:[]}]))`));
  assert.deepEqual(merged, { fps: 60, drawn: 'gl+2d', hidden: true, slow: [1, 2], runs: 3 });
});

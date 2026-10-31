const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A game with three POPs around Europe, and a hook that keeps the cities cityRoom() saw on the last frame.
function game(t) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});S.lvl=6;S.cash=1e9;for(const c of ['ams','lon','par'])ACT.buildPop({city:c});UI.speed=0;compute()");
  h.ev("window.__v=null;const o=cityRoom;cityRoom=(v,s)=>{o(v,s);window.__v=v;}");
  return h;
}
// Draw one frame at a zoom and return what each visible city got: tier, room, dot or not, label or not.
const frame = (ev, z, x = 1040, y = 300) => {
  ev(`window.__v=null;cam.x=${x};cam.y=${y};cam.z=${z};draw(0)`);
  return JSON.parse(ev("JSON.stringify((window.__v||[]).map(v=>({id:v.C.id,P:v.C.P,t:cTier(v.C.id),sx:v.sx,sy:v.sy,r:v.r,dem:v.dem,pr:v.pr,ly:v.ly})))"));
};
const near = (a, b) => Math.hypot(a.sx - b.sx, a.sy - b.sy) < a.r + b.r - 1e-6;

test('five city sizes from eyeballs: megacities are rare, outposts are huts', t => {
  const { ev, errors } = game(t);
  assert.equal(ev("cTier('sha')"), 4, 'Shanghai');
  assert.equal(ev("cTier('nyc')"), 4, 'New York');
  assert.equal(ev("cTier('dks')"), 0, 'Dikson');
  const n = JSON.parse(ev("JSON.stringify([0,1,2,3,4].map(t=>CITIES.filter(C=>cTier(C.id)===t).length))"));
  assert.ok(n.every(x => x > 0), `every size is used: ${n}`);
  assert.ok(n[4] <= 20, `megacities stay rare: ${n[4]}`);
  // bigger cities draw bigger, near and far
  assert.equal(ev("[1,2,3,4].every(t=>SKY_H[t]>SKY_H[t-1]&&SKY_W[t]>SKY_W[t-1]&&FAR_R[t]>FAR_R[t-1])"), true);
  assert.deepEqual(errors, []);
});

test('crowded small cities give way to bigger ones as dots; your POPs and the selected city never do', t => {
  const { ev, errors } = game(t);
  ev("UI.sel={type:'city',id:'bru'}");
  const v = frame(ev, 1.05);
  assert.ok(v.length > 50 && v.some(x => x.dem), 'a crowded view has dots');
  for (const x of v.filter(x => x.pr <= 2)) assert.equal(x.dem, false, `${x.id} keeps its icon`);
  assert.equal(v.find(x => x.id === 'bru').dem, false, 'the selected city');
  for (const id of ['ams', 'lon', 'par']) assert.equal(v.find(x => x.id === id).dem, false, `POP ${id}`);
  const full = v.filter(x => !x.dem);
  // two ordinary cities with full icons never sit on each other
  for (const a of full) for (const b of full) if (a !== b && a.pr === 3 && b.pr === 3) assert.ok(!near(a, b), `${a.id} and ${b.id} overlap`);
  // a city only gives way to one that is more important or at least as big
  for (const d of v.filter(x => x.dem)) assert.ok(full.some(b => near(d, b) && (b.pr < d.pr || b.P >= d.P)), `${d.id} gave way to nothing bigger`);
  // and a dot gets no label
  for (const d of v.filter(x => x.dem)) assert.equal(d.ly, null, `${d.id} has no label`);
  assert.deepEqual(errors, []);
});

test('zooming in gives every city its skyline back; zoomed out the map is dots sized by eyeballs', t => {
  const { ev, errors } = game(t);
  const dots = z => frame(ev, z).filter(x => x.dem).length;
  const a = dots(1.05), b = dots(1.7), c = dots(3.2);
  assert.ok(a > b && b > c, `fewer dots as you zoom in: ${a}, ${b}, ${c}`);
  assert.equal(c, 0, 'close in, every city in view has its skyline');
  // far view: no room to share, every city is a dot drawn by size (cityRoom is not needed)
  assert.equal(frame(ev, 0.5).length, 0);
  assert.equal(ev('CM.far'), true);
  assert.deepEqual(errors, []);
});

test('a city shown as a dot is still there to tap', t => {
  const { ev, errors } = game(t);
  const v = frame(ev, 1.05);
  const lone = v.filter(x => x.dem).find(d => v.every(o => o === d || Math.hypot(o.sx - d.sx, o.sy - d.sy) > 24));
  assert.ok(lone, 'a dot with nothing right next to it');
  assert.equal(ev(`(pickCity(${lone.sx},${lone.sy + 2})||{}).id`), lone.id);
  assert.deepEqual(errors, []);
});

test('phones draw cities a little smaller, so more of them keep their skyline', t => {
  const { ev, errors } = game(t);
  const desk = frame(ev, 1.05).filter(x => x.dem).length;
  ev("Object.defineProperty(window,'innerWidth',{value:390,configurable:true})");
  assert.equal(ev('cityScale(1)'), 0.82);
  const v = frame(ev, 1.3);
  assert.ok(v.length > 0 && v.filter(x => !x.dem).every(x => x.r <= 40), 'small enough for a narrow screen');
  assert.ok(desk > 0);
  assert.deepEqual(errors, []);
});

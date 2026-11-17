// The NOC wallboard's windows (93-noc-windows.js): every panel moves by its title bar, resizes by its edges, answers the arrow
// keys, and is kept in this browser only. Seeded; pointer and key events are dispatched like the browser does.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, browser } = require('./harness');
const { until } = require('./net');

const KEY = 'sot-noc-win';
const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', '45-noc-window.css'), 'utf8');
const URL = 'https://tests.invalid/?noc=nocwintests';
const START = "UI.pitched=true;ACT.pickStart({city:'fra'});ACT.start({});closeModal();S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;" +
  "ACT.launchBB({city:'fra'});S.pops.fra.bb.d=300;S.pops.fra.rgen=1;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute();save(true)";
const DEF = { map: [0, 0, 14, 20], traffic: [0, 20, 14, 15], alarms: [14, 0, 10, 12], ports: [14, 12, 10, 23], routers: [0, 35, 8, 12], links: [8, 35, 8, 12], money: [16, 35, 8, 12] };
// Swapped: the traffic window dragged up over the map.
const SWAP = { ...DEF, map: [0, 15, 14, 20], traffic: [0, 0, 14, 15] };

// A NOC window showing the big network (as the game would send it) on a deck 1250 px wide: a column is 52.5 px, a row is 20.
function win(t, opts = {}) {
  const h = load({ url: URL, ...opts });
  t.after(() => h.dom.window.close());
  h.dom.window.__save = SAVE;
  h.ev('S=migrate(JSON.parse(window.__save));UI.started=true;UI.speed=0;compute();nocRender()');
  h.ev("$('nwDeck').getBoundingClientRect=()=>({left:0,top:0,width:1250,height:900,right:1250,bottom:900})");
  return h;
}
const doc = (h) => h.dom.window.document;
const lay = (h) => Object.fromEntries(JSON.parse(h.ev('JSON.stringify(NOCW.lay.map(i=>[i.id,i.x,i.y,i.w,i.h]))')).map(([id, ...c]) => [id, c]));
const vars = (h, id) => ['--x', '--y', '--w', '--h'].map((k) => Number(doc(h).querySelector(`.nw-win[data-w="${id}"]`).style.getPropertyValue(k)));
// A finger lifted is `pressing` off a tick later (95-clicks.js holds redraws back while one is down); tests are synchronous.
const ptr = (h, type, target, x, y) => {
  const w = h.dom.window, el = typeof target === 'string' ? doc(h).querySelector(target) : target;
  el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  if (/up|cancel/.test(type)) h.ev('pressing=false');
};
// A drag as the browser sends it: down on the element, moves on the window, up.
const drag = (h, target, [x0, y0], [x1, y1]) => { ptr(h, 'pointerdown', target, x0, y0); ptr(h, 'pointermove', doc(h).documentElement, x1, y1); ptr(h, 'pointerup', doc(h).documentElement, x1, y1); };
const title = (id) => `.nw-win[data-w="${id}"] .nw-h`;
const edge = (id, d) => `.nw-win[data-w="${id}"] .nw-rz[data-d="${d}"]`;
const key = (h, el, k, shift = false, extra = {}) => {
  const w = h.dom.window, e = new w.KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true, ...extra });
  (typeof el === 'string' ? doc(h).querySelector(el) : el).dispatchEvent(e);
  return e;
};
const grip = (id) => `.nw-grip[data-w="${id}"]`;
// What the grid promises, for any layout: whole cells inside it, never smaller than a usable window, no two overlapping,
// and nothing that could rise one more row (no gaps).
const inv = (L, what = '') => {
  const a = Object.entries(L);
  assert.equal(a.length, 7, `${what}: seven windows`);
  for (const [id, [x, y, w, h]] of a) {
    for (const v of [x, y, w, h]) assert.ok(Number.isInteger(v), `${what} ${id} whole cells`);
    assert.ok(x >= 0 && y >= 0 && x + w <= 24, `${what} ${id} inside the grid`);
    assert.ok(w >= 7 && h >= 8 && h <= 120, `${what} ${id} usable size`);
  }
  const hit = (p, q) => p[0] < q[0] + q[2] && q[0] < p[0] + p[2] && p[1] < q[1] + q[3] && q[1] < p[1] + p[3];
  for (const [i, [id, c]] of a.entries()) {
    for (const [jd, d] of a.slice(i + 1)) assert.ok(!hit(c, d), `${what} ${id} and ${jd} overlap`);
    if (c[1] > 0) assert.ok(a.some(([jd, d]) => jd !== id && hit([c[0], c[1] - 1, c[2], c[3]], d)), `${what} ${id} could rise: a gap`);
  }
};

test('the seven panels are windows on a grid, laid out as the wallboard always was, and the strip of numbers stays put', (t) => {
  const h = win(t);
  assert.deepEqual(lay(h), DEF);
  inv(lay(h), 'default');
  assert.equal(h.ev("[...document.querySelectorAll('.nw-win')].map(e=>e.dataset.w).join()"), 'map,traffic,alarms,ports,routers,links,money');
  for (const id of Object.keys(DEF)) {
    assert.deepEqual(vars(h, id), DEF[id], `${id}: the cells reach the page`);
    assert.ok(doc(h).querySelector(`.nw-win[data-w="${id}"] .nw-h`), `${id} has a title bar`);
    assert.equal(doc(h).querySelectorAll(`.nw-win[data-w="${id}"] .nw-rz`).length, 8, `${id}: four edges and four corners`);
  }
  assert.equal(doc(h).querySelectorAll('#nocWall > .nw-tile, #nocWall > .nw-tiles > .nw-tile').length, 6, 'the numbers are not windows');
  assert.equal(doc(h).querySelector('#nwDeck .nw-tile'), null);
  assert.equal(h.ev("$('nwDeck').style.getPropertyValue('--rows')"), '47');
  assert.deepEqual(JSON.parse(h.ev('JSON.stringify(nwSettle(nwDef()))')).map((i) => [i.id, i.x, i.y, i.w, i.h]), Object.entries(DEF).map(([id, c]) => [id, ...c]), 'the default is already tidy');
  assert.deepEqual(h.errors, []);
});

test('a window dropped on another sends it below, a nudge changes nothing, and everything falls up', (t) => {
  const h = win(t);
  const move = (id, d, du, dv) => Object.fromEntries(JSON.parse(h.ev(`(()=>{const L=nwClone(nwDef());nwEdit(L.find(i=>i.id==='${id}'),'${d}',${du},${dv});nwSettle(L,'${id}');return JSON.stringify(L.map(i=>[i.id,i.x,i.y,i.w,i.h]))})()`)).map(([i, ...c]) => [i, c]));
  assert.deepEqual(move('traffic', 'm', 0, -12), SWAP, 'its top past the middle of the map: they swap');
  assert.deepEqual(move('traffic', 'm', 0, -5), DEF, 'a few rows up, still under the map: back where it was');
  assert.deepEqual(move('map', 'm', 0, 28), SWAP, 'the map dragged down past the middle of the traffic window: the same swap');
  assert.deepEqual(move('map', 'm', 0, 8), DEF, 'a small pull down: nothing changes');
  const R = move('map', 'm', 40, 40);
  inv(R, 'map dragged far right and down');
  assert.equal(R.map[0], 10, 'a window cannot leave the grid: it stops at the right edge');
  const A = move('alarms', 'm', -14, 0);
  inv(A, 'alarms dropped on the map');
  assert.deepEqual(A.alarms, [0, 0, 10, 12], 'the dropped window keeps its place');
  assert.ok(A.map[1] >= 12, 'and the map is below it');
  // Smaller than the minimum, wider than the grid, taller than the limit: clamped.
  assert.deepEqual(move('traffic', 'se', 500, 500).traffic.slice(2), [24, 120], 'the corner stops at the grid and at 120 rows');
  assert.deepEqual(move('traffic', 'se', -500, -500).traffic.slice(2), [7, 8], 'and at the smallest window');
  assert.deepEqual(move('ports', 'w', 500, 0).ports, [17, 12, 7, 23], 'the left edge cannot pass the minimum width');
  assert.equal(move('routers', 'n', 0, -500).routers[1], 0, 'nor the top edge go above row 0');
  inv(move('routers', 'n', 0, -500), 'routers pulled to the top');
  assert.deepEqual(h.errors, []);
});

test('whatever is done to the windows, they never overlap, leave the grid, shrink too far or leave a gap', (t) => {
  const h = win(t);
  // Seeded edits of every kind (drags, edge pulls, the keyboard's hops), each applied on top of the last, as a session is.
  const bad = h.ev(`(()=>{let r=7,rnd=n=>{r=(r*16807)%2147483647;return r%n;};let L=nwDef();const ids=L.map(i=>i.id),D=['m','n','s','e','w','ne','nw','se','sw'];
    const hit=(p,q)=>p.x<q.x+q.w&&q.x<p.x+p.w&&p.y<q.y+q.h&&q.y<p.y+p.h;
    for(let n=0;n<600;n++){const id=ids[rnd(7)],M=L.map(i=>({...i})),m=M.find(i=>i.id===id);
      if(rnd(5)===0){if(!nwHop(M,id,rnd(2)?1:-1))continue;}else nwEdit(m,D[rnd(9)],rnd(61)-30,rnd(121)-60);
      nwSettle(M,id);L=M;
      for(const i of L){if(!Number.isInteger(i.x+i.y+i.w+i.h)||i.x<0||i.y<0||i.x+i.w>24||i.w<7||i.h<8||i.h>120)return 'bounds '+n+' '+JSON.stringify(i);
        if(L.some(o=>o!==i&&hit(i,o)))return 'overlap '+n+' '+JSON.stringify(L);
        if(i.y>0&&!L.some(o=>o!==i&&hit({...i,y:i.y-1},o)))return 'gap '+n+' '+JSON.stringify(i);}}
    return null;})()`);
  assert.equal(bad, null);
  assert.deepEqual(h.errors, []);
});

test('what is stored is read once, and a layout that is not whole, inside the grid and usable is not trusted', (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  assert.equal(b.log.filter(([, k]) => k === KEY).length, 1, 'read once, when the wallboard is built');
  h.ev('nocRender();nocRender()');
  drag(h, title('traffic'), [100, 600], [100, 350]);
  assert.equal(b.log.filter(([op, k]) => op === 'get' && k === KEY).length, 1, 'and never again: not by re-rendering, not by dragging');
  const junk = ['', 'null', '{', '[]', '"x"', '7', '{"v":2,"w":{}}', '{"v":1}', '{"v":1,"w":null}', '{"v":1,"w":[]}', '{"v":1,"w":{"map":[0,0,3,3]}}', '{"v":1,"w":{"map":[20,0,14,20]}}',
    '{"v":1,"w":{"map":[0,0,14.5,20]}}', '{"v":1,"w":{"map":"abc"}}', '{"v":1,"w":{"map":[-1,0,14,20]}}', '{"v":1,"w":{"map":[0,0,14,"20"]}}', '{"v":1,"w":{"map":[0,0,14]}}',
    '{"v":1,"w":{"map":[0,0,24,9999]}}', '{"v":1,"w":{"map":[0,9999,14,20]}}', '{"v":1,"w":{"__proto__":[0,0,24,20],"constructor":[0,0,24,20],"nope":[0,0,24,20]}}',
    '{"v":1,"w":{"map":[0,0,24,20],"traffic":[0,0,24,20],"alarms":[0,0,24,20]}}'];
  for (const j of junk) {
    h.ev(`localStorage.setItem(${JSON.stringify(KEY)},${JSON.stringify(j)})`);
    const L = Object.fromEntries(JSON.parse(h.ev('JSON.stringify(nwRead().map(i=>[i.id,i.x,i.y,i.w,i.h]))')).map(([id, ...c]) => [id, c]));
    inv(L, `stored ${j}`);
    if (!/traffic|alarms/.test(j)) assert.deepEqual(L, DEF, `${j} is not a layout: the default one`);
  }
  // One good window among bad ones is kept, and the others get their own place.
  h.ev(`localStorage.setItem(${JSON.stringify(KEY)},'{"v":1,"w":{"money":[0,0,24,10],"map":[1,2]}}')`);
  const L = Object.fromEntries(JSON.parse(h.ev('JSON.stringify(nwRead().map(i=>[i.id,i.x,i.y,i.w,i.h]))')).map(([id, ...c]) => [id, c]));
  assert.deepEqual(L.money, [0, 0, 24, 10]);
  inv(L, 'one good window');
  // Written, it reads back as it was.
  h.ev('NOCW.lay=nwRead();nwSave()');
  assert.deepEqual(JSON.parse(h.ev(`JSON.stringify(nwRead().map(i=>[i.id,i.x,i.y,i.w,i.h]))`)), JSON.parse(h.ev('JSON.stringify(NOCW.lay.map(i=>[i.id,i.x,i.y,i.w,i.h]))')));
  assert.deepEqual(h.errors, []);
});

test('dragging a title bar moves the window as you go, saves when you let go, and leaves the game alone', (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  const S0 = h.ev('JSON.stringify(S)'), other = () => JSON.stringify([...b.ls.entries()].filter(([k]) => k !== KEY));
  const ls0 = other();
  ptr(h, 'pointerdown', title('traffic'), 100, 600);
  assert.equal(h.ev("document.body.classList.contains('nw-dragging')"), true);
  assert.ok(doc(h).querySelector('.nw-win.nw-drag[data-w=traffic]'), 'the window held is marked');
  ptr(h, 'pointermove', doc(h).documentElement, 100, 350);   // 250 px up: 12 rows (the middle of the map is passed)
  assert.deepEqual(lay(h), SWAP, 'the windows move as the pointer does');
  assert.deepEqual(vars(h, 'traffic'), SWAP.traffic);
  assert.deepEqual(vars(h, 'map'), SWAP.map, 'the map made room');
  assert.equal(b.ls.get(KEY), undefined, 'nothing is saved while it is held');
  ptr(h, 'pointermove', doc(h).documentElement, 100, 600);   // back where it began: everything back
  assert.deepEqual(lay(h), DEF);
  ptr(h, 'pointermove', doc(h).documentElement, 100, 350);
  ptr(h, 'pointerup', doc(h).documentElement, 100, 350);
  assert.equal(h.ev("document.body.classList.contains('nw-dragging')"), false);
  assert.equal(doc(h).querySelector('.nw-drag'), null);
  assert.deepEqual(JSON.parse(b.ls.get(KEY)), { v: 1, w: Object.fromEntries(Object.entries(SWAP).map(([id, c]) => [id, c])) });
  assert.equal(h.ev('JSON.stringify(S)'), S0, 'the save is not touched');
  assert.equal(other(), ls0, 'and no other stored value');
  // Pointer moves after the drop do nothing.
  ptr(h, 'pointermove', doc(h).documentElement, 100, 100);
  assert.deepEqual(lay(h), SWAP);
  assert.deepEqual(h.errors, []);
});

test('a click on a title bar, a picker, a button or a cancelled drag changes and saves nothing', (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  drag(h, title('traffic'), [100, 600], [100, 600]);
  assert.equal(b.ls.get(KEY), undefined, 'a click that did not move anything saves nothing');
  const sel = doc(h).querySelector('#nwPorts select');
  assert.ok(sel, 'the ports window has its picker in the title bar');
  ptr(h, 'pointerdown', sel, 800, 300);
  assert.equal(h.ev('NWD'), null, 'the picker is the picker, not a handle');
  ptr(h, 'pointerdown', doc(h).querySelector('#nwPorts .nw-port button'), 800, 400);
  assert.equal(h.ev('NWD'), null, 'so is a button');
  ptr(h, 'pointerdown', doc(h).querySelector('#nwPorts .nw-port'), 800, 400);
  assert.equal(h.ev('NWD'), null, 'and the body of a window is not a handle');
  ptr(h, 'pointerdown', title('traffic'), 100, 600);
  ptr(h, 'pointermove', doc(h).documentElement, 100, 350);
  assert.notDeepEqual(lay(h), DEF);
  ptr(h, 'pointercancel', doc(h).documentElement, 100, 350);
  assert.deepEqual(lay(h), DEF, 'a cancelled drag puts everything back');
  assert.equal(b.ls.get(KEY), undefined);
  assert.equal(h.ev("document.body.classList.contains('nw-dragging')"), false);
  assert.deepEqual(h.errors, []);
});

test('a press while an earlier drag never got its pointer up ends that drag and starts the new one', (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  ptr(h, 'pointerdown', title('traffic'), 100, 600);
  ptr(h, 'pointermove', doc(h).documentElement, 100, 350);
  assert.deepEqual(lay(h), SWAP);
  ptr(h, 'pointerdown', title('map'), 100, 300);   // the button was let go outside the page: no pointerup came
  assert.deepEqual(lay(h), DEF, 'the unfinished drag is undone');
  assert.equal(h.ev('NWD.id'), 'map', 'and the new one is under way');
  ptr(h, 'pointerup', doc(h).documentElement, 100, 300);
  assert.equal(h.ev('NWD'), null);
  assert.equal(b.ls.get(KEY), undefined);
  assert.deepEqual(h.errors, []);
});

test('an edge or a corner resizes a window, and the others move out of its way', (t) => {
  const h = win(t);
  drag(h, edge('traffic', 'e'), [730, 700], [730 + 105, 700]);   // two columns wider
  assert.deepEqual(lay(h).traffic, [0, 20, 16, 15]);
  inv(lay(h), 'wider');
  assert.ok(lay(h).ports[1] >= 35, 'the ports window it now runs into moved below it');
  h.ev('nwReset()');
  drag(h, edge('map', 's'), [300, 400], [300, 400 + 60]);   // three rows taller
  assert.deepEqual(lay(h).map, [0, 0, 14, 23]);
  assert.equal(lay(h).traffic[1], 23, 'the window below it moved down');
  inv(lay(h), 'taller');
  h.ev('nwReset()');
  drag(h, edge('ports', 'nw'), [740, 250], [740 + 105, 250 - 20]);   // the top left corner: two columns in, a row up; it already was at the top of its column
  inv(lay(h), 'corner');
  assert.deepEqual(lay(h).ports.slice(0, 1).concat(lay(h).ports.slice(2, 3)), [16, 8], 'two columns narrower from the left');
  h.ev('nwReset()');
  drag(h, edge('money', 'se'), [1250, 900], [1250 + 5000, 900 + 5000]);
  assert.deepEqual(lay(h).money.slice(2), [8, 120], 'it stops at the edge of the grid and at the tallest window');
  h.ev('nwReset()');
  drag(h, edge('money', 'sw'), [850, 900], [850 + 5000, 900 - 5000]);
  assert.equal(lay(h).money[2], 7, 'and the left edge stops at the smallest width');
  inv(lay(h), 'extremes');
  assert.deepEqual(h.errors, []);
});

test('the keyboard: a focusable grip per window, arrows move it, Shift and arrows resize it', (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  const g = doc(h).querySelector(grip('traffic'));
  assert.equal(g.tagName, 'BUTTON', 'a real button: it takes focus and Tab reaches it');
  assert.equal(g.getAttribute('aria-label'), 'Move or resize Traffic by way out');
  assert.match(g.title, /arrow keys/);
  assert.equal(doc(h).querySelectorAll('.nw-grip').length, 7);
  let e = key(h, g, 'ArrowUp');
  assert.equal(e.defaultPrevented, true, 'the page does not scroll under it');
  assert.deepEqual(lay(h), SWAP, 'up steps over the window above');
  assert.deepEqual(JSON.parse(b.ls.get(KEY)).w.traffic, [0, 0, 14, 15], 'and is saved');
  key(h, g, 'ArrowDown');
  assert.deepEqual(lay(h), DEF, 'down steps back below it');
  const before = b.ls.get(KEY);
  key(h, doc(h).querySelector(grip('alarms')), 'ArrowLeft');
  assert.deepEqual(lay(h), DEF, 'sideways never shoves a neighbour: the map is in the way');
  key(h, doc(h).querySelector(grip('ports')), 'ArrowRight', true);
  assert.deepEqual(lay(h).ports, DEF.ports, 'and nothing wider than the grid');
  key(h, doc(h).querySelector(grip('ports')), 'ArrowLeft', true);
  assert.deepEqual(lay(h).ports, [14, 12, 9, 23], 'Shift and Left: one column narrower');
  key(h, doc(h).querySelector(grip('ports')), 'ArrowUp', true);
  assert.deepEqual(lay(h).ports, [14, 12, 9, 22], 'Shift and Up: one row shorter');
  key(h, g, 'ArrowDown', true);
  assert.deepEqual(lay(h).traffic, [0, 20, 14, 16], 'Shift and Down: one row taller');
  assert.deepEqual(lay(h).routers.slice(0, 2), [0, 36], 'and what is below it moves down');
  inv(lay(h), 'keys');
  assert.notEqual(b.ls.get(KEY), before);
  // Not a window key: left alone.
  for (const [k, s, x] of [['a', false, {}], ['ArrowUp', false, { altKey: true }], ['ArrowLeft', false, { metaKey: true }], ['ArrowUp', true, { ctrlKey: true }]]) assert.equal(key(h, g, k, s, x).defaultPrevented, false, `${k} ${JSON.stringify(x)} is the browser's`);
  assert.equal(key(h, doc(h).querySelector('#nwPorts select'), 'ArrowDown').defaultPrevented, false, 'the picker keeps its arrows');
  // Shrinking all the way stops at the smallest window.
  for (let i = 0; i < 40; i++) { key(h, g, 'ArrowLeft', true); key(h, g, 'ArrowUp', true); }
  assert.deepEqual(lay(h).traffic.slice(2), [7, 8]);
  inv(lay(h), 'smallest');
  assert.deepEqual(h.errors, []);
});

test('a window keeps its place through a re-render, a tab switch and a reload', async (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  drag(h, title('traffic'), [100, 600], [100, 350]);
  h.ev("window.__t=document.querySelector('.nw-win[data-w=traffic]')");
  h.ev('S.cash+=5;S.day+=1;nocRender()');
  assert.deepEqual(lay(h), SWAP, 'new data');
  assert.deepEqual(vars(h, 'traffic'), SWAP.traffic);
  h.ev("nocView('details')");
  assert.equal(h.ev("$('nocWall').hidden"), true);
  h.ev("nocView('wall')");
  assert.deepEqual(lay(h), SWAP, 'Details and back');
  assert.deepEqual(vars(h, 'map'), SWAP.map);
  assert.equal(h.ev("document.querySelector('.nw-win[data-w=traffic]')===window.__t"), true, 'the same window, patched, not built again');
  h.dom.window.close();
  const g = win(t, { browser: b });
  assert.deepEqual(lay(g), SWAP, 'a reload');
  assert.deepEqual(vars(g, 'traffic'), SWAP.traffic);
  assert.deepEqual(vars(g, 'map'), SWAP.map);
  assert.equal(g.ev("$('nwDeck').style.getPropertyValue('--rows')"), '47', 'the deck is as tall as the lowest window');
  assert.deepEqual([...g.dom.window.document.querySelectorAll('.nw-win')].map((e) => e.dataset.w), Object.keys(DEF), 'the stacked order does not follow the layout');
  assert.deepEqual(g.errors, []);
});

test('a game sending its state keeps re-drawing the wallboard where you put the windows', async (t) => {
  const b = browser();
  const G = load({ browser: b });
  t.after(() => G.dom.window.close());
  G.ev(START);
  const id = G.ev('UI.slot');
  b.ls.set(KEY, JSON.stringify({ v: 1, w: { map: [0, 15, 14, 20], traffic: [0, 0, 14, 15] } }));
  const W = load({ browser: b, url: 'https://tests.invalid/?noc=' + id });
  t.after(() => W.dom.window.close());
  assert.ok(await until(() => W.ev('UI.started===true&&NOCW.built')), 'the window got its first copy');
  assert.deepEqual(lay(W), SWAP);
  G.ev('S.cash+=1234;NOC.dirty=true;NOC.sent=-1e9;nocPump(performance.now())');
  assert.ok(await until(() => W.ev('S.cash===' + G.ev('S.cash'))), 'a newer copy arrived');
  W.ev('nocRender()');
  assert.deepEqual(lay(W), SWAP);
  assert.deepEqual(vars(W, 'traffic'), SWAP.traffic);
  assert.ok(W.ev("$('nwAlarms').textContent.length")>0, 'and the windows are drawn');
  assert.equal(JSON.stringify(Object.keys(JSON.parse(G.ev('JSON.stringify(S)'))).filter((k) => /noc|lay|win/i.test(k))), '[]', 'nothing of this is in the save');
  assert.deepEqual(W.errors, []); assert.deepEqual(G.errors, []);
});

test('Reset layout is in the bar over the wallboard, puts every window back and forgets the layout', (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  const btn = () => doc(h).querySelector('#nocBar [data-nc=layout]');
  assert.ok(btn(), 'a button in the bar, which no window can cover');
  assert.equal(btn().textContent, 'Reset layout');
  assert.equal(h.ev("getComputedStyle(document.querySelector('#nocBar')).position"), 'sticky');
  drag(h, title('traffic'), [100, 600], [100, 350]);
  assert.deepEqual(lay(h), SWAP);
  assert.ok(b.ls.get(KEY));
  btn().click();
  assert.deepEqual(lay(h), DEF);
  assert.deepEqual(vars(h, 'traffic'), DEF.traffic);
  assert.equal(b.ls.get(KEY), undefined, 'the stored layout is gone, not rewritten');
  key(h, grip('map'), 'ArrowDown');
  h.ev("nocView('details')");
  assert.equal(btn(), null, 'only the wallboard has windows');
  h.ev("nocView('wall')");
  assert.ok(btn());
  assert.deepEqual(h.errors, []);
});

test('on a phone and in landscape the windows stack as they always did: nothing to drag, nothing to reset', (t) => {
  const b = browser();
  const h = win(t, { browser: b });
  b.ls.set(KEY, JSON.stringify({ v: 1, w: { map: [0, 15, 14, 20], traffic: [0, 0, 14, 15] } }));
  for (const width of [360, 740, 1000]) {
    h.ev(`window.innerWidth=${width}`);
    assert.equal(h.ev('nwFree()'), false, `${width}px`);
    const L0 = h.ev('JSON.stringify(NOCW.lay)');
    ptr(h, 'pointerdown', title('traffic'), 100, 600);
    assert.equal(h.ev('NWD'), null, `${width}px: a title bar is just a title`);
    assert.equal(key(h, grip('traffic'), 'ArrowUp').defaultPrevented, false, `${width}px: keys are the browser's`);
    assert.equal(h.ev('JSON.stringify(NOCW.lay)'), L0);
  }
  h.ev('window.innerWidth=1001');
  assert.equal(h.ev('nwFree()'), true, 'the breakpoint of the stylesheet');
  h.ev('window.innerWidth=360');
  assert.equal(b.ls.get(KEY).includes('"map":[0,15,14,20]'), true, 'a layout made on a big screen waits for the next one');
  // The stylesheet: handles and the button show only where the windows are free, and the number is the script's.
  const free = CSS.slice(CSS.indexOf('@media (min-width:1001px){'));
  assert.ok(free.includes('.nw-win{position:absolute'));
  assert.ok(free.includes('.nw-grip{display:block'));
  assert.ok(CSS.slice(0, CSS.indexOf('@media (min-width:1001px){')).includes('.nw-grip,.nw-rz{display:none}'), 'hidden unless the media query below turns them on');
  assert.match(CSS, /@media \(max-width:1000px\)\{[^@]*\.nb-lay\{display:none\}/, 'no reset button where there is no layout');
  assert.equal(h.ev('NW_FREE'), 1000);
  assert.ok(!/\.nw-win\{[^}]*position:absolute/.test(CSS.slice(0, CSS.indexOf('@media (min-width:1001px){'))), 'stacked windows are not placed');
  assert.deepEqual(h.errors, []);
});

test('a chart is drawn at the size of its window, and as before where the windows stack', (t) => {
  const h = win(t);
  const size = (id, w, hh, head) => h.ev(`(()=>{const e=$('${id}');Object.defineProperty(e,'clientWidth',{configurable:true,value:${w}});Object.defineProperty(e,'clientHeight',{configurable:true,value:${hh}});const n=e.querySelector('.nw-h');Object.defineProperty(n,'offsetHeight',{configurable:true,value:${head}});nocRender();return e.querySelector('svg').dataset.box.split(',').slice(0,2).join('x')})()`);
  assert.equal(h.ev("document.querySelector('#nwTraffic svg').dataset.box.split(',').slice(0,2).join('x')"), '900x260', 'no size to go by yet (no layout in jsdom): the old size');
  assert.equal(size('nwTraffic', 700, 300, 40), '676x234', 'the panel less its padding and title bar');
  assert.equal(size('nwMoney', 400, 230, 30), '376x174');
  assert.equal(size('nwTraffic', 100, 90, 40), '240x110', 'but never smaller than a chart can be read');
  h.ev('window.innerWidth=360');
  assert.equal(size('nwTraffic', 700, 300, 40), '900x260', 'stacked: the old size, scaled by the page');
  assert.equal(size('nwMoney', 400, 230, 30), '520x220');
  assert.deepEqual(h.errors, []);
});

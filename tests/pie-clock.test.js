// Pie Control is a management panel, like the NOC dashboard: the clock keeps running while it is open, and its
// numbers follow the days without rebuilding the sheet (scroll, focus and the globe stay put). Other windows still stop it (#376).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load: load0 } = require('./harness');

// The globe in the panel keeps a frame loop going: every page is closed after its test.
const open = [];
test.afterEach(() => { for (const p of open.splice(0)) { try { p.ev('closeModal()'); } catch (e) {} p.dom.window.close(); } });
const load = () => { const p = load0(); open.push(p); return p; };

const company = (ev) => ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});ACT.buildPop({city:'sin'});ACT.pieFound();ACT.pieFactory();compute()");
// Real time at 1× speed, a frame at a time, as the browser would run it (long frames: drawing is slow in jsdom).
const play = (ev, ms) => ev(`(()=>{setSpeed(1);const n=Math.ceil(${ms}/200);for(let i=0;i<n;i++){window.__now=(window.__now||1000)+200;frame(__now);}return S.day;})()`);

test('#376 days keep passing with Pie Control open', () => {
  const { ev, errors } = load();
  company(ev);
  assert.equal(ev('pieOn()&&!!S.pie.co'), true);
  ev('ACT.pieOpen()');
  assert.equal(ev("!$('modal').hidden&&$('modal').className"), 'pie');
  const d0 = ev('S.day');
  play(ev, 3 * ev('DAY_MS') + 200);
  assert.ok(ev('S.day') >= d0 + 2, `the clock ran under Pie Control (day ${d0} → ${ev('S.day')})`);
  assert.equal(ev("$('modal').className"), 'pie', 'and the panel stays open');
  assert.deepEqual(errors, []);
});

test('#376 the open panel follows the days in place', () => {
  const { ev, errors } = load();
  company(ev);
  ev("UI.pieTab='co';ACT.pieOpen()");
  ev("window.__keep=$('modalCard').querySelector('.pie-tabs');window.__nm=$('pieNm');__nm.value='Typing…'");
  const html = () => ev("$('modalCard').innerHTML");
  const before = html();
  play(ev, 6 * ev('DAY_MS') + 200);
  assert.equal(ev("$('modalCard').querySelector('.pie-tabs')===__keep"), true, 'same nodes: the sheet is patched, not rebuilt');
  assert.equal(ev("$('pieNm')===__nm&&__nm.value"), 'Typing…', 'a name being typed is not wiped');
  assert.notEqual(html(), before, 'the panel moved with the days');
  assert.deepEqual(errors, []);
});

test('#376 the globe keeps its canvas and its size through the days', () => {
  const { ev, errors } = load();
  company(ev);
  ev("UI.pieTab='home';ACT.pieOpen();window.__cv=$('modalCard').querySelector('.pgcv');__cv.width=321");
  assert.equal(ev('PG.cv===__cv'), true);
  play(ev, 3 * ev('DAY_MS') + 200);
  assert.ok(ev('S.day') >= 2);
  assert.equal(ev("$('modalCard').querySelector('.pgcv')===__cv&&PG.cv===__cv&&__cv.width"), 321, 'the same canvas, still drawn at its size');
  assert.equal(ev('__cv.style.touchAction'), 'none');
  assert.deepEqual(errors, []);
});

test('#376 other windows still stop the clock', () => {
  const { ev, errors } = load();
  company(ev);
  ev("openModal('<p>x</p>','keys')");
  const d0 = ev('S.day');
  play(ev, 3 * ev('DAY_MS') + 200);
  assert.equal(ev('S.day'), d0);
  ev("closeModal();ACT.pieOpen();S.lost=true");
  play(ev, 3 * ev('DAY_MS') + 200);
  assert.equal(ev('S.day'), d0, 'a lost game stays stopped');
  assert.deepEqual(errors, []);
});

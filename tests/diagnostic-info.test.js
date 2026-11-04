// Settings › Diagnostic info (src/game/96-map/97-diagnostics.js): one readout for bug reports, which replaced the
// separate viewport readout and frame meter. It shows the screen, what draws the map (and why it is 2D), and how fast;
// the setting, ?vp/?fps and five taps on the date open it, and it is remembered on the device.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

function open(opts = {}) {
  const h = load({ seed: 777, ...opts });
  h.ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();console.warn=()=>{};`);
  // The readout refreshes on an interval: closing the window stops it, so the test process can end.
  h.done = () => h.dom.window.close();
  return h;
}
const text = (ev) => ev('(()=>{const e=document.getElementById("diag");return e?e.textContent:null;})()');

test('the setting shows one readout with the screen, the map and its speed, and remembers it', () => {
  const h = open();
  const { ev, errors } = h;
  try {
    assert.equal(text(ev), null, 'off by default');
    ev('ACT.settings()');
    assert.match(ev('$("modal").innerHTML'), new RegExp(ev('tr("settings.diagnostic_info")')));
    ev('ACT.vpSet({v:"on"})');
    const t = text(ev);
    for (const part of ['Series of Tubes', 'inner ', 'screen ', 'safe top', 'tabbar', 'map: ', 'fps', 'draw ']) assert.ok(t.includes(part), `shows "${part}"`);
    assert.equal(ev('document.querySelectorAll("#diag").length'), 1, 'one readout');
    assert.equal(ev('localStorage.getItem("sot-vp")'), '1');
    ev('ACT.vpSet({v:"off"})');
    assert.equal(text(ev), null);
    assert.equal(ev('localStorage.getItem("sot-vp")'), null);
    assert.deepEqual(errors, []);
  } finally { h.done(); }
});

test('it says what draws the map, and why it is the 2D canvas', () => {
  const h = open();
  const { ev, errors } = h;
  try {
    ev('diagOn(true)');
    const map = () => ev('diagMap()');
    ev('mapGl(false,false)');
    assert.equal(map(), 'map: 2D (Always 2D)');
    ev('mapGl(true,false);glKill(new Error("the graphics card is out of memory (the pictures)"))');
    assert.equal(map(), 'map: 2D (the graphics card is out of memory (the pictures))');
    ev('GLX.dead=false;GLX.lost=true');
    assert.equal(map(), 'map: 2D (graphics context lost, waiting for it back)');
    ev('GLX.lost=false;GLX.gl={};GLX.shown=true;GLX.gpu="ANGLE (NVIDIA GeForce GTX 980)"');
    assert.equal(map(), 'map: WebGL2 · ANGLE (NVIDIA GeForce GTX 980)');
    ev('const s=S;S=null;window.__S=s');
    assert.equal(map(), 'map: none (title screen)');
    ev('S=__S;GLX.gl=null;GLX.shown=false');
    assert.deepEqual(errors, []);
  } finally { h.done(); }
});

test('it measures frames per second, the slowest frames and draw()', () => {
  const h = open();
  const { ev, errors } = h;
  try {
    ev('diagOn(true)');
    // 60 frames, so 59 intervals: 58 of 16 ms and a last one of 50 ms (978 ms in all); the map drawn on every other
    // one (a still map is not drawn again), in 2 ms: 30 in 978 ms, 31 a second.
    ev('let t=1000;for(let i=0;i<60;i++){t+=i===59?50:16;if(i%2)DIAG.dms=2;diagFrame(t);}diagShow();');
    const t = text(ev);
    assert.match(t, /\b60 fps · map drawn 31\/s · p95 16 ms · max 50 ms/);
    assert.match(t, /draw 2\.0 ms · x0 · zoom /);
    assert.deepEqual(errors, []);
  } finally { h.done(); }
});

test('?fps and ?vp open it, ?nofps closes it, and it stays open on this device', () => {
  for (const [url, storage, want] of [['?fps', {}, true], ['?vp', {}, true], ['?nofps', { 'sot-vp': '1' }, false], ['', { 'sot-vp': '1' }, true], ['', {}, false]]) {
    const h = load({ seed: 777, url: 'https://tests.invalid/' + url, storage });
    try {
      assert.equal(h.ev('!!document.getElementById("diag")'), want, `${url || 'no flag'} ${JSON.stringify(storage)}`);
      assert.equal(h.ev('localStorage.getItem("sot-vp")'), want ? '1' : null, 'remembered as one setting');
    } finally { h.dom.window.close(); }
  }
});

test('five quick taps on the date toggle it (an installed app has no address bar)', () => {
  const h = open();
  const { ev, errors } = h;
  try {
    const tap = () => ev('document.getElementById("hDate").click()');
    for (let i = 0; i < 5; i++) tap();
    assert.equal(ev('DIAG.on'), true);
    for (let i = 0; i < 5; i++) tap();
    assert.equal(ev('DIAG.on'), false);
    assert.deepEqual(errors, []);
  } finally { h.done(); }
});

test('on a 360 px phone the readout wraps inside the screen instead of running off it', () => {
  const h = open();
  const { ev } = h;
  try {
    ev('diagOn(true)');
    const st = ev('document.getElementById("diag").style.cssText');
    assert.match(st, /max-width: calc\(100vw - 32px\)/);
    assert.match(st, /white-space: pre-wrap/);
    assert.match(st, /pointer-events: none/, 'it never takes a tap meant for the map');
  } finally { h.done(); }
});

// The 2D map's land picture (src/game/96-map/70-world-layer.js) is a software canvas (willReadFrequently) only in
// Firefox on Android, which garbled big paths on its graphics card (#43). Firefox on a computer had it too, and sent
// the whole picture to the card again on every frame: measured in Firefox on Windows, full screen 2560x1440, zoomed in
// the 2D map ran at a third of its speed (zoom 3.2 on the big network: 26 fps, 78 without it).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

test('only Firefox on Android gets the land as a software canvas', () => {
  const { ev } = load({ seed: 777 });
  const soft = (ua) => ev(`softCanvas(${JSON.stringify(ua)})`);
  // Firefox on Android, phone and tablet.
  assert.equal(soft('Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0'), true);
  assert.equal(soft('Mozilla/5.0 (Android 13; Tablet; rv:128.0) Gecko/128.0 Firefox/128.0'), true);
  // Firefox on a computer, and the other browsers.
  assert.equal(soft('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0'), false);
  assert.equal(soft('Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0'), false);
  assert.equal(soft('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0'), false);
  assert.equal(soft('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), false);
  assert.equal(soft('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15'), false);
});

test('elsewhere the land picture is an ordinary canvas, which the browser may keep on the graphics card', () => {
  const { ev, errors } = load({ seed: 777 });
  ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();mapGl(false,false);
    window.__opts=[];const gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,o){__opts.push(o||null);return gc.call(this,t,o);};
    WL.cv=null;WL.key=null;cam.z=1.6;worldLayer(cam.z);`);
  assert.equal(ev('SOFT_CANVAS'), false);
  assert.ok(ev('!!WL.cv'), 'the land was painted');
  assert.equal(ev('__opts.some(o=>o&&o.willReadFrequently)'), false);
  assert.deepEqual(errors, []);
});

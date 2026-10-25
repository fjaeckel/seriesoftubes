// Runs the real game (site/index.html) in jsdom with a fake canvas, without the animation loop.
// Tests drive it directly; the multiplayer server keeps one per network and ticks it itself, so the
// simulation is the same code players run in their browsers, just on the server.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SITE = path.join(__dirname, '..', 'site', 'index.html');
const htmlCache = new Map();

function load(opts = {}) {
  const file = opts.file || SITE;
  let html = htmlCache.get(file);
  if (!html) { html = fs.readFileSync(file, 'utf8'); htmlCache.set(file, html); }
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    // jsdom has no canvas; drawing calls are expected to be unimplemented.
    if (!/getContext|Not implemented/.test(e.message)) errors.push(e.message);
  });
  const dom = new JSDOM(html, {
    url: opts.url || 'https://tests.invalid/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.__TUBES_TEST__ = true;
      if (opts.server) window.__TUBES_SERVER__ = true;
      if (opts.noPacing) window.__NO_PACING__ = true; // tests build POPs on day 0; the pacing tests turn this off
      // Seed before the game script runs, so nothing random happens at load time either.
      if (opts.seed !== false) { let r = opts.seed || 12345; window.Math.random = () => { r = (r * 16807) % 2147483647; return r / 2147483647; }; window.__reseed = (n) => { r = n; }; }
      for (const [k, v] of Object.entries(opts.storage || {})) window.localStorage.setItem(k, v);
      if (opts.navigatorLanguage) Object.defineProperty(window.navigator, 'language', { value: opts.navigatorLanguage });
      // A non-English game: jsdom does not fetch the dictionary script, so register it up front.
      if (opts.lang) { window.localStorage.setItem('sot-lang', opts.lang); window.eval(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'site', 'i18n', opts.lang + '.js'), 'utf8')); }
      window.Path2D = class { moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} arc() {} rect() {} closePath() {} };
      // A recording 2D context, so draw code really runs under test (jsdom has no canvas).
      const fake = () => { const calls = { n: 0 };
        const grad = { addColorStop() {} };
        return new Proxy({ calls }, { get(t, k) {
          if (k in t) return t[k];
          if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
          if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
          if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
          if (k === 'canvas') return null;
          return (...a) => { calls.n++; };
        }, set(t, k, v) { t[k] = v; return true; } }); };
      window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = fake()); };
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
      window.HTMLCanvasElement.prototype.toBlob = (cb) => cb(null);
    },
  });
  const ev = (src) => dom.window.eval(src);
  return { dom, ev, errors };
}

module.exports = { load, SITE };

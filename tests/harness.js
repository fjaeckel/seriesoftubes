// Loads the game page in jsdom with the animation loop disabled, so tests can drive the simulation
// directly through the game's globals (ACT, S, R, dayTick…). The page is assembled from src/ once per
// test process (scripts/lib/page.js), so tests always run what is in src/, never a stale build.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { assemble } = require('../scripts/lib/page');

let PAGE = null;
const page = () => PAGE || (PAGE = assemble().html);

// opts.file: a built or older page to load instead (the perf bench, the release build test).
function load(opts = {}) {
  const html = opts.file ? fs.readFileSync(opts.file, 'utf8') : page();
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    // jsdom has no canvas; drawing calls are expected to be unimplemented.
    if (!/getContext|Not implemented/.test(e.message)) errors.push(e.message);
  });
  const dom = new JSDOM(html, {
    url: 'https://tests.invalid/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.__TUBES_TEST__ = true;
      // Seed before the game script runs, so nothing random happens at load time either.
      if (opts.seed !== false) { let r = opts.seed || 12345; window.Math.random = () => { r = (r * 16807) % 2147483647; return r / 2147483647; }; window.__reseed = (n) => { r = n; }; }
      // opts.browser (from browser()): windows of one browser share localStorage, its storage events, a broadcast
      // channel and Web Locks, like real tabs; opts.tab is one tab's sessionStorage, which survives a reload.
      if (opts.browser) opts.browser.attach(window, opts.tab || new Map(), opts);
      for (const [k, v] of Object.entries(opts.storage || {})) window.localStorage.setItem(k, v);
      if (opts.navigatorLanguage) Object.defineProperty(window.navigator, 'language', { value: opts.navigatorLanguage });
      // A non-English game: jsdom does not fetch the dictionary script, so register it up front.
      // (opts.dir: the folder the dictionary comes from, e.g. a build's _site/i18n.)
      if (opts.lang) { window.localStorage.setItem('sot-lang', opts.lang); window.eval(fs.readFileSync(path.join(opts.dir || path.join(__dirname, '..', 'site', 'i18n'), opts.lang + '.js'), 'utf8')); }
      // jsdom has no CompressionStream; {gzip:true} lends the page Node's, the same API browsers have (#176).
      if (opts.gzip) for (const k of ['CompressionStream', 'DecompressionStream', 'TextEncoder', 'TextDecoder']) window[k] = globalThis[k];
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
  // Deterministic by default so a test never passes or fails by luck; pass {seed:false} to opt out.
  // (Seeded in beforeParse, so the game's own seeded-games wrapper around Math.random stays in place.)
  return { dom, ev, errors };
}

// Deterministic Math.random so failures are reproducible.
function seed(ev, n) {
  ev(`if(window.__reseed)__reseed(${n});else Math.random=(()=>{let s=${n};return()=>{s=(s*16807)%2147483647;return s/2147483647;};})();`);
}

// A fake browser for several windows at once (see opts.browser). Storage events, broadcast messages and lock
// hand-overs arrive asynchronously, as in browsers: await settle() or flush() before checking them.
function browser({ locks = true, channel = true } = {}) {
  const ls = new Map(), wins = new Set(), held = new Map(), log = [];
  const later = (f) => setTimeout(f, 0);
  const store = (map, win, shared) => {
    const fire = (key, oldValue, newValue) => { if (shared) for (const w of wins) if (w !== win && !w.closed) later(() => { try { w.dispatchEvent(new w.StorageEvent('storage', { key, oldValue, newValue })); } catch (e) {} }); };
    return {
      getItem: (k) => { if (shared) log.push(['get', String(k)]); return map.has(String(k)) ? map.get(String(k)) : null; },
      setItem: (k, v) => { if (win.closed) return; k = String(k); v = String(v); if (shared && b.quota && k.startsWith('sot-save-v1:') && v.length > b.quota) { const e = new win.Error('full'); e.name = 'QuotaExceededError'; throw e; } const o = map.has(k) ? map.get(k) : null; map.set(k, v); if (shared) { log.push(['set', k]); fire(k, o, v); } },
      removeItem: (k) => { k = String(k); if (!map.has(k)) return; const o = map.get(k); map.delete(k); if (shared) fire(k, o, null); },
      key: (i) => [...map.keys()][i] ?? null,
      get length() { return map.size; },
      clear: () => map.clear(),
    };
  };
  const b = { ls, wins, log, quota: 0,
    attach(win, tab, opts) {
      wins.add(win);
      Object.defineProperty(win, 'localStorage', { configurable: true, get: () => store(ls, win, true) });
      Object.defineProperty(win, 'sessionStorage', { configurable: true, get: () => store(tab, win, false) });
      if (channel) win.BroadcastChannel = class { constructor(name) { this.name = name; (b.chans = b.chans || []).push({ c: this, win }); }
        postMessage(data) { const msg = JSON.parse(JSON.stringify(data)); for (const o of b.chans) if (o.c !== this && o.c.name === this.name && !o.win.closed && o.c.onmessage) later(() => o.c.onmessage({ data: msg })); }
        close() {} };
      if (locks) Object.defineProperty(win.navigator, 'locks', { configurable: true, value: {
        request(name, o, cb) {
          const cur = held.get(name);
          if (cur && !cur.win.closed && !o.steal) { if (o.ifAvailable) return win.Promise.resolve().then(() => cb(null)); return win.Promise.reject(new win.Error('busy')); }
          if (cur) { held.delete(name); cur.reject(new win.DOMException('stolen', 'AbortError')); }
          return new win.Promise((res, rej) => { const me = { win, reject: rej }; held.set(name, me);
            win.Promise.resolve().then(() => cb({ name })).then((v) => { if (held.get(name) === me) held.delete(name); res(v); }, rej); });
        } } });
    },
    // A tab closing: its locks go with it.
    close(win) { win.closed = true; for (const [k, v] of held) if (v.win === win) held.delete(k); wins.delete(win); },
  };
  return b;
}
const flush = (n = 3) => new Promise((r) => { const go = (i) => (i ? setTimeout(() => go(i - 1), 2) : r()); go(n); });

module.exports = { load, seed, browser, flush };

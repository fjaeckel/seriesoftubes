// The perf-bench workloads in real Chromium, for what jsdom cannot show: real DOM speed (jsdom is about 30×
// slower at it), layout (jsdom has none, so it cannot see a forced reflow) and canvas drawing. Two profiles: a
// desktop at full speed, and a phone (390×844, 3× pixel density, CPU slowed 4× like a mid-range Android).
// Used by scripts/perf-bench.js --browser. Needs Chromium: a local `playwright` with its browser, or
// `playwright-core` (a dev dependency) plus a Chrome binary in PERF_CHROME or --chrome (CI uses the runner's Chrome).
const { pathToFileURL } = require('node:url');

const PROFILES = [
  { key: 'desktop', label: 'Desktop', rate: 1, ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { key: 'phone', label: 'Phone (4× slower CPU)', rate: 4, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];

function chromium(exe) {
  // With a Chrome binary given, playwright-core is enough; without one, a full playwright brings its own browser.
  for (const m of exe ? ['playwright-core', 'playwright'] : ['playwright', 'playwright-core']) {
    try { return require(m).chromium; } catch (e) { /* try the next one */ }
  }
  throw new Error('--browser needs playwright-core (npm ci) and a Chrome binary in PERF_CHROME, or a local playwright');
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

async function openPage(browser, profile, file, save, errors) {
  const ctx = await browser.newContext(profile.ctx);
  const page = await ctx.newPage();
  // Nothing from the network (fonts, stats): both versions see exactly the same page, and no request adds noise.
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  // Same as the tests: no animation loop or update checks running between measurements, and seeded randomness.
  await page.addInitScript(() => { window.__TUBES_TEST__ = true; let r = 777; Math.random = () => { r = (r * 16807) % 2147483647; return r / 2147483647; }; });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate((s) => { S = migrate(JSON.parse(s)); UI.started = true; UI.pitched = true; UI.speed = 0; closeModal(); compute(); renderAll(); }, save);
  const cdp = await ctx.newCDPSession(page);
  if (profile.rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.rate });
  await cdp.send('HeapProfiler.enable');
  // One run of a workload, timed inside the page so the round trip to Node does not count. Garbage is collected
  // first, so a run never pays for the one before it (its own garbage still costs it, as in the game).
  // The browser leaves layout and canvas drawing for the next frame, so code that changes the DOM or draws the map
  // would look free: each run ends by forcing both (reading a size, and one pixel back from the surface the map was
  // last drawn on: the WebGL canvas when the card drew it, which waits for the card to finish, else the 2D canvas).
  // A run also says which map drew (gl, 2d, or none when it drew nothing).
  const time = async (k, body) => { await cdp.send('HeapProfiler.collectGarbage'); return page.evaluate(([k, body]) => {
    const F = window.__fx || (window.__fx = {}); const f = F[k] || (F[k] = new Function(body)); const map = document.getElementById('map').getContext('2d');
    const G = typeof GLX === 'object' ? GLX : null, px = window.__px || (window.__px = new Uint8Array(4));
    const t = performance.now(); f(); void document.documentElement.offsetHeight;
    const gl = G && G.shown && G.gl; if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); else map.getImageData(0, 0, 1, 1);
    return { ms: performance.now() - t, map: G && G.shown ? 'gl' : '2d' }; }, [k, body]); };
  // One game day as it is played: its steps on the page, its routing in the route worker (built from the page itself,
  // see 28-route-worker.js). Only the time it holds the page counts: starting the day, each answer from the worker and
  // each step that waited for a frame. Waiting for the worker does not count; the page is free meanwhile.
  // null when this page has no worker to play with.
  const play = async () => { await cdp.send('HeapProfiler.collectGarbage'); return page.evaluate(async () => {
    window.__TUBES_TEST__ = false;
    try {
      const w = typeof rwOn === 'function' && rwOn() && rwStart(); if (!w) return null;
      let busy = 0; const wrap = (f) => function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { busy += performance.now() - t; } };
      const om = w.onmessage, later = RW.later; w.onmessage = wrap(om); if (later) RW.later = (f) => later(wrap(f));
      S.nextFail = S.nextEvent = S.day + 99;
      try { const t = performance.now(); rwDay(); busy += performance.now() - t; while (RW.job) await new Promise((r) => setTimeout(r, 1)); }
      finally { w.onmessage = om; if (later) RW.later = later; }
      return RW.dead ? null : busy;
    } finally { window.__TUBES_TEST__ = true; }
  }); };
  return { ctx, time, play };
}

// Returns {version, profiles: {desktop: {compute: {head, base}, ...}, phone: {...}}, errors}.
async function runBrowser({ head, base, save, metrics, runs, exe }) {
  // One browser per version: pages of one browser can share a renderer process and its heap, and then one
  // version's garbage is collected while the other one is being timed.
  const launch = () => chromium(exe).launch(exe ? { executablePath: exe } : {});
  const hb = await launch(), bb = base ? await launch() : null;
  const errors = [], out = { version: hb.version(), profiles: {}, errors };
  try {
    for (const p of PROFILES) {
      const h = await openPage(hb, p, head, save, errors), b = base ? await openPage(bb, p, base, save, errors) : null;
      const res = out.profiles[p.key] = {};
      // Which map each version drew with, over all the runs that drew one (a version falling back mid-run shows both).
      const maps = res.maps = { head: new Set(), base: new Set() };
      for (const [k, , body, o] of metrics) {
        const H = [], B = [], run = (v) => (o && o.play ? v.play() : v.time(k, body));
        const go = async (v, into, m) => { const r = await run(v); if (o && o.play) into.push(r); else { into.push(r.ms); if (k === 'map') m.add(r.map); } };
        for (const v of [h, b].filter(Boolean)) { await run(v); await run(v); }   // warm up (and the worker starts)
        for (let i = 0; i < runs; i++) {
          // Alternate who goes first, like the jsdom runs.
          if (b && i % 2) { await go(b, B, maps.base); await go(h, H, maps.head); } else { await go(h, H, maps.head); if (b) await go(b, B, maps.base); }
        }
        // A version without a worker gives nothing to compare.
        const ok = (a) => a.every((x) => x != null);
        res[k] = { head: ok(H) ? median(H) : null, base: b && ok(B) ? median(B) : null, samples: { head: ok(H) ? H.map((x) => +x.toFixed(1)) : null, base: b && ok(B) ? B.map((x) => +x.toFixed(1)) : null } };
      }
      res.maps = { head: [...maps.head], base: b ? [...maps.base] : null };
      await h.ctx.close(); if (b) await b.ctx.close();
    }
  } finally { await hb.close(); if (bb) await bb.close(); }
  return out;
}

module.exports = { runBrowser, PROFILES };

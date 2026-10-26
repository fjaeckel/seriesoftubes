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
  // would look free: each run ends by forcing both (reading a size, and one pixel back from the map canvas).
  const time = async (k, body) => { await cdp.send('HeapProfiler.collectGarbage'); return page.evaluate(([k, body]) => {
    const F = window.__fx || (window.__fx = {}); const f = F[k] || (F[k] = new Function(body)); const map = document.getElementById('map').getContext('2d');
    const t = performance.now(); f(); void document.documentElement.offsetHeight; map.getImageData(0, 0, 1, 1); return performance.now() - t; }, [k, body]); };
  return { ctx, time };
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
      for (const [k, , body] of metrics) {
        const H = [], B = [];
        for (const v of [h, b].filter(Boolean)) { await v.time(k, body); await v.time(k, body); }   // warm up
        for (let i = 0; i < runs; i++) {
          // Alternate who goes first, like the jsdom runs.
          if (b && i % 2) { B.push(await b.time(k, body)); H.push(await h.time(k, body)); } else { H.push(await h.time(k, body)); if (b) B.push(await b.time(k, body)); }
        }
        res[k] = { head: median(H), base: b ? median(B) : null, samples: { head: H.map((x) => +x.toFixed(1)), base: b ? B.map((x) => +x.toFixed(1)) : null } };
      }
      await h.ctx.close(); if (b) await b.ctx.close();
    }
  } finally { await hb.close(); if (bb) await bb.close(); }
  return out;
}

module.exports = { runBrowser, PROFILES };

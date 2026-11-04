// The benchmark panel that scripts/gpu-bench.js adds to the game page. It runs in your own browser, so it measures your
// graphics card: the save is loaded, then each scenario plays for a few seconds with the 2D map and with the WebGL
// tubes, and the frames are timed as they really reach the screen (requestAnimationFrame). Results show in the panel
// and go back to the terminal that started the server. Nothing is saved: the page's save() is switched off.
(() => {
  const CFG = window.__BENCH__ || {}, SECS = CFG.secs || 6, WARM = 1500;
  const SCEN = [
    { id: 'x1-far', label: 'Map at x1, zoomed out (0.6)', speed: 1, z: 0.6 },
    { id: 'x1-mid', label: 'Map at x1 (zoom 1.4)', speed: 1, z: 1.4 },
    { id: 'x1-near', label: 'Map at x1, zoomed in (3.2)', speed: 1, z: 3.2 },
    { id: 'pan', label: 'Panning at x1 (zoom 1.4)', speed: 1, z: 1.4, pan: true },
    { id: 'x8', label: 'Game at x8 (zoom 1.4)', speed: 8, z: 1.4 },
  ];
  // ?only=gl or ?only=2d runs one renderer; ?scen=x1-mid,pan runs only those scenarios; ?dpr=2 below.
  const QS = new URLSearchParams(location.search), ONLY = QS.get('only'), PICK = QS.get('scen');
  if (PICK) SCEN.splice(0, SCEN.length, ...SCEN.filter((s) => PICK.split(',').includes(s.id)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:100000;background:rgba(30,38,64,.94);color:#fff;font:13px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:12px;max-width:94vw;max-height:80vh;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.35)';
  box.innerHTML = '<b>Series of Tubes · GPU benchmark</b><div id="bst" style="margin:6px 0">Loading…</div><button id="bgo" disabled style="font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#22C47A;color:#fff;font-weight:700;cursor:pointer">Start</button> <button id="bcp" hidden style="font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#FF4F9A;color:#fff;font-weight:700;cursor:pointer">Copy results</button><div id="bout"></div>';
  const st = (t) => { box.querySelector('#bst').textContent = t; };
  let SAVE = null, MD = '';

  function fresh() {
    S = migrate(JSON.parse(SAVE)); UI.started = true; UI.pitched = true; UI.sel = null; UI.anim = 'on'; applyAnim();
    closeModal(); compute(); renderAll();
    const h = CITY[S.home] || CITIES[0]; cam.x = h.x; cam.y = h.y;
  }
  const q = (s, x) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * x))] : 0);
  async function measure(sc, hz) {
    fresh(); cam.z = sc.z; UI.speed = sc.speed; WL.key = null;
    await sleep(WARM);
    const fr = [], dr = [], day0 = S.day; let last = 0, stop = false, hidden = false, long = 0, panX = cam.x;
    const D0 = draw;
    draw = function (t) { const a = performance.now(); try { return D0(t); } finally { dr.push(performance.now() - a); } };
    let po = null; try { po = new PerformanceObserver((l) => { long += l.getEntries().length; }); po.observe({ type: 'longtask' }); } catch (e) { /* not in this browser */ }
    // Frames slower than three refreshes, with the day they fell on and their draw(): where the stutters are.
    const t00 = performance.now(), slow = [];
    const tick = (t) => { if (last) { fr.push(t - last); if (t - last > 50) slow.push({ at: Math.round(t - t00), ms: Math.round(t - last), day: S.day, draw: +(dr[dr.length - 1] || 0).toFixed(1) }); } last = t; if (document.hidden) hidden = true;
      if (sc.pan) { panX += 0.18 * (t - (tick.p || t)) / cam.z; cam.x = panX; tick.p = t; }
      if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now(); await sleep(SECS * 1000); stop = true; const T = (performance.now() - t0) / 1000;
    draw = D0; if (po) po.disconnect(); UI.speed = 0;
    const s = fr.slice().sort((a, b) => a - b), d = dr.slice().sort((a, b) => a - b), budget = 1000 / hz;
    return { fps: +(fr.length / T).toFixed(1), p50: +q(s, 0.5).toFixed(1), p95: +q(s, 0.95).toFixed(1), p99: +q(s, 0.99).toFixed(1), max: +q(s, 1).toFixed(1),
      dropped: +(100 * fr.filter((x) => x > budget * 1.5).length / Math.max(1, fr.length)).toFixed(1),
      drawMs: +(d.reduce((a, x) => a + x, 0) / Math.max(1, d.length)).toFixed(2), drawP95: +q(d, 0.95).toFixed(2),
      daysPerSec: +((S.day - day0) / T).toFixed(2), longTasks: long, hidden, drawMax: +q(d, 1).toFixed(1), slow };
  }
  async function refresh() {
    const a = []; let l = 0; await new Promise((r) => { const f = (t) => { if (l) a.push(t - l); l = t; if (a.length < 90) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    a.sort((x, y) => x - y); return Math.round(1000 / a[a.length >> 1]);
  }
  function table(res, env) {
    const rows = SCEN.map((sc) => { const a = res['2d'][sc.id], b = res.gl && res.gl[sc.id];
      const f = (m, k, u = '') => (m ? `${m[k]}${u}` : '-');
      return `| ${sc.label} | ${f(a, 'fps')} | ${f(b, 'fps')} | ${f(a, 'p95', ' ms')} | ${f(b, 'p95', ' ms')} | ${f(a, 'drawMs', ' ms')} | ${f(b, 'drawMs', ' ms')} |`; });
    return [`**${env.gpu || 'unknown GPU'}** · ${env.ua}`, `${env.w}×${env.h} at ${env.dpr}× · ${env.hz} Hz screen · ${env.cores} threads · ${env.save}`, '',
      '| Scenario | 2D fps | WebGL fps | 2D p95 frame | WebGL p95 frame | 2D draw() | WebGL draw() |',
      '|---|--:|--:|--:|--:|--:|--:|', ...rows,
      '', `<sub>p95 frame: the slowest 5% of frames. draw(): CPU time per frame on the main thread.${env.invalid ? ' ⚠️ The tab was hidden during a run: those numbers are not valid.' : ''}</sub>`].join('\n');
  }
  async function run() {
    const go = box.querySelector('#bgo'); go.disabled = true;
    save = () => {};
    // An incident pauses the game (autoPause): the clock must keep running for the timings to mean anything.
    autoPause = () => false;
    fresh(); UI.speed = 0; st('Measuring the screen refresh…'); await sleep(500);
    const hz = await refresh();
    const want0 = GLX.want, glOk = mapGl(true, false) && glInit(); const env = { gpu: GLX.gpu, ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, ''), w: innerWidth, h: innerHeight, dpr: devicePixelRatio, hz, cores: navigator.hardwareConcurrency, save: `${Object.keys(S.pops).length} POPs · ${S.links.length} links` };
    mapGl(false, false);
    const res = { '2d': {}, gl: glOk ? {} : null };
    for (const r of (glOk ? ['2d', 'gl'] : ['2d']).filter((x) => !ONLY || x === ONLY)) { mapGl(r === 'gl', false);
      for (const sc of SCEN) { st(`${r === 'gl' ? 'WebGL' : '2D'} · ${sc.label} (${SECS}s)… keep this tab in front`); const m = await measure(sc, hz); res[r][sc.id] = m; if (m.hidden) env.invalid = true; } }
    mapGl(want0, false); fresh(); UI.speed = 0;
    MD = table(res, env);
    st(glOk ? 'Done. The results are also in the terminal.' : 'Done (no WebGL2 here: 2D only).');
    box.querySelector('#bout').innerHTML = '<pre style="white-space:pre-wrap;font:11px/1.35 ui-monospace,monospace;margin:8px 0 0">' + MD.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>';
    box.querySelector('#bcp').hidden = false; go.disabled = false; go.textContent = 'Run again';
    try { await fetch('/__bench/results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ env, res, md: MD }) }); } catch (e) { /* the panel has them */ }
  }
  addEventListener('load', async () => {
    document.body.appendChild(box);
    while (typeof migrate !== 'function' || typeof GLX === 'undefined') await sleep(50);
    // ?dpr=2 draws the map as a screen of that density would (a 4K screen's pixels, measured on a smaller one).
    const DPRQ = +QS.get('dpr'); if (DPRQ > 0) { Object.defineProperty(window, 'devicePixelRatio', { get: () => DPRQ }); resize(); WL.key = null; }
    await sleep(800);
    try { SAVE = JSON.stringify((await (await fetch('/__bench/save.json')).json()).S || null); } catch (e) { st('Could not load the save: ' + e); return; }
    if (SAVE === 'null') { st('The save file has no game in it.'); return; }
    st(`Ready: ${SCEN.length} scenarios × 2 renderers, about ${Math.ceil(SCEN.length * 2 * (SECS + 3) / 60)} minutes. Keep this tab in front and do not touch the map.`);
    const go = box.querySelector('#bgo'); go.disabled = false; go.onclick = () => run().catch((e) => st('Failed: ' + (e && e.stack || e)));
    box.querySelector('#bcp').onclick = () => navigator.clipboard.writeText(MD).then(() => st('Copied.'), () => st('Copy failed: select the table instead.'));
    if (/[?&]auto\b/.test(location.search)) go.onclick();
  });
})();

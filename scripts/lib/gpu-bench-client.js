// The benchmark panel that scripts/gpu-bench.js adds to the game page. It runs in your own browser, so it measures your
// graphics card: the save is loaded, then each scenario plays for a few seconds with the 2D map and with the WebGL
// tubes, and the frames are timed as they really reach the screen (requestAnimationFrame). Results show in the panel
// and go back to the terminal that started the server. Nothing is saved: the page's save() is switched off.
// What each number is: the frame rate and p95 frame are the cadence of requestAnimationFrame (what you see); draw() is
// the main thread's time to build and submit a frame (CPU only: the card may still be drawing when it returns); GPU is
// the card's own time for a WebGL frame, from EXT_disjoint_timer_query_webgl2 where the browser offers it (read back
// frames later, never waited for, and thrown away when the card says its timing was disturbed).
(() => {
  const CFG = window.__BENCH__ || {}, QS = new URLSearchParams(location.search);
  const SECS = CFG.secs || 6, WARM = CFG.warm ?? 1500, SETTLE = CFG.settleMs || 5000, SEED = CFG.seed || 777;
  const SCEN = [
    { id: 'x1-far', label: 'Map at x1, zoomed out (0.6)', speed: 1, z: 0.6 },
    { id: 'x1-mid', label: 'Map at x1 (zoom 1.4)', speed: 1, z: 1.4 },
    { id: 'x1-near', label: 'Map at x1, zoomed in (3.2)', speed: 1, z: 3.2 },
    { id: 'pan', label: 'Panning at x1 (zoom 1.4)', speed: 1, z: 1.4, pan: true },
    { id: 'x8', label: 'Game at x8 (zoom 1.4)', speed: 8, z: 1.4 },
  ];
  // ?only=gl or ?only=2d runs one renderer; ?scen=x1-mid,pan runs only those scenarios; ?reps=3 runs each one three
  // times (the renderers take turns going first, and the table shows the medians); ?dpr=2 below.
  const ONLY = QS.get('only'), PICK = QS.get('scen'), REPS = Math.max(1, Math.min(9, +QS.get('reps') || CFG.reps || 1));
  if (PICK) SCEN.splice(0, SCEN.length, ...SCEN.filter((s) => PICK.split(',').includes(s.id)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:100000;background:rgba(30,38,64,.94);color:#fff;font:13px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:12px;max-width:94vw;max-height:80vh;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.35)';
  box.innerHTML = '<b>Series of Tubes · GPU benchmark</b><div id="bst" style="margin:6px 0">Loading…</div><button id="bgo" disabled style="font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#22C47A;color:#fff;font-weight:700;cursor:pointer">Start</button> <button id="bcp" hidden style="font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#FF4F9A;color:#fff;font-weight:700;cursor:pointer">Copy results</button><div id="bout"></div>';
  const st = (t) => { box.querySelector('#bst').textContent = t; };
  let SAVE = null, MD = '', TRIAL = 0;

  // Ends what the last trial left running before the next one starts, so nothing of one lands on the other: the clock
  // stops, its frame callback is cancelled (measure() does that, and TRIAL turns away one already queued), and a day
  // still being routed in the worker is waited for. Its answer runs dayPost() on the old save; one that never comes is
  // dropped (rwDone() ignores an answer to no job). Then the clock's leftovers are cleared.
  async function settle() {
    UI.speed = 0; TRIAL++;
    const t0 = performance.now();
    while (RW.job && performance.now() - t0 < SETTLE) await sleep(10);
    if (RW.job) { console.warn('[bench] the route worker did not answer: its day is dropped'); RW.job = null; }
    acc = 0; animT = 0;
  }
  // The save again, with the same random numbers every time (S.rng makes Math.random() follow it, as in a scenario).
  function fresh() {
    S = migrate(JSON.parse(SAVE)); S.rng = SEED; UI.started = true; UI.pitched = true; UI.sel = null; UI.anim = 'on'; applyAnim();
    closeModal(); compute(); renderAll();
    const h = CITY[S.home] || CITIES[0]; cam.x = h.x; cam.y = h.y;
  }
  async function reset() { await settle(); fresh(); }
  const q = (s, x) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * x))] : 0);
  async function measure(sc, hz, r) {
    await reset(); cam.z = sc.z; UI.speed = sc.speed; WL.key = null;
    const trial = TRIAL;
    await sleep(WARM);
    const fr = [], dr = [], gpu = [], pend = [], day0 = S.day; let last = 0, stop = false, hidden = false, long = 0, panX = cam.x, raf = 0, glF = 0, flatF = 0, disjoint = 0;
    // The card's own time, where the browser lets us read it: a timer around each WebGL draw(), read when it is ready.
    const gl = r === 'gl' ? GLX.gl : null; let tq = null; try { tq = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) { /* none */ }
    const poll = () => { while (pend.length) { const x = pend[0]; if (!gl.getQueryParameter(x, gl.QUERY_RESULT_AVAILABLE)) break; pend.shift();
      const ns = gl.getQueryParameter(x, gl.QUERY_RESULT); gl.deleteQuery(x); if (gl.getParameter(tq.GPU_DISJOINT_EXT)) disjoint++; else gpu.push(ns / 1e6); } };
    const D0 = draw;
    draw = function (t) { let x = null; if (tq && GLX.gl === gl && pend.length < 16) { x = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, x); }
      const a = performance.now();
      try { return D0(t); } finally { dr.push(performance.now() - a); if (x) { gl.endQuery(tq.TIME_ELAPSED_EXT); pend.push(x); } if (GLX.shown) glF++; else flatF++; } };
    let po = null; try { po = new PerformanceObserver((l) => { long += l.getEntries().length; }); po.observe({ type: 'longtask' }); } catch (e) { /* not in this browser */ }
    // Frames slower than three refreshes, with the day they fell on and their draw(): where the stutters are.
    const t00 = performance.now(), slow = [];
    const tick = (t) => { if (stop || trial !== TRIAL) return;
      if (last) { fr.push(t - last); if (t - last > 50) slow.push({ at: Math.round(t - t00), ms: Math.round(t - last), day: S.day, draw: +(dr[dr.length - 1] || 0).toFixed(1) }); } last = t; if (document.hidden) hidden = true;
      if (sc.pan) { panX += 0.18 * (t - (tick.p || t)) / cam.z; cam.x = panX; tick.p = t; }
      if (tq) poll();
      raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const t0 = performance.now(); await sleep(SECS * 1000); stop = true; cancelAnimationFrame(raf); const T = (performance.now() - t0) / 1000;
    draw = D0; if (po) po.disconnect(); UI.speed = 0;
    if (tq) { poll(); for (const x of pend) gl.deleteQuery(x); }
    const s = fr.slice().sort((a, b) => a - b), d = dr.slice().sort((a, b) => a - b), g = gpu.slice().sort((a, b) => a - b), budget = 1000 / hz;
    return { fps: +(fr.length / T).toFixed(1), p50: +q(s, 0.5).toFixed(1), p95: +q(s, 0.95).toFixed(1), p99: +q(s, 0.99).toFixed(1), max: +q(s, 1).toFixed(1),
      dropped: +(100 * fr.filter((x) => x > budget * 1.5).length / Math.max(1, fr.length)).toFixed(1),
      drawMs: +(d.reduce((a, x) => a + x, 0) / Math.max(1, d.length)).toFixed(2), drawP95: +q(d, 0.95).toFixed(2),
      gpuMs: g.length ? +(g.reduce((a, x) => a + x, 0) / g.length).toFixed(2) : null, gpuP95: g.length ? +q(g, 0.95).toFixed(2) : null, gpuN: g.length, disjoint,
      // Which map really drew the frames: a WebGL run that fell back to 2D (or a 2D run on the card) is not what it says.
      drawn: glF && flatF ? 'mixed' : glF ? 'gl' : flatF ? '2d' : 'none', glFrames: glF, flatFrames: flatF,
      daysPerSec: +((S.day - day0) / T).toFixed(2), longTasks: long, hidden, drawMax: +q(d, 1).toFixed(1), slow };
  }
  // Several runs of one scenario: the median of each number; the flags and the stutters of all of them.
  function merge(ms) {
    if (ms.length === 1) return ms[0];
    const o = {}, med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
    for (const k of Object.keys(ms[0])) {
      const v = ms.map((m) => m[k]);
      o[k] = k === 'slow' ? v.flat() : k === 'drawn' ? [...new Set(v)].join('+') : typeof v[0] === 'boolean' ? v.some(Boolean) : v.every((x) => typeof x === 'number') ? med(v) : v[0];
    }
    o.runs = ms.length; return o;
  }
  async function refresh() {
    const a = []; let l = 0; await new Promise((r) => { const f = (t) => { if (l) a.push(t - l); l = t; if (a.length < 90) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    a.sort((x, y) => x - y); return Math.round(1000 / a[a.length >> 1]);
  }
  function table(res, env) {
    const gpu = res.gl && SCEN.some((sc) => res.gl[sc.id] && res.gl[sc.id].gpuMs != null);
    const rows = SCEN.map((sc) => { const a = res['2d'] && res['2d'][sc.id], b = res.gl && res.gl[sc.id];
      const f = (m, k, u = '') => (m && m[k] != null ? `${m[k]}${u}` : '-');
      return `| ${sc.label} | ${f(a, 'fps')} | ${f(b, 'fps')} | ${f(a, 'p95', ' ms')} | ${f(b, 'p95', ' ms')} | ${f(a, 'drawMs', ' ms')} | ${f(b, 'drawMs', ' ms')} |${gpu ? ` ${f(b, 'gpuMs', ' ms')} |` : ''}`; });
    // A run is only what it says if its frames were drawn by the map it names.
    const off = []; for (const [r, want] of [['2d', '2d'], ['gl', 'gl']]) for (const sc of SCEN) { const m = res[r] && res[r][sc.id]; if (m && m.drawn !== want && m.drawn !== 'none') off.push(`${sc.label} (${r === 'gl' ? 'WebGL' : '2D'}: ${m.flatFrames} frames in 2D, ${m.glFrames} on the card)`); }
    return [`**${env.gpu || 'unknown GPU'}** · ${env.ua}`, `${env.w}×${env.h} at ${env.dpr}× · ${env.hz} Hz screen · ${env.cores} threads · ${env.save}${env.reps > 1 ? ` · median of ${env.reps} runs` : ''}`, '',
      `| Scenario | 2D fps | WebGL fps | 2D p95 frame | WebGL p95 frame | 2D draw() | WebGL draw() |${gpu ? ' WebGL GPU |' : ''}`,
      `|---|--:|--:|--:|--:|--:|--:|${gpu ? '--:|' : ''}`, ...rows,
      '', `<sub>fps and p95 frame: requestAnimationFrame's cadence (p95: the slowest 5% of frames). draw(): CPU time on the main thread to build and submit a frame; the card may still be working when it returns, so it is not the cost of drawing.${gpu ? ' WebGL GPU: the card\'s own time per frame (EXT_disjoint_timer_query_webgl2).' : ' No GPU timer in this browser: the card\'s own time is not measured.'}${env.invalid ? ' ⚠️ The tab was hidden during a run: those numbers are not valid.' : ''}</sub>`,
      ...(off.length ? ['', `⚠️ Not drawn by the map they name: ${off.join('; ')}.`] : [])].join('\n');
  }
  async function run() {
    const go = box.querySelector('#bgo'); go.disabled = true;
    save = () => {};
    // An incident pauses the game (autoPause): the clock must keep running for the timings to mean anything.
    autoPause = () => false;
    await reset(); st('Measuring the screen refresh…'); await sleep(500);
    const hz = await refresh();
    const want0 = GLX.want, glOk = mapGl(true, false) && glInit(); const env = { gpu: GLX.gpu, ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, ''), w: innerWidth, h: innerHeight, dpr: devicePixelRatio, hz, cores: navigator.hardwareConcurrency, save: `${Object.keys(S.pops).length} POPs · ${S.links.length} links`, reps: REPS };
    mapGl(false, false);
    const rends = (glOk ? ['2d', 'gl'] : ['2d']).filter((x) => !ONLY || x === ONLY), all = {};
    // Scenario by scenario, both renderers in turn, the first one changing every time: neither always runs on a cold or
    // a tired browser.
    let n = 0;
    for (let rep = 0; rep < REPS; rep++) for (const [i, sc] of SCEN.entries()) for (const r of (rep + i) % 2 ? rends.slice().reverse() : rends) {
      mapGl(r === 'gl', false); n++;
      st(`${r === 'gl' ? 'WebGL' : '2D'} · ${sc.label}${REPS > 1 ? ` · run ${rep + 1}/${REPS}` : ''} (${SECS}s, ${n}/${REPS * SCEN.length * rends.length})… keep this tab in front`);
      const m = await measure(sc, hz, r); ((all[r] = all[r] || {})[sc.id] = all[r][sc.id] || []).push(m); if (m.hidden) env.invalid = true;
    }
    const res = { '2d': null, gl: null };
    for (const r of Object.keys(all)) { res[r] = {}; for (const id of Object.keys(all[r])) res[r][id] = merge(all[r][id]); }
    mapGl(want0, false); await reset();
    MD = table(res, env);
    st(glOk ? 'Done. The results are also in the terminal.' : 'Done (no WebGL2 here: 2D only).');
    box.querySelector('#bout').innerHTML = '<pre style="white-space:pre-wrap;font:11px/1.35 ui-monospace,monospace;margin:8px 0 0">' + MD.replace(/<\/?sub>/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>';
    box.querySelector('#bcp').hidden = false; go.disabled = false; go.textContent = 'Run again';
    try { await fetch('/__bench/results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ env, res, md: MD }) }); } catch (e) { /* the panel has them */ }
  }
  // tests/gpu-bench.test.js drives the pieces without the panel.
  if (CFG.expose) { window.__bench = { settle, reset, measure, merge, table, setSave: (s) => { SAVE = s; } }; return; }
  addEventListener('load', async () => {
    document.body.appendChild(box);
    while (typeof migrate !== 'function' || typeof GLX === 'undefined') await sleep(50);
    // A software renderer is measured too here (the game itself keeps the 2D map on one); the table names the renderer.
    GLX.soft = true;
    // ?dpr=2 draws the map as a screen of that density would (a 4K screen's pixels, measured on a smaller one).
    const DPRQ = +QS.get('dpr'); if (DPRQ > 0) { Object.defineProperty(window, 'devicePixelRatio', { get: () => DPRQ }); resize(); WL.key = null; }
    await sleep(800);
    try { SAVE = JSON.stringify((await (await fetch('/__bench/save.json')).json()).S || null); } catch (e) { st('Could not load the save: ' + e); return; }
    if (SAVE === 'null') { st('The save file has no game in it.'); return; }
    const runs = SCEN.length * (ONLY ? 1 : 2) * REPS;
    st(`Ready: ${SCEN.length} scenarios × ${ONLY ? 1 : 2} renderers${REPS > 1 ? ` × ${REPS}` : ''}, about ${Math.ceil(runs * (SECS + 3) / 60)} minutes. Keep this tab in front and do not touch the map.`);
    const go = box.querySelector('#bgo'); go.disabled = false; go.onclick = () => run().catch((e) => st('Failed: ' + (e && e.stack || e)));
    box.querySelector('#bcp').onclick = () => navigator.clipboard.writeText(MD).then(() => st('Copied.'), () => st('Copy failed: select the table instead.'));
    if (/[?&]auto\b/.test(location.search)) go.onclick();
  });
})();

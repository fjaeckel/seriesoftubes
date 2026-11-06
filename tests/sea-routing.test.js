const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Check the surveyed part independently against the original coastline segments.
// City markers may sit inland: their two short shore approaches are excluded.
// The overland passages (beside the Suez Canal, across Panama) are the only places a surveyed route may cross land.
// A piece lies on a passage when both its ends sit on the straight line between that passage's two sea cells.
const onLine = (x, [p, q]) => { const dx = q[0] - p[0], dy = q[1] - p[1], t = ((x[0] - p[0]) * dx + (x[1] - p[1]) * dy) / (dx * dx + dy * dy); return t > -1e-6 && t < 1 + 1e-6 && Math.hypot(p[0] + t * dx - x[0], p[1] + t * dy - x[1]) < 1e-6; };
const isPass = (a, b, passes) => passes.some(P => onLine(a, P) && onLine(b, P));
function assertMarine(path, start, end, coast, passes = []) {
  const at = p => path.findIndex(q => Math.abs(p[0] - q[0]) < 1e-8 && Math.abs(p[1] - q[1]) < 1e-8);
  const first = at(start), last = at(end);
  assert.ok(first >= 0 && last >= first, 'both shore approaches appear in the saved path');
  const edges = coast.flatMap(poly => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]));
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = first + 1; i <= last; i++) {
    const a = path[i - 1], b = [...path[i]];
    b[0] += 360 * Math.round((a[0] - b[0]) / 360);
    if (isPass(path[i - 1], path[i], passes)) continue;
    for (const [p, q] of edges) {
      const shift = 360 * Math.round((a[0] - p[0]) / 360), c = [p[0] + shift, p[1]], d = [q[0] + shift, q[1]];
      assert.ok(!(turn(a, b, c) * turn(a, b, d) < -1e-12 && turn(c, d, a) * turn(c, d, b) < -1e-12),
        `sea segment ${lit([a, b])} crosses a coastline`);
    }
  }
}

test('surveyed designs avoid land, use real path lengths and improve latency', () => {
  const { ev, dom, errors } = load();
  try {
    const coast = JSON.parse(ev('JSON.stringify(COAST_LL)'));
    const passes = JSON.parse(ev('JSON.stringify([...seaPasses().entries()].flatMap(([u,L])=>L.map(P=>[seaPoint(u),seaPoint(P.to)])))'));
    for (const [a, b] of [['lag', 'bde'], ['cbo', 'nyc'], ['lax', 'tok'], ['mrs', 'sin'], ['cai', 'pmo']]) {
      const quotes = JSON.parse(ev(`JSON.stringify(Object.keys(SEA_DESIGNS).map(d=>seaQuote('${a}','${b}',d)))`));
      for (let i = 0; i < quotes.length; i++) {
        const q = quotes[i];
        assert.ok(Number.isFinite(q.km) && q.pts.length > 2);
        // the fastest design may follow the corridor of an existing cable instead, which is drawn as that cable is
        if (!q.cor) assertMarine(q.pts, ...q.shore, coast, passes);
        assert.equal(q.km, ev(`seaLength(${lit(q.pts)})`));
        if (i) {
          assert.ok(q.km <= quotes[i - 1].km, 'premium surveys never lengthen the route');
          assert.ok(q.ms < quotes[i - 1].ms, 'premium latency is strictly lower');
          assert.ok(q.cost > quotes[i - 1].cost && q.days > quotes[i - 1].days);
        }
      }
      const reverse = JSON.parse(ev(`JSON.stringify(seaQuote('${b}','${a}'))`));
      assert.equal(reverse.km, quotes[0].km);
      assert.deepEqual(reverse.pts, [...quotes[0].pts].reverse(), 'reverse direction uses the same survey');
    }
    assert.ok(ev("seaQuote('cai','pmo').km<3000"), 'Cairo approaches the Mediterranean rather than routing out of the Red Sea');
    assert.equal(ev("cablesFor('cbo','nyc').length"), 0, 'route works without an existing cable');
    assert.ok(ev("seaQuote('cbo','nyc').km > kmBetween('cbo','nyc')*1.1"), 'the route detours through the Mediterranean');
    // Europe to Asia crosses Egypt beside the Suez Canal, like real cables, instead of sailing round Africa
    assert.ok(ev("seaQuote('mrs','sin').km") < 13000, `Marseille–Singapore via Suez (${ev("seaQuote('mrs','sin').km")} km)`);
    assert.ok(ev("seaQuote('mrs','sin').pts.some(p=>p[0]>31.5&&p[0]<33.5&&p[1]>29.5&&p[1]<31.5)"), 'the route crosses at Suez');
    assert.equal(JSON.stringify(ev("subNeed(ownCabKm('mrs','sin'))")), '[]', 'no upgrades needed for Marseille–Singapore');
    // the Caribbean and the Pacific meet across Panama
    assert.ok(ev("seaQuote('mia','lim').km") < 6000, `Miami–Lima via Panama (${ev("seaQuote('mia','lim').km")} km)`);
    assert.ok(ev("seaQuote('mia','lim').pts.some(p=>p[0]>-80.5&&p[0]<-79&&p[1]>8.5&&p[1]<9.8)"), 'the route crosses Panama');
    assert.ok(ev("seaQuote('lax','tok').pts.some((p,i,a)=>i&&Math.abs(p[0]-a[i-1][0])>180)"), 'Pacific route wraps the date line');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('grid edges and smoothing cannot jump across a thin island', () => {
  const { ev, dom } = load();
  try {
    ev('COAST_LL.length=0;COAST_LL.push([[0.09,-0.1],[0.16,-0.1],[0.16,0.1],[0.09,0.1]])');
    assert.equal(ev('seaLand(0,0)||seaLand(0.25,0)'), false, 'both grid endpoints are water');
    assert.equal(ev('seaClear([0,0],[0.25,0])'), false, 'exact coastline check catches the island between them');
    assert.equal(ev('seaStep(320*1440+720,1,0)'), false, 'the grid step also catches it');
    assert.equal(ev('seaClear([0,-0.25],[0.25,-0.25])'), true, 'open water remains traversable');
  } finally { dom.window.close(); }
});

test('orders, previews, saved paths and map geometry agree; legacy cables retain their values', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e11;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0;for(const city of ['lag','bde'])ACT.buildPop({city});UI.lmode='df';UI.dfSrc='cable';openLinkModal('lag','bde')");
    for (const design of ['standard', 'optimized', 'express']) {
      const q = JSON.parse(ev(`JSON.stringify(seaQuote('lag','bde','${design}'))`));
      assert.ok(dom.window.document.getElementById('modalCard').textContent.includes(q.ms.toFixed(1) + ' ms one-way'));
      ev(`UI.pending={a:'lag',b:'bde'};UI.seaDesign='${design}';ACT.orderCable()`);
      const l = JSON.parse(ev('JSON.stringify(S.links.at(-1))'));
      assert.deepEqual(l.seaPath, q.pts);
      assert.equal(l.km, q.km);
      assert.equal(l.paid, q.cost);
      assert.equal(l.ready - l.day, q.days);
      assert.equal(ev('linkLat(S.links.at(-1))'), q.ms);
      ev('S=migrate(JSON.parse(JSON.stringify(S)));GEO.clear()');
      assert.deepEqual(JSON.parse(ev('JSON.stringify(S.links.at(-1).seaPath)')), q.pts);
      assert.deepEqual(JSON.parse(ev('JSON.stringify(linkGeom(S.links.at(-1)).pts)')),
        JSON.parse(ev('JSON.stringify(seaMapPoints(S.links.at(-1).seaPath,"lag","bde"))')));
      ev("UI.dfSrc='cable';openLinkModal('lag','bde')");
    }
    ev("S.links.push({id:'legacy',a:'lag',b:'bde',kind:'df',own:true,sub:true,seaDesign:'optimized',sys:'roadm',km:7515,ch:[],ready:0,mo:1,cut:0});S=migrate(JSON.parse(JSON.stringify(S)))");
    assert.equal(ev('S.links.at(-1).seaPath'), undefined);
    assert.equal(ev('S.links.at(-1).km'), 7515);
    assert.equal(ev('linkLat(S.links.at(-1))'), 37.575);
    ev('S.links.at(-1).seaPath=[[0,0],[NaN,1]];S=sanitize(S)');
    assert.equal(ev('S.links.at(-1).seaPath'), undefined, 'invalid path data is discarded');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('failed surveys refuse construction instead of falling back to a line through land', () => {
  const { ev, dom } = load();
  try {
    ev("ACT.start({});S.cash=1e11;S.won=true;SEA_NAV.routes.set('bde|lag',[]);UI.pending={a:'lag',b:'bde'}");
    assert.match(ev("ownCabWhy('lag','bde')"), /No navigable sea route/);
    const count = ev('S.links.length'), cash = ev('S.cash');
    ev('ACT.orderCable()');
    assert.equal(ev('S.links.length'), count);
    assert.equal(ev('S.cash'), cash);
  } finally { dom.window.close(); }
});

test('background surveys deduplicate requests and do not replace a later dialog', () => {
  const { ev, dom } = load();
  try {
    ev(`window.Worker=class{constructor(){window.surveyWorker=this;this.requests=[];}postMessage(m){this.requests.push(m);}terminate(){}};
      URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};
      ACT.start({});S.won=true;S.cash=1e11;UI.lmode='df';UI.dfSrc='cable';openLinkModal('lag','bde');`);
    assert.match(dom.window.document.getElementById('modalCard').textContent, /Surveying a sea route/);
    ev("ownCabWhy('bde','lag')");
    assert.equal(ev('surveyWorker.requests.length'), 1, 'reverse-direction requests share a job');
    ev("openModal('<p id=otherDialog>Another dialog</p>');surveyWorker.onmessage({data:{key:'bde|lag',routes:[]}})");
    assert.ok(dom.window.document.getElementById('otherDialog'), 'a completed survey cannot reopen a stale build dialog');
    assert.equal(ev('SEA_SURVEY.pending.size'), 0);
  } finally { dom.window.close(); }
});

test('the fastest design is as fast as the fastest cable, and the Red Sea Crisis closes Suez', () => {
  const { ev, errors, dom } = load();
  try {
    // where a cable already runs, the low-latency design follows its corridor if that is shorter than its own survey
    for (const [a, b] of [['lon', 'nyc'], ['hfx', 'lon']]) {
      const best = ev(`Math.min(...cablesFor('${a}','${b}').map(c=>linkLat({kind:'wave',km:c.km,cable:c.cid})))`);
      const q = JSON.parse(ev(`JSON.stringify(seaQuote('${a}','${b}','express'))`));
      assert.ok(q.ms <= best + 1e-9, `${a}–${b}: ${q.ms.toFixed(2)} ms against ${best.toFixed(2)} ms`);
      assert.equal(q.km, ev(`seaLength(${lit(q.pts)})`), 'map and price use the same path');
    }
    // and where the existing cable takes a detour, the survey beats it
    assert.ok(ev("seaQuote('lag','bde','express').ms") < ev("Math.min(...cablesFor('lag','bde').map(c=>linkLat({kind:'wave',km:c.km,cable:c.cid})))"));
    // the crisis shuts the canal for your own cables too, and the cache keeps the two cases apart
    const open = ev("seaQuote('mrs','sin').km");
    ev("ACT.startScn({id:'redsea',sure:1})");
    const shut = ev("seaQuote('mrs','sin').km");
    assert.ok(shut > open + 5000, `round Africa in the crisis (${shut} km against ${open} km)`);
    assert.ok(ev("seaQuote('mrs','sin','express').km") > open + 5000, 'the fastest design cannot borrow a cut cable');
    assert.ok(ev("seaQuote('mrs','sin').pts.some(p=>p[0]>-7&&p[0]<-4&&p[1]>35&&p[1]<37)"), 'out through Gibraltar');
    ev("ACT.start({})");
    assert.equal(ev("seaQuote('mrs','sin').km"), open, 'back to Suez in a normal game');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});


// Puzzle tools (the weekly generator, the puzzle tests): build a puzzle network straight into a headless game, judge
// it with the game's own star code, and search for the cheapest build that earns three stars.
//
// A build is a list of links [a, b, via, tier, same]: via is 'land' or a cable id, tier an index into LT, and `same`
// (k > 0) puts an overland link in the k-th trench already on that pair (otherwise a further one takes a diverse
// route, +40%). Routers
// are not part of the search: each POP gets the cheapest models that carry its busiest moment (across every single
// cut), its ports and its biggest wave, which is what any sensible player would buy for that build.

// Runs inside the page.
function page() {
  window.pzsReset = () => { S.pops = {}; S.links = []; S.pairMet = {}; for (const b of S.biz) b.route = 'normal'; UI.pzEv = null; };
  window.pzsLink = (a, b, via, tier, same) => {
    const r = pzRoutes(a, b).find((x) => x.via === via); if (!r) throw new Error(`no route ${via} for ${a}-${b}`);
    for (const c of [a, b]) if (!S.pops[c]) S.pops[c] = pzNewPop(c);
    // `same` k > 0: in the k-th overland trench on this pair; 0: a trench of its own (diverse, unless it is the first).
    const tr = !r.sub ? [...new Set(S.links.filter((l) => edgeKey(l) === edgeKey({ a, b }) && !l.cable).map((l) => l.trench))] : [], sm = same && tr[same - 1], div = !!(tr.length && sm !== tr[0]), id = uid();
    S.links.push({ id, a, b, kind: 'wave', border: false, premium: false, tier, km: r.km, sub: r.sub, cable: r.cab, mo: pzMo(r, tier, div), mult: r.f * (div ? DIVERSE : 1), trench: r.cab ? 'cab:' + r.cab : sm || id, cut: 0, day: 0 });
  };
  // The cheapest routers for POP c: enough ports, a model that lights its biggest wave, and capacity for its peak.
  window.pzsRouters = (c, peak) => {
    const used = portsUsed(c), lt = Math.max(0, ...S.links.filter((l) => l.a === c || l.b === c).map((l) => l.tier)); let best = null;
    for (const g of PZ_RG) for (let rt = 1; rt <= 6; rt++) { const M = RG[g]; if (M.maxLT < lt || M.ports * rt < used - 1e-9 || M.cap * rt < peak - 1e-6) continue;
      const cost = pzRtCost(g, rt); if (!best || cost < best.cost) best = { g, rt, cost }; }
    return best;
  };
  // Judge the build on routers big enough for anything, then price the routers it really needs. With those, routing
  // is the same (no router is ever full), so the stars are too.
  window.pzsJudge = () => {
    const BIG = RG.findIndex((r) => r.n === 'Arrrhipster 7800R'), keep = {};
    for (const c in S.pops) { keep[c] = [S.pops[c].rgen, S.pops[c].routers]; S.pops[c].rgen = BIG; S.pops[c].routers = 1; }
    UI.pzEv = null; const b0 = S.pz.budget; S.pz.budget = 0; const e = pzEval(); S.pz.budget = b0; UI.pzEv = null;
    const rt = {}; let spend = 0, bad = false;
    for (const c in S.pops) { const r = pzsRouters(c, e.peak[c] || 0); if (!r) { bad = true; continue; } rt[c] = [r.g, r.rt]; spend += r.cost + pzPopCost(c); S.pops[c].rgen = keep[c][0]; S.pops[c].routers = keep[c][1]; }
    for (const l of S.links) spend += l.mo * PZ_YEAR;
    return { one: e.goal && !bad, three: e.goal && e.n1 && !bad, spend, rt };
  };
  window.pzsApplyRt = (rt) => { for (const c in rt) { S.pops[c].rgen = rt[c][0]; S.pops[c].routers = rt[c][1]; } UI.pzEv = null; };
}
const install = (ev) => { if (ev("typeof pzsJudge!=='function'")) ev(`(${page.toString()})()`); };

const key = (L) => JSON.stringify(L);
// Steps that are not links set what a player sets in the panels: ['@route', flow, 'fast'] a circuit's path,
// ['@met', a, b, 'avoid'] a pair's metric. The search keeps them as they are.
const step = ([a, b, v, t, s]) => a === '@route' ? `S.biz.find(x=>x.id===pzFlowId(${b})).route='${v}';` : a === '@met' ? `(S.pairMet=S.pairMet||{})[edgeKey({a:'${b}',b:'${v}'})]='${t}';`
  : `pzsLink('${a}','${b}','${v}',${t},${s || 0});`;
function judge(ev, L) {
  return JSON.parse(ev(`pzsReset();${L.map(step).join('')}JSON.stringify(pzsJudge())`));
}
// Every link option between the given cities: each route, at tiers up to maxTier.
function options(ev, cities, maxTier, noSub) {
  const out = [];
  for (let i = 0; i < cities.length; i++) for (let j = i + 1; j < cities.length; j++) {
    const [a, b] = [cities[i], cities[j]];
    const rs = JSON.parse(ev(`JSON.stringify(pzRoutes('${a}','${b}').map(r=>({via:r.via,sub:r.sub,ok:[0,1,2,3].map(t=>!subWaveWhy(t,r.km,r.sub))})))`));
    for (const r of rs) { if (noSub && r.sub) continue; for (let t = 0; t <= maxTier; t++) if (r.ok[t]) { out.push([a, b, r.via, t, 0]); if (!r.sub) { out.push([a, b, r.via, t, 1]); out.push([a, b, r.via, t, 2]); } } }
  }
  return out;
}
// Local search from a 3-star build: drop a link, shrink one, move one to another route, put it in the first trench
// or out of it, or swap one link for another option, while it is cheaper and still three stars.
function improve(ev, start, opts = {}) {
  const memo = new Map(), J = (L) => { const k = key(L); if (!memo.has(k)) memo.set(k, judge(ev, L)); return memo.get(k); };
  let cur = start.map((x) => x.slice()), cj = J(cur);
  if (!cj.three) throw new Error('the starting build does not earn three stars');
  const routes = {}, via = (a, b) => { const k = a < b ? a + '|' + b : b + '|' + a; if (!routes[k]) routes[k] = JSON.parse(ev(`JSON.stringify(pzRoutes('${a}','${b}').map(r=>r.via))`)); return routes[k]; };
  const opt = opts.options || [];
  for (let round = 0; round < 60; round++) {
    const nb = [];
    for (let i = 0; i < cur.length; i++) {
      const w = (x) => { const L = cur.slice(); L[i] = x; return L; }, [a, b, v, t, s] = cur[i];
      if (a[0] === '@') continue;
      nb.push(cur.filter((_, k) => k !== i));
      if (t > 0) nb.push(w([a, b, v, t - 1, s]));
      for (const v2 of via(a, b)) if (v2 !== v) nb.push(w([a, b, v2, t, 0]));
      if (v === 'land') for (const s2 of [0, 1, 2]) if (s2 !== (s || 0)) nb.push(w([a, b, v, t, s2]));
    }
    if (opts.swap) for (const o of opt) for (let i = 0; i < cur.length; i++) { if (cur[i][0][0] === '@') continue; const L = cur.slice(); L[i] = o; nb.push(L); }
    let best = null;
    for (const L of nb) { const j = J(L); if (j.three && j.spend < cj.spend - 1 && (!best || j.spend < best.j.spend)) best = { L, j }; }
    if (!best && opts.add) for (const o of opt) for (let i = 0; i < cur.length; i++) for (let k = i + 1; k < cur.length; k++) {
      if (cur[i][0][0] === '@' || cur[k][0][0] === '@') continue;
      const L = [...cur.filter((_, x) => x !== i && x !== k), o], j = J(L); if (j.three && j.spend < cj.spend - 1 && (!best || j.spend < best.j.spend)) best = { L, j }; }
    if (!best) break;
    cur = best.L; cj = best.j;
  }
  return { links: cur, ...cj };
}
module.exports = { install, judge, options, improve };

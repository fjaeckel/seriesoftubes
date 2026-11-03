// Runs inside a game page (scripts/route-fuzz.js loads two: main's and this checkout's), next to scripts/lib/mcp-page.js.
// The driver picks every move with its own seeded random numbers and sends the same calls to both pages, so the pages
// stay in lockstep; this file only offers what a player could do now (buttons on screen, POPs, cities) and digests what
// routing gave, as strings the driver compares.
(() => {
  const DENY = new Set(['animSet', 'cont', 'exportSave', 'importGo', 'importPick', 'install', 'langSet', 'menu', 'mute', 'newgame', 'phonePlay', 'phoneSpeed',
    'prefSet', 'pzShare', 'resetAsk', 'settings', 'settingsClose', 'share', 'shareDl', 'shareGo', 'slotBack', 'slotDel', 'slotDelGo', 'slotExport', 'slotMenu',
    'slotRetry', 'slotSpace', 'slotSwitch', 'slotTake', 'soundSet', 'speed', 'start', 'toTitle', 'traceCopy', 'updateLater', 'updateNow', 'vpSet', 'wsShare',
    // Leave the game or open what is not this game: the title screen, menus of other modes, AI helpers that fetch.
    'closePanel', 'puzzleMenu', 'puzzleDoor', 'scnMenu', 'startScn', 'startWeekly', 'pzStart', 'pzArStart', 'arMenu', 'teSlop', 'help', 'helpClose', 'keepPlaying',
    'logOpen', 'pitchSkip', 'pitchGo', 'feedback', 'tutSkip', 'tutNext']);
  const sig = (b) => b.act + ' ' + JSON.stringify(b.args);
  const btns = (root) => (root ? [...root.querySelectorAll('[data-act]')] : []).filter((b) => !b.disabled && !DENY.has(b.dataset.act) && typeof ACT[b.dataset.act] === 'function')
    .map((b) => { let args = {}; try { args = JSON.parse(b.dataset.args || '{}'); } catch (e) {} return { act: b.dataset.act, args }; });
  const modalOpen = () => !$('modal').hidden;
  const errs = [];
  const call = (act, args) => {
    try { const r = ACT[act](args || {}); if (r && typeof r.then === 'function') r.catch((e) => errs.push(act + ': ' + e.message)); return ''; } catch (e) { return act + ': ' + (e && e.message); }
  };
  const fixClock = (t) => { Date.now = () => t; };

  // ---------- starts ----------
  const homes = () => CITIES.filter((c) => homeOk(c.id)).map((c) => c.id);
  // Home cities with rules of their own: China, Korea, Russia, Australia, the Philippines, islands and far places.
  const special = () => CITIES.filter((c) => homeOk(c.id) && (c.cn || c.kr || c.ru || ['AU', 'PH', 'NZ', 'JP', 'ID', 'IS', 'FJ', 'PF', 'MU', 'MV', 'CL', 'ZA', 'BR', 'IN', 'SG', 'HK', 'TW', 'KR', 'CN'].includes(c.cc))).map((c) => c.id);
  const lists = () => ({ homes: homes(), special: special(), scn: SCN.map((s) => s.id), pz: PZ.map((p) => p.id), ar: AR_RUNS.map((r) => r.id) });
  const settle = () => { UI.started = true; UI.pitched = true; UI.speed = 0; if (UI.pendGame) ACT.pitchSkip(); closeModal(); if (S && !pzOn()) compute(); renderAll(); };
  const start = ({ kind, id, city, preset, seed, name }) => {
    if (window.__reseed) window.__reseed(seed);
    fixClock(1.7e12 + seed * 1000);
    UI.pitched = true; UI.pendGame = null;
    if (pzOn()) pzLeave();
    if (kind === 'normal') beginGame(name, city, { mode: 'normal', preset });
    else if (kind === 'sandbox') beginGame(name, city, { mode: 'sandbox', rules: { chaos: preset } });
    else if (kind === 'scenario') { const sc = SCN.find((x) => x.id === id); beginGame(name, sc.city, { scn: sc }); }
    else if (kind === 'weekly') { const wk = weekly(); beginGame(name, wk.city, { scn: wk, seed: wk.seed }); }
    else if (kind === 'puzzle') pzBegin(pzDef(id));
    else if (kind === 'architect') arBegin(arRunDef(id));
    // A saved network (the big fixture): loaded and migrated as an import is, with its incidents and events still on.
    else if (kind === 'save') { S = migrate(JSON.parse(window.__fzSave)); }
    settle();
    return { mode: S.mode, home: S.home, puzzle: pzOn() };
  };

  // ---------- what a player could do now ----------
  // The nearest cities, and those a cable lands from here (subsea seats, IRUs and own cables start there).
  const near = (c, n) => CITIES.filter((x) => x.id !== c).map((x) => [x.id, kmBetween(c, x.id)]).sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0])
    .concat(CABLE_PAIRS.filter((p) => p.a === c || p.b === c).slice(0, 4).map((p) => (p.a === c ? p.b : p.a)));
  const state = () => {
    const pops = Object.keys(S.pops), nb = new Set();
    for (const p of pops.slice(0, 12)) for (const c of near(p, 8)) if (!S.pops[c]) nb.add(c);
    return { pops, near: [...nb], cities: CITIES.length, links: S.links.map((l) => l.id), day: S.day, puzzle: pzOn(), modal: modalOpen(), lost: !!S.lost,
      clock: !!rule('clock'), core: S.core ? S.core.lv : 0, nets: NET_IDS.length, transit: S.transit.map((t) => t.id), pni: S.pni.map((p) => p.id), biz: S.biz.map((b) => b.id), offers: (S.offers || []).map((o) => o.id) };
  };
  // The buttons of one place on screen, after opening it.
  const screen = (w) => {
    if (w.where === 'modal') return btns($('modal'));
    if (w.where === 'city') { UI.sel = { type: 'city', id: w.city }; UI.tab = w.tab; renderAll(); return btns($('panel')); }
    if (w.where === 'link') { if (!S.links.some((l) => l.id === w.id)) return []; UI.sel = { type: 'link', id: w.id }; renderAll(); return btns($('panel')); }
    if (w.where === 'dash') { $('dash').hidden = false; UI.dtab = w.tab; renderDash(); const b = btns($('dash')); return b; }
    if (w.where === 'left') {
      UI.left = w.tab; UI.leftOpen = true; renderLeft(); let b = btns($('leftBody'));
      if (w.tab !== 'noc') return b;
      // The backbone, Auto-TE and DDoS settings moved from the NOC tab into the Routing & DDoS modal: offer them here on
      // both pages, in one order, so main's page (settings in the tab) and this one (behind the button) stay in lockstep.
      if (typeof routingBody === 'function' && b.some((x) => x.act === 'routingOpen')) { const d = document.createElement('div'); d.innerHTML = routingBody(); b = b.filter((x) => x.act !== 'routingOpen').concat(btns(d)); }
      return b.sort((x, y) => (sig(x) < sig(y) ? -1 : sig(x) > sig(y) ? 1 : 0));
    }
    if (w.where === 'openLink') { if (!S.pops[w.a]) return []; openLinkModal(w.a, w.b); return modalOpen() ? btns($('modal')) : []; }
    return [];
  };
  const press = (b) => { const e = call(b.act, b.args); return e; };
  const close = () => { if (modalOpen()) closeModal(); $('dash').hidden = true; };

  // ---------- things a player does with no button handy here ----------
  const RS = ['spill at 80%', 'spill at 60%', 'protect customers', 'blackhole ddos'];
  const script = (rules) => {
    const L = [];
    for (const r of rules) {
      const [k, a, b] = r;
      const net = NETS[a % NETS.length], t = S.transit.length ? NET[S.transit[a % S.transit.length].net] : net;
      const pops = Object.keys(S.pops), l = S.links.length ? S.links[a % S.links.length] : null;
      if (k === 0) L.push(RS[a % RS.length]);
      else if (k === 1) L.push(`${b % 2 ? 'prefer' : 'avoid'} ${['pni', 'ix', 'transit'][b % 3]} for ${net.name.toLowerCase()}`);
      else if (k === 2) L.push(`cap transit ${t.name.toLowerCase()} at ${10 + (b % 50)} gbps`);
      else if (k === 3) L.push(`${b % 2 ? 'prefer' : 'avoid'} transit ${t.name.toLowerCase()}`);
      else if (k === 4) L.push(`prepend transit ${t.name.toLowerCase()} ${1 + (b % 3)}`);
      else if (k === 5 && pops.length) L.push(`drain ${CITY[pops[a % pops.length]].name.toLowerCase()}`);
      else if (k === 6 && l) L.push(`avoid link ${CITY[l.a].name.toLowerCase()}-${CITY[l.b].name.toLowerCase()}`);
    }
    return L.join('\n');
  };
  const poke = (p) => {
    const [k, a, b] = p;
    if (k === 'te') { if (!S.te) return 'no te'; S.te.script = script(a); S.te.on = !!b; S.core = S.core || { lv: 0, run: 0 }; after(); return S.te.script; }
    if (k === 'teOff') { if (S.te) { S.te.on = false; after(); } return ''; }
    if (k === 'core') { if (S.core) { const v = a % (S.core.lv + 1); return call('coreSet', { v }); } return ''; }
    if (k === 'fail') { S.nextFail = S.day + 1; return ''; }
    if (k === 'event') { S.nextEvent = S.day + 1; return ''; }
    if (k === 'cash') { S.cash += a; after(); return ''; }
    if (k === 'lvl') { S.lvl = Math.min(LEVELS.length, (S.lvl || 0) + 1); after(); return ''; }
    // Events that move routes, as the game's own events set them.
    if (k === 'ev') {
      const n = NETS[a % NETS.length].id;
      if (b === 0) S.ev.leak = { net: n, until: S.day + 3 };
      else if (b === 1) S.ev.rpki = { nets: [n, NETS[(a * 7) % NETS.length].id], until: S.day + 3 };
      else if (b === 2) S.ev.depeer = S.day + 3;
      else if (b === 3) { const x = Object.keys(S.ixp); if (x.length) { S.ev.ixdown = S.ev.ixdown || {}; S.ev.ixdown[x[a % x.length]] = S.day + 2; } }
      else if (b === 4 && S.links.length) S.links[a % S.links.length].cut = S.day + 2;
      else if (b === 5 && S.transit.length) S.transit[a % S.transit.length].down = S.day + 2;
      // After an update brings networks: the courtesy route to them (sanitize() sets it on load).
      else if (b === 7) S.grace = { until: S.day + 4, nets: [n, NETS[(a * 13) % NETS.length].id, NETS[(a * 31) % NETS.length].id], fresh: 0 };
      else if (b === 8) S.krExit = S.day + 2;
      else if (b === 6) { const p = Object.keys(S.pops); if (p.length > 1) S.pops[p[1 + (a % (p.length - 1))]].down = S.day + 2; }
      after(); return '';
    }
    return 'unknown poke';
  };

  /* Actions on what the network already has, with arguments a button somewhere would give (some sit in collapsed
     lists, or on screens the walker rarely reaches): one list of calls, the driver picks one. */
  const direct = () => {
    const o = [], add = (act, args) => { if (typeof ACT[act] === 'function') o.push({ act, args }); };
    const pops = Object.keys(S.pops), PR = ['high', 'low', 'normal'];
    for (const t of S.transit) { add('setPref', { kind: 't', id: t.id, v: PR[(t.id.length + S.day) % 3] }); add('setCarry', { id: t.id, on: !t.carry }); add('lagT', { id: t.id, d: (S.day % 3) ? 1 : -1 }); add('cancelTransit', { id: t.id, ok: true }); add('togglePrem', { id: t.id }); add('cleanPipe', { id: t.id }); }
    for (const p of S.pni) { add('setPref', { kind: 'p', id: p.id, v: PR[(p.id.length + S.day) % 3] }); add('lagP', { id: p.id, d: (S.day % 3) ? 1 : -1 }); add('cancelPni', { id: p.id, ok: true }); add('sacrif', { id: p.id }); }
    for (const x of Object.keys(S.ixp)) { add('setPref', { kind: 'ix', id: x, v: PR[(x.length + S.day) % 3] }); add('lagIx', { city: x, d: (S.day % 3) ? 1 : -1 }); add('peerAll', { city: x }); add('rs', { city: x }); add('cancelIx', { city: x, sure: true, ok: true });
      for (const n of ixMembers(x).slice(0, 30)) add(ixSessions(x).has(n) ? 'unpeer' : 'peer', { city: x, net: n }); }
    for (const c of pops) {
      for (const x of ixIdsIn(c)) if (S.ixp[x] === undefined) add('buyIx', { city: x, tier: S.day % 3 });
      for (const n of NETS) if (n.pops.includes(c)) { if (S.day % 2 === 0 || n.cache) add('pni', { city: c, net: n.id, tier: n.id.length % 3 }); if (n.cache) add('cache', { city: c, net: n.id }); }
      for (const n of NETS) if (sellsAt(n, c) && (n.id.length + S.day) % 4 === 0) add('buyTransit', { city: c, net: n.id, tier: (S.day >> 2) % 3 });
      add('addRouter', { city: c }); add('upRouter', { city: c, g: 1 + (S.day % 4) }); add('foundIx', { city: c }); add('launchBB', { city: c }); add('addSite', { city: c });
    }
    for (const c of S.caches) add('rmCache', { id: c.id });
    for (const l of S.links) { add('setStandby', { id: l.id, on: !l.standby }); add('setMetric', { id: l.id, v: ['backup', 'avoid', 'prefer', 'normal'][(l.id.length + S.day) % 4] }); add('upLink', { id: l.id, tier: (S.day % 4) }); add('rmLink', { id: l.id }); add('addParallel', { id: l.id }); }
    for (const b of S.offers || []) add('accept', { id: b.id });
    for (const b of S.biz) add('dropBiz', { id: b.id });
    for (const l of S.loanOffers || []) add('takeLoan', { id: l.id });
    for (const l of S.loans || []) add('repayLoan', { id: l.id });
    return o;
  };

  // ---------- time ----------
  const day = () => { if (S.lost || !rule('clock')) return 'no clock'; if (modalOpen()) closeModal(); try { dayTick(); } catch (e) { return 'dayTick: ' + e.message; } return ''; };

  // ---------- digests ----------
  // Everything routing produced: R in full (with every link's R.ef), the flows (R.fl), and what the PNI lists read.
  const routing = () => {
    if (!R) return 'noR';
    const r = JSON.stringify(R), fl = R.fl ? JSON.stringify(R.fl) : '';
    let pf = '';
    if (typeof pniFlows === 'function' && S && !pzOn()) for (const c of Object.keys(S.pops).slice(0, 4)) try { pf += c + JSON.stringify(pniFlows(c)); } catch (e) { pf += c + 'E' + e.message; }
    return r + '\n' + fl + '\n' + pf;
  };
  const parts = () => { const o = {}; if (!R) return o; for (const k of Object.keys(R)) o[k] = JSON.stringify(R[k]); o.fl = R.fl ? JSON.stringify(R.fl) : ''; return o; };
  const sDigest = () => JSON.stringify(S);
  const sParts = () => { const o = {}; for (const k of Object.keys(S)) o[k] = JSON.stringify(S[k]); return o; };
  /* After a move: what the move routed (a), routing again from the same state (b: on this checkout's page the kept
     tables are used), and routing from that state with the cache off (c: RC.on=false where there is an RC). b and c
     route from the same previous R; c's R is kept, as a plain compute would. */
  const check = () => {
    if (!S || pzOn() && !R) return { a: routing() };
    const a = routing(), prior = R, keep = UI.rkR === prior;
    compute(); const b = routing();
    R = prior; const rc = typeof RC !== 'undefined';
    if (rc) RC.on = false;
    try { compute(); } finally { if (rc) RC.on = true; }
    const c = routing();
    if (keep) UI.rkR = R;
    return { a, b, c };
  };
  window.__fz = { direct, lists, start, state, screen, press, close, poke, day, routing, parts, sDigest, sParts, check, errs, modalOpen };
})();

// Differential games (scripts/route-fuzz.js, tests/route-fuzz.test.js): two game pages in one process, a base page
// (main's) and this checkout's, play the same seeded game move for move. After every move and every day both must
// have routed identically (all of R, R.fl, R.ef, the PNI lists), and this checkout must route the same with the
// routing cache (RC) on and off. The whole game state S must match too, so the two games stay in lockstep.
// Every move is picked here, from what the base page offers right now, with the game's seed: the seed alone
// replays a game.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../../tests/harness');

const FUZZ_JS = fs.readFileSync(path.join(__dirname, 'fuzz-page.js'), 'utf8');

function openPage(file, label) {
  const g = load({ seed: 1, file });
  g.ev(FUZZ_JS);
  g.label = label;
  g.call = (fn, ...args) => {
    g.dom.window.__fzA = JSON.parse(JSON.stringify(args));
    const out = g.ev(`JSON.stringify(__fz.${fn}(...window.__fzA))`);
    return out === undefined ? undefined : JSON.parse(out);
  };
  return g;
}

// mulberry32: the driver's own numbers, apart from the pages' Math.random.
function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = (n) => Math.floor(f() * n);
  f.pick = (a) => a[f.int(a.length)];
  // A button by its action's weight (w), then any button of that action: 38 transit sellers count as one choice.
  f.wp = (a, w) => { const g = new Map(); for (const x of a) { const l = g.get(x.act); if (l) l.push(x); else g.set(x.act, [x]); }
    const ks = [...g.keys()]; let s = 0; for (const k of ks) s += w(g.get(k)[0]); let t = f() * s;
    for (const k of ks) { t -= w(g.get(k)[0]); if (t < 0) return f.pick(g.get(k)); } return f.pick(g.get(ks[ks.length - 1])); };
  f.w = (o) => { let s = 0; for (const k in o) s += o[k]; let x = f() * s; for (const k in o) { x -= o[k]; if (x < 0) return k; } return Object.keys(o)[0]; };
  return f;
}

// The first key of two {key: json} maps that differs, with a short look at where.
function firstDiff(A, B) {
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])];
  const out = [];
  for (const k of keys) {
    if (A[k] === B[k]) continue;
    const a = A[k] || '', b = B[k] || '';
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    out.push({ key: k, at: i, base: a.slice(Math.max(0, i - 80), i + 120), head: b.slice(Math.max(0, i - 80), i + 120) });
    if (out.length >= 4) break;
  }
  return out;
}

const DTABS = ['overview', 'cust', 'conn', 'traffic', 'infra', 'lease'];
const TABS = ['cust', 'up', 'peer', 'links'];
const LEFT = ['nets', 'noc', 'deals', 'goals'];
const PRESETS = ['freeze', 'oncall', 'bgp'];
// How often a button is pressed against the others on screen: what changes the network often, looking around rarely.
const BUILD = /^(buy\w*|pni\w*All|pni|peer|peerAll|unpeer|cache|cacheSite|rmCache|buildLink|buildPop|launchBB|accept|decline|dropBiz|pathMove|pathPin|pathAuto|takeLoan|repayLoan|lag[TPI]x?|setPref|setCarry|setStandby|setMetric|togglePrem|cleanPipe|sacrif|rs|foundIx|myIxUp|addRouter|rmRouter|upRouter|addSite|rmSite|siteSet|decomToggle|rmLink|upLink|addParallel|cancel\w*|upVxc|buyNni|rmNni|buildScrub|scrubUp|rmScrub|addGen|regen|addCh|rmCh|addPair|upSys|spares|layShip|crews|fixInc|seaPackage|subUpgrade|orderCable|orderDf|ownCab|opsHire|opsToggle|opsParam|opsCap|opsPop|opsTpl|opsNewPop|popStdSet|coreSet|teRecipe|dkOptOut|dkStay|utility\w*|listFiber|unlistFiber|leaseSwap|custGo|confGo|confSponsor|seatBuy|charter|cnPrem|applyCn|ad|ddosAuto|pz(Pop|RmPop|Link|AddPar|Tier|RmLink|RtAdd|RtRm|RtModel|Route|Via|Div)|setRoute|route|via|metricSet)$/;
const UIACT = /^(tab|dashTab|leftTab|\w*Sort|\w*Filter|pniGrp|trace\w*|focusCity|findGo|selLink|dashLink|logAll|tailTog|listMore|netFocus|netFilter|meetGo|phoneTab|dashClose|connF|connCity|connNet|connFor|custF|custCity|popGo|popsReg|opsOpen|decomOpen|linkCheck|pathOpen)$/;
const DW = { launchBB: 4, accept: 4, buyTransit: 3, pni: 3, buyIx: 3, setPref: 4, cache: 2, peerAll: 2, setCarry: 2, takeLoan: 2 };
const weight = (b) => (BUILD.test(b.act) ? 8 : UIACT.test(b.act) ? 0.3 : 1);

/* One game. pages: {base, head}. Returns {seed, start, moves, days, log, div} where div is the first divergence (or null).
   opts: moves (count, default 50 to 200 by seed), maxDays per day-move, onMove(i, move) */
function playGame(pages, seed, opts = {}) {
  const { base, head } = pages;
  // A badge only this checkout has would unlock in its game alone, and an unlock writes a log line, which shifts every
  // id made after it: the comparison is about routing, so the new badges are taken off this checkout's page.
  if (!pages.badges && base !== head) {
    const ids = base.ev('JSON.stringify(BADGES.map((b)=>b.id))');
    head.ev(`{const keep=new Set(${ids});for(let i=BADGES.length-1;i>=0;i--)if(!keep.has(BADGES[i].id))BADGES.splice(i,1);}`);
    pages.badges = true;
  }
  const r = rng(seed * 2654435761);
  const both = (fn, ...a) => [base.call(fn, ...a), head.call(fn, ...a)];
  const L = base.call('lists');
  const log = [], acts = {};
  let div = null, days = 0;
  const note = (m) => { log.push(m); };
  const fail = (where, info) => { if (!div) div = { seed, where, move: log.length, last: log.slice(-6), ...info }; };
  const same = (where, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(where, { base: a, head: b }); };

  // Compare everything: routing on both pages (a: the move's, b: again, c: cache off) and the game state.
  const compare = (where) => {
    const [x, y] = both('check');
    for (const k of ['a', 'b', 'c']) if (x[k] !== y[k]) { fail(where + ': routing (' + k + ') base vs head', { diff: firstDiff(base.call('parts'), head.call('parts')) }); return false; }
    if (y.b !== y.c) { fail(where + ': head cached vs uncached', { diff: 'R from the kept tables differs from a fresh route' }); return false; }
    // Fields only this checkout's game has are left out on both sides (see sKeys in fuzz-page.js), and so is the state of a
    // standing order only one of them has (one this checkout retired, or added).
    const [k1, k2] = both('sKeys'), drop = { top: k2.top.filter((k) => !k1.top.includes(k)), items: k2.items.filter((k) => !k1.items.includes(k)),
      ops: [...k1.ops.filter((k) => !k2.ops.includes(k)), ...k2.ops.filter((k) => !k1.ops.includes(k))] };
    const [s1, s2] = both('sDigest', drop);
    if (s1 !== s2) { fail(where + ': game state S', { diff: firstDiff(base.call('sParts', drop), head.call('sParts', drop)) }); return false; }
    return true;
  };

  // The start.
  const kind = opts.save ? 'save' : r.w({ normal: 44, sandbox: 14, scenario: 20, weekly: 3, puzzle: 11, architect: 8 });
  if (opts.save) for (const p of [base, head]) p.dom.window.__fzSave = opts.save;
  const home = r() < 0.4 ? r.pick(L.special) : r.pick(L.homes);
  const st = { kind, seed: (seed % 2147483646) + 1, name: 'Fuzz ' + seed, city: home,
    preset: kind === 'sandbox' ? r.pick(['none', 'calm', 'normal', 'spicy']) : r.pick(PRESETS),
    id: kind === 'scenario' ? r.pick(L.scn) : kind === 'puzzle' ? r.pick(L.pz) : kind === 'architect' ? r.pick(L.ar) : undefined };
  const [s0, s1] = both('start', st);
  same('start', s0, s1);
  note('start ' + JSON.stringify(st));
  // A normal game signs its charter first: a popup on newer pages (which seeded pages skip), a card on older ones. Both
  // sign the classic one at once, so neither shows charter buttons the other has not, and the game plays as it did.
  if (kind === 'normal') { const [c0, c1] = both('press', { act: 'charter', args: { k: 'global' } }); same('charter', c0, c1); }
  if (!div) compare('start');

  // A screen's buttons on both pages; the same list or a divergence.
  // Buttons for actions main's page does not have (a new feature's) are left out: the driver only presses what both have.
  // So are the switches and dials of a standing order this checkout retired (main's sheet still shows them), and a
  // dashboard tab main's page does not have yet.
  let baseActs = null, retired = null, baseTabs = null;
  const screen = (w) => { const [a0, b0] = both('screen', w); baseActs = baseActs || new Set(base.call('acts'));
    if (!retired) { const [o1, o2] = both('sKeys'); retired = new Set(o1.orders.filter((k) => !o2.orders.includes(k))); }
    const a = Array.isArray(a0) ? a0.filter((x) => !(/^ops/.test(x.act) && retired.has(x.args && x.args.k))) : a0;
    if (!baseTabs) baseTabs = new Set(JSON.parse(base.ev('JSON.stringify(DTABS)')));
    const b = Array.isArray(b0) ? b0.filter((x) => baseActs.has(x.act) && !(x.act === 'dashTab' && x.args && !baseTabs.has(x.args.k))) : b0; same('buttons of ' + JSON.stringify(w), a, b); return a || []; };
  const press = (b, where) => { acts[b.act] = (acts[b.act] || 0) + 1; const [e1, e2] = both('press', b); same('press ' + where, e1, e2); note(where + ' ' + b.act + JSON.stringify(b.args) + (e1 ? ' !' + e1 : '')); };
  // Answer whatever window opened, a few levels deep, then close it.
  const modal = (bias) => {
    for (let k = 0; k < 4 && !div; k++) {
      if (!base.call('modalOpen')) return;
      let bs = screen({ where: 'modal' });
      if (bias) { const pref = bs.filter((b) => bias.test(b.act)); if (pref.length && r() < 0.7) bs = pref; }
      const real = bs.filter((b) => !/^(closeModal|x)$/.test(b.act));
      if (!real.length || r() < 0.12) break;
      press(r.wp(real, weight), '  modal');
      if (!div) compare('modal button');
    }
    both('close');
  };

  const N = opts.moves || 50 + (seed % 151);
  for (let i = 0; i < N && !div; i++) {
    const s = base.call('state');
    if (s.lost) { note('bankrupt'); break; }
    const mv = r.w(s.puzzle ? { city: 40, openLink: 30, link: 15, modal: 5 } : { city: 22, direct: 22, openLink: 13, link: 5, dash: 5, left: 3, poke: 8, day: s.clock ? 20 : 0, build: 4 });
    if (opts.onMove) opts.onMove(i, mv);
    if (mv === 'city' || mv === 'build') {
      const city = mv === 'build' || !s.pops.length || r() < 0.3 ? (s.near.length ? r.pick(s.near) : r.pick(L.homes)) : r.pick(s.pops);
      const tab = r.pick(TABS);
      let bs = screen({ where: 'city', city, tab });
      if (mv === 'build') { const p = bs.filter((b) => /^(buildPop|launchBB|opsNewPop|popStdSet)$/.test(b.act)); if (p.length) bs = p; }
      if (bs.length) press(r.wp(bs, weight), `city ${city}/${tab}`);
      if (!div) compare('city button');
      modal();
    } else if (mv === 'openLink') {
      if (!s.pops.length) continue;
      const a = r.pick(s.pops), b = r() < 0.75 && s.near.length ? r.pick(s.near) : r() < 0.5 && s.pops.length > 1 ? r.pick(s.pops) : r.pick(L.homes);
      const bs = screen({ where: 'openLink', a, b });
      note(`openLink ${a}-${b} (${bs.length})`);
      if (bs.length) {
        // Pick a route or a kind first sometimes (dark fiber, subsea seat, own cable...), then build.
        const opt = bs.filter((x) => !/^(buildLink|closeModal)$/.test(x.act));
        if (opt.length && r() < 0.4) { press(r.pick(opt), '  link option'); if (!div) compare('link option'); }
        modal(/^(buildLink|pzLink|seaPackage|layShip|buyVxc|dfSys|seaDesign)$/);
      } else both('close');
      if (!div) compare('openLink');
    } else if (mv === 'link') {
      if (!s.links.length) continue;
      const id = r.pick(s.links);
      const bs = screen({ where: 'link', id });
      if (bs.length) press(r.wp(bs, weight), 'link ' + id);
      if (!div) compare('link button');
      modal();
    } else if (mv === 'dash' || mv === 'left') {
      const w = mv === 'dash' ? { where: 'dash', tab: r.pick(DTABS) } : { where: 'left', tab: r.pick(LEFT) };
      const bs = screen(w);
      if (bs.length) press(r.wp(bs, weight), mv + ' ' + w.tab);
      both('close');
      if (!div) compare(mv + ' button');
      modal();
    } else if (mv === 'direct') {
      const [a, b] = both('direct');
      same('direct calls', a, b);
      if (a.length) press(r.wp(a, (x) => DW[x.act] || (/^(cancel|rm|drop|unpeer)/.test(x.act) ? 0.4 : 1)), 'direct');
      if (!div) compare('direct');
      modal();
    } else if (mv === 'modal') {
      modal();
    } else if (mv === 'poke') {
      const k = r.w({ te: 3, teOff: 1, core: 2, fail: 2, event: 3, cash: 3, lvl: 2, ev: 4 });
      let p;
      if (k === 'te') { const rules = []; for (let j = 0, n = 1 + r.int(4); j < n; j++) rules.push([r.int(7), r.int(1000), r.int(1000)]); p = [k, rules, r() < 0.85]; }
      else p = [k, k === 'cash' ? r.int(3e7) : r.int(1e6), r.int(9)];
      const [e1, e2] = both('poke', p);
      same('poke', e1, e2);
      note('poke ' + JSON.stringify(p));
      if (!div) compare('poke ' + k);
    } else if (mv === 'day') {
      const n = 1 + r.int(opts.maxDays || 12);
      note('days ' + n);
      for (let d = 0; d < n && !div; d++) {
        const [e1, e2] = both('day');
        same('day', e1, e2);
        days++;
        if (!div) compare('day ' + d);
        // A window that opened over the day (an offer, a loan, a crisis) gets an answer.
        if (!div && base.call('modalOpen')) modal();
      }
    }
  }
  return { seed, start: st, moves: log.length, days, log, div, acts, errors: [...base.errors, ...head.errors] };
}

module.exports = { openPage, playGame, rng };

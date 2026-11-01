// Runs inside the game page (see scripts/lib/mcp-game.js), in the game's own global scope, so it reads S, R, NET,
// CITY… directly. Every function takes and returns plain JSON. It only reads the game, except act(), click(),
// panel(), advance() and the game loaders, which go through the same ACT actions and dayTick() the page uses.
(() => {
  const BLOCK = /^(DIV|P|H1|H2|H3|H4|SECTION|LI|UL|OL|TR|TABLE|NAV|HEADER|FOOTER|BUTTON|LABEL|DETAILS|SUMMARY)$/;
  // Text as a player would read it: one line per block, no runs of spaces. jsdom has no innerText.
  const text = (x, max = 8000) => {
    let el = x;
    if (typeof x === 'string') { el = document.createElement('div'); el.innerHTML = x; }
    if (!el) return '';
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1 || n.hidden || /^(SCRIPT|STYLE|SVG|CANVAS)$/i.test(n.tagName)) return;
      if (n.tagName === 'BR') { out.push('\n'); return; }
      // Blocks get their own line; inline tags a space, so "Revenue<b>$2k</b>" does not read as one word.
      const sep = BLOCK.test(n.tagName) ? '\n' : ' ';
      out.push(sep);
      for (const c of n.childNodes) walk(c);
      out.push(sep);
    };
    walk(el);
    const s = out.join('').split('\n').map((l) => l.replace(/\s+/g, ' ').replace(/ ([.,;:!?)])/g, '$1').replace(/\( /g, '(').trim()).filter(Boolean).join('\n');
    return s.length > max ? s.slice(0, max) + '\n…' : s;
  };
  const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);
  const fail = (msg) => { throw new Error(msg); };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  // ---------- finding things by id or by name ----------
  const best = (list, q, keys) => {
    const n = norm(q);
    if (!n) return null;
    for (const test of [(v) => v === n, (v) => v.startsWith(n), (v) => v.includes(n)]) {
      const hit = list.find((x) => keys(x).some((k) => test(norm(k))));
      if (hit) return hit;
    }
    return null;
  };
  const netOf = (q) => NET[q] || best(NETS, q, (n) => [n.id, n.name, 'as' + n.asn, String(n.asn)]) || fail(`No network matches "${q}". Try find.`);
  const cityOf = (q) => CITY[q] || best(CITIES, q, (c) => [c.id, c.name]) || fail(`No city matches "${q}". Try find.`);
  const allIx = () => {
    const o = [];
    for (const c of CITIES) for (const x of ixStatic(c.id)) o.push(x);
    for (const c of Object.keys(S.myIx || {})) if (!o.includes(c)) o.push(c);
    return o;
  };
  const ixOf = (q) => (XIXM[q] || (CITY[q] && CITY[q].ix) || (S.myIx && S.myIx[q]) ? q : best(allIx(), q, (x) => [x, ixName(x)])) || fail(`No exchange matches "${q}".`);
  const cityName = (c) => (CITY[c] ? CITY[c].name : c);
  const incText = (i) => text(i.msg || incTitle(i), 400);

  // ---------- toasts: what the game tells the player ----------
  let toasts = [];
  const t0 = toast;
  toast = function (h, kind) { toasts.push((kind ? kind + ': ' : '') + text(String(h), 600)); return t0.apply(this, arguments); };
  const takeToasts = () => { const t = toasts; toasts = []; return t; };

  // ---------- what is on screen ----------
  let last = [];
  const buttons = (root) => [...root.querySelectorAll('[data-act]')].map((b) => {
    let args = {};
    try { args = JSON.parse(b.dataset.args || '{}'); } catch (e) {}
    return { label: text(b, 200).replace(/\n/g, ' ') || b.getAttribute('aria-label') || b.dataset.act, act: b.dataset.act, args, disabled: !!b.disabled };
  });
  const screen = (where) => {
    const modal = !$('modal').hidden;
    if (modal && !where) {
      last = buttons($('modal'));
      return { where: 'modal', text: text($('modal')), buttons: last.map((b, i) => ({ n: i, ...b })) };
    }
    const p = where === 'left' ? $('leftBody') : $('panel');
    last = p ? buttons(p) : [];
    return { where: where === 'left' ? 'network list' : 'panel', modalOpen: modal, selected: UI.sel, tab: UI.tab, text: p ? text(p) : '', buttons: last.map((b, i) => ({ n: i, ...b })) };
  };

  // ---------- starting and loading ----------
  const settle = () => { UI.started = true; UI.pitched = true; UI.speed = 0; if (UI.pendGame) ACT.pitchSkip(); closeModal(); compute(); renderAll(); takeToasts(); };
  const newGame = ({ city = 'fra', name, preset = 'oncall', seed }) => {
    const c = cityOf(city).id;
    if (!homeOk(c)) fail(`${cityName(c)} cannot be a home city.`);
    if (!['freeze', 'oncall', 'bgp', 'sandbox'].includes(preset)) fail('preset is one of freeze, oncall, bgp, sandbox');
    if (seed !== undefined && window.__reseed) window.__reseed(Math.max(1, Math.floor(+seed) || 1));
    if (UI.pendGame) UI.pendGame = null;
    UI.pitched = true;
    const nm = String(name || randomNetworkName()).slice(0, 24);
    beginGame(nm, c, preset === 'sandbox' ? { mode: 'sandbox', rules: { chaos: 'none' } } : { mode: 'normal', preset });
    settle();
    return status();
  };
  const loadSave = (txt) => {
    const r = parseSave(txt);
    if (r.err) fail(text(r.err));
    S = migrate(JSON.parse(JSON.stringify(r.s)));
    settle();
    return { savedBy: r.ver, ...status() };
  };
  const exportSave = (version) => JSON.stringify({ app: 'series-of-tubes', version: /^\d/.test(APP_VERSION) ? APP_VERSION : version, exported: new Date().toISOString(), S: packSave(S) });

  // ---------- reading the network ----------
  const status = () => {
    const goal = GOALS.find((g) => S.done[g.id] === undefined);
    const t1 = isTier1();
    return {
      name: S.name, asn: S.asn, home: cityName(S.home), mode: S.mode, rules: S.rules && S.rules.preset,
      day: S.day, date: dateStr(S.day), cash: Math.round(S.cash), level: S.lvl || 0,
      tier: tierLabel(), whyNotTier1: t1 ? null : text(t1Why()),
      goal: goal ? { title: text(goal.t), what: text(goal.d) } : null,
      monthly: { revenue: Math.round(R.revMo), cost: Math.round(R.costMo), profit: Math.round(R.revMo - R.costMo),
        revenueBy: Object.fromEntries(Object.entries(R.rev || {}).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v)),
        costBy: Object.fromEntries(Object.entries(R.cost || {}).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v)) },
      traffic: { demandGbps: r1(R.demand), servedGbps: r1(R.served), reach: r1((R.reach || 0) * 100) + '%', peeringSessions: R.sessions },
      counts: { pops: Object.keys(S.pops).length, links: S.links.length, transitPorts: S.transit.length, exchangePorts: Object.keys(S.ixp).length,
        pnis: S.pni.length, cacheBoxes: S.caches.length, customers: S.biz.length, offers: S.offers.length },
      pops: Object.keys(S.pops).map(cityName),
      incidents: S.inc.map((i) => ({ id: i.id, type: i.type, what: incText(i), until: i.until !== undefined ? dateStr(i.until) : undefined, rushRepairCost: i.cost || undefined })),
      lost: !!S.lost, won: !!S.won,
    };
  };

  const network = (q) => {
    const n = netOf(q), id = n.id, eg = R.netEg && R.netEg[id];
    return {
      id, name: n.name, asn: n.asn, type: TYPE_L[n.type], policy: n.pol,
      requirements: { minIxGbps: n.minIx, minPniGbps: n.minPni, paidFeePerMonth: n.paidFee, freeFromLevel: n.freeLv },
      trafficShare: r1(NSH[id] * 100) + '%', transitPerGbps: n.price ? r1(n.price * S.priceMul) : null,
      homeMarkets: n.cc ? [].concat(n.cc) : [], pops: n.pops.map(cityName),
      exchanges: n.ix === 'ALL' ? 'most exchanges where it has a PoP' : (n.ix || []).map((x) => ixName(x)),
      upstreams: (n.up || []).map((u) => NET[u] ? NET[u].name : u), customerCone: (DOWN[id] || []).length,
      neededForTier1: t1Need().some((x) => x.id === id), mergedInto: merged(id) ? (MERGERS.find((m) => m.id === id) || {}).into : undefined,
      about: text(n.blurb),
      you: {
        reachable: !!(R.reachable && R.reachable[id]), demandGbps: r1((R.demTo && R.demTo[id]) || 0),
        egressGbps: eg ? Object.fromEntries(Object.entries(eg).map(([k, v]) => [k, r1(v)])) : null,
        pnis: S.pni.filter((p) => p.net === id).map((p) => ({ id: p.id, city: cityName(p.city), port: pniPN(p), count: p.n || 1, ready: pniOn(p) })),
        exchangeSessions: Object.keys(S.ixp).filter((x) => ixSessions(x).has(id)).map(ixName),
        howToPeer: text(offTransitHint(id, S.home)),
      },
    };
  };

  const city = (q) => {
    const C = cityOf(q), c = C.id, P = S.pops[c];
    const cab = CABLE_PAIRS.filter((p) => p.a === c || p.b === c).map((p) => ({ cable: CAB[p.cid] ? CAB[p.cid].name : p.cid, to: cityName(p.a === c ? p.b : p.a), km: p.km }));
    const here = NETS.filter((n) => n.pops.includes(c) && !n.tail).sort((a, b) => b.share - a.share);
    return {
      id: c, name: C.name, country: C.cc, region: C.reg, about: C.note ? text(C.note) : undefined, dataCenter: C.dc,
      canBeHome: homeOk(c),
      exchanges: ixIdsIn(c).map((x) => ({ id: x, name: ixName(x), members: ixMembers(x).length, yourPort: S.ixp[x] !== undefined })),
      transit: NETS.filter((n) => sellsAt(n, c)).map((n) => ({ id: n.id, name: n.name, type: TYPE_L[n.type], perGbps: r1(transitPerG(n, c, false) * S.priceMul) })).sort((a, b) => a.perGbps - b.perGbps),
      networksHere: here.length, biggestNetworksHere: here.slice(0, 15).map((n) => n.name), cables: cab,
      you: P ? { demandGbps: r1((R.cityDem || {})[c] || 0), servedGbps: r1((R.citySrv || {})[c] || 0), routers: P.routers, down: P.down > S.day ? dateStr(P.down) : false,
        broadband: !!P.bb, links: S.links.filter((l) => l.a === c || l.b === c).length } : null,
    };
  };

  const find = (q, kind) => {
    const n = norm(q), hit = (...k) => k.some((v) => norm(v).includes(n)), out = {};
    if (!n) fail('Give a word to search for.');
    if (!kind || kind === 'city') out.cities = CITIES.filter((c) => hit(c.id, c.name)).slice(0, 20).map((c) => ({ id: c.id, name: c.name, country: c.cc }));
    if (!kind || kind === 'network') out.networks = NETS.filter((x) => hit(x.id, x.name, String(x.asn))).slice(0, 20).map((x) => ({ id: x.id, name: x.name, asn: x.asn, type: TYPE_L[x.type] }));
    if (!kind || kind === 'cable') out.cables = Object.values(CAB).filter((x) => hit(x.id, x.name)).slice(0, 20).map((x) => ({ id: x.id, name: x.name, lands: [...new Set(x.pairs.flatMap((p) => [p[0], p[1]]))].map(cityName) }));
    if (!kind || kind === 'exchange') out.exchanges = allIx().filter((x) => hit(x, ixName(x))).slice(0, 20).map((x) => ({ id: x, name: ixName(x), city: cityName(ixCity(x)) }));
    return out;
  };

  const trace = (from, to) => {
    const src = cityOf(from).id;
    if (!S.pops[src]) fail(`You have no POP in ${cityName(src)}. Yours: ${Object.keys(S.pops).map(cityName).join(', ')}.`);
    let target = null;
    if (typeof to === 'string' && /^city:/i.test(to)) target = { city: cityOf(to.slice(5)).id };
    else { try { target = { net: netOf(to).id }; } catch (e) { target = { city: cityOf(to).id }; } }
    if (target.city && !S.pops[target.city]) fail(`A traceroute to a city goes to one of your POPs: ${Object.keys(S.pops).map(cityName).join(', ')}.`);
    const r = traceroute(src, target);
    return { text: r.text, why: text(r.why || ''), asPath: r.asPath || null };
  };

  const peering = (q, where, via) => {
    const n = netOf(q), id = n.id, out = [];
    if (!via || via === 'pni') for (const c of (where ? [cityOf(where).id] : Object.keys(S.pops).filter((c) => n.pops.includes(c)))) {
      const r = peerOk(id, 'pni', c);
      out.push({ via: 'pni', city: cityName(c), ok: !!r.ok, why: r.why ? text(r.why) : undefined, feePerMonth: r.fee, free: r.free, minimumPort: PORT[pniMin(id)].n });
    }
    if (!via || via === 'ix') for (const x of Object.keys(S.ixp).filter((x) => ixMembers(x).includes(id) && (!where || ixCity(x) === cityOf(where).id))) {
      const r = peerOk(id, 'ix', x);
      out.push({ via: 'ix', exchange: ixName(x), ok: !!r.ok, why: r.why ? text(r.why) : undefined, session: ixSessions(x).has(id) });
    }
    return { network: n.name, policy: n.pol, hint: text(offTransitHint(id, where ? cityOf(where).id : S.home)),
      checks: out, note: out.length ? undefined : 'No POP or exchange port of yours is where this network is. Build one first: see network.' };
  };

  const hotSpots = (limit = 10) => {
    const top = (a) => a.sort((x, y) => y.util - x.util).slice(0, limit);
    const pct = (u, c) => (c > 0 ? r1((u / c) * 100) : null);
    const links = S.links.map((l) => { const cap = capOf(l), u = (R.load || {})[l.id] || 0; return { id: l.id, between: cityName(l.a) + ' – ' + cityName(l.b), kind: l.kind, capacity: capName(l), usedGbps: r1(u), util: pct(u, cap), down: linkDown(l) }; });
    const transit = S.transit.map((t) => { const cap = lagCap(PORT[t.tier].g, t.n), u = (R.useT || {})[t.id] || 0, q = (R.p95 && R.p95[t.id]) || u;
      return { id: t.id, city: cityName(t.city), carrier: NET[t.net].name, port: lagName(t.tier, t.n), usedGbps: r1(u), util: pct(u, cap), billPerMonth: Math.round(transitMo(t, q)) }; });
    const pnis = S.pni.filter(pniOn).map((p) => { const cap = pniG(p) * (p.n || 1), u = (R.usePni || {})[p.id] || 0; return { id: p.id, network: NET[p.net].name, city: cityName(p.city), port: pniPN(p), usedGbps: r1(u), util: pct(u, cap) }; });
    const viaTransit = NETS.filter((n) => R.netEg && R.netEg[n.id] && R.netEg[n.id].t > 0.05).sort((a, b) => R.netEg[b.id].t - R.netEg[a.id].t).slice(0, limit)
      .map((n) => ({ id: n.id, network: n.name, overTransitGbps: r1(R.netEg[n.id].t), howToPeer: text(offTransitHint(n.id, S.home)) }));
    const bill = {};
    for (const t of transit) bill[t.carrier] = (bill[t.carrier] || 0) + t.billPerMonth;
    return { links: top(links), transitPorts: top(transit), pnis: top(pnis), transitBillByCarrier: bill, biggestTrafficStillOnTransit: viaTransit };
  };

  // ---------- doing things ----------
  // Actions the server never runs: files, storage slots, settings and the title screen are not the game's, and time
  // only moves through advance.
  const DENY = new Set(['animSet', 'cont', 'exportSave', 'importGo', 'importPick', 'install', 'langSet', 'menu', 'mute', 'newgame', 'phonePlay', 'phoneSpeed',
    'prefSet', 'pzShare', 'resetAsk', 'settings', 'settingsClose', 'share', 'shareDl', 'shareGo', 'slotBack', 'slotDel', 'slotDelGo', 'slotExport', 'slotMenu',
    'slotRetry', 'slotSpace', 'slotSwitch', 'slotTake', 'soundSet', 'speed', 'start', 'toTitle', 'traceCopy', 'updateLater', 'updateNow', 'vpSet', 'wsShare']);
  const run = (name, args) => {
    if (DENY.has(name)) fail(`${name} is not available here${name === 'speed' ? ': use advance to move time' : name === 'start' || name === 'newgame' ? ': use new_game' : ''}.`);
    const fn = ACT[name];
    if (typeof fn !== 'function') fail(`There is no action "${name}". See the actions list.`);
    takeToasts();
    const cash = S.cash;
    fn(args && typeof args === 'object' ? args : {});
    return { toasts: takeToasts(), cashChange: Math.round(S.cash - cash), screen: screen() };
  };
  const click = (n) => {
    const b = last[n];
    if (!b) fail(`No button ${n} on the last screen. Call screen first.`);
    if (b.disabled) fail(`"${b.label}" is greyed out.`);
    return { clicked: b.label, ...run(b.act, b.args) };
  };
  const panel = ({ city: c, link, network: q, tab }) => {
    if (c) UI.sel = { type: 'city', id: cityOf(c).id };
    else if (link) { if (!S.links.some((l) => l.id === link)) fail(`No link ${link}. See status or hot_spots for link ids.`); UI.sel = { type: 'link', id: link }; }
    else if (q) ACT.netFocus({ id: netOf(q).id });
    if (tab) UI.tab = tab;
    renderAll();
    return screen(q ? 'left' : 'panel');
  };
  const openLink = (a, b) => {
    const x = cityOf(a).id, y = cityOf(b).id;
    if (!S.pops[x]) fail(`A link starts at one of your POPs: ${Object.keys(S.pops).map(cityName).join(', ')}.`);
    takeToasts();
    openLinkModal(x, y);
    return { toasts: takeToasts(), screen: screen() };
  };
  const actions = () => Object.keys(ACT).filter((k) => !DENY.has(k)).sort();

  // ---------- time ----------
  const advance = (days = 1) => {
    days = Math.max(1, Math.min(3650, Math.floor(+days) || 1));
    if (!$('modal').hidden) fail('A window is open. Answer it first (screen, click), the game does not run days behind it.');
    const start = S.day, cash = S.cash, inc0 = new Set(S.inc.map((i) => i.id)), times = [];
    takeToasts();
    let ran = 0, stop = null;
    while (ran < days) {
      if (S.lost) { stop = 'bankrupt'; break; }
      const t = performance.now();
      dayTick();
      times.push({ day: S.day, ms: r1(performance.now() - t) });
      ran++;
      if (!$('modal').hidden) { stop = 'a window opened'; break; }
    }
    renderAll();
    // The log keeps what mattered; toasts that only repeat a log line are left out.
    const entries = (S.log || []).filter((e) => e.d > start).slice(-60), logged = entries.map((e) => norm(text(e.t, 400)));
    const log = entries.map((e) => `${dateStr(e.d)}: ${text(e.t, 400)}`);
    const total = times.reduce((a, x) => a + x.ms, 0);
    return {
      from: dateStr(start), to: dateStr(S.day), daysRun: ran, stoppedBecause: stop, cash: Math.round(S.cash), cashChange: Math.round(S.cash - cash),
      newIncidents: S.inc.filter((i) => !inc0.has(i.id)).map(incText),
      log, toasts: [...new Set(takeToasts())].filter((t) => { const f = norm(t.replace(/^\w+: /, '').split('\n')[0]); return !logged.some((l) => l.startsWith(f)); }).slice(-40),
      timing: { totalMs: r1(total), perDayMs: r1(total / (ran || 1)), slowestDays: times.slice().sort((a, b) => b.ms - a.ms).slice(0, 5).map((x) => ({ date: dateStr(x.day), ms: x.ms })) },
      screen: stop === 'a window opened' ? screen() : undefined,
    };
  };

  window.__mcp = { newGame, loadSave, exportSave, status, network, city, find, trace, peering, hotSpots, run, click, panel, openLink, actions, advance, screen };
})();

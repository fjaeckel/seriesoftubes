// Runs inside the game page (see scripts/lib/mcp-game.js), in the game's own global scope, so it reads S, R, NET,
// CITY… directly. Every function takes and returns plain JSON. It only reads the game, except run(), click(),
// panel(), advance() and the game loaders, which go through the same ACT actions and dayTick() the page uses.
// The command tables run() checks arguments against come from scripts/lib/mcp-commands.js, evaluated first.
(() => {
  const { API_DOMAINS, API_CMD, API_VIEW, API_BOUND, API_SESSION, API_STATE_DOC, API_RESULTS_DOC, API_TABLES, API_MADE,
    API_UI_HIDDEN, apiDomCheck, apiDomValues, apiPath, apiJson } = window.__mcpCmds;
  const BLOCK = /^(DIV|P|H1|H2|H3|H4|SECTION|LI|UL|OL|TR|TABLE|NAV|HEADER|FOOTER|BUTTON|LABEL|DETAILS|SUMMARY)$/;
  const MAX_TEXT = 8000;
  // Text as a player would read it: one line per block, no runs of spaces. jsdom has no innerText.
  const fullText = (x) => {
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
    return out.join('').split('\n').map((l) => l.replace(/\s+/g, ' ').replace(/ ([.,;:!?)])/g, '$1').replace(/\( /g, '(').trim()).filter(Boolean).join('\n');
  };
  const text = (x, max = MAX_TEXT) => { const s = fullText(x); return s.length > max ? s.slice(0, max) + '\n…' : s; };
  const r1 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : v);
  const fail = (msg) => { throw new Error(msg); };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const parse = (s) => { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } };

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
  const cityName = (c) => (CITY[c] ? CITY[c].name : c);
  const incText = (i) => text(i.msg || incTitle(i), 400);

  // ---------- toasts: what the game tells the player ----------
  let toasts = [];
  const t0 = toast;
  toast = function (h, kind) { toasts.push({ kind: kind || '', text: text(String(h), 600) }); return t0.apply(this, arguments); };
  const takeToasts = () => { const t = toasts; toasts = []; return t; };
  const toastLines = (t) => t.map((x) => (x.kind ? x.kind + ': ' : '') + x.text);

  // ---------- what is on screen ----------
  // The surfaces a player can read, by the name screen() takes. The left drawer has tabs (goals, deals, noc, nets).
  const ROOT = { modal: 'modal', bank: 'bankBox', dash: 'dash', panel: 'panel', left: 'leftBody', puzzle: 'pzBox' };
  const shown = (w) => { const el = $(ROOT[w]); return !!el && !el.hidden; };
  const modalOpen = () => shown('modal');
  let last = [];
  const controls = (root) => {
    const out = [];
    for (const b of root.querySelectorAll('[data-act],select[data-chg]')) {
      if (b.dataset.act) out.push({ label: text(b, 200).replace(/\n/g, ' ') || b.getAttribute('aria-label') || b.dataset.act, act: b.dataset.act, args: parse(b.dataset.args), disabled: !!b.disabled });
      // A list the game acts on when its value changes (the change handler in src/game/96-map/95-clicks.js): click
      // it with a value.
      else out.push({ label: b.getAttribute('aria-label') || (b.closest('label') && text(b.closest('label'), 120).split('\n')[0]) || b.dataset.chg,
        select: b.dataset.chg, value: b.value, options: [...b.options].map((o) => ({ value: o.value, label: o.textContent.trim() })), disabled: !!b.disabled });
    }
    return out;
  };
  const screen = (where, offset = 0) => {
    if (where === null) where = undefined;
    if (where !== undefined && !ROOT[where]) fail(`where is one of ${Object.keys(ROOT).join(', ')}.`);
    const open = Object.keys(ROOT).filter((w) => w !== 'left' && shown(w));
    const w = where || ['modal', 'bank', 'dash', 'panel', 'puzzle'].find(shown) || 'panel';
    const root = $(ROOT[w]);
    last = root ? controls(root) : [];
    const all = root ? fullText(root) : '', from = Math.max(0, Math.floor(+offset) || 0), more = all.length - from - MAX_TEXT;
    const out = { where: w, open, selected: UI.sel, tab: UI.tab };
    if (w === 'left') out.leftTab = UI.left || 'goals';
    if (w === 'modal') { const d = decision(); out.question = !!d; }
    out.text = all.slice(from, from + MAX_TEXT);
    if (from) out.textFrom = from;
    if (more > 0) out.textMore = `${more} more characters: call screen with where "${w}" and offset ${from + MAX_TEXT}`;
    out.buttons = last.map((b, i) => ({ n: i, ...b }));
    return out;
  };

  // ---------- windows: the agent's own sheets, and the game's questions ----------
  // A window the agent opened itself (a view, a draft, the link window, a sheet it clicked inside) is something to read
  // and click through. A window the game opened in answer to a game command, or during a day, is a question when one
  // of its buttons runs a game command other than closeModal (a De-Kicks quote, a retention offer); then other game
  // commands wait until it is answered or closed, as clicks outside an open window do in the game.
  let sheet = null;
  const card = () => $('modalCard').firstChild;
  const markSheet = () => { sheet = modalOpen() ? card() : null; };
  const isSheet = () => modalOpen() && !!sheet && card() === sheet;
  const decision = () => {
    if (!modalOpen() || isSheet()) return null;
    const b = [...$('modal').querySelectorAll('[data-act]')].filter((x) => x.dataset.act !== 'closeModal' && API_CMD[x.dataset.act]);
    if (!b.length) return null;
    return { text: text($('modal'), 1500), options: b.map((x) => ({ command: x.dataset.act, args: parse(x.dataset.args), label: text(x, 120).replace(/\n/g, ' ') })) };
  };

  // ---------- starting and loading ----------
  const settle = () => { UI.started = true; UI.pitched = true; UI.speed = 0; if (UI.pendGame) ACT.pitchSkip(); closeModal(); sheet = null; compute(); renderAll(); takeToasts(); };
  const newGame = ({ city = 'fra', name, preset = 'oncall', seed, asn, chaos }) => {
    const c = cityOf(city).id;
    if (!homeOk(c)) fail(`${cityName(c)} cannot be a home city.`);
    if (!['soft', 'freeze', 'oncall', 'bgp', 'sandbox'].includes(preset)) fail('preset is one of soft, freeze, oncall, bgp, sandbox');
    if (asn !== undefined && !asnOk(+asn)) fail(`AS${asn} cannot be yours: it is reserved, private or another network's. Leave asn out for a free one.`);
    if (chaos !== undefined && preset !== 'sandbox') fail('chaos is the sandbox\'s dial: give preset "sandbox" with it.');
    if (chaos !== undefined && !own(CHAOS, chaos)) fail(`chaos is one of ${Object.keys(CHAOS).join(', ')}.`);
    if (seed !== undefined && window.__reseed) window.__reseed(Math.max(1, Math.floor(+seed) || 1));
    if (UI.pendGame) UI.pendGame = null;
    UI.pitched = true;
    const nm = String(name || randomNetworkName()).slice(0, 24), was = UI.asnTxt;
    // beginGame takes the ASN typed on the title screen.
    UI.asnTxt = asn !== undefined ? String(+asn) : '';
    try { beginGame(nm, c, preset === 'sandbox' ? { mode: 'sandbox', rules: { chaos: chaos || 'none' } } : { mode: 'normal', preset }); } finally { UI.asnTxt = was; }
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

  // ---------- the contract: commands, arguments, reference tables, raw state ----------
  // Actions the server never runs: files, storage slots, settings and the title screen are not the game's, and time
  // only moves through advance.
  const WHY = {
    time: 'use advance to move time', start: 'use new_game', files: 'use load_save or export_save',
    slots: 'saved networks in browser storage are not part of this game', prefs: 'device and player settings are not part of the game',
    browser: 'it needs the browser itself (a share sheet, the clipboard, an install prompt or a reload)',
  };
  const DENY_WHY = {
    speed: 'time', phonePlay: 'time', phoneSpeed: 'time',
    start: 'start', newgame: 'start', cont: 'start', toTitle: 'start', resetAsk: 'start',
    exportSave: 'files', importGo: 'files', importPick: 'files', slotExport: 'files',
    slotBack: 'slots', slotDel: 'slots', slotDelGo: 'slots', slotMenu: 'slots', slotRetry: 'slots', slotSpace: 'slots', slotSwitch: 'slots', slotTake: 'slots',
    animSet: 'prefs', langSet: 'prefs', menu: 'prefs', mute: 'prefs', prefSet: 'prefs', settings: 'prefs', settingsClose: 'prefs', soundSet: 'prefs', vpSet: 'prefs',
    install: 'browser', share: 'browser', shareDl: 'browser', shareGo: 'browser', traceCopy: 'browser', updateLater: 'browser', updateNow: 'browser', wsShare: 'browser', pzShare: 'browser',
  };
  const denied = (name) => (Object.prototype.hasOwnProperty.call(DENY_WHY, name) ? WHY[DENY_WHY[name]] : null);
  const kindOf = (name) => (API_CMD[name] ? 'game' : API_VIEW[name] ? 'view' : API_BOUND[name] ? 'draft' : API_SESSION[name] ? 'session' : null);
  const specOf = (name) => API_CMD[name] || API_VIEW[name] || API_SESSION[name] || null;
  const classes = () => ({ game: Object.keys(API_CMD), view: Object.keys(API_VIEW), draft: Object.keys(API_BOUND), session: Object.keys(API_SESSION), denied: Object.keys(DENY_WHY) });

  // One argument as the schema states it. Table domains name their catalog table rather than list every id.
  const argDoc = ([name, dom, req]) => {
    const a = { name, required: req !== false }, d = API_DOMAINS[dom];
    if (!d) { a.type = dom; return a; }
    a.domain = dom;
    if (d.table) a.from = d.table;
    else { const v = apiDomValues(dom); if (Array.isArray(v)) a.values = v; else if (v && v.from !== undefined) a.range = v; }
    return a;
  };
  const schema = (section) => {
    const cmd = (s) => ({ args: (s.args || []).map(argDoc), doc: s.doc });
    const doc = {
      clock: 'Time moves only with advance: one dayTick() per simulated day, as the game loop runs it. Nothing runs between calls.',
      commands: Object.fromEntries(Object.entries(API_CMD).map(([n, s]) => [n, { ...cmd(s), dryRun: !!s.quote,
        ...(s.decides ? { decides: true } : {}), ...(s.confirm ? { confirm: s.confirm } : {}), ...(s.open ? { opens: s.open } : {}), ...(s.reads ? { report: true } : {}) }])),
      view: Object.fromEntries(Object.entries(API_VIEW).map(([n, s]) => [n, cmd(s)])),
      session: Object.fromEntries(Object.entries(API_SESSION).map(([n, s]) => [n, cmd(s)])),
      drafts: API_BOUND,
      denied: Object.fromEntries(Object.keys(DENY_WHY).sort().map((n) => [n, denied(n)])),
      domains: Object.fromEntries(Object.entries(API_DOMAINS).map(([n, d]) => { const v = apiDomValues(n);
        return [n, { kind: d.kind === 'fn' ? 'custom' : d.kind, ...(d.table ? { from: d.table } : {}),
          ...(!d.table && Array.isArray(v) ? { values: v } : v && v.from !== undefined ? { range: v } : v && v.of ? { of: v.of } : {}) }]; })),
      state: API_STATE_DOC, results: API_RESULTS_DOC,
    };
    if (section === undefined || section === null || section === '') return doc;
    if (!(section in doc)) fail(`No section "${section}". Sections: ${Object.keys(doc).join(', ')}.`);
    return doc[section];
  };
  const catalog = (name) => {
    if (name === undefined || name === null || name === '') {
      return { tables: [...Object.keys(API_TABLES), ...Object.keys(API_MADE)].sort().map((k) => { const t = k in API_MADE ? API_MADE[k]() : API_TABLES[k];
        return { name: k, n: Array.isArray(t) ? t.length : t && typeof t === 'object' ? Object.keys(t).length : 1 }; }) };
    }
    if (name in API_MADE) return apiJson(API_MADE[name]());
    if (name in API_TABLES) return apiJson(API_TABLES[name]);
    fail(`No table "${name}". Call catalog without a name for the list.`);
  };
  const state = (path) => { if (!S) return null; const v = apiJson(apiPath(S, path)); return v === undefined ? null : v; };
  const results = (path) => { const v = apiJson(apiPath(R, path)); return v === undefined ? null : v; };
  const ui = () => { const o = {}; for (const k of Object.keys(UI)) if (!API_UI_HIDDEN[k]) o[k] = apiJson(UI[k]); return o; };
  const actions = () => {
    const sig = (s) => (s.args || []).map((a) => a[0] + (a[2] === false ? '?' : '')).join(',');
    const typed = {};
    for (const t of [API_CMD, API_VIEW, API_SESSION]) for (const [n, s] of Object.entries(t)) typed[n] = sig(s);
    return { typed, drafts: Object.keys(API_BOUND) };
  };

  // ---------- doing things ----------
  // Arguments: shape and domain only. Anything beyond that is the game's to answer.
  const validate = (spec, args) => {
    const problems = [], out = {};
    for (const [name, dom, req] of spec.args || []) {
      const v = args[name];
      if (v === undefined) { if (req !== false) problems.push(`${name} is required`); continue; }
      if (apiDomCheck(dom, v).ok) { out[name] = v; continue; }
      const vs = apiDomValues(dom), d = API_DOMAINS[dom];
      problems.push(`${name}: ${JSON.stringify(v)} is not a ${dom}${d && d.table && d.kind === 'id' ? ` (see catalog ${d.table} or find)` : Array.isArray(vs) ? ` (one of ${vs.slice(0, 12).join(', ')}${vs.length > 12 ? '…' : ''})` : vs && typeof vs === 'object' && vs.from !== undefined ? ` (${vs.from}..${vs.to})` : ''}`);
    }
    for (const k of Object.keys(args)) if (!(spec.args || []).some((a) => a[0] === k)) problems.push(`${k} is not an argument of this action`);
    return { ok: !problems.length, problems, args: out };
  };
  // The fingerprint tells "did nothing" from "did something quietly": cash, day, the entity counts, the small
  // settings maps, and the paths a command declares in watch. R is left out: it is rebuilt after every action.
  const FP_LEN = ['links', 'transit', 'pni', 'caches', 'biz', 'offers', 'nni', 'loans', 'loanOffers', 'inc', 'scrubs'];
  const FP_KEYS = ['pops', 'ixp', 'peers', 'myIx', 'done', 'ach', 'merged', 'confReg'];
  const FP_JSON = ['name', 'pairMet', 'rs', 'ixn', 'ixSite', 'ixPref', 'spares', 'te', 'cnLic', 'hw', 'scrubMode', 'ppol', 'ops', 'core', 'ddosAuto', 'popStd', 'demo', 'charter', 'monkey', 'seatOff', 'pz', 'ar', 'dk', 'ev'];
  const fp = (watch, args) => {
    if (!S) return null;
    const f = { cash: S.cash, day: S.day, lvl: S.lvl || 1, won: !!S.won, lost: !!S.lost };
    for (const k of FP_LEN) f[k] = (S[k] || []).length;
    for (const k of FP_KEYS) f[k] = Object.keys(S[k] || {}).length;
    for (const k of FP_JSON) f[k] = JSON.stringify(apiJson(S[k]) ?? null);
    for (const p of watch || []) f['@' + p] = JSON.stringify(apiJson(apiPath(S, String(p).replace(/#(\w+)/g, (m, k) => (args && args[k] !== undefined ? args[k] : m)))) ?? null);
    return JSON.stringify(f);
  };
  // spend() is the game's money gate and a top-level function, so every action reaches it by its global name.
  const meter = () => { const real = window.spend; let paid = 0; window.spend = (c) => { const ok = real(c); if (ok) paid += c; return ok; }; return () => { window.spend = real; return paid; }; };

  // One action, run as the game runs it, and reported: what the game said (toasts), what it charged at the money gate
  // (goal rewards that land in the same call are not a price), whether anything changed, and what is on screen now.
  // typed: through the command table (bind the UI, type into fields, pass the confirmation); otherwise as a button
  // click does it, with the button's own arguments.
  const dispatch = (name, kind, spec, args, typed) => {
    const mine = isSheet() || (typed && kind === 'game' && !!spec.open);
    takeToasts();
    const ref = S, cash = S ? S.cash : 0, f0 = fp(spec && spec.watch, args), paid = meter();
    let threw = null, report;
    try {
      if (typed && kind === 'game') {
        if (spec.open) { ACT[spec.open]({}); markSheet(); }
        // The custom metric's field lives in the link's panel.
        if (name === 'metricSet' && !$('metIn')) { UI.sel = { type: 'link', id: args.id }; renderAll(); }
        const gone = (spec.dom || []).filter((f) => !$(f));
        if (gone.length) throw new Error(`the field it types into (${gone.join(', ')}) is not on screen${name === 'metricSet' ? ': set the link\'s metric to custom first (setMetric v "custom")' : ''}`);
        if (spec.bind) spec.bind(args);
        const a = spec.pass ? spec.pass(args) : args;
        ACT[name](a);
        if (spec.confirm === 'double') ACT[name](a);
        if (spec.reads === 'modal' && modalOpen()) { report = text($('modal')); closeModal(); }
      } else ACT[name](args);
    } catch (e) { threw = e; }
    const charged = paid();
    if (threw) { takeToasts(); fail(`${name} failed: ${threw && threw.message || threw}`); }
    if (!modalOpen()) sheet = null;
    else if (mine || kind !== 'game') markSheet();
    else sheet = null;
    const said = takeToasts(), d = decision();
    const outcome = d ? 'decision' : S !== ref || fp(spec && spec.watch, args) !== f0 || report !== undefined ? 'applied'
      : said.some((t) => t.kind === 'bad') ? 'rejected' : kind === 'view' || kind === 'draft' ? 'shown' : 'no_effect';
    return { action: name, outcome, toasts: toastLines(said), charged, cashChange: Math.round((S ? S.cash : 0) - cash),
      ...(report !== undefined ? { report } : {}), ...(d ? { decision: d } : {}), screen: screen() };
  };
  // While the game waits for an answer, game commands other than its options report the question instead.
  const waiting = (name) => {
    const d = decision();
    return d && name !== 'closeModal' && !d.options.some((o) => o.command === name)
      ? { action: name, outcome: 'decision', reason: 'A window is waiting for an answer: run one of its options, or closeModal.', decision: d, screen: screen() } : null;
  };
  const quote = (name, spec, args) => {
    const ui0 = {};
    for (const k of spec.bindsUI || []) ui0[k] = UI[k];
    const f0 = fp(spec.watch, args);
    // A dry run must not use up the dice: some helpers draw (a PNI's lead time), and a draw here would move the seeded
    // game. They get the middle of the range instead, so a drawn figure in a quote is a typical one.
    const dice = Math.random;
    Math.random = () => 0.5;
    let q = {};
    try {
      if (spec.bind && !spec.dom) spec.bind(args);
      if (spec.quote) q = spec.quote(args) || {};
    } catch (e) { fail(`${name}: the price could not be worked out: ${e && e.message || e}`); } finally { Math.random = dice; for (const k of Object.keys(ui0)) UI[k] = ui0[k]; }
    return { action: name, outcome: 'quote', quote: { setup: 0, monthly: 0, ...q, blocked: (q.blocked || []).map((b) => text(String(b), 400)) }, consistent: fp(spec.watch, args) === f0,
      ...(spec.quote ? {} : { note: 'This command has no price of its own: it costs nothing up front.' }) };
  };
  const run = (name, args, opts = {}) => {
    name = String(name || '');
    if (name.startsWith('view.')) name = name.slice(5);
    const no = denied(name);
    if (no) fail(`${name} is not available here: ${no}.`);
    const kind = kindOf(name);
    if (!kind || typeof ACT[name] !== 'function') fail(`There is no action "${name}". See actions or schema.`);
    args = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const spec = specOf(name);
    if (spec) { const v = validate(spec, args); if (!v.ok) fail(`${name}: ${v.problems.join('; ')}. See schema for its arguments.`); args = v.args; }
    if (kind === 'game') {
      if (S && S.lost && name !== 'closeModal') return { action: name, outcome: 'stopped', reason: 'The network went bankrupt: start or load another game.' };
      const w = waiting(name);
      if (w) return w;
      if (opts.dryRun) return quote(name, spec, args);
    } else if (opts.dryRun) fail(`${name} has no price: only game commands (see schema commands) dry-run.`);
    return dispatch(name, kind, spec, args, true);
  };
  const click = (n, value) => {
    const b = last[n];
    if (!b) fail(`No button ${n} on the last screen. Call screen first.`);
    if (b.disabled) fail(`"${b.label}" is greyed out.`);
    const name = b.select || b.act, args = b.select ? { v: value === undefined ? undefined : String(value) } : b.args;
    if (b.select && !b.options.some((o) => o.value === args.v)) fail(`"${b.label}" is a list: click it with a value, one of ${b.options.map((o) => JSON.stringify(o.value)).join(', ')}.`);
    const no = denied(name);
    if (no) fail(`${name} is not available here: ${no}.`);
    const kind = kindOf(name);
    if (!kind || typeof ACT[name] !== 'function') fail(`"${b.label}" runs ${name}, which is not an action.`);
    if (kind === 'game') { const w = waiting(name); if (w) return { clicked: b.label, ...w }; }
    return { clicked: b.label, ...dispatch(name, kind, specOf(name), args, false) };
  };
  const panel = ({ city: c, link, network: q, tab, left }) => {
    if (left !== undefined) { if (!['goals', 'deals', 'noc', 'nets'].includes(left)) fail('left is one of goals, deals, noc, nets.'); ACT.leftTab({ t: left }); return screen('left'); }
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
    markSheet();
    return { toasts: toastLines(takeToasts()), screen: screen() };
  };

  // ---------- time ----------
  const advance = (days = 1) => {
    days = Math.max(1, Math.min(3650, Math.floor(+days) || 1));
    if (modalOpen()) fail('A window is open. Answer it first (screen, click, or act closeModal), the game does not run days behind it.');
    sheet = null;
    const start = S.day, cash = S.cash, inc0 = new Set(S.inc.map((i) => i.id)), times = [];
    takeToasts();
    let ran = 0, stop = null;
    while (ran < days) {
      if (S.lost) { stop = 'bankrupt'; break; }
      const t = performance.now();
      dayTick();
      times.push({ day: S.day, ms: r1(performance.now() - t) });
      ran++;
      if (modalOpen()) { stop = 'a window opened'; break; }
    }
    renderAll();
    // The log keeps what mattered; toasts that only repeat a log line are left out.
    const entries = (S.log || []).filter((e) => e.d > start).slice(-60), logged = entries.map((e) => norm(text(e.t, 400)));
    const log = entries.map((e) => `${dateStr(e.d)}: ${text(e.t, 400)}`);
    const total = times.reduce((a, x) => a + x.ms, 0), d = stop === 'a window opened' ? decision() : null;
    return {
      from: dateStr(start), to: dateStr(S.day), daysRun: ran, stoppedBecause: stop, cash: Math.round(S.cash), cashChange: Math.round(S.cash - cash),
      newIncidents: S.inc.filter((i) => !inc0.has(i.id)).map(incText),
      log, toasts: [...new Set(toastLines(takeToasts()))].filter((t) => { const f = norm(t.replace(/^\w+: /, '').split('\n')[0]); return !logged.some((l) => l.startsWith(f)); }).slice(-40),
      timing: { totalMs: r1(total), perDayMs: r1(total / (ran || 1)), slowestDays: times.slice().sort((a, b) => b.ms - a.ms).slice(0, 5).map((x) => ({ date: dateStr(x.day), ms: x.ms })) },
      ...(d ? { decision: d } : {}),
      screen: stop === 'a window opened' ? screen() : undefined,
    };
  };

  window.__mcp = { newGame, loadSave, exportSave, status, network, city, find, trace, peering, hotSpots, run, click, panel, openLink, actions, advance, screen,
    schema, catalog, state, results, ui, classes };
})();

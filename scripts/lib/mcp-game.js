// The game behind the MCP server (scripts/mcp.js), in one of two places. Headless (createSession): one game page of its
// own, the development page from src/ (with the agent facade, src/agent/), loaded in jsdom as the tests load it
// (tests/harness.js: seeded, no animation loop), with scripts/lib/mcp-headless.js added to start, load and export games.
// In the browser (scripts/lib/mcp-browser.js): the game in the player's tab, over the agent relay. Either way every
// other tool is the page's own facade (TUBES.call), so both play the same game the same way.
//
// TOOLS is the list the server offers; each says which sessions it works in (modes), and run() gets the session and
// the tool's arguments and returns JSON, or a promise of it (the browser answers over a socket).
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../../tests/harness');

const HEADLESS_JS = fs.readFileSync(path.join(__dirname, 'mcp-headless.js'), 'utf8');
const ACT_DIRS = ['90-actions', '94-dashboard', '96-map'].map((d) => path.join(__dirname, '..', '..', 'src', 'game', d));

// The arguments of the actions the command tables do not type (the drafts), read from their source
// (`dfSrc:({v})=>`): in the page the actions are wrapped for puzzle mode, so their own parameter lists are not visible.
let ACT_ARGS = null;
function actArgs() {
  if (ACT_ARGS) return ACT_ARGS;
  ACT_ARGS = {};
  const re = /(?:^|[\s,{])([A-Za-z]\w*):\s*(?:async\s*)?\(\s*\{([^}]*)\}\s*(?:=\s*\{\s*\}\s*)?\)\s*=>/g;
  for (const [dir, f] of ACT_DIRS.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.js')).sort().map((f) => [d, f]))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(re)) if (!ACT_ARGS[m[1]]) ACT_ARGS[m[1]] = m[2].split(',').map((a) => a.split('=')[0].trim()).filter(Boolean);
  }
  return ACT_ARGS;
}
const MAX_INLINE_SAVE = 200000;
const CLOCKS = ['agent', 'realtime'];
const DEFAULT_PACE_MS = 60000;


// One call into a jsdom page's facade, as JSON both ways: nothing but plain data crosses.
function pageCall(g, tool, args = {}, ctx) {
  const w = g.dom.window;
  w.__mcpTool = tool; w.__mcpArgs = JSON.parse(JSON.stringify(args)); w.__mcpCtx = ctx || null;
  return JSON.parse(g.ev('JSON.stringify(TUBES.call(__mcpTool,__mcpArgs,__mcpCtx))') || 'null');
}

// Where load_save and export_save may touch files. stdio (saveDir undefined): anywhere, as the operator's own client
// asks. Over HTTP the client may be another machine: nowhere (null), or only under one directory, symlinks included.
function savePath(s, p, write) {
  if (s.saveDir === undefined) return path.resolve(p);
  if (s.saveDir === null) throw new Error('This server takes saves as JSON only: give json instead of path (the server can allow a directory with --save-dir).');
  const root = s.saveDir, full = path.resolve(root, String(p));
  let real;
  try { real = write ? path.join(fs.realpathSync(path.dirname(full)), path.basename(full)) : fs.realpathSync(full); } catch (e) { throw new Error(`${p}: no such file or directory under the save directory`); }
  if (!real.startsWith(root + path.sep)) throw new Error(`${p} is outside the save directory.`);
  if (write && fs.existsSync(real) && fs.lstatSync(real).isSymbolicLink()) throw new Error(`${p} is a symbolic link: write to a plain file.`);
  return real;
}

// opts.clock: 'agent' (time moves with advance) or 'realtime' (the session runs a day every opts.paceMs, and tools can
// only wait). opts.seed, opts.file as tests/harness.js takes them (a file must be a development page: it carries the
// facade). opts.saveDir: see savePath.
function createSession(opts = {}) {
  const clock = CLOCKS.includes(opts.clock) ? opts.clock : 'agent';
  const paceMs = Math.max(10, Math.floor(+opts.paceMs) || DEFAULT_PACE_MS);
  let game = null, timer = null;
  const boot = () => {
    const g = load({ seed: opts.seed || 12345, file: opts.file, agent: true });
    g.ev(HEADLESS_JS);
    g.headless = (fn, ...args) => { g.dom.window.__mcpArgs = JSON.parse(JSON.stringify(args)); return JSON.parse(g.ev(`JSON.stringify(__mcpHeadless.${fn}(...window.__mcpArgs))`) || 'null'); };
    g.headless('setClock', clock, paceMs, clock === 'realtime');
    g.headless('newGame', { city: 'fra', name: 'Scratch Networks', preset: 'oncall' });
    // A running clock: the server keeps the time, one day per pace, whatever the tools do (as the player's tab does).
    if (clock === 'realtime') {
      timer = setInterval(() => { try { g.ev('apiTick()'); } catch (e) { g.errors.push(String(e && e.message || e)); } }, paceMs);
      if (timer.unref) timer.unref();
    }
    return g;
  };
  const session = {
    mode: 'headless', clock, paceMs: clock === 'realtime' ? paceMs : 0, saveDir: opts.saveDir,
    get game() { return game || (game = boot()); },
    // The page's own tools (TUBES.call), answered at once.
    tool(name, args) { return pageCall(session.game, name, args); },
    call(name, args) { return session.tool(name, args); },
    headless(fn, ...args) { return session.game.headless(fn, ...args); },
    // Text into the page without building a giant eval string (saves run to megabytes).
    loadSave(txt) { session.game.dom.window.__mcpSave = txt; return JSON.parse(session.game.ev('JSON.stringify(__mcpHeadless.loadSave(window.__mcpSave))')); },
    info() { return { transport: 'jsdom', clock, ...(clock === 'realtime' ? { paceMs } : {}) }; },
    errors() { return game ? game.errors.slice() : []; },
    close() { if (timer) clearInterval(timer); timer = null; },
  };
  return session;
}

// A value or a promise of one, the same way: headless tools answer at once, the browser's over a socket.
const then = (v, f) => (v && typeof v.then === 'function' ? v.then(f) : f(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const SECTIONS = ['mode', 'clock', 'commands', 'view', 'session', 'drafts', 'denied', 'domains', 'state', 'results'];
const WHERE = ['modal', 'bank', 'dash', 'panel', 'left', 'puzzle'];
const BOTH = ['headless', 'browser'], HEADLESS = ['headless'];
// A page tool, passed straight through: the MCP tool's arguments are the facade's.
const page = (name) => (s, a) => s.tool(name, a);

// wait: a running clock's days, read off the page until enough have passed (or something needs an answer).
async function waitDays(s, a) {
  const days = Math.max(1, Math.min(365, Math.floor(+a.days) || 1)), maxMs = Math.max(1, Math.min(600, +a.maxSeconds || 120)) * 1000;
  const c0 = await s.tool('clock', {});
  if (c0.mode !== 'realtime') throw new Error('The clock here is yours and stands still between calls: use advance to move it.');
  const t0 = Date.now(), poll = Math.max(10, Math.min(250, (c0.paceMs || 1000) / 4));
  let c = c0, stop = null;
  if (!c0.running) stop = 'the clock is not running (no game, a puzzle, or the network is bankrupt)';
  while (!stop) {
    await sleep(poll);
    c = await s.tool('clock', {});
    if (c.day >= c0.day + days) break;
    if (c.lost) stop = 'bankrupt';
    else if (c.question && !c0.question) stop = 'a window opened';
    else if (Date.now() - t0 >= maxMs) stop = 'maxSeconds passed';
  }
  const since = await s.tool('since', { day: c0.day, cash: c0.cash, inc: c0.incidents });
  return { ...since, daysAsked: days, stoppedBecause: stop, waitedSeconds: Math.round((Date.now() - t0) / 100) / 10 };
}

const TOOLS = [
  {
    name: 'new_game', modes: HEADLESS,
    description: 'Start a new network, replacing the current one. Presets: soft (Best Effort, the gentlest: no DDoS, no cable ships, no conferences, instant PNIs, patient customers, a rescue loan instead of game over), freeze (Change Freeze, gentle), oncall (On-call, the classic game), bgp (BGP at 3 a.m., harsh), sandbox (endless money, every level; chaos sets how often things break, default none). Seeded, so the same seed and the same moves give the same game. Scenarios, puzzles and architect runs start with act (startScn, pzStart, pzArStart).',
    inputSchema: obj({ city: str('Home city: id (fra) or name (Frankfurt). Default Frankfurt.'), name: str('Network name (24 characters at most). Default: a random pun.'),
      preset: str('Rules preset', { enum: ['soft', 'freeze', 'oncall', 'bgp', 'sandbox'] }), seed: num('Random seed, default 12345.'),
      asn: num('Your own AS number, as the title screen takes it. Default: a free one.'), chaos: str('Sandbox only: how often things break. Default none.', { enum: ['none', 'calm', 'normal', 'spicy'] }) }),
    run: (s, a) => s.headless('newGame', a),
  },
  {
    name: 'load_save', modes: HEADLESS,
    description: 'Load a saved game: a file exported from the game (Menu → Export save, the series-of-tubes-*.json from a bug report) or a raw save, as a path or as JSON text. Old saves are migrated exactly as the game does.',
    inputSchema: obj({ path: str('Path to a .json save file.'), json: str('The save itself, as JSON text.') }),
    run: (s, a) => {
      if (!a.path === !a.json) throw new Error('Give either path or json.');
      const txt = a.path ? fs.readFileSync(savePath(s, a.path, false), 'utf8') : a.json;
      return s.loadSave(txt);
    },
  },
  {
    name: 'export_save', modes: HEADLESS,
    description: 'Export the current game as a save file the real game can import (Menu → Import save). Writes it to path, or returns it when it is small.',
    inputSchema: obj({ path: str('Where to write the .json file.') }),
    run: (s, a) => {
      const txt = s.headless('exportSave', require('../../package.json').version);
      if (a.path) { const f = savePath(s, a.path, true); fs.writeFileSync(f, txt); return { wrote: f, bytes: Buffer.byteLength(txt) }; }
      if (txt.length > MAX_INLINE_SAVE) throw new Error(`The save is ${txt.length} characters; give a path to write it to.`);
      return JSON.parse(txt);
    },
  },
  {
    name: 'status', modes: BOTH,
    description: 'The network at a glance: date, cash, monthly revenue and costs by kind, level, tier and why it is not Tier 1 yet, the current goal, traffic, reach, counts, POPs and open incidents.',
    inputSchema: obj(),
    run: page('status'),
  },
  {
    name: 'advance', modes: BOTH,
    description: 'With the agent\'s clock (schema mode.clock "agent"): run the game forward day by day, as the game loop does. Stops early when a window opens (then read it with screen and answer it with click or act; decision says when it is a question with options) or the network goes bankrupt. Returns what happened: log, toasts, new incidents, cash, and how long each simulated day took. With a running clock it is an error: use wait.',
    inputSchema: obj({ days: num('Days to run, 1 to 3650. Default 1.') }),
    run: page('advance'),
  },
  {
    name: 'wait', modes: BOTH,
    description: 'With a running clock (schema mode.clock "realtime"): days pass on their own at a fixed pace and nobody can stop them. wait returns once that many have passed, or earlier when a window asks a question, the network goes bankrupt or maxSeconds of real time are up. Returns what happened meanwhile: log, new incidents, cash. With the agent\'s clock it is an error: use advance.',
    inputSchema: obj({ days: num('Days to wait for, 1 to 365. Default 1.'), maxSeconds: num('Give up after this much real time, 1 to 600. Default 120.') }),
    run: (s, a) => waitDays(s, a),
  },
  {
    name: 'network', modes: BOTH,
    description: 'Everything about one network (a carrier, eyeball network, CDN…): type, peering policy and what it asks for, traffic share, transit price, PoPs, exchanges, upstreams and customer cone, whether Tier 1 needs it, and for you: demand, how its traffic leaves you (egress by kind), your PNIs and sessions with it, and how to move it to peering.',
    inputSchema: obj({ network: str('Id (dtk), name (Doitsche Telekomm) or ASN.') }, ['network']),
    run: page('network'),
  },
  {
    name: 'city', modes: BOTH,
    description: 'One city: country, exchanges and their member counts, data center, who sells transit there and at what price, the networks present, the cables that land there, and your POP if you have one.',
    inputSchema: obj({ city: str('Id (fra) or name (Frankfurt).') }, ['city']),
    run: page('city'),
  },
  {
    name: 'find', modes: BOTH,
    description: 'Search cities, networks, cables and exchanges by name, id or ASN. Use it to get the ids other tools and actions take.',
    inputSchema: obj({ query: str('Part of a name, an id or an ASN.'), kind: str('Only this kind', { enum: ['city', 'network', 'cable', 'exchange'] }) }, ['query']),
    run: page('find'),
  },
  {
    name: 'traceroute', modes: BOTH,
    description: 'The game\'s looking glass: the path traffic takes from one of your POPs to a network (which exit wins and why, with the AS path) or to another of your POPs (prefix it city:).',
    inputSchema: obj({ from: str('One of your POPs: id or name.'), to: str('A network (id, name or ASN), or city:<one of your POPs>.') }, ['from', 'to']),
    run: page('traceroute'),
  },
  {
    name: 'peering_check', modes: BOTH,
    description: 'Would this network peer with you, and if not, why not? Checks a PNI at each of your POPs where it is, and a session at each exchange you are on where it is a member, with the game\'s own reasons (traffic it wants, paid peering, the Tier 1 club…).',
    inputSchema: obj({ network: str('Id, name or ASN.'), city: str('Only this city.'), via: str('Only this way', { enum: ['pni', 'ix'] }) }, ['network']),
    run: page('peering_check'),
  },
  {
    name: 'hot_spots', modes: BOTH,
    description: 'Where it hurts: the fullest links, transit ports and PNIs, the transit bill by carrier, and the networks with the most traffic still over transit, each with the cheapest way to peer with it.',
    inputSchema: obj({ limit: num('How many of each, default 10.') }),
    run: page('hot_spots'),
  },
  {
    name: 'schema', modes: BOTH,
    description: 'The typed contract act checks against: which session this is (mode: headless or the player\'s browser, and whose clock), every game command with its arguments, their domains and a description, which ones dry-run, decide or confirm; view commands; session actions (scenarios, puzzles, runs); drafts (inputs another command reads); what is not available and why; the argument domains; and a field-by-field reference of state and results. Give section for one part.',
    inputSchema: obj({ section: str('One part only', { enum: SECTIONS }) }),
    run: (s, a) => then(s.tool('schema', a), (v) => (!a.section ? { ...v, mode: { ...v.mode, ...s.info() } } : a.section === 'mode' ? { ...v, ...s.info() } : v)),
  },
  {
    name: 'catalog', modes: BOTH,
    description: 'The game\'s reference tables, which the argument domains point at: CITIES, NETS, CABLES, PORT, LT, OPT, DF_SYS, FAB, INTERNS, OPSK, CHARTERS, SCN, BANKS… plus three made for you: conferences (the upcoming calendar with the keys confGo and confSponsor take), TE_RECIPES (each RouteScript recipe with its script, ready for teDeploy) and BADGES (as the badge wall shows them). Omit name for the list of tables with their sizes.',
    inputSchema: obj({ name: str('One table; omit for the list.') }),
    run: page('catalog'),
  },
  {
    name: 'state', modes: BOTH,
    description: 'The saved game itself as JSON, the same object the game saves: offers, loan offers, links, ports, PNIs, customers, the intern, events… with their ids. schema section "state" documents each field; in the player\'s browser the dice (the seed, the days of the next failure and event) are held back. Give a path (pops.fra, links, loanOffers, biz.3, links.<id>): the whole state of a big network is hundreds of KB.',
    inputSchema: obj({ path: str('Dotted path: a key, an array index or an entity id per step.') }),
    run: page('state'),
  },
  {
    name: 'results', modes: BOTH,
    description: 'The game\'s last traffic computation (R), rebuilt after every action and every day: load per link, use per port, demand and served per city, egress per network, monthly cost and revenue by kind, latency, reach. schema section "results" documents each field. Give a path (load, cost, netEg.ggl).',
    inputSchema: obj({ path: str('Dotted path.') }),
    run: page('results'),
  },
  {
    name: 'ui', modes: BOTH,
    description: 'The view state actions read and write (the selection, the pending link pair, the drafts of the link, fiber and cable windows, the RouteScript draft, confirmations), without render caches. For working out why an action did what it did.',
    inputSchema: obj(),
    run: page('ui'),
  },
  {
    name: 'actions', modes: BOTH,
    description: 'Every action act can run, with its arguments (? marks an optional one), e.g. buildPop(city), buyTransit(city,net,tier), buildLink(a,b,tier,cable?,route?,premiumCrossing?). Port tiers: 0 = 10G, 1 = 100G, 2 = 400G, 3 = 800G. Exchanges are given as city=<exchange id>. schema has each one\'s argument domains and what it does.',
    inputSchema: obj(),
    run: (s) => then(s.tool('actions', {}), ({ typed, drafts }) => {
      const a = actArgs();
      return [...Object.entries(typed).map(([k, sig]) => `${k}(${sig})`), ...drafts.map((k) => (a[k] ? `${k}(${a[k].join(',')})` : k))].sort();
    }),
  },
  {
    name: 'act', modes: BOTH,
    description: 'Do something in the game: run one action with its arguments (see actions and schema). Arguments are checked first (a wrong id or value is an error that lists what fits); the action then runs as the game runs it: windows that take typed text are filled in (renameGo, teDeploy, teCheck, metricSet), multi-step builds take their choices as arguments (buildLink, orderDf, orderCable, decomGo), and confirmations are given (rmLink, cancelTransit…). outcome says what happened: applied (something changed), rejected (the game said no, see toasts), no_effect (nothing changed and nothing was said), shown (a view or draft: only the screen changed), decision (a window asks a question: answer with one of decision.options or closeModal; other game commands wait), quote (dryRun), stopped (bankrupt). charged is what the money gate took; cashChange also counts goal rewards. With dryRun, a game command is priced with the game\'s own helpers and nothing happens. In the player\'s browser, a window the player opened stays theirs: you play behind it.',
    inputSchema: obj({ action: str('Action name, e.g. buildPop (view. prefixes are accepted).'), command: str('Same as action.'), args: { type: 'object', description: 'Its arguments, e.g. {"city":"ams"}.' },
      dryRun: bool('Price it and check it can be done: {setup, monthly, days, blocked}. Nothing happens.') }),
    run: page('act'),
  },
  {
    name: 'screen', modes: BOTH,
    description: 'What the player sees, as text with numbered buttons for click: the open window, else the bank or the NOC dashboard when open, else the side panel, else the puzzle box. where picks one: modal, bank, dash, panel, left (the left drawer: goals, deals, noc or nets) or puzzle. open lists what is showing. Long text comes in pages: textMore says the offset of the next one. Lists the game acts on when they change come with their options; click them with a value.',
    inputSchema: obj({ where: str('Which surface', { enum: WHERE }), offset: num('Start the text here (from textMore).') }),
    run: page('screen'),
  },
  {
    name: 'panel', modes: BOTH,
    description: 'Open the side panel of a city or a link, a network in the network list, or a tab of the left drawer (goals, deals: offers and loans, noc, nets), optionally on a tab (a city has cust, up, peer, infra…), and show it as text with numbered buttons.',
    inputSchema: obj({ city: str('City id or name.'), link: str('Link id (from status, hot_spots or state links).'), network: str('Network id or name.'), tab: str('Tab id, as the tab buttons name it.'),
      left: str('A tab of the left drawer', { enum: ['goals', 'deals', 'noc', 'nets'] }) }),
    run: page('panel'),
  },
  {
    name: 'click', modes: BOTH,
    description: 'Press a numbered button from the last screen, panel or act result, as a player\'s click does: with the button\'s own arguments, so confirmations arm first and windows step on as in the game. For a list (it has options), give value.',
    inputSchema: obj({ button: num('The button\'s n.'), value: str('For a list: the option to pick.') }, ['button']),
    run: page('click'),
  },
  {
    name: 'open_link', modes: BOTH,
    description: 'Open the build window for a link (a leased wave, dark fiber or your own cable) from one of your POPs to any city, to compare the routes and sizes it offers; then click through it. act buildLink, orderDf and orderCable do the same in one call.',
    inputSchema: obj({ from: str('One of your POPs.'), to: str('Any city.') }, ['from', 'to']),
    run: page('open_link'),
  },
];

const toolsFor = (mode) => TOOLS.filter((t) => t.modes.includes(mode));

module.exports = { createSession, TOOLS, toolsFor, actArgs, pageCall, savePath, CLOCKS, DEFAULT_PACE_MS };

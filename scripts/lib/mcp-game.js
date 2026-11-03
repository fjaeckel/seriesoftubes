// The game behind the MCP server (scripts/mcp.js): one game page from src/, loaded in jsdom like the tests load it
// (tests/harness.js: seeded, no animation loop), with scripts/lib/mcp-commands.js (the typed command tables) and
// scripts/lib/mcp-page.js added to read and drive it. TOOLS is the list the server offers; each run() gets the
// session and the tool's arguments and returns JSON.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../../tests/harness');

const PAGE_JS = ['mcp-commands.js', 'mcp-page.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const ACT_DIR = path.join(__dirname, '..', '..', 'src', 'game', '90-actions');

// The arguments of the actions the command tables do not type (the drafts), read from their source
// (`dfSrc:({v})=>`): in the page the actions are wrapped for puzzle mode, so their own parameter lists are not visible.
let ACT_ARGS = null;
function actArgs() {
  if (ACT_ARGS) return ACT_ARGS;
  ACT_ARGS = {};
  const re = /(?:^|[\s,{])([A-Za-z]\w*):\s*(?:async\s*)?\(\s*\{([^}]*)\}\s*(?:=\s*\{\s*\}\s*)?\)\s*=>/g;
  for (const f of fs.readdirSync(ACT_DIR).filter((f) => f.endsWith('.js')).sort()) {
    const src = fs.readFileSync(path.join(ACT_DIR, f), 'utf8');
    for (const m of src.matchAll(re)) if (!ACT_ARGS[m[1]]) ACT_ARGS[m[1]] = m[2].split(',').map((a) => a.split('=')[0].trim()).filter(Boolean);
  }
  return ACT_ARGS;
}
const MAX_INLINE_SAVE = 200000;

function createSession(opts = {}) {
  let game = null;
  const boot = () => {
    const g = load({ seed: opts.seed || 12345, file: opts.file });
    for (const js of PAGE_JS) g.ev(js);
    g.call = (fn, ...args) => {
      g.dom.window.__mcpArgs = JSON.parse(JSON.stringify(args));
      return JSON.parse(g.ev(`JSON.stringify(__mcp.${fn}(...window.__mcpArgs))`) || 'null');
    };
    g.call('newGame', { city: 'fra', name: 'Scratch Networks', preset: 'oncall' });
    return g;
  };
  const session = {
    get game() { return game || (game = boot()); },
    call(fn, ...args) { return session.game.call(fn, ...args); },
    // Text into the page without building a giant eval string (saves run to megabytes).
    loadSave(txt) { session.game.dom.window.__mcpSave = txt; return JSON.parse(session.game.ev('JSON.stringify(__mcp.loadSave(window.__mcpSave))')); },
    errors() { return game ? game.errors.slice() : []; },
  };
  return session;
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const SECTIONS = ['clock', 'commands', 'view', 'session', 'drafts', 'denied', 'domains', 'state', 'results'];
const WHERE = ['modal', 'bank', 'dash', 'panel', 'left', 'puzzle'];

const TOOLS = [
  {
    name: 'new_game',
    description: 'Start a new network, replacing the current one. Presets: soft (Best Effort, the gentlest: no DDoS, no cable ships, no conferences, instant PNIs, patient customers, a rescue loan instead of game over), freeze (Change Freeze, gentle), oncall (On-call, the classic game), bgp (BGP at 3 a.m., harsh), sandbox (endless money, every level; chaos sets how often things break, default none). Seeded, so the same seed and the same moves give the same game. Scenarios, puzzles and architect runs start with act (startScn, pzStart, pzArStart).',
    inputSchema: obj({ city: str('Home city: id (fra) or name (Frankfurt). Default Frankfurt.'), name: str('Network name (24 characters at most). Default: a random pun.'),
      preset: str('Rules preset', { enum: ['soft', 'freeze', 'oncall', 'bgp', 'sandbox'] }), seed: num('Random seed, default 12345.'),
      asn: num('Your own AS number, as the title screen takes it. Default: a free one.'), chaos: str('Sandbox only: how often things break. Default none.', { enum: ['none', 'calm', 'normal', 'spicy'] }) }),
    run: (s, a) => s.call('newGame', a),
  },
  {
    name: 'load_save',
    description: 'Load a saved game: a file exported from the game (Menu → Export save, the series-of-tubes-*.json from a bug report) or a raw save, as a path or as JSON text. Old saves are migrated exactly as the game does.',
    inputSchema: obj({ path: str('Path to a .json save file.'), json: str('The save itself, as JSON text.') }),
    run: (s, a) => {
      if (!a.path === !a.json) throw new Error('Give either path or json.');
      const txt = a.path ? fs.readFileSync(path.resolve(a.path), 'utf8') : a.json;
      return s.loadSave(txt);
    },
  },
  {
    name: 'export_save',
    description: 'Export the current game as a save file the real game can import (Menu → Import save). Writes it to path, or returns it when it is small.',
    inputSchema: obj({ path: str('Where to write the .json file.') }),
    run: (s, a) => {
      const txt = s.call('exportSave', require('../../package.json').version);
      if (a.path) { fs.writeFileSync(path.resolve(a.path), txt); return { wrote: path.resolve(a.path), bytes: Buffer.byteLength(txt) }; }
      if (txt.length > MAX_INLINE_SAVE) throw new Error(`The save is ${txt.length} characters; give a path to write it to.`);
      return JSON.parse(txt);
    },
  },
  {
    name: 'status',
    description: 'The network at a glance: date, cash, monthly revenue and costs by kind, level, tier and why it is not Tier 1 yet, the current goal, traffic, reach, counts, POPs and open incidents.',
    inputSchema: obj(),
    run: (s) => s.call('status'),
  },
  {
    name: 'advance',
    description: 'Run the game forward day by day, as the game loop does. Stops early when a window opens (then read it with screen and answer it with click or act; decision says when it is a question with options) or the network goes bankrupt. Returns what happened: log, toasts, new incidents, cash, and how long each simulated day took.',
    inputSchema: obj({ days: num('Days to run, 1 to 3650. Default 1.') }),
    run: (s, a) => s.call('advance', a.days),
  },
  {
    name: 'network',
    description: 'Everything about one network (a carrier, eyeball network, CDN…): type, peering policy and what it asks for, traffic share, transit price, PoPs, exchanges, upstreams and customer cone, whether Tier 1 needs it, and for you: demand, how its traffic leaves you (egress by kind), your PNIs and sessions with it, and how to move it to peering.',
    inputSchema: obj({ network: str('Id (dtk), name (Doitsche Telekomm) or ASN.') }, ['network']),
    run: (s, a) => s.call('network', a.network),
  },
  {
    name: 'city',
    description: 'One city: country, exchanges and their member counts, data center, who sells transit there and at what price, the networks present, the cables that land there, and your POP if you have one.',
    inputSchema: obj({ city: str('Id (fra) or name (Frankfurt).') }, ['city']),
    run: (s, a) => s.call('city', a.city),
  },
  {
    name: 'find',
    description: 'Search cities, networks, cables and exchanges by name, id or ASN. Use it to get the ids other tools and actions take.',
    inputSchema: obj({ query: str('Part of a name, an id or an ASN.'), kind: str('Only this kind', { enum: ['city', 'network', 'cable', 'exchange'] }) }, ['query']),
    run: (s, a) => s.call('find', a.query, a.kind),
  },
  {
    name: 'traceroute',
    description: 'The game\'s looking glass: the path traffic takes from one of your POPs to a network (which exit wins and why, with the AS path) or to another of your POPs (prefix it city:).',
    inputSchema: obj({ from: str('One of your POPs: id or name.'), to: str('A network (id, name or ASN), or city:<one of your POPs>.') }, ['from', 'to']),
    run: (s, a) => s.call('trace', a.from, a.to),
  },
  {
    name: 'peering_check',
    description: 'Would this network peer with you, and if not, why not? Checks a PNI at each of your POPs where it is, and a session at each exchange you are on where it is a member, with the game\'s own reasons (traffic it wants, paid peering, the Tier 1 club…).',
    inputSchema: obj({ network: str('Id, name or ASN.'), city: str('Only this city.'), via: str('Only this way', { enum: ['pni', 'ix'] }) }, ['network']),
    run: (s, a) => s.call('peering', a.network, a.city, a.via),
  },
  {
    name: 'hot_spots',
    description: 'Where it hurts: the fullest links, transit ports and PNIs, the transit bill by carrier, and the networks with the most traffic still over transit, each with the cheapest way to peer with it.',
    inputSchema: obj({ limit: num('How many of each, default 10.') }),
    run: (s, a) => s.call('hotSpots', a.limit || 10),
  },
  {
    name: 'schema',
    description: 'The typed contract act checks against: every game command with its arguments, their domains and a description, which ones dry-run, decide or confirm; view commands; session actions (scenarios, puzzles, runs); drafts (inputs another command reads); what is not available and why; the argument domains; and a field-by-field reference of state and results. Give section for one part.',
    inputSchema: obj({ section: str('One part only', { enum: SECTIONS }) }),
    run: (s, a) => s.call('schema', a.section),
  },
  {
    name: 'catalog',
    description: 'The game\'s reference tables, which the argument domains point at: CITIES, NETS, CABLES, PORT, LT, OPT, DF_SYS, FAB, INTERNS, OPSK, CHARTERS, SCN, BANKS… plus three made for you: conferences (the upcoming calendar with the keys confGo and confSponsor take), TE_RECIPES (each RouteScript recipe with its script, ready for teDeploy) and BADGES (as the badge wall shows them). Omit name for the list of tables with their sizes.',
    inputSchema: obj({ name: str('One table; omit for the list.') }),
    run: (s, a) => s.call('catalog', a.name),
  },
  {
    name: 'state',
    description: 'The saved game itself as JSON, the same object the game saves: offers, loan offers, links, ports, PNIs, customers, the intern, events… with their ids. schema section "state" documents each field. Give a path (pops.fra, links, loanOffers, biz.3, links.<id>): the whole state of a big network is hundreds of KB.',
    inputSchema: obj({ path: str('Dotted path: a key, an array index or an entity id per step.') }),
    run: (s, a) => s.call('state', a.path),
  },
  {
    name: 'results',
    description: 'The game\'s last traffic computation (R), rebuilt after every action and every day: load per link, use per port, demand and served per city, egress per network, monthly cost and revenue by kind, latency, reach. schema section "results" documents each field. Give a path (load, cost, netEg.ggl).',
    inputSchema: obj({ path: str('Dotted path.') }),
    run: (s, a) => s.call('results', a.path),
  },
  {
    name: 'ui',
    description: 'The view state actions read and write (the selection, the pending link pair, the drafts of the link, fiber and cable windows, the RouteScript draft, confirmations), without render caches. For working out why an action did what it did.',
    inputSchema: obj(),
    run: (s) => s.call('ui'),
  },
  {
    name: 'actions',
    description: 'Every action act can run, with its arguments (? marks an optional one), e.g. buildPop(city), buyTransit(city,net,tier), buildLink(a,b,tier,cable?,route?,premiumCrossing?). Port tiers: 0 = 10G, 1 = 100G, 2 = 400G, 3 = 800G. Exchanges are given as city=<exchange id>. schema has each one\'s argument domains and what it does.',
    inputSchema: obj(),
    run: (s) => {
      const { typed, drafts } = s.call('actions'), a = actArgs();
      return [...Object.entries(typed).map(([k, sig]) => `${k}(${sig})`), ...drafts.map((k) => (a[k] ? `${k}(${a[k].join(',')})` : k))].sort();
    },
  },
  {
    name: 'act',
    description: 'Do something in the game: run one action with its arguments (see actions and schema). Arguments are checked first (a wrong id or value is an error that lists what fits); the action then runs as the game runs it: windows that take typed text are filled in (renameGo, teDeploy, teCheck, metricSet), multi-step builds take their choices as arguments (buildLink, orderDf, orderCable, decomGo), and confirmations are given (rmLink, cancelTransit…). outcome says what happened: applied (something changed), rejected (the game said no, see toasts), no_effect (nothing changed and nothing was said), shown (a view or draft: only the screen changed), decision (a window asks a question: answer with one of decision.options or closeModal; other game commands wait), quote (dryRun), stopped (bankrupt). charged is what the money gate took; cashChange also counts goal rewards. With dryRun, a game command is priced with the game\'s own helpers and nothing happens.',
    inputSchema: obj({ action: str('Action name, e.g. buildPop (view. prefixes are accepted).'), command: str('Same as action.'), args: { type: 'object', description: 'Its arguments, e.g. {"city":"ams"}.' },
      dryRun: bool('Price it and check it can be done: {setup, monthly, days, blocked}. Nothing happens.') }),
    run: (s, a) => {
      const name = a.action || a.command;
      if (!name) throw new Error('Give action, e.g. {"action":"buildPop","args":{"city":"ams"}}.');
      return s.call('run', name, a.args || {}, { dryRun: !!a.dryRun });
    },
  },
  {
    name: 'screen',
    description: 'What the player sees, as text with numbered buttons for click: the open window, else the bank or the NOC dashboard when open, else the side panel, else the puzzle box. where picks one: modal, bank, dash, panel, left (the left drawer: goals, deals, noc or nets) or puzzle. open lists what is showing. Long text comes in pages: textMore says the offset of the next one. Lists the game acts on when they change come with their options; click them with a value.',
    inputSchema: obj({ where: str('Which surface', { enum: WHERE }), offset: num('Start the text here (from textMore).') }),
    run: (s, a) => s.call('screen', a.where, a.offset),
  },
  {
    name: 'panel',
    description: 'Open the side panel of a city or a link, a network in the network list, or a tab of the left drawer (goals, deals: offers and loans, noc, nets), optionally on a tab (a city has cust, up, peer, infra…), and show it as text with numbered buttons.',
    inputSchema: obj({ city: str('City id or name.'), link: str('Link id (from status, hot_spots or state links).'), network: str('Network id or name.'), tab: str('Tab id, as the tab buttons name it.'),
      left: str('A tab of the left drawer', { enum: ['goals', 'deals', 'noc', 'nets'] }) }),
    run: (s, a) => s.call('panel', a),
  },
  {
    name: 'click',
    description: 'Press a numbered button from the last screen, panel or act result, as a player\'s click does: with the button\'s own arguments, so confirmations arm first and windows step on as in the game. For a list (it has options), give value.',
    inputSchema: obj({ button: num('The button\'s n.'), value: str('For a list: the option to pick.') }, ['button']),
    run: (s, a) => s.call('click', a.button, a.value),
  },
  {
    name: 'open_link',
    description: 'Open the build window for a link (a leased wave, dark fiber or your own cable) from one of your POPs to any city, to compare the routes and sizes it offers; then click through it. act buildLink, orderDf and orderCable do the same in one call.',
    inputSchema: obj({ from: str('One of your POPs.'), to: str('Any city.') }, ['from', 'to']),
    run: (s, a) => s.call('openLink', a.from, a.to),
  },
];

module.exports = { createSession, TOOLS, actArgs };

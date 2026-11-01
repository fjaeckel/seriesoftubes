// The game behind the MCP server (scripts/mcp.js): one game page from src/, loaded in jsdom like the tests load it
// (tests/harness.js: seeded, no animation loop), with scripts/lib/mcp-page.js added to read and drive it.
// TOOLS is the list the server offers; each run() gets the session and the tool's arguments and returns JSON.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../../tests/harness');

const PAGE_JS = fs.readFileSync(path.join(__dirname, 'mcp-page.js'), 'utf8');
const ACT_DIR = path.join(__dirname, '..', '..', 'src', 'game', '90-actions');

// The arguments each action takes, read from its source (`buyTransit:({city,net,tier})=>`): in the page the
// actions are wrapped for puzzle mode, so their own parameter lists are not visible there.
let ACT_ARGS = null;
function actArgs() {
  if (ACT_ARGS) return ACT_ARGS;
  ACT_ARGS = {};
  const re = /(?:^|[\s,{])([A-Za-z]\w*):\s*(?:async\s*)?\(\s*\{([^}]*)\}\s*\)\s*=>/g;
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
    g.ev(PAGE_JS);
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
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

const TOOLS = [
  {
    name: 'new_game',
    description: 'Start a new network, replacing the current one. Presets: freeze (Change Freeze, gentle), oncall (On-call, the classic game), bgp (BGP at 3 a.m., harsh), sandbox (endless money, every level, no chaos). Seeded, so the same seed and the same moves give the same game.',
    inputSchema: obj({ city: str('Home city: id (fra) or name (Frankfurt). Default Frankfurt.'), name: str('Network name (24 characters at most). Default: a random pun.'),
      preset: str('Rules preset', { enum: ['freeze', 'oncall', 'bgp', 'sandbox'] }), seed: num('Random seed, default 12345.') }),
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
    description: 'Run the game forward day by day, as the game loop does. Stops early when a window opens that needs an answer (then answer it with screen and click) or the network goes bankrupt. Returns what happened: log, toasts, new incidents, cash, and how long each simulated day took.',
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
    name: 'actions',
    description: 'Every game action act can run, with the arguments it takes, e.g. buildPop(city), buyTransit(city,net,tier), buyIx(city,tier), pni(city,net,tier). Port tiers: 0 = 10G, 1 = 100G, 2 = 400G, 3 = 800G. Exchanges are given as city=<exchange id>.',
    inputSchema: obj(),
    run: (s) => { const a = actArgs(); return s.call('actions').map((k) => (a[k] ? `${k}(${a[k].join(',')})` : k)); },
  },
  {
    name: 'act',
    description: 'Do something in the game, as a button would: run one action with its arguments (see actions). Returns the game\'s messages, the change in cash, and what is on screen now: an open window (a quote, a choice) with its numbered buttons, or the side panel.',
    inputSchema: obj({ action: str('Action name, e.g. buildPop.'), args: { type: 'object', description: 'Its arguments, e.g. {"city":"ams"}.' } }, ['action']),
    run: (s, a) => s.call('run', a.action, a.args || {}),
  },
  {
    name: 'screen',
    description: 'What the player sees now: the open window, or else the side panel, as text with numbered buttons for click.',
    inputSchema: obj(),
    run: (s) => s.call('screen'),
  },
  {
    name: 'panel',
    description: 'Open the side panel of a city or a link, or a network in the network list, optionally on a tab (a city has cust, up, peer, infra…), and show it as text with numbered buttons.',
    inputSchema: obj({ city: str('City id or name.'), link: str('Link id (from status or hot_spots).'), network: str('Network id or name.'), tab: str('Tab id, as the tab buttons name it.') }),
    run: (s, a) => s.call('panel', a),
  },
  {
    name: 'click',
    description: 'Press a numbered button from the last screen, panel or act result.',
    inputSchema: obj({ button: num('The button\'s n.') }, ['button']),
    run: (s, a) => s.call('click', a.button),
  },
  {
    name: 'open_link',
    description: 'Open the build window for a link (a leased wave, dark fiber or your own cable) from one of your POPs to any city. Then pick the route and size with click (buildLink takes the tier).',
    inputSchema: obj({ from: str('One of your POPs.'), to: str('Any city.') }, ['from', 'to']),
    run: (s, a) => s.call('openLink', a.from, a.to),
  },
];

module.exports = { createSession, TOOLS };

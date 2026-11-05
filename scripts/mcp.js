#!/usr/bin/env node
// Series of Tubes as an MCP server: an AI client can play, inspect and debug the game through typed tools, in one of
// two sessions: headless, a game of its own loaded from this checkout's src/ (scripts/lib/mcp-game.js), or the game in
// the player's browser tab over the agent relay (scripts/lib/mcp-browser.js). It speaks MCP through the official SDK
// (@modelcontextprotocol/server), over stdio or over HTTP. Nothing is hosted: this is a local tool, like npm run dev,
// and the game page players get does not change.
//
//   node scripts/mcp.js                         # stdio, headless, the agent's clock (advance)
//   node scripts/mcp.js --clock realtime        #   a clock that runs on its own (--pace ms per day; wait)
//   node scripts/mcp.js --browser               # the player's tab, through the relay npm run dev hosts
//   node scripts/mcp.js --http 7777             # Streamable HTTP on http://127.0.0.1:7777/mcp (with any of the above)
//   node scripts/mcp.js --http 0.0.0.0:7777     # the same on every interface: anyone who can reach it can play
//
//   claude mcp add seriesoftubes -- node /path/to/seriesoftubes/scripts/mcp.js
//   claude mcp add --transport http seriesoftubes http://127.0.0.1:7777/mcp
//
// stdout carries only protocol messages in stdio mode; anything else goes to stderr.
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { McpServer, fromJsonSchema, createMcpHandler, validateHostHeader, validateOriginHeader, localhostAllowedHostnames, localhostAllowedOrigins } = require('@modelcontextprotocol/server');
const { createSession, toolsFor, CLOCKS, DEFAULT_PACE_MS } = require('./lib/mcp-game');
const { version } = require('../package.json');

const READ = 'Read with status, network, city, find, traceroute, peering_check and hot_spots, or raw with state, results and catalog; schema is the typed contract of every action, and its mode section says which session this is. Change things with act (arguments are checked, outcome says what happened, dryRun prices a move first), or with screen, panel and click, which show the game\'s own panels and windows as text with numbered buttons.';
const CLOCK = {
  agent: 'Time moves only with advance.',
  realtime: 'The clock runs on its own, a day at a fixed pace, and you cannot stop it: decide while it runs, and use wait to let days pass.',
};
const instructions = (mode, clock) => mode === 'browser'
  ? `Series of Tubes is a cartoon game about building an internet backbone: POPs in cities, links between them, transit, exchanges, PNIs, customers. You are playing the game in the player's own browser tab while they watch: the game, its saves and its settings are theirs, and so is any window they open (you play behind it). ${READ} The player picks the clock in Settings: either it runs on its own at a pace and you use wait, or it is yours and you use advance (schema mode.clock says which).`
  : `Series of Tubes is a cartoon game about building an internet backbone: POPs in cities, links between them, transit, exchanges, PNIs, customers. A game is always loaded (a fresh On-call game in Frankfurt until you start or load another). ${READ} ${CLOCK[clock]} Games are seeded: the same seed and moves give the same game.
To look into a bug report: load_save with the attached save, then status, hot_spots, and advance with timings.`;
const INSTRUCTIONS = instructions('headless', 'agent');
const MCP_PATH = '/mcp';

const usage = () => `Usage: node scripts/mcp.js [options]

  (no options)            headless over stdio: a game of its own, from this checkout's src/; the client starts this process
  --clock agent|realtime  headless: who moves time (default agent: advance; realtime: a day every --pace ms, and wait)
  --pace MS               headless, realtime clock: real milliseconds per simulated day (default ${DEFAULT_PACE_MS})
  --seed N                headless: the random seed of the first game (default 12345)
  --browser               the game in the player's browser instead, over the agent relay (Settings → Agent API)
  --relay-host HOST       browser: where npm run dev serves the page; the relay rides it (default 127.0.0.1)
  --relay-port N          browser: the port it serves the page on (default 8080)
  --page-wait-ms N        browser: how long to wait for a game page to connect (default 90000)
  --call-ms N             browser: how long one tool call may wait for the page (default 30000)
  --http [HOST:]PORT      Streamable HTTP at http://HOST:PORT${MCP_PATH} instead (HOST defaults to 127.0.0.1)
  --token-file FILE       HTTP: require "Authorization: Bearer <the file's contents>" (or set SOT_MCP_TOKEN)
  --allow-host NAME       HTTP: also accept this Host name (repeatable), e.g. for a tunnel or a LAN name
  --save-dir DIR          HTTP: load_save and export_save may read and write files under DIR (otherwise no files)
  --help`;

// Valueless flags are true; repeated ones collect; --kebab-case becomes camelCase.
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v = argv[i + 1];
    const val = v === undefined || v.startsWith('--') ? true : (i++, v);
    out[k] = k in out ? [].concat(out[k], val) : val;
  }
  return out;
}

// Tool calls run one at a time, in the order they arrived, from every client: one game, one move at a time.
function serial() {
  let chain = Promise.resolve();
  return (f) => { const p = chain.then(f); chain = p.catch(() => {}); return p; };
}

// One MCP server definition over the game session: the SDK asks for a fresh one per connection (stdio) or per request
// (HTTP); they all share the session and its queue.
function serverFactory(session) {
  const queue = serial(), tools = toolsFor(session.mode || 'headless'), text = instructions(session.mode || 'headless', session.clock || 'agent');
  const schemas = new Map(tools.map((t) => [t.name, fromJsonSchema(t.inputSchema)]));
  return () => {
    const server = new McpServer({ name: 'seriesoftubes', title: 'Series of Tubes', version }, { capabilities: { tools: {} }, instructions: text });
    for (const tool of tools) {
      server.registerTool(tool.name, { description: tool.description, inputSchema: schemas.get(tool.name) }, (args) => queue(async () => {
        try {
          const out = await tool.run(session, args || {});
          const errs = session.errors();
          return { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], ...(errs.length ? { _meta: { pageErrors: errs.slice(-5) } } : {}) };
        } catch (e) {
          return { content: [{ type: 'text', text: String(e && e.message || e) }], isError: true };
        }
      }));
    }
    return server;
  };
}

// --http [HOST:]PORT, with IPv6 hosts in brackets ([::1]:7777).
function parseListen(v) {
  const s = String(v === true ? '' : v);
  const m = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(s) || /^()()(\d+)$/.exec(s);
  // Port 0 picks a free one (the banner says which).
  if (!m || +m[3] > 65535) throw new Error(`--http takes [HOST:]PORT, e.g. 7777 or 0.0.0.0:7777, not "${s}"`);
  return { host: m[1] || m[2] || '127.0.0.1', port: +m[3] };
}
const isLoopback = (h) => h === 'localhost' || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
const isWildcard = (h) => h === '0.0.0.0' || h === '::';
const bracket = (h) => (h.includes(':') && !h.startsWith('[') ? `[${h}]` : h);

// The names a request's Host may carry: this machine by loopback, the address the server is bound to (every local
// address when bound to all of them), and names the operator allowed. Anything else is a name someone else's DNS
// points here (DNS rebinding) and is refused.
function allowedHosts(host, extra = []) {
  const out = new Set([...localhostAllowedHostnames(), ...extra.map(String)]);
  if (isWildcard(host)) for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) out.add(bracket(a.address.split('%')[0]));
  else out.add(bracket(host));
  return [...out];
}

// Constant-time token check (hashing first makes the lengths equal, so the length does not leak either).
const sameToken = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

// The HTTP side: Host and Origin checked on every request (browsers cannot be talked into driving the game from a
// website), the token when there is one, then the SDK's Streamable HTTP handler.
function createHttpServer(factory, { host, allow = [], token = null } = {}) {
  const { toNodeHandler } = require('@modelcontextprotocol/node');
  const handle = toNodeHandler(createMcpHandler(factory));
  const hosts = allowedHosts(host, allow), origins = localhostAllowedOrigins();
  const deny = (res, code, message, headers = {}) => {
    res.writeHead(code, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== MCP_PATH) return deny(res, 404, `The MCP endpoint is ${MCP_PATH}.`);
    const h = validateHostHeader(req.headers.host, hosts);
    if (!h.ok) return deny(res, 403, `Host not allowed: ${h.message}. Use an address of this machine, or start the server with --allow-host.`);
    const o = validateOriginHeader(req.headers.origin, origins);
    if (!o.ok) return deny(res, 403, 'Origin not allowed: a web page may not drive this server.');
    if (token) {
      const auth = String(req.headers.authorization || '').trim(), sp = auth.search(/\s/);
      const given = sp > 0 && auth.slice(0, sp).toLowerCase() === 'bearer' ? auth.slice(sp + 1).trim() : '';
      if (!given || !sameToken(given, token)) return deny(res, 401, 'A bearer token is required.', { 'www-authenticate': 'Bearer realm="seriesoftubes"' });
    }
    handle(req, res);
  });
  // advance over thousands of days on a big network takes minutes; Node's default would cut it off at five.
  server.requestTimeout = 30 * 60 * 1000;
  return server;
}

function readToken(args) {
  if (args.tokenFile) {
    const t = fs.readFileSync(path.resolve(String(args.tokenFile)), 'utf8').trim();
    if (!t) throw new Error(`${args.tokenFile} is empty`);
    return t;
  }
  return process.env.SOT_MCP_TOKEN ? String(process.env.SOT_MCP_TOKEN).trim() || null : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.error(usage()); process.exit(0); }
  const say = (m) => console.error(`[series-of-tubes] ${m}`);
  const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
  // The game page logs nothing to stdout, but a stray console.log anywhere must not break the stdio protocol.
  console.log = console.info = (...a) => console.error(...a);
  const flag = (k) => `--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`;
  if (!args.http) for (const k of ['tokenFile', 'allowHost', 'saveDir']) if (args[k] !== undefined) die(`${flag(k)} is an --http option`);
  if (args.browser) {
    for (const k of ['clock', 'pace', 'seed', 'saveDir']) if (args[k] !== undefined) die(`${flag(k)} is the headless session's: in the browser the player owns the game and sets the clock in Settings`);
  } else {
    for (const k of ['relayHost', 'relayPort', 'pageWaitMs', 'callMs']) if (args[k] !== undefined) die(`${flag(k)} is a --browser option`);
    if (args.clock !== undefined && !CLOCKS.includes(args.clock)) die(`--clock is one of ${CLOCKS.join(', ')}`);
  }
  if (!args.http) {
    const { serveStdio } = require('@modelcontextprotocol/server/stdio');
    const session = open(args);
    serveStdio(serverFactory(session));
    const shutdown = () => { try { session.close(); } catch {} process.exit(0); };
    process.stdin.on('close', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    // stdio has one client, which needs the page: without one, it is better told by the server stopping.
    started(session, args, say, true);
    return;
  }
  let listen, token;
  try { listen = parseListen(args.http); token = readToken(args); } catch (e) { die(e.message); }
  // Over HTTP the client may be another machine: files only under --save-dir, never anywhere on this one.
  let saveDir = null;
  if (args.saveDir !== undefined) {
    try { saveDir = fs.realpathSync(path.resolve(String(args.saveDir))); } catch (e) { die(`--save-dir ${args.saveDir}: ${e.message}`); }
    if (!fs.statSync(saveDir).isDirectory()) die(`--save-dir ${args.saveDir} is not a directory`);
  }
  const session = open(args, { saveDir });
  const server = createHttpServer(serverFactory(session), { host: listen.host, allow: [].concat(args.allowHost || []), token });
  server.on('error', (e) => die(`could not listen on ${bracket(listen.host)}:${listen.port}: ${e.message}`));
  server.listen(listen.port, listen.host, () => {
    const ad = server.address(), at = `${bracket(ad.address)}:${ad.port}`;
    say(`MCP server ${version} on http://${at}${MCP_PATH} (one game, shared by every client; calls run one at a time)`);
    say(token ? 'a bearer token is required' : 'no token: anything that can reach this address may play');
    if (!isLoopback(listen.host) && !token) say(`WARNING: bound to ${listen.host}, beyond this machine, without a token. Set SOT_MCP_TOKEN or --token-file to require one.`);
    if (session.mode === 'headless') say(saveDir ? `load_save and export_save files: under ${saveDir}` : 'load_save and export_save take JSON only (no files: --save-dir DIR allows some)');
    started(session, args, say, false);
  });
  const shutdown = () => { try { session.close(); } catch {} server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// The session the flags ask for: headless (with its clock), or the player's browser over the relay.
function open(args, extra = {}) {
  if (args.browser) {
    const { createBrowserSession } = require('./lib/mcp-browser');
    return createBrowserSession({ host: args.relayHost, port: args.relayPort, callMs: args.callMs });
  }
  return createSession({ clock: args.clock, paceMs: args.pace, seed: +args.seed || undefined, ...extra });
}

// What the session is, said once it is up. In the browser the handshake is answered at once; the page may arrive
// later, and must be built from this checkout. Over stdio a missing or stale page stops the server (its one client
// is better told so); over HTTP the server stays up and says why its tools fail.
function started(session, args, say, stopOnFail) {
  if (session.mode !== 'browser') {
    say(`MCP server ${version}: headless, ${session.clock === 'realtime' ? `a running clock, a day every ${session.paceMs} ms` : 'the agent\'s clock'}`);
    return;
  }
  say(`MCP server ${version}: the player's browser, over the relay ${session.relay.url}`);
  session.ready({ waitMs: +args.pageWaitMs || 90000, onWait: () => say(`waiting for the game page on the relay (${session.relay.url})...`) }).then((r) => {
    if (r.ok) { say('the game page serves this checkout\'s contract: ready'); return; }
    say(r.why);
    if (r.stale) say('Its tab is older than this checkout: reload the page in the browser (npm run dev assembles it from src/ on every request).');
    else say('Turn agent mode on in the game (Settings → Agent API), which connects it to the relay. The page must come from npm run dev, which hosts the relay (the deployed seriesoftub.es has none), opened by address (http://localhost or http://127.0.0.1, or the IP it is bound to), not a DNS name, which the relay refuses.');
    if (stopOnFail) process.exit(1);
  });
}

if (require.main === module) main();

module.exports = { serverFactory, createHttpServer, serial, parseArgs, parseListen, allowedHosts, instructions, INSTRUCTIONS, MCP_PATH };

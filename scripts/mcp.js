#!/usr/bin/env node
// Series of Tubes as an MCP server: an AI client can play, inspect and debug the game through typed tools.
// It runs locally over stdio and loads the game from this checkout's src/ (scripts/lib/mcp-game.js); nothing is
// hosted, and the game page itself does not change. Register it with a client, for example:
//
//   claude mcp add seriesoftubes -- node /path/to/seriesoftubes/scripts/mcp.js
//
// Protocol: JSON-RPC 2.0, one message per line on stdin and stdout (MCP stdio transport). stdout carries only
// protocol messages; anything else goes to stderr.
const readline = require('node:readline');
const { createSession, TOOLS } = require('./lib/mcp-game');
const { version } = require('../package.json');

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = `Series of Tubes is a cartoon game about building an internet backbone: POPs in cities, links between them, transit, exchanges, PNIs, customers. A game is always loaded (a fresh On-call game in Frankfurt until you start or load another).
Read with status, network, city, find, traceroute, peering_check and hot_spots, or raw with state, results and catalog; schema is the typed contract of every action. Change things with act (arguments are checked, outcome says what happened, dryRun prices a move first), or with screen, panel and click, which show the game's own panels and windows as text with numbered buttons. Time moves only with advance. Games are seeded: the same seed and moves give the same game.
To look into a bug report: load_save with the attached save, then status, hot_spots, and advance with timings.`;

const session = createSession();
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  const { id, method, params = {} } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'seriesoftubes', title: 'Series of Tubes', version },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return error(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const out = tool.run(session, params.arguments || {});
        const errs = session.errors();
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], ...(errs.length ? { _meta: { pageErrors: errs.slice(-5) } } : {}) });
      } catch (e) {
        return reply(id, { content: [{ type: 'text', text: String(e && e.message || e) }], isError: true });
      }
    }
    default:
      if (method && method.startsWith('notifications/')) return undefined;
      if (isRequest) return error(id, -32601, `Method not found: ${method}`);
      return undefined;
  }
}

if (require.main === module) {
  // The game page logs nothing to stdout, but a stray console.log anywhere must not break the protocol.
  console.log = console.info = (...a) => console.error(...a);
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { return error(null, -32700, 'Parse error'); }
    if (Array.isArray(msg)) { for (const m of msg) handle(m); return; }
    handle(msg);
  });
}

module.exports = { handle, TOOLS };

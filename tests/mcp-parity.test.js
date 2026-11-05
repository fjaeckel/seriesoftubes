// One MCP session, two places: the same scripted moves through the headless server's own page and through the agent
// relay into a page in a "browser" (a jsdom page connected to an in-process relay, the player's clock set to the
// agent's) must give the same outcomes, the same money and the same game. The facade is one piece of code; this checks
// that the transport, the async days and the player's rules change nothing a tool would see in a plain game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { load } = require('./harness');
const { createRelay } = require('../scripts/agent/relay');
const { createSession, TOOLS } = require('../scripts/lib/mcp-game');
const { createBrowserSession } = require('../scripts/lib/mcp-browser');

const { freePort } = require('./net');
const { lit } = require('../scripts/lib/js-literal');
let PORT;
test.before(async () => { PORT = await freePort(); });
const HEADLESS_JS = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'mcp-headless.js'), 'utf8');

const SCRIPT = [
  ['status'],
  ['act', { action: 'launchBB', args: { city: 'fra' } }],
  ['act', { action: 'buyTransit', args: { city: 'fra', net: 'cog', tier: 1 } }],
  ['act', { action: 'buildLink', args: { a: 'fra', b: 'ams', tier: 1 } }],
  ['act', { action: 'buildPop', args: { city: 'ams' } }],
  ['act', { action: 'buyTransit', args: { city: 'fra', net: 'nope', tier: 1 } }],
  ['act', { action: 'pni', args: { city: 'fra', net: 'lvl', tier: 1 }, dryRun: true }],
  ['act', { action: 'buyIx', args: { city: 'fra', tier: 1 } }],
  ['act', { action: 'buildPop', args: { city: 'par' } }],
  ['act', { action: 'dkAccept' }],
  ['advance', { days: 30 }],
  ['status'],
  ['hot_spots', { limit: 3 }],
  ['network', { network: 'ggl' }],
  ['traceroute', { from: 'fra', to: 'ggl' }],
  ['peering_check', { network: 'nfx' }],
  ['panel', { city: 'fra', tab: 'peer' }],
  ['act', { action: 'renameGo', args: { name: 'Twin Tubes' } }],
  ['actions'],
  ['advance', { days: 60 }],
  ['state', { path: 'pops' }],
  ['results', { path: 'served' }],
  ['status'],
];
// What differs by nature, not by game: how long a day took on this machine, and entity ids (uid() reads the clock).
const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'timing' || k === 'id' ? undefined : x)));
async function play(s) {
  const out = [];
  for (const [name, args = {}] of SCRIPT) {
    try { out.push([name, strip(await TOOLS.find((t) => t.name === name).run(s, args))]); } catch (e) { out.push([name, { error: String(e.message) }]); }
  }
  return out;
}

test('the same scripted session gives the same outcomes headless and through the relay', async () => {
  const headless = createSession();
  const here = await play(headless);
  headless.close();

  const srv = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  const relay = createRelay({ server: srv });
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  // The player's tab: the same page and seed, the same first game, and the agent's clock in Settings.
  const a = load({ url: `http://127.0.0.1:${PORT}/`, seed: 12345, agent: true, storage: { 'sot-agent': JSON.stringify({ on: true, ms: 0 }) } });
  const s = createBrowserSession({ port: PORT });
  try {
    a.ev(HEADLESS_JS);
    a.ev("__mcpHeadless.newGame({city:'fra',name:'Scratch Networks',preset:'oncall'})");
    a.ev(`window.__AGENT_RELAY_TEST__=true;API_RELAY_HOST='127.0.0.1:${PORT}';apiAgentSync()`);
    // ready() waits for the page itself, generously: jsdom on a busy runner can take seconds to dial.
    assert.deepEqual(await s.ready({ waitMs: 20000 }), { ok: true }, 'the tab serves this checkout\'s contract');
    const there = await play(s);
    for (let i = 0; i < SCRIPT.length; i++) assert.deepEqual(there[i], here[i], `step ${i}: ${SCRIPT[i][0]} ${lit(SCRIPT[i][1] || {})}`);
    assert.ok(here.some(([n, v]) => n === 'act' && v.outcome === 'decision'), 'the script meets a question');
    assert.ok(here.some(([, v]) => v.error), 'and an error');
    assert.equal(a.ev('S.day'), 90);
    assert.deepEqual(a.errors, []);
  } finally {
    a.ev("window.__AGENT_RELAY_TEST__=false;apiAgentSet('on',false)");
    await s.close();
    relay.close();
    await new Promise((r) => srv.close(r));
  }
});

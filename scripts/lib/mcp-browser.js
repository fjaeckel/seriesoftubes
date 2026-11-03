// The MCP server's browser session: the game in the player's tab, over the agent relay (scripts/lib/relay-client.js),
// never a game of this process. The page owns the game (start, saves, seed), the clock (its Settings) and its windows;
// the tools are the page's own facade (src/agent/, TUBES.call), called with ctx.relay, so the same tools play
// the same way as the headless session (scripts/lib/mcp-game.js), with the player's rules on top.
const { load } = require('../../tests/harness');
const { pageCall } = require('./mcp-game');
const { createRelaySession } = require('./relay-client');

// Days the player watches take their time: an advance may run for minutes on a big network.
const ADVANCE_MS = 10 * 60 * 1000;
// The sections of the contract a tab and this checkout must agree on. mode and clock are the live session's own.
const CONTRACT = ['commands', 'view', 'session', 'drafts', 'denied', 'domains', 'state', 'results'];

// This checkout's contract, as a tab built from it would serve it over the relay.
let LOCAL = null;
function localSchema() {
  if (LOCAL) return LOCAL;
  const g = load({ agent: true });
  LOCAL = pageCall(g, 'schema', {}, { relay: true });
  if (g.errors.length) throw new Error(`the page assembled from src/ reported errors: ${g.errors.join('; ')}`);
  g.dom.window.close();
  return LOCAL;
}
// The sections in which a live tab's contract differs from this checkout's: a stale tab keeps names but may have
// changed arguments, domains or docs, so the comparison is deep.
const drift = (live, local = localSchema()) => CONTRACT.filter((k) => JSON.stringify(live && live[k]) !== JSON.stringify(local[k]));

function createBrowserSession(opts = {}) {
  const relay = createRelaySession(opts);
  const session = {
    mode: 'browser', relay,
    async tool(name, args = {}) {
      const r = await relay.call(name, args, { ms: name === 'advance' ? Math.max(relay.config.callMs, ADVANCE_MS) : undefined });
      if (r.refused) throw new Error(r.refused);
      return r.value;
    },
    call(name, args) { return session.tool(name, args); },
    headless() { throw new Error('Not in the player\'s browser: the game there is the player\'s to start, load and save.'); },
    loadSave() { return session.headless(); },
    info() { return { transport: 'relay', relay: relay.url }; },
    errors() { return []; },
    close() { return relay.close(); },
    // Wait for a page on the relay (up to waitMs), then check that it serves this checkout's contract.
    // Resolves {ok:true}, or {ok:false, why} for the server to say and stop on.
    async ready({ waitMs = 90000, onWait } = {}) {
      const deadline = Date.now() + waitMs;
      let said = false, why = 'no answer';
      for (;;) {
        const r = await relay.call('schema', {});
        if (!r.refused && r.value) {
          const d = drift(r.value);
          return d.length ? { ok: false, stale: d, why: `the game page in the browser disagrees with the code on disk (${d.join(', ')})` } : { ok: true };
        }
        why = r.refused || why;
        if (Date.now() >= deadline) return { ok: false, why: `no game page answered on the relay (${relay.url}): ${why}` };
        if (!said && onWait) { said = true; onWait(); }
        await new Promise((res) => setTimeout(res, 1000));
      }
    },
  };
  return session;
}

module.exports = { createBrowserSession, drift, localSchema, CONTRACT };

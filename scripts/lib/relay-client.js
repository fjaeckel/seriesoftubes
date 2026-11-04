// The tool side of the agent relay (scripts/agent/relay.js), for the MCP server's browser session
// (scripts/lib/mcp-browser.js). The game runs in the player's browser, never in this process, connected to the relay
// from Settings. The relay rides the server that serves the page, same port, path /agent (npm run dev, 8080 unless
// told otherwise), so host and port say where the page is served, nothing else. A call travels
// tool → relay → page → TUBES.call and back.
const WebSocket = require('ws');

// A healthy page answers in milliseconds, and a page that goes away has its calls answered at once (by the relay, or
// by the close handler below), so this only catches a page that hangs. Days the player watches take longer: a call
// can ask for more time of its own.
const CALL_MS = 30000;

function createRelaySession(opts = {}) {
  const cfg = {
    host: typeof opts.host === 'string' && opts.host ? opts.host : '127.0.0.1',
    port: +opts.port || 8080,             // the port the game page is served on: the relay rides it
    callMs: +opts.callMs > 0 ? +opts.callMs : CALL_MS,
  };
  const url = `ws://${cfg.host.includes(':') && !cfg.host.startsWith('[') ? `[${cfg.host}]` : cfg.host}:${cfg.port}/agent`;

  let ws = null, connecting = null, id = 0, page = false;
  const pending = new Map();

  function connect() {
    if (ws && ws.readyState === 1) return Promise.resolve();
    if (connecting) return connecting;
    connecting = new Promise((res, rej) => {
      const w = new WebSocket(url);
      let done = false;
      const finish = (e) => { if (done) return; done = true; connecting = null; e ? rej(e) : res(); };
      w.on('open', () => { w.send(JSON.stringify({ kind: 'auth', role: 'tool' })); finish(); });
      w.on('error', (e) => finish(new Error(`relay ${url}: ${e.message}`)));
      w.on('close', () => {
        if (ws === w) { ws = null; page = false; }
        // The socket died with calls in flight: answer them here too, so no tool waits out its timeout on a
        // connection that is already gone (the relay answers for a dead page).
        for (const [k, p] of [...pending]) { pending.delete(k); clearTimeout(p.t); p.res({ error: `relay ${url}: connection closed before the game page answered` }); }
        if (!done) finish(new Error(`relay ${url}: connection closed`));
      });
      w.on('message', (d) => {
        let m; try { m = JSON.parse(String(d)); } catch { return; }
        if (!m || typeof m !== 'object') return;
        if (m.kind === 'presence') { page = !!m.page; return; }
        if (m.kind === 'result' && m.id !== undefined) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.res(m); } }
      });
      ws = w;
    });
    return connecting;
  }

  // One call: {refused} when it could not be answered (no relay, no page, a timeout) or the page's tool threw,
  // else {value}. dayBefore/dayAfter: the game day the page saw around it.
  async function call(tool, args = {}, o = {}) {
    try { await connect(); } catch (e) { return { refused: e.message, value: null }; }
    const k = 't' + (++id), ms = +o.ms > 0 ? +o.ms : cfg.callMs;
    const m = await new Promise((res) => {
      const t = setTimeout(() => { pending.delete(k); res({ error: `no answer from the game page in ${ms / 1000} s (is the tab stuck?)` }); }, ms);
      pending.set(k, { res, t });
      ws.send(JSON.stringify({ kind: 'call', id: k, tool, args }));
    });
    if (m.error) return { refused: m.error, value: null, dayBefore: m.dayBefore, dayAfter: m.dayAfter };
    return { refused: null, value: m.value === undefined ? null : m.value, dayBefore: m.dayBefore, dayAfter: m.dayAfter };
  }

  return {
    config: cfg, url, call, connect,
    get page() { return page; },
    async close() { try { ws && ws.close(1000); } catch {} },
  };
}

module.exports = { createRelaySession, CALL_MS };

#!/usr/bin/env node
// The agent relay: a WebSocket router between the game page and tool clients. The page (src/agent/80-relay.js, agent
// mode in Settings) connects as the one "page"; tools (the MCP server, a script) connect as "tool" peers and send
// {kind:'call', id, tool, args}, which the relay routes to the page and back as {kind:'result', id, ...}. It holds no
// game state and knows no game logic: a dumb router (every client states its role; there is no token), so the whole
// player/operator boundary stays in the page's facade and in the driver.
//
// The relay rides the page's own HTTP server, on the same port, at the path AGENT_PATH: there is no second port, and
// the page infers its endpoint from where it was loaded (location.host). `npm run dev` hosts it in-process
// (scripts/dev.js); `createRelay({ server })` is the whole file, shared by the dev server and the tests.
//
// Security: no token. The bind address is the dev server's --host, loopback unless the operator chooses otherwise;
// what can reach that address may drive a game whose player turned agent mode on. What no bind address opens up: a
// website in the player's browser dialing the relay. Browsers send Origin on every WebSocket handshake and Node
// clients do not, and an Origin that does not name this very host (the page's own server) is refused below.
// Same-origin alone would let DNS rebinding through (evil.example re-pointed at 127.0.0.1 is "same-origin" with
// itself), so the Host must also be an address, never a name: an IP literal, localhost or *.localhost. Every client
// still states its role before anything routes, and one page at a time: a new page replaces the old one (a reload).
const { WebSocketServer } = require('ws');

const AUTH_MS = 5000;   // a client must state its role within this, or the socket closes
const AGENT_PATH = '/agent';   // the relay's path on the page's own HTTP port

// `server`: the http.Server that serves the game page. The WebSocket rides it, same port.
// Host header → whether it names this machine by address (IP literal, localhost) rather than by a
// DNS name someone else controls.
function hostOk(h) {
  if (typeof h !== 'string' || !h) return false;
  let name;
  try { name = new URL(`http://${h}`).hostname.toLowerCase(); } catch { return false; }
  return name === 'localhost' || name.endsWith('.localhost') || /^\[[0-9a-f:.]+\]$/.test(name) || /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
}

function createRelay({ server } = {}) {
  if (!server) throw new Error('createRelay needs the http.Server that serves the page');
  const wss = new WebSocketServer({ server, path: AGENT_PATH });
  let page = null;                                  // the one connected game page
  const tools = new Set();                          // connected tool clients
  const pending = new Map();                        // relay-scoped call id → {tool, id, page}
  let seq = 0;

  const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  // Presence goes both ways: tools learn whether a page is connected, the page learns how many
  // tools are — agent mode holds the game's clock while none are (src/agent/80-relay.js).
  const presence = () => {
    const p = !!(page && page.readyState === 1);
    const n = [...tools].filter((t) => t.readyState === 1).length;
    for (const t of tools) send(t, { kind: 'presence', page: p });
    if (page) send(page, { kind: 'presence', tools: n });
  };

  wss.on('connection', (ws, req) => {
    // Browsers send Origin on every WebSocket handshake, Node clients (our tools) never do.
    // Same-origin only, host against Host: a foreign site must not dial the loopback relay
    // and drive (or replace) the game — this closes that hole at no cost to either side.
    if (!hostOk(req.headers.host)) { ws.close(4004, 'bad host'); return; }
    const origin = req.headers.origin;
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { host = null; }
      if (!host || host !== req.headers.host) { ws.close(4004, 'bad origin'); return; }
    }
    let role = null;
    const authTimer = setTimeout(() => { if (!role) ws.close(4003, 'no auth'); }, AUTH_MS);
    const dead = () => {
      clearTimeout(authTimer);
      if (ws === page) {
        page = null;
        // Answer the calls this page was sent with, so no tool waits out its timeout: the
        // call is lost (reload, tab closed, replaced), not pending — say so, at once.
        for (const [id, p] of [...pending]) if (p.page === ws) {
          pending.delete(id);
          send(p.tool, { kind: 'result', id: p.id, error: 'the game page disconnected before answering (reload or another tab took over)' });
        }
      }
      tools.delete(ws);
      for (const [id, p] of [...pending]) if (p.tool === ws) pending.delete(id);
      presence();                     // tools left: the page must know, to hold its clock
    };
    ws.on('message', (data) => {
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (!role) {
        if (m.kind !== 'auth' || (m.role !== 'page' && m.role !== 'tool')) { ws.close(4001, 'bad role'); return; }
        role = m.role; clearTimeout(authTimer);
        if (role === 'page') { if (page && page.readyState === 1) page.close(4000, 'replaced'); page = ws; presence(); }
        else { tools.add(ws); presence(); }
        return;
      }
      if (role === 'tool' && m.kind === 'call' && m.id !== undefined && typeof m.tool === 'string') {
        if (!page || page.readyState !== 1) { send(ws, { kind: 'result', id: m.id, error: 'no game page connected: open the game in a browser with the relay on in Settings' }); return; }
        const id = 'r' + (++seq);
        pending.set(id, { tool: ws, id: m.id, page });
        send(page, { kind: 'call', id, tool: m.tool, args: m.args || {} });
        return;
      }
      if (role === 'page' && m.kind === 'result' && m.id !== undefined) {
        const p = pending.get(m.id); if (!p) return;
        pending.delete(m.id);
        send(p.tool, { kind: 'result', id: p.id, dayBefore: m.dayBefore, dayAfter: m.dayAfter, value: m.value, error: m.error });
      }
    });
    ws.on('close', dead);
    ws.on('error', () => dead());
  });

  return {
    wss, path: AGENT_PATH,
    // What the relay holds right now, so tests wait for a state instead of sleeping.
    status: () => ({ page: !!(page && page.readyState === 1), tools: [...tools].filter((t) => t.readyState === 1).length, calls: pending.size }),
    close() { for (const c of [page, ...tools]) { try { c.close(4002, 'relay shutdown'); } catch {} } try { wss.close(); } catch {} },
  };
}

module.exports = { createRelay };

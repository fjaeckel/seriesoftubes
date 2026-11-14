#!/usr/bin/env node
// The agent relay: a WebSocket router between the game page and tool clients. The page (src/agent/80-relay.js, agent
// mode in Settings) connects as the one "page"; tools (the MCP server, a script) connect as "tool" peers and send
// {kind:'call', id, tool, args}, which the relay routes to the page and back as {kind:'result', id, ...}. It holds no
// game state and knows no game logic: a dumb router (every client states its role and this run's token), so the whole
// player/operator boundary stays in the page's facade and in the driver.
//
// The relay rides the page's own HTTP server, on the same port, at the path AGENT_PATH: there is no second port, and
// the page infers its endpoint from where it was loaded (location.host). `npm run dev` hosts it in-process
// (scripts/dev.js); `createRelay({ server, token })` is the whole file, shared by the dev server and the tests.
//
// Security: a token per run. The dev server makes a random one, puts it in the page it serves to this machine (or the
// player opens the link it prints, #agent=TOKEN) and in a file only its user can read (relayTokenFile), which the MCP
// server reads. Every client, page or tool, must send it with its role: without it nothing reaches the page, and no
// stranger can stand in for the page (replace the player's tab and answer the agents' calls with what it likes).
// The page holds the token, so what the token alone does not stop is a website in the player's browser dialing the
// relay (or reading a page it fetched). Browsers send Origin on every WebSocket handshake and Node clients do not, and an Origin that does not name this very host (the page's own server) is refused below.
// Same-origin alone would let DNS rebinding through (evil.example re-pointed at 127.0.0.1 is "same-origin" with
// itself), so the Host must also be an address, never a name: an IP literal, localhost or *.localhost. Every client
// still states its role and the token before anything routes, and one page at a time: a new page (with the token)
// replaces the old one (a reload).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
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

// The run's token: random, URL-safe (it travels in a link's #fragment).
const newRelayToken = () => crypto.randomBytes(24).toString('base64url');
// Where the dev server serving `port` keeps its token for the MCP server: one file per port, so several dev servers
// can run. SOT_RELAY_TOKEN_DIR moves the folder (the container's checkout is read-only).
const relayTokenFile = (port, dir = process.env.SOT_RELAY_TOKEN_DIR) => path.join(dir || path.join(__dirname, '..', '..', '.dev-agent'), `relay-${+port || 8080}.token`);
function writeRelayToken(file, token) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { fs.unlinkSync(file); } catch {}                // a fresh file, so the mode below is the one it gets
  fs.writeFileSync(file, token + '\n', { mode: 0o600, flag: 'wx' });
  fs.chmodSync(file, 0o600);                           // whatever the umask said
}
const readRelayToken = (file) => { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; } };
// Constant time; hashing first makes the lengths equal, so the length does not leak either.
const sameToken = (a, b) => typeof a === 'string' && crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(String(b)).digest());

function createRelay({ server, token } = {}) {
  if (!server) throw new Error('createRelay needs the http.Server that serves the page');
  if (typeof token !== 'string' || token.length < 16) throw new Error('createRelay needs a token (16 characters or more)');
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
        // Checked before a page may replace the live one: a client without the token never gets that far.
        if (!sameToken(m.token, token)) { ws.close(4005, 'bad token'); return; }
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

module.exports = { createRelay, hostOk, newRelayToken, relayTokenFile, writeRelayToken, readRelayToken, AGENT_PATH };

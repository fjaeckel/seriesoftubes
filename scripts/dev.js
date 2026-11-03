#!/usr/bin/env node
// Development server: http://127.0.0.1:8080 (--host/--port, or HOST=/PORT=, to change). The page is assembled from
// src/ on every request, static files come straight from site/, and the browser reloads itself when you save a file.
// The page is not version-stamped, so the game runs in dev mode (IS_DEV) like a local copy always has, and it is
// the development page: with the agent facade (src/agent/, window.TUBES) that the page players get has not.
// The agent relay rides this same server, same port, path /agent: agent mode in the game's Settings dials it, and
// tools (node scripts/mcp.js --browser) drive the page this server serves.
// Binds loopback by default; --host binds wherever the operator chooses, the relay with it. Plain node:http and the
// relay's ws. For the production build as GitHub Pages will serve it: npm run serve.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { assemble, ROOT } = require('./lib/page');
const { createRelay } = require('./agent/relay');

// --host/--port; a bare --host binds loopback (never undefined, which would listen on every interface).
const argOf = (k) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null; };
const HOST = argOf('--host') || process.env.HOST || '127.0.0.1';
const PORT = (() => { const p = +argOf('--port'); return Number.isInteger(p) && p > 0 && p < 65536 ? p : (+process.env.PORT || 8080); })();
const SITE = path.join(ROOT, 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json' };
const RELOAD = '<script>new EventSource("/__dev").onmessage=()=>location.reload()</script>';
const clients = new Set();

function page() {
  const { html, map } = assemble({ dev: true });
  // Errors report a line of the assembled page; the console also says which file under src/ that is.
  const hint = `<script>addEventListener('error',e=>{const n=e.lineno,m=n&&(${JSON.stringify(map)}).find(m=>n>=m.from&&n<=m.to);if(m)console.warn('↑ src/'+m.file+':'+(n-m.from+1))});</script>`;
  return html.replace('</body>', `${hint}${RELOAD}</body>`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__dev') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    res.write(': hi\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
      return res.end(page());
    }
    const file = path.join(SITE, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.)+/, ''));
    if (!file.startsWith(SITE + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      return res.end(fs.readFileSync(path.join(SITE, '404.html')));
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(e && e.stack || e));
  }
});
const relay = createRelay({ server });
server.on('error', (e) => { console.error(`error: could not listen on ${HOST}:${PORT}: ${e.message}`); process.exit(1); });
server.listen(PORT, HOST, () => {
  // The banner reports the socket's real address, not the flag it was asked for.
  const ad = server.address(), at = `${ad.family === 'IPv6' ? `[${ad.address}]` : ad.address}:${ad.port}`;
  const local = /^(127\.|::1$|localhost$)/.test(ad.address);
  console.log(`Series of Tubes (dev): http://${at}/  — edits in src/ and site/ reload the page`);
  console.error(`[series-of-tubes] agent relay on ws://${at}${relay.path} (no token)${local ? '' : `: bound to ${ad.address}, so anything that can reach this address can drive a game whose player turned agent mode on`}`);
  console.error('[series-of-tubes] to let an agent play: Settings → Agent API in the game, then node scripts/mcp.js --browser');
});
const shutdown = () => { relay.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

let timer = null;
for (const dir of ['src', 'site']) {
  fs.watch(path.join(ROOT, dir), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => { for (const c of clients) c.write('data: reload\n\n'); }, 100);
  });
}

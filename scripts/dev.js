#!/usr/bin/env node
// Development server: http://127.0.0.1:8080 (--host/--port, or SOT_DEV_HOST=/PORT=, to change; --https for a phone on the LAN). The page is assembled from
// src/ on every request, static files come straight from site/, and the browser reloads itself when you save a file.
// The page is not version-stamped, so the game runs in dev mode (IS_DEV) like a local copy always has, and it is
// the development page: with the agent facade (src/agent/, window.TUBES) that the page players get has not.
// The agent relay rides this same server, same port, path /agent: agent mode in the game's Settings dials it, and
// tools (node scripts/mcp.js --browser) drive the page this server serves.
// Binds loopback by default; --host binds wherever the operator chooses, the relay with it. Plain node:http and the
// relay's ws. For the production build as GitHub Pages will serve it: npm run serve.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { assemble, ROOT } = require('./lib/page');
const { createRelay } = require('./agent/relay');
const { lit } = require('./lib/js-literal');

// --host/--port; a bare --host binds loopback (never undefined, which would listen on every interface).
const argOf = (k) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null; };
// Not $HOST: some shells (tcsh) export it as the machine's name, which would quietly bind to the LAN.
// --https: for a phone on the LAN (crypto.subtle, which Multimode needs, exists only on secure pages), so it listens on
// every interface unless --host says otherwise.
const HTTPS = process.argv.includes('--https');
const HOST = argOf('--host') || process.env.SOT_DEV_HOST || (HTTPS ? '0.0.0.0' : '127.0.0.1');
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
  const hint = `<script>addEventListener('error',e=>{const n=e.lineno,m=n&&(${lit(map)}).find(m=>n>=m.from&&n<=m.to);if(m)console.warn('↑ src/'+m.file+':'+(n-m.from+1))});</script>`;
  return html.replace('</body>', `${hint}${RELOAD}</body>`);
}

/* --https: a local certificate authority and a certificate for this machine's names and LAN addresses, kept in .dev-certs/
   (git-ignored). A phone trusts the authority once (it is served at /dev-ca.crt), then every page here is secure. The
   certificate is made again when the addresses change. Needs openssl (macOS and Linux have it). */
function devCerts() {
  const dir = path.join(ROOT, '.dev-certs'), f = (n) => path.join(dir, n), run = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: 'pipe' });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ips = ['127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)];
  const names = ['localhost', `${os.hostname().replace(/\.local$/, '')}.local`];
  const sans = [...names.map((n) => `DNS:${n}`), ...ips.map((i) => `IP:${i}`)].join(',');
  if (!fs.existsSync(f('ca.crt'))) {
    fs.writeFileSync(f('ca.cnf'), '[req]\ndistinguished_name=dn\n[dn]\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
    run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825', '-keyout', 'ca.key', '-out', 'ca.crt',
      '-subj', '/CN=Series of Tubes dev CA', '-config', 'ca.cnf', '-extensions', 'ca');
  }
  if (!fs.existsSync(f('cert.pem')) || (fs.existsSync(f('sans.txt')) ? fs.readFileSync(f('sans.txt'), 'utf8') : '') !== sans) {
    fs.writeFileSync(f('leaf.cnf'), `basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${sans}\n`);
    run('req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-keyout', 'key.pem', '-out', 'leaf.csr', '-subj', '/CN=Series of Tubes dev');
    run('x509', '-req', '-sha256', '-days', '397', '-in', 'leaf.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'cert.pem', '-extfile', 'leaf.cnf');
    fs.writeFileSync(f('sans.txt'), sans);
  }
  return { key: fs.readFileSync(f('key.pem')), cert: fs.readFileSync(f('cert.pem')), ca: fs.readFileSync(f('ca.crt')), ips };
}
const TLS = HTTPS ? devCerts() : null;

const server = (HTTPS ? (h) => https.createServer({ key: TLS.key, cert: TLS.cert }, h) : http.createServer)((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // The authority's certificate, for a phone to install (iPhone: then Settings → General → About → Certificate Trust Settings).
  if (TLS && url.pathname === '/dev-ca.crt') {
    res.writeHead(200, { 'content-type': 'application/x-x509-ca-cert', 'content-disposition': 'attachment; filename="series-of-tubes-dev-ca.crt"' });
    return res.end(TLS.ca);
  }
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
    // The stack goes to the terminal running the server, never into the response.
    console.error(e);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Could not build the page: see the terminal running npm run dev.');
  }
});
const relay = createRelay({ server });
server.on('error', (e) => { console.error(`error: could not listen on ${HOST}:${PORT}: ${e.message}`); process.exit(1); });
server.listen(PORT, HOST, () => {
  // The banner reports the socket's real address, not the flag it was asked for.
  const ad = server.address(), at = `${ad.family === 'IPv6' ? `[${ad.address}]` : ad.address}:${ad.port}`;
  const local = /^(127\.|::1$|localhost$)/.test(ad.address);
  console.log(`Series of Tubes (dev): ${HTTPS ? 'https' : 'http'}://${at}/  — edits in src/ and site/ reload the page`);
  if (TLS) {
    // The LAN addresses, Wi-Fi first (the order the system lists them); loopback is no use to a phone.
    const urls = (ad.address === '0.0.0.0' || ad.address === '::' ? TLS.ips.filter((i) => i !== '127.0.0.1') : [ad.address]).map((i) => `https://${i}:${ad.port}/`);
    const u = urls[0] || `https://localhost:${ad.port}/`;
    console.log(`  on your phone (same Wi-Fi): ${urls.join('  ')}`);
    console.log(`  first time on a phone: open ${u}dev-ca.crt (accept the warning once), install the profile,`);
    console.log('  then iPhone: Settings → General → About → Certificate Trust Settings → turn on "Series of Tubes dev CA"');
    console.log(`  play against a server: ${u}#join=wss://your.server/fed`);
  }
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

#!/usr/bin/env node
// Development server: http://127.0.0.1:8080 (--host/--port, or SOT_DEV_HOST=/PORT=, to change; --https for a phone on the LAN). The page is assembled from
// src/ on every request, static files come straight from site/, and the browser reloads itself when you save a file.
// The page is not version-stamped, so the game runs in dev mode (IS_DEV) like a local copy always has, and it is
// the development page: with the agent facade (src/agent/, window.TUBES) that the page players get has not.
// The agent relay rides this same server, same port, path /agent: agent mode in the game's Settings dials it, and
// tools (node scripts/mcp.js --browser) drive the page this server serves.
// Binds loopback by default (--https too); --host binds wherever the operator chooses, the relay with it. Every run makes
// a token for the relay: in the page it serves to this machine, in the link it prints, and in a file only this user can
// read (scripts/agent/relay.js relayTokenFile) for node scripts/mcp.js --browser. Plain node:http and the relay's ws. For the production build as GitHub Pages will serve it: npm run serve.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { assemble, ROOT } = require('./lib/page');
const { createRelay, hostOk, newRelayToken, relayTokenFile, writeRelayToken } = require('./agent/relay');
const { lit } = require('./lib/js-literal');

// --host/--port; a bare --host binds loopback (never undefined, which would listen on every interface).
const argOf = (k) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null; };
// Not $HOST: some shells (tcsh) export it as the machine's name, which would quietly bind to the LAN.
// --https: for a phone on the LAN (crypto.subtle, which Multimode needs, exists only on secure pages). It binds loopback
// like everything else: a phone needs --host 0.0.0.0 (or the LAN address), the operator's choice, said in the banner.
const HTTPS = process.argv.includes('--https');
const HOST = argOf('--host') || process.env.SOT_DEV_HOST || '127.0.0.1';
const PORT = (() => { const p = +argOf('--port'); return Number.isInteger(p) && p > 0 && p < 65536 ? p : (+process.env.PORT || 8080); })();
const SITE = path.join(ROOT, 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json' };
const RELOAD = '<script>new EventSource("/__dev").onmessage=()=>location.reload()</script>';
const clients = new Set();
const TOKEN = newRelayToken();

// A request from this machine (any of its own addresses: a browser here may use the LAN address), to an address
// rather than a DNS name (a rebound name would hand the token to that name's page).
const OWN = () => new Set(['127.0.0.1', '::1', ...Object.values(os.networkInterfaces()).flat().filter(Boolean).map((i) => i.address)]);
const fromHere = (req) => hostOk(req.headers.host) && OWN().has(String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''));

function page(req) {
  const { html, map } = assemble({ dev: true });
  // Errors report a line of the assembled page; the console also says which file under src/ that is.
  const hint = `<script>addEventListener('error',e=>{const n=e.lineno,m=n&&(${lit(map)}).find(m=>n>=m.from&&n<=m.to);if(m)console.warn('↑ src/'+m.file+':'+(n-m.from+1))});</script>`;
  // The relay's token goes only to a browser on this machine; another device opens the link with #agent= (the banner).
  const tok = fromHere(req) ? `<meta name="sot-agent-token" content="${TOKEN}">` : '';
  return html.replace('</head>', `${tok}</head>`).replace('</body>', `${hint}${RELOAD}</body>`);
}

/* --https: a local certificate authority and a certificate for this machine's names and LAN addresses, kept in .dev-certs/
   (git-ignored, its keys readable by this user only). A phone trusts the authority once (it is served at /dev-ca.crt),
   then every page here is secure. Trusting an authority is a big thing to ask of a phone, so this one can sign for
   nothing but local names and private addresses (critical name constraints) and lives CA_DAYS; an older or
   unconstrained one is replaced (the phone then trusts the new one once more). The certificate is made again when the
   addresses change, the authority changes or it nears its end. Needs openssl (macOS and Linux have it). */
const CA_DAYS = 180, LEAF_DAYS = 90, RENEW_S = 14 * 86400;
const CA_LIMITS = ['DNS:localhost', 'DNS:.local', 'IP:127.0.0.0/255.0.0.0', 'IP:10.0.0.0/255.0.0.0', 'IP:172.16.0.0/255.240.0.0',
  'IP:192.168.0.0/255.255.0.0', 'IP:169.254.0.0/255.255.0.0', 'IP:100.64.0.0/255.192.0.0'].map((n) => `permitted;${n}`).join(',');
function devCerts() {
  const dir = path.join(ROOT, '.dev-certs'), f = (n) => path.join(dir, n), run = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: 'pipe' });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  // Still valid for RENEW_S (openssl -checkend exits non-zero otherwise).
  const fresh = (n) => { try { run('x509', '-in', n, '-noout', '-checkend', String(RENEW_S)); return true; } catch { return false; } };
  const constrained = () => { try { return /Name Constraints: critical/.test(String(run('x509', '-in', 'ca.crt', '-noout', '-text'))); } catch { return false; } };
  // Only the addresses the authority may sign for: one other address in the certificate would void all of it.
  const priv = (a) => /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a);
  const ips = ['127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal && priv(i.address)).map((i) => i.address)];
  const names = ['localhost', `${os.hostname().replace(/\.local$/, '')}.local`];
  const sans = [...names.map((n) => `DNS:${n}`), ...ips.map((i) => `IP:${i}`)].join(',');
  let newCa = false;
  if (!fs.existsSync(f('ca.crt')) || !fs.existsSync(f('ca.key')) || !constrained() || !fresh('ca.crt')) {
    fs.writeFileSync(f('ca.cnf'), `[req]\ndistinguished_name=dn\n[dn]\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nnameConstraints=critical,${CA_LIMITS}\n`);
    run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', String(CA_DAYS), '-keyout', 'ca.key', '-out', 'ca.crt',
      '-subj', '/CN=Series of Tubes dev CA', '-config', 'ca.cnf', '-extensions', 'ca');
    newCa = true;
    console.log('  made a new dev certificate authority: a phone that trusted the old one must trust this one (/dev-ca.crt)');
  }
  fs.chmodSync(f('ca.key'), 0o600);
  if (newCa || !fs.existsSync(f('cert.pem')) || !fresh('cert.pem') || (fs.existsSync(f('sans.txt')) ? fs.readFileSync(f('sans.txt'), 'utf8') : '') !== sans) {
    fs.writeFileSync(f('leaf.cnf'), `basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${sans}\n`);
    run('req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-keyout', 'key.pem', '-out', 'leaf.csr', '-subj', '/CN=Series of Tubes dev');
    run('x509', '-req', '-sha256', '-days', String(LEAF_DAYS), '-in', 'leaf.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'cert.pem', '-extfile', 'leaf.cnf');
    fs.writeFileSync(f('sans.txt'), sans);
  }
  fs.chmodSync(f('key.pem'), 0o600);
  return { key: fs.readFileSync(f('key.pem')), cert: fs.readFileSync(f('cert.pem')), ca: fs.readFileSync(f('ca.crt')), ips, dir };
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
      return res.end(page(req));
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
const relay = createRelay({ server, token: TOKEN });
const TOKEN_FILE = relayTokenFile(PORT);
server.on('error', (e) => { console.error(`error: could not listen on ${HOST}:${PORT}: ${e.message}`); process.exit(1); });
server.listen(PORT, HOST, () => {
  // Only once the port is ours: a second dev server that failed to bind must not overwrite the first one's token.
  try { writeRelayToken(TOKEN_FILE, TOKEN); } catch (e) { console.error(`[series-of-tubes] could not write the relay token to ${TOKEN_FILE}: ${e.message} (set SOT_RELAY_TOKEN_DIR)`); }
  // The banner reports the socket's real address, not the flag it was asked for.
  const ad = server.address(), at = `${ad.family === 'IPv6' ? `[${ad.address}]` : ad.address}:${ad.port}`;
  const local = /^(127\.|::1$|localhost$)/.test(ad.address);
  console.log(`Series of Tubes (dev): ${HTTPS ? 'https' : 'http'}://${at}/  — edits in src/ and site/ reload the page`);
  if (TLS && local) console.log('  for a phone on the same Wi-Fi: npm run dev -- --https --host 0.0.0.0 (it binds this machine only otherwise)');
  if (TLS && !local) {
    // The LAN addresses, Wi-Fi first (the order the system lists them); loopback is no use to a phone.
    const urls = (ad.address === '0.0.0.0' || ad.address === '::' ? TLS.ips.filter((i) => i !== '127.0.0.1') : [ad.address]).map((i) => `https://${i}:${ad.port}/`);
    const u = urls[0] || `https://localhost:${ad.port}/`;
    console.log(`  on your phone (same Wi-Fi): ${urls.join('  ')}`);
    console.log(`  first time on a phone: open ${u}dev-ca.crt (accept the warning once), install the profile,`);
    console.log('  then iPhone: Settings → General → About → Certificate Trust Settings → turn on "Series of Tubes dev CA"');
    console.log(`  play against a server: ${u}#join=wss://your.server/fed`);
  }
  console.error(`[series-of-tubes] agent relay on ws://${at}${relay.path} (token in ${TOKEN_FILE})${local ? '' : `: bound to ${ad.address}, so anything that can reach this address can try it (the token keeps it out)`}`);
  console.error('[series-of-tubes] to let an agent play: Settings → Agent API in the game, then node scripts/mcp.js --browser');
  // Pages served to this machine carry the token; a browser elsewhere (another device, a container's host) gets it here.
  if (!local && !HTTPS) console.error(`[series-of-tubes] a browser not on this machine: open http://ADDRESS:${ad.port}/#agent=${TOKEN} (from a container's host: http://localhost:${ad.port}/#agent=${TOKEN})`);
});
// The token dies with the run; a file left behind would only point the MCP server at a relay that is gone.
const shutdown = () => { relay.close(); try { if (fs.readFileSync(TOKEN_FILE, 'utf8').trim() === TOKEN) fs.unlinkSync(TOKEN_FILE); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

let timer = null;
for (const dir of ['src', 'site']) {
  fs.watch(path.join(ROOT, dir), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => { for (const c of clients) c.write('data: reload\n\n'); }, 100);
  });
}

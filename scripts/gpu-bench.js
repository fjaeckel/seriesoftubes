#!/usr/bin/env node
// The map's speed on your own graphics card, 2D against WebGL, in the browser you play in:
//
//   npm run bench:gpu -- --save path/to/save.json      (an exported save, or a plain one; default: the perf fixture)
//
// then open the printed address in Chrome, Edge or Firefox and press Start. Headless benchmarks (npm run perf) draw the
// canvas in software, so they cannot say what a GPU does; this one runs where the GPU is. Each scenario plays a few
// seconds with the 2D map and with the WebGL tubes, the table shows in the page, and the server prints it here when the
// run ends. Options: --port N (8090), --secs N per scenario (6), --host 0.0.0.0 to open it from a phone on your network,
// --out FILE to also write the table there. Under WSL, the Windows browser reaches http://localhost:PORT as it is.
// In the address: ?only=gl or ?only=2d (one renderer), ?scen=x1-mid,pan (some scenarios), ?dpr=2 (a 4K screen's
// pixels on a smaller one), ?auto (start at once). The game's clock keeps running: incidents do not pause it.
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { assemble, ROOT } = require('./lib/page');
const { lit } = require('./lib/js-literal');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PORT = +opt('port', 8090), HOST = opt('host', 'localhost'), SECS = +opt('secs', 6), OUT = opt('out', null);
const SAVE = path.resolve(opt('save', path.join(ROOT, 'tests', 'fixtures', 'big-network.json')));
const SITE = path.join(ROOT, 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// An exported save is {app, version, S}; a plain one is S itself.
const save = (() => { const d = JSON.parse(fs.readFileSync(SAVE, 'utf8')); return JSON.stringify({ S: d && d.S && d.S.pops ? d.S : d }); })();
const client = fs.readFileSync(path.join(__dirname, 'lib', 'gpu-bench-client.js'), 'utf8');
const page = () => assemble().html.replace('</body>', `<script>window.__BENCH__=${lit({ secs: SECS })};</script><script>${client}</script></body>`);

/* Only the page this server hands out may talk to it. Any other site open in the same browser could otherwise
   POST results (printed to this terminal, written to --out) or, through DNS rebinding, read the save. So the Host
   header must name this server, and a POST must come from its own origin. */
const HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', HOST.includes(':') ? `[${HOST}]` : HOST]);
if (HOST === '0.0.0.0') for (const l of Object.values(os.networkInterfaces()).flat()) if (l && l.family === 'IPv4') HOSTS.add(l.address);
const hostOk = (h) => { const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(h || ''); return !!m && HOSTS.has(m[1].toLowerCase()) && (m[2] ? +m[2] : 80) === PORT; };
const MAX_BODY = 2 * 1048576;
// What the page sends is printed and written as text: no terminal escape sequences or other control characters.
const plain = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/g, '');

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (!hostOk(req.headers.host)) { res.writeHead(421); return res.end(); }
    if (url.pathname === '/' || url.pathname === '/index.html') { res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' }); return res.end(page()); }
    if (url.pathname === '/__bench/save.json') { res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' }); return res.end(save); }
    if (url.pathname === '/__bench/results' && req.method === 'POST') {
      if (req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403); return res.end(); }
      let body = '', size = 0, over = false;
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { over = true; req.destroy(); return; } body += c; });
      req.on('end', () => {
        if (over) return;
        try { const r = JSON.parse(body), md = plain(r && r.md); console.log('\n' + md + '\n'); if (OUT) { fs.writeFileSync(OUT, md + '\n\n```json\n' + plain(JSON.stringify(r, null, 1)) + '\n```\n'); console.log(`(also written to ${OUT})`); } } catch (e) { console.error('bad results:', e.message); }
        res.writeHead(204); res.end(); });
      return;
    }
    // The service worker would cache this page over the real one: none here.
    if (url.pathname === '/sw.js') { res.writeHead(404); return res.end(); }
    const file = path.join(SITE, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.)+/, ''));
    if (!file.startsWith(SITE + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    // A malformed address (decodeURIComponent) or a missing file: the details stay in this terminal.
    console.error('bench server:', e && e.message || e);
    res.writeHead(e instanceof URIError ? 400 : 500); res.end();
  }
}).listen(PORT, HOST, () => {
  const s = JSON.parse(save).S;
  console.log(`GPU benchmark: ${path.basename(SAVE)} (${Object.keys(s.pops || {}).length} POPs, ${(s.links || []).length} links), ${SECS}s per scenario`);
  console.log(`Open http://localhost:${PORT}/ in your browser, press Start and keep the tab in front.`);
  if (HOST === '0.0.0.0') for (const l of Object.values(os.networkInterfaces()).flat()) if (l && l.family === 'IPv4' && !l.internal) console.log(`  from another device: http://${l.address}:${PORT}/`);
  console.log('Ctrl+C to stop.');
});

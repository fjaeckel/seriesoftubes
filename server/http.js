// Small helpers around node:http: JSON bodies, cookies, static files, security headers.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json' };

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJson(req, limit) {
  const t = await readBody(req, limit);
  if (!t) return {};
  try { const j = JSON.parse(t); if (j && typeof j === 'object') return j; } catch (_) {}
  throw new HttpError(400, 'Body must be a JSON object');
}
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { ...SEC, 'Content-Length': buf.length, ...headers });
  res.end(buf);
}
const json = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
const html = (res, status, body, headers = {}) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
const redirect = (res, to, headers = {}) => { res.writeHead(303, { ...SEC, Location: to, ...headers }); res.end(); };

/* Serves files from root without ever leaving it. `transform(name, buf)` may rewrite a file once (cached). */
function staticFiles(root, transform) {
  const cache = new Map();
  return (req, res, pathname) => {
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + path.posix.normalize('/' + rel));
    if (!file.startsWith(path.resolve(root) + path.sep)) return false;
    let st; try { st = fs.statSync(file); } catch (_) { return false; }
    if (!st.isFile()) return false;
    const ext = path.extname(file);
    let hit = cache.get(file);
    if (!hit || hit.mtime !== st.mtimeMs) {
      let buf = fs.readFileSync(file);
      if (transform) buf = transform(path.basename(file), buf);
      hit = { buf, mtime: st.mtimeMs };
      // Text compresses 5 to 6 times; the game page is most of a megabyte, so this matters on slow links.
      if (/^(\.html|\.js|\.css|\.json|\.svg|\.txt|\.xml|\.webmanifest)$/.test(ext) && buf.length > 1024) {
        hit.br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
        hit.gz = zlib.gzipSync(buf, { level: 9 });
      }
      cache.set(file, hit);
    }
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600', Vary: 'Accept-Encoding' };
    const ae = String(req.headers['accept-encoding'] || '');
    let body = hit.buf;
    if (hit.br && /\bbr\b/.test(ae)) { body = hit.br; headers['Content-Encoding'] = 'br'; } else if (hit.gz && /\bgzip\b/.test(ae)) { body = hit.gz; headers['Content-Encoding'] = 'gzip'; }
    if (req.method === 'HEAD') { res.writeHead(200, { ...SEC, ...headers, 'Content-Length': body.length }); res.end(); } else send(res, 200, body, headers);
    return true;
  };
}

module.exports = { HttpError, readBody, readJson, send, json, html, redirect, staticFiles, SEC };

// The shipped page's Content Security Policy (scripts/lib/csp.js), a <meta> tag the build adds last: GitHub Pages sends
// no headers of ours. It must stop injected scripts and stray connections, and still allow everything the page really
// loads: its inline scripts, the dictionaries, the visit counter, the workers, the service worker, its same-origin
// files and any Multimode server.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inlineScripts } = require('../scripts/lib/csp');
const { assemble } = require('../scripts/lib/page');

const ROOT = path.join(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-csp-'));
execFileSync(process.execPath, ['scripts/build.js'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, OUT, VERSION: '1.2.3', BUILD_DATE: '2026-10-27' } });
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const ORIGIN = 'https://seriesoftub.es';

const csp = () => {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(m, 'the built page has a Content-Security-Policy');
  return Object.fromEntries(m[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
};
// A small CSP source matcher (CSP 3, the parts the policy uses): 'self', scheme sources, hosts with *. and :*, paths.
function allows(list, url) {
  const u = new URL(url, ORIGIN + '/'), o = new URL(ORIGIN);
  return list.some((s) => {
    if (s === "'self'") return u.host === o.host && (u.protocol === o.protocol || (o.protocol === 'https:' && u.protocol === 'wss:'));
    if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return u.protocol === s;
    const m = /^(?:([a-z]+):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?(\/.*)?$/.exec(s);
    if (!m || s.startsWith("'")) return false;
    const [, scheme, wild, host, port, p] = m;
    if (scheme ? u.protocol !== scheme + ':' : u.protocol !== 'https:' && u.protocol !== 'wss:') return false;
    if (wild ? !u.hostname.endsWith('.' + host) : u.hostname !== host) return false;
    if (port !== '*' && (u.port || '') !== (port || '')) return false;
    return !p || (p.endsWith('/') ? u.pathname.startsWith(p) : u.pathname === p);
  });
}

test('csp: the built page carries a policy before anything it governs, and nothing loosens it', () => {
  const p = csp();
  const at = html.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(at < html.indexOf('<script') && at < html.indexOf('<link'), 'the tag comes before every script and link');
  assert.equal(html.match(/http-equiv="Content-Security-Policy"/g).length, 1);
  assert.deepEqual(p['object-src'], ["'none'"]);
  assert.deepEqual(p['base-uri'], ["'none'"]);
  assert.deepEqual(p['default-src'], ["'self'"]);
  assert.deepEqual(p['frame-src'], ["'none'"]);
  assert.deepEqual(p['form-action'], ["'none'"]);
  for (const k of ['style-src', 'font-src', 'img-src', 'default-src']) for (const bad of ['*', 'https:', 'http:']) assert.ok(!p[k].includes(bad), `${k} has no ${bad}`);
  for (const k of ['script-src', 'worker-src', 'connect-src']) for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'data:']) assert.ok(!p[k].includes(bad), `${k} has no ${bad}`);
  assert.ok(!p['script-src'].includes('blob:'), 'no script from a blob: in the page itself');
  assert.ok(!p['script-src'].includes('https://cdn.jsdelivr.net'), 'not all of jsDelivr: the counter\'s one file');
});

test('csp: every inline script of the finished page runs (by its hash), and no other inline script would', () => {
  const p = csp(), scripts = inlineScripts(html);
  assert.ok(scripts.length >= 2, 'the language loader and the game');
  for (const s of scripts) assert.ok(p['script-src'].includes(`'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`), `hash of an inline script (${s.slice(0, 60)}…)`);
  assert.ok(scripts.some((s) => s.includes('document.write')) && scripts.some((s) => s.includes('APP_VERSION')), 'both, after the version was stamped');
  assert.equal(p['script-src'].filter((s) => s.startsWith("'sha256-")).length, scripts.length, 'nothing else');
});

test('csp: it allows what the page loads and connects to, and nothing else', () => {
  const p = csp(), langs = fs.readdirSync(path.join(OUT, 'i18n')).filter((f) => f.endsWith('.js'));
  const src = fs.readFileSync(path.join(ROOT, 'src', 'game', '00-core', '20-analytics.js'), 'utf8');
  const counter = /sc\.src='([^']+)'/.exec(src)[1];
  assert.ok(src.includes('sc.integrity='), 'the counter is loaded with SRI');
  for (const f of langs) assert.ok(allows(p['script-src'], `i18n/${f}?v=1.2.3`), `dictionary ${f}`);
  assert.ok(allows(p['script-src'], counter), 'the visit counter');
  for (const bad of ['https://cdn.jsdelivr.net/npm/evil@1/x.js', 'https://evil.example/x.js', 'blob:https://seriesoftub.es/1', 'data:text/javascript,1']) assert.ok(!allows(p['script-src'], bad), `no script ${bad}`);
  for (const u of ['/sw.js', 'blob:https://seriesoftub.es/0f8e']) assert.ok(allows(p['worker-src'], u), `worker ${u}`);
  for (const u of ['/version.json', 'federation/servers.json', 'puzzles/weekly/2026-W40.json', 'scenarios/weekly/2026-W40.json', 'architect/weekly/2026-W40.json',
    'wss://tubes.example.org/fed', 'wss://192.168.1.20:8443/fed', 'wss://laptop.local:8443/fed', 'ws://mine.localhost:8443/fed', 'https://stats.seriesoftub.es/count']) assert.ok(allows(p['connect-src'], u), `connect ${u}`);
  for (const u of ['https://evil.example/', 'ws://192.168.1.20:8443/fed', 'http://seriesoftub.es/version.json', 'https://stats.seriesoftub.es.evil.example/']) assert.ok(!allows(p['connect-src'], u), `no connect ${u}`);
});

test('csp: styles, fonts and images the page loads are allowed, and no other host', () => {
  const p = csp(), page = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const links = [...page.matchAll(/<link\s[^>]*>/g)].map((m) => ({ rel: /rel="([^"]+)"/.exec(m[0])[1], href: (/href="([^"]+)"/.exec(m[0]) || [])[1] }));
  const sheets = links.filter((l) => l.rel === 'stylesheet'), icons = links.filter((l) => /icon/.test(l.rel));
  assert.ok(sheets.length && icons.length);
  for (const l of sheets) assert.ok(allows(p['style-src'], l.href), `stylesheet ${l.href}`);
  for (const l of icons) assert.ok(allows(p['img-src'], l.href), `icon ${l.href}`);
  for (const l of links.filter((x) => x.rel === 'manifest')) assert.ok(allows(p['default-src'], l.href), `manifest ${l.href}`);
  assert.ok(allows(p['font-src'], 'https://fonts.gstatic.com/s/nunito/v26/abc.woff2'), 'Google Fonts\' files');
  // Every url() in the styles is a data: URL (the select arrow), and the share card is a canvas data: URL.
  const css = fs.readdirSync(path.join(ROOT, 'src', 'styles')).map((f) => fs.readFileSync(path.join(ROOT, 'src', 'styles', f), 'utf8')).join('\n');
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]);
  assert.ok(urls.length && urls.every((u) => u.startsWith('data:')), 'styles load no file');
  assert.ok(p['img-src'].includes('data:'), 'data: images (the share card, the select arrow)');
  assert.ok(allows(p['img-src'], 'https://stats.seriesoftub.es/count?p=x'), 'the counter, should it fall back to a pixel');
  for (const [k, u] of [['img-src', 'https://evil.example/p.gif'], ['style-src', 'https://evil.example/x.css'], ['font-src', 'https://evil.example/f.woff2'], ['font-src', 'data:font/woff2;base64,AA'], ['default-src', 'https://evil.example/']])
    assert.ok(!allows(p[k], u), `no ${k} ${u}`);
});

// A new kind of request in the game needs a look at the policy: this list is what the policy above was checked against.
test('csp: the page makes no request of a kind the policy was not checked for', () => {
  const kinds = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(fetch|new WebSocket|new Worker|new SharedWorker|importScripts|sendBeacon|new EventSource|XMLHttpRequest|serviceWorker\.register|new Function)\s*\(/g)) kinds.set(m[1], (kinds.get(m[1]) || 0) + 1); } };
  walk(path.join(ROOT, 'src', 'game'));
  assert.deepEqual([...kinds.keys()].sort(), ['fetch', 'new WebSocket', 'new Worker', 'serviceWorker.register'], 'fetch (same-origin files and the registry), Multimode sockets, blob workers, the service worker');
  // Images, frames, forms and media: only the share card's <img> (a data: URL) and the optic count form (handled in the page).
  const tags = new Map(), walk2 = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk2(f); else for (const m of fs.readFileSync(f, 'utf8').matchAll(/<(img|iframe|frame|form|video|audio|embed|object|source|image)\b|\b(new Image|new Audio|new FontFace)\s*\(/g)) { const k = m[1] || m[2]; tags.set(k, (tags.get(k) || 0) + 1); } } };
  walk2(path.join(ROOT, 'src', 'game'));
  assert.deepEqual([...tags.keys()].sort(), ['form', 'img']);
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'game', '93-ui', '75-optic-counts.js'), 'utf8'), /closest\('form\.optic-count'\);if\(!f\)return;e\.preventDefault\(\)/, 'the form never submits (form-action \'none\')');
});

test('csp: the development page has none (npm run dev adds scripts of its own), and the agent code is not in the build', () => {
  assert.doesNotMatch(assemble({ dev: true }).html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /\bTUBES\b/);
});

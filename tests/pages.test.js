// The game is hosted on GitHub Pages and only there (docs/adr/0001-github-pages-only.md). These tests make
// sure every build stays something Pages serves as it is: plain static files, all from one origin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-pages-'));
execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, OUT, VERSION: '1.2.3', BUILD_DATE: '2026-10-27' } });

const files = (dir, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
  const r = path.posix.join(rel, e.name);
  return e.isDirectory() ? files(dir, r) : [{ r, e }];
});
const built = files(OUT);
const read = (f) => fs.readFileSync(path.join(OUT, f), 'utf8');

// Files that only mean something to other hosts or to a server. On Pages they would be served as plain
// files (or ignored), so their presence means someone is designing for a different host.
const FOREIGN = /(^|\/)(_redirects|_headers|\.htaccess|netlify\.toml|vercel\.json|wrangler\.toml|firebase\.json|staticwebapp\.config\.json|now\.json|app\.yaml|Procfile|Dockerfile|nginx\.conf|server\.js|package\.json)$|\.(php|py|rb|cgi)$/;

test('pages: the build is plain static files within GitHub Pages limits', () => {
  let total = 0;
  for (const { r, e } of built) {
    assert.ok(e.isFile(), `${r} is a regular file (no symlinks)`);
    assert.doesNotMatch(r, FOREIGN, `${r} is server or other-host configuration`);
    const size = fs.statSync(path.join(OUT, r)).size;
    assert.ok(size < 100e6, `${r} is under the 100 MB file limit`);
    total += size;
  }
  assert.ok(total < 1e9, 'the site is under the 1 GB limit');
  for (const f of ['index.html', '404.html', 'CNAME', 'version.json', 'sw.js']) assert.ok(fs.existsSync(path.join(OUT, f)), `${f} is shipped`);
  assert.equal(read('CNAME').trim(), 'seriesoftub.es');
});

test('pages: the repository has no hosting configuration for anywhere else', () => {
  for (const f of fs.readdirSync(root)) assert.doesNotMatch(f, /^(netlify\.toml|vercel\.json|wrangler\.toml|firebase\.json|staticwebapp\.config\.json|now\.json|app\.yaml|Procfile|Dockerfile|_redirects|_headers)$/, `${f} configures another host`);
});

test('pages: every local file the site refers to is in the build', () => {
  const html = read('index.html');
  const refs = new Set();
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) refs.add(m[1]);
  for (const m of read('sw.js').matchAll(/'(\/[^']*)'/g)) refs.add(m[1]);
  for (const i of JSON.parse(read('site.webmanifest')).icons || []) refs.add(i.src);
  const local = [...refs].filter((u) => !/^(https?:|data:|mailto:|#|\$\{|javascript:)/.test(u) && !u.includes('${') && !u.includes("'+"));
  assert.ok(local.length >= 5, 'found the local references');
  for (const u of local) {
    const p = u.split(/[?#]/)[0].replace(/^\//, '') || 'index.html';
    assert.ok(fs.existsSync(path.join(OUT, p)), `${u} resolves inside the build`);
  }
  // Same origin for code: the only scripts from elsewhere are the analytics counter, and no stylesheets
  // but the web fonts (see the ADR).
  for (const m of html.matchAll(/<script[^>]*\bsrc="(https?:[^"]+)"/g)) assert.fail(`page loads a script from ${m[1]}`);
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(https?:[^"]+)"/g)) assert.match(m[1], /^https:\/\/fonts\.googleapis\.com\//);
});

test('pages: only the release workflow deploys, and only with the GitHub Pages actions', () => {
  const dir = path.join(root, '.github', 'workflows');
  for (const f of fs.readdirSync(dir)) {
    const y = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(y, /netlify|vercel|wrangler|cloudflare\/pages-action|firebase deploy|surge\.sh|peaceiris\/actions-gh-pages|aws s3 sync|rsync /i, `${f} deploys somewhere other than GitHub Pages`);
    if (f !== 'release.yml') assert.doesNotMatch(y, /pages:\s*write|deploy-pages/, `${f} must not deploy`);
  }
  const rel = fs.readFileSync(path.join(dir, 'release.yml'), 'utf8');
  assert.match(rel, /actions\/upload-pages-artifact@/);
  assert.match(rel, /actions\/deploy-pages@/);
  assert.match(rel, /path: \.\/_site/);
});

test('pages: the shipped page and dictionaries, with labels shrunk to ids, still say the right things', () => {
  const { load } = require('./harness');
  const file = path.join(OUT, 'index.html'), dir = path.join(OUT, 'i18n');
  assert.doesNotMatch(read('index.html'), /tr\('pnis\.delivery/, 'labels are shrunk in the shipped page');
  for (const [lang, word] of [['en', 'Customers'], ['it', 'Clienti'], ['fr', null]]) {
    const { ev, errors } = load(lang === 'en' ? { file } : { file, lang, dir });
    ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});for(let i=0;i<40;i++)dayTick();ACT.leftTab({t:'noc'});renderAll()");
    // Text node by text node: a raw label sits inside one, while two elements' text run together ("facendo." then
    // "proprio ora") only looks like one.
    const text = ev("['hud','leftBody','panelBody','modalCard','toasts'].map(i=>{const e=document.getElementById(i);if(!e)return '';const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),out=[];while(w.nextNode())out.push(w.currentNode.nodeValue);return out.join(' ');}).join(' ')");
    if (word) assert.ok(text.includes(word), `${lang}: ${word}`);
    assert.doesNotMatch(text, /\b[a-z_]+\.[a-z0-9_]{6,}\b/, `${lang}: no raw labels`);
    assert.equal(ev("tr(FLOOD_WHO[0])"), ev("tr('failures.a_botnet_of_40_000_smart')"), `${lang}: labels kept for saves still translate`);
    assert.notEqual(ev("tr(FLOOD_WHO[0])"), 'failures.a_botnet_of_40_000_smart');
    assert.deepEqual(errors, []);
  }
});

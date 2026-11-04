const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const OUT = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'tubes-build-'));
const root = path.join(__dirname, '..');

test('build stamps version and date into the site', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, OUT, VERSION: '9.9.9', BUILD_DATE: '2030-01-01' } });
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  assert.match(html, /const APP_VERSION='9\.9\.9'/);
  assert.match(html, /"softwareVersion": "9\.9\.9"/);
  assert.match(fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8'), /<lastmod>2030-01-01<\/lastmod>/);
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest', 'robots.txt', 'images/og-image.png', '404.html', 'CNAME', 'version.json']) {
    assert.ok(fs.existsSync(path.join(OUT, f)), `${f} is shipped`);
  }
});

test('version.json carries the release notes from the changelog', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, OUT, VERSION: '1.0.0', BUILD_DATE: '2026-10-23' } });
  const v = JSON.parse(fs.readFileSync(path.join(OUT, 'version.json'), 'utf8'));
  assert.equal(v.version, '1.0.0');
  assert.ok(v.notes.length >= 5);
  assert.ok(v.notes.every((n) => !n.startsWith('-')));
});

test('head carries the SEO and social metadata', () => {
  const html = require('../scripts/lib/page').assemble().html;
  for (const needle of ['<link rel="canonical" href="https://seriesoftub.es/">', 'property="og:image"', 'name="twitter:card"', 'application/ld+json', 'rel="manifest"', 'name="description"']) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
  for (const block of html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    JSON.parse(block.replace(/<\/?script[^>]*>/g, ''));
  }
});

test('a release build refuses to ship without release notes', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, OUT, VERSION: '9.9.9', REQUIRE_NOTES: '1' } }));
  assert.throws(() => execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, OUT, VERSION: '1.0; rm -rf /' } }), 'junk versions are rejected');
});

test('src: partials follow the layout rules (docs/adr/0002-one-page-assembled-at-build.md)', () => {
  const { listFiles, assemble } = require('../scripts/lib/page');
  const src = path.join(root, 'src');
  for (const f of listFiles(src)) {
    if (f === 'index.html' || f === 'i18n/en.js') continue;
    assert.match(f, /^(styles\/(\d\d-[a-z0-9-]+\/)*\d\d-[a-z0-9-]+\.css|(game|agent)\/(\d\d-[a-z0-9-]+\/)*\d\d-[a-z0-9-]+\.js)$/, `${f}: name it NN-lower-case under styles/, game/ or agent/`);
  }
  for (const dev of [false, true]) {
    const { html, map } = assemble({ dev });
    assert.equal((html.match(/^const ACT=\{$/gm) || []).length, 1, 'ACT is declared once; other action files use Object.assign(ACT,{…})');
    assert.equal((html.match(/<script>/g) || []).length, 2, 'the language loader and the game: one inline game script');
    assert.ok(map.length > 50 && map.every((m) => m.to >= m.from), 'the line map covers every partial');
  }
});

test('src: the game never names the agent code, which only the development page has (docs/adr/0004-dev-only-code.md)', () => {
  // Everything src/agent/ defines at the top level is named api…, API_… (or is window.TUBES), so one pattern finds any
  // use of it elsewhere: such code would work in development and break in the page players get.
  const { listFiles } = require('../scripts/lib/page');
  const src = path.join(root, 'src'), read = (f) => fs.readFileSync(path.join(src, f), 'utf8'), AGENT = /\b(api[A-Z]\w*|API_[A-Z0-9_]+|TUBES)\b/;
  let n = 0;
  for (const f of listFiles(path.join(src, 'agent'))) {
    for (const m of read('agent/' + f).matchAll(/^(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/gm)) { n++; assert.match(m[1], AGENT, `src/agent/${f}: top-level ${m[1]} is named api… or API_…`); }
  }
  assert.ok(n > 30, `found the agent's top-level names (${n})`);
  for (const f of listFiles(src).filter((f) => !f.startsWith('agent/'))) {
    const m = read(f).match(AGENT);
    assert.equal(m, null, `src/${f} names ${m && m[0]}, which only the development page defines`);
  }
});

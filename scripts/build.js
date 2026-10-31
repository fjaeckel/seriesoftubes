#!/usr/bin/env node
// Builds the deployable site into _site/ (or $OUT) for GitHub Pages: copies the static files in site/,
// assembles the game page from src/ into one index.html, and stamps the version (from package.json) and
// the build date into the files that carry them. The output is plain static files and nothing else,
// because GitHub Pages is where the game lives (docs/adr/0001-github-pages-only.md).
//
//   npm run build                                   VERSION, BUILD_DATE and OUT can be set in the environment
//   REQUIRE_NOTES=1 npm run build                   fail when CHANGELOG.md has no bullets for this version
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { shipped, ROOT } = require('./lib/page');

const VERSION = process.env.VERSION || require(path.join(ROOT, 'package.json')).version;
const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
const OUT = path.resolve(ROOT, process.env.OUT || '_site');
const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

if (!/^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$/.test(VERSION)) die(`VERSION '${VERSION}' is not a semantic version`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(BUILD_DATE)) die(`BUILD_DATE '${BUILD_DATE}' is not YYYY-MM-DD`);
if (OUT === ROOT || OUT === path.join(ROOT, 'site') || OUT === path.join(ROOT, 'src')) die(`refusing to build into ${OUT}`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'site'), OUT, { recursive: true });
if (fs.existsSync(path.join(OUT, 'index.html'))) die('site/index.html must not exist: the page is assembled from src/');
// The page and the translations ship with labels shrunk to short ids (docs/adr/0003-translations-by-label.md).
const D = require('./lib/dict');
const { html: page0, dicts } = shipped(Object.fromEntries(D.langs().map((l) => [l, D.read(l).dict])));
fs.writeFileSync(path.join(OUT, 'index.html'), page0);
for (const [lang, dict] of Object.entries(dicts)) fs.writeFileSync(path.join(OUT, 'i18n', `${lang}.js`), D.format(lang, '', dict));

for (const f of ['index.html', 'sitemap.xml', 'llms.txt', 'sw.js']) {
  const p = path.join(OUT, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('__VERSION__', VERSION).replaceAll('__BUILD_DATE__', BUILD_DATE));
}

// Release notes for this version, baked into the page ("What's new") and published as version.json so
// open games can spot a newer release.
const notes = execFileSync(process.execPath, [path.join(__dirname, 'release-notes.js'), VERSION], { encoding: 'utf8' });
if (process.env.REQUIRE_NOTES === '1' && notes === '[]') die(`CHANGELOG.md has no '## [${VERSION}]' section with bullets (still under [Unreleased]?)`);
const page = path.join(OUT, 'index.html'), PH = '/*__RELEASE_NOTES__*/[]', html = fs.readFileSync(page, 'utf8');
if (!html.includes(PH)) die('release-notes placeholder missing from the page');
// Function replacer: no $& / $$ expansion. Escape "<" so a note can never close the <script>.
// A release can also open with a story (prose before its first bullet), shown in full in "What's new".
const story = execFileSync(process.execPath, [path.join(__dirname, 'release-notes.js'), VERSION, '--story'], { encoding: 'utf8' }), PS = '/*__RELEASE_STORY__*/[]';
if (!html.includes(PS)) die('release-story placeholder missing from the page');
fs.writeFileSync(page, html.replace(PH, () => notes.replace(/</g, '\\u003c')).replace(PS, () => story.replace(/</g, '\\u003c')));
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({ version: VERSION, date: BUILD_DATE, notes: JSON.parse(notes), story: JSON.parse(story) }, null, 2) + '\n');

// Nothing may ship half-stamped.
const left = [];
const scan = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) scan(p);
  else if (/__VERSION__|__BUILD_DATE__/.test(fs.readFileSync(p, 'latin1'))) left.push(path.relative(OUT, p));
} };
scan(OUT);
if (left.length) die(`unreplaced placeholders left in ${left.join(', ')}`);
console.log(`Built Series of Tubes ${VERSION} (${BUILD_DATE}) into ${path.relative(ROOT, OUT) || OUT}/`);

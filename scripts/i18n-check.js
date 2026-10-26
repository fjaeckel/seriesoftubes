#!/usr/bin/env node
// Checks a translation against the English text in site/index.html: every tr()/trn()/N_() literal and
// every data-i18n text, aria-label and title in the static markup should have an entry, no stale entry
// should linger, and each translation must keep the {placeholders} and HTML tags of its English key.
// Usage: node scripts/i18n-check.js [lang ...] [--summary FILE]   (default: every site/i18n/*.js)
// It also checks that each language is offered in the game and cached for offline play, and with --summary
// appends a Markdown coverage table (the CI job writes it to the run's summary page).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SITE = path.join(__dirname, '..', 'site');
const LIT = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\x60(?:[^\x60\\$]|\\.|\$(?!\{))*\x60`;
const CALL = new RegExp(String.raw`(?<![\w$.])(tr|trn|N_)\(\s*(${LIT})(?:\s*,\s*(${LIT}))?`, 'g');
const CTX = vm.createContext({});
const literal = (s) => vm.runInContext(s, CTX);

// English keys used by the game. Calls whose text is not a literal cannot be checked and are skipped.
function sourceKeys(html) {
  const keys = new Set();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  for (const m of scripts.matchAll(CALL)) {
    keys.add(literal(m[2]));
    if (m[1] === 'trn' && m[3]) keys.add(literal(m[3]));
  }
  const { JSDOM } = require('jsdom');
  const doc = new JSDOM(html).window.document;
  for (const el of doc.querySelectorAll('[data-i18n]')) keys.add(el.textContent);
  for (const a of ['aria-label', 'title']) for (const el of doc.querySelectorAll(`[${a}]`)) keys.add(el.getAttribute(a));
  return keys;
}

function loadDict(file) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window });
  const lang = path.basename(file, '.js');
  return (window.I18N || {})[lang] || {};
}

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(' ');
const tags = (s) => (s.match(/<\/?[a-z][a-z0-9]*/gi) || []).map((t) => t.toLowerCase()).sort().join(' ');

// Entries whose translation drops or invents a {placeholder} or an HTML tag, or is empty.
function brokenEntries(dict) {
  return Object.entries(dict).filter(([en, xx]) => typeof xx !== 'string' || !xx.trim() ||
    placeholders(en) !== placeholders(xx) || tags(en) !== tags(xx)).map(([en]) => en);
}

function check(keys, dict) {
  return {
    missing: [...keys].filter((k) => !(k in dict)),
    unused: Object.keys(dict).filter((k) => !keys.has(k)),
    broken: brokenEntries(dict),
  };
}

module.exports = { loadDict, brokenEntries };

// A language file only works if the game offers it and the offline cache keeps it.
function registration(lang) {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
  const out = [];
  const m = html.match(/SOT_LANGS=\{([^}]*)\}/);
  if (!m || !new RegExp(String.raw`(^|[,{\s])${lang}\s*:`).test(m[1])) out.push('not in the language list (SOT_LANGS in site/index.html)');
  if (!sw.includes(`/i18n/${lang}.js`)) out.push('not cached for offline play (CORE in site/sw.js)');
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const si = args.indexOf('--summary');
  const summary = si >= 0 ? args.splice(si, 2)[1] : null;   // append a Markdown table here (CI: $GITHUB_STEP_SUMMARY)
  const keys = sourceKeys(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'));
  const files = (args.length ? args.map((l) => `${l}.js`) : fs.readdirSync(path.join(SITE, 'i18n')))
    .map((f) => path.join(SITE, 'i18n', f));
  let bad = false;
  const rows = [];
  for (const file of files) {
    const lang = path.basename(file, '.js');
    const r = check(keys, loadDict(file));
    const reg = registration(lang);
    const cov = keys.size ? (keys.size - r.missing.length) / keys.size : 1;
    const pctTxt = `${(Math.floor(cov * 1000) / 10).toFixed(1)}%`;
    console.log(`${path.basename(file)}: ${r.missing.length} missing, ${r.unused.length} unused, ${r.broken.length} broken (${pctTxt} of ${keys.size} strings)`);
    for (const [label, list] of [['missing', r.missing], ['unused', r.unused], ['broken', r.broken], ['registration', reg]]) {
      for (const k of list) console.log(`  ${label}: ${JSON.stringify(k)}`);
    }
    const ok = r.missing.length + r.unused.length + r.broken.length + reg.length === 0;
    bad ||= !ok;
    rows.push(`| ${lang} | ${pctTxt} | ${r.missing.length} | ${r.unused.length} | ${r.broken.length} | ${reg.length ? reg.join('; ') : 'ok'} | ${ok ? '✅' : '❌'} |`);
  }
  if (summary) {
    const list = (title, items) => items.length ? `\n<details><summary>${title} (${items.length})</summary>\n\n${items.slice(0, 200).map((k) => '- `' + k.replace(/`/g, "'") + '`').join('\n')}\n</details>\n` : '';
    let md = `## Translations\n\n${keys.size} English strings in the game.\n\n| Language | Coverage | Missing | Unused | Broken | Registered | |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
    for (const file of files) {
      const r = check(keys, loadDict(file)), lang = path.basename(file, '.js');
      md += list(`${lang}: missing`, r.missing) + list(`${lang}: broken`, r.broken) + list(`${lang}: unused`, r.unused);
    }
    fs.appendFileSync(summary, md + '\n');
  }
  process.exit(bad ? 1 : 0);
}

#!/usr/bin/env node
// Checks the translations. Text is keyed by label: tr('area.some_label') in src/ and data-i18n="…"
// (data-i18n-aria-label, data-i18n-title) in src/index.html, with the English in src/i18n/en.js.
//
//   node scripts/i18n-check.js [lang ...] [--summary FILE] [--fix]     (default: every site/i18n/*.js)
//
// English: every label the code uses is defined, every defined label is used, labels look like
// `area.words`, and the English left in the static markup matches en.js.
// Each translation: nothing missing, nothing stale, and every entry keeps the {placeholders}, HTML tags and
// plural forms of its English. Every dictionary is sorted, one entry per line (--fix sorts them), each
// language is offered in the game and cached for offline play. --summary appends a Markdown coverage table
// (the CI job writes it to the run's summary page).
const fs = require('node:fs');
const path = require('node:path');
const D = require('./lib/dict');
const { CALL } = require('./legacy/labels');

const SITE = path.join(__dirname, '..', 'site');
// The development page: it has every label, the agent's (src/agent/) too.
const page = () => require('./lib/page').assemble({ dev: true }).html;
const LABEL = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

// The labels the game uses, with problems in how they are used.
function sourceLabels(html) {
  const labels = new Set(), problems = [];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  for (const m of scripts.matchAll(CALL)) {
    const l = m[2].slice(1, -1);
    if (!LABEL.test(l)) problems.push(`${m[1]}(${m[2].slice(0, 60)}…): not a label like 'area.some_words'`);
    else labels.add(l);
    if (m[1] === 'trn' && m[3]) problems.push(`trn(${m[2]}, ${m[3].slice(0, 30)}…): plurals take one label, trn('area.label', n)`);
  }
  // A label the build cannot see (a bare string, not the first argument of tr/trn/N_) would not be shrunk
  // along with its dictionary entry, and would show as raw text in the shipped game.
  const code = scripts.replace(/\(window\.I18N=window\.I18N\|\|\{\}\)\.en=\{[\s\S]*?\n\};\n/, '');
  const seen = new Set();
  for (const m of code.matchAll(CALL)) seen.add(m.index + m[0].indexOf(m[2]));
  for (const m of code.matchAll(/(['"\x60])([a-z0-9_]+(?:\.[a-z0-9_]+)+)\1/g)) {
    if (!seen.has(m.index) && /_|\.[a-z]+\./.test(m[2]) && !/\.(js|json|html|css|png|svg|es)$/.test(m[2])) problems.push(`label ${m[2]} outside tr()/trn()/N_(): wrap it in N_() so the build can see it`);
  }
  const { JSDOM } = require('jsdom');
  const doc = new JSDOM(html).window.document;
  const markup = [];
  for (const el of doc.querySelectorAll('[data-i18n]')) markup.push([el.dataset.i18n, el.textContent, 'text']);
  for (const a of ['aria-label', 'title']) for (const el of doc.querySelectorAll(`[data-i18n-${a}]`)) markup.push([el.getAttribute(`data-i18n-${a}`), el.getAttribute(a), a]);
  for (const el of doc.querySelectorAll('[aria-label]:not([data-i18n-aria-label]),[title]:not([data-i18n-title])')) {
    if (!el.closest('noscript')) problems.push(`<${el.tagName.toLowerCase()} ${el.hasAttribute('title') ? 'title' : 'aria-label'}="…"> in the markup has no data-i18n-${el.hasAttribute('title') ? 'title' : 'aria-label'} label`);
  }
  for (const [l] of markup) LABEL.test(l) ? labels.add(l) : problems.push(`data-i18n="${l}": not a label`);
  return { labels, markup, problems };
}

function loadDict(file) {
  const lang = path.basename(file, '.js');
  return D.parse(fs.readFileSync(file, 'utf8'), lang);
}

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(' ');
const tags = (s) => (s.match(/<\/?[a-z][a-z0-9]*/gi) || []).map((t) => t.toLowerCase()).sort().join(' ');
const forms = (v) => (typeof v === 'string' ? [['', v]] : v && typeof v === 'object' ? [['one', v.one], ['other', v.other]] : [['', v]]);

// Entries whose translation is empty, has the wrong shape (plural or not), or drops or invents a
// {placeholder} or an HTML tag. Without `en`, an entry is compared with itself (shape and emptiness only).
function brokenEntries(dict, en = null) {
  return Object.entries(dict).filter(([l, xx]) => {
    const e = en ? en[l] : xx;
    if (e === undefined) return false;   // stale, reported as unused
    if ((typeof e === 'string') !== (typeof xx === 'string')) return true;
    const ef = forms(e), xf = forms(xx);
    return xf.some(([k, x], i) => typeof x !== 'string' || !x.trim() || placeholders(ef[i][1]) !== placeholders(x) || tags(ef[i][1]) !== tags(x)) ||
      ef.some(([k]) => k && typeof xx[k] !== 'string');
  }).map(([l]) => l);
}

function check(en, dict) {
  return {
    missing: Object.keys(en).filter((k) => !(k in dict)),
    unused: Object.keys(dict).filter((k) => !(k in en)),
    broken: brokenEntries(dict, en),
  };
}

// The English dictionary against the code.
function checkEnglish(src, en) {
  const out = [...src.problems];
  for (const l of src.labels) if (!(l in en)) out.push(`label used but not in src/i18n/en.js: ${l}`);
  for (const l of Object.keys(en)) {
    if (!src.labels.has(l)) out.push(`in src/i18n/en.js but never used: ${l}`);
    if (!LABEL.test(l)) out.push(`not a label like 'area.some_words': ${l}`);
  }
  for (const [l, text, where] of src.markup) {
    if (typeof en[l] === 'string' && en[l] !== text) out.push(`markup ${where} for ${l} says ${JSON.stringify(text)}, en.js says ${JSON.stringify(en[l])}`);
  }
  for (const l of brokenEntries(en)) out.push(`empty or malformed English: ${l}`);
  if (!D.tidy('en')) out.push('src/i18n/en.js is not sorted one entry per line: run npm run i18n:fix');
  return out;
}

module.exports = { loadDict, brokenEntries, sourceLabels };

// A language file only works if the game offers it and the offline cache keeps it.
function registration(lang, html) {
  const sw = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
  const out = [];
  const m = html.match(/SOT_LANGS=\{([^}]*)\}/);
  if (!m || !new RegExp(String.raw`(^|[,{\s])${lang}\s*:`).test(m[1])) out.push('not in the language list (SOT_LANGS in src/index.html)');
  if (!sw.includes(`/i18n/${lang}.js`)) out.push('not cached for offline play (CORE in site/sw.js)');
  if (!D.tidy(lang)) out.push('not sorted one entry per line: run npm run i18n:fix');
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const si = args.indexOf('--summary');
  const summary = si >= 0 ? args.splice(si, 2)[1] : null;   // append a Markdown table here (CI: $GITHUB_STEP_SUMMARY)
  const fi = args.indexOf('--fix');
  if (fi >= 0) {
    args.splice(fi, 1);
    for (const lang of ['en', ...(args.length ? args : D.langs())]) { const { header, dict } = D.read(lang); D.write(lang, dict, header); }
  }
  const html = page();
  const en = D.read('en').dict;
  const src = sourceLabels(html);
  const enProblems = checkEnglish(src, en);
  const n = Object.keys(en).length;
  console.log(`en.js: ${n} labels, ${enProblems.length} problems`);
  for (const p of enProblems) console.log(`  ${p}`);
  let bad = enProblems.length > 0;
  const langs = args.length ? args : D.langs();
  const rows = [], results = {};
  for (const lang of langs) {
    const r = results[lang] = check(en, loadDict(D.fileOf(lang)));
    const reg = registration(lang, html);
    const cov = n ? (n - r.missing.length) / n : 1;
    const pctTxt = `${(Math.floor(cov * 1000) / 10).toFixed(1)}%`;
    console.log(`${lang}.js: ${r.missing.length} missing, ${r.unused.length} unused, ${r.broken.length} broken (${pctTxt} of ${n} labels)`);
    for (const [label, list] of [['missing', r.missing], ['unused', r.unused], ['broken', r.broken], ['registration', reg]]) {
      for (const k of list) console.log(`  ${label}: ${k}${label === 'missing' ? `  (${JSON.stringify(forms(en[k])[0][1]).slice(0, 80)})` : ''}`);
    }
    const ok = r.missing.length + r.unused.length + r.broken.length + reg.length === 0;
    bad ||= !ok;
    rows.push(`| ${lang} | ${pctTxt} | ${r.missing.length} | ${r.unused.length} | ${r.broken.length} | ${reg.length ? reg.join('; ') : 'ok'} | ${ok ? '✅' : '❌'} |`);
  }
  if (summary) {
    const list = (title, items) => items.length ? `\n<details><summary>${title} (${items.length})</summary>\n\n${items.slice(0, 200).map((k) => '- `' + k.replace(/`/g, "'") + '`').join('\n')}\n</details>\n` : '';
    let md = `## Translations\n\n${n} labels in the game${enProblems.length ? `, ${enProblems.length} problems with the English` : ''}.\n\n| Language | Coverage | Missing | Unused | Broken | Registered | |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
    md += list('English: problems', enProblems);
    for (const lang of langs) {
      const r = results[lang];
      md += list(`${lang}: missing`, r.missing) + list(`${lang}: broken`, r.broken) + list(`${lang}: unused`, r.unused);
    }
    fs.appendFileSync(summary, md + '\n');
  }
  process.exit(bad ? 1 : 0);
}

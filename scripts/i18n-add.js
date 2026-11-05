#!/usr/bin/env node
// Adds, changes, renames or removes labels, keeping every dictionary sorted (scripts/lib/dict.js).
// English is src/i18n/en.js; translations are site/i18n/<lang>.js.
//
//   node scripts/i18n-add.js changes.json    {"en": {"pnis.ready": "Ready in {n} days"},
//                                             "it": {"pnis.ready": "Pronto tra {n} giorni"},
//                                             "fr": {"pnis.old_label": null}}
//                                            a string sets the text, {"one":…,"other":…} sets a plural,
//                                            null removes it (null under "en" removes it from every language)
//   node scripts/i18n-add.js -               the same JSON from stdin
//   node scripts/i18n-add.js --rename old.label new.label    in every dictionary and everywhere in src/
const fs = require('node:fs');
const path = require('node:path');
const D = require('./lib/dict');

const LABEL = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const all = () => ['en', ...D.langs()];
const die = (m) => { console.error(m); process.exit(1); };
const args = process.argv.slice(2);

if (args[0] === '--rename') {
  const [, from, to] = args;
  if (!LABEL.test(from || '') || !LABEL.test(to || '')) die('usage: i18n-add.js --rename old.label new.label');
  for (const lang of all()) {
    const { header, dict } = D.read(lang);
    if (!(from in dict)) continue;
    if (to in dict) die(`${lang}: already has ${to}`);
    dict[to] = dict[from];
    delete dict[from];
    D.write(lang, dict, header);
  }
  // The code: quoted labels in tr()/trn()/N_() calls and tables, and data-i18n attributes.
  const { listFiles } = require('./lib/page');
  const src = path.join(__dirname, '..', 'src');
  let n = 0;
  for (const f of listFiles(src)) {
    if (f === 'i18n/en.js') continue;
    const p = path.join(src, f), t = fs.readFileSync(p, 'utf8');
    const u = t.replace(new RegExp(String.raw`(['"\x60])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\1`, 'g'), (m, q) => { n++; return q + to + q; });
    if (u !== t) fs.writeFileSync(p, u);
  }
  console.log(`renamed ${from} → ${to} in every dictionary and ${n} place(s) in src/`);
  process.exit(0);
}

if (args.length !== 1) die('usage: i18n-add.js changes.json | - | --rename old.label new.label');
const changes = JSON.parse(fs.readFileSync(args[0] === '-' ? 0 : args[0], 'utf8'));
const en = D.read('en').dict;
const order = Object.keys(changes).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : 0));   // English first
for (const lang of order) {
  if (!all().includes(lang)) die(`no dictionary for ${lang} (English is src/i18n/en.js, translations site/i18n/<lang>.js)`);
  const { header, dict } = lang === 'en' ? { header: D.read('en').header, dict: en } : D.read(lang);
  let set = 0, del = 0;
  for (const [label, v] of Object.entries(changes[lang])) {
    if (!LABEL.test(label)) die(`${lang}: ${JSON.stringify(label)} is not a label like 'area.some_words'`);
    if (v === null) {
      if (label in dict) { delete dict[label]; del++; }
      if (lang === 'en') for (const l of D.langs()) { const d = D.read(l); if (label in d.dict) { delete d.dict[label]; D.write(l, d.dict, d.header); } }
      continue;
    }
    const ok = typeof v === 'string' ? !!v.trim() : v && typeof v.one === 'string' && typeof v.other === 'string' && v.one.trim() && v.other.trim();
    if (!ok) die(`${lang}: ${label}: give a non-empty string, or {"one": …, "other": …}`);
    if (lang !== 'en' && !(label in en)) die(`${lang}: ${label} has no English yet; add it under "en" first`);
    if (lang !== 'en' && (typeof v === 'string') !== (typeof en[label] === 'string')) die(`${lang}: ${label} must be ${typeof en[label] === 'string' ? 'a string' : 'a plural {one, other}'} like its English`);
    dict[label] = v; set++;
  }
  D.write(lang, dict, header);
  console.log(`${lang}: ${set} set, ${del} removed`);
}

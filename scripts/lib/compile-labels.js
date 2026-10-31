// Shrinks labels for the shipped page (docs/adr/0003-translations-by-label.md, "Performance").
//
// In src/ a label is readable: tr('pnis.delivery_2_to_6_weeks'). Shipped like that, every label would
// sit in the page twice (in the code and as a key in the inlined English), about 20% more page after
// compression. So the build gives each label a short id ('a', 'b', … '2kq'), in the code, in the
// static markup, in the inlined English and in every translation file, and the page ends up about the
// size it was when the English text itself was the key.
//
// Labels passed to N_() are kept whole: those are the ones the game stores (in saves)
// and shows later, and an id would mean something else in the next release.
const { CALL } = require('../legacy/labels');
const D = require('./dict');

const LABEL = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const EN_OPEN = '(window.I18N=window.I18N||{}).en={';

// {map: label → id for every label that gets one, kept: labels that stay whole}.
function plan(html, en) {
  const kept = new Set();
  for (const m of html.matchAll(CALL)) if (m[1] === 'N_') kept.add(m[2].slice(1, -1));
  const map = new Map();
  let n = 0;
  for (const l of Object.keys(en).sort(D.cmp)) if (!kept.has(l)) map.set(l, (n++).toString(36));
  return { map, kept };
}

const rekey = (dict, map) => Object.fromEntries(Object.entries(dict).map(([k, v]) => [map.get(k) || k, v]));

// The page and the dictionaries with short ids. `dicts` is {lang: dict} for the translations.
function compile(html, en, dicts) {
  const { map } = plan(html, en);
  // English: the inlined dictionary, swapped whole.
  const a = html.indexOf(EN_OPEN), b = html.indexOf('\n};\n', a);
  if (a < 0 || b < 0) throw new Error('compile-labels: the inlined English dictionary is missing from the page');
  const head = html.lastIndexOf('\n', a) + 1;
  let out = html.slice(0, head) + D.format('en', '', rekey(en, map)) + html.slice(b + 4);
  // Code: the first argument of tr() and trn(); N_() keeps its label.
  out = out.replace(CALL, (m, fn, lit) => {
    if (fn === 'N_') return m;
    const l = lit.slice(1, -1);
    return map.has(l) ? m.replace(lit, `'${map.get(l)}'`) : m;
  });
  // Static markup.
  out = out.replace(/ data-i18n(-aria-label|-title)?="([^"]+)"/g, (m, attr, l) => (map.has(l) ? ` data-i18n${attr || ''}="${map.get(l)}"` : m));
  const left = [...out.matchAll(/(?<![\w$.])(tr|trn)\(\s*'([^']*)'/g)].map((m) => m[2]).filter((l) => LABEL.test(l) && !map.has(l) && !(l in en));
  if (left.length) throw new Error(`compile-labels: labels with no English: ${[...new Set(left)].slice(0, 5).join(', ')}`);
  const compiled = {};
  for (const [lang, d] of Object.entries(dicts)) compiled[lang] = rekey(d, map);
  return { html: out, dicts: compiled, map };
}

module.exports = { compile, plan };

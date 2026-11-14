#!/usr/bin/env node
// Dark mode (#80): writes src/styles/99-dark-auto.css, the dark versions of the colours the stylesheets and the game's
// inline styles write out by hand. The variables (--paper, --ink…) switch in 98-dark.css; this covers the rest, so a new
// rule with a light background does not stay white in dark mode. tests/dark-mode.test.js fails when the file is stale.
//
//   node scripts/dark-css.js            write the file
//   node scripts/dark-css.js --check    exit 1 when it is out of date
//
// Every rule that sets a background, a text colour or a border colour is written again, in the same order and under
// :where(:root.dark), which adds no specificity: the cascade between rules (a tab and its active state, a button and
// its hover) stays exactly as in light mode. In each:
//   - light surfaces (lightness >= 0.86) turn dark, keeping a hint of their hue; other backgrounds stay;
//   - text on a bright fill (a yellow button, an amber tag) is dark (--on), wherever the rule sets that fill;
//   - other dark text turns light: greys to --ink/--ink2, coloured text (a green "+$") a lighter shade of itself;
//   - light borders darken a little, so they do not glow; dark pills (ink as their background) stay dark.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'styles', '99-dark-auto.css');
const SKIP = new Set(['98-dark.css', '99-dark-auto.css']);

// ---------- colours ----------
const COL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/g;
function parse(c) {
  if (c === 'white') return [255, 255, 255, 1];
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const m = c.match(/rgba?\(([^)]*)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
  return [p[0], p[1], p[2], p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1];
}
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function out(h, s, l, a) {
  const f = (n) => { const k = (n + h / 30) % 12, x = s * Math.min(l, 1 - l); return Math.round(255 * (l - x * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  const hex = '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  return a < 1 ? `rgba(${f(0)},${f(8)},${f(4)},${+a.toFixed(3)})` : hex;
}
const info = (c) => { const p = parse(c); if (!p) return null; const [h, s, l] = hsl(p); return { h, s, l, a: p[3] }; };
const surface = (x) => x && x.l >= 0.86;
const bright = (x) => x && !surface(x) && x.l >= 0.5 && x.s >= 0.35 && x.a >= 0.5;
const BRIGHT_VARS = /var\(--(sun|warn|wave|land|sand)\)/;
const darkSurface = (x) => out(x.h, Math.min(x.s, 1) * 0.3, 0.15 + (1 - x.l) * 0.55, x.a);
const darkBorder = (x) => out(x.h, Math.min(x.s, 1) * 0.3, 0.3, x.a);
function lightText(c) {
  const x = info(c);
  if (!x || x.l >= 0.5) return null;
  if (x.s < 0.25) return x.l < 0.3 ? 'var(--ink)' : 'var(--ink2)';
  return out(x.h, Math.min(x.s, 0.75), Math.max(0.68, 1 - x.l * 0.8), x.a);
}
const mapCols = (v, f) => v.replace(COL, (c) => { const x = info(c); return (x && f(x)) || c; });

// ---------- a small CSS reader: rules, with the @media (or @supports) blocks around them ----------
function rules(css, file) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  const walk = (s, wrap) => {
    let i = 0;
    while (i < s.length) {
      const o = s.indexOf('{', i);
      if (o < 0) break;
      const head = s.slice(i, o).trim();
      let d = 1, j = o + 1;
      while (j < s.length && d) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; }
      const body = s.slice(o + 1, j - 1);
      if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, [...wrap, head]);
      else if (!head.startsWith('@')) found.push({ sel: head, body, wrap, file });
      i = j;
    }
  };
  walk(css, []);
  return found;
}
const decls = (body) => body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
  const k = d.indexOf(':');
  return k < 0 ? null : { p: d.slice(0, k).trim().toLowerCase(), v: d.slice(k + 1).trim() };
}).filter(Boolean);
// The selector in dark mode, with no more specificity than it had.
const darkSel = (sel) => sel.split(',').map((s) => s.trim()).filter(Boolean).map((s) =>
  s === 'html' || s === ':root' ? ':where(:root.dark)' : s.startsWith(':root') ? ':where(:root.dark)' + s.slice(5) : s.startsWith('html ') ? ':where(:root.dark) ' + s.slice(5) : ':where(:root.dark) ' + s).join(',');

function darkRule(r) {
  if (r.sel.startsWith(':root') && !/\s/.test(r.sel)) return null; // the variables: 00-base.css / 98-dark.css
  const ds = decls(r.body), outD = [];
  const bg = ds.filter((d) => d.p === 'background' || d.p === 'background-color' || d.p === 'background-image');
  const fill = bg.some((d) => BRIGHT_VARS.test(d.v) || (d.v.match(COL) || []).some((c) => bright(info(c))));
  for (const d of ds) {
    if (d.p === 'background' || d.p === 'background-color' || d.p === 'background-image') {
      // A dark pill (ink as its background) stays dark: --on keeps the light theme's ink.
      if (/var\(--|#|rgb|white/.test(d.v)) outD.push(`${d.p}:${mapCols(d.v, (x) => (surface(x) && x.a >= 0.3 ? darkSurface(x) : null)).replace(/var\(--ink\)/g, 'var(--on)')}`);
    } else if (d.p === 'color') {
      const imp = /!important/.test(d.v) ? '!important' : '', v = d.v.replace(/\s*!important/, '');
      // On a bright fill, dark text stays dark (whatever the theme's ink); white stays white.
      if (fill) outD.push(`color:${v === 'var(--ink)' || v === 'inherit' || lightText(v) ? 'var(--on)' : v}${imp}`);
      else outD.push(`color:${lightText(v) || v}${imp}`);
    } else if (/^(border|outline)/.test(d.p) && COL.test(d.v)) {
      COL.lastIndex = 0;
      outD.push(`${d.p}:${mapCols(d.v, (x) => (surface(x) ? darkBorder(x) : null))}`);
    }
    COL.lastIndex = 0;
  }
  // A rule that lays a surface and leaves the text to inherit: the theme's ink, not the dark text a bright base rule set.
  const paper = bg.some((d) => /var\(--(paper|soft)\)/.test(d.v) || (d.v.match(COL) || []).some((c) => surface(info(c))));
  if (!ds.some((d) => d.p === 'color')) { if (fill) outD.push('color:var(--on)'); else if (paper) outD.push('color:var(--ink)'); }
  if (!outD.length) return null;
  return { wrap: r.wrap, text: `${darkSel(r.sel)}{${outD.join(';')}}` };
}

// Inline styles the game writes (style="background:#EAF7EE"): matched by the attribute, as written.
function inline() {
  const seen = new Set(), outR = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) scan(fs.readFileSync(p, 'utf8')); } };
  const scan = (s) => {
    for (const m of s.matchAll(/(background|color):(#[0-9a-fA-F]{3,6})\b/g)) {
      const [, p, c] = m, k = p + ':' + c;
      if (seen.has(k) || s[m.index - 1] === '-') continue;
      const x = info(c);
      const v = p === 'background' ? (surface(x) ? darkSurface(x) : null) : lightText(c);
      if (!v) continue;
      seen.add(k);
      outR.push(`:where(:root.dark) [style*="${k}"]{${p}:${v}!important}`);
    }
  };
  walk(path.join(ROOT, 'src', 'game'));
  return outR.sort();
}

function generate() {
  const dir = path.join(ROOT, 'src', 'styles');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css') && !SKIP.has(f)).sort();
  const lines = ['/* Generated by scripts/dark-css.js from the other stylesheets: do not edit. Dark mode (#80), see 98-dark.css. */'];
  let open = [];
  for (const f of files) for (const r of rules(fs.readFileSync(path.join(dir, f), 'utf8'), f)) {
    const d = darkRule(r);
    if (!d) continue;
    if (d.wrap.join('\n') !== open.join('\n')) { if (open.length) lines.push('}'.repeat(open.length)); if (d.wrap.length) lines.push(d.wrap.map((x) => x + '{').join('')); open = d.wrap; }
    lines.push(d.text);
  }
  if (open.length) lines.push('}'.repeat(open.length));
  lines.push('/* Inline styles in the game\'s HTML. */', ...inline());
  return lines.join('\n') + '\n';
}

module.exports = { generate, OUT };
if (require.main === module) {
  const css = generate();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== css) { console.error('src/styles/99-dark-auto.css is out of date: run node scripts/dark-css.js'); process.exit(1); }
  } else { fs.writeFileSync(OUT, css); console.log(`wrote ${path.relative(ROOT, OUT)} (${css.split('\n').length - 1} lines)`); }
}

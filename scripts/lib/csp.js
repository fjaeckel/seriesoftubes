// The game page's Content Security Policy, as a <meta> tag the build writes into the shipped page (GitHub Pages sends
// no headers of ours, so a tag is the only way; docs/adr/0001-github-pages-only.md). It keeps an injected script away
// from what the page holds (the Multimode key in the save, the operator seed in IndexedDB): only the page's own inline
// scripts (by hash), same-origin scripts (the dictionaries) and the visit counter's exact file (with SRI) run.
//   script-src   'self', a sha256 for each inline script of the finished page, the counter's URL
//   worker-src   'self' (the service worker) and blob: (the routing and cable workers are made from the page's code)
//   connect-src  'self' (version.json, servers.json, puzzles, dictionaries), wss: (any Multimode server, by design),
//                ws://*.localhost:* (a relay on the developer's machine, §9.1) and the counter's collector
//   object-src 'none', base-uri 'none'
// Styles, fonts and images stay open: Google Fonts and inline style attributes are used everywhere, and none of them
// can run code. The hashes must be taken from the final page, so the build adds the tag last (scripts/build.js).
const crypto = require('node:crypto');

const STATS = 'https://stats.seriesoftub.es';
// Inline scripts the browser runs: no src, and no type or a JavaScript one (JSON-LD is data, never run or checked).
function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type[1])) continue;
    out.push(m[2]);
  }
  return out;
}
// The counter the page appends (src/game/00-core/20-analytics.js), read from the page so the two never disagree.
const counterOf = (html) => { const m = /\.src='(https:\/\/cdn\.jsdelivr\.net\/npm\/[^']+\.js)'/.exec(html); return m ? m[1] : null; };
const sha = (s) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

function policy(html) {
  const counter = counterOf(html);
  return [
    `script-src 'self' ${[...new Set(inlineScripts(html).map(sha))].join(' ')}${counter ? ' ' + counter : ''}`,
    "worker-src 'self' blob:",
    `connect-src 'self' wss: ws://*.localhost:* ${STATS}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
}

// The page with the tag right after <meta charset>, before anything it governs.
function withCsp(html) {
  if (/http-equiv="Content-Security-Policy"/i.test(html)) throw new Error('the page already has a Content-Security-Policy');
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy(html)}">`;
  const at = /<meta charset="utf-8">\n/i.exec(html);
  if (!at) throw new Error('no <meta charset="utf-8"> to put the Content-Security-Policy after');
  return html.slice(0, at.index + at[0].length) + tag + '\n' + html.slice(at.index + at[0].length);
}

module.exports = { policy, withCsp, inlineScripts, counterOf, STATS };

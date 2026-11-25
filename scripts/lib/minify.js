// Shrinks the finished page's inline scripts and styles for players (about a quarter less to download on a phone).
// Whitespace and redundant syntax only: names stay, because the route and federation workers re-run the page's own
// script text, and the sea survey worker is built from function names (src/game/95-modals/80-own-cable.js).
// Runs after the release notes are filled in (their placeholders are comments) and before the CSP hashes the scripts.
const esbuild = require('esbuild');

const opts = (loader) => ({ loader, minifyWhitespace: true, minifySyntax: true, legalComments: 'none', charset: 'utf8' });

function minifyPage(html) {
  html = html.replace(/(<style>)([\s\S]*?)(<\/style>)/g, (_, a, css, b) => a + esbuild.transformSync(css, opts('css')).code.trim() + b);
  return html.replace(/(<script(\s[^>]*)?>)([\s\S]*?)(<\/script>)/gi, (all, open, attrs, js, close) => {
    if (/\ssrc=/i.test(attrs || '') || /type=["']?application\/ld\+json/i.test(attrs || '') || !js.trim()) return all;
    const code = esbuild.transformSync(js, opts('js')).code.trim();
    if (/<\/script/i.test(code)) throw new Error('minified script would close its own <script> tag');
    return open + code + close;
  });
}

module.exports = { minifyPage };

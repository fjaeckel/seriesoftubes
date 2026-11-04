// Assembles the game page from src/: src/index.html is the shell, and every line that is exactly
// `<!-- @include DIR -->` is replaced by the files under src/DIR, concatenated in path order.
// The result is the same single, self-contained index.html the game has always shipped: one request,
// no module loader, no runtime cost. See docs/ARCHITECTURE.md ("Source layout") and docs/adr/.
//
// A line `<!-- @include-dev DIR -->` is the same, but only in the development page (dev: true): the
// tools' side of the game (src/agent/, the agent facade the MCP server drives) for npm run dev, the
// MCP server's own page and the tests that ask for it. Everywhere else the line is dropped whole, so
// the page players get is exactly what it would be without it (docs/adr/0004-dev-only-code.md).
//
//   node scripts/lib/page.js [-o FILE]                     the page as it ships (stdout by default)
//   node scripts/lib/page.js --source [-o FILE]            assembled only, labels as in src/ (what tests use)
//   node scripts/lib/page.js --source --dev [-o FILE]      the development page: with src/agent/ (what npm run dev serves)
//   node scripts/lib/page.js --ref origin/main -o FILE     the page as it ships at a git ref
//
// --ref uses that commit's own assembler, so it keeps working when this file changes; refs from before
// the split (when the page was site/index.html) are read as they are.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const INCLUDE = /^<!-- @include(-dev)? ([\w./-]+) -->$/;

// Every file under dir, as paths relative to dir with '/' separators, in a stable order
// (plain code-unit comparison, so the order never depends on the machine's locale).
function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else out.push(r);
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// The partials that make up one include, in order: [{file, text}].
function partials(src, dir) {
  const base = path.join(src, dir);
  if (!fs.existsSync(base)) throw new Error(`@include ${dir}: no such directory under ${path.relative(ROOT, src) || '.'}`);
  return listFiles(base).map((r) => {
    const file = path.join(base, r);
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('\r')) throw new Error(`${path.relative(ROOT, file)}: use LF line endings`);
    if (text && !text.endsWith('\n')) throw new Error(`${path.relative(ROOT, file)}: must end with a newline`);
    if (/^<\/(script|style)/im.test(text)) throw new Error(`${path.relative(ROOT, file)}: must not close its <script>/<style>`);
    return { file: dir + '/' + r, text };
  });
}

// The assembled page as a string, plus a map of which output line came from which source file.
// dev: also the @include-dev parts (the development page); without it, their lines are left out entirely.
function assemble({ src = path.join(ROOT, 'src'), dev = false } = {}) {
  const shell = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
  const out = [], map = [];
  let line = 1;
  const lines = shell.split('\n');
  lines.forEach((l, i) => {
    const m = INCLUDE.exec(l);
    if (!m) {
      out.push(l + (i < lines.length - 1 ? '\n' : ''));
      line++;
      return;
    }
    if (m[1] && !dev) return;
    for (const p of partials(src, m[2])) {
      const n = p.text.split('\n').length - 1;
      map.push({ file: p.file, from: line, to: line + n - 1 });
      out.push(p.text);
      line += n;
    }
  });
  return { html: out.join(''), map };
}

// Which source file (and line in it) an assembled-page line comes from: for stack traces and errors.
function locate(map, line) {
  const m = map.find((x) => line >= x.from && line <= x.to);
  return m ? { file: m.file, line: line - m.from + 1 } : { file: 'index.html (shell)', line };
}

// The page at a git ref: that commit's src/ through its own assembler, or site/index.html before the split.
function assembleRef(ref, cwd = ROOT) {
  const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  const has = (p) => { try { git('cat-file', '-e', `${ref}:${p}`); return true; } catch { return false; } };
  if (!has('src/index.html')) return git('show', `${ref}:site/index.html`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-ref-'));
  try {
    const tar = execFileSync('git', ['archive', '--format=tar', ref, 'src', 'scripts'], { cwd, maxBuffer: 1 << 28 });
    execFileSync('tar', ['-x', '-C', tmp], { input: tar });
    return execFileSync(process.execPath, [path.join(tmp, 'scripts', 'lib', 'page.js')], { cwd: tmp, encoding: 'utf8', maxBuffer: 1 << 28 });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// The page as it ships: assembled, with labels shrunk to short ids (compile-labels.js). Not version-stamped.
// `dicts` ({lang: label-keyed dictionary}) come back with the same ids.
function shipped(dicts = {}) {
  const D = require('./dict');
  return require('./compile-labels').compile(assemble().html, D.read('en').dict, dicts);
}

// The shipped page written to a file, for tools that need a path (perf in a real browser, base vs head).
function pageFile(file = path.join(os.tmpdir(), `tubes-page-${process.pid}.html`)) {
  fs.writeFileSync(file, shipped().html);
  return file;
}

module.exports = { assemble, assembleRef, shipped, pageFile, locate, listFiles, ROOT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const html = opt('--ref') ? assembleRef(opt('--ref')) : args.includes('--source') ? assemble({ dev: args.includes('--dev') }).html : shipped().html;
  const out = opt('-o');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, html); }
  else process.stdout.write(html);
}

// The container image and the workflows that build things: what is published, how, and that every third-party piece is
// pinned. The image goes to GHCR for releases only (no :latest, no image per commit), never to Pages; it runs as node,
// from a base pinned by digest, with only what the servers read; its MCP server gets a token unless told otherwise; every
// GitHub Action is pinned to a commit; Dependabot keeps all of it current. docs/MCP.md, "In a container".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// Without comments: what a file says about itself is not what it does.
const code = (p) => read(p).split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
const WF = path.join(ROOT, '.github', 'workflows');

test('every GitHub Action in every workflow is pinned to a commit, with its version beside it', () => {
  const loose = [];
  for (const f of fs.readdirSync(WF).filter((f) => /\.ya?ml$/.test(f)))
    for (const [i, line] of read(`.github/workflows/${f}`).split('\n').entries()) {
      const m = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/.exec(line);
      if (!m || m[1].startsWith('./')) continue;
      if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(m[1]) || !/#\s*v\d+(\.\d+)*/.test(m[2])) loose.push(`${f}:${i + 1} ${m[1]}`);
    }
  assert.deepEqual(loose, []);
});

test('Dependabot keeps the actions, the image’s base and the npm tools current', () => {
  const d = read('.github/dependabot.yml');
  for (const [eco, dir] of [['github-actions', '/'], ['docker', '/docker'], ['npm', '/']])
    assert.match(d, new RegExp(`package-ecosystem: ${eco}\\s+directory: ${dir.replace('/', '\\/')}\\n`), eco);
});

test('the image is published for releases only, as their version, never as latest', () => {
  const w = code('.github/workflows/docker.yml');
  assert.doesNotMatch(w, /:latest\b|\blatest\b.*tags|tags:.*latest/, 'no latest');
  assert.doesNotMatch(w, /\$GITHUB_SHA|github\.sha\b.*tags/, 'no image per commit');
  assert.doesNotMatch(w, /^\s+release:/m, 'releases dispatch it; the release event does not');
  // Only the publish job may push or hold packages: write, and it runs only when a release dispatches it.
  const pub = w.slice(w.indexOf('\n  publish:'));
  const tst = w.slice(w.indexOf('\n  test:'), w.indexOf('\n  publish:'));
  assert.match(pub, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(pub, /needs: test/, 'only an image that passed the smoke test');
  assert.match(pub, /push: true/);
  assert.match(pub, /tags: \$\{\{ steps\.meta\.outputs\.image \}\}:\$\{\{ steps\.meta\.outputs\.version \}\}\n/, 'one tag: the version');
  assert.match(pub, /does not match package\.json/, 'the tag must be the release in package.json');
  assert.doesNotMatch(tst, /push: true|packages: write/, 'the test job never publishes');
  assert.match(w, /^permissions:\n {2}contents: read\n/m, 'read-only unless publishing');
  assert.doesNotMatch(w, /pages: write|deploy-pages/, 'never to Pages');
  // auto-release.yml is what dispatches it, with the new tag.
  assert.match(read('.github/workflows/auto-release.yml'), /gh workflow run docker\.yml [^\n]*-f tag=/);
});

test('the image: pinned base, locked dependencies, only what the servers need, not root', () => {
  const d = code('docker/Dockerfile');
  assert.match(d, /^FROM node:\d+-slim@sha256:[0-9a-f]{64}$/m, 'the base is pinned by digest');
  const nodeMajor = /FROM node:(\d+)/.exec(d)[1];
  for (const m of read('.github/workflows/ci.yml').matchAll(/node-version: (\d+)/g)) assert.equal(m[1], nodeMajor, 'the Node major CI tests on');
  assert.match(d, /npm ci\b/); assert.doesNotMatch(d, /npm install\b/);
  assert.ok(d.indexOf('COPY package.json package-lock.json') < d.indexOf('npm ci') && d.indexOf('npm ci') < d.indexOf('COPY src'), 'dependencies are their own layer');
  assert.doesNotMatch(d, /^COPY \. /m, 'not the whole repository');
  assert.doesNotMatch(d, /chown -R/, 'no second copy of every file just to change its owner');
  assert.match(d, /^USER node$/m);
  const ig = read('.dockerignore').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(ig[0], '*', 'the build context is an allow-list');
  for (const m of d.matchAll(/^COPY (?:--\S+ )*(\S+)/gm)) if (m[1] !== 'package.json') assert.ok(ig.includes('!' + m[1]) || ig.includes('!' + m[1] + '/'), `${m[1]} is let into the context`);
});

test('the entrypoint: both modes, a token unless told otherwise, and the servers run directly', () => {
  const e = code('docker/docker-entrypoint.sh');
  assert.match(e, /browser\|headless/);
  assert.match(e, /SOT_MCP_TOKEN=\$\(node -e/, 'makes a token when none is given');
  assert.match(e, /MCP_NO_TOKEN/, 'and can be told not to');
  assert.match(e, /start node scripts\/dev\.js --host 0\.0\.0\.0 --port 8080/);
  assert.match(e, /start node scripts\/mcp\.js --browser/);
  assert.doesNotMatch(e, /npm run/);
  // Every file the image's servers load at start is in the image.
  for (const f of ['scripts/mcp.js', 'scripts/dev.js', 'tests/harness.js', 'scripts/lib/page.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

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
  const mcp = w.slice(0, w.indexOf('\n  relay-test:'));
  assert.doesNotMatch(mcp, /:latest\b|\blatest\b.*tags|tags:.*latest/, 'no latest for the MCP image');
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

// The relay image (docs/HOSTING.md): its version always; X.Y and latest move only to the newest stable release, so a
// rebuilt older tag or a pre-release never takes them.
test('the relay image: version, X.Y and latest tags only for the newest release, with OCI labels and provenance', () => {
  const w = code('.github/workflows/docker.yml');
  const job = w.slice(w.indexOf('\n  relay-publish:'));
  assert.match(job, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(job, /needs: \[gate, relay-test\]/);
  assert.match(job, /platforms: linux\/amd64,linux\/arm64/);
  assert.match(job, /tags="\$image:\$ver"/, 'the exact version, always');
  assert.match(job, /\*-\*\) echo "\$ver is a pre-release/, 'pre-releases get their version only');
  assert.match(job, /ls-remote --tags --refs origin 'refs\/tags\/v\*'/, 'compared with the release tags');
  assert.match(job, /tail -n1\)" = "\$ver" \]; then\n\s+tags="\$tags"\$'\\n'"\$image:latest"/, 'latest only for the newest');
  assert.match(job, /tags: \$\{\{ steps\.meta\.outputs\.tags \}\}/);
  for (const l of ['source', 'version', 'licenses', 'description', 'revision']) assert.match(job, new RegExp(`org\\.opencontainers\\.image\\.${l}=`), l);
  assert.match(job, /provenance: mode=max/); assert.match(job, /sbom: true/);
  const d = code('relay/Dockerfile');
  assert.match(d, /^FROM scratch$/m); assert.match(d, /^USER 65532:65532$/m);
  assert.match(d, /^EXPOSE 8080 9100$/m, 'the relay and its metrics');
  assert.match(d, /RELAY_METRICS=0\.0\.0\.0:9100 RELAY_METRICS_PUBLIC=true/, 'relay init in the image opts in to metrics for the Docker network');
});

// relay-release.yml: archives for every platform, checksums, provenance; write permissions only in the job that needs them.
test('the relay binaries: archives for many platforms, SHA256SUMS and a provenance attestation', () => {
  const w = code('.github/workflows/relay-release.yml');
  assert.match(w, /^permissions:\n {2}contents: read\n/m);
  const job = w.slice(w.indexOf('\n  binaries:'));
  for (const p of ['contents: write', 'id-token: write', 'attestations: write']) assert.match(job, new RegExp(p));
  for (const t of ['linux/amd64', 'linux/arm64', 'linux/arm/6', 'linux/arm/7', 'linux/riscv64', 'darwin/arm64', 'windows/amd64', 'freebsd/amd64', 'openbsd/arm64', 'netbsd/amd64'])
    assert.ok(job.includes(t), t);
  assert.match(job, /CGO_ENABLED=0 [^\n]*go build -trimpath -buildvcs=false/);
  assert.match(job, /-buildid= -X main\.version=\$ver/);
  assert.match(job, /zip -q -X/); assert.match(job, /gzip -n/);
  assert.match(job, /cp \.\.\/LICENSE/); assert.match(job, /HOSTING\.md/);
  assert.match(job, /sha256sum tubes-relay-\* > SHA256SUMS/);
  assert.match(read('.github/workflows/relay-release.yml'), /uses: actions\/attest-build-provenance@[0-9a-f]{40} # v\d/);
  assert.match(read('.github/workflows/auto-release.yml'), /gh workflow run relay-release\.yml [^\n]*-f tag=/);
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

test('the registry check runs a relay built from the base branch, never from the pull request', () => {
  const w = code('.github/workflows/ci.yml');
  const job = w.slice(w.indexOf('\n  registry:'), w.indexOf('\n  test:'));
  assert.match(job, /git worktree add --detach "\$RUNNER_TEMP\/base" HEAD\^1/, 'the base is checked out apart');
  assert.match(job, /go-version-file: \$\{\{ runner\.temp \}\}\/base\/relay\/go\.mod/, 'its Go version comes from the base');
  assert.match(job, /cd "\$RUNNER_TEMP\/base\/relay" && go build/, 'built there');
  assert.doesNotMatch(job, /cd relay && go build|go-version-file: relay\//, 'not from the pull request');
  assert.match(job, /GOWORK: 'off'/);
  // The protections that were there stay: PR data only through env, output fenced from workflow commands.
  assert.match(job, /::stop-commands::\$stop/);
  assert.match(job, /FILES: \$\{\{ steps\.files\.outputs\.files \}\}/);
  assert.doesNotMatch(job, /run:[^\n]*\$\{\{/, 'no expressions inside run scripts');
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

// relay/docker-compose.yml: the whole server from a checkout (docs/HOSTING.md, "From the repo"), also through a remote
// Docker context, where bind mounts would name the server's files: named volumes and inline configs only, the image
// built from relay/ itself, every setting from .env, certbot without questions, metrics never published.
test('the relay’s Compose file: built from relay/, named volumes only, certbot non-interactive, metrics unpublished', () => {
  const y = code('relay/docker-compose.yml');
  assert.match(y, /^ {4}image: \$\{RELAY_IMAGE:-ghcr\.io\/fjaeckel\/seriesoftubes-relay:latest\}\n {4}build:\n {6}context: \.\n/m);
  assert.match(y, /command: \["up"\]/);
  assert.match(code('relay/Dockerfile'), /^CMD \["up"\]$/m, 'the image sets up and serves by default');
  // Volumes: named, declared at the top level; no host paths, no bind mounts.
  const top = y.slice(y.indexOf('\nvolumes:\n'));
  const named = [...top.slice(0, top.indexOf('\nconfigs:')).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(named.sort(), ['letsencrypt_certs', 'relay_certs', 'relay_data']);
  const mounts = [...y.matchAll(/^\s+- ([^\s"]+):(\/\S*)$/gm)];
  assert.ok(mounts.length >= 5, 'the mounts are found');
  for (const m of mounts) assert.ok(named.includes(m[1]), `${m[0].trim()} is a named volume`);
  assert.doesNotMatch(y, /type: bind|^\s+- \.{0,2}\/|^\s+- ~/m, 'no bind mounts');
  assert.match(y, /- relay_certs:\/certs:ro/, 'the relay only reads the certificates');
  // Required settings fail clearly.
  assert.match(y, /\$\{RELAY_DOMAIN:\?set RELAY_DOMAIN in \.env\}/);
  assert.match(y, /\$\{LETSENCRYPT_EMAIL:\?set LETSENCRYPT_EMAIL in \.env/);
  // The relay serves TLS itself; metrics stay on the Compose network.
  assert.match(y, /- "\$\{RELAY_HTTPS_PORT:-443\}:8443"/);
  assert.match(y, /RELAY_TLS_CERT: \/certs\/fullchain\.pem/);
  for (const m of y.matchAll(/^\s+- "([^"]+)"$/gm)) assert.doesNotMatch(m[1], /9100/, 'metrics are not published');
  assert.match(read('relay/docker-compose.yml'), /# - "127\.0\.0\.1:9100:9100"/, 'publishing them to loopback is shown, commented');
  // certbot: issues by itself, never asks, renews every 12 hours, hands the pair over atomically as the relay's user.
  const run = y.slice(y.indexOf('certbot-run:'), y.indexOf('certbot-hook:\n    content'));
  assert.match(run, /certbot certonly --standalone --non-interactive --agree-tos -m "\$\$EMAIL"/);
  assert.match(run, /--staging/); assert.match(run, /certbot renew --standalone/); assert.match(run, /pause 12h/);
  const hook = y.slice(y.indexOf('certbot-hook:\n    content'));
  assert.match(hook, /chown 65532:65532/);
  assert.ok(hook.indexOf('mv /certs/.privkey.pem.new') > hook.indexOf('chown') && hook.indexOf('mv /certs/.fullchain.pem.new') > hook.indexOf('mv /certs/.privkey.pem.new'));
  // Every setting is in .env.example; .env is never committed and never sent into the image.
  const env = read('relay/.env.example');
  for (const v of new Set([...y.matchAll(/\$\{(\w+)/g)].map((m) => m[1]))) assert.match(env, new RegExp(`^(# )?${v}=`, 'm'), `${v} in .env.example`);
  assert.match(env, /subscriber agreement/);
  assert.ok(read('.gitignore').split('\n').includes('/relay/.env'));
  assert.ok(read('relay/.dockerignore').split('\n').includes('.env'));
});

// relay/.env.example: what every server needs, then its description, then the rest commented out under "Advanced", so
// a copy of the file founds a server. A second node sets RELAY_JOIN only: its nodes come from the registry.
test('the relay’s .env.example: required, your server, and the advanced settings commented out', () => {
  const env = read('relay/.env.example');
  const y = code('relay/docker-compose.yml');
  const at = (h) => { const i = env.indexOf(`# --- ${h}`); assert.ok(i >= 0, h); return i; };
  const req = at('Required'), srv = at('Your server'), adv = at('Advanced (optional)');
  assert.ok(req < srv && srv < adv, 'in that order');
  const set = (part) => [...part.matchAll(/^(\w+)=/gm)].map((m) => m[1]);
  const off = (part) => [...part.matchAll(/^# (\w+)=/gm)].map((m) => m[1]);
  assert.deepEqual(set(env.slice(req, srv)), ['RELAY_DOMAIN', 'LETSENCRYPT_EMAIL']);
  assert.deepEqual(set(env.slice(srv, adv)), ['RELAY_NAME', 'RELAY_SYNC', 'RELAY_LANGS', 'RELAY_DESC']);
  assert.deepEqual(set(env.slice(adv)), [], 'nothing advanced is set');
  const advanced = off(env.slice(adv));
  for (const v of ['RELAY_JOIN', 'RELAY_JOIN_FROM', 'RELAY_REGISTRY', 'RELAY_NOTIFY_URL', 'RELAY_IMAGE', 'RELAY_VERSION', 'CERTBOT_IMAGE',
    'RELAY_HTTPS_PORT', 'RELAY_HTTP_PORT', 'RELAY_METRICS', 'RELAY_URL', 'RELAY_LOG_JSON', 'CERTBOT_STAGING']) assert.ok(advanced.includes(v), `${v} under Advanced`);
  // Every variable Compose reads is in the file, and every one there is read.
  const used = new Set([...y.matchAll(/\$\{(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...new Set([...set(env), ...off(env)])].sort(), [...used].sort());
  // Joining: the registry gives the nodes; RELAY_JOIN_FROM is for servers not in it; a notice per release.
  const a = env.slice(adv);
  assert.match(a.slice(0, a.indexOf('# RELAY_JOIN=')), /servers\.json/, 'RELAY_JOIN explains the registry');
  assert.match(a, /not in the list \(new, unlisted, private or on a LAN\)/);
  assert.match(a, /ntfy/);
  for (const v of ['RELAY_JOIN', 'RELAY_JOIN_FROM', 'RELAY_REGISTRY']) assert.match(y, new RegExp(`${v}: \\$\\{${v}:-\\}`), `${v} passed through, empty by default`);
});

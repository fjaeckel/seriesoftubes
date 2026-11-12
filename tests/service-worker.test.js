// The service worker (site/sw.js) run for real against a mocked cache and network: the offline copy of the game page
// is only ever the game page itself, so a mistyped address opened online can't leave a 404 behind for offline play.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function worker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'site', 'sw.js'), 'utf8');
  const store = new Map(), L = {}, kept = [];
  const key = (k) => (typeof k === 'string' ? k : new URL(k.url).pathname);
  const cache = { put: async (k, r) => { store.set(key(k), r); }, match: async (k) => store.get(key(k)), addAll: async () => {} };
  const net = { online: true };
  const res = (body, status, type = 'basic') => ({ ok: status >= 200 && status < 300, status, type, body, clone() { return res(body, status, type); } });
  const g = {
    self: { addEventListener: (t, f) => { L[t] = f; }, clients: { claim() {} }, skipWaiting() {} },
    location: new URL('https://seriesoftub.es/sw.js'),
    caches: { open: async () => cache, match: async (k) => store.get(key(k)), keys: async () => [] },
    fetch: async (req) => {
      if (!net.online) throw new TypeError('offline');
      const p = new URL(req.url).pathname;
      return p === '/site.webmanifest' ? res('MANIFEST', 200) : p === '/' || p === '/index.html' ? res('GAME', 200) : p === '/llms.txt' ? res('LLMS', 200) : p === '/down' ? res('OUTAGE', 503) : res('404 PAGE', 404);
    },
    URL, Response: { error: () => res('', 0, 'error') },
  };
  new Function(...Object.keys(g), src)(...Object.values(g));
  const go = async (p, mode = 'navigate') => {
    let out;
    L.fetch({ request: { method: 'GET', url: 'https://seriesoftub.es' + p, mode }, respondWith: (x) => { out = x; }, waitUntil: (x) => kept.push(x) });
    const r = await out;
    await Promise.all(kept);
    return r && r.body;
  };
  return { go, net, store };
}

test('only the game page becomes the offline copy: a 404, a text file or an outage page never replace it', async () => {
  const w = worker();
  assert.equal(await w.go('/'), 'GAME');
  for (const p of ['/typo', '/llms.txt', '/down']) await w.go(p);
  w.net.online = false;
  assert.equal(await w.go('/'), 'GAME', 'offline, the game still starts');
});

test('background refreshes are kept alive until stored (waitUntil)', async () => {
  const w = worker();
  await w.go('/site.webmanifest', 'cors');
  assert.ok(w.store.has('/site.webmanifest'), 'stored once the worker is allowed to finish');
});

/* Series of Tubes service worker: makes the game installable and playable offline.
   The page always comes from the network when there is one, so a new release shows up on the
   next visit; everything else is served from the cache and refreshed in the background. */
const CACHE = 'sot-__VERSION__';
const CORE = ['/', '/index.html', '/site.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/i18n/it.js?v=__VERSION__', '/i18n/pt.js?v=__VERSION__', '/i18n/fr.js?v=__VERSION__'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sot-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // The update check must always ask the network.
  if (url.origin === location.origin && url.pathname === '/version.json') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return r; })
      .catch(() => caches.match('/').then((r) => r || caches.match('/index.html'))));
    return;
  }
  const local = url.origin === location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!local && !fonts) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});

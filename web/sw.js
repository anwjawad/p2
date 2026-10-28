// Service worker: caches the app shell (static files) for fast repeat loads.
// Patient data is NEVER cached: requests to Apps Script, CDNs and any non-GET
// request go straight to the network.
const VERSION = '__BUILD_VERSION__';
const CACHE = 'rounds-shell-' + VERSION;
const SHELL = ['./', './index.html', './css/styles.css', './css/cath-studio.css', './js/config.js', './js/core.js',
  './js/patient-renderer.js', './js/main.js', './js/ui.js', './js/notes.js', './js/cath-studio-adapter.js',
  './manifest.json', './icons/icon-192.png', './icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('rounds-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // data + CDNs: network only
  // Network first for the page so new deploys show up at once; cached copy only when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});

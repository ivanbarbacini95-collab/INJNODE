const CACHE_NAME = 'inj-node-v16.00.20-shell';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=16.00.20',
  './viewport.css?v=16.00.14',
  './viewport.js?v=16.00.14',
  './style.css?v=16.00.19',
  './app.js?v=16.00.18',
  './i18n.js?v=16.00.14',
  './live-charts.html',
  './live-charts.css?v=16.00.18',
  './live-charts.js?v=16.00.18',
  './live-rewards.html',
  './live-rewards.css?v=16.00.14',
  './live-rewards.js?v=16.00.14',
  './order-book.html',
  './order-book.css?v=16.00.18',
  './order-book.js?v=16.00.18',
  './command-center.html',
  './command-center.css?v=16.00.18',
  './command-center.js?v=16.00.18',
  './treasury.html',
  './treasury.css?v=16.00.18',
  './treasury.js?v=16.00.18',
  './inj-flow.html',
  './inj-flow.css?v=16.00.20',
  './inj-flow.js?v=16.00.20',
  './icons/apple-touch-icon-v15.68.png',
  './icons/favicon-32-v15.68.png',
  './icons/favicon-64-v15.68.png',
  './icons/icon-192-v15.68.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key.startsWith('inj-node-')).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const isolatedPath = ['live-charts.html', 'live-rewards.html', 'command-center.html', 'order-book.html', 'treasury.html', 'inj-flow.html'].find((name) => url.pathname.endsWith('/' + name));
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(isolatedPath ? request : './index.html', copy));
          }
          return response;
        })
        .catch(() => isolatedPath ? caches.match(request).then((hit) => hit || caches.match('./' + isolatedPath)) : caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});

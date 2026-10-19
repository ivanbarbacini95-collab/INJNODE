const CACHE_NAME = 'inj-node-v16.00.99-home-pnl-manual-ownership';
const APP_SHELL = [
  './navigation.css?v=160090',
  './navigation.css?v=160088',
  './navigation.css?v=160080',
  './navigation.js?v=160090',
  './navigation.js?v=160084',
  // Standalone sections still request these legacy cache keys.
  './navigation.css?v=160074',
  './navigation.js?v=160074',
  './i18n.js?v=160072',
  './',
  './index.html',
  './home-vitality.css?v=1.0.1',
  './home-vitality.js?v=1.0.1',
  './home-vitality-v2.css?v=160096',
  './home-layout-polish.css?v=160099',
  './ios-screen-fixes.css?v=160095',
  './ios-converter-keyboard.js?v=160095',
  './treasury-ownership.css?v=160099',
  './market.html',
  './comparison.html',
  './home-vitality.js?v=1.0.0',
  './comparison.css?v=160095',
  './comparison-ab.css?v=160095',
  './comparison.js?v=160095',
  './market-portal.js?v=160076',
  './market-lang.js?v=160082',
  './market.css?v=160082',
  './market.js?v=160082',
  './manifest.webmanifest?v=16.00.14',
  './viewport.css?v=16.00.74',
  './top-clarity.css?v=16.00.88',
  './viewport.js?v=16.00.14',
  './style.css?v=16.00.49',
  './app.js?v=16.00.90',
  './i18n.js?v=160090',
  './i18n.js?v=160088',
  './i18n.js?v=160084',
  './scroll-guard.js?v=160074',
  './live-charts.html',
  './live-charts.css?v=16.00.39',
  './live-charts.js?v=16.00.18',
  './live-rewards.html',
  './live-rewards.css?v=16.00.39',
  './live-rewards.js?v=16.00.46',
  './order-book.html',
  './order-book.css?v=16.00.39',
  './order-book.js?v=16.00.18',
  './command-center.html',
  './command-center.css?v=16.00.39',
  './command-center.js?v=16.00.18',
  './treasury.html',
  './treasury.css?v=16.00.39',
  './treasury.js?v=16.00.99'
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
    const isolatedPath = ['live-charts.html', 'live-rewards.html', 'command-center.html', 'order-book.html', 'treasury.html', 'market.html', 'comparison.html'].find((name) => url.pathname.endsWith('/' + name));
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
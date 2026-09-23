const CACHE_NAME = 'inj-node-v15.99.25-shell';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=15.99.25',
  './app.js?v=15.99.25',
  './live-charts.html?v=15.99.25',
  './live-charts.css?v=15.99.25',
  './live-charts.js?v=15.99.25',
  './order-book.html?v=15.99.25',
  './order-book.css?v=15.99.25',
  './order-book.js?v=15.99.25',
  './command-center.html?v=15.99.25',
  './command-center.css?v=15.99.25',
  './command-center.js?v=15.99.25',
  './treasury.html?v=15.99.25',
  './treasury.css?v=15.99.25',
  './treasury.js?v=15.99.25',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
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

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    const isLiveCharts = url.pathname.endsWith('/live-charts.html');
    const isCommandCenter = url.pathname.endsWith('/command-center.html');
    const isOrderBook = url.pathname.endsWith('/order-book.html');
    const isTreasury = url.pathname.endsWith('/treasury.html');
    const isolated = isLiveCharts || isCommandCenter || isOrderBook || isTreasury;
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(isolated ? request : './index.html', copy));
          return response;
        })
        .catch(() => {
          if (isLiveCharts) return caches.match(request).then((hit) => hit || caches.match('./live-charts.html?v=15.99.25'));
          if (isCommandCenter) return caches.match(request).then((hit) => hit || caches.match('./command-center.html?v=15.99.25'));
          if (isOrderBook) return caches.match(request).then((hit) => hit || caches.match('./order-book.html?v=15.99.25'));
          if (isTreasury) return caches.match(request).then((hit) => hit || caches.match('./treasury.html?v=15.99.25'));
          return caches.match('./index.html');
        })
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
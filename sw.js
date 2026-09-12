const CACHE_NAME = 'inj-node-v15.98.110-shell';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=15.98.110',
  './app.js?v=15.98.110',
  './live-charts.html?v=15.98.110',
  './live-charts.css?v=15.98.110',
  './live-charts.js?v=15.98.110',
  './order-book.html?v=15.98.110',
  './order-book.css?v=15.98.110',
  './order-book.js?v=15.98.110',
  './command-center.html?v=15.98.110',
  './command-center.css?v=15.98.110',
  './command-center.js?v=15.98.110',
  './manifest.webmanifest?v=15.98.110',
  './icons/inj-node-source.svg'
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

  if (request.mode === 'navigate') {
    const isLiveCharts = url.pathname.endsWith('/live-charts.html');
    const isCommandCenter = url.pathname.endsWith('/command-center.html');
    const isOrderBook = url.pathname.endsWith('/order-book.html');
    const isolated = isLiveCharts || isCommandCenter || isOrderBook;
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(isolated ? request : './index.html', copy));
          return response;
        })
        .catch(() => {
          if (isLiveCharts) return caches.match(request).then((hit) => hit || caches.match('./live-charts.html?v=15.98.110'));
          if (isCommandCenter) return caches.match(request).then((hit) => hit || caches.match('./command-center.html?v=15.98.110'));
          if (isOrderBook) return caches.match(request).then((hit) => hit || caches.match('./order-book.html?v=15.98.110'));
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

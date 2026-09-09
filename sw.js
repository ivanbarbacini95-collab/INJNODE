const CACHE_NAME = 'inj-node-v15.98.54-shell';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=15.98.54',
  './app.js?v=15.98.54',
  './live-charts.html?v=15.98.54',
  './live-charts.css?v=15.98.54',
  './live-charts.js?v=15.98.54',
  './command-center.html?v=15.98.54',
  './command-center.css?v=15.98.54',
  './command-center.js?v=15.98.54',
  './manifest.webmanifest?v=15.98.54',
  './icons/icon-192-v15.68.png',
  './icons/icon-512-v15.68.png',
  './icons/icon-maskable-512-v15.68.png',
  './icons/apple-touch-icon-v15.68.png',
  './icons/favicon-32-v15.68.png',
  './icons/favicon-64-v15.68.png'
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
    const isolated = isLiveCharts || isCommandCenter;
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(isolated ? request : './index.html', copy));
          return response;
        })
        .catch(() => {
          if (isLiveCharts) return caches.match(request).then((hit) => hit || caches.match('./live-charts.html?v=15.98.54'));
          if (isCommandCenter) return caches.match(request).then((hit) => hit || caches.match('./command-center.html?v=15.98.54'));
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

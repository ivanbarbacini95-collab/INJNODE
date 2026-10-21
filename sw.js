const CACHE_NAME = 'inj-node-v16.03.11-centered-yields';
const APP_SHELL = [
  './navigation.css?v=160090',
  './navigation.css?v=160088',
  './navigation.css?v=160080',
  './navigation.js?v=160120',
  './navigation.js?v=160119',
  './navigation.js?v=160117',
  './navigation.js?v=160110',
  './navigation.js?v=160109',
  './navigation.js?v=160084',
  // Standalone sections still request these legacy cache keys.
  './navigation.css?v=160074',
  './navigation.js?v=160074',
  './i18n.js?v=160072',
  './',
  './index.html',
  './scroll-edges.css?v=160129',
  './scroll-edges.js?v=160143',
  './wallet-edge-scroll-stability.css?v=160143',
  './dashboard-native-scroll.css?v=160306',
  './menu-accordion.css?v=160145',
  './home-mobile-launcher-fix.css?v=160204',
  './section-heading-harmony.css?v=160131',
  './unified-navigation.css?v=160138',
  './menu-header-clear.css?v=160139',
  './intro-b-capital.css?v=160142',
  './live-charts-open-history.css?v=160140',
  './b-capital-group-brand.png',
  './section-heading-harmony.js?v=160131',
  './home-vitality.css?v=1.0.1',
  './home-vitality.js?v=160121',
  './home-vitality.js?v=1.0.3',
  './home-vitality-v2.css?v=160096',
  './home-layout-polish.css?v=160099',
  './home-pnl-focus.css?v=160101',
  './node-pulse.css?v=160103',
  './jn-branding.css?v=160106',
  './ocean-aurora.css?v=160109',
  './ocean-aurora.js?v=160109',
  './chromatic-mist.css?v=160110',
  './chromatic-mist.js?v=160110',
  './theme-harmony.css?v=160114',
  './ocean-x-series.css?v=160114',
  './ocean-x-series.js?v=160114',
  './theme-catalog.css?v=160114',
  './home-desktop-tiles.css?v=160115',
  './wallet-dock-transparent.css?v=160116',
  './visualize-wealth.html',
  './visualize-wealth.css?v=160152',
  './visualize-wealth.js?v=160151',
  './visualize-wealth-home.css?v=160127',
  './aqua-mirage.css?v=160113',
  './aqua-mirage.js?v=160113',
  './velvet-nebula.css?v=160112',
  './velvet-nebula.js?v=160112',
  './ios-screen-fixes.css?v=160095',
  './ios-converter-keyboard.js?v=160095',
  './treasury-ownership.css?v=160099',
  './market.html',
  './comparison.html',
  './home-vitality.js?v=1.0.0',
  './comparison.css?v=160095',
  './comparison-ab.css?v=160095',
  './comparison.js?v=160095',
  './market-portal.js?v=160108',
  './market-lang.js?v=160082',
  './market.css?v=160082',
  './market.js?v=160108',
  './market-pro.css?v=160108',
  './market-pro.js?v=160108',
  './manifest.webmanifest?v=16.00.14',
  './viewport.css?v=16.00.74',
  './top-clarity.css?v=16.00.88',
  './viewport.js?v=16.00.14',
  './style.css?v=16.01.44',
  './app.js?v=16.03.05',
  './i18n.js?v=160145',
  './i18n.js?v=160117',
  './i18n.js?v=160088',
  './i18n.js?v=160084',
  './scroll-guard.js?v=160306',
  './live-charts.html',
  './live-charts.css?v=16.00.39',
  './live-charts.js?v=16.00.40',
  './live-rewards.html',
  './live-rewards.css?v=16.00.39',
  './reward-velocity.css?v=160122',
  './live-rewards.js?v=160122',
  './order-book.html',
  './order-book.css?v=16.00.39',
  './order-book.js?v=16.00.18',
  './command-center.html',
  './command-center-flash.css?v=160307',
  './command-center-flash.js?v=160307',
  './command-center.css?v=16.00.39',
  './command-center.js?v=16.03.07',
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
    const isolatedPath = ['live-charts.html', 'live-rewards.html', 'command-center.html', 'order-book.html', 'treasury.html', 'market.html', 'comparison.html', 'visualize-wealth.html'].find((name) => url.pathname.endsWith('/' + name));
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
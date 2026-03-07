importScripts('/sw-assets.js');

const CACHE_NAME = 'tee-time-brs-v7';
const ASSETS_TO_CACHE = Array.isArray(self.__SW_ASSETS) ? self.__SW_ASSETS : ['/', '/index.html', '/style.css', '/script.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Always go to network for API calls so data is fresh; fall back to cache only on failure.
  if (url.pathname.startsWith('/api/')) {
    const networkReq = new Request(event.request, { cache: 'no-store' });
    event.respondWith(
      fetch(networkReq).catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for same-origin app shell/assets to avoid stale UI buttons.
  if (url.origin === self.location.origin) {
    const networkReq = new Request(event.request, { cache: 'no-store' });
    event.respondWith(
      fetch(networkReq)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Fallback behavior for cross-origin requests.
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

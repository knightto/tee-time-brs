const CACHE_NAME = 'tee-time-brs-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/handicaps.html',
  '/handicap-import.html',
  '/user-guide.html',
  '/style.css',
  '/script.js',
  '/admin.js',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
  // Add more assets if needed (e.g., images in /assets/)
];

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
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached ||
      fetch(event.request).then(response => {
        return response;
      }).catch(() => {
        // Optionally return fallback page/image here
      })
    )
  );
});

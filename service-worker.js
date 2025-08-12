const CACHE_NAME = 'timetrack-v1.3.3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './script.js',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const url of STATIC_ASSETS) {
        try { await cache.add(url); } catch (e) { /* skip broken asset */ }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => { if (n !== CACHE_NAME) return caches.delete(n); })))
  );
  self.clients.claim();
});

// Cache-only for static assets; bypass Google Apps Script API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    const inList = STATIC_ASSETS.some(a => {
      const path = a.startsWith('./') ? a.slice(1) : a;
      return url.pathname.endsWith(path);
    });
    if (inList) {
      event.respondWith(
        caches.match(event.request).then(r => r || fetch(event.request))
      );
      return;
    }
  }
  // Default: go to network for everything else
});

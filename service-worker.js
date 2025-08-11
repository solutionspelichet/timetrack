// SW ultra simple: cache shell + offline fallback
const CACHE = 'tt-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './script.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', (e)=>{
  const req = e.request;
  // Network-first for API, Cache-first for assets
  if(req.url.includes('script.google.com')){
    e.respondWith(fetch(req).catch(()=>caches.match(req)));
  } else {
    e.respondWith(caches.match(req).then(cached=>cached || fetch(req)));
  }
});

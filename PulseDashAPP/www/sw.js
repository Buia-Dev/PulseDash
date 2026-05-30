const CACHE_NAME = 'pulsedash-v6.5';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/js/state.js',
  '/js/utils.js',
  '/js/renderers.js',
  '/js/editor.js',
  '/js/main.js',
  '/js/trip.js',
  '/js/perf.js',
  '/js/transport.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  console.log('[PulseDash] Instalando Service Worker e fazendo cache dos assets...');
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[PulseDash] Service Worker Ativado.');
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => { if(k !== CACHE_NAME) return caches.delete(k); })
    ))
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // API requests: Network only, don't cache
  if (url.pathname.startsWith('/dados') || url.pathname.startsWith('/bt/') || url.pathname === '/config') {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Assets: Network First, Fallback to Cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

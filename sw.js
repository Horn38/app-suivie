// sw.js - Service Worker pour Planif'Chantier Lite
const CACHE_NAME = 'planif-chantier-lite-v9';
const FILES_TO_CACHE = [
  'manifest.json',
  'android-launchericon-48-48.png',
  'android-launchericon-72-72.png',
  'android-launchericon-96-96.png',
  'android-launchericon-144-144.png',
  'android-launchericon-192-192.png',
  'android-launchericon-512-512.png',
  '180.png'
];

// Installation : cache les fichiers statiques (PAS index.html)
self.addEventListener('install', event => {
  console.log('[SW] Install v9');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activation : nettoie les anciens caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate v9');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    })
    .then(() => self.clients.claim())
  );
});

// Fetch : Network First pour index.html, Cache First pour le reste
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);
  const isIndexHtml = url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (isIndexHtml) {
    // Network First pour index.html — toujours la version la plus récente
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback cache si offline
          return caches.match(event.request);
        })
    );
  } else {
    // Cache First pour les autres fichiers (icônes, manifest...)
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) return response;
          return fetch(event.request).then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return networkResponse;
          });
        })
    );
  }
});

// sw.js - Adapté de ta première app - Version pour Planif'Chantier Lite
const CACHE_NAME = 'planif-chantier-lite-v1'; // Change le numéro pour forcer mise à jour
const SCOPE_PATH = '/'; // Racine pour cette app

const STATIC_ASSETS = [
  SCOPE_PATH,
  SCOPE_PATH + 'index.html',
  SCOPE_PATH + 'manifest.json',
  SCOPE_PATH + 'android-launchericon-48-48.png',
  SCOPE_PATH + 'android-launchericon-72-72.png',
  SCOPE_PATH + 'android-launchericon-96-96.png',
  SCOPE_PATH + 'android-launchericon-144-144.png',
  SCOPE_PATH + 'android-launchericon-192-192.png',
  SCOPE_PATH + 'android-launchericon-512-512.png',
  SCOPE_PATH + '180.png',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

const FALLBACK_HTML = SCOPE_PATH + 'index.html';

self.addEventListener('install', event => {
  console.log('[SW Planif] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW Planif] Cache ouvert');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => console.error('[SW Planif] Erreur cache install:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW Planif] Activation - Nettoyage anciens caches');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW Planif] Suppression ancien cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Ne gérer que les requêtes de notre scope
  if (!event.request.url.startsWith(self.location.origin + SCOPE_PATH)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Mise à jour en arrière-plan
          fetch(event.request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
            })
            .catch(() => console.log('[SW Planif] Offline - utilisation cache'));
          return cachedResponse;
        }

        // Pas en cache → réseau
        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => {
            console.log('[SW Planif] Offline - Fallback vers index.html');
            return caches.match(FALLBACK_HTML);
          });
      })
  );
});

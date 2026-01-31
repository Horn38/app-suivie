// sw.js - Service Worker pour Planif'Chantier Lite
// Version simple mais robuste : cache les fichiers essentiels + fallback offline

const CACHE_NAME = 'planif-chantier-lite-v2';  // Change le numéro de version quand tu updates (ex: v2)
const OFFLINE_URL = '/app-suivie/offline.html';  // Optionnel : crée un offline.html si tu veux une page sympa offline

// Liste des fichiers à mettre en cache dès l'installation
const FILES_TO_CACHE = [
  '/',
  '/app-suivie/',
  '/app-suivie/index.html',
  '/app-suivie/manifest.json',
  '/app-suivie/android-launchericon-48-48.png',
  '/app-suivie/android-launchericon-72-72.png',
  '/app-suivie/android-launchericon-96-96.png',
  '/app-suivie/android-launchericon-144-144.png',
  '/app-suivie/android-launchericon-192-192.png',
  '/app-suivie/android-launchericon-512-512.png'
];

// Installation du Service Worker : cache les fichiers essentiels
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting())  // Force l'activation immédiate
  );
});

// Activation : nettoie les anciens caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
    .then(() => self.clients.claim())  // Prend le contrôle immédiatement
  );
});

// Interception des requêtes (stratégie Cache First, puis Network)
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET ou cross-origin (ex: analytics, extensions Chrome)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si trouvé dans le cache → on renvoie ça (rapide + offline)
        if (response) {
          console.log('[SW] Serve from cache:', event.request.url);
          return response;
        }

        // Sinon → fetch réseau
        return fetch(event.request)
          .then(networkResponse => {
            // Vérifie si réponse valide avant de la cacher
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone la réponse pour la mettre en cache ET la renvoyer
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // En cas d'erreur réseau (offline) → fallback vers une page offline si tu en as une
            // Optionnel : return caches.match(OFFLINE_URL);
            console.log('[SW] Offline fallback pour:', event.request.url);
            // Pour l'instant, on laisse juste passer l'erreur ou renvoyer un message basique
            return new Response('Vous êtes hors ligne. Certaines fonctionnalités peuvent être limitées.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

const CACHE_NAME = 'timetrack-v1.2.1';
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
  './icons/icon-512.png',
  'https://cdn.tailwindcss.com'
];

// Installation du Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Installation en cours...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des ressources statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Installation terminée');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Erreur lors de l\'installation:', error);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activation en cours...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Suppression ancien cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation terminée');
        return self.clients.claim();
      })
      .catch(error => {
        console.error('[SW] Erreur lors de l\'activation:', error);
      })
  );
});

// Stratégie de mise en cache
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorer les requêtes vers des domaines externes (sauf Tailwind)
  if (url.origin !== location.origin && !url.href.includes('cdn.tailwindcss.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        // Si trouvé en cache, le retourner
        if (cachedResponse) {
          console.log('[SW] Ressource servie depuis le cache:', request.url);
          return cachedResponse;
        }
        
        // Sinon, faire la requête réseau
        console.log('[SW] Ressource récupérée depuis le réseau:', request.url);
        return fetch(request)
          .then(response => {
            // Vérifier si la réponse est valide
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Cloner la réponse car elle ne peut être consommée qu'une fois
            const responseToCache = response.clone();
            
            // Mettre en cache pour les futures requêtes
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.error('[SW] Erreur réseau:', error);
            
            // Retourner une page hors ligne si disponible
            if (request.destination === 'document') {
              return caches.match('./index.html');
            }
            
            throw error;
          });
      })
  );
});

// Gestion des messages du client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('[SW] Synchronisation en arrière-plan');
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    // Synchroniser les données locales si nécessaire
    console.log('[SW] Synchronisation des données...');
    
    // Envoyer un message au client pour déclencher la synchronisation
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_SYNC',
        message: 'Synchronisation en cours...'
      });
    });
    
  } catch (error) {
    console.error('[SW] Erreur lors de la synchronisation:', error);
  }
}

// Gestion des notifications push (optionnel)
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Nouvelle notification TimeTrack',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      {
        action: 'open',
        title: 'Ouvrir TimeTrack'
      },
      {
        action: 'dismiss',
        title: 'Ignorer'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'TimeTrack', options)
  );
});

// Gestion des clics sur les notifications
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then(clientList => {
          // Si l'app est déjà ouverte, la focuser
          for (const client of clientList) {
            if (client.url === self.registration.scope && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Sinon, ouvrir une nouvelle fenêtre
          if (clients.openWindow) {
            return clients.openWindow('./');
          }
        })
    );
  }
});

console.log('[SW] Service Worker TimeTrack chargé');
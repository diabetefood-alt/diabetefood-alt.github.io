importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-messaging-compat.js');

const CACHE_NAME = 'diabetefood-v82';
const ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/manifest.json',
  '/app/icon-192.png',
  '/app/icon-512.png',
  '/app/billing.js',
  '/app/premium-gate.js',
  '/app/premium.html',
  'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js'
];

// Scripts premium à injecter dans le HTML
const INJECT_SCRIPTS = '<script src="billing.js"><\/script><script src="premium-gate.js"><\/script>';

firebase.initializeApp({
  apiKey: "AIzaSyB3KmZ_XCrMn58gX9yjEjxVyr5LROK2Is4",
  authDomain: "diabetefood-9d420.firebaseapp.com",
  projectId: "diabetefood-9d420",
  storageBucket: "diabetefood-9d420.firebasestorage.app",
  messagingSenderId: "794784288123",
  appId: "1:794784288123:web:b5387732717c5158ef41de"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = payload.notification ? payload.notification.title : 'DiabeteFood';
  var body = payload.notification ? payload.notification.body : '';
  var options = {
    body: body,
    icon: '/app/icon-192.png',
    badge: '/app/icon-192.png',
    data: { url: 'https://diabetefood-alt.github.io/app/' }
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(
      event.notification.data && event.notification.data.url
        ? event.notification.data.url
        : 'https://diabetefood-alt.github.io/app/'
    )
  );
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
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

// Fonction pour injecter les scripts premium dans le HTML
async function injectScripts(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  try {
    const html = await response.text();
    // Injecter les scripts juste avant </body>
    const modified = html.replace('</body>', INJECT_SCRIPTS + '</body>');
    return new Response(modified, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (e) {
    return response;
  }
  }

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isHTML = event.request.mode === 'navigate' ||
    url.pathname === '/app/' ||
    url.pathname === '/app/index.html';

  if (isHTML) {
    // Pour les requêtes HTML : network-first avec injection de scripts
    event.respondWith(
      fetch(event.request)
        .then(async response => {
          if (response.ok) {
            const injected = await injectScripts(response.clone());
            // Mettre en cache la version originale
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
            return injected;
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) {
            return injectScripts(cached);
          }
          return cached;
        })
    );
  } else {
    // Pour les autres requêtes : network-first classique
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

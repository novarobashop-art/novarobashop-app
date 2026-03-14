// ===== NOVAROBASHOP SERVICE WORKER =====
// VERSION: 202603121700
// ⚠️ Promeni VERSION broj svaki put kad uploaduješ novu verziju!
const SW_VERSION = '202603141800';
const CACHE_NAME = 'nvrs-' + SW_VERSION;

// ── Firebase Push Notifications ──
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBjjDYmnGoAmdeczSa6nY-pOM7lJ-qjzjY",
  authDomain: "novarobashop-e2a61.firebaseapp.com",
  projectId: "novarobashop-e2a61",
  storageBucket: "novarobashop-e2a61.appspot.com",
  messagingSenderId: "262847590425",
  appId: "1:262847590425:web:16e3f34e21a2661d0dfa88"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Novarobashop', {
    body: body || '',
    icon: icon || '/novarobashop-app/icon-192.png',
    badge: '/novarobashop-app/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data || {}
  });
});

// ── Install: odmah preuzmi kontrolu ──
self.addEventListener('install', function(e) {
  e.waitUntil(self.skipWaiting());
});

// ── Activate: NUCLEAR RESET - briše SVE cache i reloaduje sve klijente ──
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        console.log('[SW] Brišem cache:', key);
        return caches.delete(key);
      }));
    }).then(function() {
      console.log('[SW] Nova verzija aktivna:', SW_VERSION);
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll({ type: 'window' });
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
        // Force reload svakog klijenta
        client.navigate(client.url);
      });
    })
  );
});

// ── Fetch: HTML uvek svež, ostalo iz cache-a ──
self.addEventListener('fetch', function(e) {
  const url = e.request.url;

  // HTML stranica - uvek sa mreže
  if (url.includes('.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(function() { return caches.match(e.request); })
    );
    return;
  }

  // Firebase i Google APIs - uvek sa mreže
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Ostalo (ikone, fontovi) - cache
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        return caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    })
  );
});

// ── Poruka od stranice ──
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

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

// ── AUTO UPDATE: Neue Version → Cache leeren → Seite neu laden ──
const CACHE_NAME = 'novarobashop-v1';

// Bei Installation: sofort aktivieren
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

// Bei Aktivierung: alten Cache löschen
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Alle Requests durchlassen (kein Caching) - immer frische Version
self.addEventListener('fetch', function(e) {
  // Nur HTML Seite abfangen - immer vom Netzwerk holen
  if (e.request.url.includes('novarobashop.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  // Alles andere normal durchlassen
  e.respondWith(fetch(e.request));
});

// Nachricht vom Tab empfangen: neue Version verfügbar
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

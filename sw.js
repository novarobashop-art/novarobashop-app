const SW_VERSION = '20260320b';
const CACHE_NAME = 'novarobashop-v' + SW_VERSION;
const APP_URL    = 'https://novarobashop-art.github.io/novarobashop-app/novarobashop.html';
const ICON       = '/novarobashop-app/icon-192.png';

// ── Firebase Messaging (für Background-Push) ──────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyBjjDYmnGoAmdeczSa6nY-pOM7lJ-qjzjY',
  authDomain:        'novarobashop-e2a61.firebaseapp.com',
  projectId:         'novarobashop-e2a61',
  storageBucket:     'novarobashop-e2a61.firebasestorage.app',
  messagingSenderId: '262847590425',
  appId:             '1:262847590425:web:16e3f34e21a2661d0dfa88'
});

const messaging = firebase.messaging();

// Firebase Background-Nachrichten (wenn App geschlossen oder im Hintergrund)
messaging.onBackgroundMessage(payload => {
  const notif = payload.notification || {};
  const data  = payload.data || {};
  const title = notif.title || 'Novarobashop';
  const body  = notif.body  || '';
  const tag   = data.tag    || 'novarobashop';

  const vibrate = tag === 'chat'     ? [100,50,100,50,100]
                : tag === 'live'     ? [300,100,300]
                : tag === 'racun'    ? [200,100,200]
                : tag === 'mahnung'  ? [200,100,200,100,200]
                : tag === 'blokiran' ? [500,200,500,200,500]
                :                     [200,100,200];

  return self.registration.showNotification(title, {
    body,
    icon:               ICON,
    badge:              ICON,
    tag,
    renotify:           true,
    vibrate,
    silent:             false,
    requireInteraction: ['racun','live','blokiran'].includes(tag),
    data: { url: data.url || APP_URL, tab: data.tab || 'home', tag }
  });
});

// ── Notification-Klick: richtigen Tab öffnen ──────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url  = data.url || APP_URL;
  const tab  = data.tab || 'home';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('novarobashop') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_TAB', tab });
          return;
        }
      }
      return clients.openWindow(url + '?tab=' + tab);
    })
  );
});

// ── SW Lifecycle ──────────────────────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(clients.claim()));

// ── SW Update + Tab-Routing Nachrichten ───────────────────────────────────
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    self.clients.matchAll().then(cs =>
      cs.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }))
    );
  }
});

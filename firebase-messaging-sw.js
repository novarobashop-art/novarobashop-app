importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBjjDYmnGoAmdeczSa6nY-pOM7lJ-qjzjY",
  authDomain: "novarobashop-e2a61.firebaseapp.com",
  projectId: "novarobashop-e2a61",
  storageBucket: "novarobashop-e2a61.firebasestorage.app",
  messagingSenderId: "262847590425",
  appId: "1:262847590425:web:16e3f34e21a2661d0dfa88"
});

const messaging = firebase.messaging();

const APP_URL = 'https://novarobashop-art.github.io/novarobashop-app/novarobashop.html';
const ICON    = '/novarobashop-app/icon-192.png';
const BADGE   = '/novarobashop-app/icon-192.png';

// Ikonă und Vibrationsmuster je nach Typ
function getNotifOptions(title, body, data = {}) {
  const tag = data.tag || 'novarobashop';

  // Vibrationsmuster: WhatsApp-ähnlich
  const vibrate = tag === 'chat'     ? [100, 50, 100, 50, 100]
                : tag === 'live'     ? [300, 100, 300]
                : tag === 'racun'    ? [200, 100, 200]
                : tag === 'placanje' ? [100, 50, 300]
                : tag === 'mahnung'  ? [200, 100, 200, 100, 200]
                : tag === 'blokiran' ? [500, 200, 500, 200, 500]
                :                     [200, 100, 200];

  return {
    body,
    icon: ICON,
    badge: BADGE,
    tag,
    renotify: true,
    vibrate,
    silent: false,
    requireInteraction: tag === 'racun' || tag === 'live' || tag === 'blokiran',
    data: { url: data.url || APP_URL, tab: data.tab || 'home' }
  };
}

messaging.onBackgroundMessage(payload => {
  const notif = payload.notification || {};
  const data  = payload.data || {};
  const title = notif.title || 'Novarobashop';
  const body  = notif.body  || '';

  self.registration.showNotification(title, getNotifOptions(title, body, data));
});

// Klick auf Notification → App öffnen auf richtigem Tab
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url  = data.url || APP_URL;
  const tab  = data.tab || 'home';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Falls App schon offen ist — fokussieren und richtigen Tab öffnen
      for (const client of windowClients) {
        if (client.url.includes('novarobashop') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_TAB', tab });
          return;
        }
      }
      // Sonst App öffnen
      return clients.openWindow(url + '?tab=' + tab);
    })
  );
});

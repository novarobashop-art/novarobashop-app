const SW_VERSION = '20260318';
const CACHE_NAME = 'novarobashop-v' + SW_VERSION;

// Firebase background push notifications
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  const notification = data.notification || {};
  const title = notification.title || 'Novarobashop';
  const body = notification.body || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/novarobashop-app/icon-192.png',
      badge: '/novarobashop-app/icon-192.png',
      data: data.data || {}
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://novarobashop-art.github.io/novarobashop-app/novarobashop.html')
  );
});

// SW Update Mechanismus
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }));
    });
  }
});

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

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

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Novarobashop', {
    body: body || '',
    icon: '/icon-192.png'
  });
});

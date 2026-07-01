/* ─────────────────────────────────────────────────────────────
   Firebase Messaging Service Worker
   This file MUST stay at /public/firebase-messaging-sw.js
   so it is served from the root scope (/firebase-messaging-sw.js).

   Replace the firebaseConfig values below with your own project
   credentials (same as NEXT_PUBLIC_FIREBASE_* env vars).
   ───────────────────────────────────────────────────────────── */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ⚠️  Replace with your Firebase project config
// (copy from Firebase Console → Project Settings → Your apps → Config)
firebase.initializeApp({
  apiKey:            self.__FIREBASE_API_KEY__            || 'AIzaSyBziP_sG-YHbaiqbDS2vw4vHWImH89CA8s',
  authDomain:        self.__FIREBASE_AUTH_DOMAIN__        || 'maratonou-f5d93.firebaseapp.com',
  projectId:         self.__FIREBASE_PROJECT_ID__         || 'maratonou-f5d93',
  storageBucket:     self.__FIREBASE_STORAGE_BUCKET__     || 'maratonou-f5d93.firebasestorage.app',
  messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__|| '191621346277',
  appId:             self.__FIREBASE_APP_ID__             || '1:191621346277:web:06bd78707545e578e3b50c',
});

const messaging = firebase.messaging();

/* ── Background message handler ─────────────────────────────── */
messaging.onBackgroundMessage((payload) => {
  const title   = payload.notification?.title ?? 'SEC TIME';
  const body    = payload.notification?.body  ?? '';
  const iconUrl = '/icons/icon-192.png';

  self.registration.showNotification(title, {
    body,
    icon:   iconUrl,
    badge:  iconUrl,
    data:   payload.data ?? {},
    tag:    payload.collapseKey ?? title,
    vibrate: [200, 100, 200],
  });
});

/* ── Notification click → open/focus the app ────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

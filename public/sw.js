/* Maratonou — service worker for app shell, public assets and push. */

const CACHE_PREFIX = 'maratonou-';
const STATIC_CACHE = `${CACHE_PREFIX}static-v4`;
const IMAGE_CACHE = `${CACHE_PREFIX}images-v4`;
const OFFLINE_URL = '/offline';
const STATIC_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/logo.svg',
  '/logo_dark.png',
  '/logo_light.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/Area-SemiBold.woff',
  '/fonts/Area-Bold.woff',
  '/fonts/Area-extrabold.woff',
  '/fonts/Greed-SemiBold.woff',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(STATIC_ASSETS.map(async (asset) => {
      const response = await fetch(asset, { cache: 'reload' });
      if (response.ok) await cache.put(asset, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const active = new Set([STATIC_CACHE, IMAGE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !active.has(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isPrivateRequest(request, url) {
  return request.headers.has('authorization')
    || url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/__/auth/')
    || url.pathname.startsWith('/firebase-messaging-sw.js');
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function trimCache(cache, maximumEntries) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maximumEntries)).map((key) => cache.delete(key)));
}

async function staleWhileRevalidateImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response.clone());
      await trimCache(cache, 100);
    }
    return response;
  }).catch(() => null);
  return cached || await network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Dev bundles reuse stable-looking URLs while their contents change. A
  // cache-first worker there can keep obsolete JavaScript alive after edits.
  if (['localhost', '127.0.0.1', '::1'].includes(self.location.hostname)) {
    event.respondWith(fetch(request));
    return;
  }

  const url = new URL(request.url);
  if (isPrivateRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML is always network-first and is never stored: the rendered shell may
  // depend on the current session. Only the local offline screen is cached.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (
      await caches.match(OFFLINE_URL)
      || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    )));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const versionedStatic = sameOrigin && (
    url.pathname.startsWith('/_next/static/')
    || ['style', 'script', 'font', 'worker'].includes(request.destination)
  );
  if (versionedStatic) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const publicImage = request.destination === 'image'
    && (sameOrigin || url.hostname === 'image.tmdb.org' || url.hostname.endsWith('giphy.com'));
  if (publicImage) event.respondWith(staleWhileRevalidateImage(request));
});

function notificationData(payload) {
  const notification = payload?.notification || {};
  const data = payload?.data || {};
  return {
    title: notification.title || data.title || payload?.title || 'Maratonou',
    body: notification.body || data.body || payload?.body || '',
    icon: notification.icon || data.icon || '/icons/icon-192.png',
    url: payload?.fcmOptions?.link || data.url || payload?.url || '/home',
  };
}

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  const notice = notificationData(payload);
  event.waitUntil(self.registration.showNotification(notice.title, {
    body: notice.body,
    icon: notice.icon,
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: notice.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target = '/home';
  try {
    const candidate = new URL(event.notification.data?.url || '/home', self.location.origin);
    if (candidate.origin === self.location.origin) target = `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {}

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (current) {
      if ('navigate' in current) await current.navigate(target);
      return current.focus();
    }
    return self.clients.openWindow(target);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const notice = notificationData(event.data);
    event.waitUntil(self.registration.showNotification(notice.title, {
      body: notice.body,
      icon: notice.icon,
      badge: '/icons/icon-192.png',
      data: { url: notice.url },
    }));
  }
});

/* ─────────────────────────────────────────────────────────────
   FCM — Firebase Cloud Messaging push notifications.

   Flow:
   1. Request notification permission (browser)
   2. Get FCM registration token
   3. Save token to Firestore users/{uid}/fcm_tokens
   4. Server (Cloud Functions) reads tokens + sends messages via
      FCM Admin SDK (see functions/src/index.ts template)
   ───────────────────────────────────────────────────────────── */
import type { Firestore } from 'firebase/firestore';
import { getFirebaseMessaging, VAPID_KEY } from './firebase';
import { dbTokenStore } from './db';

const FCM_TOKEN_KEY = 'sec_fcm_token_v1';

/* ── Request permission + get token ─────────────────────────── */
export async function initFCM(db: Firestore, uid: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (typeof Notification === 'undefined') return null;

  /* 1. Ask for notification permission */
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') return null;

  /* 2. Register service worker (required for FCM on web) */
  let swReg: ServiceWorkerRegistration | undefined;
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/',
      });
    } catch {
      // fall back to existing sw
      swReg = await navigator.serviceWorker.ready;
    }
  }

  /* 3. Get FCM token */
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return null;

    /* 4. Avoid re-saving the same token */
    const cached = localStorage.getItem(FCM_TOKEN_KEY);
    if (token !== cached) {
      await dbTokenStore.save(db, uid, token);
      localStorage.setItem(FCM_TOKEN_KEY, token);
    }
    return token;
  } catch (e) {
    console.warn('[FCM] Failed to get token', e);
    return null;
  }
}

/* ── Remove token on logout ─────────────────────────────────── */
export async function removeFCMToken(db: Firestore, uid: string) {
  const token = localStorage.getItem(FCM_TOKEN_KEY);
  if (!token) return;
  await dbTokenStore.remove(db, uid, token);
  localStorage.removeItem(FCM_TOKEN_KEY);

  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return;
    const { deleteToken } = await import('firebase/messaging');
    await deleteToken(messaging);
  } catch {}
}

/* ── Handle foreground messages (show toast / badge) ────────── */
export async function listenForegroundMessages(
  callback: (title: string, body: string) => void
) {
  if (typeof window === 'undefined') return;
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return;
    const { onMessage } = await import('firebase/messaging');
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? 'SEC TIME';
      const body  = payload.notification?.body  ?? '';
      callback(title, body);
    });
  } catch {}
}

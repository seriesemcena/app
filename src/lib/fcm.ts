/* ─────────────────────────────────────────────────────────────
   FCM — Firebase Cloud Messaging push notifications.

   Web/PWA uses the Firebase JavaScript SDK + service worker.
   Capacitor uses the native Firebase Messaging SDK, which returns
   a real FCM token on both Android and iOS.
   ───────────────────────────────────────────────────────────── */
import { Capacitor } from '@capacitor/core';
import type { Firestore } from 'firebase/firestore';
import { getFirebaseFunctions, getFirebaseMessaging, VAPID_KEY } from './firebase';
import { dbTokenStore } from './db';

const FCM_TOKEN_KEY = 'sec_fcm_token_v1';

type NativeListener = { remove: () => Promise<void> };
let nativeTokenListener: NativeListener | null = null;

export type PushPermissionState = NotificationPermission;

export function isNativePushRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

function normalizeNativePermission(value: string): PushPermissionState {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  return 'default';
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (typeof window === 'undefined') return 'default';
  if (isNativePushRuntime()) {
    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      const result = await FirebaseMessaging.checkPermissions();
      return normalizeNativePermission(result.receive);
    } catch {
      return 'default';
    }
  }
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (typeof window === 'undefined') return 'default';
  if (isNativePushRuntime()) {
    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      const result = await FirebaseMessaging.requestPermissions();
      return normalizeNativePermission(result.receive);
    } catch {
      return 'denied';
    }
  }
  if (typeof Notification === 'undefined') return 'default';
  return Notification.requestPermission();
}

async function saveToken(db: Firestore, uid: string, token: string) {
  const cached = localStorage.getItem(FCM_TOKEN_KEY);
  // Reconfirm even a cached token in Firestore. The server document may have
  // been cleaned after an FCM error or never written during an offline launch.
  if (cached && cached !== token) await dbTokenStore.remove(db, uid, cached);
  await dbTokenStore.save(db, uid, token);
  localStorage.setItem(FCM_TOKEN_KEY, token);
}

async function initNativeFCM(db: Firestore, uid: string): Promise<string | null> {
  const permission = await getPushPermissionState();
  if (permission !== 'granted') return null;

  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const { token } = await FirebaseMessaging.getToken();
    if (!token) return null;
    await saveToken(db, uid, token);

    // FCM can rotate a device token. Persist replacements immediately so the
    // server never keeps sending to an obsolete installation token.
    await nativeTokenListener?.remove();
    nativeTokenListener = await FirebaseMessaging.addListener('tokenReceived', ({ token: nextToken }) => {
      if (nextToken) void saveToken(db, uid, nextToken);
    });
    return token;
  } catch (error) {
    console.warn('[FCM] Failed to get native token', error);
    return null;
  }
}

async function initWebFCM(db: Firestore, uid: string): Promise<string | null> {
  if (typeof Notification === 'undefined') return null;

  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  // Reuse the PWA worker. Registering another worker with scope `/` would
  // replace offline/navigation handling.
  let swReg: ServiceWorkerRegistration | undefined;
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
    } catch {
      swReg = await navigator.serviceWorker.ready;
    }
  }

  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return null;
    await saveToken(db, uid, token);
    return token;
  } catch (error) {
    console.warn('[FCM] Failed to get web token', error);
    return null;
  }
}

export async function initFCM(db: Firestore, uid: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return isNativePushRuntime() ? initNativeFCM(db, uid) : initWebFCM(db, uid);
}

export type PushTestResult = {
  accepted: boolean;
  devices: number;
  pushSuccess: number;
  pushFailure: number;
};

/** Sends a real authenticated FCM message to the current member's devices. */
export async function sendPushTest(locale: string): Promise<PushTestResult> {
  const { httpsCallable } = await import('firebase/functions');
  const callable = httpsCallable<{ locale: string }, PushTestResult>(
    getFirebaseFunctions(),
    'sendTestPush',
  );
  const result = await callable({ locale });
  return result.data;
}

function normalizePushUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/notifications?tab=app';
  return value === '/notifications' ? '/notifications?tab=app' : value;
}

export async function removeFCMToken(db: Firestore, uid: string) {
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem(FCM_TOKEN_KEY);
  if (token) await dbTokenStore.remove(db, uid, token);
  localStorage.removeItem(FCM_TOKEN_KEY);

  try {
    if (isNativePushRuntime()) {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      await nativeTokenListener?.remove();
      nativeTokenListener = null;
      await FirebaseMessaging.deleteToken();
      return;
    }
    const messaging = await getFirebaseMessaging();
    if (!messaging) return;
    const { deleteToken } = await import('firebase/messaging');
    await deleteToken(messaging);
  } catch {}
}

export async function listenForegroundMessages(
  callback: (
    title: string,
    body: string,
    url: string,
    eventKey?: string,
    notificationType?: string,
  ) => void,
): Promise<(() => void) | null> {
  if (typeof window === 'undefined') return null;

  if (isNativePushRuntime()) {
    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      const received = await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
        const data = notification.data as Record<string, unknown> | undefined;
        callback(
          notification.title ?? 'Maratonou',
          notification.body ?? '',
          normalizePushUrl(data?.url),
          typeof data?.eventKey === 'string' ? data.eventKey : undefined,
          typeof data?.type === 'string' ? data.type : undefined,
        );
      });
      const action = await FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
        const data = notification.data as Record<string, unknown> | undefined;
        window.location.assign(normalizePushUrl(data?.url));
      });
      return () => {
        void received.remove();
        void action.remove();
      };
    } catch {
      return null;
    }
  }

  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;
    const { onMessage } = await import('firebase/messaging');
    return onMessage(messaging, (payload) => {
      callback(
        payload.notification?.title ?? 'Maratonou',
        payload.notification?.body ?? '',
        normalizePushUrl(payload.data?.url),
        typeof payload.data?.eventKey === 'string' ? payload.data.eventKey : undefined,
        typeof payload.data?.type === 'string' ? payload.data.type : undefined,
      );
    });
  } catch {
    return null;
  }
}

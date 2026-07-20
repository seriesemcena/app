/* ─────────────────────────────────────────────────────────────
   Firebase initialisation — singleton pattern safe for Next.js
   hot-reload and Capacitor WebView.

   Required env vars (set in .env.local for web, or in the
   Capacitor app via Vercel env vars):
     NEXT_PUBLIC_FIREBASE_API_KEY
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
     NEXT_PUBLIC_FIREBASE_PROJECT_ID
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
     NEXT_PUBLIC_FIREBASE_APP_ID
     NEXT_PUBLIC_FIREBASE_VAPID_KEY   (for FCM web push)
   ───────────────────────────────────────────────────────────── */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { initializeAuth, browserLocalPersistence, getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True only when all required env vars are present */
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

/** Cloud Storage requires Blaze, so Spark projects keep uploads opt-in. */
export const firebaseStorageEnabled = Boolean(
  firebaseConfigured
  && firebaseConfig.storageBucket
  && process.env.NEXT_PUBLIC_FIREBASE_STORAGE_ENABLED === 'true'
);

let _app:  FirebaseApp | null = null;
let _db:   Firestore   | null = null;
let _auth: Auth        | null = null;
let _storage: FirebaseStorage | null = null;
let _appCheckStarted = false;

function ensureApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error('[Firebase] env vars missing — check .env.local');
  if (!_app) _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return _app;
}

/** Starts App Check in monitor-ready mode. Enforcement remains a backend
 * setting and must only be enabled after telemetry confirms token coverage. */
export async function initializeFirebaseAppCheck(): Promise<void> {
  if (_appCheckStarted || typeof window === 'undefined' || !firebaseConfigured) return;
  if (process.env.NEXT_PUBLIC_APPCHECK_ENABLED !== 'true') return;
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (!siteKey) return;
  _appCheckStarted = true;
  try {
    if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN) {
      Object.assign(globalThis, { FIREBASE_APPCHECK_DEBUG_TOKEN: process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN });
    }
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    initializeAppCheck(ensureApp(), {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    _appCheckStarted = false;
  }
}

export function getDB(): Firestore {
  if (!_db) {
    const app = ensureApp();
    if (typeof window !== 'undefined') {
      try {
        _db = initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
      } catch {
        // Hot reload or another Firebase module may have initialized the
        // instance first. Reuse it instead of creating duplicate caches.
        _db = getFirestore(app);
      }
    } else {
      _db = getFirestore(app);
    }
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!firebaseStorageEnabled) {
    throw new Error('O envio de imagens está temporariamente indisponível.');
  }
  if (!_storage) _storage = getStorage(ensureApp());
  return _storage;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    const app = ensureApp();
    if (typeof window !== 'undefined') {
      try {
        _auth = initializeAuth(app, { persistence: [browserLocalPersistence] });
      } catch {
        // Auth already initialized (hot-reload), get existing instance
        _auth = getAuth(app);
      }
    } else {
      _auth = getAuth(app);
    }
  }
  return _auth;
}

/** Authorization header with the signed-in user's ID token — {} when signed
    out or Firebase is not configured. Used by the paid API routes (/api/ai,
    /api/curadoria), which reject unauthenticated calls. */
export async function authHeader(): Promise<Record<string, string>> {
  if (!firebaseConfigured) return {};
  try {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

/** Lazy-load Firebase Messaging (not available in SSR or old browsers) */
export async function getFirebaseMessaging() {
  if (typeof window === 'undefined') return null;
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const ok = await isSupported();
    if (!ok) return null;
    return getMessaging(ensureApp());
  } catch { return null; }
}

export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';

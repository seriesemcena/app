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
import { getFirestore,  type Firestore  } from 'firebase/firestore';
import { getAuth,       type Auth        } from 'firebase/auth';

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

let _app:  FirebaseApp | null = null;
let _db:   Firestore   | null = null;
let _auth: Auth        | null = null;

function ensureApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error('[Firebase] env vars missing — check .env.local');
  if (!_app) _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return _app;
}

export function getDB(): Firestore {
  if (!_db) _db = getFirestore(ensureApp());
  return _db;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(ensureApp());
  return _auth;
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

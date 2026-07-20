'use client';
/* ─────────────────────────────────────────────────────────────
   AuthContext — wraps the app with Firebase Auth state.
   Falls back gracefully when Firebase env vars are missing
   (e.g. local dev without .env.local configured yet).
   ───────────────────────────────────────────────────────────── */
import {
  createContext, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { firebaseConfigured, getFirebaseAuth, getDB } from '@/lib/firebase';
import { migrateLocalToFirestore, syncFromFirestore, subscribeUserDoc } from '@/lib/db';
import { switchActiveUser, getActiveUser } from '@/lib/store';

interface AuthState {
  user:    User | null;
  loading: boolean;
  /** True when Firebase is not configured — app runs in local-only mode */
  offline: boolean;
  initializationError: Error | null;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  offline: false,
  initializationError: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }

    // Holds the Firestore real-time subscription for the current user
    let unsubDoc: (() => void) | null = null;
    let unsubMessages: (() => void) | null = null;
    let unsubAuth = () => {};
    let active = true;

    import('firebase/auth').then(({ onAuthStateChanged }) => {
      if (!active) return;
      unsubAuth = onAuthStateChanged(getFirebaseAuth(), async (u) => {
        // Clean up previous user's real-time subscription
        unsubDoc?.();
        unsubDoc = null;
        unsubMessages?.();
        unsubMessages = null;

        // Wipe the previous account's cached content BEFORE anything reads
        // or uploads it. Without this the new user inherits the old user's
        // lists — and migrateLocalToFirestore would write them into the
        // new account's Firestore document.
        let cacheOwner: string | null = null;
        try {
          cacheOwner = getActiveUser();
          switchActiveUser(u?.uid ?? null);
        } catch {}

        setUser(u);

        // Firebase local persistence restores the cached account first and
        // refreshes expired ID tokens when the network is available. Do not
        // expose signed-out UI until that restoration callback has completed.
        if (u) {
          try { await u.getIdToken(false); }
          catch (error) {
            if (navigator.onLine) console.warn('[Auth] Token refresh deferred', error);
          }
        }
        if (active) setLoading(false);

        if (u) {
          const db = getDB();

          // 1. Migrate localStorage → Firestore (one-time, first login).
          //    Only when the cache provably belongs to this account: an
          //    unknown owner may be leftovers from a different user, and
          //    uploading those would corrupt this account's data.
          if (cacheOwner === u.uid) {
            try { await migrateLocalToFirestore(db, u.uid); } catch {}
          }

          // 2. Initial pull: Firestore → localStorage (catches up any offline changes)
          try { await syncFromFirestore(db, u.uid, u.email, u.displayName); } catch {}

          // 2b. Register this already-authorized browser for real background
          // push. Permission is never requested automatically here; the user
          // remains in control through the notification settings/browser UI.
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const { initFCM, listenForegroundMessages } = await import('@/lib/fcm');
              await initFCM(db, u.uid);
              unsubMessages = await listenForegroundMessages(async (title, body) => {
                try {
                  if ('serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.ready;
                    await registration.showNotification(title, {
                      body,
                      icon: '/icons/icon-192.png',
                      badge: '/icons/icon-192.png',
                      tag: `maratonou:fcm:${title}`,
                    } as NotificationOptions);
                  } else {
                    new Notification(title, { body });
                  }
                } catch {}
              });
            } catch (error) {
              console.warn('[FCM] Push registration deferred', error);
            }
          }

          // 3. Real-time subscription: whenever Firestore changes (other device or
          //    server-side update), localStorage is refreshed automatically and
          //    components listening to 'maratonou:sync' re-render.
          try { unsubDoc = subscribeUserDoc(db, u.uid); } catch {}
        }
      }, (error) => {
        console.error('[Auth] Failed to restore Firebase session', error);
        if (active) {
          setInitializationError(error instanceof Error ? error : new Error('Firebase session initialization failed'));
          setLoading(false);
        }
      });
    }).catch((error) => {
      console.error('[Auth] Failed to initialize Firebase Auth', error);
      if (active) {
        setInitializationError(error instanceof Error ? error : new Error('Firebase Auth initialization failed'));
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubAuth();
      unsubDoc?.();
      unsubMessages?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, offline: !firebaseConfigured, initializationError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

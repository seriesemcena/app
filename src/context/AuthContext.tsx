'use client';
/* ─────────────────────────────────────────────────────────────
   AuthContext — wraps the app with Firebase Auth state.
   Falls back gracefully when Firebase env vars are missing
   (e.g. local dev without .env.local configured yet).
   ───────────────────────────────────────────────────────────── */
import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { firebaseConfigured, getFirebaseAuth, getDB } from '@/lib/firebase';
import {
  dbPresenceStore,
  dbSeasonProgressStore,
  migrateLocalRatingsToFirestore,
  migrateLocalToFirestore,
  syncFromFirestore,
  subscribeUserDoc,
} from '@/lib/db';
import {
  switchActiveUser,
  getActiveUser,
  notifInboxStore,
  seasonProgressStore,
  type InboxNotif,
} from '@/lib/store';

interface AuthState {
  user:    User | null;
  loading: boolean;
  /** True when Firebase is not configured — app runs in local-only mode */
  offline: boolean;
  initializationError: Error | null;
  /** Whether the current account's e-mail is confirmed. Social logins
      (Google/Apple) are always verified by the provider; only e-mail/senha
      signups start unverified until they click the confirmation link. */
  emailVerified: boolean;
  /** Re-fetch the Firebase user and return the fresh verified flag. Used after
      the user confirms the e-mail so the gate/banner update without a reload. */
  refreshUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  offline: false,
  initializationError: null,
  emailVerified: false,
  refreshUser: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  /** Reload the Firebase user (picks up an e-mail confirmation done elsewhere)
      and publish the fresh verified flag. Returns the new value so callers can
      react immediately without waiting for the state update to flush. */
  const refreshUser = useCallback(async (): Promise<boolean> => {
    if (!firebaseConfigured) return false;
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (!current) return false;
    try { await current.reload(); } catch { /* keep the session; retry later */ }
    // Publish ONLY the verified flag. Never setUser() here: reload() leaves the
    // user object identity unchanged, and onAuthStateChanged owns the lifecycle.
    // Setting it to a transiently-null currentUser (an iOS token hiccup) would
    // log the UI out and empty request.auth-gated reads (ratings, feed).
    const fresh = auth.currentUser;
    if (!fresh) return false;
    setEmailVerified(!!fresh.emailVerified);
    return !!fresh.emailVerified;
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }

    // Holds the Firestore real-time subscription for the current user
    let unsubDoc: (() => void) | null = null;
    let unsubMessages: (() => void) | null = null;
    let unsubSeasonProgress: (() => void) | null = null;
    let removePresenceListener: (() => void) | null = null;
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
        unsubSeasonProgress?.();
        unsubSeasonProgress = null;
        removePresenceListener?.();
        removePresenceListener = null;

        // Wipe the previous account's cached content BEFORE anything reads
        // or uploads it. Without this the new user inherits the old user's
        // lists — and migrateLocalToFirestore would write them into the
        // new account's Firestore document.
        let cacheOwner: string | null = null;
        try {
          cacheOwner = getActiveUser();
          switchActiveUser(u?.uid ?? null);
        } catch {}

        // A returning native/PWA session already has an account-scoped local
        // cache. Let React render that cache as soon as Firebase confirms the
        // same uid, while token refresh and Firestore reconciliation continue
        // below. Blocking the whole app on those network requests kept iOS on
        // "Restaurando sua sessão" for several seconds on a cold launch.
        //
        // New logins and account switches still wait for the authoritative
        // pull, because their local cache is absent or has just been cleared.
        const canRenderCachedSession = !!u && cacheOwner === u.uid;
        setUser(u);
        setEmailVerified(!!u?.emailVerified);
        if (active) setLoading(!canRenderCachedSession);

        // Firebase local persistence restores the cached account first and
        // refreshes expired ID tokens when the network is available. Do not
        // expose signed-out UI until that restoration callback has completed.
        if (u) {
          try { await u.getIdToken(false); }
          catch (error) {
            if (navigator.onLine) console.warn('[Auth] Token refresh deferred', error);
          }
        }
        if (u) {
          const db = getDB();

          const touchPresence = () => {
            if (document.visibilityState === 'visible') dbPresenceStore.touch(db, u.uid).catch(() => {});
          };
          touchPresence();
          document.addEventListener('visibilitychange', touchPresence);
          window.addEventListener('focus', touchPresence);
          removePresenceListener = () => {
            document.removeEventListener('visibilitychange', touchPresence);
            window.removeEventListener('focus', touchPresence);
          };

          // 1. Migrate localStorage → Firestore (one-time, first login).
          //    Only when the cache provably belongs to this account: an
          //    unknown owner may be leftovers from a different user, and
          //    uploading those would corrupt this account's data.
          if (cacheOwner === null || cacheOwner === u.uid) {
            try { await migrateLocalToFirestore(db, u.uid); } catch {}
            // ratingsV1 is deliberately independent from the legacy migration
            // marker: older accounts may have completed seasonProgressV1
            // before their cached ratings were uploaded.
            try {
              await migrateLocalRatingsToFirestore(db, u.uid, u.displayName, u.email);
            } catch (error) {
              console.warn('[Auth] ratingsV1 migration deferred', error);
            }
          }

          // 2. Initial pull: Firestore → localStorage (catches up any offline changes)
          try { await syncFromFirestore(db, u.uid, u.email, u.displayName); } catch {}

          // Season progress has its own deterministic documents so devices do
          // not race while replacing one large ep_watched map.
          try {
            unsubSeasonProgress = dbSeasonProgressStore.subscribe(db, u.uid, (records) => {
              seasonProgressStore.setAll(records);
              window.dispatchEvent(new Event('maratonou:sync'));
            });
          } catch {}

          // Fresh logins/account switches become ready only after the
          // authoritative Firestore data has hydrated the local cache.
          // Returning sessions may already be visible from their safe,
          // uid-scoped cache; this also closes the loading state idempotently.
          if (active) setLoading(false);

          // 2b. Register an already-authorized browser or native installation
          // for push. Permission is never requested automatically here; the
          // user remains in control through notification settings.
          try {
            const {
              getPushPermissionState,
              initFCM,
              isNativePushRuntime,
              listenForegroundMessages,
            } = await import('@/lib/fcm');
            if (await getPushPermissionState() === 'granted') {
              await initFCM(db, u.uid);
              unsubMessages = await listenForegroundMessages(
                async (title, body, url, eventKey, notificationType) => {
                try {
                  const allowedTypes: InboxNotif['type'][] = [
                    'new_episode',
                    'season_premiere',
                    'like',
                    'reply',
                    'follow',
                    'release',
                    'pro_reminder',
                    'general',
                  ];
                  const type = allowedTypes.includes(notificationType as InboxNotif['type'])
                    ? notificationType as InboxNotif['type']
                    : 'general';

                  // Cloud Functions are the canonical inbox writer. This
                  // immediate local mirror keeps foreground delivery visible
                  // even before the Firestore refresh finishes.
                  // Social pushes (likes, follows, replies) already live in the
                  // Firestore-backed "account" inbox; mirroring them into the
                  // local store would duplicate them into the "app" tab, so skip
                  // — the banner and the account-tab refresh still surface them.
                  if (eventKey && !eventKey.startsWith('push-test:') && !eventKey.startsWith('social:')) {
                    notifInboxStore.add({
                      id: eventKey,
                      type,
                      title,
                      body,
                      time: new Date().toISOString(),
                      read: false,
                      link: url,
                    }, u.uid);
                  }

                  // The notification inbox and the global foreground banner
                  // both refresh from this single application event.
                  window.dispatchEvent(new CustomEvent('maratonou:push', {
                    detail: { title, body, url, eventKey, type },
                  }));
                  // Android does not display an operating-system notification
                  // while the app is open. Present it inside the app; iOS uses
                  // the same UI to avoid a platform-dependent experience.
                  if (isNativePushRuntime()) {
                    return;
                  }
                  if ('serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.ready;
                    await registration.showNotification(title, {
                      body,
                      icon: '/icons/icon-192.png',
                      badge: '/icons/icon-192.png',
                      tag: `maratonou:fcm:${title}`,
                      data: { url, eventKey, type },
                    } as NotificationOptions);
                  } else {
                    new Notification(title, { body });
                  }
                } catch {}
              });
            }
          } catch (error) {
            console.warn('[FCM] Push registration deferred', error);
          }

          // 3. Real-time subscription: whenever Firestore changes (other device or
          //    server-side update), localStorage is refreshed automatically and
          //    components listening to 'maratonou:sync' re-render.
          try { unsubDoc = subscribeUserDoc(db, u.uid); } catch {}
        } else if (active) {
          setLoading(false);
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
      unsubSeasonProgress?.();
      removePresenceListener?.();
    };
  }, []);

  // NOTE: deliberately NO auto-refresh on foreground. Forcing user.reload() on
  // every iOS app-foreground can fail/expire the token inside the WKWebView and
  // drop the session, which then makes request.auth-gated Firestore reads
  // (ratings, feed) come back empty. The verified flag is refreshed on cold
  // start (onAuthStateChanged) and on the explicit "Já confirmei" action in the
  // gate — enough to clear the banner without destabilizing the session.

  return (
    <AuthContext.Provider value={{ user, loading, offline: !firebaseConfigured, initializationError, emailVerified, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

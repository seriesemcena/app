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

interface AuthState {
  user:    User | null;
  loading: boolean;
  /** True when Firebase is not configured — app runs in local-only mode */
  offline: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, offline: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }

    // Holds the Firestore real-time subscription for the current user
    let unsubDoc: (() => void) | null = null;
    let unsubAuth = () => {};

    import('firebase/auth').then(({ onAuthStateChanged }) => {
      unsubAuth = onAuthStateChanged(getFirebaseAuth(), async (u) => {
        // Clean up previous user's real-time subscription
        unsubDoc?.();
        unsubDoc = null;

        setUser(u);
        setLoading(false);

        if (u) {
          const db = getDB();

          // 1. Migrate localStorage → Firestore (one-time, first login)
          try { await migrateLocalToFirestore(db, u.uid); } catch {}

          // 2. Initial pull: Firestore → localStorage (catches up any offline changes)
          try { await syncFromFirestore(db, u.uid); } catch {}

          // 3. Real-time subscription: whenever Firestore changes (other device or
          //    server-side update), localStorage is refreshed automatically and
          //    components listening to 'maratonou:sync' re-render.
          try { unsubDoc = subscribeUserDoc(db, u.uid); } catch {}
        }
      });
    });

    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, offline: !firebaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

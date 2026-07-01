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
import { migrateLocalToFirestore, syncFromFirestore } from '@/lib/db';

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
    // Dynamic import to avoid SSR issues
    let unsubscribe = () => {};
    import('firebase/auth').then(({ onAuthStateChanged }) => {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (u) => {
        setUser(u);
        setLoading(false);
        if (u) {
          // Migrate localStorage → Firestore on first login
          try { await migrateLocalToFirestore(getDB(), u.uid); } catch {}
          // Pull cloud data → localStorage so all pages that read localStorage work correctly
          try { await syncFromFirestore(getDB(), u.uid); } catch {}
        }
      });
    });
    return () => unsubscribe();
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

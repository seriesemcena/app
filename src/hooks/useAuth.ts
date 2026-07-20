'use client';
/* ─────────────────────────────────────────────────────────────
   useAuth — convenient hook for auth actions + current user.
   All methods degrade gracefully when Firebase isn't configured.
   ───────────────────────────────────────────────────────────── */
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { firebaseConfigured, getFirebaseAuth } from '@/lib/firebase';
import { notifInboxStore, clearUserScopedCache, switchActiveUser } from '@/lib/store';
import { detectAppEnvironment } from '@/lib/appEnvironment';
import { useAppSettings } from '@/context/AppSettingsContext';

export function useAuth() {
  const { user, loading, offline } = useAuthContext();
  const router = useRouter();
  const { settings } = useAppSettings();

  /** After login, send new users to onboarding and returning users to home */
  const postLoginRoute = () => {
    const done = typeof window !== 'undefined' && localStorage.getItem('onboarding_done');
    router.replace(done ? '/home' : '/onboarding');
  };

  /**
   * Give a freshly created social account the same identity shape as an
   * email signup: a Name plus a username slugged from it. Existing
   * profiles are left untouched.
   */
  const ensureProfile = async (u: { uid: string; displayName?: string | null; email?: string | null }) => {
    try {
      const { getDB } = await import('@/lib/firebase');
      const { dbProfileStore, resolveUniqueUsername } = await import('@/lib/db');
      const { usernameFromNameOrEmail } = await import('@/lib/username');
      const db = getDB();
      const existing = await dbProfileStore.get(db, u.uid);
      if (existing.username) return; // already set up
      const name = existing.name || u.displayName || (u.email?.split('@')[0] ?? '');
      const base = usernameFromNameOrEmail(name, u.email);
      const username = await resolveUniqueUsername(db, base, u.uid);
      await dbProfileStore.set(db, u.uid, { name, username, usernameMigrated: true });
    } catch {}
  };

  const signInWithGoogle = async () => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { signInWithPopup, signInWithRedirect, GoogleAuthProvider } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    const environment = detectAppEnvironment();
    if (environment.isStandalone && !environment.isCapacitor) {
      await signInWithRedirect(getFirebaseAuth(), provider);
      return;
    }
    const { user: u } = await signInWithPopup(getFirebaseAuth(), provider);
    await ensureProfile(u);
    postLoginRoute();
  };

  const signInWithApple = async () => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { signInWithPopup, signInWithRedirect, OAuthProvider } = await import('firebase/auth');
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const environment = detectAppEnvironment();
    if (environment.isStandalone && !environment.isCapacitor) {
      await signInWithRedirect(getFirebaseAuth(), provider);
      return;
    }
    const { user: u } = await signInWithPopup(getFirebaseAuth(), provider);
    await ensureProfile(u);
    postLoginRoute();
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    postLoginRoute();
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    if (!settings.registrationsEnabled) throw Object.assign(new Error('Novos cadastros estão temporariamente desativados.'), { code: 'auth/registrations-disabled' });
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const { user: newUser } = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await updateProfile(newUser, { displayName: name });
    // Create the Firestore profile immediately so the account is discoverable.
    // The username is the slug of the Name: "João Miguel" → joao-miguel
    try {
      const { getDB } = await import('@/lib/firebase');
      const { dbProfileStore, resolveUniqueUsername } = await import('@/lib/db');
      const { usernameFromNameOrEmail } = await import('@/lib/username');
      const db = getDB();
      const base = usernameFromNameOrEmail(name, email);
      const username = await resolveUniqueUsername(db, base, newUser.uid);
      await dbProfileStore.set(db, newUser.uid, { name, username, usernameMigrated: true });
    } catch {}
    postLoginRoute();
  };

  const resetPassword = async (email: string) => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(getFirebaseAuth(), email);
  };

  const signOut = async () => {
    if (!firebaseConfigured) return;
    const { signOut: fbSignOut } = await import('firebase/auth');
    const currentUser = getFirebaseAuth().currentUser;
    if (currentUser) {
      try {
        const { getDB } = await import('@/lib/firebase');
        const { removeFCMToken } = await import('@/lib/fcm');
        await removeFCMToken(getDB(), currentUser.uid);
      } catch {}
    }
    // Clear legacy unscoped keys so the next user starts with a clean slate
    try { localStorage.removeItem('sec_profile_v1'); } catch {}
    // Drop this account's cached content (lists, reviews, prefs, following…)
    // so the next person to sign in on this device inherits nothing.
    clearUserScopedCache();
    switchActiveUser(null);
    // Remove the old global notification key that caused cross-account bleed
    notifInboxStore.clearLegacy();
    await fbSignOut(getFirebaseAuth());
    router.replace('/auth');
  };

  return { user, loading, offline, signInWithGoogle, signInWithApple, signInWithEmail, registerWithEmail, resetPassword, signOut };
}

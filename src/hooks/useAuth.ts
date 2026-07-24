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
import type { AuthCredential } from 'firebase/auth';

async function getNativeSocialCredential(provider: 'google.com' | 'apple.com'): Promise<AuthCredential> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = provider === 'google.com'
    ? await FirebaseAuthentication.signInWithGoogle({
        // The Google ID token already contains the identity data required by
        // Firebase Auth. Requesting email/profile here triggers a second
        // Android AuthorizationClient flow after the account picker, which
        // can fail even though the Google credential was obtained correctly.
        useCredentialManager: true,
      })
    : await FirebaseAuthentication.signInWithApple({
        skipNativeAuth: true,
        scopes: ['email', 'name'],
      });

  const nativeCredential = result.credential;
  if (!nativeCredential?.idToken) {
    throw Object.assign(new Error('O provedor não devolveu uma credencial válida.'), {
      code: 'auth/missing-native-credential',
    });
  }

  const { GoogleAuthProvider, OAuthProvider } = await import('firebase/auth');
  if (provider === 'google.com') {
    return GoogleAuthProvider.credential(
      nativeCredential.idToken,
      nativeCredential.accessToken,
    );
  }

  return new OAuthProvider('apple.com').credential({
    idToken: nativeCredential.idToken,
    accessToken: nativeCredential.accessToken,
    rawNonce: nativeCredential.nonce,
  });
}

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
    const { signInWithCredential, signInWithPopup, signInWithRedirect, GoogleAuthProvider } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    const environment = detectAppEnvironment();
    if (environment.isCapacitor) {
      const credential = await getNativeSocialCredential('google.com');
      const { user: u } = await signInWithCredential(getFirebaseAuth(), credential);
      await ensureProfile(u);
      postLoginRoute();
      return;
    }
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
    const { signInWithCredential, signInWithPopup, signInWithRedirect, OAuthProvider } = await import('firebase/auth');
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const environment = detectAppEnvironment();
    if (environment.isCapacitor) {
      const credential = await getNativeSocialCredential('apple.com');
      const { user: u } = await signInWithCredential(getFirebaseAuth(), credential);
      await ensureProfile(u);
      postLoginRoute();
      return;
    }
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

  const deleteAccount = async (password?: string) => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('auth/requires-recent-login');

    const {
      EmailAuthProvider,
      GoogleAuthProvider,
      OAuthProvider,
      reauthenticateWithCredential,
      reauthenticateWithPopup,
      signOut: fbSignOut,
    } = await import('firebase/auth');
    const providerIds = currentUser.providerData.map((provider) => provider.providerId);

    if (providerIds.includes('password')) {
      if (!currentUser.email || !password) throw new Error('auth/missing-password');
      await reauthenticateWithCredential(
        currentUser,
        EmailAuthProvider.credential(currentUser.email, password),
      );
    } else if (providerIds.includes('google.com')) {
      if (detectAppEnvironment().isCapacitor) {
        await reauthenticateWithCredential(currentUser, await getNativeSocialCredential('google.com'));
      } else {
        await reauthenticateWithPopup(currentUser, new GoogleAuthProvider());
      }
    } else if (providerIds.includes('apple.com')) {
      if (detectAppEnvironment().isCapacitor) {
        await reauthenticateWithCredential(currentUser, await getNativeSocialCredential('apple.com'));
      } else {
        const provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
        await reauthenticateWithPopup(currentUser, provider);
      }
    } else {
      throw new Error('auth/unsupported-provider');
    }

    // Reauthentication updates auth_time. Force a fresh token so the callable
    // receives that new timestamp instead of a cached pre-reauthentication ID token.
    await currentUser.getIdToken(true);

    const { httpsCallable } = await import('firebase/functions');
    const { getFirebaseFunctions } = await import('@/lib/firebase');
    const removeAccount = httpsCallable<{ confirmation: string }, { deleted: boolean }>(
      getFirebaseFunctions(),
      'deleteMyAccount',
    );
    const result = await removeAccount({ confirmation: 'EXCLUIR' });
    if (result.data?.deleted !== true) throw new Error('account/deletion-incomplete');

    clearUserScopedCache();
    switchActiveUser(null);
    notifInboxStore.clearLegacy();
    try { localStorage.clear(); } catch {}
    try { await fbSignOut(auth); } catch {}
    if (detectAppEnvironment().isCapacitor) {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut();
      } catch {}
    }
    router.replace('/auth');
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
    if (detectAppEnvironment().isCapacitor) {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut();
      } catch {}
    }
    router.replace('/auth');
  };

  return { user, loading, offline, signInWithGoogle, signInWithApple, signInWithEmail, registerWithEmail, resetPassword, deleteAccount, signOut };
}

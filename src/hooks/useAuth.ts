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
import type { AuthCredential, AuthProvider } from 'firebase/auth';

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

/** After Firebase's hosted action page verifies an e-mail or resets a password,
    return the user to the app. The host must be an authorized domain — and
    window.location.origin always is (maratonou.com in browser/PWA/native, which
    loads the remote site; localhost in dev). Firebase's default handler stays in
    charge of the code itself (the custom action URL is locked on this project). */
function appReturnActionSettings(): { url: string; handleCodeInApp: boolean } | undefined {
  if (typeof window === 'undefined') return undefined;
  return { url: window.location.origin, handleCodeInApp: false };
}

export function useAuth() {
  const { user, loading, offline } = useAuthContext();
  const router = useRouter();
  const { settings } = useAppSettings();

  /** After login, go straight to home. The streaming/genre/notification
      onboarding was removed — accounts start with default preferences. */
  const postLoginRoute = () => {
    router.replace('/home');
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

  /* Web sign-in. signInWithPopup breaks in browsers that block third-party
     storage: the popup runs on the *.firebaseapp.com auth domain — a different
     site than maratonou.com — and the blocked cross-site storage surfaces as
     auth/internal-error. Standalone PWAs can't manage popups at all. In both
     cases fall back to signInWithRedirect, a first-party full-page flow that
     works everywhere. On the redirect return, the username is created by
     syncFromFirestore (auth-state change) and routing by the /auth page's
     logged-in effect, so no popup-path follow-up is needed here. */
  const webSocialSignIn = async (provider: AuthProvider) => {
    const { signInWithPopup, signInWithRedirect } = await import('firebase/auth');
    const auth = getFirebaseAuth();
    if (detectAppEnvironment().isStandalone) {
      await signInWithRedirect(auth, provider);
      return;
    }
    try {
      const { user: u } = await signInWithPopup(auth, provider);
      await ensureProfile(u);
      postLoginRoute();
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      const popupUnsupported =
        code === 'auth/internal-error' ||
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/web-storage-unsupported';
      if (!popupUnsupported) throw e; // popup-closed-by-user etc. → surface it
      await signInWithRedirect(auth, provider);
    }
  };

  const signInWithGoogle = async () => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { GoogleAuthProvider } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    if (detectAppEnvironment().isCapacitor) {
      const { signInWithCredential } = await import('firebase/auth');
      const credential = await getNativeSocialCredential('google.com');
      const { user: u } = await signInWithCredential(getFirebaseAuth(), credential);
      await ensureProfile(u);
      postLoginRoute();
      return;
    }
    await webSocialSignIn(provider);
  };

  const signInWithApple = async () => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { OAuthProvider } = await import('firebase/auth');
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    if (detectAppEnvironment().isCapacitor) {
      const { signInWithCredential } = await import('firebase/auth');
      const credential = await getNativeSocialCredential('apple.com');
      const { user: u } = await signInWithCredential(getFirebaseAuth(), credential);
      await ensureProfile(u);
      postLoginRoute();
      return;
    }
    await webSocialSignIn(provider);
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
    const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = await import('firebase/auth');
    const { user: newUser } = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await updateProfile(newUser, { displayName: name });
    // Fire off the confirmation e-mail. Never block signup on it — a transient
    // send failure shouldn't strand the user; they can resend from the banner.
    try { await sendEmailVerification(newUser, appReturnActionSettings()); } catch {}
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

  /** Re-send the e-mail confirmation link to the signed-in unverified account. */
  const resendVerification = async () => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const current = getFirebaseAuth().currentUser;
    if (!current) throw new Error('auth/no-current-user');
    const { sendEmailVerification } = await import('firebase/auth');
    await sendEmailVerification(current, appReturnActionSettings());
  };

  const resetPassword = async (email: string) => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(getFirebaseAuth(), email, appReturnActionSettings());
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

  return { user, loading, offline, signInWithGoogle, signInWithApple, signInWithEmail, registerWithEmail, resetPassword, resendVerification, deleteAccount, signOut };
}

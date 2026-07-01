'use client';
/* ─────────────────────────────────────────────────────────────
   useAuth — convenient hook for auth actions + current user.
   All methods degrade gracefully when Firebase isn't configured.
   ───────────────────────────────────────────────────────────── */
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { firebaseConfigured, getFirebaseAuth } from '@/lib/firebase';

export function useAuth() {
  const { user, loading, offline } = useAuthContext();
  const router = useRouter();

  const signInWithGoogle = async () => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    await signInWithPopup(getFirebaseAuth(), provider);
    router.push('/home');
  };

  const signInWithApple = async () => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { signInWithPopup, OAuthProvider } = await import('firebase/auth');
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    await signInWithPopup(getFirebaseAuth(), provider);
    router.push('/home');
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    router.push('/home');
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const { user: newUser } = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await updateProfile(newUser, { displayName: name });
    router.push('/home');
  };

  const resetPassword = async (email: string) => {
    if (!firebaseConfigured) throw new Error('Firebase not configured');
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(getFirebaseAuth(), email);
  };

  const signOut = async () => {
    if (!firebaseConfigured) return;
    const { signOut: fbSignOut } = await import('firebase/auth');
    await fbSignOut(getFirebaseAuth());
    router.push('/auth');
  };

  return { user, loading, offline, signInWithGoogle, signInWithApple, signInWithEmail, registerWithEmail, resetPassword, signOut };
}

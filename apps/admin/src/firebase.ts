import { initializeApp } from 'firebase/app';
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
let appCheck: AppCheck | null = null;

if (auth) {
  void setPersistence(auth, browserSessionPersistence);
  const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL;
  if (import.meta.env.DEV && emulator) connectAuthEmulator(auth, emulator, { disableWarnings: false });
}

if (app && import.meta.env.VITE_APPCHECK_ENABLED === 'true' && import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    Object.assign(globalThis, { FIREBASE_APPCHECK_DEBUG_TOKEN: import.meta.env.VITE_APPCHECK_DEBUG_TOKEN });
  }
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const loginGoogle = async () => {
  if (!auth) throw new Error('Firebase não configurado.');
  await signInWithPopup(auth, new GoogleAuthProvider());
};

export const loginEmail = async (email: string, password: string) => {
  if (!auth) throw new Error('Firebase não configurado.');
  await signInWithEmailAndPassword(auth, email, password);
};

export const sendUserPasswordReset = async (email: string) => {
  if (!auth) throw new Error('Firebase não configurado.');
  await sendPasswordResetEmail(auth, email);
};

export const logout = async () => { if (auth) await signOut(auth); };
export const authToken = async () => auth?.currentUser?.getIdToken() || null;
export const appCheckToken = async () => {
  return appCheck ? (await getToken(appCheck, false)).token : null;
};

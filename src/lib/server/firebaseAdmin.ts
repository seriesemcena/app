import 'server-only';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function credential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return cert({
      projectId: parsed.project_id || parsed.projectId,
      clientEmail: parsed.client_email || parsed.clientEmail,
      privateKey: (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
    });
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return projectId && clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey }) : applicationDefault();
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: credential(), projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}

export const getAdminAuth = () => getAuth(adminApp());
export const getAdminDB = () => getFirestore(adminApp());
export const hasAdminCredentials = () => Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  || (process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY)
  || process.env.GOOGLE_APPLICATION_CREDENTIALS,
);

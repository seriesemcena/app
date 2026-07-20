#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function argument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

const email = argument('email').toLowerCase();
const uid = argument('uid');
if ((!email && !uid) || (email && uid)) {
  console.error('Uso: npm run admin:bootstrap -- --email usuario@dominio.com');
  console.error('  ou: npm run admin:bootstrap -- --uid FIREBASE_UID');
  process.exitCode = 1;
} else {
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!getApps().length) initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
  const auth = getAuth();
  const db = getFirestore();
  const user = email ? await auth.getUserByEmail(email) : await auth.getUser(uid);
  const activeSuperAdmins = await db.collection('adminUsers').where('role', '==', 'super_admin').where('status', '==', 'active').limit(1).get();
  if (!activeSuperAdmins.empty) {
    console.error('O bootstrap inicial já foi concluído. Use a API/painel para gerenciar outros administradores.');
    process.exitCode = 1;
  } else {
    console.log(`Projeto: ${projectId || '(Application Default Credentials)'}`);
    console.log(`Usuário: ${user.email || user.uid} (${user.uid})`);
    console.log('Ação: conceder a função super_admin inicial e revogar sessões antigas.');
    const terminal = createInterface({ input, output });
    const answer = await terminal.question('Digite CONCEDER SUPER_ADMIN para confirmar: ');
    terminal.close();
    if (answer !== 'CONCEDER SUPER_ADMIN') {
      console.error('Operação cancelada. Nenhuma alteração foi feita.');
      process.exitCode = 1;
    } else {
      const existing = await db.doc(`adminUsers/${user.uid}`).get();
      const authVersion = Number(existing.data()?.authVersion || 0) + 1;
      await auth.setCustomUserClaims(user.uid, {
        ...(user.customClaims || {}),
        admin: true,
        role: 'super_admin',
        authVersion,
      });
      await db.doc(`adminUsers/${user.uid}`).set({
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || '',
        role: 'super_admin',
        status: 'active',
        permissions: [],
        authVersion,
        createdAt: existing.data()?.createdAt || FieldValue.serverTimestamp(),
        createdBy: 'local-bootstrap',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'local-bootstrap',
      }, { merge: true });
      await auth.revokeRefreshTokens(user.uid);
      await db.collection('auditLogs').add({
        actorUid: user.uid,
        actorEmail: user.email || '',
        actorRole: 'super_admin',
        action: 'admins.bootstrap',
        resource: 'adminUsers',
        resourceId: user.uid,
        outcome: 'success',
        requestId: `bootstrap-${Date.now()}`,
        detail: { source: 'interactive-local-script', authVersion },
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log('Bootstrap concluído. Faça logout/login para obter um novo ID Token.');
    }
  }
}

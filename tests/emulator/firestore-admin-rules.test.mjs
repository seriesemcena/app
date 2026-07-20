import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-maratonou',
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => { await environment?.cleanup(); });

test('clientes nunca leem nem escrevem autoridade, auditoria ou controles internos', async () => {
  const user = environment.authenticatedContext('user-a').firestore();
  for (const path of ['adminUsers/admin-a', 'auditLogs/log-a', 'adminRateLimits/rate-a', 'adminIdempotency/op-a']) {
    await assertFails(getDoc(doc(user, path)));
    await assertFails(setDoc(doc(user, path), { role: 'super_admin' }));
  }
});

test('usuário não eleva privilégio nem altera contadores do próprio perfil', async () => {
  await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'users/user-a'), { profile: { name: 'A' }, counters: { reviewsCount: 1 } }));
  const user = environment.authenticatedContext('user-a').firestore();
  await assertFails(updateDoc(doc(user, 'users/user-a'), { adminAccess: { role: 'super_admin' } }));
  await assertFails(updateDoc(doc(user, 'users/user-a'), { counters: { reviewsCount: 999 } }));
  await assertSucceeds(updateDoc(doc(user, 'users/user-a'), { 'profile.name': 'Novo nome' }));
});

test('exclusão direta de comentário é somente do autor; moderação não usa regras de cliente', async () => {
  await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'reviews/tv_1/items/review-1'), { authorUid: 'author', text: 'teste' }));
  await assertFails(deleteDoc(doc(environment.authenticatedContext('other', { email: 'igorsatierf1998@gmail.com' }).firestore(), 'reviews/tv_1/items/review-1')));
  await assertSucceeds(deleteDoc(doc(environment.authenticatedContext('author').firestore(), 'reviews/tv_1/items/review-1')));
  assert.ok(true);
});

test('conta suspensa perde escritas mesmo com token de cliente ainda presente', async () => {
  await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'users/suspended'), { profile: { name: 'S' }, accountStatus: 'suspended' }));
  const suspended = environment.authenticatedContext('suspended').firestore();
  await assertFails(setDoc(doc(suspended, 'reviews/tv_1/items/suspended-review'), { authorUid: 'suspended', text: 'não deve gravar' }));
  await assertFails(updateDoc(doc(suspended, 'users/suspended'), { 'profile.name': 'Tentativa' }));
});

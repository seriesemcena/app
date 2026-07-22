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

test('community publica ajuda para todos e restringe rascunhos aos editores', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'community_articles/publicado'), { status: 'published', title: 'Ajuda' });
    await setDoc(doc(context.firestore(), 'community_articles/rascunho'), { status: 'draft', title: 'Interno' });
    await setDoc(doc(context.firestore(), 'community_articles/legado'), { status: 'draft', title: 'Legado' });
  });
  const anonymous = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anonymous, 'community_articles/publicado')));
  await assertFails(getDoc(doc(anonymous, 'community_articles/rascunho')));

  const editor = environment.authenticatedContext('editor-a', { admin: true, role: 'editor' }).firestore();
  await assertSucceeds(getDoc(doc(editor, 'community_articles/rascunho')));
  await assertSucceeds(setDoc(doc(editor, 'community_articles/novo'), {
    title: 'Como usar', slug: 'como-usar', summary: 'Resumo', category: 'Primeiros passos',
    body: 'Conteúdo', status: 'draft', featured: false, authorUid: 'editor-a',
    createdAt: new Date(), updatedAt: new Date(),
  }));
  await assertSucceeds(updateDoc(doc(editor, 'community_articles/legado'), {
    title: 'Legado atualizado', authorUid: 'editor-a', updatedAt: new Date(),
  }));
  await assertSucceeds(deleteDoc(doc(editor, 'community_articles/legado')));
  await assertFails(setDoc(doc(environment.authenticatedContext('user-a').firestore(), 'community_articles/invasao'), {
    title: 'Não', slug: 'nao', summary: 'Não', category: 'Conta', body: 'Não',
    status: 'published', featured: true, authorUid: 'user-a', createdAt: new Date(), updatedAt: new Date(),
  }));
});

test('community valida autoria de tópicos, respostas e moderação por claims', async () => {
  const user = environment.authenticatedContext('member-a').firestore();
  await assertSucceeds(setDoc(doc(user, 'community_topics/topic-a'), {
    title: 'Como uso este recurso?', body: 'Quero entender melhor esta função.',
    category: 'Dúvida', status: 'open', authorUid: 'member-a', authorName: 'Membro',
    createdAt: new Date(), updatedAt: new Date(),
  }));
  await assertFails(setDoc(doc(user, 'community_topics/topic-b'), {
    title: 'Autoria falsa', body: 'Conteúdo de autoria falsa.', category: 'Ideia',
    status: 'open', authorUid: 'other', authorName: 'Outro', createdAt: new Date(), updatedAt: new Date(),
  }));
  await assertSucceeds(setDoc(doc(user, 'community_topics/topic-a/replies/reply-a'), {
    body: 'Minha resposta', authorUid: 'member-a', authorName: 'Membro', authorIsAdmin: false,
    createdAt: new Date(), updatedAt: new Date(),
  }));
  await assertFails(setDoc(doc(user, 'community_topics/topic-a/replies/reply-fake'), {
    body: 'Resposta falsa', authorUid: 'member-a', authorName: 'Membro', authorIsAdmin: true,
    createdAt: new Date(), updatedAt: new Date(),
  }));
  await assertFails(updateDoc(doc(user, 'community_topics/topic-a'), { status: 'resolved', updatedAt: new Date() }));
  const moderator = environment.authenticatedContext('moderator-a', { admin: true, role: 'moderator' }).firestore();
  await assertSucceeds(updateDoc(doc(moderator, 'community_topics/topic-a'), { status: 'resolved', updatedAt: new Date() }));
  await assertSucceeds(deleteDoc(doc(moderator, 'community_topics/topic-a/replies/reply-a')));
  await assertSucceeds(deleteDoc(doc(moderator, 'community_topics/topic-a')));
});

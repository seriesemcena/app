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

test('denúncias estruturadas aceitam apenas referências válidas do autor autenticado', async () => {
  const user = environment.authenticatedContext('reporter-a').firestore();
  const validReport = {
    kind: 'comment',
    reason: 'spam',
    details: 'Conteúdo repetido',
    targetId: 'review-a',
    titleKey: 'tv_1',
    targetLabel: 'Comentário em Série',
    contentSnippet: 'Trecho público do comentário',
    reportedUser: 'Autor denunciado',
    contentType: 'reply',
    contentId: 'reply-a',
    parentContentId: 'review-a',
    reportedUserId: 'reported-a',
    titleId: '1',
    titleType: 'tv',
    reportedBy: 'reporter-a',
    reportedByName: 'Pessoa denunciante',
    status: 'open',
    createdAt: new Date(),
  };

  await assertSucceeds(setDoc(doc(user, 'reports/report-valid'), validReport));
  await assertFails(setDoc(doc(user, 'reports/report-invalid-type'), {
    ...validReport,
    contentType: 'private_message',
  }));
  await assertFails(setDoc(doc(user, 'reports/report-forged-author'), {
    ...validReport,
    reportedBy: 'another-user',
  }));
  await assertFails(setDoc(
    doc(environment.unauthenticatedContext().firestore(), 'reports/report-anonymous'),
    validReport,
  ));
});

test('campanhas pop-up, métricas e estado de frequência nunca ficam expostos ao cliente', async () => {
  const user = environment.authenticatedContext('user-a').firestore();
  const protectedPaths = [
    'popup_banners/banner-a',
    'public_popup_banners/banner-a',
    'popup_banner_metrics/banner-a_2026-07-29_ios',
    'popup_banner_event_receipts/receipt-a',
    'users/user-a/popupBannerState/banner-a',
  ];

  for (const path of protectedPaths) {
    await assertFails(getDoc(doc(user, path)));
    await assertFails(setDoc(doc(user, path), { status: 'active', views: 999 }));
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

test('curtida altera somente o uid do próprio usuário', async () => {
  await environment.withSecurityRulesDisabled(async (context) => setDoc(
    doc(context.firestore(), 'reviews/tv_1/items/review-like'),
    { authorUid: 'author', text: 'teste', likedBy: ['existing'], likes: 1 },
  ));
  const user = environment.authenticatedContext('user-a').firestore();
  const review = doc(user, 'reviews/tv_1/items/review-like');

  await assertSucceeds(updateDoc(review, { likedBy: ['existing', 'user-a'], likes: 2 }));
  await assertFails(updateDoc(review, { likedBy: ['user-a'], likes: 1 }));
  await assertSucceeds(updateDoc(review, { likedBy: ['existing'], likes: 1 }));
});

test('resposta só pode anexar um item próprio sem reescrever as respostas existentes', async () => {
  const originalReply = {
    id: 'rep-original',
    uid: 'existing',
    user: 'Existing',
    avatar: 'E',
    text: 'Resposta original',
    date: new Date().toISOString(),
  };
  await environment.withSecurityRulesDisabled(async (context) => setDoc(
    doc(context.firestore(), 'reviews/tv_1/items/review-reply'),
    {
      authorUid: 'author',
      text: 'teste',
      replies: [originalReply],
      likedBy: [],
      likes: 0,
    },
  ));

  const member = environment.authenticatedContext('member-a').firestore();
  const author = environment.authenticatedContext('author').firestore();
  const review = doc(member, 'reviews/tv_1/items/review-reply');
  const ownReply = {
    id: 'rep-member',
    uid: 'member-a',
    user: 'Member',
    avatar: 'M',
    text: 'Nova resposta',
    date: new Date().toISOString(),
  };

  await assertSucceeds(updateDoc(review, { replies: [originalReply, ownReply] }));
  await assertFails(updateDoc(review, { replies: [ownReply] }));
  await assertFails(updateDoc(review, {
    replies: [originalReply, { ...ownReply, id: 'rep-forged', uid: 'another-user' }],
  }));
  await assertFails(updateDoc(doc(author, 'reviews/tv_1/items/review-reply'), { replies: [] }));
});

test('notificação social é criada apenas pelo servidor e pertence ao destinatário', async () => {
  const sender = environment.authenticatedContext('sender-a').firestore();
  const recipient = environment.authenticatedContext('recipient-a').firestore();
  const other = environment.authenticatedContext('other-a').firestore();
  const notification = {
    recipientId: 'recipient-a',
    category: 'account',
    type: 'comment_like',
    actorId: 'sender-a',
    actorUsername: 'sender',
    actorName: 'Sender',
    actorAvatarLetter: 'S',
    actorAvatarImage: '',
    commentSnippet: 'Comentário',
    read: false,
    createdAt: new Date().toISOString(),
    link: '/comments?key=tv_1',
  };

  await assertFails(setDoc(doc(sender, 'notifications/client-create'), notification));
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'notifications/server-created'), notification);
    await setDoc(doc(context.firestore(), 'notifications/server-created-delete'), notification);
  });
  await assertSucceeds(getDoc(doc(recipient, 'notifications/server-created')));
  await assertFails(getDoc(doc(other, 'notifications/server-created')));
  await assertSucceeds(updateDoc(doc(recipient, 'notifications/server-created'), { read: true }));
  await assertFails(updateDoc(doc(recipient, 'notifications/server-created'), { actorId: 'forged' }));
  await assertSucceeds(deleteDoc(doc(recipient, 'notifications/server-created-delete')));
});

test('conta suspensa perde escritas mesmo com token de cliente ainda presente', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/suspended'), { profile: { name: 'S' } });
    await setDoc(doc(context.firestore(), 'users/suspended/system/account'), {
      accountStatus: 'suspended',
      schemaVersion: 1,
    });
  });
  const suspended = environment.authenticatedContext('suspended').firestore();
  await assertFails(setDoc(doc(suspended, 'reviews/tv_1/items/suspended-review'), { authorUid: 'suspended', text: 'não deve gravar' }));
  await assertFails(updateDoc(doc(suspended, 'users/suspended'), { 'profile.name': 'Tentativa' }));
});

test('dados privados pertencem apenas ao titular e campos legados não voltam ao perfil público', async () => {
  await environment.withSecurityRulesDisabled(async (context) => setDoc(
    doc(context.firestore(), 'users/private-owner'),
    { profile: { name: 'Titular' } },
  ));
  const owner = environment.authenticatedContext('private-owner').firestore();
  const other = environment.authenticatedContext('private-other').firestore();
  const preferences = {
    value: { pushEnabled: true },
    schemaVersion: 1,
    updatedAt: new Date(),
  };

  await assertSucceeds(setDoc(
    doc(owner, 'users/private-owner/private/preferences'),
    preferences,
  ));
  await assertSucceeds(getDoc(doc(owner, 'users/private-owner/private/preferences')));
  await assertFails(getDoc(doc(other, 'users/private-owner/private/preferences')));
  await assertFails(setDoc(doc(owner, 'users/private-owner/private/unknown'), {
    value: { arbitrary: true },
    schemaVersion: 1,
    updatedAt: new Date(),
  }));
  for (const field of ['prefs', 'expenses', 'blocked_list', 'ep_watched', 'fcm_tokens', 'lastActiveAt']) {
    await assertFails(updateDoc(doc(owner, 'users/private-owner'), { [field]: [] }));
  }
  await assertFails(getDoc(doc(owner, 'users/private-owner/system/account')));
  await assertFails(setDoc(doc(owner, 'users/private-owner/system/account'), {
    accountStatus: 'active',
    schemaVersion: 1,
  }));
});

test('progresso por temporada é restaurado pelo uid e permanece privado e determinístico', async () => {
  const owner = environment.authenticatedContext('season-owner').firestore();
  const restoredOwner = environment.authenticatedContext('season-owner').firestore();
  const other = environment.authenticatedContext('season-other').firestore();
  const valid = {
    uid: 'season-owner',
    seriesId: 306956,
    seasonNumber: 1,
    watchedEpisodeNumbers: [1, 2],
    episodeDurations: { 1: 50, 2: 48 },
    episodeCount: 66,
    watchedDurationMinutes: 98,
    completedAt: null,
    updatedAt: new Date().toISOString(),
    source: 'episode',
    schemaVersion: 1,
  };

  await assertSucceeds(setDoc(doc(owner, 'users/season-owner/seasonProgress/306956_s1'), valid));
  await assertSucceeds(getDoc(doc(owner, 'users/season-owner/seasonProgress/306956_s1')));
  const restored = await assertSucceeds(
    getDoc(doc(restoredOwner, 'users/season-owner/seasonProgress/306956_s1')),
  );
  assert.deepEqual(restored.data()?.watchedEpisodeNumbers, [1, 2]);
  await assertFails(getDoc(doc(other, 'users/season-owner/seasonProgress/306956_s1')));
  await assertFails(setDoc(doc(other, 'users/season-owner/seasonProgress/306956_s1'), {
    ...valid,
    uid: 'season-other',
  }));
  await assertFails(setDoc(doc(owner, 'users/season-owner/seasonProgress/forged-id'), valid));
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

'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getMessaging } = require('firebase-admin/messaging');
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} = require('firebase-functions/v2/firestore');

initializeApp();

// Versioned central API. Exported from a separate module so every admin
// endpoint shares the same authorization and audit chain.
exports.centralApi = require('./admin-api').centralApi;

const db = getFirestore();
const auth = getAuth();
const TMDB_API_KEY = defineSecret('TMDB_API_KEY');
const TMDB_BASE = 'https://api.themoviedb.org/3';
const DAYS_THRESHOLD = 3;
const USER_SCAN_PAGE_SIZE = 100;

async function deleteQueryDocuments(baseQuery, pageSize = 250) {
  let deleted = 0;
  while (true) {
    const page = await baseQuery.limit(pageSize).get();
    if (page.empty) break;
    const batch = db.batch();
    page.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    deleted += page.size;
    if (page.size < pageSize) break;
  }
  return deleted;
}

async function removeUidFromReactionMaps(uid) {
  let cursor = null;
  let updated = 0;
  while (true) {
    let query = db.collection('reactions').orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    let batchUpdates = 0;
    for (const item of page.docs) {
      if (Object.prototype.hasOwnProperty.call(item.data()?.users || {}, uid)) {
        batch.update(item.ref, new FieldPath('users', uid), FieldValue.delete());
        batchUpdates += 1;
      }
    }
    if (batchUpdates) await batch.commit();
    updated += batchUpdates;
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 250) break;
  }
  return updated;
}

async function removeUidFromReviewInteractions(uid) {
  const liked = await db.collectionGroup('items').where('likedBy', 'array-contains', uid).get();
  for (let offset = 0; offset < liked.size; offset += 250) {
    const batch = db.batch();
    liked.docs.slice(offset, offset + 250).forEach((item) => {
      const likes = Array.isArray(item.data()?.likedBy) ? item.data().likedBy.length : 0;
      batch.update(item.ref, {
        likedBy: FieldValue.arrayRemove(uid),
        likes: Math.max(0, likes - 1),
      });
    });
    await batch.commit();
  }

  let cursor = null;
  let repliesRemoved = 0;
  while (true) {
    let query = db.collectionGroup('items').orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    let batchUpdates = 0;
    for (const item of page.docs) {
      const replies = Array.isArray(item.data()?.replies) ? item.data().replies : [];
      const filtered = replies.filter((reply) => reply?.uid !== uid);
      if (filtered.length !== replies.length) {
        batch.update(item.ref, { replies: filtered });
        repliesRemoved += replies.length - filtered.length;
        batchUpdates += 1;
      }
    }
    if (batchUpdates) await batch.commit();
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 250) break;
  }
  return { likesRemoved: liked.size, repliesRemoved };
}

async function deleteOwnedCommunityTopics(uid) {
  const topics = await db.collection('community_topics').where('authorUid', '==', uid).get();
  for (const topic of topics.docs) await db.recursiveDelete(topic.ref);
  return topics.size;
}

async function deleteRankingEntries(uid) {
  const months = await db.collection('rankingMonthly').listDocuments();
  const refs = months.map((month) => month.collection('entries').doc(uid));
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = db.batch();
    refs.slice(offset, offset + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return refs.length;
}

/** Permanently removes an authenticated member and their user-generated data.
 * A recent login is required because this operation cannot be undone. */
exports.deleteMyAccount = onCall({
  timeoutSeconds: 540,
  memory: '512MiB',
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Entre novamente para excluir sua conta.');
  if (request.data?.confirmation !== 'EXCLUIR') {
    throw new HttpsError('invalid-argument', 'Confirmação de exclusão inválida.');
  }

  const uid = request.auth.uid;
  const authTime = Number(request.auth.token.auth_time || 0) * 1000;
  if (!authTime || Date.now() - authTime > 15 * 60 * 1000) {
    throw new HttpsError('failed-precondition', 'Faça login novamente antes de excluir sua conta.');
  }

  const userSnapshot = await db.doc(`users/${uid}`).get();
  const profile = userSnapshot.data()?.profile || {};
  const identities = [...new Set([
    uid,
    profile.username,
    ...(Array.isArray(profile.aliases) ? profile.aliases : []),
  ].filter(Boolean))];

  const deleted = {};
  deleted.activities = await deleteQueryDocuments(db.collection('activity').where('uid', '==', uid));
  deleted.receivedNotifications = await deleteQueryDocuments(db.collection('notifications').where('recipientId', '==', uid));
  deleted.sentNotifications = await deleteQueryDocuments(db.collection('notifications').where('actorId', '==', uid));
  deleted.appNotifications = await deleteQueryDocuments(db.collection('app_notifications').where('recipientId', '==', uid));
  deleted.reports = await deleteQueryDocuments(db.collection('reports').where('reportedBy', '==', uid));
  deleted.reviews = await deleteQueryDocuments(db.collectionGroup('items').where('authorUid', '==', uid));
  deleted.ratings = await deleteQueryDocuments(db.collectionGroup('userRatings').where('authorUid', '==', uid));
  deleted.communityReplies = await deleteQueryDocuments(db.collectionGroup('replies').where('authorUid', '==', uid));
  deleted.communityArticles = await deleteQueryDocuments(db.collection('community_articles').where('authorUid', '==', uid));
  deleted.communityTopics = await deleteOwnedCommunityTopics(uid);
  deleted.followEdges = await deleteQueryDocuments(db.collectionGroup('following').where('userId', '==', uid));

  for (const identity of identities) {
    const followers = await db.collection('users').where('following_list', 'array-contains', identity).get();
    for (let offset = 0; offset < followers.size; offset += 250) {
      const batch = db.batch();
      followers.docs.slice(offset, offset + 250).forEach((item) => {
        batch.update(item.ref, { following_list: FieldValue.arrayRemove(identity) });
      });
      await batch.commit();
    }
  }

  deleted.reviewInteractions = await removeUidFromReviewInteractions(uid);
  deleted.reactions = await removeUidFromReactionMaps(uid);
  deleted.rankingEntries = await deleteRankingEntries(uid);

  await Promise.all([
    db.doc(`userStats/${uid}`).delete().catch(() => {}),
    db.doc(`adminUsers/${uid}`).delete().catch(() => {}),
  ]);
  if (userSnapshot.exists) await db.recursiveDelete(userSnapshot.ref);

  try {
    await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/` });
  } catch (error) {
    logger.warn('Account storage cleanup skipped', { uid, error: String(error) });
  }

  await auth.deleteUser(uid);
  logger.info('Member account permanently deleted', { uid, deleted });
  return { deleted: true };
});

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nonNegative = (value) => Math.max(0, asNumber(value));
const monthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

function metricRefs(date = new Date()) {
  return [
    db.doc('metrics/global'),
    db.doc(`metricsMonthly/${monthKey(date)}`),
    db.doc(`metricsDaily/${dayKey(date)}`),
  ];
}

/** Idempotent, atomic metric deltas. Cloud Functions may retry the same event;
 * the create-only receipt makes a retry fail before counters can increment. */
async function incrementMetricsOnce(eventId, changes, date = new Date()) {
  const receiptRef = db.doc(`systemEvents/${stableId(`metrics:${eventId}`)}`);
  const refs = metricRefs(date);
  return db.runTransaction(async (transaction) => {
    const [receipt, ...snapshots] = await Promise.all([
      transaction.get(receiptRef),
      ...refs.map((ref) => transaction.get(ref)),
    ]);
    if (receipt.exists) return false;
    refs.forEach((ref, index) => {
      const current = snapshots[index].data() || {};
      const next = { updatedAt: FieldValue.serverTimestamp() };
      for (const [field, delta] of Object.entries(changes)) {
        next[field] = Math.max(0, asNumber(current[field]) + asNumber(delta));
      }
      transaction.set(ref, next, { merge: true });
    });
    transaction.create(receiptRef, {
      kind: 'metrics', eventId, processedAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    return true;
  });
}

async function transactionOnce(eventId, mutate) {
  const receiptRef = db.doc(`systemEvents/${stableId(eventId)}`);
  return db.runTransaction(async (transaction) => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) return false;
    await mutate(transaction);
    transaction.create(receiptRef, {
      eventId, processedAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    return true;
  });
}

const DEFAULT_TEMPLATES = {
  new_episode: {
    enabled: true,
    title: '📺 Novo episódio de {{title}}',
    body: '{{season}}X{{episode}} {{episodeName}} estreia {{days}} ({{date}}).',
  },
  streaming_available: {
    enabled: true,
    title: '{{title}} chegou ao {{platform}}',
    body: 'Já está disponível para assistir no {{platform}}.',
  },
  pro_reminder: {
    enabled: true,
    title: '{{listName}}',
    body: '{{title}} está chegando na data que você escolheu.',
  },
};

const PLATFORM_ALIASES = {
  netflix: ['netflix'],
  primevideo: ['primevideo', 'amazonprimevideo'],
  disney: ['disney', 'disneyplus'],
  hbo: ['hbo', 'hbomax', 'max'],
  appletv: ['appletv', 'appletvplus'],
  globoplay: ['globoplay'],
  paramount: ['paramount', 'paramountplus'],
  mgm: ['mgm', 'mgmplus', 'mgmamazonchannel'],
};

const normalizeName = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const stableId = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 40);

function templateWithFallback(value, fallback) {
  return {
    enabled: value?.enabled !== false,
    title: typeof value?.title === 'string' && value.title.trim() ? value.title : fallback.title,
    body: typeof value?.body === 'string' && value.body.trim() ? value.body : fallback.body,
  };
}

async function getTemplates() {
  const snap = await db.doc('config/notification_templates').get();
  const saved = snap.data()?.templates || {};
  return {
    new_episode: templateWithFallback(saved.new_episode, DEFAULT_TEMPLATES.new_episode),
    streaming_available: templateWithFallback(saved.streaming_available, DEFAULT_TEMPLATES.streaming_available),
    pro_reminder: templateWithFallback(saved.pro_reminder, DEFAULT_TEMPLATES.pro_reminder),
  };
}

function render(template, values) {
  const fill = (text) => text
    .replace(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g, (_match, key) => String(values[key] ?? ''))
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { title: fill(template.title), body: fill(template.body) };
}

function daysBetween(date) {
  const today = new Date();
  const [year, month, day] = date.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000);
}

function dayLabel(days) {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

function selectedProvider(provider, selected) {
  const normalizedProvider = normalizeName(provider);
  return selected.some((platform) => {
    const normalizedSelected = normalizeName(platform);
    const aliases = Object.values(PLATFORM_ALIASES).find((group) => group.includes(normalizedSelected)) || [normalizedSelected];
    return aliases.some((alias) => normalizedProvider === alias || normalizedProvider.includes(alias));
  });
}

async function tmdb(endpoint) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_API_KEY.value());
  url.searchParams.set('language', 'pt-BR');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB ${response.status}: ${endpoint}`);
  return response.json();
}

async function deliver(uid, eventKey, notification) {
  const deliveryId = stableId(`${uid}:${eventKey}`);
  const ref = db.doc(`app_notifications/${deliveryId}`);
  try {
    await ref.create({
      recipientId: uid,
      eventKey,
      ...notification,
      time: new Date().toISOString(),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === 6 || error?.code === 'already-exists') return { created: false, pushSuccess: 0, pushFailure: 0 };
    throw error;
  }

  const tokenSnap = await db.doc(`users/${uid}/private/push`).get();
  const tokens = tokenSnap.data()?.tokens || [];
  const pushUrl = notification.link || '/notifications?tab=app';
  let pushSuccess = 0;
  let pushFailure = 0;
  if (tokens.length) {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      data: { url: pushUrl, eventKey, type: notification.type || 'general' },
      webpush: { fcmOptions: { link: pushUrl } },
    });
    const invalid = [];
    pushSuccess = response.successCount;
    pushFailure = response.failureCount;
    response.responses.forEach((result, index) => {
      if (!result.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.error?.code)) {
        invalid.push(tokens[index]);
      }
    });
    if (invalid.length) {
      await tokenSnap.ref.set({ tokens: tokens.filter((token) => !invalid.includes(token)) }, { merge: true });
    }
  }
  return { created: true, pushSuccess, pushFailure };
}

/** Authenticated diagnostics endpoint used by notification settings.
 * It only sends fixed Maratonou copy to the caller's own registered devices. */
exports.sendTestPush = onCall({
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Entre na sua conta para testar as notificações.');
  }

  const uid = request.auth.uid;
  const tokenRef = db.doc(`users/${uid}/private/push`);
  const tokenSnap = await tokenRef.get();
  const tokens = [...new Set(
    (Array.isArray(tokenSnap.data()?.tokens) ? tokenSnap.data().tokens : [])
      .filter((token) => typeof token === 'string' && token.length > 20),
  )].slice(0, 20);

  if (!tokens.length) {
    throw new HttpsError(
      'failed-precondition',
      'Este dispositivo ainda não possui um token de notificação registrado.',
    );
  }

  const now = Date.now();
  const limitRef = db.doc(`notification_test_limits/${uid}`);
  await db.runTransaction(async (transaction) => {
    const limitSnap = await transaction.get(limitRef);
    const lastSentAtMs = Number(limitSnap.data()?.lastSentAtMs || 0);
    if (lastSentAtMs && now - lastSentAtMs < 30_000) {
      throw new HttpsError(
        'resource-exhausted',
        'Aguarde alguns segundos antes de enviar outro teste.',
      );
    }
    transaction.set(limitRef, {
      uid,
      lastSentAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  const locale = String(request.data?.locale || 'pt-BR').toLowerCase();
  const copy = locale.startsWith('es')
    ? {
        title: 'Prueba de Maratonou',
        body: 'Las notificaciones funcionan correctamente en este dispositivo.',
      }
    : locale.startsWith('en')
      ? {
          title: 'Maratonou test',
          body: 'Notifications are working correctly on this device.',
        }
      : {
          title: 'Teste do Maratonou',
          body: 'As notificações estão funcionando corretamente neste dispositivo.',
        };

  const eventKey = `push-test:${now}`;
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: copy,
    data: { url: '/settings/notifications?from=profile', eventKey },
    android: {
      priority: 'high',
      notification: { sound: 'default' },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default' } },
    },
    webpush: {
      fcmOptions: { link: '/settings/notifications?from=profile' },
    },
  });

  const invalid = [];
  response.responses.forEach((result, index) => {
    if (!result.success && [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ].includes(result.error?.code)) {
      invalid.push(tokens[index]);
    }
  });
  if (invalid.length) {
    await tokenRef.set({
      tokens: (tokenSnap.data()?.tokens || []).filter((token) => !invalid.includes(token)),
    }, { merge: true });
  }

  if (response.successCount === 0) {
    throw new HttpsError(
      'unavailable',
      'O FCM não aceitou o teste. Registre o dispositivo novamente e tente de novo.',
    );
  }

  logger.info('Authenticated push test accepted', {
    uid,
    devices: tokens.length,
    pushSuccess: response.successCount,
    pushFailure: response.failureCount,
  });
  return {
    accepted: true,
    devices: tokens.length,
    pushSuccess: response.successCount,
    pushFailure: response.failureCount,
  };
});

async function forEachUserPage(handler) {
  let cursor = null;
  let total = 0;
  while (true) {
    let usersQuery = db.collection('users').orderBy('__name__').limit(USER_SCAN_PAGE_SIZE);
    if (cursor) usersQuery = usersQuery.startAfter(cursor);
    const page = await usersQuery.get();
    if (page.empty) break;
    await handler(page.docs);
    total += page.size;
    cursor = page.docs[page.docs.length - 1];
    if (page.size < USER_SCAN_PAGE_SIZE) break;
  }
  return total;
}

async function checkEpisode(user, item, templates) {
  if (user.prefs?.notifPrefs?.episodes === false || !templates.new_episode.enabled) return;
  const detail = await tmdb(`/tv/${item.id}`);
  const episode = detail.next_episode_to_air;
  if (!episode?.air_date) return;
  const days = daysBetween(episode.air_date);
  if (days < 0 || days > DAYS_THRESHOLD) return;
  const eventKey = `tv-${item.id}-s${episode.season_number}e${episode.episode_number}`;
  const text = render(templates.new_episode, {
    title: item.title,
    season: episode.season_number,
    episode: String(episode.episode_number).padStart(2, '0'),
    episodeName: episode.name || '',
    date: episode.air_date,
    days: dayLabel(days),
  });
  await deliver(user.uid, eventKey, {
    type: 'new_episode',
    ...text,
    link: `/title/tv/${item.id}`,
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w154${item.poster_path}` : null,
  });
}

async function checkStreaming(user, item, templates) {
  if (user.prefs?.notifPrefs?.premieres === false || !templates.streaming_available.enabled) return;
  const selected = Array.from(new Set([...(user.prefs?.streams || []), ...(user.profile?.streamings || [])]));
  const region = String(user.prefs?.country || user.appSettings?.defaultRegion || 'BR').toUpperCase();
  const providers = await tmdb(`/movie/${item.id}/watch/providers`);
  const current = Array.from(new Set((providers.results?.[region]?.flatrate || []).map((entry) => entry.provider_name).filter(Boolean)));
  // Per-user baseline: every account has independent selected platforms and
  // must observe the same provider transition, not just the first user scanned.
  const stateId = stableId(`${user.uid}:movie:${item.id}:${region}`);
  const stateRef = db.doc(`notification_state/${stateId}`);
  const state = await stateRef.get();
  const previous = state.data()?.providers;
  await stateRef.set({ type: 'movie_streaming', movieId: item.id, region, providers: current, checkedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (!Array.isArray(previous)) return; // baseline only

  const before = new Set(previous.map(normalizeName));
  const arrival = current.find((name) => !before.has(normalizeName(name)) && selectedProvider(name, selected));
  if (!arrival) return;
  const eventKey = `streaming-movie-${item.id}-${region}-${normalizeName(arrival)}`;
  const text = render(templates.streaming_available, {
    title: item.title,
    platform: arrival,
    date: new Date().toISOString().slice(0, 10),
  });
  await deliver(user.uid, eventKey, {
    type: 'release',
    ...text,
    link: `/title/movie/${item.id}`,
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w154${item.poster_path}` : null,
  });
}

// ── Derived data and aggregates ──────────────────────────────

exports.aggregateRatingSummary = onDocumentWritten('ratings/{titleKey}/userRatings/{uid}', async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const oldRating = before ? Math.max(1, Math.min(10, Math.round(asNumber(before.rating)))) : null;
  const newRating = after ? Math.max(1, Math.min(10, Math.round(asNumber(after.rating)))) : null;
  if (oldRating === newRating) return;

  const { titleKey, uid } = event.params;
  const summaryRef = db.doc(`ratingSummaries/${titleKey}`);
  const userRef = db.doc(`users/${uid}`);
  await transactionOnce(`rating-summary:${event.id}`, async (transaction) => {
    const [summarySnap, userSnap] = await Promise.all([
      transaction.get(summaryRef), transaction.get(userRef),
    ]);
    const summary = summarySnap.data() || {};
    const distribution = { ...(summary.distribution || {}) };
    let total = nonNegative(summary.total);
    let sum = nonNegative(summary.sum);
    if (oldRating != null) {
      total = Math.max(0, total - 1);
      sum = Math.max(0, sum - oldRating);
      distribution[String(oldRating)] = Math.max(0, asNumber(distribution[String(oldRating)]) - 1);
    }
    if (newRating != null) {
      total += 1;
      sum += newRating;
      distribution[String(newRating)] = asNumber(distribution[String(newRating)]) + 1;
    }
    transaction.set(summaryRef, {
      titleId: titleKey,
      total,
      sum,
      average: total ? Number((sum / total).toFixed(3)) : 0,
      distribution,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (userSnap.exists && ((before == null) !== (after == null))) {
      const counters = userSnap.data()?.counters || {};
      transaction.set(userRef, {
        counters: {
          ...counters,
          ratingsCount: Math.max(0, asNumber(counters.ratingsCount) + (after ? 1 : -1)),
        },
      }, { merge: true });
    }
  });
  if ((before == null) !== (after == null)) {
    await incrementMetricsOnce(`rating:${event.id}`, { ratingsTotal: after ? 1 : -1 });
  }
});

async function updateReviewCounter(event, delta) {
  const review = event.data?.data() || {};
  const uid = review.authorUid || review.uid;
  if (!uid) return;
  const userRef = db.doc(`users/${uid}`);
  await transactionOnce(`review-counter:${event.id}`, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return;
    const counters = userSnap.data()?.counters || {};
    transaction.set(userRef, {
      counters: {
        ...counters,
        commentsCount: Math.max(0, asNumber(counters.commentsCount) + delta),
      },
    }, { merge: true });
  });
  await incrementMetricsOnce(`review:${event.id}`, {
    reviewsTotal: delta,
    commentsTotal: delta,
  });
}

exports.countReviewCreated = onDocumentCreated('reviews/{titleKey}/items/{reviewId}', (event) => updateReviewCounter(event, 1));
exports.countReviewDeleted = onDocumentDeleted('reviews/{titleKey}/items/{reviewId}', (event) => updateReviewCounter(event, -1));

async function mirrorFollow(event, delta) {
  const relation = event.data?.data() || {};
  const followerUid = event.params.followerUid;
  const targetUid = relation.userId || event.params.targetUid;
  if (!targetUid || targetUid === followerUid) return;
  const followerRef = db.doc(`users/${followerUid}`);
  const targetRef = db.doc(`users/${targetUid}`);
  const mirrorRef = db.doc(`users/${targetUid}/followers/${followerUid}`);

  await transactionOnce(`follow:${event.id}`, async (transaction) => {
    const [followerSnap, targetSnap] = await Promise.all([
      transaction.get(followerRef), transaction.get(targetRef),
    ]);
    if (!followerSnap.exists || !targetSnap.exists) return;
    const follower = followerSnap.data();
    const followerProfile = follower.profile || {};
    const followerCounters = follower.counters || {};
    const targetCounters = targetSnap.data()?.counters || {};
    transaction.set(followerRef, {
      counters: {
        ...followerCounters,
        followingCount: Math.max(0, asNumber(followerCounters.followingCount) + delta),
      },
    }, { merge: true });
    transaction.set(targetRef, {
      counters: {
        ...targetCounters,
        followersCount: Math.max(0, asNumber(targetCounters.followersCount) + delta),
      },
    }, { merge: true });
    if (delta > 0) {
      transaction.set(mirrorRef, {
        userId: followerUid,
        username: followerProfile.username || '',
        name: followerProfile.name || '',
        avatarImage: followerProfile.avatarThumbImage || followerProfile.avatarImage || '',
        avatarLetter: followerProfile.avatarLetter || '',
        avatarGradient: followerProfile.avatarGradient || '',
        createdAt: relation.createdAt || FieldValue.serverTimestamp(),
      });
    } else {
      transaction.delete(mirrorRef);
    }
  });
}

exports.mirrorFollowCreated = onDocumentCreated('users/{followerUid}/following/{targetUid}', (event) => mirrorFollow(event, 1));
exports.mirrorFollowDeleted = onDocumentDeleted('users/{followerUid}/following/{targetUid}', (event) => mirrorFollow(event, -1));

exports.deriveUserListCounters = onDocumentUpdated('users/{uid}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const listFields = ['lists_want', 'lists_watching', 'lists_watched', 'lists_favorites'];
  const changed = listFields.some((field) => JSON.stringify(before[field] || []) !== JSON.stringify(after[field] || []));
  if (!changed) return;
  const counters = after.counters || {};
  const listsCount = listFields.reduce((total, field) => total + (Array.isArray(after[field]) ? after[field].length : 0), 0);
  const watchedCount = Array.isArray(after.lists_watched) ? after.lists_watched.length : 0;
  if (asNumber(counters.listsCount) === listsCount && asNumber(counters.watchedCount) === watchedCount) return;
  await event.data.after.ref.set({ counters: { ...counters, listsCount, watchedCount } }, { merge: true });
});

async function updateActivityAggregates(event, delta) {
  const activity = event.data?.data() || {};
  const uid = activity.uid;
  if (!uid) return;
  const createdAt = activity.createdAt ? new Date(activity.createdAt) : new Date();
  const eventDate = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
  const month = monthKey(eventDate);
  const date = dayKey(eventDate);
  const entryRef = db.doc(`rankingMonthly/${month}/entries/${uid}`);
  const statsRef = db.doc(`userStats/${uid}`);
  await transactionOnce(`ranking:${event.id}`, async (transaction) => {
    const [entrySnap, statsSnap] = await Promise.all([
      transaction.get(entryRef), transaction.get(statsRef),
    ]);
    const current = entrySnap.data() || {};
    const watchedCount = Math.max(0, asNumber(current.watchedCount) + (activity.action === 'watched' ? delta : 0));
    const watchedMinutes = Math.max(0, asNumber(current.watchedMinutes) + (activity.action === 'watched' ? 90 * delta : 0));
    const reviewsCount = Math.max(0, asNumber(current.reviewsCount) + (activity.action === 'reviewed' ? delta : 0));
    transaction.set(entryRef, {
      uid,
      name: activity.authorName || activity.username || current.name || '',
      username: activity.authorUsername || activity.username || current.username || '',
      avatarGradient: activity.avatarGradient || current.avatarGradient || '',
      avatarUrl: activity.authorAvatarUrl || activity.photoUrl || current.avatarUrl || '',
      watchedCount,
      watchedMinutes,
      reviewsCount,
      score: Number((watchedMinutes / 60 + reviewsCount * 3).toFixed(2)),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const stats = statsSnap.data() || {};
    const recentDays = { ...(stats.recentDays || {}) };
    const months = { ...(stats.months || {}) };
    const currentDay = recentDays[date] || {};
    recentDays[date] = {
      activities: Math.max(0, asNumber(currentDay.activities) + delta),
      watched: Math.max(0, asNumber(currentDay.watched) + (activity.action === 'watched' ? delta : 0)),
    };
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 42);
    const cutoffKey = dayKey(cutoff);
    Object.keys(recentDays).filter((key) => key < cutoffKey).forEach((key) => delete recentDays[key]);

    const currentMonth = months[month] || {};
    months[month] = {
      activities: Math.max(0, asNumber(currentMonth.activities) + delta),
      watched: Math.max(0, asNumber(currentMonth.watched) + (activity.action === 'watched' ? delta : 0)),
      watchedMinutes: Math.max(0, asNumber(currentMonth.watchedMinutes) + (activity.action === 'watched' ? 90 * delta : 0)),
    };
    Object.keys(months).sort().slice(0, Math.max(0, Object.keys(months).length - 12)).forEach((key) => delete months[key]);
    transaction.set(statsRef, { uid, recentDays, months, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await incrementMetricsOnce(`activity:${event.id}`, { activityTotal: delta });
}

exports.aggregateActivityCreated = onDocumentCreated('activity/{activityId}', (event) => updateActivityAggregates(event, 1));
exports.aggregateActivityDeleted = onDocumentDeleted('activity/{activityId}', (event) => updateActivityAggregates(event, -1));

exports.countUserCreated = onDocumentCreated('users/{uid}', (event) => {
  const isPro = event.data?.data()?.profile?.proMember === true;
  return incrementMetricsOnce(`user:${event.id}`, { usersTotal: 1, proMembersTotal: isPro ? 1 : 0 });
});
exports.countUserDeleted = onDocumentDeleted('users/{uid}', (event) => {
  const wasPro = event.data?.data()?.profile?.proMember === true;
  return incrementMetricsOnce(`user:${event.id}`, { usersTotal: -1, proMembersTotal: wasPro ? -1 : 0 });
});
exports.countProMembershipChange = onDocumentUpdated('users/{uid}', (event) => {
  const wasPro = event.data.before.data()?.profile?.proMember === true;
  const isPro = event.data.after.data()?.profile?.proMember === true;
  if (wasPro === isPro) return null;
  return incrementMetricsOnce(`pro:${event.id}`, { proMembersTotal: isPro ? 1 : -1 });
});
exports.countNotificationCreated = onDocumentCreated('notifications/{notificationId}', (event) => incrementMetricsOnce(`notification:${event.id}`, { notificationsTotal: 1 }));
exports.countAppNotificationCreated = onDocumentCreated('app_notifications/{notificationId}', (event) => incrementMetricsOnce(`app-notification:${event.id}`, {
  notificationsTotal: 1,
  appNotificationsTotal: 1,
}));
exports.countAppNotificationOpened = onDocumentUpdated('app_notifications/{notificationId}', (event) => {
  const wasRead = event.data.before.data()?.read === true;
  const isRead = event.data.after.data()?.read === true;
  if (wasRead === isRead) return null;
  return incrementMetricsOnce(`app-notification-open:${event.id}`, { appNotificationsOpenedTotal: isRead ? 1 : -1 });
});

const reportIsOpen = (data) => !data?.status || ['open', 'in_review'].includes(data.status);
exports.countReportCreated = onDocumentCreated('reports/{reportId}', (event) => incrementMetricsOnce(`report:${event.id}`, {
  reportsTotal: 1,
  openReportsTotal: reportIsOpen(event.data?.data()) ? 1 : 0,
}));
exports.countReportUpdated = onDocumentUpdated('reports/{reportId}', (event) => {
  const wasOpen = reportIsOpen(event.data.before.data());
  const isOpen = reportIsOpen(event.data.after.data());
  if (wasOpen === isOpen) return null;
  return incrementMetricsOnce(`report-state:${event.id}`, { openReportsTotal: isOpen ? 1 : -1 });
});
exports.countReportDeleted = onDocumentDeleted('reports/{reportId}', (event) => incrementMetricsOnce(`report:${event.id}`, {
  reportsTotal: -1,
  openReportsTotal: reportIsOpen(event.data?.data()) ? -1 : 0,
}));

const jobIsPending = (data) => data?.status === 'pending';
exports.countNotificationJobCreated = onDocumentCreated('notification_jobs/{jobId}', (event) => incrementMetricsOnce(`job:${event.id}`, {
  pendingJobsTotal: jobIsPending(event.data?.data()) ? 1 : 0,
}));
exports.countNotificationJobUpdated = onDocumentUpdated('notification_jobs/{jobId}', (event) => {
  const wasPending = jobIsPending(event.data.before.data());
  const isPending = jobIsPending(event.data.after.data());
  if (wasPending === isPending) return null;
  return incrementMetricsOnce(`job-state:${event.id}`, { pendingJobsTotal: isPending ? 1 : -1 });
});
exports.countNotificationJobDeleted = onDocumentDeleted('notification_jobs/{jobId}', (event) => incrementMetricsOnce(`job:${event.id}`, {
  pendingJobsTotal: jobIsPending(event.data?.data()) ? -1 : 0,
}));

exports.scanAutomatedNotifications = onSchedule({
  schedule: 'every 6 hours',
  timeZone: 'America/Bahia',
  secrets: [TMDB_API_KEY],
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => {
  const templates = await getTemplates();
  const appSettings = (await db.doc('config/app_settings').get()).data() || {};
  let checked = 0;
  const usersChecked = await forEachUserPage(async (users) => {
    for (const doc of users) {
      const data = doc.data();
      const user = { uid: doc.id, prefs: data.prefs || {}, profile: data.profile || {}, appSettings };
      const titles = [...(data.lists_want || []), ...(data.lists_watching || [])];
      const unique = Array.from(new Map(titles.map((item) => [`${item.type}:${item.id}`, item])).values());
      for (const item of unique) {
        checked += 1;
        try {
          if (item.type === 'tv') await checkEpisode(user, item, templates);
          else if (item.type === 'movie') await checkStreaming(user, item, templates);
        } catch (error) {
          logger.warn('Automatic notification check failed', { uid: doc.id, itemId: item.id, error: String(error) });
        }
      }
    }
  });
  logger.info('Automatic notification scan complete', { users: usersChecked, checked });
});

exports.processNotificationJobs = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'America/Bahia',
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => {
  const pending = await db.collection('notification_jobs').where('status', '==', 'pending').limit(100).get();
  const now = Date.now();
  for (const jobDoc of pending.docs) {
    const job = jobDoc.data();
    if (new Date(job.scheduledAt).getTime() > now) continue;
    await jobDoc.ref.update({ status: 'processing', startedAt: FieldValue.serverTimestamp() });
    try {
      let deliveries = 0;
      let pushDeliveries = 0;
      let pushFailures = 0;
      await forEachUserPage(async (users) => {
        for (const userDoc of users) {
          const profile = userDoc.data().profile || {};
          if ((job.target === 'vip' || job.target === 'pro') && profile.proMember !== true) continue;
          if (job.target === 'free' && profile.proMember === true) continue;
          const delivered = await deliver(userDoc.id, `manual-${jobDoc.id}`, {
            type: 'general',
            title: job.title,
            body: job.body || '',
            link: job.link || '/notifications?tab=app',
          });
          if (delivered.created) deliveries += 1;
          pushDeliveries += delivered.pushSuccess;
          pushFailures += delivered.pushFailure;
        }
      });
      await jobDoc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), deliveries, pushDeliveries, pushFailures });
    } catch (error) {
      await jobDoc.ref.update({ status: 'failed', failedAt: FieldValue.serverTimestamp(), error: String(error).slice(0, 500) });
      logger.error('Notification job failed', { jobId: jobDoc.id, error });
    }
  }
});

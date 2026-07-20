#!/usr/bin/env node

/**
 * Maratonou Firestore architecture backfill.
 *
 * Safe defaults:
 *   node scripts/migrations/optimize-firestore.mjs        # dry-run
 *   node scripts/migrations/optimize-firestore.mjs --apply
 *   node scripts/migrations/optimize-firestore.mjs --task=profiles,reviews
 *
 * The script uses bounded pages, merge writes, deterministic ids and a local
 * cursor file. It never runs as part of build/deploy and must first be tested
 * against an emulator or cloned Firebase project.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const args = new Set(process.argv.slice(2));
const option = (name, fallback = '') => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
const apply = args.has('--apply');
const batchSize = Math.min(200, Math.max(20, Number(option('--batch-size', '100')) || 100));
const tasks = new Set(option('--task', 'profiles,reviews,activity,metrics').split(',').map((value) => value.trim()).filter(Boolean));
const statePath = resolve(option('--state', 'scripts/migrations/.optimize-firestore-state.json'));
const report = { mode: apply ? 'apply' : 'dry-run', batchSize, reads: 0, writes: 0, skipped: 0, warnings: [], tasks: {} };

async function loadCredential() {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) return applicationDefault();
  return cert(JSON.parse(await readFile(resolve(path), 'utf8')));
}

if (!getApps().length) initializeApp({
  credential: await loadCredential(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});
const db = getFirestore();

async function loadState() {
  try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return {}; }
}

const state = apply && !args.has('--restart') ? await loadState() : {};

async function saveState() {
  if (!apply) return;
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function retry(operation, label, attempts = 5) {
  let failure;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      failure = error;
      if (attempt + 1 < attempts) await sleep(250 * (2 ** attempt));
    }
  }
  throw new Error(`${label}: ${failure instanceof Error ? failure.message : String(failure)}`);
}

async function* pages(collectionRef, stateKey) {
  let cursorId = state[stateKey]?.cursor || null;
  while (true) {
    let query = collectionRef.orderBy(FieldPath.documentId()).limit(batchSize);
    if (cursorId) query = query.startAfter(cursorId);
    const snapshot = await retry(() => query.get(), `read ${stateKey}`);
    report.reads += snapshot.size;
    if (snapshot.empty) break;
    yield snapshot.docs;
    cursorId = snapshot.docs.at(-1).id;
    state[stateKey] = { cursor: cursorId, updatedAt: new Date().toISOString() };
    await saveState();
    if (snapshot.size < batchSize) break;
  }
  state[stateKey] = { done: true, updatedAt: new Date().toISOString() };
  await saveState();
}

async function commit(operations, label) {
  if (!operations.length) return;
  report.writes += operations.length;
  if (!apply) return;
  for (let start = 0; start < operations.length; start += batchSize) {
    const batch = db.batch();
    operations.slice(start, start + batchSize).forEach((operation) => operation(batch));
    await retry(() => batch.commit(), `write ${label}`);
  }
}

const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const publicProfile = (uid, profile = {}) => ({
  userId: uid,
  username: profile.username || '',
  name: profile.name || '',
  avatarImage: profile.avatarThumbImage || profile.avatarImage || '',
  avatarLetter: profile.avatarLetter || '',
  avatarGradient: profile.avatarGradient || '',
  createdAt: FieldValue.serverTimestamp(),
});

async function migrateProfiles() {
  const identityMap = new Map();
  const users = new Map();
  for await (const docs of pages(db.collection('users'), 'profiles-read')) {
    docs.forEach((entry) => {
      const data = entry.data();
      users.set(entry.id, data);
      const profile = data.profile || {};
      [entry.id, profile.username, profile.name, ...(profile.aliases || [])].filter(Boolean)
        .forEach((identity) => identityMap.set(normalize(identity), entry.id));
    });
  }

  const followerCounts = new Map();
  const followingCounts = new Map();
  const relationOps = [];
  for (const [followerUid, data] of users) {
    const profile = data.profile || {};
    const targets = new Set();
    for (const identity of data.following_list || []) {
      const targetUid = identityMap.get(normalize(identity));
      if (!targetUid || targetUid === followerUid) {
        report.warnings.push(`follow não resolvido: ${followerUid} -> ${identity}`);
        continue;
      }
      targets.add(targetUid);
    }
    followingCounts.set(followerUid, targets.size);
    for (const targetUid of targets) {
      followerCounts.set(targetUid, (followerCounts.get(targetUid) || 0) + 1);
      const targetProfile = users.get(targetUid)?.profile || {};
      relationOps.push(
        (batch) => batch.set(db.doc(`users/${followerUid}/following/${targetUid}`), publicProfile(targetUid, targetProfile), { merge: true }),
        (batch) => batch.set(db.doc(`users/${targetUid}/followers/${followerUid}`), publicProfile(followerUid, profile), { merge: true }),
      );
    }
  }
  await commit(relationOps, 'follow relations');

  const counterOps = [];
  for (const [uid, data] of users) {
    const listFields = ['lists_want', 'lists_watching', 'lists_watched', 'lists_favorites'];
    const counters = {
      ...(data.counters || {}),
      followersCount: followerCounts.get(uid) || 0,
      followingCount: followingCounts.get(uid) || 0,
      listsCount: listFields.reduce((total, field) => total + (Array.isArray(data[field]) ? data[field].length : 0), 0),
      watchedCount: Array.isArray(data.lists_watched) ? data.lists_watched.length : 0,
    };
    counterOps.push((batch) => batch.set(db.doc(`users/${uid}`), { counters }, { merge: true }));
  }
  await commit(counterOps, 'profile counters');
  report.tasks.profiles = { users: users.size, relations: relationOps.length / 2 };
}

function newestRatingByUser(reviews) {
  const ratings = new Map();
  reviews.filter((review) => Number(review.rating) > 0 && (review.authorUid || review.uid))
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
    .forEach((review) => ratings.set(review.authorUid || review.uid, review));
  return ratings;
}

async function migrateReviews() {
  let titles = 0;
  let reviewsCount = 0;
  const commentsByUid = new Map();
  const ratingsByUid = new Map();
  for await (const docs of pages(db.collection('reviews'), 'reviews')) {
    for (const titleDoc of docs) {
      titles += 1;
      const titleKey = titleDoc.id;
      const legacy = Array.isArray(titleDoc.data().items) ? titleDoc.data().items : [];
      const modern = [];
      for await (const entries of pages(titleDoc.ref.collection('items'), `reviews-items-${titleKey}`)) {
        entries.forEach((entry) => modern.push({ id: entry.id, ...entry.data() }));
      }
      const unique = new Map(modern.map((review) => [review.id, review]));
      legacy.forEach((review, index) => unique.set(review.id || `legacy_${index}`, { ...review, id: review.id || `legacy_${index}` }));
      const reviews = Array.from(unique.values());
      reviewsCount += reviews.length;
      reviews.forEach((review) => {
        const uid = review.authorUid || review.uid;
        if (uid) commentsByUid.set(uid, (commentsByUid.get(uid) || 0) + 1);
      });
      const operations = reviews.map((review) => (batch) => batch.set(
        titleDoc.ref.collection('items').doc(review.id),
        { ...review, authorUid: review.authorUid || review.uid || '' },
        { merge: true },
      ));
      const ratings = newestRatingByUser(reviews);
      const distribution = {};
      let sum = 0;
      for (const [uid, review] of ratings) {
        ratingsByUid.set(uid, (ratingsByUid.get(uid) || 0) + 1);
        const rating = Math.max(1, Math.min(10, Math.round(Number(review.rating))));
        sum += rating;
        distribution[String(rating)] = (distribution[String(rating)] || 0) + 1;
        operations.push((batch) => batch.set(db.doc(`ratings/${titleKey}/userRatings/${uid}`), {
          titleId: titleKey,
          authorUid: uid,
          rating,
          sourceReviewId: review.id,
          createdAt: review.date || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }));
      }
      operations.push((batch) => batch.set(db.doc(`ratingSummaries/${titleKey}`), {
        titleId: titleKey,
        total: ratings.size,
        sum,
        average: ratings.size ? Number((sum / ratings.size).toFixed(3)) : 0,
        distribution,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
      await commit(operations, `reviews ${titleKey}`);
    }
  }
  const counterOps = Array.from(new Set([...commentsByUid.keys(), ...ratingsByUid.keys()])).map((uid) => (batch) => batch.set(
    db.doc(`users/${uid}`),
    { counters: { commentsCount: commentsByUid.get(uid) || 0, ratingsCount: ratingsByUid.get(uid) || 0 } },
    { merge: true },
  ));
  await commit(counterOps, 'review counters');
  report.tasks.reviews = { titles, reviews: reviewsCount, ratedUsers: ratingsByUid.size };
}

async function migrateActivity() {
  const profileCache = new Map();
  const statsByUid = new Map();
  const rankingByMonthUid = new Map();
  let changed = 0;
  for await (const docs of pages(db.collection('activity'), 'activity')) {
    const operations = [];
    for (const entry of docs) {
      const data = entry.data();
      if (data.uid && data.createdAt) {
        const timestamp = new Date(data.createdAt);
        if (!Number.isNaN(timestamp.getTime())) {
          const date = timestamp.toISOString().slice(0, 10);
          const month = date.slice(0, 7);
          const stats = statsByUid.get(data.uid) || { recentDays: {}, months: {} };
          stats.recentDays[date] ||= { activities: 0, watched: 0 };
          stats.recentDays[date].activities += 1;
          if (data.action === 'watched') stats.recentDays[date].watched += 1;
          stats.months[month] ||= { activities: 0, watched: 0, watchedMinutes: 0 };
          stats.months[month].activities += 1;
          if (data.action === 'watched') {
            stats.months[month].watched += 1;
            stats.months[month].watchedMinutes += 90;
          }
          statsByUid.set(data.uid, stats);

          const rankKey = `${month}:${data.uid}`;
          const rank = rankingByMonthUid.get(rankKey) || {
            month, uid: data.uid, watchedCount: 0, watchedMinutes: 0, reviewsCount: 0,
            name: data.authorName || data.username || '', username: data.authorUsername || data.username || '',
            avatarGradient: data.avatarGradient || '', avatarUrl: data.authorAvatarUrl || data.photoUrl || '',
          };
          if (data.action === 'watched') { rank.watchedCount += 1; rank.watchedMinutes += 90; }
          if (data.action === 'reviewed') rank.reviewsCount += 1;
          rankingByMonthUid.set(rankKey, rank);
        }
      }
      if (data.authorName && data.authorUsername && data.titleId) { report.skipped += 1; continue; }
      let profile = profileCache.get(data.uid);
      if (!profile && data.uid) {
        const user = await db.doc(`users/${data.uid}`).get();
        report.reads += 1;
        profile = user.data()?.profile || {};
        profileCache.set(data.uid, profile);
      }
      const patchData = {
        userId: data.uid || '',
        authorName: profile?.name || data.username || '',
        authorUsername: profile?.username || data.username || '',
        authorAvatarUrl: profile?.avatarThumbImage || profile?.avatarImage || data.photoUrl || '',
        titleId: data.titleId || data.titleKey || '',
        titleType: data.titleType || (String(data.titleKey).startsWith('tv_') ? 'tv' : String(data.titleKey).startsWith('ep_') ? 'episode' : 'movie'),
        titleImageUrl: data.titleImageUrl ?? data.poster ?? null,
      };
      operations.push((batch) => batch.set(entry.ref, patchData, { merge: true }));
      changed += 1;
    }
    await commit(operations, 'activity');
  }
  const aggregateOps = [];
  for (const [uid, stats] of statsByUid) {
    const recentKeys = Object.keys(stats.recentDays).sort().slice(-42);
    const monthKeys = Object.keys(stats.months).sort().slice(-12);
    aggregateOps.push((batch) => batch.set(db.doc(`userStats/${uid}`), {
      uid,
      recentDays: Object.fromEntries(recentKeys.map((key) => [key, stats.recentDays[key]])),
      months: Object.fromEntries(monthKeys.map((key) => [key, stats.months[key]])),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  for (const rank of rankingByMonthUid.values()) {
    aggregateOps.push((batch) => batch.set(db.doc(`rankingMonthly/${rank.month}/entries/${rank.uid}`), {
      ...rank,
      score: Number((rank.watchedMinutes / 60 + rank.reviewsCount * 3).toFixed(2)),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await commit(aggregateOps, 'user stats and ranking');
  report.tasks.activity = { changed, userStats: statsByUid.size, rankingEntries: rankingByMonthUid.size };
}

function decodeDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  return match ? Buffer.from(match[2], 'base64') : null;
}

async function migrateImages() {
  let sharp;
  try { sharp = (await import('sharp')).default; } catch {
    throw new Error('A tarefa images requer `npm install --save-dev sharp`. Execute primeiro no ambiente de migração.');
  }
  const bucket = getStorage().bucket();
  if (!bucket.name) throw new Error('Defina FIREBASE_STORAGE_BUCKET antes da migração de imagens.');
  let migrated = 0;
  for await (const docs of pages(db.collection('users'), 'images')) {
    for (const entry of docs) {
      const profile = entry.data().profile || {};
      const avatar = decodeDataUrl(profile.avatarImage);
      const cover = decodeDataUrl(profile.coverImage);
      if (!avatar && !cover) { report.skipped += 1; continue; }
      const patchData = {};
      const uploadedPaths = [];
      for (const [kind, input] of [['avatar', avatar], ['cover', cover]]) {
        if (!input) continue;
        const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
        const token = randomUUID();
        const path = `users/${entry.id}/${kind}/legacy-${hash}.webp`;
        const main = kind === 'avatar'
          ? await sharp(input).rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
          : await sharp(input).rotate().resize(1600, 1000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
        if (apply) await retry(() => bucket.file(path).save(main, {
          resumable: false,
          contentType: 'image/webp',
          metadata: { cacheControl: 'public,max-age=31536000,immutable', metadata: { ownerUid: entry.id, firebaseStorageDownloadTokens: token } },
        }), `image ${entry.id}/${kind}`);
        uploadedPaths.push(path);
        patchData[`${kind}Image`] = url;
        if (kind === 'avatar') {
          const thumbPath = `users/${entry.id}/avatar/legacy-${hash}-thumb.webp`;
          const thumbToken = randomUUID();
          const thumb = await sharp(input).rotate().resize(256, 256, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
          if (apply) await retry(() => bucket.file(thumbPath).save(thumb, {
            resumable: false,
            contentType: 'image/webp',
            metadata: { cacheControl: 'public,max-age=31536000,immutable', metadata: { ownerUid: entry.id, firebaseStorageDownloadTokens: thumbToken } },
          }), `image ${entry.id}/avatar-thumb`);
          patchData.avatarThumbImage = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(thumbPath)}?alt=media&token=${thumbToken}`;
          uploadedPaths.push(thumbPath);
        }
      }
      await commit([(batch) => batch.set(entry.ref, { profile: { ...profile, ...patchData } }, { merge: true })], `image profile ${entry.id}`);
      report.writes += uploadedPaths.length;
      migrated += 1;
    }
  }
  report.tasks.images = { users: migrated };
}

async function migrateMetrics() {
  const [users, activity, reviews, ratings, reports, appNotifications, openedAppNotifications, notifications, jobs] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('activity').count().get(),
    db.collectionGroup('items').count().get(),
    db.collectionGroup('userRatings').count().get(),
    db.collection('reports').count().get(),
    db.collection('app_notifications').count().get(),
    db.collection('app_notifications').where('read', '==', true).count().get(),
    db.collection('notifications').count().get(),
    db.collection('notification_jobs').where('status', '==', 'pending').count().get(),
  ]);
  report.reads += 9;
  const [pro, openReports] = await Promise.all([
    db.collection('users').where('profile.proMember', '==', true).count().get(),
    db.collection('reports').where('status', 'in', ['open', 'in_review']).count().get(),
  ]);
  report.reads += 2;
  const metrics = {
    usersTotal: users.data().count,
    proMembersTotal: pro.data().count,
    activityTotal: activity.data().count,
    reviewsTotal: reviews.data().count,
    commentsTotal: reviews.data().count,
    ratingsTotal: ratings.data().count,
    reportsTotal: reports.data().count,
    openReportsTotal: openReports.data().count,
    notificationsTotal: appNotifications.data().count + notifications.data().count,
    appNotificationsTotal: appNotifications.data().count,
    appNotificationsOpenedTotal: openedAppNotifications.data().count,
    pendingJobsTotal: jobs.data().count,
    updatedAt: FieldValue.serverTimestamp(),
    backfilledAt: FieldValue.serverTimestamp(),
  };
  await commit([(batch) => batch.set(db.doc('metrics/global'), metrics, { merge: true })], 'global metrics');
  report.tasks.metrics = metrics;
}

if (tasks.has('profiles')) await migrateProfiles();
if (tasks.has('reviews')) await migrateReviews();
if (tasks.has('activity')) await migrateActivity();
if (tasks.has('images')) await migrateImages();
if (tasks.has('metrics')) await migrateMetrics();

console.log(JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2));
if (!apply) console.log('\nDRY-RUN: nenhum documento foi alterado. Use --apply somente após validar o relatório em ambiente de teste.');

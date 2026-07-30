#!/usr/bin/env node

/**
 * Reconciles legacy episode history into users/{uid}/seasonProgress.
 *
 * Safe by default:
 *   npm run migrate:season-progress:dry
 *   npm run migrate:season-progress:dry -- --uid=<uid>
 *   npm run migrate:season-progress:apply -- --uid=<uid>
 *
 * Guarantees:
 * - dry-run unless --apply is explicit;
 * - deterministic document ids, so retries are idempotent;
 * - union/deduplication keeps the most advanced valid state;
 * - no legacy document is deleted;
 * - apply writes a backup before canonical records and the migration marker.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const option = (name) => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const onlyUid = option('--uid') || '';
const batchSize = Math.min(200, Math.max(10, Number(option('--batch-size')) || 100));
const runId = new Date().toISOString().replace(/[:.]/g, '-');

async function credential() {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  return path
    ? cert(JSON.parse(await readFile(resolve(path), 'utf8')))
    : applicationDefault();
}

if (!getApps().length) initializeApp({ credential: await credential() });
const db = getFirestore();

const report = {
  mode: apply ? 'apply' : 'dry-run',
  runId,
  usersRead: 0,
  usersChanged: 0,
  canonicalRead: 0,
  canonicalWritten: 0,
  backupsWritten: 0,
  skipped: 0,
  ambiguous: [],
  errors: [],
};

const uniqueEpisodes = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0),
)).sort((a, b) => a - b);

const progressId = (seriesId, seasonNumber) => `${seriesId}_s${seasonNumber}`;

function normalizeRecord(uid, record) {
  const watchedEpisodeNumbers = uniqueEpisodes(record.watchedEpisodeNumbers);
  const episodeDurations = record.episodeDurations && typeof record.episodeDurations === 'object'
    ? record.episodeDurations
    : {};
  const episodeCount = Math.max(0, Number(record.episodeCount) || 0);
  const calculatedMinutes = watchedEpisodeNumbers.reduce(
    (sum, episode) => sum + Math.max(0, Number(episodeDurations[String(episode)]) || 0),
    0,
  );
  const completed = Boolean(record.completedAt)
    || (episodeCount > 0 && watchedEpisodeNumbers.length >= episodeCount);
  return {
    uid,
    seriesId: Number(record.seriesId),
    seasonNumber: Number(record.seasonNumber),
    watchedEpisodeNumbers,
    episodeDurations,
    episodeCount,
    watchedDurationMinutes: Math.max(calculatedMinutes, Number(record.watchedDurationMinutes) || 0),
    completedAt: completed ? (record.completedAt || record.updatedAt || new Date().toISOString()) : null,
    updatedAt: record.updatedAt || new Date().toISOString(),
    source: 'reconciliation',
    schemaVersion: 1,
  };
}

function mergeRecords(uid, current, incoming) {
  const watchedEpisodeNumbers = uniqueEpisodes([
    ...(current?.watchedEpisodeNumbers || []),
    ...(incoming?.watchedEpisodeNumbers || []),
  ]);
  const episodeDurations = {
    ...(current?.episodeDurations || {}),
    ...(incoming?.episodeDurations || {}),
  };
  const episodeCount = Math.max(
    Number(current?.episodeCount) || 0,
    Number(incoming?.episodeCount) || 0,
  );
  const dates = [current?.completedAt, incoming?.completedAt].filter(Boolean).sort();
  return normalizeRecord(uid, {
    ...current,
    ...incoming,
    watchedEpisodeNumbers,
    episodeDurations,
    episodeCount,
    completedAt: dates[0] || null,
    watchedDurationMinutes: Math.max(
      Number(current?.watchedDurationMinutes) || 0,
      Number(incoming?.watchedDurationMinutes) || 0,
    ),
    updatedAt: new Date().toISOString(),
  });
}

function materialSignature(record) {
  if (!record) return null;
  return JSON.stringify({
    uid: record.uid,
    seriesId: record.seriesId,
    seasonNumber: record.seasonNumber,
    watchedEpisodeNumbers: uniqueEpisodes(record.watchedEpisodeNumbers),
    episodeDurations: record.episodeDurations || {},
    episodeCount: Number(record.episodeCount) || 0,
    watchedDurationMinutes: Number(record.watchedDurationMinutes) || 0,
    completedAt: record.completedAt || null,
    schemaVersion: Number(record.schemaVersion) || 0,
  });
}

function legacyRecords(uid, data) {
  const completedSeries = new Set(
    (Array.isArray(data.lists_watched) ? data.lists_watched : [])
      .filter((item) => item?.type === 'tv')
      .map((item) => Number(item.id)),
  );
  const records = [];
  for (const [seriesIdRaw, seasons] of Object.entries(data.ep_watched || {})) {
    for (const [seasonRaw, episodesRaw] of Object.entries(seasons || {})) {
      const seriesId = Number(seriesIdRaw);
      const seasonNumber = Number(seasonRaw);
      const watchedEpisodeNumbers = uniqueEpisodes(episodesRaw);
      if (!(seriesId > 0) || !(seasonNumber > 0) || watchedEpisodeNumbers.length === 0) continue;
      const completed = completedSeries.has(seriesId);
      records.push(normalizeRecord(uid, {
        seriesId,
        seasonNumber,
        watchedEpisodeNumbers,
        // The legacy schema has no catalog count or runtime. A global
        // completed-series state is retained as completion evidence; unknown
        // duration remains zero rather than inventing watch time.
        episodeCount: completed ? watchedEpisodeNumbers.length : 0,
        completedAt: completed ? new Date().toISOString() : null,
        watchedDurationMinutes: 0,
        updatedAt: new Date().toISOString(),
      }));
      if (!completed) {
        report.ambiguous.push({
          uid,
          seriesId,
          seasonNumber,
          reason: 'legacy progress has no episodeCount/runtime; kept as in-progress',
        });
      }
    }
  }
  return records;
}

async function reconcileUser(userDoc) {
  const uid = userDoc.id;
  const userData = userDoc.data();
  const privateHistorySnap = await userDoc.ref.collection('private').doc('history').get();
  const privateHistory = privateHistorySnap.exists
    && privateHistorySnap.data()?.value
    && typeof privateHistorySnap.data().value === 'object'
    ? privateHistorySnap.data().value
    : null;
  const progressSource = {
    ...userData,
    ep_watched: privateHistory || userData.ep_watched || {},
  };
  const canonicalSnap = await userDoc.ref.collection('seasonProgress').get();
  report.canonicalRead += canonicalSnap.size;
  const existingRaw = new Map(canonicalSnap.docs.map((entry) => [
    entry.id,
    entry.data(),
  ]));
  const existing = new Map(canonicalSnap.docs.map((entry) => [
    entry.id,
    normalizeRecord(uid, entry.data()),
  ]));
  const merged = new Map(existing);
  for (const record of legacyRecords(uid, progressSource)) {
    const id = progressId(record.seriesId, record.seasonNumber);
    merged.set(id, mergeRecords(uid, merged.get(id), record));
  }

  const changed = Array.from(merged.entries()).filter(([id, record]) => (
    materialSignature(existingRaw.get(id)) !== materialSignature(record)
  ));
  if (changed.length === 0) {
    report.skipped += 1;
    return;
  }
  report.usersChanged += 1;
  report.canonicalWritten += changed.length;
  if (!apply) return;

  const backupRef = db.collection('seasonProgressMigrationBackups').doc(`${runId}_${uid}`);
  await backupRef.set({
    runId,
    uid,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    canonicalDocumentCount: canonicalSnap.size,
    restoreStrategy: 'restore legacy/source and canonicalBefore/*; canonical migration never deletes source data',
  });
  await backupRef.collection('legacy').doc('source').set({
    ep_watched: progressSource.ep_watched,
    historySource: privateHistory ? 'users/{uid}/private/history' : 'users/{uid}.ep_watched',
    lists_watched: userData.lists_watched || [],
  });
  for (let start = 0; start < canonicalSnap.docs.length; start += batchSize) {
    const backupBatch = db.batch();
    canonicalSnap.docs.slice(start, start + batchSize).forEach((entry) => {
      backupBatch.set(backupRef.collection('canonicalBefore').doc(entry.id), entry.data());
    });
    await backupBatch.commit();
  }
  report.backupsWritten += 2 + canonicalSnap.size;

  for (let start = 0; start < changed.length; start += batchSize) {
    const batch = db.batch();
    changed.slice(start, start + batchSize).forEach(([id, record]) => {
      batch.set(userDoc.ref.collection('seasonProgress').doc(id), record, { merge: true });
    });
    await batch.commit();
  }
  await userDoc.ref.collection('private').doc('migration_state').set({
    seasonProgressV1: true,
    seasonProgressMigratedAt: new Date().toISOString(),
    schemaVersion: 1,
    backupRef: backupRef.path,
  }, { merge: true });
}

try {
  if (onlyUid) {
    const user = await db.collection('users').doc(onlyUid).get();
    report.usersRead = 1;
    if (!user.exists) throw new Error(`user not found: ${onlyUid}`);
    await reconcileUser(user);
  } else {
    let cursor = null;
    while (true) {
      let query = db.collection('users').orderBy(FieldPath.documentId()).limit(batchSize);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      report.usersRead += page.size;
      for (const user of page.docs) {
        try { await reconcileUser(user); }
        catch (error) { report.errors.push({ uid: user.id, error: String(error) }); }
      }
      cursor = page.docs.at(-1);
      if (page.size < batchSize) break;
    }
  }
} catch (error) {
  report.errors.push({ uid: onlyUid || null, error: String(error) });
}

console.log(JSON.stringify(report, null, 2));
if (!apply) {
  console.log('\nDRY-RUN: nenhum documento foi alterado. Revise o relatório antes de usar --apply.');
}
if (report.errors.length > 0) process.exitCode = 1;

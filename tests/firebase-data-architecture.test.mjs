import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public lists use bounded cursor pagination', () => {
  const policy = read('src/lib/dataPolicy.ts');
  const db = read('src/lib/db.ts');
  assert.match(policy, /FIRESTORE_PAGE_SIZE = 20/);
  assert.match(db, /startAfter\(cursor/);
  assert.match(db, /reviews:page/);
  assert.match(db, /activity:page/);
  assert.match(db, /notifications:account-page/);
  assert.match(db, /follow:\$\{kind\}:page/);
});

test('feed, ranking and stats do not rebuild views with broad scans', () => {
  const feed = read('src/app/feed/page.tsx');
  const ranking = read('src/app/ranking/page.tsx');
  const stats = read('src/app/stats/page.tsx');
  const profile = read('src/app/user/[username]/page.tsx');
  assert.doesNotMatch(feed, /getDocs\(collection\(db, ['"]reviews['"]\)\)/);
  assert.doesNotMatch(ranking, /getRecent\([^)]*500|Promise\.all\([\s\S]*getDoc\(doc\(db, ['"]users['"]/);
  assert.match(ranking, /dbRankingStore\.listMonth/);
  assert.match(stats, /dbUserStatsStore\.get/);
  assert.match(profile, /dbUserStatsStore\.get/);
});

test('ratings, follows, metrics and activity aggregates are server-owned', () => {
  const functions = read('functions/index.js');
  const rules = read('firestore.rules');
  assert.match(functions, /aggregateRatingSummary/);
  assert.match(functions, /mirrorFollowCreated/);
  assert.match(functions, /aggregateActivityCreated/);
  assert.match(functions, /incrementMetricsOnce/);
  assert.match(functions, /Math\.max\(0/);
  assert.match(functions, /systemEvents/);
  assert.match(rules, /hasAny\(\['adminAccess', 'accountStatus', 'counters'\]\)/);
  assert.match(rules, /match \/ratingSummaries\/\{titleKey\}/);
  assert.match(rules, /match \/userStats\/\{uid\}/);
  assert.match(rules, /match \/systemEvents\/\{id\}/);
});

test('profile media is WebP in Storage and no longer generated as base64', () => {
  const editor = read('src/app/settings/edit-profile/page.tsx');
  const pro = read('src/app/settings/pro/page.tsx');
  const images = read('src/lib/imageStorage.ts');
  const storageRules = read('storage.rules');
  assert.doesNotMatch(editor, /toDataURL|readAsDataURL|compressImage/);
  assert.doesNotMatch(pro, /toDataURL|readAsDataURL|compressCover/);
  assert.match(images, /image\/webp/);
  assert.match(images, /-thumb\.webp/);
  assert.match(storageRules, /request\.resource\.contentType == 'image\/webp'/);
});

test('Storage stays opt-in while the Firebase project remains on Spark', () => {
  const firebase = read('src/lib/firebase.ts');
  const defaultConfig = read('firebase.json');
  const futureConfig = read('firebase.storage.json');
  const editor = read('src/app/settings/edit-profile/page.tsx');
  assert.match(firebase, /NEXT_PUBLIC_FIREBASE_STORAGE_ENABLED === 'true'/);
  assert.equal(Object.hasOwn(JSON.parse(defaultConfig), 'storage'), false);
  assert.match(futureConfig, /"storage"/);
  assert.match(editor, /editProfile\.storagePending/);
});

test('migration is dry-run by default, bounded, resumable and idempotent', () => {
  const migration = read('scripts/migrations/optimize-firestore.mjs');
  assert.match(migration, /const apply = args\.has\('--apply'\)/);
  assert.match(migration, /limit\(batchSize\)/);
  assert.match(migration, /startAfter\(cursorId\)/);
  assert.match(migration, /\{ merge: true \}/);
  assert.match(migration, /DRY-RUN: nenhum documento foi alterado/);
  assert.doesNotMatch(migration, /\.delete\(\)/);
});

test('automated user scans are paged instead of loading every user at once', () => {
  const functions = read('functions/index.js');
  assert.match(functions, /USER_SCAN_PAGE_SIZE = 100/);
  assert.match(functions, /forEachUserPage/);
  assert.doesNotMatch(functions, /db\.collection\('users'\)\.get\(\)/);
});

test('administrative lists use bounded cursor pages instead of preloading collections', () => {
  const api = read('functions/admin-api.js');
  assert.match(api, /function listQuery/);
  assert.match(api, /startAfter\(cursorDoc\)/);
  assert.match(api, /Math\.min\(Math\.max\(Number\(limit\)/);
  assert.doesNotMatch(api, /limit\((500|1000)\)/);
  assert.match(api, /url\.searchParams\.get\('cursor'\)/);
});

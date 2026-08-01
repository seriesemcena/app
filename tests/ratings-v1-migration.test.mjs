import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('ratingsV1 migration is independent, idempotent and never overwrites cloud ratings', () => {
  const db = read('src/lib/db.ts');
  assert.match(db, /export async function migrateLocalRatingsToFirestore/);
  assert.match(db, /sec_ratings_migrated_v1_\$\{uid\}/);
  assert.match(db, /localStorage\.getItem\(migratedKey\) === fingerprint/);
  assert.match(db, /dbRatingStore\.setIfMissing/);
  assert.match(db, /if \(current\.exists\(\)\) return false/);
  assert.match(db, /localStorage\.setItem\(migratedKey, fingerprint\)/);

  const migrationBlock = db.slice(
    db.indexOf('export async function migrateLocalRatingsToFirestore'),
    db.indexOf('export async function migrateLocalToFirestore'),
  );
  assert.doesNotMatch(
    migrationBlock,
    /migrationSnap\.data\(\)\?\.seasonProgressV1/,
  );
});

test('auth invokes ratingsV1 even when the legacy account migration is already complete', () => {
  const auth = read('src/context/AuthContext.tsx');
  assert.match(auth, /await migrateLocalToFirestore\(db, u\.uid\)/);
  assert.match(
    auth,
    /await migrateLocalRatingsToFirestore\(db, u\.uid, u\.displayName, u\.email\)/,
  );
});

test('signed-in rating screens always accept Firestore empty results as authoritative', () => {
  const stats = read('src/app/stats/page.tsx');
  const ratings = read('src/app/ratings/page.tsx');
  const profile = read('src/app/user/[username]/page.tsx');

  assert.match(stats, /if \(!cancelled\) applyRatings\(ratings\)/);
  assert.doesNotMatch(stats, /ratings\.length > 0\) applyRatings/);
  assert.match(ratings, /if \(!cancelled\) setRecords\(dedupeRatings\(cloud\)\)/);
  assert.doesNotMatch(ratings, /cloud\.length > 0\) setRecords/);
  assert.match(profile, /\.then\(\(ratings\) => setReviewCount\(ratings\.length\)\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('review deletion supports current and legacy Firestore models', async () => {
  const source = await readFile(new URL('src/lib/db.ts', projectRoot), 'utf8');

  assert.match(source, /if \(itemSnap\.exists\(\)\) \{[\s\S]*await deleteDoc\(itemRef\)/);
  assert.match(source, /const legacyItems = \(legacySnap\.data\(\)\?\.items \?\? \[\]\) as Review\[\]/);
  assert.match(source, /await updateDoc\(legacyRef, \{ items: stripUndefined\(updated\) \}\)/);
  assert.match(source, /async delete\(db: Firestore, docId: string\): Promise<void> \{[\s\S]*await deleteDoc\(doc\(db, 'activity', docId\)\)/);
});

test('feed removes both the source review and its activity document', async () => {
  const source = await readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8');

  assert.match(source, /const resolvedReviewId = item\.reviewId \|\| matchedReview\?\.id/);
  assert.match(source, /if \(resolvedReviewId\) \{[\s\S]*await dbRevStore\.remove/);
  assert.match(source, /await dbActivityStore\.deleteForReview/);
  assert.match(source, /revStore\.removeReview\(reviewKey, resolvedReviewId\)/);
});

test('legacy activity matching removes the closest duplicate from the feed', async () => {
  const source = await readFile(new URL('src/lib/db.ts', projectRoot), 'utf8');

  assert.match(source, /async deleteForReview\(db: Firestore, target: ReviewActivityTarget\)/);
  assert.match(source, /\.filter\(\(activity\) => !activity\.reviewId[\s\S]*activity\.action === 'reviewed'/);
  assert.match(source, /if \(legacyMatches\[0\]\) ids\.add\(legacyMatches\[0\]\.docId\)/);
  assert.match(source, /await batch\.commit\(\)/);
});

test('comments page also removes the related feed activity', async () => {
  const source = await readFile(new URL('src/app/comments/page.tsx', projectRoot), 'utf8');

  assert.match(source, /const target = reviews\.find\(review => review\.id === id\)/);
  assert.match(source, /await dbRevStore\.remove\(db, storageKey, id\)/);
  assert.match(source, /await dbActivityStore\.deleteForReview\(db/);
});

test('legacy review moderation is frozen for clients and uses the central API', async () => {
  const rules = await readFile(new URL('firestore.rules', projectRoot), 'utf8');
  const api = await readFile(new URL('functions/admin-api.js', projectRoot), 'utf8');

  assert.match(rules, /match \/reviews\/\{titleKey\}[\s\S]*allow create, update, delete: if false/);
  assert.doesNotMatch(rules, /function isAdmin/);
  assert.match(api, /requirePermission\(actor, 'comments\.delete'\)/);
});

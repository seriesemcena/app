import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const feed = await readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8');

test('feed like is a single heart mirroring the source comment like (no emoji reactions)', () => {
  // Emoji reactions were removed — no picker, no reaction store, no reactors popup.
  assert.doesNotMatch(feed, /EMOJIS|dbReactionStore|reactionStore|showEmojis|myReaction|reactionEntries/);
  // The heart toggles the source review's like and reflects likedBy.
  assert.match(feed, /const toggleLike = \(\) =>/);
  assert.match(feed, /void syncHeartToSourceReview\(next\)/);
  assert.match(feed, /const syncHeartToSourceReview = \(shouldLike: boolean\)/);
  assert.match(feed, /await dbRevStore\.toggleLike\(db, reviewKey, review\.id, user\.uid\)/);
  assert.match(feed, /icon=\{liked \? 'heart' : 'heartO'\}/);
});

test('feed hydrates like state and reply count from the source review', () => {
  assert.match(feed, /setLiked\(!!\(user && exact\.likedBy\?\.includes\(user\.uid\)\)\)/);
  assert.match(feed, /setLikeCount\(exact\.likes \?\? exact\.likedBy\?\.length \?\? 0\)/);
  // Reply count comes from the per-reply subcollection, not the legacy array.
  assert.match(feed, /dbRevStore\.getReplies\(getDB\(\), reviewKey, exact\.id\)/);
});

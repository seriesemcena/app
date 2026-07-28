import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('feed hearts are synchronized with the source comment like', async () => {
  const feed = await readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8');

  assert.match(feed, /const syncHeartToSourceReview = \(shouldLike: boolean\)/);
  assert.match(feed, /const isLiked = !!review\.likedBy\?\.includes\(user\.uid\)/);
  assert.match(feed, /await dbRevStore\.toggleLike\(db, reviewKey, review\.id, user\.uid\)/);
  assert.match(feed, /\(prev === '❤️'\) !== \(nextEmoji === '❤️'\)/);
  assert.match(feed, /syncHeartToSourceReview\(nextEmoji === '❤️'\)/);
});

test('legacy feed hearts are migrated when the card loads', async () => {
  const feed = await readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8');

  assert.match(feed, /mergedMap\[user\.uid\] === '❤️'/);
  assert.match(feed, /syncHeartToSourceReview\(true\)/);
  assert.match(feed, /sourceReviewRef\.current = exact/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('src/app/search/page.tsx', 'utf8');
const store = fs.readFileSync('src/lib/recentSearches.ts', 'utf8');

test('recent searches are synced in the authenticated user private document', () => {
  assert.match(store, /'users', uid, 'private', 'search_history'/);
  assert.match(page, /dbRecentSearchStore\.get\(db, user\.uid\)/);
  assert.match(page, /dbRecentSearchStore\.set\(getDB\(\), user\.uid, next\)/);
  assert.match(page, /dbRecentSearchStore\.clear\(getDB\(\), user\.uid\)/);
});

test('legacy local history is migrated and merged by media type plus TMDB id', () => {
  assert.match(store, /searchedAt: typeof item\.searchedAt === 'number'/);
  assert.match(store, /return `\$\{item\.type\}:\$\{item\.id\}`/);
  assert.match(page, /mergeRecentSearches\(loadRecentSearchesLocal\(\), cloud\)/);
});

test('recent thumbnails keep a skeleton until the definitive poster is resolved', () => {
  assert.match(page, /if \(poster === undefined\)/);
  assert.match(page, /className="img-skeleton"/);
  assert.match(page, /<ImgWithSkeleton src=\{src\}/);
  assert.doesNotMatch(
    page,
    /const src = textlessPosters\[item\.id\] \?\? tmdbImg/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('stats summary cards link ratings and completed series', async () => {
  const stats = await read('src/app/stats/page.tsx');
  assert.match(stats, /router\.push\('\/series\?tab=finalizadas'\)/);
  assert.match(stats, /router\.push\(`\/ratings\?tab=\$\{tab\}&from=stats`\)/);
});

test('series page accepts a finalizadas deep link', async () => {
  const series = await read('src/app/series/page.tsx');
  assert.match(series, /new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/);
  assert.match(series, /requestedTab === 'finalizadas'/);
  assert.match(series, /setTab\(requestedTab\)/);
});

test('ratings page loads account ratings and separates series from movies', async () => {
  const ratings = await read('src/app/ratings/page.tsx');
  assert.match(ratings, /dbRatingStore\.listForUser\(getDB\(\), user\.uid\)/);
  assert.match(ratings, /\^movie_\(\\d\+\)\$/);
  assert.match(ratings, /\^tv_\(\\d\+\)\$/);
  assert.match(ratings, /\^ep_\(\\d\+\)_s\(\\d\+\)_e\(\\d\+\)\$/);
  assert.match(ratings, /titles\.filter\(\(title\) => title\.tab === tab\)/);
  assert.match(ratings, /router\.push\(title\.href\)/);
});

test('userRatings collection-group query is backed by a COLLECTION_GROUP index', async () => {
  // dbRatingStore.listForUser runs collectionGroup('userRatings').where('authorUid', ...),
  // which fails with failed-precondition unless authorUid has a COLLECTION_GROUP index.
  // Without it the stats and ratings pages silently show zeros.
  const indexes = JSON.parse(await read('firestore.indexes.json'));
  const override = (indexes.fieldOverrides ?? []).find(
    (entry) => entry.collectionGroup === 'userRatings' && entry.fieldPath === 'authorUid',
  );
  assert.ok(override, 'missing fieldOverride for userRatings.authorUid');
  const scopes = (override.indexes ?? []).map((idx) => idx.queryScope);
  assert.ok(
    scopes.includes('COLLECTION_GROUP'),
    'authorUid needs a COLLECTION_GROUP index for listForUser',
  );
});

test('ratings page falls back to local reviews when the authoritative query fails', async () => {
  const ratings = await read('src/app/ratings/page.tsx');
  const block = ratings.slice(
    ratings.indexOf('dbRatingStore.listForUser(getDB(), user.uid)'),
    ratings.indexOf('.finally('),
  );
  assert.match(block, /\.catch\(/);
  // Failure only (an empty success still calls .then with []): show local reviews.
  assert.match(block, /if \(!cancelled\) setRecords\(local\)/);
});

test('stats falls back to local reviews when the authoritative ratings query fails', async () => {
  const stats = await read('src/app/stats/page.tsx');
  const block = stats.slice(
    stats.indexOf('dbRatingStore.listForUser(getDB(), user.uid)'),
    stats.indexOf('/* ── Firestore activity ── */'),
  );
  assert.match(block, /\.catch\(/);
  // On failure only (not on an empty success), rebuild ratings from local reviews.
  assert.match(block, /revStore\.getByAuthor\(user\.uid, myName\)/);
  assert.match(block, /review\.rating > 0/);
});

test('stats counts fully-finished series like the finalizadas tab, not just the watched list', async () => {
  const stats = await read('src/app/stats/page.tsx');
  // Series known only through episode progress must be considered, as the Séries page does.
  assert.match(stats, /canonicalProgress\.forEach\(\(record\) => \{/);
  assert.match(stats, /trackedMap\.set\(key,/);
  // The count uses classifySeries === 'finished', not the length of the watched list.
  assert.match(stats, /classifySeries\(catalog, storedRecords\) === 'finished'/);
  assert.match(stats, /if \(isFinished\) finishedSeriesCount \+= 1/);
  assert.match(stats, /watchedCount:finishedSeriesCount/);
});

test('ratings page copy is available in all full locales', async () => {
  for (const locale of ['pt-BR', 'en-US', 'es-ES']) {
    const copy = JSON.parse(await read(`src/locales/${locale}/home.json`));
    assert.ok(copy.ratingsPage?.title);
    assert.ok(copy.ratingsPage?.seriesTab);
    assert.ok(copy.ratingsPage?.moviesTab);
    assert.ok(copy.ratingsPage?.emptySeries);
    assert.ok(copy.ratingsPage?.emptyMovies);
  }
});

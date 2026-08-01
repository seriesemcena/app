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

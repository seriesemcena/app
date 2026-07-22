import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('weekly series releases can enrich IMDb matches without dropping TVMaze fallbacks', () => {
  const proxy = read('src/app/api/tmdb/route.ts');
  const page = read('src/app/streaming/[id]/page.tsx');

  assert.match(proxy, /find\\\/tt\\d/);
  assert.match(page, /if \(!res\.ok\) return show/);
  assert.match(page, /setTvmazeShows\(enriched\)/);
  assert.doesNotMatch(page, /setTvmazeShows\(enriched\.filter/);
});

test('streaming channel matching is exact and covers Apple TV plus MGM in Brazil', () => {
  const page = read('src/app/streaming/[id]/page.tsx');
  const home = read('src/app/home/page.tsx');

  assert.match(page, /function channelMatches/);
  assert.match(page, /return channelMatches\(ch, channelNames\)/);
  assert.match(page, /'350':\s+\['Apple TV\+'/);
  assert.match(page, /'2141':\s+\['MGM\+'/);
  assert.match(page, /'2141': '2141\|2142'/);
  assert.match(home, /id: 2141, name: 'MGM\+'/);
});

test('weekly movie releases use Brazilian digital dates and subscription providers', () => {
  const page = read('src/app/streaming/[id]/page.tsx');

  assert.match(page, /with_watch_monetization_types: 'flatrate'/);
  assert.match(page, /with_release_type: '4\|6'/);
  assert.match(page, /'release_date\.gte': start, 'release_date\.lte': end/);
  assert.match(page, /return \{ start: fmt\(monday\), end: fmt\(sunday\) \}/);
  assert.doesNotMatch(page, /startExtended/);
  assert.doesNotMatch(page, /primary_release_date\.gte/);
});

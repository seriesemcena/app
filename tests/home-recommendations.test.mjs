import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Home recommendations use viewing history instead of only global rankings', async () => {
  const [home, recommendations, tmdb] = await Promise.all([
    read('src/app/home/page.tsx'),
    read('src/lib/personalizedRecommendations.ts'),
    read('src/lib/tmdb.ts'),
  ]);

  assert.match(home, /getPersonalizedRecommendations/);
  assert.match(home, /listStore\.get\('watching'\)/);
  assert.match(home, /listStore\.get\('watched'\)/);
  assert.match(home, /epWatchedStore\.getAll\(\)/);
  assert.match(recommendations, /item\.status === 'watched' \? 3 : 1/);
  assert.match(recommendations, /tmdb\.discover\(type/);
  assert.match(recommendations, /with_genres: preferredIds\.join\('\|'\)/);
  assert.match(recommendations, /!excludedKeys\.has/);
  assert.match(tmdb, /basicTitle:/);
});

test('global top-rated lists remain the safe fallback for accounts without history', async () => {
  const home = await read('src/app/home/page.tsx');

  assert.match(home, /recommendations\?\.tv\.length \? recommendations\.tv : topRatedTV\?\.results/);
  assert.match(home, /recommendations\?\.movie\.length \? recommendations\.movie : topRatedMov\?\.results/);
});

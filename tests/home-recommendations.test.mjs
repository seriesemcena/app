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

test('mobile recommendation grids keep complete pairs after deduplication', async () => {
  const [home, css] = await Promise.all([
    read('src/app/home/page.tsx'),
    read('src/app/globals.css'),
  ]);

  assert.ok(home.indexOf('const uniqueItems') < home.indexOf('uniqueItems.slice(0, limit)'));
  assert.match(home, /limitedItems\.length - \(limitedItems\.length % 2\)/);
  assert.match(home, /const sliced = limitedItems\.slice\(0, evenCount\)/);
  assert.match(css, /\.masonry-cols\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.masonry-cols\s*\{\s*columns:\s*2/);
});

test('recommended sections switch independently between grid and horizontal list', async () => {
  const [home, pt, en, es] = await Promise.all([
    read('src/app/home/page.tsx'),
    read('src/locales/pt-BR/home.json'),
    read('src/locales/en-US/home.json'),
    read('src/locales/es-ES/home.json'),
  ]);

  assert.match(home, /useState<HomeSectionView>\('grid'\)/);
  assert.match(home, /aria-pressed=\{active\}/);
  assert.match(home, /view === 'grid' \|\| !title/);
  assert.match(home, /scrollSnapType:\s*'x mandatory'/);
  assert.match(home, /scrollPaddingInline:\s*16/);
  assert.match(home, /<TMDBGridCard item=\{item\}/);

  for (const locale of [pt, en, es]) {
    const messages = JSON.parse(locale);
    assert.equal(typeof messages.view.grid, 'string');
    assert.equal(typeof messages.view.list, 'string');
    assert.equal(typeof messages.view.label, 'string');
  }
});

test('mobile watchlist cards keep compact single-line season metadata', async () => {
  const home = await read('src/app/home/page.tsx');

  assert.match(home, /<Txt size=\{15\} weight=\{800\} color=\{T\.t1\}/);
  assert.match(
    home,
    /\{t\('season', \{ number: seasonNumber, ns: 'title' \}\)\} · \{t\('episode', \{ number: episodeNumber, ns: 'title' \}\)\}/,
  );
  assert.match(home, /<Txt size=\{12\} weight=\{400\} color=\{T\.t2\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('streaming colors are canonical and persisted legacy colors are normalized', async () => {
  const [palette, expenses, profile] = await Promise.all([
    read('src/lib/streamingPlatforms.ts'),
    read('src/app/expenses/page.tsx'),
    read('src/app/user/[username]/page.tsx'),
  ]);

  assert.match(palette, /prime: '#3798ff'/);
  assert.match(palette, /disney: '#7acde0'/);
  assert.match(palette, /hbo: '#2a6eb5'/);
  assert.match(palette, /globo: '#F61E22'/);
  assert.match(palette, /mgm: '#c2a34c'/);
  assert.match(expenses, /migrateStreamingData/);
  assert.match(expenses, /streamingColor\(migrated\.streamId/);
  assert.match(profile, /streamingColor\(p\.streamId, streamingColor\(p\.name, p\.color\)\)/);
});

test('shared skeletons use theme-aware CSS shimmer and current card shapes', async () => {
  const [css, primitives, loading, feed, posters] = await Promise.all([
    read('src/app/globals.css'),
    read('src/components/primitives.tsx'),
    read('src/components/AppStates.tsx'),
    read('src/app/feed/page.tsx'),
    read('src/components/posters.tsx'),
  ]);

  assert.match(css, /\.ui-skeleton,\s*\.img-skeleton,\s*\.masonry-skeleton/);
  assert.match(css, /--c-skeleton-base: #141417/);
  assert.match(css, /--c-skeleton-highlight: #25252b/);
  assert.match(css, /--c-skeleton-base: #D9D9DF/);
  assert.match(css, /--c-skeleton-highlight: #F2F2F6/);
  assert.match(css, /var\(--c-skeleton-base\) 22%/);
  assert.match(primitives, /className="ui-skeleton"/);
  assert.doesNotMatch(primitives, /setInterval\(\(\) => setPulse/);
  assert.match(loading, /gridTemplateColumns: '34% 1fr'/);
  assert.match(loading, /aspectRatio: '5 \/ 6\.6'/);
  assert.match(feed, /className="img-skeleton"/);
  assert.doesNotMatch(loading, /background: '#121215'|border: '1px solid #29292f'/);
  assert.doesNotMatch(feed, /background: '#121215'|borderTop: '1px solid #29292f'/);
  assert.doesNotMatch(posters, /background: '#121215'|border: '1px solid #29292f'/);
  assert.match(loading, /background: T\.card, border: `1px solid \$\{T\.border\}`/);
  assert.match(posters, /background: T\.card, border: `1px solid \$\{T\.border\}`/);
});

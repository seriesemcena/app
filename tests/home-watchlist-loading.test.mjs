import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Home keeps the watchlist in loading state until auth and Firestore hydration finish', async () => {
  const home = await read('src/app/home/page.tsx');

  assert.match(home, /const \{ user, loading: sessionLoading \} = useAuth\(\)/);
  assert.match(home, /const \[watchingLoading, setWatchingLoading\] = useState\(true\)/);
  assert.match(home, /if \(sessionLoading\) \{\s*setWatchingLoading\(true\);\s*return;/);
  assert.match(home, /window\.addEventListener\('maratonou:sync', refreshWatching\)/);
  assert.match(home, /window\.removeEventListener\('maratonou:sync', refreshWatching\)/);
  assert.match(home, /\{watchingLoading \? \(/);
  assert.ok(
    home.indexOf('{watchingLoading ? (') < home.indexOf(') : watchingItems.length === 0 ? ('),
    'the skeleton must render before the empty state is considered',
  );
  assert.match(home, /aria-label=\{t\('loadingWatching'\)\}/);
});

test('watchlist loading copy exists in every supported locale', async () => {
  const locales = await Promise.all([
    read('src/locales/pt-BR/home.json'),
    read('src/locales/en-US/home.json'),
    read('src/locales/es-ES/home.json'),
  ]);

  for (const locale of locales) {
    assert.equal(typeof JSON.parse(locale).loadingWatching, 'string');
  }
});

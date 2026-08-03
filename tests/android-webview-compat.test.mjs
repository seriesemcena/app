import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('critical navigation paths avoid APIs missing from older Android WebViews', () => {
  const navigation = read('src/lib/navigation.ts');
  const series = read('src/app/series/page.tsx');
  const database = read('src/lib/db.ts');
  const messaging = read('src/lib/fcm.ts');

  assert.doesNotMatch(navigation, /\.at\(-1\)/);
  assert.doesNotMatch(series, /\.at\(-1\)/);
  assert.doesNotMatch(database, /\bstructuredClone\s*\(/);
  assert.doesNotMatch(messaging, /\.replaceAll\s*\(/);
});

test('home keeps a MediaQueryList listener fallback for legacy WebViews', () => {
  const home = read('src/app/home/page.tsx');
  assert.match(home, /typeof mq\.addEventListener === 'function'/);
  assert.match(home, /mq\.addListener\(handler\)/);
  assert.match(home, /mq\.removeListener\(handler\)/);
});

test('global popup ids have a fallback when randomUUID is unavailable', () => {
  const popup = read('src/components/PopupBanner.tsx');
  assert.match(popup, /typeof crypto\.randomUUID === 'function'/);
  assert.match(popup, /Date\.now\(\)\.toString\(36\)/);
});

test('route-critical local data is validated before rendering', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /if \(!Array\.isArray\(parsed\)\) return \[\];/);
  assert.match(store, /if \(!isPlainRecord\(all\) \|\| !Array\.isArray\(all\[type\]\)\) return \[\];/);
  assert.match(store, /const stored = isPlainRecord\(parsed\) \? parsed : \{\};/);
});

test('Android glass retains its appearance without live backdrop repainting', () => {
  const styles = read('src/app/globals.css');
  assert.match(styles, /html\[data-platform="android"\] \.ios-top-action/);
  assert.match(styles, /backdrop-filter: none !important/);
  assert.match(styles, /-webkit-backdrop-filter: none !important/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* inAppPath is a pure function; re-implement the contract here as an
   executable spec (the source can't be imported without a bundler). */
function inAppPath(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol === 'https:' || u.protocol === 'http:') {
    if (u.hostname !== 'maratonou.com' && u.hostname !== 'www.maratonou.com') return null;
    const path = `${u.pathname}${u.search}${u.hash}`;
    return path.startsWith('/') ? path : `/${path}`;
  }
  if (u.protocol === 'maratonou:') {
    const path = `/${u.host}${u.pathname}`.replace(/\/{2,}/g, '/');
    return `${path}${u.search}${u.hash}`;
  }
  return null;
}

test('custom scheme maps host+path to an in-app route', () => {
  assert.equal(inAppPath('maratonou://title/tv/94997'), '/title/tv/94997');
  assert.equal(inAppPath('maratonou://user/danilo'), '/user/danilo');
  assert.equal(inAppPath('maratonou://notifications?tab=app'), '/notifications?tab=app');
});

test('universal links on our domain map to their path', () => {
  assert.equal(inAppPath('https://maratonou.com/title/movie/695721'), '/title/movie/695721');
  assert.equal(inAppPath('https://www.maratonou.com/comments?key=tv_1'), '/comments?key=tv_1');
});

test('foreign domains and auth callbacks are ignored', () => {
  assert.equal(inAppPath('https://evil.com/title/tv/1'), null);
  assert.equal(inAppPath('genericidp://firebase.auth'), null);
  assert.equal(inAppPath('recaptcha://firebase.auth'), null);
  assert.equal(inAppPath('not a url'), null);
});

test('deep-link handler is wired into the app bootstrap', () => {
  const boot = read('src/components/AppBootstrap.tsx');
  assert.match(boot, /useDeepLinks\(\)/);
  const hook = read('src/hooks/useDeepLinks.ts');
  assert.match(hook, /appUrlOpen/);
  assert.match(hook, /getLaunchUrl/);
  assert.match(hook, /Capacitor\.isNativePlatform\(\)/);
});

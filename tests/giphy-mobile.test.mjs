import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const giphy = read('../src/lib/giphy.ts');
const image = read('../src/components/GiphyImage.tsx');
const route = read('../src/app/api/giphy/route.ts');
const serviceWorker = read('../public/sw.js');
const clients = [
  read('../src/app/comments/page.tsx'),
  read('../src/app/add-comment/page.tsx'),
  read('../src/app/title/[type]/[id]/page.tsx'),
];

test('Giphy requests time out, can be aborted and bypass the browser cache', () => {
  assert.match(giphy, /GIPHY_REQUEST_TIMEOUT_MS = 10_000/);
  assert.match(giphy, /signal\?\.addEventListener\('abort', abort/);
  assert.match(giphy, /\{ cache: 'no-store', signal: controller\.signal \}/);
  assert.match(giphy, /if \(!response\.ok\) throw new Error/);
});

test('Giphy images prefer animated WebP and fall back to GIF', () => {
  assert.match(giphy, /fixed_height_small\.webp \|\| gif\.images\.fixed_height_small\.url/);
  assert.match(image, /if \(fallbackUrl && src !== fallbackUrl\) setSrc\(fallbackUrl\)/);
  assert.match(image, /loading=\{eager \? 'eager' : 'lazy'\}/);
  assert.match(image, /decoding="async"/);
});

test('Giphy API returns only the lightweight image fields used by the app', () => {
  assert.match(route, /signal: AbortSignal\.timeout\(8_000\)/);
  assert.match(route, /fixed_height_small:[\s\S]*url,[\s\S]*webp,[\s\S]*width:[\s\S]*height:/);
  assert.match(route, /stale-while-revalidate=300/);
});

test('all GIF composers use the resilient shared loader and image component', () => {
  for (const client of clients) {
    assert.match(client, /fetchGiphyGifs\(/);
    assert.match(client, /<GiphyImage/);
    assert.doesNotMatch(client, /fetch\(`\/api\/giphy/);
    assert.doesNotMatch(client, /src=\{gif\.images\.fixed_height_small\.url\}/);
  }
});

test('the PWA service worker does not cache opaque Giphy CDN responses', () => {
  assert.match(serviceWorker, /images-v5/);
  assert.doesNotMatch(serviceWorker, /hostname\.endsWith\('giphy\.com'\)/);
});

import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('manifest is installable and ships regular plus maskable icons', async () => {
  const manifest = await read('src/app/manifest.ts');

  assert.match(manifest, /start_url:\s*['"]\/['"]/);
  assert.match(manifest, /scope:\s*['"]\/['"]/);
  assert.match(manifest, /display:\s*['"]standalone['"]/);
  assert.match(manifest, /purpose:\s*['"]maskable['"]/);

  await Promise.all([
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
    'public/icons/icon-maskable-512.png',
    'public/icons/apple-touch-icon.png',
  ].map((path) => access(new URL(`../${path}`, import.meta.url))));
});

test('service worker never caches authenticated or API traffic', async () => {
  const worker = await read('public/sw.js');

  assert.match(worker, /headers\.has\(['"]authorization['"]\)/i);
  assert.match(worker, /pathname\.startsWith\(['"]\/api\/['"]\)/);
  assert.match(worker, /request\.mode === ['"]navigate['"]/);
  assert.match(worker, /caches\.match\(OFFLINE_URL\)/);
  assert.match(worker, /notificationclick/);
});

test('mobile shell centralizes viewport, safe areas and keyboard insets', async () => {
  const css = await read('src/app/globals.css');
  const runtime = await read('src/context/AppRuntimeContext.tsx');

  for (const variable of [
    '--safe-area-top',
    '--safe-area-bottom',
    '--content-bottom-inset',
    '--keyboard-offset',
    '--app-height',
  ]) assert.ok(css.includes(variable), `missing ${variable}`);

  assert.match(css, /@supports \(height: 100svh\)/);
  assert.match(css, /@supports \(height: 100dvh\)/);
  assert.match(runtime, /visualViewport/);
  assert.match(runtime, /dataset\.keyboardOpen/);
});

test('Firebase messaging reuses the application service worker', async () => {
  const fcm = await read('src/lib/fcm.ts');
  const compatibilityWorker = await read('public/firebase-messaging-sw.js');

  assert.match(fcm, /register\(['"]\/sw\.js['"]/);
  assert.match(compatibilityWorker, /importScripts\(['"]\/sw\.js['"]\)/);
});

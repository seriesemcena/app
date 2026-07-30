import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('popup banners are managed through RBAC and expose a minimal public projection', async () => {
  const [api, admin, model, rules, storage] = await Promise.all([
    read('functions/admin-api.js'),
    read('apps/admin/src/PopupBannersView.tsx'),
    read('apps/admin/src/admin-model.ts'),
    read('firestore.rules'),
    read('storage.rules'),
  ]);

  assert.match(api, /popup_banners/);
  assert.match(api, /public_popup_banners/);
  assert.match(api, /requirePermission\(actor, 'content\.create'\)/);
  assert.match(api, /requirePermission\(actor, 'content\.update'\)/);
  assert.match(api, /requirePermission\(actor, 'content\.delete'\)/);
  assert.match(api, /requirePermission\(actor, 'content\.publish'\)/);
  assert.match(model, /id: 'popup-banners'/);
  assert.match(admin, /Campanhas pop-up/);
  assert.match(admin, /createImageBitmap/);
  assert.match(admin, /image\/webp/);
  assert.match(rules, /match \/public_popup_banners\/\{id\}[\s\S]*?allow read, write: if false;/);
  assert.match(storage, /match \/admin\/popup-banners\/\{uid\}\/\{fileName\}/);
  assert.match(storage, /request\.resource\.contentType == 'image\/webp'/);
});

test('app selection is lazy, scheduled, audience-aware and measured once per event', async () => {
  const [surface, callable, bootstrap] = await Promise.all([
    read('src/components/PopupBanner.tsx'),
    read('functions/popup-banners.js'),
    read('src/components/AppBootstrap.tsx'),
  ]);

  assert.match(surface, /setTimeout\([\s\S]*?, 800\)/);
  assert.match(surface, /requestIdleCallback/);
  assert.match(surface, /getEligiblePopupBanner/);
  assert.match(surface, /trackPopupBannerEvent/);
  assert.match(surface, /once_day/);
  assert.match(surface, /once_user/);
  assert.match(surface, /every_visit' && event === 'close'/);
  assert.doesNotMatch(surface, /getDocs\(|onSnapshot\(/);
  assert.match(callable, /audienceMatches/);
  assert.match(callable, /startsAt <= now/);
  assert.match(callable, /endsAt > now/);
  assert.match(callable, /orderBy\('priority', 'desc'\)/);
  assert.match(callable, /popup_banner_event_receipts/);
  assert.match(callable, /FieldValue\.increment\(1\)/);
  assert.match(bootstrap, /<PopupBanner\s*\/>/);
});

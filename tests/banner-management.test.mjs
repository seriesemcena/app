import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin banner CRUD publishes only the public projection and records audits', async () => {
  const api = await read('functions/admin-api.js');
  assert.match(api, /app_banners/);
  assert.match(api, /public_banners/);
  assert.match(api, /banners\.create/);
  assert.match(api, /banners\.update/);
  assert.match(api, /banners\.delete/);
  assert.match(api, /UNSAFE_BANNER_HTML/);
});

test('banner drafts stay private while the app can read published projections', async () => {
  const rules = await read('firestore.rules');
  assert.match(rules, /match \/public_banners\/\{id\}[\s\S]*allow read: if true;[\s\S]*allow write: if false;/);
  assert.match(rules, /match \/app_banners\/\{id\}[\s\S]*allow read, write: if false;/);
});

test('HTML banners render in a scriptless sandbox on Home, Search and Profile', async () => {
  const [slot, home, search, profile] = await Promise.all([
    read('src/components/AppBannerSlot.tsx'),
    read('src/app/home/page.tsx'),
    read('src/app/search/page.tsx'),
    read('src/app/user/[username]/page.tsx'),
  ]);
  assert.match(slot, /sandbox=""/);
  assert.match(slot, /script-src 'none'/);
  assert.match(slot, /form-action 'none'/);
  assert.match(home, /<AppBannerSlot page="home"/);
  assert.match(search, /<AppBannerSlot page="search"/);
  assert.match(profile, /<AppBannerSlot page="profile"/);
});

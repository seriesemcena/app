import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('visible membership copy is PRO in every locale', async () => {
  for (const locale of ['pt-BR', 'en-US', 'es-ES']) {
    const settings = JSON.parse(await read(`src/locales/${locale}/settings.json`));
    const home = JSON.parse(await read(`src/locales/${locale}/home.json`));
    const values = JSON.stringify({ settings, home });
    assert.doesNotMatch(values, /\bVIP\b/);
    assert.match(values, /\bPRO\b/);
  }
});

test('PRO settings are private, uid-scoped and cover every requested feature', async () => {
  const [store, db, page] = await Promise.all([
    read('src/lib/store.ts'),
    read('src/lib/db.ts'),
    read('src/app/settings/pro/page.tsx'),
  ]);

  assert.match(store, /PRO_HOME_SECTION_KEYS/);
  assert.match(store, /proSettingsKey = \(uid/);
  assert.match(store, /syncProReminderNotifications/);
  assert.match(db, /'users', uid, 'private', 'pro_settings'/);
  assert.match(page, /proSettings\.profile\.title/);
  assert.match(page, /proSettings\.badges\.title/);
  assert.match(page, /proSettings\.home\.title/);
  assert.match(page, /proSettings\.reminders\.title/);
});

test('Home personalization and PRO profile appearance are applied at render time', async () => {
  const [home, profile, notifications] = await Promise.all([
    read('src/app/home/page.tsx'),
    read('src/app/user/[username]/page.tsx'),
    read('src/app/notifications/page.tsx'),
  ]);

  for (const section of ['hero', 'watching', 'recommendedSeries', 'recommendedMovies', 'streamings', 'news']) {
    assert.match(home, new RegExp(`showSection\\('${section}'\\)`));
  }
  assert.match(profile, /activeProfile\?\.coverImage \|\| proThemeCover/);
  assert.match(profile, /nextProReminder/);
  assert.match(profile, />PRO<\/span>/);
  assert.match(home, /profileStore\.get\(user\.uid\)\.proMember === true/);
  assert.match(notifications, /profileStore\.get\(uid\)\.proMember === true/);
});

test('PRO is opt-in in the prototype and is never inferred from authentication alone', async () => {
  const [store, settings, profile, landing] = await Promise.all([
    read('src/lib/store.ts'),
    read('src/app/settings/page.tsx'),
    read('src/app/user/[username]/page.tsx'),
    read('src/app/vip/page.tsx'),
  ]);

  assert.match(store, /proMember: false/);
  assert.match(settings, /profile\?\.proMember === true/);
  assert.match(profile, /activeProfile\?\.proMember === true/);
  assert.doesNotMatch(settings, /const isPro = !!user/);
  assert.match(landing, /proMember: true/);
});

test('custom reminder lists are grouped, private and safely migrated', async () => {
  const [store, db, page, notifications] = await Promise.all([
    read('src/lib/store.ts'),
    read('src/lib/db.ts'),
    read('src/app/settings/pro/page.tsx'),
    read('src/app/notifications/page.tsx'),
  ]);

  assert.match(store, /type ProCustomList/);
  assert.match(store, /customLists: ProCustomList\[\]/);
  assert.match(store, /customList\?\.notificationsEnabled === false/);
  assert.match(db, /if \(localStorage\.getItem\(proSettingsKey\(uid\)\)\)/);
  assert.match(db, /getOptional\(db: Firestore, uid: string\)/);
  assert.match(page, /toggleListNotifications/);
  assert.match(page, /settings\.customLists\.filter/);
  assert.match(notifications, /setAccountNotifs\(\[\]\)/);
  assert.match(notifications, /cancelled = true/);
});

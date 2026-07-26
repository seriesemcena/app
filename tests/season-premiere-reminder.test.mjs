import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('future seasons replace completion progress with a premiere countdown', () => {
  const page = read('src/app/title/[type]/[id]/page.tsx');
  const helper = read('src/lib/seasonPremiere.ts');

  assert.match(helper, /getSeasonPremiereDate/);
  assert.match(helper, /premiere\.getTime\(\) > today\.getTime\(\)/);
  assert.match(helper, /24 \* 60 \* 60 \* 1000/);
  assert.match(page, /const upcomingSeason = isFutureSeason/);
  assert.match(page, /formatPremiereCountdown\(premiereDate, new Date\(nowMs\)\)/);
  assert.match(page, /tmdbImg\(data\?\.poster_path \|\| posterPath, 'w342'\)/);
  assert.match(page, /\{t\('premieresIn'\)\} \{formattedPremiereDate\}/);
  assert.match(page, /t\('remindPremiere'\)/);
  assert.ok(
    page.indexOf('if (upcomingSeason && premiereDate && premiereAt)')
      < page.indexOf('if (totalCount === 0) return null'),
    'a future season must render before the normal progress fallback',
  );
});

test('premiere reminder is persisted per member, title and season', () => {
  const page = read('src/app/title/[type]/[id]/page.tsx');
  const db = read('src/lib/db.ts');
  const rules = read('firestore.rules');
  const pt = JSON.parse(read('src/locales/pt-BR/title.json'));
  const en = JSON.parse(read('src/locales/en-US/title.json'));
  const es = JSON.parse(read('src/locales/es-ES/title.json'));

  assert.match(page, /dbSeasonPremiereReminderStore\.set/);
  assert.match(page, /dbSeasonPremiereReminderStore\.remove/);
  assert.match(page, /requestPushPermission\(\)/);
  assert.match(page, /initFCM\(getDB\(\), user\.uid\)/);
  assert.match(page, /reminders: true/);
  assert.match(page, /dbPrefsStore\.set\(getDB\(\), user\.uid, nextPrefs\)/);
  assert.match(page, /premiereReminderPushUnavailable/);
  assert.match(page, /aria-pressed=\{reminderEnabled\}/);
  assert.match(db, /users',\s*uid,\s*'seasonReminders'/);
  assert.match(db, /`tv_\$\{tvId\}_s\$\{seasonNumber\}`/);
  assert.match(rules, /match \/seasonReminders\/\{reminderId\}/);
  assert.match(rules, /request\.resource\.data\.uid == uid/);
  assert.equal(typeof pt.premiereReminderPushUnavailable, 'string');
  assert.equal(typeof en.premiereReminderPushUnavailable, 'string');
  assert.equal(typeof es.premiereReminderPushUnavailable, 'string');
});

test('hourly worker delivers a single notification when the 24h reminder is due', () => {
  const functions = read('functions/index.js');
  const indexes = read('firestore.indexes.json');
  const store = read('src/lib/store.ts');
  const auth = read('src/context/AuthContext.tsx');
  const notifications = read('src/app/notifications/page.tsx');

  assert.match(functions, /exports\.sendSeasonPremiereReminders = onSchedule/);
  assert.match(functions, /collectionGroup\('seasonReminders'\)/);
  assert.match(functions, /\.where\('notifyAt', '<=', now\.toISOString\(\)\)/);
  assert.match(functions, /`season-premiere-\$\{reminder\.tvId\}-s\$\{reminder\.seasonNumber\}`/);
  assert.match(functions, /type: 'season_premiere'/);
  assert.match(functions, /enabled: false,\s*notifiedAt:/);
  assert.match(indexes, /"collectionGroup": "seasonReminders"/);
  assert.match(store, /'season_premiere'/);
  assert.match(auth, /'season_premiere'/);
  assert.match(notifications, /season_premiere: 'bell'/);
});

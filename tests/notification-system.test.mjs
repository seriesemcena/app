import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('app inbox removes legacy demo notifications instead of recreating them', () => {
  const page = read('src/app/notifications/page.tsx');
  assert.doesNotMatch(page, /function seedIfEmpty/);
  assert.match(page, /!item\.id\.startsWith\('seed_'\)/);
  assert.match(page, /dbAppNotifStore\.listPage/);
});

test('movie streaming alerts require a verified flatrate provider transition', () => {
  const notifier = read('src/lib/releaseNotifier.ts');
  assert.doesNotMatch(notifier, /data\.release_date/);
  assert.match(notifier, /\/watch\/providers/);
  assert.match(notifier, /\?\.flatrate/);
  assert.match(notifier, /if \(!previous\) return 'none'/);
  assert.match(notifier, /isSelectedProvider/);
});

test('notification preferences are enforced before social notification creation', () => {
  const db = read('src/lib/db.ts');
  assert.match(db, /recipientPrefs\.notifPrefs\?\.\[prefByType\[notif\.type\]\] === false/);
  assert.match(db, /return false/);
});

test('FCM registration and scheduled server workers are wired', () => {
  const auth = read('src/context/AuthContext.tsx');
  const home = read('src/app/home/page.tsx');
  const functions = read('functions/index.js');
  assert.match(auth, /await initFCM\(db, u\.uid\)/);
  assert.match(home, /if \(firebaseConfigured\) return/);
  assert.match(functions, /scanAutomatedNotifications/);
  assert.match(functions, /processNotificationJobs/);
  assert.match(functions, /sendEachForMulticast/);
  assert.match(functions, /app_notifications/);
});

test('admin exposes validated configurable notification templates', () => {
  const admin = `${read('apps/admin/src/App.tsx')}\n${read('apps/admin/src/views.tsx')}`;
  const api = read('functions/admin-api.js');
  const templates = read('src/lib/notificationTemplates.ts');
  assert.match(admin, /Criar rascunho/);
  assert.match(api, /status: 'draft'/);
  assert.match(api, /notifications\.send/);
  assert.match(templates, /validateNotificationTemplate/);
  assert.match(templates, /streaming_available/);
});

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

test('users can permanently clear each notification inbox', () => {
  const page = read('src/app/notifications/page.tsx');
  const db = read('src/lib/db.ts');
  const rules = read('firestore.rules');

  assert.match(page, /clearNotifications/);
  assert.match(page, /window\.confirm\(t\('clearConfirm'\)\)/);
  assert.match(page, /dbNotifStore\.clearAll/);
  assert.match(page, /dbAppNotifStore\.clearAll/);
  assert.match(page, /notifInboxStore\.clear\(uid\)/);
  assert.equal((db.match(/async clearAll\(db: Firestore, uid: string\)/g) ?? []).length, 2);
  assert.match(db, /batch\.delete\(entry\.ref\)/);
  assert.match(rules, /match \/app_notifications\/\{id\}[\s\S]*allow delete: if activeUser\(\)[\s\S]*resource\.data\.recipientId == request\.auth\.uid/);
});

test('notification page keeps the inbox controls and metadata visually clear', () => {
  const page = read('src/app/notifications/page.tsx');

  assert.doesNotMatch(page, /const markAllRead/);
  assert.doesNotMatch(page, /t\('markAll'\)/);
  assert.doesNotMatch(page, /borderBottom: `1px solid \$\{T\.border\}`/);
  assert.match(page, /size=\{11\} weight=\{600\} color=\{T\.t3\}[\s\S]*t\('footer'\)/);
  assert.equal((page.match(/size=\{11\} weight=\{600\} color=\{T\.t2\}/g) ?? []).length, 2);
});

test('notification tabs have breathing room, intrinsic widths and a visible inactive state', () => {
  const page = read('src/app/notifications/page.tsx');

  assert.match(page, /className="notification-tabs-shell"[\s\S]*padding: '12px 16px 0'/);
  assert.match(page, /className="notification-tabs"[\s\S]*role="tablist"/);
  assert.match(page, /className="notification-tab"/);
  assert.match(page, /flex: '0 0 auto'/);
  assert.match(page, /width: 'auto'/);
  assert.doesNotMatch(page, /flex: 1, padding: '10px 4px'/);
  assert.match(page, /background: active \? T\.pillActiveBg : T\.surface2/);
});

test('clear action shares the day heading row and notification copy is easier to read', () => {
  const page = read('src/app/notifications/page.tsx');

  assert.match(page, /className="notification-day-heading"/);
  assert.match(page, /alignItems: 'center', justifyContent: 'space-between'/);
  assert.match(page, /headerAction=\{index === 0/);
  assert.doesNotMatch(page, /justifyContent: 'flex-end', padding: '10px 16px 0'/);
  assert.equal((page.match(/<Txt size=\{15\} weight=\{700\} color=\{T\.t1\}/g) ?? []).length, 2);
  assert.match(page, /<Txt size=\{13\} color=\{T\.t3\}/);
});

test('movie streaming alerts require a verified flatrate provider transition', () => {
  const notifier = read('src/lib/releaseNotifier.ts');
  assert.doesNotMatch(notifier, /data\.release_date/);
  assert.match(notifier, /\/watch\/providers/);
  assert.match(notifier, /\?\.flatrate/);
  assert.match(notifier, /if \(!previous\) return 'none'/);
  assert.match(notifier, /isSelectedProvider/);
});

test('notification preferences are enforced server-side before social notification creation', () => {
  const db = read('src/lib/db.ts');
  const functions = read('functions/index.js');
  assert.match(db, /getFirebaseFunctions\(\), 'createSocialNotification'/);
  assert.match(functions, /getPrivateUserValue\([\s\S]*'preferences'[\s\S]*'prefs'/);
  assert.match(
    functions,
    /recipientPreferences\?\.notifPrefs\?\.\[preferenceByType\[type\]\] === false/,
  );
  assert.match(functions, /return \{ created: false \}/);
});

test('social likes, follows and replies push to the lock screen, not just the inbox', () => {
  const functions = read('functions/index.js');
  // A dedicated helper mirrors the inbox entry to a push without creating a
  // second in-app record (that would duplicate the notification).
  assert.match(functions, /async function pushToUser\(uid, \{ title, body, url, type, eventKey \}\)/);
  assert.match(functions, /function socialPushCopy\(locale, type, actor, context\)/);

  const social = functions.slice(
    functions.indexOf('exports.createSocialNotification'),
    functions.indexOf('async function forEachUserPage'),
  );
  assert.match(social, /await pushToUser\(recipientId, \{/);
  assert.match(social, /socialPushCopy\(recipientPreferences\?\.locale, type, actorProfile, optional\)/);
  // The disabled-preference opt-out must still short-circuit before any push.
  assert.ok(
    social.indexOf('notifPrefs?.[preferenceByType[type]] === false') <
    social.indexOf('await pushToUser'),
    'preference opt-out must return before the push is sent',
  );
  // Copy stays localized to match the in-app strings in notifications.json.
  assert.match(functions, /começou a te seguir/);
  assert.match(functions, /started following you/);
  assert.match(functions, /empezó a seguirte/);
});

test('foreground social pushes are not mirrored into the app inbox and refresh the account tab', () => {
  const auth = read('src/context/AuthContext.tsx');
  const page = read('src/app/notifications/page.tsx');
  // A social push must not be added to the local store (that feeds the app tab)
  // — its canonical home is the Firestore-backed account tab.
  assert.match(auth, /!eventKey\.startsWith\('push-test:'\) && !eventKey\.startsWith\('social:'\)/);
  // The account tab reloads when a social push arrives so the entry shows live.
  assert.match(page, /detail\?\.eventKey\?\.startsWith\('social:'\)\) setAccountLoaded\(false\)/);
});

test('the social push helper reuses invalid-token pruning and high-priority delivery', () => {
  const functions = read('functions/index.js');
  const helper = functions.slice(
    functions.indexOf('async function pushToUser'),
    functions.indexOf('function socialPushCopy'),
  );
  assert.match(helper, /users\/\$\{uid\}\/private\/push/);
  assert.match(helper, /sendEachForMulticast/);
  assert.match(helper, /'apns-priority': '10'/);
  assert.match(helper, /messaging\/registration-token-not-registered/);
  assert.match(helper, /tokens: tokens\.filter\(\(token\) => !invalid\.includes\(token\)\)/);
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

test('push diagnostics cover foreground presentation and authenticated delivery', () => {
  const bootstrap = read('src/components/AppBootstrap.tsx');
  const alert = read('src/components/PushAlert.tsx');
  const auth = read('src/context/AuthContext.tsx');
  const settings = read('src/app/settings/notifications/page.tsx');
  const fcm = read('src/lib/fcm.ts');
  const functions = read('functions/index.js');

  assert.match(bootstrap, /<PushAlert \/>/);
  assert.match(alert, /addEventListener\('maratonou:push'/);
  assert.match(auth, /new CustomEvent\('maratonou:push'/);
  assert.match(settings, /sendPushTest/);
  assert.match(settings, /testAccepted/);
  assert.match(fcm, /'sendTestPush'/);
  assert.match(functions, /exports\.sendTestPush = onCall/);
  assert.match(functions, /request\.auth\?\.uid/);
  assert.match(functions, /users\/\$\{uid\}\/private\/push/);
  assert.match(functions, /notification_test_limits/);
});

test('admin pushes open and refresh the app notification inbox', () => {
  const page = read('src/app/notifications/page.tsx');
  const db = read('src/lib/db.ts');
  const functions = read('functions/index.js');
  const auth = read('src/context/AuthContext.tsx');

  assert.match(functions, /link: job\.link \|\| '\/notifications\?tab=app'/);
  assert.match(page, /useSearchParams/);
  assert.match(page, /searchParams\.get\('tab'\) === 'app'/);
  assert.match(page, /addEventListener\('maratonou:push', refresh\)/);
  assert.match(page, /addEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(page, /addEventListener\('pageshow', refresh\)/);
  assert.match(page, /loadError\.title/);
  assert.match(auth, /notifInboxStore\.add/);
  assert.match(auth, /detail: \{ title, body, url, eventKey, type \}/);
  assert.match(functions, /data: \{ url: pushUrl, eventKey, type:/);
  assert.match(read('public/sw.js'), /candidate\.searchParams\.set\('tab', 'app'\)/);

  const appStore = db.slice(
    db.indexOf('export const dbAppNotifStore'),
    db.indexOf('// ── FCM Tokens'),
  );
  assert.doesNotMatch(appStore, /catch\s*\{\s*return \{ items: \[\]/);
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

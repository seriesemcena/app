import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin is a separate build and the legacy page only redirects', () => {
  const legacy = read('src/app/admin/page.tsx');
  const page = read('apps/admin/src/App.tsx');
  const views = read('apps/admin/src/views.tsx');
  const packageFile = JSON.parse(read('apps/admin/package.json'));
  assert.match(legacy, /redirect\(process\.env\.ADMIN_APP_URL/);
  assert.doesNotMatch(legacy, /AdminShell|firebase-admin|use client/);
  assert.doesNotMatch(`${page}${views}`, /SEED_|MockUser|firebase-admin/);
  assert.match(page, /maratonou-admin-theme/);
  assert.equal(packageFile.scripts.build, 'tsc -b && vite build');
});

test('central API authenticates and authorizes every admin resource on the server', () => {
  const legacy = read('src/app/api/admin/[...segments]/route.ts');
  const api = read('functions/admin-api.js');
  assert.match(legacy, /status: 410/);
  assert.match(api, /requireCloudflareAccess/);
  assert.match(api, /CLOUDFLARE_ACCESS_ENFORCEMENT/);
  assert.match(api, /verifyAppCheck/);
  assert.match(api, /verifyIdToken\(match\[1\], true\)/);
  assert.match(api, /adminUsers\/\$\{decoded\.uid\}/);
  assert.match(api, /requirePermission/);
  assert.match(api, /ADMIN_SESSION_STALE/);
});

test('sensitive user and moderation operations create audit logs', () => {
  const api = read('functions/admin-api.js');
  assert.match(api, /writeAudit\(actor, req, requestIdValue, 'comments\.delete'/);
  assert.match(api, /writeAudit\(actor, req, requestIdValue, 'admins\.create'/);
  assert.match(api, /writeAudit\(actor, req, requestIdValue, 'admins\.update'/);
  assert.match(api, /writeAudit\(actor, req, requestIdValue, 'notifications\.send'/);
});

test('browser rules prevent users from granting themselves admin access', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /hasAny\(\['adminAccess', 'accountStatus', 'counters'\]\)/);
  assert.match(rules, /match \/adminUsers\/\{uid\}/);
  assert.match(rules, /match \/auditLogs\/\{id\}/);
  assert.match(rules, /allow read, write: if false/);
});

test('admin UI has explicit loading, error, empty and destructive confirmation states', () => {
  const app = `${read('apps/admin/src/App.tsx')}\n${read('apps/admin/src/views.tsx')}\n${read('apps/admin/src/components.tsx')}`;
  assert.match(app, /LoadingTable/);
  assert.match(app, /ErrorBox/);
  assert.match(app, /Nenhum registro encontrado/);
  assert.match(app, /expected="EXCLUIR"/);
  assert.match(app, /idempotencyKey/);
});

test('metrics disclose unavailable instrumentation instead of fabricating values', () => {
  const dashboard = read('functions/admin-api.js');
  assert.match(dashboard, /metricSnap\.exists/);
  assert.match(dashboard, /unavailable/);
  assert.doesNotMatch(dashboard, /Math\.random|mock|dummy/i);
});

test('global settings are consumed by registration, feature gates and notifications', () => {
  const context = read('src/context/AppSettingsContext.tsx');
  const bootstrap = read('src/components/AppBootstrap.tsx');
  const auth = read('src/hooks/useAuth.ts');
  const functions = read('functions/index.js');
  assert.match(context, /config', 'app_settings/);
  assert.match(bootstrap, /maintenanceMode/);
  assert.match(bootstrap, /commentsEnabled/);
  assert.match(auth, /registrationsEnabled/);
  assert.match(functions, /appSettings\?\.defaultRegion/);
});

test('content overrides affect the real TMDB proxy without exposing credentials', () => {
  const tmdb = read('src/app/api/tmdb/route.ts');
  assert.match(tmdb, /applyContentOverrides/);
  assert.match(tmdb, /content_overrides/);
  assert.match(tmdb, /visibility !== 'hidden'/);
  assert.match(tmdb, /localOverview/);
});

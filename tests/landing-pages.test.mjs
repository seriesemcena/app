import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin landing-page CRUD keeps drafts private and audits every mutation', async () => {
  const api = await read('functions/admin-api.js');
  assert.match(api, /app_pages/);
  assert.match(api, /public_pages/);
  assert.match(api, /pages\.create/);
  assert.match(api, /pages\.update/);
  assert.match(api, /pages\.delete/);
  assert.match(api, /PAGE_SLUG_EXISTS/);
  assert.match(api, /UNSAFE_PAGE_HTML/);
  assert.match(api, /UNSAFE_PAGE_CSS/);
});

test('only the published landing-page projection is readable by the app', async () => {
  const rules = await read('firestore.rules');
  assert.match(rules, /match \/public_pages\/\{slug\}[\s\S]*allow read: if true;[\s\S]*allow write: if false;/);
  assert.match(rules, /match \/app_pages\/\{id\}[\s\S]*allow read, write: if false;/);
});

test('admin exposes landing-page authoring, preview, publishing and deletion', async () => {
  const [app, model, views] = await Promise.all([
    read('apps/admin/src/App.tsx'),
    read('apps/admin/src/admin-model.ts'),
    read('apps/admin/src/views.tsx'),
  ]);
  assert.match(model, /id: 'pages'/);
  assert.match(app, /<PagesView actor=\{actor\} search=\{search\}/);
  assert.match(views, /function PagesView/);
  assert.match(views, /Pré-visualização/);
  assert.match(views, /status[^]*published/);
  assert.match(views, /confirmation: 'EXCLUIR'/);
});

test('published landing pages render by slug inside a scriptless sandbox', async () => {
  const route = await read('src/app/pages/[slug]/page.tsx');
  assert.match(route, /public_pages/);
  assert.match(route, /script-src 'none'/);
  assert.match(route, /connect-src 'none'/);
  assert.match(route, /form-action 'none'/);
  assert.match(route, /allow-top-navigation-by-user-activation/);
  assert.doesNotMatch(route, /dangerouslySetInnerHTML/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('reports persist structured content references for every supported target', async () => {
  const [model, sheet, comments, feed, profile, title, rules] = await Promise.all([
    read('src/lib/db.ts'),
    read('src/components/ReportSheet.tsx'),
    read('src/app/comments/page.tsx'),
    read('src/app/feed/page.tsx'),
    read('src/app/user/[username]/page.tsx'),
    read('src/app/title/[type]/[id]/page.tsx'),
    read('firestore.rules'),
  ]);

  for (const field of ['contentType', 'contentId', 'parentContentId', 'reportedUserId', 'titleId']) {
    assert.match(model, new RegExp(field));
    assert.match(sheet, new RegExp(field));
  }
  assert.match(comments, /contentType:\s*'comment'/);
  assert.match(comments, /contentType:\s*'reply'/);
  assert.match(feed, /contentType:\s*'comment'/);
  assert.match(profile, /contentType:\s*'profile'/);
  assert.match(title, /contentType:\s*isTV\s*\?\s*'series'\s*:\s*'movie'/);
  assert.match(rules, /'comment', 'reply', 'profile', 'movie', 'series', 'other'/);
});

test('admin resolves the reported content and handles removed content explicitly', async () => {
  const [api, view] = await Promise.all([
    read('functions/admin-api.js'),
    read('apps/admin/src/views.tsx'),
  ]);

  assert.match(api, /async function resolveReportedContent/);
  assert.match(api, /reports\/\$\{reportId\}/);
  assert.match(api, /reviews\/\$\{titleKey\}\/items\/\$\{reviewId\}/);
  assert.match(api, /Conteúdo indisponível ou removido/);
  assert.match(api, /action === 'content'/);
  assert.match(view, /Ver conteúdo denunciado/);
  assert.match(view, /Abrir contexto no app/);
  assert.match(view, /Conteúdo indisponível ou removido/);
});

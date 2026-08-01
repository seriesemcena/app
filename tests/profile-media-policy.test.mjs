import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('regular members select synchronized covers from their Watching series', () => {
  const editor = read('src/app/settings/edit-profile/page.tsx');
  const profile = read('src/app/user/[username]/page.tsx');

  assert.match(editor, /listStore\.get\('watching'\)/);
  assert.match(editor, /tmdb\.tvDetail/);
  assert.match(editor, /selectWatchingCover/);
  assert.match(editor, /coverImage: cover\.image/);
  assert.match(profile, /activeProfile\?\.coverImage \|\| proThemeCover/);
});

test('custom covers and animated avatars are exposed only to PRO members', () => {
  const editor = read('src/app/settings/edit-profile/page.tsx');
  const images = read('src/lib/imageStorage.ts');

  assert.match(editor, /profile\.proMember && \(/);
  assert.match(editor, /image\/jpeg,image\/webp,image\/gif/);
  assert.match(editor, /coverUploadProOnly/);
  assert.match(images, /PRO_AVATAR_TYPES/);
  assert.match(images, /Fotos de perfil em GIF são exclusivas para membros PRO/);
});


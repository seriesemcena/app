import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('profile editor replaces Letterboxd with TikTok', () => {
  const editor = read('src/app/settings/edit-profile/page.tsx');

  assert.match(editor, /key: 'tiktok'/);
  assert.match(editor, /label: 'TikTok'/);
  assert.match(editor, /placeholder: '@seutiktok'/);
  assert.doesNotMatch(editor, /Letterboxd|letterboxd/);
});

test('profile persistence uses TikTok across local and Firestore defaults', () => {
  const store = read('src/lib/store.ts');
  const db = read('src/lib/db.ts');

  assert.match(store, /social: \{ instagram: string; twitter: string; tiktok: string \}/);
  assert.match(store, /social: \{ \.\.\.PROFILE_DEFAULT\.social, \.\.\.\(stored\?\.social \?\? \{\}\) \}/);
  assert.match(db, /social: \{ \.\.\.PROFILE_DEFAULT\.social, \.\.\.\(profile\.social \?\? \{\}\) \}/);
  assert.doesNotMatch(store, /letterboxd/);
  assert.doesNotMatch(db, /letterboxd/);
});

test('TikTok profile label exists in every supported language', () => {
  for (const locale of ['pt-BR', 'en-US', 'es-ES']) {
    const copy = JSON.parse(read(`src/locales/${locale}/profile.json`));
    assert.equal(copy.tiktok, 'TikTok');
    assert.equal(copy.letterboxd, undefined);
  }
});

test('profile editor does not expose the avatar color picker', () => {
  const editor = read('src/app/settings/edit-profile/page.tsx');

  assert.doesNotMatch(editor, /const GRADIENTS/);
  assert.doesNotMatch(editor, /editProfile\.avatarColor/);
  assert.doesNotMatch(editor, /GRADIENTS\.map/);
  assert.match(editor, /profile\.avatarGradient/);
});

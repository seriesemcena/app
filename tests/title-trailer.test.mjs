import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const helper = fs.readFileSync(new URL('../src/lib/titleVideos.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/app/title/[type]/[id]/page.tsx', import.meta.url), 'utf8');
const tmdb = fs.readFileSync(new URL('../src/lib/tmdb.ts', import.meta.url), 'utf8');

test('title menu opens a TMDB trailer instead of switching tabs', () => {
  assert.match(page, /const trailerUrl = titleVideoUrl\(trailer\)/);
  assert.match(page, /navigateTo\(router, trailerUrl\)/);
  assert.match(page, /label: t\('viewTrailer'\),\s+action: openTrailer/);
  assert.doesNotMatch(page, /label: t\('viewTrailer'\),\s+action: \(\) => \{ setTab\('whereToWatch'\)/);
});

test('TMDB video selection prioritizes official trailers and supports safe video hosts', () => {
  assert.match(helper, /type === 'trailer'/);
  assert.match(helper, /video\.official/);
  assert.match(helper, /site === 'youtube' \|\| site === 'vimeo'/);
  assert.match(helper, /https:\/\/www\.youtube\.com\/watch\?v=/);
  assert.match(helper, /https:\/\/vimeo\.com\//);
});

test('title detail falls back to English TMDB videos only when needed', () => {
  assert.match(tmdb, /titleVideos: \(type: 'movie' \| 'tv'/);
  assert.match(page, /if \(!detail \|\| selectTitleTrailer\(detail\.videos\?\.results\)\)/);
  assert.match(page, /tmdb\.titleVideos\(isTV \? 'tv' : 'movie', id\)/);
});

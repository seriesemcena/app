import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(
  new URL('../src/app/home/page.tsx', import.meta.url),
  'utf8',
);
const css = fs.readFileSync(
  new URL('../src/app/globals.css', import.meta.url),
  'utf8',
);

test('home media filters share the transparent segmented tab style', () => {
  assert.equal(
    page.match(/className="title-detail-tabs-shell home-media-tabs-shell"/g)?.length,
    2,
  );
  assert.equal(
    page.match(/className="title-detail-tabs"/g)?.length,
    2,
  );
  assert.match(page, /aria-selected=\{isActive\}/);
  assert.match(page, /title-detail-tab\$\{isActive \? ' is-active' : ''\}/);
  assert.doesNotMatch(page, /className="home-filter-btn"/);

  assert.match(css, /\.home-media-tabs-shell\s*\{[\s\S]*margin:\s*0 0 16px/);
  assert.match(css, /\.title-detail-tabs-shell\s*\{[\s\S]*background:\s*transparent/);
  assert.match(css, /\.title-detail-tab\.is-active\s*\{[\s\S]*linear-gradient/);
});

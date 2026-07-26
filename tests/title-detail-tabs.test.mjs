import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(
  new URL('../src/app/title/[type]/[id]/page.tsx', import.meta.url),
  'utf8',
);
const css = fs.readFileSync(
  new URL('../src/app/globals.css', import.meta.url),
  'utf8',
);

test('title detail tabs use a transparent row with an elevated active segment', () => {
  assert.match(page, /className="title-detail-tabs-shell"/);
  assert.match(page, /className="title-detail-tabs"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab"/);
  assert.match(page, /aria-selected=\{isActive\}/);
  assert.match(page, /title-detail-tab\$\{isActive \? ' is-active' : ''\}/);

  assert.match(css, /\.title-detail-tabs-shell\s*\{[\s\S]*background:\s*transparent/);
  assert.doesNotMatch(css, /\.title-detail-tabs-shell\s*\{[^}]*border-/);
  assert.doesNotMatch(css, /\.title-detail-tabs-shell\s*\{[^}]*box-shadow/);
  assert.match(css, /\.title-detail-tab\s*\{[\s\S]*flex:\s*1 1 0/);
  assert.match(css, /\.title-detail-tab\s*\{[\s\S]*border:\s*0/);
  assert.match(css, /\.title-detail-tab\.is-active\s*\{[\s\S]*linear-gradient/);
});

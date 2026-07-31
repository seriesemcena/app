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
const icon = fs.readFileSync(
  new URL('../src/components/Icon.tsx', import.meta.url),
  'utf8',
);
const iconSprite = fs.readFileSync(
  new URL('../public/icons/streamline-flex-solid.svg', import.meta.url),
  'utf8',
);

test('title detail tabs use a transparent row with content-sized solid segments', () => {
  assert.match(page, /className="title-detail-tabs-shell"/);
  assert.match(page, /className="title-detail-tabs"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab"/);
  assert.match(page, /aria-selected=\{isActive\}/);
  assert.match(page, /title-detail-tab\$\{isActive \? ' is-active' : ''\}/);

  assert.match(css, /\.title-detail-tabs-shell\s*\{[\s\S]*background:\s*transparent/);
  assert.doesNotMatch(css, /\.title-detail-tabs-shell\s*\{[^}]*border-/);
  assert.doesNotMatch(css, /\.title-detail-tabs-shell\s*\{[^}]*box-shadow/);
  assert.match(css, /\.title-detail-tabs\s*\{[\s\S]*gap:\s*8px/);
  assert.match(css, /\.title-detail-tabs\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /\.title-detail-tab\s*\{[\s\S]*width:\s*max-content/);
  assert.match(css, /\.title-detail-tab\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /\.title-detail-tab\s*\{[\s\S]*border:\s*0/);
  assert.match(css, /\.title-detail-tab\.is-active\s*\{[\s\S]*background:\s*var\(--c-title-description-bg\)/);
  assert.match(css, /\[data-theme="light"\] \.title-detail-tab\.is-active\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(page, /background:\s*'var\(--c-title-description-bg\)'/);
  assert.doesNotMatch(css, /\.title-detail-tab\.is-active\s*\{[^}]*linear-gradient/);
});

test('light title hero uses a short background-colored scroll-edge fade and white title', () => {
  assert.match(page, /data-title-hero-tint/);
  assert.match(page, /data-title-light-scroll-edge/);
  assert.match(page, /linear-gradient\(to top, var\(--c-bg\) 0%, color-mix\(in srgb, var\(--c-bg\) 92%, transparent\) 10%/);
  assert.match(page, /height: 112, opacity: 0\.42/);
  assert.match(page, /fontSize: 34, fontWeight: 900, color: '#fff'/);
  assert.match(page, /const heroButtonBackground = isDark[\s\S]*?linear-gradient\(145deg[\s\S]*?'rgba\(255,255,255,0\.90\)'/);
  assert.match(page, /const headerActionBackground = isDark \? 'rgba\(255,255,255,0\.14\)' : 'rgba\(255,255,255,0\.92\)'/);
});

test('title runtime uses the shared clock icon instead of a platform emoji', () => {
  assert.equal((page.match(/<Icon name="clock" size=\{12\}/g) || []).length, 2);
  assert.doesNotMatch(page, /⏱/);
  assert.match(icon, /clock:\s*'fa7-regular-clock'/);
  assert.match(iconSprite, /<symbol id="fa7-regular-clock" viewBox="0 0 512 512">/);
});

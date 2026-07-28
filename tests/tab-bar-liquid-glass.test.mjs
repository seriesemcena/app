import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tabBar = await readFile(
  new URL('../src/components/TabBar.tsx', import.meta.url),
  'utf8',
);

test('shared mobile toolbar renders the liquid glass treatment', () => {
  assert.match(tabBar, /className="tb-pill"/);
  assert.match(tabBar, /blur\(30px\) saturate\(190%\) contrast\(105%\)/);
  assert.match(tabBar, /\.tb-pill::before/);
  assert.match(tabBar, /\.tb-capsule::after/);
});

test('native iOS gets the stronger system-like glass material', () => {
  assert.match(
    tabBar,
    /html\[data-platform="ios"\]\[data-capacitor="true"\] \.tb-pill/,
  );
  assert.match(tabBar, /blur\(38px\) saturate\(210%\) contrast\(108%\)/);
});

test('light toolbar keeps the selected capsule white with dark content', () => {
  assert.match(tabBar, /: 'rgba\(255, 255, 255, 0\.98\)'/);
  assert.match(tabBar, /const activeColor\s+=\s+'#0B0B0D'/);
});

test('selection uses the SwiftUI segmented-control spring animation', () => {
  assert.match(tabBar, /const SPRING\s+=\s+'cubic-bezier\(0\.22, 1\.28, 0\.36, 1\)'/);
  assert.match(tabBar, /@keyframes tb-segment-content-in/);
  assert.match(tabBar, /@keyframes tb-segment-label-in/);
  assert.match(tabBar, /scaleY\(0\.91\)/);
  assert.match(tabBar, /will-change: left, right, transform/);
});

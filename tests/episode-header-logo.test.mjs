import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const episodePage = fs.readFileSync(
  new URL('../src/app/episode/page.tsx', import.meta.url),
  'utf8',
);
const primitives = fs.readFileSync(
  new URL('../src/components/primitives.tsx', import.meta.url),
  'utf8',
);

test('shared app headers hide the centered logo without removing scroll titles', () => {
  assert.match(episodePage, /<GlassHeader[\s\S]*?showLogo=\{false\}/);
  assert.match(episodePage, /showChrome=\{showNavTitle\}/);
  assert.match(episodePage, /navTitle=\{`\$\{episodeCode\}/);
  assert.match(primitives, /showLogo = false/);
  assert.match(primitives, /showChrome = true/);
  assert.match(primitives, /\{showChrome && \(/);
  assert.match(primitives, /children \?\? \(showLogo \? <Logo height=\{22\} \/> : null\)/);
  assert.match(primitives, /height: 'calc\(var\(--app-sticky-header-row-height\) \+ var\(--safe-area-top\)\)'/);
});

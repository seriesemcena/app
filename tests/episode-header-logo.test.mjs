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

test('episode pages hide the centered app logo without removing the scroll title', () => {
  assert.match(episodePage, /<GlassHeader[\s\S]*?showLogo=\{false\}/);
  assert.match(episodePage, /navTitle=\{`\$\{episodeCode\}/);
  assert.match(primitives, /showLogo = true/);
  assert.match(primitives, /showLogo \? \(children \?\? <Logo height=\{22\} \/>\) : null/);
});

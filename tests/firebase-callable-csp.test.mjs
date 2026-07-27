import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nextConfig = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');

test('production CSP permits authenticated Firebase callable functions', () => {
  assert.match(nextConfig, /connect-src[^\n]+https:\/\/\*\.cloudfunctions\.net/);
});

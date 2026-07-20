import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('feed media is compact and preserves its intrinsic aspect ratio', async () => {
  const [component, feed] = await Promise.all([
    readFile(new URL('src/components/SocialCard.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(component, /width: compact \? '61%' : '100%'/);
  assert.match(component, /maxWidth: '100%'/);
  assert.match(component, /height: 'auto'/);
  assert.match(component, /margin: compact \? '0' : undefined/);
  assert.match(feed, /<SocialMedia src=\{mediaSrc\} alt=\{displayLabel\} compact \/>/);
});

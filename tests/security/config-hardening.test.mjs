import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../../', import.meta.url);

test('git ignores Apple signing material and production environment files', async () => {
  const gitignore = await readFile(new URL('.gitignore', projectRoot), 'utf8');
  for (const pattern of ['*.p8', '*.cer', '*.mobileprovision', '.env.production']) {
    assert.match(gitignore, new RegExp(`^${pattern.replaceAll('.', '\\.').replace('*', '\\*')}$`, 'm'));
  }
});

test('admin Vercel deployment applies the required browser security headers', async () => {
  const raw = await readFile(new URL('apps/admin/vercel.json', projectRoot), 'utf8');
  const config = JSON.parse(raw);
  const globalHeaders = Object.fromEntries(
    config.headers
      .find((entry) => entry.source === '/(.*)')
      .headers
      .map(({ key, value }) => [key.toLowerCase(), value]),
  );

  assert.equal(globalHeaders['x-frame-options'], 'DENY');
  assert.equal(globalHeaders['x-content-type-options'], 'nosniff');
  assert.equal(globalHeaders['referrer-policy'], 'no-referrer');
  assert.match(globalHeaders['permissions-policy'], /camera=\(\)/);
  assert.match(globalHeaders['strict-transport-security'], /max-age=31536000/);
  assert.match(globalHeaders['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(globalHeaders['content-security-policy'], /object-src 'none'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('movie review sheet hides the bottom toolbar while its publish action is open', async () => {
  const [titlePage, globalStyles] = await Promise.all([
    readFile(new URL('src/app/title/[type]/[id]/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/globals.css', projectRoot), 'utf8'),
  ]);

  assert.match(titlePage, /if \(!showForm \|\| isTV \|\| reportTarget !== null\) return;/);
  assert.match(titlePage, /document\.documentElement\.dataset\.modalOpen = 'true';/);
  assert.match(titlePage, /delete document\.documentElement\.dataset\.modalOpen;/);
  assert.match(titlePage, /safe-bottom-sheet keyboard-aware-bottom/);
  assert.match(titlePage, /\{t\('publishReview'\)\}/);

  assert.match(
    globalStyles,
    /html\[data-modal-open="true"\] \.tab-bar-wrap\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none !important;/,
  );
});

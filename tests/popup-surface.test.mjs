import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('all bottom-sheet popups use the dedicated darker surface', async () => {
  const [tokens, styles, primitives, reviews, episode, title] = await Promise.all([
    read('src/lib/tokens.ts'),
    read('src/app/globals.css'),
    read('src/components/primitives.tsx'),
    read('src/app/reviews/page.tsx'),
    read('src/app/episode/page.tsx'),
    read('src/app/title/[type]/[id]/page.tsx'),
  ]);

  assert.match(tokens, /popup:\s+'var\(--c-popup\)'/);
  assert.match(styles, /--c-popup:\s+#18181C;/);
  assert.match(styles, /\.safe-bottom-sheet\s*\{[\s\S]*?background:\s*var\(--c-popup\) !important;/);

  for (const source of [primitives, reviews, episode, title]) {
    assert.match(source, /safe-bottom-sheet/);
    assert.match(source, /background:\s*T\.popup/);
  }
});

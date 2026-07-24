import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('app icons are generated from the Maratonou SVG mark', async () => {
  const [generator, source, maskable, androidBackground] = await Promise.all([
    readFile(new URL('scripts/generate-app-icons.mjs', projectRoot), 'utf8'),
    readFile(new URL('public/icons/icon-source.svg', projectRoot), 'utf8'),
    readFile(new URL('public/icons/icon-maskable-source.svg', projectRoot), 'utf8'),
    readFile(new URL('android/app/src/main/res/values/ic_launcher_background.xml', projectRoot), 'utf8'),
  ]);

  assert.match(generator, /public\/Logo Maratonou SVG\.svg/);
  assert.match(source, /fill="#D92FFF"/);
  assert.match(source, /fill="white"/);
  assert.match(maskable, /fill="#0D0D0F"/);
  assert.match(androidBackground, /#0D0D0F/);
});

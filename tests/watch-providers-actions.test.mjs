import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(
  new URL('../src/app/title/[type]/[id]/page.tsx', import.meta.url),
  'utf8',
);

test('watch provider rows do not render rent or purchase action buttons', () => {
  const watchProviders = page.slice(
    page.indexOf('function WatchProvidersTab'),
    page.indexOf('function InformationsTab'),
  );

  assert.match(watchProviders, /regionData\?\.rent/);
  assert.match(watchProviders, /regionData\?\.buy/);
  assert.match(watchProviders, /new Map\(\[\.\.\.flatrate, \.\.\.rent, \.\.\.buy\]/);
  assert.match(watchProviders, /providers\.map/);
  assert.doesNotMatch(watchProviders, /rentBtn|buyBtn/);
  assert.doesNotMatch(watchProviders, /<Btn\b/);
});

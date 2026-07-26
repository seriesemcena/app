import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('episode streaming badge resolves official logos and keeps a text fallback', async () => {
  const platforms = await readFile(new URL('src/lib/streamingPlatforms.ts', projectRoot), 'utf8');
  const primitives = await readFile(new URL('src/components/primitives.tsx', projectRoot), 'utf8');
  const episode = await readFile(new URL('src/app/episode/page.tsx', projectRoot), 'utf8');

  assert.match(platforms, /aliases: \['hbo max', 'hbo', 'max'\], asset: 'hbomax'/);
  assert.match(platforms, /aliases: \['tv globo', 'rede globo', 'globoplay', 'globo'\], asset: 'globoplay'/);
  assert.ok(platforms.includes("return logo ? `/${logo.asset}_logo${dark ? '' : '_black'}.png` : null;"));
  assert.match(primitives, /const logo = streamingLogoAsset\(name, theme === 'dark'\)/);
  assert.match(primitives, /\{logo \? \([\s\S]*?<img src=\{logo\} alt=\{name\}[\s\S]*?: \([\s\S]*?\{name\}/);
  assert.match(primitives, /background: logo \? 'transparent' : T\.surface2/);
  assert.match(primitives, /border: logo \? 'none' : `1px solid \$\{T\.border\}`/);
  assert.match(primitives, /width: 52, height: 24, objectFit: 'contain'/);
  assert.match(episode, /\{network \? <StreamBadge name=\{network\} \/> : null\}/);
  assert.match(episode, /data-episode-hero[\s\S]*?height: 'calc\(334px \+ var\(--safe-area-top\)\)'/);
  assert.match(episode, /marginTop: 'calc\(-56px - var\(--safe-area-top\)\)'[\s\S]*?borderRadius: 0/);
  assert.doesNotMatch(episode, /margin: '8px 16px 0', borderRadius: 20/);
  assert.doesNotMatch(episode, /socialTab|role="tablist"/);
  assert.match(episode, /data-episode-ratings[\s\S]*?\{t\('ratingsTab'\)\}/);
  assert.match(episode, /data-episode-reactions[\s\S]*?\{t\('reactionsTab'\)\}/);
  assert.match(episode, /flexDirection: 'column', gap: 24, marginTop: 18, marginBottom: 24/);
  assert.match(episode, /data-episode-comments-dock[\s\S]*?position: 'absolute'[\s\S]*?bottom: 0/);
  assert.match(episode, /height: 'calc\(92px \+ var\(--interactive-safe-bottom\)\)'/);
  assert.match(episode, /data-episode-overview[\s\S]*?overview\.length > 140/);
  assert.match(episode, /linear-gradient\(to bottom, transparent, \$\{T\.bg\}\)/);
  assert.match(episode, /setOverviewExpanded\(true\)[\s\S]*?\{t\('readMore'\)\}/);
  assert.match(episode, /setOverviewExpanded\(false\)[\s\S]*?\{t\('readLess'\)\}/);
});

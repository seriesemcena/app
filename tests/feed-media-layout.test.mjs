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

test('feed background stays edge-to-edge while its content shares the tabs gutter', async () => {
  const [feed, component] = await Promise.all([
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/components/SocialCard.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(feed, /className="feed-activity-list"[\s\S]*?gap:\s*12\s*\}/);
  assert.doesNotMatch(feed, /className="feed-activity-list"[\s\S]*?padding:\s*'0 16px'/);
  assert.match(component, /padding:\s*edgeToEdge\s*\?\s*16\s*:\s*14/);
});

test('feed separates the comment and places its timestamp beside the options menu', async () => {
  const [feed, component] = await Promise.all([
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/components/SocialCard.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(feed, /top:\s*16,\s*right:\s*16[\s\S]*?<Txt size=\{11\} weight=\{700\} color=\{T\.t2\}[\s\S]*?\{item\.time\}<\/Txt>/);
  assert.match(feed, /name=\{item\.user\}[\s\S]*?time=""/);
  assert.match(feed, /contextOnSecondLine/);
  assert.match(feed, /size=\{12\} weight=\{700\} color=\{T\.t3\}[\s\S]*?lineHeight:\s*'16px'/);
  assert.match(component, /contextOnSecondLine[\s\S]*?alignItems:\s*'baseline'/);
  assert.match(feed, /<div style=\{\{ marginBottom:\s*18 \}\}>/);
  assert.match(feed, /minHeight:\s*spoilerHidden\s*\?\s*86\s*:\s*undefined,\s*marginBottom:\s*18/);
  assert.match(feed, /Menu discreto — canto inferior direito do card[\s\S]*?bottom:\s*44,\s*right:\s*0/);
});

test('clicking non-interactive feed card content opens the same comments route as replies', async () => {
  const [feed, component] = await Promise.all([
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/components/SocialCard.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(feed, /const openComments = \(\) => router\.push\(`\/comments\?key=/);
  assert.match(feed, /<SocialCard dimmed=\{deleting\} edgeToEdge onClick=\{openComments\}>/);
  assert.match(feed, /ariaLabel="Abrir respostas"[\s\S]*?onClick=\{openComments\}/);
  assert.match(component, /target\.closest\('button, a, input, textarea, select, \[role="button"\]'\)/);
});

test('feed action controls use a darker gray and load-more uses white with black text', async () => {
  const [feed, component] = await Promise.all([
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/components/SocialCard.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(feed, /color-mix\(in srgb, var\(--c-surface2\) 80%, #000 20%\)/);
  assert.match(feed, /background="color-mix\(in srgb, var\(--c-surface2\) 80%, #000 20%\)"/);
  assert.match(component, /background:\s*active\s*\?[\s\S]*?:\s*\(background \?\? T\.surface2\)/);
  assert.match(feed, /background:\s*'#FFFFFF',\s*color:\s*'#0B0B0D'/);
});

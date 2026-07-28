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
  assert.match(component, /background:\s*edgeToEdge\s*\?\s*'transparent'\s*:\s*T\.card/);
  assert.match(component, /borderTop:\s*edgeToEdge\s*\?\s*'none'\s*:\s*`1px solid \$\{T\.border\}`/);
  assert.match(component, /borderBottom:\s*`1px solid \$\{T\.border\}`/);
  assert.match(component, /borderLeft:\s*edgeToEdge\s*\?\s*'none'/);
  assert.match(component, /borderRight:\s*edgeToEdge\s*\?\s*'none'/);
});

test('feed shows its localized page title above the audience tabs', async () => {
  const feed = await readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8');

  assert.match(feed, /useTranslation\('navigation'\)/);
  assert.match(feed, /navTitle=\{t\('activity'\)\}/);
  assert.match(feed, /contentAlign="start"[\s\S]*?children=\{[\s\S]*?size=\{26\}[\s\S]*?\{t\('activity'\)\}[\s\S]*?right=\{/);
  assert.doesNotMatch(feed, /padding: '6px 16px 2px'/);
});

test('series and movies share the large left-aligned page title header', async () => {
  const [series, movies] = await Promise.all([
    readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/movies/page.tsx', projectRoot), 'utf8'),
  ]);

  for (const source of [series, movies]) {
    assert.match(source, /<GlassHeader[\s\S]*?contentAlign="start"[\s\S]*?children=\{[\s\S]*?size=\{26\}[\s\S]*?weight=\{900\}/);
  }
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
  assert.match(feed, /Menu discreto — canto inferior direito do card[\s\S]*?top:\s*44,\s*right:\s*0/);
});

test('clicking non-interactive feed card content opens the same comments route as replies', async () => {
  const [feed, component, comments] = await Promise.all([
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/components/SocialCard.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/comments/page.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(feed, /const openComments = \(openReply = false\)/);
  assert.match(feed, /if \(resolvedReviewId\) params\.set\('commentId', resolvedReviewId\)/);
  assert.match(feed, /if \(openReply && resolvedReviewId\) params\.set\('replyTo', resolvedReviewId\)/);
  assert.match(feed, /<SocialCard dimmed=\{deleting\} edgeToEdge onClick=\{\(\) => openComments\(\)\}>/);
  assert.match(feed, /ariaLabel="Abrir respostas"[\s\S]*?onClick=\{\(\) => openComments\(true\)\}/);
  assert.match(component, /target\.closest\('button, a, input, textarea, select, \[role="button"\]'\)/);
  assert.match(comments, /const replyTarget = sp\.get\('replyTo'\) \|\| ''/);
  assert.match(comments, /const selectedCommentId = sp\.get\('commentId'\) \|\| replyTarget/);
  assert.match(comments, /const focusedComments = selectedCommentId[\s\S]*?sorted\.filter\(review => review\.id === selectedCommentId\)/);
  assert.match(comments, />\s*Ver mais comentários\s*</);
  assert.match(comments, /setReplyOpenId\(replyTarget\)/);
});

test('feed action controls use theme-aware gray and load-more uses white with black text', async () => {
  const [feed, component] = await Promise.all([
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/components/SocialCard.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(feed, /color-mix\(in srgb, var\(--c-surface2\) 64%, #000 36%\)/);
  assert.match(feed, /: '#D1D1D6'/);
  assert.match(feed, /background=\{actionBackground\}/);
  assert.match(feed, /background: myReaction[\s\S]*?border: 'none'/);
  assert.match(feed, /background=\{actionBackground\}[\s\S]*?border="none"/);
  assert.match(component, /border:\s*border \?\?/);
  assert.match(component, /background:\s*active\s*\?[\s\S]*?:\s*\(background \?\? T\.surface2\)/);
  assert.match(feed, /background:\s*'#FFFFFF',\s*color:\s*'#0B0B0D'/);
});

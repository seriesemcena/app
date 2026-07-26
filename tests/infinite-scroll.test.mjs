import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('infinite-scroll observer uses the screen scroll container as its root', async () => {
  const source = await readFile(new URL('src/hooks/useInfiniteScroll.ts', projectRoot), 'utf8');

  assert.match(source, /const root = rootRef\.current/);
  assert.match(source, /new IntersectionObserver\([\s\S]*?\{\s*root,\s*rootMargin,\s*threshold:\s*0/);
  assert.match(source, /!enabled \|\| !hasMore \|\| loading/);
  assert.match(source, /observer\.disconnect\(\)[\s\S]*?loadMoreRef\.current\(\)/);
});

test('comments load automatically without changing the existing page cursor flow', async () => {
  const source = await readFile(new URL('src/app/comments/page.tsx', projectRoot), 'utf8');

  assert.match(source, /<ScrollArea ref=\{scrollRef\}>/);
  assert.match(source, /useInfiniteScroll\(\{[\s\S]*?rootRef:\s*scrollRef[\s\S]*?hasMore:\s*hasMoreComments[\s\S]*?loading:\s*pageLoading/);
  assert.match(source, /ref=\{commentsSentinelRef\}/);
  assert.match(source, /dbRevStore\.getPage\(getDB\(\), storageKey, pageCursor\)/);
  assert.match(source, /setPageCursor\(page\.cursor\)/);
});

test('comments only show the collapsed footer action for existing discussions', async () => {
  const source = await readFile(new URL('src/app/comments/page.tsx', projectRoot), 'utf8');

  assert.match(source, /\{\(sorted\.length > 0 \|\| composerExpanded\) && \([\s\S]*?className="keyboard-aware-bottom"/);
  assert.match(source, /!composerExpanded \? \([\s\S]*?aria-label=\{t\('comments\.commentNow'\)\}[\s\S]*?<Icon name="message"/);
  assert.doesNotMatch(source, /aria-label=\{t\('comments\.commentNow'\)\}[\s\S]*?<Icon name="reply"/);
});

test('feed loads automatically while preserving its Firestore cursor and page limits', async () => {
  const source = await readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8');

  assert.match(source, /className="app-page-scroll"[\s\S]*?ref=\{scrollRef\}/);
  assert.match(source, /useInfiniteScroll\(\{[\s\S]*?rootRef:\s*scrollRef[\s\S]*?hasMore:\s*feedHasMore[\s\S]*?loading:\s*loadingMore/);
  assert.match(source, /ref=\{feedSentinelRef\}/);
  assert.match(source, /dbActivityStore\.getPage\(getDB\(\), feedCursor\)/);
  assert.match(source, /setFeedCursor\(page\.cursor\)/);
});

test('failed pagination pauses automatic retries and keeps a manual retry path', async () => {
  const [comments, feed] = await Promise.all([
    readFile(new URL('src/app/comments/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/feed/page.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(comments, /enabled:\s*!pageError/);
  assert.match(feed, /enabled:\s*!feedError/);
  assert.match(comments, /pageError && hasMoreComments[\s\S]*?Tentar novamente/);
  assert.match(feed, /feedError && feedHasMore[\s\S]*?Tentar novamente/);
});

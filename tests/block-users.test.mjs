import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('block store persists blocked uids and is account-scoped', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /export const blockStore = \{/);
  assert.match(store, /const BLOCKED_KEY = 'sec_blocked'/);
  assert.match(store, /isBlocked\(uid\?: string \| null\)/);
  // Cache must be wiped on account switch, or blocks leak across accounts.
  assert.match(store, /'sec_blocked',\s*\/\/ blocked user uids/);
});

test('block list is mirrored to Firestore and synced back both ways', () => {
  const db = read('src/lib/db.ts');
  assert.match(db, /export const dbBlockStore = \{/);
  assert.match(db, /blocked_list/);
  assert.match(db, /async block\(db: Firestore, uid: string, targetUid: string\)/);
  assert.match(db, /async unblock\(db: Firestore, uid: string, targetUid: string\)/);
  // Synced in both the login pull and the realtime subscription.
  assert.equal((db.match(/localStorage\.setItem\('sec_blocked'/g) ?? []).length, 2);
});

test('profile page offers block/unblock and unfollows on block', () => {
  const page = read('src/app/user/[username]/page.tsx');
  assert.match(page, /const toggleBlock = async \(\)/);
  assert.match(page, /blockStore\.add\(uid\)/);
  assert.match(page, /blockStore\.remove\(uid\)/);
  assert.match(page, /dbBlockStore\.block/);
  assert.match(page, /dbBlockStore\.unblock/);
  // Blocking implies unfollowing.
  assert.match(page, /if \(isFollowing\) \{ try \{ await toggleFollow\(\)/);
  assert.match(page, /t\('blockUser'\)/);
  assert.match(page, /t\('unblockUser'\)/);
});

test('blocked users content is hidden in feed and comments', () => {
  const feed = read('src/app/feed/page.tsx');
  const comments = read('src/app/comments/page.tsx');
  assert.match(feed, /blockedUids\.includes\(item\.uid\)/);
  assert.match(comments, /!blockStore\.isBlocked\(r\.uid\)/);
});

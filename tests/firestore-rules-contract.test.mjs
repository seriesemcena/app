import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

test('client cannot write derived Firestore views or operational receipts', () => {
  for (const path of ['ratingSummaries', 'metrics', 'metricsDaily', 'metricsMonthly', 'systemEvents', 'userStats']) {
    const block = new RegExp(`match \\/${path}\\/\\{[^}]+\\} \\{[\\s\\S]*?allow (?:read, )?write: if false;`);
    assert.match(rules, block, `${path} must be server-owned`);
  }
});

test('rating ownership and numeric bounds are enforced', () => {
  assert.match(rules, /match \/userRatings\/\{uid\}/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /request\.resource\.data\.authorUid == uid/);
  assert.match(rules, /request\.resource\.data\.rating >= 1/);
  assert.match(rules, /request\.resource\.data\.rating <= 10/);
});

test('account rating history is queryable only by its authenticated owner', () => {
  assert.match(rules, /match \/\{ratingPath=\*\*\}\/userRatings\/\{ratingUid\}/);
  assert.match(
    rules,
    /match \/\{ratingPath=\*\*\}\/userRatings\/\{ratingUid\}[\s\S]*allow list: if activeUser\(\)[\s\S]*resource\.data\.authorUid == request\.auth\.uid/,
  );
  assert.match(
    rules,
    /match \/userRatings\/\{uid\}[\s\S]*allow get: if activeUser\(\) && request\.auth\.uid == uid;[\s\S]*allow list: if false;/,
  );
});

test('review likes can only toggle the authenticated user', () => {
  assert.match(rules, /function togglesOwnReviewLike\(\)/);
  assert.match(rules, /changed\.hasOnly\(\['likedBy', 'likes'\]\)/);
  assert.match(rules, /after\.hasAny\(\[request\.auth\.uid\]\)/);
  assert.match(rules, /after\.hasAll\(before\)/);
  assert.match(rules, /before\.hasAll\(after\)/);
  assert.match(rules, /request\.resource\.data\.likes == after\.size\(\)/);
});

test('review replies can only append one reply owned by the authenticated user', () => {
  assert.match(rules, /function appendsOwnReviewReply\(\)/);
  assert.match(rules, /after\.size\(\) == before\.size\(\) \+ 1/);
  assert.match(rules, /after\.hasAll\(before\)/);
  assert.match(rules, /reply\.get\('uid', ''\) == request\.auth\.uid/);
  assert.match(rules, /hasAny\(\['likedBy', 'likes', 'replies'\]\)/);
});

test('social notifications are server-created and recipient-owned', () => {
  assert.match(rules, /match \/notifications\/\{id\}/);
  assert.match(rules, /match \/notifications\/\{id\}[\s\S]*allow create: if false/);
  assert.match(rules, /resource\.data\.recipientId == request\.auth\.uid/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['read'\]\)/);
});

test('private user data is owner-only and system account state is server-only', () => {
  assert.match(rules, /match \/private\/\{docId\}[\s\S]*request\.auth\.uid == uid/);
  for (const documentId of ['preferences', 'expenses', 'blocks', 'history', 'activity', 'push']) {
    assert.match(rules, new RegExp(`docId == '${documentId}'`));
  }
  assert.match(rules, /match \/system\/\{docId\}[\s\S]*allow read, write: if false/);
  for (const field of ['prefs', 'expenses', 'blocked_list', 'ep_watched', 'fcm_tokens', 'lastActiveAt']) {
    assert.match(rules, new RegExp(`'${field}'`));
  }
});

test('social graph only lets an owner write following and never followers', () => {
  assert.match(rules, /match \/following\/\{targetUid\}[\s\S]*request\.auth\.uid == uid[\s\S]*targetUid != uid/);
  assert.match(rules, /match \/followers\/\{followerUid\}[\s\S]*allow write: if false/);
});

test('Storage enforces profile ownership, media limits and PRO-only GIF/cover uploads', () => {
  assert.match(storage, /request\.auth\.uid == uid/);
  assert.match(storage, /request\.resource\.metadata\.ownerUid == uid/);
  assert.match(storage, /function validAvatar\(uid\)/);
  assert.match(storage, /contentType in \['image\/jpeg', 'image\/webp'\]/);
  assert.match(storage, /request\.resource\.size <= 400 \* 1024/);
  assert.match(storage, /request\.resource\.contentType == 'image\/gif'/);
  assert.match(storage, /request\.resource\.size <= 600 \* 1024/);
  assert.match(storage, /function validProCover\(uid\)/);
  assert.match(storage, /isProMember\(uid\)/);
  assert.match(storage, /request\.resource\.size <= 5 \* 1024 \* 1024/);
});

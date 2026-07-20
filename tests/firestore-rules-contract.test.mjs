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

test('social graph only lets an owner write following and never followers', () => {
  assert.match(rules, /match \/following\/\{targetUid\}[\s\S]*request\.auth\.uid == uid[\s\S]*targetUid != uid/);
  assert.match(rules, /match \/followers\/\{followerUid\}[\s\S]*allow write: if false/);
});

test('Storage requires ownership, WebP and bounded object size', () => {
  assert.match(storage, /request\.auth\.uid == uid/);
  assert.match(storage, /request\.resource\.size < 5 \* 1024 \* 1024/);
  assert.match(storage, /request\.resource\.contentType == 'image\/webp'/);
  assert.match(storage, /request\.resource\.metadata\.ownerUid == uid/);
});

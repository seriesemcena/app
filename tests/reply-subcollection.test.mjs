import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const db = read('src/lib/db.ts');
const rules = read('firestore.rules');
const comments = read('src/app/comments/page.tsx');
const functions = read('functions/index.js');
const moderatorHook = read('src/hooks/useModerator.ts');

test('replies are stored as their own documents under the review', () => {
  assert.match(db, /const replyCol = \(db: Firestore, titleKey: string, reviewId: string\) =>/);
  assert.match(db, /collection\(doc\(revCol\(db, titleKey\), reviewId\), 'replies'\)/);
  // addReply now writes a reply document instead of arrayUnion on the review.
  const addReply = db.slice(db.indexOf('async addReply('), db.indexOf('async getReplies('));
  assert.match(addReply, /setDoc\(\s*doc\(replyCol\(db, titleKey, reviewId\), reply\.id\)/);
  assert.match(addReply, /authorUid: reply\.uid/);
  assert.doesNotMatch(addReply, /arrayUnion/);
});

test('dbRevStore exposes read, like and delete for replies', () => {
  assert.match(db, /async getReplies\(/);
  assert.match(db, /orderBy\('date', 'asc'\)/);
  assert.match(db, /async toggleReplyLike\(/);
  assert.match(db, /transaction\.update\(ref, \{ likedBy, likes: likedBy\.length \}\)/);
  assert.match(db, /async removeReply\(/);
  assert.match(db, /deleteDoc\(doc\(replyCol\(db, titleKey, reviewId\), replyId\)\)/);
});

test('firestore rules secure the replies subcollection', () => {
  assert.match(rules, /match \/replies\/\{replyId\}/);
  assert.match(rules, /allow create: if activeUser\(\) && isOwnNewReply\(\)/);
  assert.match(rules, /allow update: if activeUser\(\) && togglesOwnReplyLike\(\)/);
  assert.match(
    rules,
    /allow delete: if activeUser\(\)[\s\S]*resource\.data\.get\('uid', ''\) == request\.auth\.uid[\s\S]*canModerateCommunity\(\)/,
  );
  // A like only flips the caller's own uid, and a new reply is owned + empty.
  assert.match(rules, /function togglesOwnReplyLike\(\)/);
  assert.match(rules, /function isOwnNewReply\(\)/);
  assert.match(rules, /reply\.get\('likes', 0\) == 0/);
  assert.match(rules, /reply\.get\('likedBy', \[\]\)\.size\(\) == 0/);
});

test('comments page loads replies from the subcollection and wires like + delete', () => {
  assert.match(comments, /const hydrateReplies = async/);
  assert.match(comments, /dbRevStore\.getReplies\(getDB\(\), storageKey, review\.id\)/);
  assert.match(comments, /const toggleReplyLike = async \(reviewId: string, replyId: string\)/);
  assert.match(comments, /dbRevStore\.toggleReplyLike\(getDB\(\), storageKey, reviewId, replyId, user\.uid\)/);
  assert.match(comments, /const deleteReply = async \(reviewId: string, replyId: string\)/);
  assert.match(comments, /dbRevStore\.removeReply\(getDB\(\), storageKey, reviewId, replyId\)/);
  // A reply's delete is offered to its author or a moderator.
  assert.match(comments, /\(!!r\.uid && r\.uid === currentUserId\) \|\| !!isModerator/);
});

test('reply items render a single heart like, not a reaction picker', () => {
  const replyItem = comments.slice(comments.indexOf('function ReplyItem('), comments.indexOf('/* ── Comment card ── */'));
  assert.match(replyItem, /icon=\{liked \? 'heart' : 'heartO'\}/);
  assert.match(replyItem, /ariaLabel="Curtir resposta"/);
  assert.match(replyItem, /aria-label="Excluir resposta"/);
  // No emoji reaction options on a reply — just the heart.
  assert.doesNotMatch(replyItem, /reaction|emoji/i);
});

test('moderator detection mirrors canModerateCommunity via token claims', () => {
  assert.match(moderatorHook, /export function useModerator\(\)/);
  assert.match(moderatorHook, /getIdTokenResult\(\)/);
  assert.match(moderatorHook, /result\.claims\.admin === true/);
  assert.match(moderatorHook, /\['super_admin', 'admin', 'moderator', 'support'\]/);
});

test('a one-time admin migration folds legacy array replies into the subcollection', () => {
  assert.match(functions, /exports\.migrateRepliesToSubcollection = onCall/);
  assert.match(functions, /token\?\.admin !== true \|\| !\['super_admin', 'admin'\]\.includes/);
  assert.match(functions, /itemDoc\.ref\.collection\('replies'\)\.doc\(reply\.id\)/);
  assert.match(functions, /batch\.update\(itemDoc\.ref, \{ replies: \[\] \}\)/);
});

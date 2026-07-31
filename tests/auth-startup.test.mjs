import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('returning sessions render their uid-scoped cache before network reconciliation', () => {
  const auth = read('src/context/AuthContext.tsx');
  const cachedSession = auth.indexOf('const canRenderCachedSession = !!u && cacheOwner === u.uid');
  const releaseStartup = auth.indexOf('setLoading(!canRenderCachedSession)');
  const tokenRefresh = auth.indexOf('await u.getIdToken(false)');
  const remoteSync = auth.indexOf('await syncFromFirestore(db, u.uid, u.email, u.displayName)');

  assert.ok(cachedSession >= 0, 'cached session detection must exist');
  assert.ok(releaseStartup > cachedSession, 'startup state must use cached session detection');
  assert.ok(releaseStartup < tokenRefresh, 'cached UI must be released before token refresh');
  assert.ok(releaseStartup < remoteSync, 'cached UI must be released before Firestore reconciliation');
});

test('fresh logins still finish authoritative hydration before closing startup state', () => {
  const auth = read('src/context/AuthContext.tsx');
  const remoteSync = auth.indexOf('await syncFromFirestore(db, u.uid, u.email, u.displayName)');
  const hydratedReady = auth.indexOf('if (active) setLoading(false)', remoteSync);

  assert.ok(remoteSync >= 0, 'Firestore reconciliation must still run');
  assert.ok(hydratedReady > remoteSync, 'fresh sessions must close loading after hydration');
});

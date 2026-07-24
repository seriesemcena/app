import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('native Google sign-in uses Credential Manager without a redundant authorization flow', async () => {
  const authHook = await read('src/hooks/useAuth.ts');
  const googleCall = authHook.match(
    /FirebaseAuthentication\.signInWithGoogle\(\{([\s\S]*?)\}\)/,
  );

  assert.ok(googleCall, 'native Google sign-in call should exist');
  assert.match(googleCall[1], /useCredentialManager:\s*true/);
  assert.doesNotMatch(googleCall[1], /scopes\s*:/);
  assert.doesNotMatch(googleCall[1], /skipNativeAuth\s*:/);

  assert.match(
    authHook,
    /GoogleAuthProvider\.credential\(\s*nativeCredential\.idToken/,
  );
  assert.match(
    authHook,
    /signInWithCredential\(getFirebaseAuth\(\), credential\)/,
  );
});

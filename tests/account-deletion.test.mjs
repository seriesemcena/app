import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('members can reach a guarded in-app permanent account deletion flow', async () => {
  const [settings, page, authHook] = await Promise.all([
    read('src/app/settings/page.tsx'),
    read('src/app/settings/delete-account/page.tsx'),
    read('src/hooks/useAuth.ts'),
  ]);

  assert.match(settings, /\/settings\/delete-account/);
  assert.match(page, /confirmationWord/);
  assert.match(page, /providerId === 'password'/);
  assert.match(page, /deleteAccount\(requiresPassword \? password : undefined\)/);
  assert.match(authHook, /reauthenticateWithCredential/);
  assert.match(authHook, /reauthenticateWithPopup/);
  assert.match(authHook, /getIdToken\(true\)/);
  assert.match(authHook, /httpsCallable[\s\S]+deleteMyAccount/);
});

test('server deletion requires recent authentication and removes auth plus user data', async () => {
  const functions = await read('functions/index.js');

  assert.match(functions, /exports\.deleteMyAccount = onCall/);
  assert.match(functions, /request\.auth\.token\.auth_time/);
  assert.match(functions, /db\.recursiveDelete\(userSnapshot\.ref\)/);
  assert.match(functions, /deleteFiles\(\{ prefix: `users\/\$\{uid\}\//);
  assert.match(functions, /auth\.deleteUser\(uid\)/);
});

test('account deletion instructions are available in every complete app language', async () => {
  const translations = await Promise.all([
    read('src/locales/pt-BR/settings.json'),
    read('src/locales/en-US/settings.json'),
    read('src/locales/es-ES/settings.json'),
  ]);

  for (const source of translations) {
    const deletion = JSON.parse(source).deleteAccount;
    for (const key of ['title', 'body', 'warning', 'confirmationLabel', 'confirm', 'deleting', 'errorGeneric']) {
      assert.equal(typeof deletion[key], 'string');
      assert.ok(deletion[key].length > 0);
    }
  }
});

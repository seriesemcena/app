import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin user management exposes audited password, email, PRO and deletion actions', async () => {
  const api = await read('functions/admin-api.js');
  assert.match(api, /action === 'password-reset'/);
  assert.match(api, /users\.password_reset_requested/);
  assert.match(api, /action === 'email'/);
  assert.match(api, /emailVerified: false/);
  assert.match(api, /revokeRefreshTokens\(id\)/);
  assert.match(api, /action === 'pro'/);
  assert.match(api, /users\.pro_enable/);
  assert.match(api, /db\.recursiveDelete\(db\.doc\(`users\/\$\{id\}`\)\)/);
});

test('sensitive user operations have dedicated permissions', async () => {
  const security = await read('functions/admin-security.js');
  assert.match(security, /users\.password\.reset/);
  assert.match(security, /users\.email\.update/);
  assert.match(security, /users\.pro\.manage/);
});

test('admin panel provides one user manager without stacked delete dialogs', async () => {
  const [view, firebase] = await Promise.all([
    read('apps/admin/src/views.tsx'),
    read('apps/admin/src/firebase.ts'),
  ]);
  assert.match(view, />Gerenciar<\/button>/);
  assert.match(view, /Redefinição de senha/);
  assert.match(view, /Ativar PRO/);
  assert.match(view, /Novo e-mail do usuário/);
  assert.match(view, /Excluir conta a pedido do usuário/);
  assert.match(view, /setManager\(null\)/);
  assert.match(firebase, /sendPasswordResetEmail\(auth, email\)/);
});

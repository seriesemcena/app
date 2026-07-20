import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('cadeia administrativa exige Access, App Check, token revogado, cadastro e permissão', async () => {
  const source = await readFile(new URL('functions/admin-api.js', root), 'utf8');
  const order = [
    source.indexOf('requireCloudflareAccess(req)'),
    source.indexOf('verifyAppCheck(req)'),
    source.lastIndexOf('requireAdmin(req, access)'),
    source.lastIndexOf('route(req, res, actor'),
  ];
  assert.ok(order.every((position) => position > 0));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.match(source, /verifyIdToken\(match\[1\], true\)/);
  assert.match(source, /record\.status !== 'active'/);
  assert.match(source, /record\.role !== decoded\.role/);
  assert.match(source, /Number\(record\.authVersion\) !== Number\(decoded\.authVersion\)/);
});

test('bypass de Access só pode existir no Emulator e fora de produção', async () => {
  const source = await readFile(new URL('functions/admin-api.js', root), 'utf8');
  assert.match(source, /FUNCTIONS_EMULATOR === 'true' && process\.env\.NODE_ENV !== 'production'/);
  assert.match(source, /ADMIN_EMULATOR_BYPASS === 'true'/);
  assert.doesNotMatch(source, /ADMIN_EMULATOR_BYPASS[^\n]+\|\|\s*true/);
});

test('CORS administrativo é explícito e funções não mantêm instâncias quentes', async () => {
  const source = await readFile(new URL('functions/admin-api.js', root), 'utf8');
  assert.match(source, /https:\/\/admin\.maratonou\.com/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin['"],?\s*['"]\*/);
  assert.doesNotMatch(source, /minInstances/);
  assert.match(source, /maxInstances: 10/);
});

test('operações críticas combinam intenção, autenticação recente e idempotência', async () => {
  const source = await readFile(new URL('functions/admin-api.js', root), 'utf8');
  assert.match(source, /requireConfirmation\(body, 'ENVIAR'\)/);
  assert.match(source, /requireConfirmation\(body, 'REMOVER'\)/);
  assert.match(source, /requireRecentAuth\(actor\)/);
  assert.match(source, /claimIdempotency/);
  assert.match(source, /DUPLICATE_OPERATION/);
  assert.match(source, /LAST_SUPER_ADMIN/);
  assert.match(source, /SELF_PRIVILEGE_CHANGE_DENIED/);
});

test('identificadores de comentários ficam presos ao caminho autorizado', async () => {
  const source = await readFile(new URL('functions/admin-api.js', root), 'utf8');
  assert.match(source, /\^reviews\\\/\[\^\/\]\+\\\/items/);
  assert.match(source, /INVALID_COMMENT_ID/);
});

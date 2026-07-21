import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  cleanForAudit,
  roleCan,
  verifyCloudflareJwtWithJwks,
} = require('../../functions/admin-security.js');

function accessToken(claims, privateKey, kid = 'test-key') {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

test('matriz de RBAC não concede privilégios de super_admin aos demais papéis', () => {
  assert.deepEqual(ROLE_PERMISSIONS.super_admin, ['*']);
  for (const role of ['admin', 'moderator', 'editor', 'support']) {
    assert.equal(roleCan(role, 'admins.create'), false);
    assert.equal(roleCan(role, 'admins.remove'), false);
    assert.equal(roleCan(role, 'users.roles.manage'), false);
  }
  assert.equal(roleCan('moderator', 'comments.delete'), true);
  assert.equal(roleCan('editor', 'content.update'), true);
  assert.equal(roleCan('admin', 'users.email.update'), true);
  assert.equal(roleCan('admin', 'users.pro.manage'), true);
  assert.equal(roleCan('support', 'users.password.reset'), true);
  assert.equal(roleCan('support', 'users.email.update'), false);
  assert.equal(roleCan('admin', 'users.delete'), false);
  assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length);
});

test('permissões adicionais aceitam somente permissões conhecidas', () => {
  assert.equal(roleCan('support', 'settings.update', ['settings.update']), true);
  assert.equal(roleCan('support', 'admins.create', ['root', 'admin', 'admins.create-typo']), false);
});

test('dados de auditoria removem segredos e limitam profundidade', () => {
  const result = cleanForAudit({ password: 'senha', authorization: 'Bearer x', safe: 'ok', nested: { privateKey: 'x' } });
  assert.equal(result.password, '[redacted]');
  assert.equal(result.authorization, '[redacted]');
  assert.equal(result.safe, 'ok');
  assert.equal(result.nested.privateKey, '[redacted]');
});

test('valida assinatura, issuer, audience e expiração do Cloudflare Access JWT', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  const now = 1_800_000_000;
  const claims = { iss: 'https://team.cloudflareaccess.com', aud: ['admin-aud'], exp: now + 300, email: 'admin@example.com' };
  const token = accessToken(claims, privateKey);
  assert.equal(verifyCloudflareJwtWithJwks(token, { keys: [jwk] }, { issuer: claims.iss, audience: 'admin-aud' }, now).email, 'admin@example.com');
  assert.throws(() => verifyCloudflareJwtWithJwks(token, { keys: [jwk] }, { issuer: claims.iss, audience: 'wrong' }, now), /Audience/);
  assert.throws(() => verifyCloudflareJwtWithJwks(token, { keys: [jwk] }, { issuer: 'https://wrong.example.com', audience: 'admin-aud' }, now), /Issuer/);
  assert.throws(() => verifyCloudflareJwtWithJwks(accessToken({ ...claims, exp: now - 1 }, privateKey), { keys: [jwk] }, { issuer: claims.iss, audience: 'admin-aud' }, now), /expirada/);
});

test('token adulterado é rejeitado', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256' };
  const token = accessToken({ iss: 'https://team.cloudflareaccess.com', aud: ['aud'], exp: 2_000_000_000 }, privateKey);
  const parts = token.split('.');
  const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ iss: 'https://team.cloudflareaccess.com', aud: ['aud'], exp: 2_000_000_000, role: 'super_admin' })).toString('base64url')}.${parts[2]}`;
  assert.throws(() => verifyCloudflareJwtWithJwks(tampered, { keys: [jwk] }, { issuer: 'https://team.cloudflareaccess.com', audience: 'aud' }, 1_900_000_000), /Assinatura/);
});

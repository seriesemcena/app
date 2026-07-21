'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require('node:crypto');

const ADMIN_ROLES = Object.freeze(['super_admin', 'admin', 'moderator', 'editor', 'support']);
const ALL_PERMISSIONS = Object.freeze([
  'dashboard.read', 'dashboard.rebuild',
  'users.read', 'users.update', 'users.password.reset', 'users.email.update',
  'users.pro.manage', 'users.suspend', 'users.ban', 'users.delete', 'users.roles.manage',
  'content.read', 'content.create', 'content.update', 'content.publish', 'content.delete',
  'comments.read', 'comments.moderate', 'comments.delete',
  'ratings.read', 'ratings.moderate',
  'reports.read', 'reports.resolve',
  'notifications.read', 'notifications.create', 'notifications.send',
  'settings.read', 'settings.update',
  'integrations.read', 'integrations.test', 'integrations.manage',
  'audit.read',
  'admins.read', 'admins.create', 'admins.update', 'admins.remove',
]);

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: Object.freeze(['*']),
  admin: Object.freeze([
    'dashboard.read', 'users.read', 'users.update', 'users.password.reset',
    'users.email.update', 'users.pro.manage', 'users.suspend', 'users.ban',
    'content.read', 'content.create', 'content.update', 'content.publish',
    'comments.read', 'comments.moderate', 'comments.delete',
    'ratings.read', 'ratings.moderate', 'reports.read', 'reports.resolve',
    'notifications.read', 'notifications.create', 'settings.read',
    'integrations.read', 'integrations.test', 'audit.read',
  ]),
  moderator: Object.freeze([
    'dashboard.read', 'users.read', 'comments.read', 'comments.moderate',
    'comments.delete', 'ratings.read', 'ratings.moderate', 'reports.read',
    'reports.resolve', 'audit.read',
  ]),
  editor: Object.freeze([
    'dashboard.read', 'content.read', 'content.create', 'content.update',
    'content.publish', 'notifications.read', 'notifications.create',
  ]),
  support: Object.freeze([
    'dashboard.read', 'users.read', 'users.password.reset',
    'reports.read', 'reports.resolve',
  ]),
});

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isAdminRole(value) { return ADMIN_ROLES.includes(value); }
function isPermission(value) { return ALL_PERMISSIONS.includes(value); }
function roleCan(role, permission, extras = []) {
  const base = ROLE_PERMISSIONS[role] || [];
  return base.includes('*') || base.includes(permission) || extras.filter(isPermission).includes(permission);
}

function cleanString(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanForAudit(input, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (input == null || typeof input === 'boolean' || typeof input === 'number') return input;
  if (typeof input === 'string') return cleanString(input, 500);
  if (Array.isArray(input)) return input.slice(0, 30).map((value) => cleanForAudit(value, depth + 1));
  if (typeof input === 'object') {
    const blocked = /token|secret|password|authorization|cookie|private.?key|credential/i;
    return Object.fromEntries(Object.entries(input).slice(0, 50).map(([key, value]) => [key, blocked.test(key) ? '[redacted]' : cleanForAudit(value, depth + 1)]));
  }
  return String(input);
}

function safeHttpsUrl(value, allowedHosts = []) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new ApiError(400, 'INVALID_URL', 'A URL informada não é válida.'); }
  if (url.protocol !== 'https:') throw new ApiError(400, 'INVALID_URL', 'Somente URLs HTTPS são permitidas.');
  if (url.username || url.password) throw new ApiError(400, 'INVALID_URL', 'URLs com credenciais não são permitidas.');
  if (allowedHosts.length && !allowedHosts.includes(url.hostname)) throw new ApiError(400, 'INVALID_URL_HOST', 'O domínio da URL não é permitido.');
  return url.toString();
}

function stableHash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function encodeCursor(value) { return Buffer.from(String(value), 'utf8').toString('base64url'); }
function decodeCursor(value) {
  if (!value) return null;
  try { return Buffer.from(value, 'base64url').toString('utf8'); } catch { throw new ApiError(400, 'INVALID_CURSOR', 'Cursor inválido.'); }
}

function requireConfirmation(body, expected) {
  if (cleanString(body?.confirmation, 40) !== expected) throw new ApiError(400, 'CONFIRMATION_REQUIRED', `Digite ${expected} para confirmar.`);
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Token do Cloudflare Access inválido.');
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
      payload: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: Buffer.from(parts[2], 'base64url'),
    };
  } catch { throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Token do Cloudflare Access inválido.'); }
}

function verifyCloudflareJwtWithJwks(token, jwks, options, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parsed = parseJwt(token);
  if (parsed.header.alg !== 'RS256' || typeof parsed.header.kid !== 'string') throw new ApiError(401, 'INVALID_ACCESS_ALGORITHM', 'Algoritmo do Access JWT não permitido.');
  const jwk = (jwks.keys || []).find((key) => key.kid === parsed.header.kid);
  if (!jwk) throw new ApiError(401, 'ACCESS_KEY_NOT_FOUND', 'Chave de assinatura do Access JWT não encontrada.');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify('RSA-SHA256', Buffer.from(parsed.signingInput), key, parsed.signature);
  if (!valid) throw new ApiError(401, 'INVALID_ACCESS_SIGNATURE', 'Assinatura do Access JWT inválida.');
  const issuer = String(parsed.payload.iss || '').replace(/\/$/, '');
  if (issuer !== String(options.issuer).replace(/\/$/, '')) throw new ApiError(401, 'INVALID_ACCESS_ISSUER', 'Issuer do Access JWT inválido.');
  const audiences = Array.isArray(parsed.payload.aud) ? parsed.payload.aud : [parsed.payload.aud];
  if (!audiences.includes(options.audience)) throw new ApiError(401, 'INVALID_ACCESS_AUDIENCE', 'Audience do Access JWT inválida.');
  if (!Number.isFinite(parsed.payload.exp) || parsed.payload.exp <= nowSeconds) throw new ApiError(401, 'ACCESS_TOKEN_EXPIRED', 'Sessão do Cloudflare Access expirada.');
  if (Number.isFinite(parsed.payload.nbf) && parsed.payload.nbf > nowSeconds + 30) throw new ApiError(401, 'ACCESS_TOKEN_NOT_ACTIVE', 'Sessão do Cloudflare Access ainda não é válida.');
  return parsed.payload;
}

module.exports = {
  ADMIN_ROLES, ALL_PERMISSIONS, ROLE_PERMISSIONS, ApiError,
  isAdminRole, isPermission, roleCan, cleanString, cleanForAudit,
  safeHttpsUrl, stableHash, encodeCursor, decodeCursor,
  requireConfirmation, parseJwt, verifyCloudflareJwtWithJwks,
};

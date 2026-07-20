'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require('node:crypto');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getAppCheck } = require('firebase-admin/app-check');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {
  ALL_PERMISSIONS, ROLE_PERMISSIONS, ApiError, cleanForAudit, cleanString, decodeCursor,
  encodeCursor, isAdminRole, isPermission, requireConfirmation, roleCan,
  safeHttpsUrl, stableHash, verifyCloudflareJwtWithJwks,
} = require('./admin-security');

if (!getApps().length) initializeApp();
const db = getFirestore();
const auth = getAuth();
const appCheck = getAppCheck();
const AUDIT_IP_HASH_SECRET = defineSecret('AUDIT_IP_HASH_SECRET');
const TMDB_API_KEY = defineSecret('TMDB_API_KEY');
const ACCESS_JWKS_TTL_MS = 5 * 60 * 1000;
let accessJwksCache = null;

const jsonHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function requestId(req) {
  const candidate = req.get('x-request-id');
  return candidate && /^[A-Za-z0-9._:-]{8,100}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function send(res, status, requestIdValue, data) {
  Object.entries(jsonHeaders).forEach(([key, value]) => res.set(key, value));
  return res.status(status).send(JSON.stringify({ success: true, data, requestId: requestIdValue }));
}

function sendError(res, error, requestIdValue) {
  const normalized = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível concluir a operação.');
  if (!(error instanceof ApiError)) logger.error('Admin API failure', { requestId: requestIdValue, error: String(error) });
  Object.entries(jsonHeaders).forEach(([key, value]) => res.set(key, value));
  return res.status(normalized.status).send(JSON.stringify({
    success: false,
    error: { code: normalized.code, message: normalized.message, ...(normalized.details ? { details: normalized.details } : {}) },
    requestId: requestIdValue,
  }));
}

function emulatorMode() { return process.env.FUNCTIONS_EMULATOR === 'true' && process.env.NODE_ENV !== 'production'; }

function secretConfigured(secret, fallbackName) {
  try { return Boolean(secret.value()); }
  catch { return Boolean(process.env[fallbackName]); }
}

function allowedOrigins() {
  const configured = String(process.env.ADMIN_ALLOWED_ORIGINS || 'https://admin.maratonou.com').split(',').map((value) => value.trim()).filter(Boolean);
  return new Set(emulatorMode() ? [...configured, 'http://127.0.0.1:4173', 'http://localhost:4173'] : configured.filter((value) => value.startsWith('https://')));
}

function validateOrigin(req, res) {
  const origin = req.get('origin');
  if (!origin || !allowedOrigins().has(origin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.');
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  // The admin client may use an HttpOnly Access cookie in the optional
  // Cloudflare layer. An exact origin allowlist prevents wildcard credential
  // sharing while keeping the same API compatible with a Vercel-only setup.
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, CF-Access-Jwt-Assertion, Idempotency-Key, X-Firebase-AppCheck, X-Request-Id');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
}

async function getAccessJwks(teamDomain) {
  if (accessJwksCache && accessJwksCache.expiresAt > Date.now() && accessJwksCache.teamDomain === teamDomain) return accessJwksCache.value;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new ApiError(503, 'ACCESS_KEYS_UNAVAILABLE', 'Não foi possível validar o Cloudflare Access.');
  const value = await response.json();
  accessJwksCache = { teamDomain, value, expiresAt: Date.now() + ACCESS_JWKS_TTL_MS };
  return value;
}

async function requireCloudflareAccess(req) {
  if (emulatorMode() && process.env.ADMIN_EMULATOR_BYPASS === 'true') {
    logger.warn('Cloudflare Access bypass enabled in Firebase Emulator only');
    return null;
  }
  const configuredMode = cleanString(process.env.CLOUDFLARE_ACCESS_ENFORCEMENT, 20).toLowerCase();
  const mode = ['disabled', 'monitor', 'required'].includes(configuredMode) ? configuredMode : 'required';
  if (mode === 'disabled') return null;
  const teamDomain = cleanString(process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN, 200).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const audience = cleanString(process.env.CLOUDFLARE_ACCESS_AUDIENCE, 200);
  if (!teamDomain || !audience) {
    if (mode === 'monitor') {
      logger.warn('Cloudflare Access is not configured (monitor mode)');
      return null;
    }
    throw new ApiError(503, 'ACCESS_NOT_CONFIGURED', 'Cloudflare Access ainda não está configurado no backend.');
  }
  const token = req.get('cf-access-jwt-assertion');
  if (!token) {
    if (mode === 'monitor') {
      logger.warn('Cloudflare Access token missing (monitor mode)');
      return null;
    }
    throw new ApiError(401, 'ACCESS_TOKEN_REQUIRED', 'Passe primeiro pelo Cloudflare Access.');
  }
  try {
    return await verifyCloudflareJwtWithJwks(token, await getAccessJwks(teamDomain), { issuer: `https://${teamDomain}`, audience });
  } catch (error) {
    if (mode === 'monitor') {
      logger.warn('Invalid Cloudflare Access token (monitor mode)');
      return null;
    }
    throw error;
  }
}

async function verifyAppCheck(req) {
  const mode = process.env.APP_CHECK_ENFORCEMENT === 'required' ? 'required' : 'monitor';
  const token = req.get('x-firebase-appcheck');
  if (!token) {
    if (mode === 'required') throw new ApiError(401, 'APP_CHECK_REQUIRED', 'Token do Firebase App Check ausente.');
    logger.warn('App Check token missing (monitor mode)');
    return null;
  }
  try { return await appCheck.verifyToken(token); }
  catch {
    if (mode === 'required') throw new ApiError(401, 'INVALID_APP_CHECK', 'Token do Firebase App Check inválido.');
    logger.warn('Invalid App Check token (monitor mode)');
    return null;
  }
}

async function requireAdmin(req, accessPayload) {
  const match = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) throw new ApiError(401, 'AUTH_REQUIRED', 'Autenticação Firebase ausente.');
  let decoded;
  try { decoded = await auth.verifyIdToken(match[1], true); }
  catch { throw new ApiError(401, 'INVALID_AUTH_TOKEN', 'Sessão Firebase inválida ou revogada.'); }
  if (decoded.admin !== true || !isAdminRole(decoded.role)) throw new ApiError(403, 'ADMIN_CLAIM_REQUIRED', 'A conta não possui uma função administrativa válida.');
  const snapshot = await db.doc(`adminUsers/${decoded.uid}`).get();
  if (!snapshot.exists) throw new ApiError(403, 'ADMIN_REGISTRATION_REQUIRED', 'Cadastro administrativo não encontrado.');
  const record = snapshot.data();
  if (record.status !== 'active') throw new ApiError(403, 'ADMIN_DISABLED', 'Acesso administrativo desativado.');
  if (record.role !== decoded.role || Number(record.authVersion) !== Number(decoded.authVersion)) throw new ApiError(401, 'ADMIN_SESSION_STALE', 'As permissões mudaram. Entre novamente.');
  const email = String(decoded.email || '').toLowerCase();
  if (accessPayload?.email && String(accessPayload.email).toLowerCase() !== email) throw new ApiError(403, 'IDENTITY_MISMATCH', 'As identidades do Cloudflare e Firebase não correspondem.');
  const extras = Array.isArray(record.permissions) ? record.permissions.filter(isPermission) : [];
  const actor = {
    uid: decoded.uid, email, name: String(decoded.name || record.name || email),
    role: decoded.role, authVersion: Number(record.authVersion), extras,
    authTime: Number(decoded.auth_time || 0),
  };
  void snapshot.ref.set({ lastAdminAccessAt: FieldValue.serverTimestamp() }, { merge: true });
  return actor;
}

function requirePermission(actor, permission) {
  if (!roleCan(actor.role, permission, actor.extras)) throw new ApiError(403, 'PERMISSION_DENIED', 'Você não possui permissão para esta ação.');
}

function requireRecentAuth(actor, maxAgeSeconds = 600) {
  if (!actor.authTime || Math.floor(Date.now() / 1000) - actor.authTime > maxAgeSeconds) throw new ApiError(401, 'RECENT_AUTH_REQUIRED', 'Autentique-se novamente antes desta operação crítica.');
}

async function rateLimit(actor, action, limit = 60, windowSeconds = 60) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const ref = db.doc(`adminRateLimits/${stableHash(`${actor.uid}:${action}:${bucket}`)}`);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const count = Number(snap.data()?.count || 0);
    if (count >= limit) throw new ApiError(429, 'RATE_LIMITED', 'Muitas solicitações. Aguarde e tente novamente.');
    transaction.set(ref, { uid: actor.uid, action, bucket, count: count + 1, expiresAt: Timestamp.fromMillis(Date.now() + (windowSeconds + 60) * 1000) });
  });
}

async function claimIdempotency(actor, req, action) {
  const key = cleanString(req.get('idempotency-key'), 120);
  if (!key || key.length < 12) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Envie uma chave de idempotência válida.');
  const ref = db.doc(`adminIdempotency/${stableHash(`${actor.uid}:${action}:${key}`)}`);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists) throw new ApiError(409, 'DUPLICATE_OPERATION', 'Esta operação já foi recebida.');
    transaction.create(ref, { uid: actor.uid, action, status: 'processing', createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
  });
  return ref;
}

async function writeAudit(actor, req, requestIdValue, action, resource, resourceId, detail = {}, outcome = 'success') {
  const ip = req.get('cf-connecting-ip') || req.ip || '';
  let secret = '';
  try { secret = AUDIT_IP_HASH_SECRET.value() || ''; }
  catch { secret = process.env.AUDIT_IP_HASH_SECRET || ''; }
  const entry = {
    actorUid: actor?.uid || null, actorEmail: actor?.email || null, actorRole: actor?.role || null,
    action, resource, resourceId: String(resourceId || ''), outcome, requestId: requestIdValue,
    detail: cleanForAudit(detail), userAgent: cleanString(req.get('user-agent'), 180),
    ...(secret && ip ? { ipHash: stableHash(`${secret}:${ip}`) } : {}),
    createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 400 * 86400000),
  };
  await db.collection('auditLogs').add(entry);
}

function pathParts(req) {
  const raw = req.path || new URL(req.url, 'http://localhost').pathname;
  const versioned = raw.includes('/v1/') ? raw.slice(raw.indexOf('/v1/')) : raw;
  return versioned.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
}

function bodyOf(req) {
  const size = Number(req.get('content-length') || 0);
  if (size > 65536) throw new ApiError(413, 'BODY_TOO_LARGE', 'Corpo da requisição excede 64 KB.');
  if (!req.body) return {};
  if (typeof req.body !== 'object' || Array.isArray(req.body)) throw new ApiError(400, 'INVALID_BODY', 'O corpo deve ser um objeto JSON.');
  return req.body;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function documentData(doc) {
  const data = doc.data() || {};
  return { id: doc.id, ...cleanForAudit(data), createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) };
}

async function listQuery(collection, query, cursor, limit = 25) {
  let built = query || collection.orderBy('__name__');
  const decoded = decodeCursor(cursor);
  if (decoded) {
    const cursorDoc = await collection.doc(decoded).get();
    if (cursorDoc.exists) built = built.startAfter(cursorDoc);
  }
  const snap = await built.limit(Math.min(Math.max(Number(limit) || 25, 1), 50)).get();
  return { items: snap.docs.map(documentData), nextCursor: snap.size === Math.min(Math.max(Number(limit) || 25, 1), 50) ? encodeCursor(snap.docs.at(-1).id) : null };
}

async function dashboard() {
  const [metricSnap, auditSnap] = await Promise.all([
    db.doc('metrics/global').get(),
    db.collection('auditLogs').orderBy('createdAt', 'desc').limit(8).get().catch(() => ({ docs: [] })),
  ]);
  const metrics = metricSnap.exists ? Object.fromEntries(Object.entries(metricSnap.data()).filter(([, value]) => typeof value === 'number')) : null;
  return { metrics, metricsUpdatedAt: toIso(metricSnap.data()?.updatedAt), recentAudit: auditSnap.docs.map(documentData), unavailable: metricSnap.exists ? [] : ['metrics/global'] };
}

async function rebuildDashboardMetrics() {
  // Aggregate count queries read index entries rather than downloading every
  // document. This keeps the initialization bounded even as production grows.
  const count = async (query) => Number((await query.count().get()).data().count || 0);
  const [
    usersTotal,
    proMembersTotal,
    activityTotal,
    commentsTotal,
    reportsTotal,
    openReportsTotal,
    notificationsTotal,
    pendingNotificationJobs,
  ] = await Promise.all([
    count(db.collection('users')),
    count(db.collection('users').where('profile.proMember', '==', true)),
    count(db.collection('activity')),
    count(db.collectionGroup('items')),
    count(db.collection('reports')),
    count(db.collection('reports').where('status', '==', 'open')),
    count(db.collection('app_notifications')),
    count(db.collection('notification_jobs').where('status', '==', 'pending')),
  ]);
  const metrics = {
    usersTotal,
    proMembersTotal,
    activityTotal,
    commentsTotal,
    reportsTotal,
    openReportsTotal,
    notificationsTotal,
    pendingNotificationJobs,
  };
  await db.doc('metrics/global').set({ ...metrics, updatedAt: FieldValue.serverTimestamp(), source: 'admin-aggregate-rebuild' }, { merge: true });
  return metrics;
}

async function listUsers(cursor, limit) {
  const result = await auth.listUsers(Math.min(Math.max(Number(limit) || 25, 1), 50), cursor || undefined);
  const refs = result.users.map((user) => db.doc(`users/${user.uid}`));
  const profiles = refs.length ? await db.getAll(...refs) : [];
  return {
    items: result.users.map((user, index) => ({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', disabled: user.disabled, createdAt: user.metadata.creationTime, lastSignInAt: user.metadata.lastSignInTime, accountStatus: profiles[index]?.data()?.accountStatus || 'active', proMember: profiles[index]?.data()?.profile?.proMember === true })),
    nextCursor: result.pageToken || null,
  };
}

async function listComments(limit = 25) {
  const snap = await db.collectionGroup('items').orderBy('createdAt', 'desc').limit(Math.min(Number(limit) || 25, 50)).get().catch(() => db.collectionGroup('items').limit(Math.min(Number(limit) || 25, 50)).get());
  return { items: snap.docs.map((doc) => ({ ...documentData(doc), id: encodeCursor(doc.ref.path), path: undefined })), nextCursor: null };
}

async function listAdmins() {
  const snap = await db.collection('adminUsers').orderBy('createdAt', 'desc').limit(50).get().catch(() => db.collection('adminUsers').limit(50).get());
  return { items: snap.docs.map(documentData), nextCursor: null };
}

async function userDetail(uid) {
  const user = await auth.getUser(uid).catch(() => null);
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  const profile = await db.doc(`users/${uid}`).get();
  return {
    uid: user.uid, email: user.email || '', displayName: user.displayName || '',
    disabled: user.disabled, createdAt: user.metadata.creationTime,
    lastSignInAt: user.metadata.lastSignInTime,
    profile: cleanForAudit(profile.data()?.profile || {}),
    accountStatus: profile.data()?.accountStatus || 'active',
  };
}

async function lastSuperAdminWouldBeRemoved(targetUid, nextRole, nextStatus) {
  const target = await db.doc(`adminUsers/${targetUid}`).get();
  if (!target.exists || target.data().role !== 'super_admin' || target.data().status !== 'active') return false;
  if (nextRole === 'super_admin' && nextStatus === 'active') return false;
  const active = await db.collection('adminUsers').where('role', '==', 'super_admin').where('status', '==', 'active').limit(2).get();
  return active.size <= 1;
}

async function setAdmin(actor, uid, input, mode) {
  if (uid === actor.uid) throw new ApiError(403, 'SELF_PRIVILEGE_CHANGE_DENIED', 'Você não pode alterar sua própria autoridade administrativa.');
  const role = input.role;
  const status = input.status === 'inactive' ? 'inactive' : 'active';
  if (!isAdminRole(role)) throw new ApiError(400, 'INVALID_ROLE', 'Função administrativa inválida.');
  const authUser = await auth.getUser(uid).catch(() => null);
  if (!authUser) throw new ApiError(404, 'USER_NOT_FOUND', 'Usuário não encontrado no Firebase Authentication.');
  const ref = db.doc(`adminUsers/${uid}`);
  const before = await ref.get();
  if (mode === 'create' && before.exists) throw new ApiError(409, 'ADMIN_EXISTS', 'Este administrador já existe.');
  if (await lastSuperAdminWouldBeRemoved(uid, role, status)) throw new ApiError(409, 'LAST_SUPER_ADMIN', 'O último superadministrador ativo não pode ser removido.');
  const authVersion = Number(before.data()?.authVersion || 0) + 1;
  const permissions = Array.isArray(input.permissions) ? input.permissions.filter(isPermission) : [];
  const currentClaims = authUser.customClaims || {};
  await auth.setCustomUserClaims(uid, { ...currentClaims, admin: status === 'active', role, authVersion });
  await ref.set({ uid, email: authUser.email || '', name: authUser.displayName || '', role, status, permissions, authVersion, createdAt: before.data()?.createdAt || FieldValue.serverTimestamp(), createdBy: before.data()?.createdBy || actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
  await auth.revokeRefreshTokens(uid);
  return { uid, role, status, authVersion };
}

async function route(req, res, actor, requestIdValue, parts) {
  const [, scope, resource, id, action] = parts;
  const method = req.method;
  const url = new URL(req.url, 'http://localhost');
  const body = bodyOf(req);
  if (scope !== 'admin') throw new ApiError(404, 'NOT_FOUND', 'Rota não encontrada.');

  if (resource === 'me' && method === 'GET') return send(res, 200, requestIdValue, { actor: { uid: actor.uid, email: actor.email, name: actor.name, role: actor.role, permissions: actor.role === 'super_admin' ? ['*'] : [...new Set(ROLE_PERMISSIONS[actor.role].concat(actor.extras))] } });
  if (resource === 'dashboard' && method === 'GET') { requirePermission(actor, 'dashboard.read'); return send(res, 200, requestIdValue, await dashboard()); }
  if (resource === 'dashboard' && id === 'rebuild' && method === 'POST') {
    requirePermission(actor, 'dashboard.rebuild');
    await rateLimit(actor, 'dashboard.rebuild', 3, 3600);
    const metrics = await rebuildDashboardMetrics();
    await writeAudit(actor, req, requestIdValue, 'dashboard.rebuild', 'metrics', 'global', { metrics });
    return send(res, 200, requestIdValue, await dashboard());
  }
  if (resource === 'users' && method === 'GET' && !id) { requirePermission(actor, 'users.read'); return send(res, 200, requestIdValue, await listUsers(url.searchParams.get('cursor'), url.searchParams.get('limit'))); }
  if (resource === 'users' && method === 'GET' && id) { requirePermission(actor, 'users.read'); return send(res, 200, requestIdValue, await userDetail(id)); }
  if (resource === 'content' && method === 'GET' && !id) { requirePermission(actor, 'content.read'); return send(res, 200, requestIdValue, await listQuery(db.collection('content_overrides'), db.collection('content_overrides').orderBy('updatedAt', 'desc'), url.searchParams.get('cursor'), url.searchParams.get('limit'))); }
  if (resource === 'comments' && method === 'GET' && !id) { requirePermission(actor, 'comments.read'); return send(res, 200, requestIdValue, await listComments(url.searchParams.get('limit'))); }
  if (resource === 'reports' && method === 'GET' && !id) { requirePermission(actor, 'reports.read'); return send(res, 200, requestIdValue, await listQuery(db.collection('reports'), db.collection('reports').orderBy('createdAt', 'desc'), url.searchParams.get('cursor'), url.searchParams.get('limit'))); }
  if (resource === 'notifications' && method === 'GET' && !id) { requirePermission(actor, 'notifications.read'); return send(res, 200, requestIdValue, await listQuery(db.collection('notification_jobs'), db.collection('notification_jobs').orderBy('createdAt', 'desc'), url.searchParams.get('cursor'), url.searchParams.get('limit'))); }
  if (resource === 'settings' && method === 'GET') { requirePermission(actor, 'settings.read'); const [settings, versions] = await Promise.all([db.doc('config/app_settings').get(), db.doc('config/app_versions').get()]); return send(res, 200, requestIdValue, { settings: cleanForAudit(settings.data() || {}), versions: cleanForAudit(versions.data() || {}), unavailable: [...(!settings.exists ? ['config/app_settings'] : []), ...(!versions.exists ? ['config/app_versions'] : [])] }); }
  if (resource === 'audit-logs' && method === 'GET') { requirePermission(actor, 'audit.read'); return send(res, 200, requestIdValue, await listQuery(db.collection('auditLogs'), db.collection('auditLogs').orderBy('createdAt', 'desc'), url.searchParams.get('cursor'), url.searchParams.get('limit'))); }
  if (resource === 'admins' && method === 'GET') { requirePermission(actor, 'admins.read'); return send(res, 200, requestIdValue, await listAdmins()); }
  if (resource === 'integrations' && method === 'GET') {
    requirePermission(actor, 'integrations.read');
    return send(res, 200, requestIdValue, { items: [
      { id: 'firebase', configured: true },
      { id: 'tmdb', configured: secretConfigured(TMDB_API_KEY, 'TMDB_API_KEY') },
      { id: 'giphy', configured: Boolean(process.env.GIPHY_API_KEY) },
    ], nextCursor: null });
  }

  await rateLimit(actor, `${method}:${resource}`, method === 'GET' ? 60 : 20);
  if (resource === 'users' && id && method === 'PATCH') {
    requirePermission(actor, 'users.update');
    if (id === actor.uid) throw new ApiError(403, 'SELF_UPDATE_DENIED', 'Use a área de conta para alterar seus próprios dados.');
    const before = await userDetail(id);
    const displayName = cleanString(body.displayName, 120);
    const authUpdate = displayName ? { displayName } : {};
    if (Object.keys(authUpdate).length) await auth.updateUser(id, authUpdate);
    const profileUpdate = {};
    if (displayName) profileUpdate.name = displayName;
    if (typeof body.proMember === 'boolean') profileUpdate.proMember = body.proMember;
    if (Object.keys(profileUpdate).length) await db.doc(`users/${id}`).set({ profile: profileUpdate, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const after = await userDetail(id);
    await writeAudit(actor, req, requestIdValue, 'users.update', 'users', id, { before, after });
    return send(res, 200, requestIdValue, after);
  }
  if (resource === 'users' && id && method === 'POST' && ['suspend', 'ban', 'restore'].includes(action)) {
    const permission = action === 'ban' ? 'users.ban' : 'users.suspend';
    const confirmation = action === 'ban' ? 'BANIR' : action === 'suspend' ? 'SUSPENDER' : 'REATIVAR';
    requirePermission(actor, permission); requireConfirmation(body, confirmation);
    if (action === 'ban') requireRecentAuth(actor);
    if (id === actor.uid) throw new ApiError(403, 'SELF_ACTION_DENIED', 'Você não pode suspender ou banir a própria conta.');
    const receipt = await claimIdempotency(actor, req, `users.${action}`);
    const before = await userDetail(id);
    await auth.updateUser(id, { disabled: action !== 'restore' });
    await auth.revokeRefreshTokens(id);
    const accountStatus = action === 'ban' ? 'banned' : action === 'suspend' ? 'suspended' : 'active';
    await db.doc(`users/${id}`).set({ accountStatus, accountStatusReason: cleanString(body.reason, 500), accountStatusUpdatedAt: FieldValue.serverTimestamp(), accountStatusUpdatedBy: actor.uid }, { merge: true });
    await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit(actor, req, requestIdValue, `users.${action}`, 'users', id, { before, reason: cleanString(body.reason, 500) });
    return send(res, 200, requestIdValue, { uid: id, status: accountStatus });
  }
  if (resource === 'users' && id && method === 'DELETE') {
    requirePermission(actor, 'users.delete'); requireRecentAuth(actor); requireConfirmation(body, 'EXCLUIR');
    if (id === actor.uid) throw new ApiError(403, 'SELF_ACTION_DENIED', 'Você não pode excluir a própria conta.');
    const adminRecord = await db.doc(`adminUsers/${id}`).get();
    if (adminRecord.exists && adminRecord.data().status === 'active') throw new ApiError(409, 'ACTIVE_ADMIN', 'Remova primeiro o acesso administrativo desta conta.');
    const receipt = await claimIdempotency(actor, req, 'users.delete'); const before = await userDetail(id);
    await auth.deleteUser(id); await db.doc(`users/${id}`).delete();
    await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'users.delete', 'users', id, { before });
    return send(res, 200, requestIdValue, { deleted: true });
  }
  if (resource === 'content' && id && method === 'PATCH') {
    requirePermission(actor, 'content.update');
    if (!/^(movie|tv)_[0-9]+$/.test(id)) throw new ApiError(400, 'INVALID_CONTENT_ID', 'Identificador de conteúdo inválido.');
    const ref = db.doc(`content_overrides/${id}`); const snap = await ref.get();
    const data = {
      localTitle: cleanString(body.localTitle, 200), localOverview: cleanString(body.localOverview, 3000),
      visibility: body.visibility === 'hidden' ? 'hidden' : 'published', featured: body.featured === true,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    };
    await ref.set(data, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'content.update', 'content_overrides', id, { before: snap.data() || null, after: data });
    return send(res, 200, requestIdValue, { id, ...cleanForAudit(data) });
  }
  if (resource === 'content' && id && method === 'DELETE') {
    requirePermission(actor, 'content.delete'); requireConfirmation(body, 'EXCLUIR');
    const receipt = await claimIdempotency(actor, req, 'content.delete'); const ref = db.doc(`content_overrides/${id}`); const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, 'NOT_FOUND', 'Override de conteúdo não encontrado.');
    await ref.delete(); await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'content.delete', 'content_overrides', id, { before: snap.data() });
    return send(res, 200, requestIdValue, { deleted: true });
  }
  if (resource === 'comments' && id && ['hide', 'show'].includes(action) && method === 'POST') {
    requirePermission(actor, 'comments.moderate');
    const path = decodeCursor(id);
    if (!path || !/^reviews\/[^/]+\/items\/[^/]+$/.test(path)) throw new ApiError(400, 'INVALID_COMMENT_ID', 'Identificador de comentário inválido.');
    const ref = db.doc(path); const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, 'NOT_FOUND', 'Comentário não encontrado.');
    const moderation = { hidden: action === 'hide', reason: cleanString(body.reason, 500), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
    await ref.set({ moderation }, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'comments.moderate', 'reviews', path, { before: snap.data(), after: moderation });
    return send(res, 200, requestIdValue, { hidden: action === 'hide' });
  }
  if (resource === 'reports' && id && method === 'PATCH') {
    requirePermission(actor, 'reports.resolve');
    const status = ['open', 'in_review', 'resolved', 'rejected'].includes(body.status) ? body.status : null;
    if (!status) throw new ApiError(422, 'INVALID_REPORT_STATUS', 'Status de denúncia inválido.');
    const ref = db.doc(`reports/${id}`); const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, 'NOT_FOUND', 'Denúncia não encontrada.');
    const update = { status, internalNote: cleanString(body.note, 2000), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
    await ref.set(update, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'reports.resolve', 'reports', id, { before: snap.data(), after: update });
    return send(res, 200, requestIdValue, { id, status });
  }
  if (resource === 'settings' && method === 'PATCH') {
    requirePermission(actor, 'settings.update'); requireRecentAuth(actor); requireConfirmation(body, 'ALTERAR');
    const receipt = await claimIdempotency(actor, req, 'settings.update');
    const ref = db.doc('config/app_settings'); const before = await ref.get();
    const settings = {
      maintenanceMode: body.maintenanceMode === true,
      registrationsEnabled: body.registrationsEnabled !== false,
      reviewsEnabled: body.reviewsEnabled !== false,
      commentsEnabled: body.commentsEnabled !== false,
      proEnabled: body.proEnabled !== false,
      defaultLocale: ['pt-BR', 'en-US', 'es-ES'].includes(body.defaultLocale) ? body.defaultLocale : 'pt-BR',
      defaultRegion: /^[A-Z]{2}$/.test(String(body.defaultRegion || '')) ? body.defaultRegion : 'BR',
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    };
    await ref.set(settings, { merge: true });
    if (body.versions && typeof body.versions === 'object') {
      const semantic = /^\d+\.\d+\.\d+$/;
      for (const platform of ['ios', 'android']) {
        const entry = body.versions[platform];
        if (!entry) continue;
        if (!semantic.test(entry.minimumVersion) || !semantic.test(entry.latestVersion)) throw new ApiError(422, 'INVALID_APP_VERSION', `Versão semântica inválida para ${platform}.`);
      }
      await db.doc('config/app_versions').set(cleanForAudit(body.versions), { merge: true });
    }
    await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'settings.update', 'config', 'app_settings', { before: before.data(), after: settings });
    return send(res, 200, requestIdValue, cleanForAudit(settings));
  }
  if (resource === 'notifications' && method === 'POST' && !id) {
    requirePermission(actor, 'notifications.create');
    const title = cleanString(body.title, 100); const message = cleanString(body.body, 500);
    if (!title || !message) throw new ApiError(400, 'INVALID_NOTIFICATION', 'Título e mensagem são obrigatórios.');
    const target = ['all', 'pro', 'free'].includes(body.target) ? body.target : 'all';
    const link = body.link ? safeHttpsUrl(body.link, ['maratonou.com', 'www.maratonou.com']) : '';
    const created = await db.collection('notification_jobs').add({ title, body: message, target, link, status: 'draft', createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid });
    await writeAudit(actor, req, requestIdValue, 'notifications.create', 'notification_jobs', created.id, { title, target });
    return send(res, 201, requestIdValue, { id: created.id, status: 'draft' });
  }
  if (resource === 'notifications' && id && action === 'send' && method === 'POST') {
    requirePermission(actor, 'notifications.send'); requireRecentAuth(actor); requireConfirmation(body, 'ENVIAR');
    const receipt = await claimIdempotency(actor, req, 'notifications.send');
    const ref = db.doc(`notification_jobs/${id}`); const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, 'NOT_FOUND', 'Notificação não encontrada.');
    if (snap.data().status !== 'draft') throw new ApiError(409, 'INVALID_STATE', 'Somente rascunhos podem ser enviados.');
    await ref.update({ status: 'pending', scheduledAt: new Date().toISOString(), approvedBy: actor.uid, approvedAt: FieldValue.serverTimestamp() });
    await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'notifications.send', 'notification_jobs', id);
    return send(res, 202, requestIdValue, { id, status: 'pending' });
  }
  if (resource === 'comments' && id && method === 'DELETE') {
    requirePermission(actor, 'comments.delete'); requireConfirmation(body, 'EXCLUIR');
    const receipt = await claimIdempotency(actor, req, 'comments.delete');
    const path = decodeCursor(id);
    if (!path || !/^reviews\/[^/]+\/items\/[^/]+$/.test(path)) throw new ApiError(400, 'INVALID_COMMENT_ID', 'Identificador de comentário inválido.');
    const ref = db.doc(path); const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, 'NOT_FOUND', 'Comentário não encontrado.');
    await ref.delete(); await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'comments.delete', 'reviews', path, { before: snap.data() });
    return send(res, 200, requestIdValue, { deleted: true });
  }
  if (resource === 'admins' && method === 'POST' && !id) {
    requirePermission(actor, 'admins.create'); requireRecentAuth(actor); requireConfirmation(body, 'CONCEDER');
    const receipt = await claimIdempotency(actor, req, 'admins.create');
    const user = body.uid ? await auth.getUser(cleanString(body.uid, 128)).catch(() => null) : await auth.getUserByEmail(cleanString(body.email, 254)).catch(() => null);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
    const result = await setAdmin(actor, user.uid, body, 'create'); await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit(actor, req, requestIdValue, 'admins.create', 'adminUsers', user.uid, { after: result });
    return send(res, 201, requestIdValue, result);
  }
  if (resource === 'admins' && id && method === 'PATCH') {
    requirePermission(actor, 'admins.update'); requireRecentAuth(actor); requireConfirmation(body, 'ALTERAR');
    const receipt = await claimIdempotency(actor, req, 'admins.update'); const result = await setAdmin(actor, id, body, 'update');
    await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true }); await writeAudit(actor, req, requestIdValue, 'admins.update', 'adminUsers', id, { after: result });
    return send(res, 200, requestIdValue, result);
  }
  if (resource === 'admins' && id && method === 'DELETE') {
    requirePermission(actor, 'admins.remove'); requireRecentAuth(actor); requireConfirmation(body, 'REMOVER');
    if (id === actor.uid) throw new ApiError(403, 'SELF_PRIVILEGE_CHANGE_DENIED', 'Você não pode remover a si mesmo.');
    if (await lastSuperAdminWouldBeRemoved(id, null, 'inactive')) throw new ApiError(409, 'LAST_SUPER_ADMIN', 'O último superadministrador ativo não pode ser removido.');
    const receipt = await claimIdempotency(actor, req, 'admins.remove'); const ref = db.doc(`adminUsers/${id}`); const before = await ref.get();
    if (!before.exists) throw new ApiError(404, 'NOT_FOUND', 'Administrador não encontrado.');
    const user = await auth.getUser(id); const claims = user.customClaims || {}; delete claims.admin; delete claims.role; delete claims.authVersion;
    await auth.setCustomUserClaims(id, claims); await auth.revokeRefreshTokens(id); await ref.set({ status: 'inactive', authVersion: Number(before.data().authVersion || 0) + 1, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await receipt.set({ status: 'complete', completedAt: FieldValue.serverTimestamp() }, { merge: true }); await writeAudit(actor, req, requestIdValue, 'admins.remove', 'adminUsers', id, { before: before.data() });
    return send(res, 200, requestIdValue, { removed: true });
  }
  throw new ApiError(404, 'NOT_FOUND', 'Rota administrativa não encontrada.');
}

exports.centralApi = onRequest({
  cors: false,
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 10,
  concurrency: 20,
  secrets: [AUDIT_IP_HASH_SECRET, TMDB_API_KEY],
}, async (req, res) => {
  const id = requestId(req);
  try {
    const parts = pathParts(req);
    if (parts[0] !== 'v1') throw new ApiError(404, 'NOT_FOUND', 'Versão da API não encontrada.');
    if (parts[1] === 'public' && parts[2] === 'health' && req.method === 'GET') return send(res, 200, id, { status: 'ok', apiVersion: 'v1', service: 'maratonou-api' });
    validateOrigin(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
    const access = await requireCloudflareAccess(req);
    await verifyAppCheck(req);
    const actor = await requireAdmin(req, access);
    return await route(req, res, actor, id, parts);
  } catch (error) { return sendError(res, error, id); }
});

#!/usr/bin/env node

/**
 * Migrates sensitive fields out of the authenticated-readable users/{uid}
 * document. The script is intentionally dry-run by default.
 *
 *   npm run migrate:private-data:dry
 *   npm run migrate:private-data:apply
 *   npm run migrate:private-data:verify
 *
 * Optional flags:
 *   --uid=<uid>          inspect/migrate one account only
 *   --batch-size=<n>     page size between 10 and 100 (default: 50)
 *   --state=<path>       local resume state used only with --apply
 *   --restart            ignore the saved cursor and start from the beginning
 *
 * Safety guarantees:
 * - Existing private/system target documents are authoritative and are never
 *   overwritten by legacy public data.
 * - Target creation and deletion of the matching public field happen in the
 *   same per-user batch.
 * - A failed or repeated run is idempotent. Applied paged runs resume from a
 *   local cursor; --verify always scans from the beginning.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';

const argv = process.argv.slice(2);
const flags = new Set(argv);
const option = (name, fallback = '') => (
  argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback
);
const apply = flags.has('--apply');
const verify = flags.has('--verify');
const targetUid = option('--uid');
const batchSize = Math.min(100, Math.max(10, Number(option('--batch-size', '50')) || 50));
const statePath = resolve(option(
  '--state',
  'scripts/migrations/.private-user-data-state.json',
));
const schemaVersion = 1;
const sensitivePublicFields = [
  'prefs',
  'expenses',
  'blocked_list',
  'ep_watched',
  'lastActiveAt',
  'fcm_tokens',
  'adminAccess',
  'accountStatus',
  'accountStatusReason',
  'accountStatusUpdatedAt',
  'accountStatusUpdatedBy',
];

if (apply && verify) {
  throw new Error('Use --apply ou --verify, nunca os dois ao mesmo tempo.');
}

async function credential() {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) return applicationDefault();
  return cert(JSON.parse(await readFile(resolve(path), 'utf8')));
}

if (!getApps().length) initializeApp({ credential: await credential() });
const db = getFirestore();

async function loadState() {
  if (!apply || flags.has('--restart') || targetUid) return {};
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return {};
  }
}

const state = await loadState();

async function saveState() {
  if (!apply || targetUid) return;
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

const report = {
  mode: verify ? 'verify' : apply ? 'apply' : 'dry-run',
  usersRead: 0,
  usersWithLegacyData: 0,
  usersChanged: 0,
  publicFieldsRemoved: 0,
  targetsCreated: 0,
  authoritativeTargetsPreserved: 0,
  cleanUsers: 0,
  conflicts: [],
  remainingLegacyFields: [],
};

function legacyFields(data) {
  return sensitivePublicFields.filter((field) => Object.hasOwn(data, field));
}

function privateValue(value) {
  return {
    value,
    schemaVersion,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function accountValue(data) {
  const value = { schemaVersion };
  for (const field of [
    'adminAccess',
    'accountStatus',
    'accountStatusReason',
    'accountStatusUpdatedAt',
    'accountStatusUpdatedBy',
  ]) {
    if (Object.hasOwn(data, field)) value[field] = data[field];
  }
  return value;
}

function targetSpecs(userRef, data) {
  const specs = [
    Object.hasOwn(data, 'prefs') && {
      id: 'preferences',
      fields: ['prefs'],
      ref: userRef.collection('private').doc('preferences'),
      value: privateValue(data.prefs),
    },
    Object.hasOwn(data, 'expenses') && {
      id: 'expenses',
      fields: ['expenses'],
      ref: userRef.collection('private').doc('expenses'),
      value: privateValue(data.expenses),
    },
    Object.hasOwn(data, 'blocked_list') && {
      id: 'blocks',
      fields: ['blocked_list'],
      ref: userRef.collection('private').doc('blocks'),
      value: privateValue(data.blocked_list),
    },
    Object.hasOwn(data, 'ep_watched') && {
      id: 'history',
      fields: ['ep_watched'],
      ref: userRef.collection('private').doc('history'),
      value: privateValue(data.ep_watched),
    },
    Object.hasOwn(data, 'lastActiveAt') && {
      id: 'activity',
      fields: ['lastActiveAt'],
      ref: userRef.collection('private').doc('activity'),
      value: {
        lastActiveAt: data.lastActiveAt,
        schemaVersion,
      },
    },
    Object.hasOwn(data, 'fcm_tokens') && {
      id: 'push',
      fields: ['fcm_tokens'],
      ref: userRef.collection('private').doc('push'),
      value: {
        tokens: Array.isArray(data.fcm_tokens) ? data.fcm_tokens : [],
      },
    },
  ].filter(Boolean);

  const accountFields = [
    'adminAccess',
    'accountStatus',
    'accountStatusReason',
    'accountStatusUpdatedAt',
    'accountStatusUpdatedBy',
  ].filter((field) => Object.hasOwn(data, field));
  if (accountFields.length) {
    specs.push({
      id: 'system/account',
      fields: accountFields,
      ref: userRef.collection('system').doc('account'),
      value: accountValue(data),
    });
  }
  return specs;
}

async function processUser(userDoc) {
  report.usersRead += 1;
  const data = userDoc.data() || {};
  const fields = legacyFields(data);
  if (!fields.length) {
    report.cleanUsers += 1;
    return;
  }
  report.usersWithLegacyData += 1;

  const specs = targetSpecs(userDoc.ref, data);
  const snapshots = await db.getAll(...specs.map((spec) => spec.ref));
  const removals = new Set();
  const creates = [];

  specs.forEach((spec, index) => {
    const target = snapshots[index];
    spec.fields.forEach((field) => removals.add(field));
    if (target.exists) {
      report.authoritativeTargetsPreserved += 1;
      report.conflicts.push({
        uid: userDoc.id,
        target: spec.id,
        action: 'preserved-existing-target-and-removed-legacy-source',
      });
    } else {
      creates.push(spec);
    }
  });

  if (verify) {
    report.remainingLegacyFields.push({ uid: userDoc.id, fields });
    return;
  }

  report.usersChanged += 1;
  report.targetsCreated += creates.length;
  report.publicFieldsRemoved += removals.size;
  if (!apply) return;

  const batch = db.batch();
  creates.forEach((spec) => batch.create(spec.ref, spec.value));
  batch.update(userDoc.ref, Object.fromEntries(
    Array.from(removals, (field) => [field, FieldValue.delete()]),
  ));
  batch.set(userDoc.ref.collection('private').doc('migration_state'), {
    privateDataV1: true,
    privateDataMigratedAt: FieldValue.serverTimestamp(),
    schemaVersion,
  }, { merge: true });
  await batch.commit();
}

async function scanUsers() {
  if (targetUid) {
    const user = await db.collection('users').doc(targetUid).get();
    if (!user.exists) throw new Error(`Usuário não encontrado: ${targetUid}`);
    await processUser(user);
    return;
  }

  let cursor = verify || !apply ? null : state.cursor || null;
  while (true) {
    let query = db.collection('users').orderBy(FieldPath.documentId()).limit(batchSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const user of page.docs) await processUser(user);
    cursor = page.docs.at(-1).id;
    if (apply) {
      state.cursor = cursor;
      state.updatedAt = new Date().toISOString();
      await saveState();
    }
    if (page.size < batchSize) break;
  }

  if (apply) {
    state.cursor = null;
    state.completedAt = new Date().toISOString();
    await saveState();
  }
}

await scanUsers();

console.log(JSON.stringify(report, null, 2));
if (!apply) {
  console.log(
    verify
      ? `VERIFY: ${report.remainingLegacyFields.length} perfil(is) ainda contêm campos sensíveis.`
      : 'DRY-RUN: nenhum documento foi alterado. Use --apply somente após revisar este relatório.',
  );
}
if (verify && report.remainingLegacyFields.length) process.exitCode = 2;

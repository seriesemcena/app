import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveSafeContinueUrl, actionResultKey, ALLOWED_CONTINUE_HOSTS } from '../src/lib/authActionUrl.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('continueUrl allowlist blocks open redirects (production rules)', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    // Allowed: https on Maratonou-owned hosts.
    assert.ok(resolveSafeContinueUrl('https://maratonou.com/home'));
    assert.ok(resolveSafeContinueUrl('https://www.maratonou.com/user/x'));
    assert.equal(new URL(resolveSafeContinueUrl('https://maratonou.com/a?b=1')).host, 'maratonou.com');

    // Rejected: other hosts, non-https, dangerous schemes, relative/garbage.
    assert.equal(resolveSafeContinueUrl('https://evil.com'), null);
    assert.equal(resolveSafeContinueUrl('https://maratonou.com.evil.com'), null);
    assert.equal(resolveSafeContinueUrl('http://maratonou.com/home'), null); // non-https in prod
    assert.equal(resolveSafeContinueUrl('javascript:alert(1)'), null);
    assert.equal(resolveSafeContinueUrl('//maratonou.com'), null);
    assert.equal(resolveSafeContinueUrl('/relative/path'), null);
    assert.equal(resolveSafeContinueUrl(''), null);
    assert.equal(resolveSafeContinueUrl(null), null);
    assert.equal(resolveSafeContinueUrl(undefined), null);
  } finally {
    process.env.NODE_ENV = prev;
  }

  assert.deepEqual([...ALLOWED_CONTINUE_HOSTS], ['maratonou.com', 'www.maratonou.com']);
});

test('actionResultKey is stable, code-specific and never contains the raw code', () => {
  const a = actionResultKey('verifyEmail', 'SECRET_OOB_CODE_123');
  const b = actionResultKey('verifyEmail', 'SECRET_OOB_CODE_123');
  const c = actionResultKey('verifyEmail', 'DIFFERENT_CODE');
  assert.equal(a, b);              // stable across calls
  assert.notEqual(a, c);           // depends on the code
  assert.ok(!a.includes('SECRET_OOB_CODE_123')); // hashed — never persists the code
  assert.match(a, /^maratonou:auth-action:/);
});

test('/auth/action handles every mode with the existing Firebase config', () => {
  const page = read('src/app/auth/action/page.tsx');
  // The three action modes.
  for (const fn of ['applyActionCode', 'verifyPasswordResetCode', 'confirmPasswordReset', 'checkActionCode', 'sendPasswordResetEmail']) {
    assert.match(page, new RegExp(`\\b${fn}\\b`), `page must use ${fn}`);
  }
  // Reuses the app's Firebase — never re-inits from the URL apiKey.
  assert.match(page, /getFirebaseAuth\(\)/);
  assert.doesNotMatch(page, /initializeApp/);
  assert.match(page, /void params\.get\('apiKey'\)/);
  // verifyEmail refreshes the signed-in user so emailVerified flips.
  assert.match(page, /auth\.currentUser\.reload\(\)/);
  // Distinct guarded states.
  assert.match(page, /'missing-code'/);
  assert.match(page, /'unknown-mode'/);
  // useSearchParams needs a Suspense boundary.
  assert.match(page, /<Suspense/);
});

test('/auth/action follows the security rules', () => {
  const page = read('src/app/auth/action/page.tsx');
  // Never logs anything (so the oobCode can never leak to logs/analytics).
  assert.doesNotMatch(page, /console\./);
  // continueUrl only ever flows through the allowlist validator.
  assert.match(page, /resolveSafeContinueUrl/);
  assert.doesNotMatch(page, /location\.assign\(\s*params\.get/);
  // No raw HTML injection of any parameter.
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  // Processing runs once (StrictMode / refresh safe).
  assert.match(page, /startedRef/);
  assert.match(page, /actionResultKey/);
});

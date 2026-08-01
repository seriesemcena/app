import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('auth gate offers sign in and sign up without leaving the action behind', () => {
  const gate = read('src/components/AuthGateSheet.tsx');
  assert.match(gate, /export function useAuthGate\(\)/);
  // requireAuth runs the action for members; promptSignIn covers early returns.
  assert.match(gate, /const requireAuth = useCallback/);
  assert.match(gate, /const promptSignIn = useCallback/);
  assert.match(gate, /if \(user\) \{ action\(\); return; \}/);
  // "Criar conta" must land on the sign-up tab, not the generic landing.
  assert.match(gate, /'\/auth\?mode=register'/);
});

test('auth page opens the sign-up form when the gate asks for it', () => {
  const page = read('src/app/auth/page.tsx');
  assert.match(page, /searchParams\.get\('mode'\) === 'register'/);
  assert.match(page, /setMode\('register'\)/);
  // useSearchParams requires a Suspense boundary in the App Router.
  assert.match(page, /<Suspense fallback=\{null\}>/);
});

test('account-writing actions are gated across the app', () => {
  const title = read('src/app/title/[type]/[id]/page.tsx');
  assert.match(title, /promptSignIn\('favorite'\)/);
  assert.match(title, /requireAuth\('list'/);
  assert.match(title, /requireAuth\('rate'/);
  assert.match(title, /promptSignIn\('like'\)/);

  const episode = read('src/app/episode/page.tsx');
  assert.match(episode, /promptSignIn\('watch'\)/);
  assert.match(episode, /promptSignIn\('like'\)/);

  const comments = read('src/app/comments/page.tsx');
  assert.match(comments, /promptSignIn\('comment'\)/);
  assert.match(comments, /promptSignIn\('like'\)/);

  const addComment = read('src/app/add-comment/page.tsx');
  assert.match(addComment, /promptSignIn\('comment'\)/);

  const reviews = read('src/app/reviews/page.tsx');
  assert.match(reviews, /promptSignIn\('like'\)/);
});

test('every gated page renders the sheet', () => {
  for (const path of [
    'src/app/title/[type]/[id]/page.tsx',
    'src/app/episode/page.tsx',
    'src/app/comments/page.tsx',
    'src/app/add-comment/page.tsx',
    'src/app/reviews/page.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /\{authGate\}/, `${path} imports the gate but never renders it`);
  }
});

test('activity feed requires a session and waits for restore', () => {
  const feed = read('src/app/feed/page.tsx');
  assert.match(feed, /const \{ user, loading: sessionLoading \} = useAuth\(\)/);
  // Redirecting while the session is still restoring would kick out members.
  assert.match(feed, /if \(sessionLoading \|\| user\) return;/);
  assert.match(feed, /router\.replace\('\/auth'\)/);
});

test('gate copy exists in every supported locale', () => {
  for (const locale of ['pt-BR', 'en-US', 'es-ES']) {
    const auth = JSON.parse(read(`src/locales/${locale}/auth.json`));
    assert.ok(auth.gate?.title, `${locale} is missing gate.title`);
    assert.ok(auth.gate?.signIn, `${locale} is missing gate.signIn`);
    assert.ok(auth.gate?.createAccount, `${locale} is missing gate.createAccount`);
    for (const reason of ['comment', 'reply', 'rate', 'react', 'like', 'list', 'watch', 'favorite', 'report']) {
      assert.ok(auth.gate?.reason?.[reason], `${locale} is missing gate.reason.${reason}`);
    }
  }
});

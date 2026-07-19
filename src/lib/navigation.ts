import { internalHref } from '@/lib/appEnvironment';

const NAV_STACK_KEY = 'maratonou:navigation-stack:v1';
const MAX_STACK_SIZE = 40;
const PROFILE_ORIGIN_PARAM = 'from';
const PROFILE_ORIGIN_VALUE = 'profile';

type RouterLike = {
  back: () => void;
  push: (href: string) => void;
  replace: (href: string) => void;
};

function readStack(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(NAV_STACK_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try { sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK_SIZE))); } catch {}
}

/** Records SPA locations and also recognises browser/Android back navigation. */
export function recordInternalLocation(location: string) {
  if (typeof window === 'undefined') return;
  const stack = readStack();
  if (stack.at(-1) === location) return;

  const previousIndex = stack.lastIndexOf(location);
  if (previousIndex >= 0) writeStack(stack.slice(0, previousIndex + 1));
  else writeStack([...stack, location]);
}

/** Keeps a directly opened deep link inside the app instead of leaving the PWA. */
export function navigateBack(router: Pick<RouterLike, 'back' | 'replace'>, fallback = '/home') {
  if (typeof window === 'undefined') {
    router.replace(fallback);
    return;
  }
  const stack = readStack();
  if (stack.length > 1) {
    writeStack(stack.slice(0, -1));
    router.back();
  } else {
    router.replace(fallback);
  }
}

/** Routes same-origin URLs through Next and sends genuinely external URLs outside. */
export function navigateTo(router: Pick<RouterLike, 'push'>, target: string) {
  const href = internalHref(target);
  if (href) {
    router.push(href);
    return;
  }
  if (typeof window !== 'undefined') {
    window.open(target, '_blank', 'noopener,noreferrer');
  }
}

/** Marks shared destinations so the app shell keeps Perfil selected. */
export function withProfileOrigin(target: string) {
  const url = new URL(target, 'https://maratonou.local');
  url.searchParams.set(PROFILE_ORIGIN_PARAM, PROFILE_ORIGIN_VALUE);
  return `${url.pathname}${url.search}${url.hash}`;
}

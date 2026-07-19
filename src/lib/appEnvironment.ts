export type AppPlatform = 'ios' | 'android' | 'web';

export type AppEnvironment = {
  platform: AppPlatform;
  isStandalone: boolean;
  isCapacitor: boolean;
  isMobile: boolean;
};

export const DEFAULT_APP_ENVIRONMENT: AppEnvironment = {
  platform: 'web',
  isStandalone: false,
  isCapacitor: false,
  isMobile: false,
};

/** Detects the current shell without using it as a substitute for responsive CSS. */
export function detectAppEnvironment(): AppEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return DEFAULT_APP_ENVIRONMENT;
  }

  const ua = navigator.userAgent || '';
  const nav = navigator as Navigator & { standalone?: boolean };
  const capacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  const isCapacitor = Boolean(capacitor?.isNativePlatform?.());
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = isCapacitor
    || window.matchMedia('(display-mode: standalone)').matches
    || nav.standalone === true;

  return {
    platform: isIOS ? 'ios' : isAndroid ? 'android' : 'web',
    isStandalone,
    isCapacitor,
    isMobile: isIOS || isAndroid || window.matchMedia('(pointer: coarse)').matches,
  };
}

export function isInternalAppUrl(value: string, origin?: string): boolean {
  if (!value || /^(mailto:|tel:|sms:|intent:)/i.test(value)) return false;
  if (typeof window === 'undefined' && !origin) return value.startsWith('/');
  try {
    const base = origin ?? window.location.origin;
    return new URL(value, base).origin === base;
  } catch {
    return false;
  }
}

export function internalHref(value: string, origin?: string): string | null {
  if (!isInternalAppUrl(value, origin)) return null;
  try {
    const base = origin ?? window.location.origin;
    const url = new URL(value, base);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.startsWith('/') ? value : null;
  }
}

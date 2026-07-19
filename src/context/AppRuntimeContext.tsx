'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  DEFAULT_APP_ENVIRONMENT,
  detectAppEnvironment,
  type AppEnvironment,
} from '@/lib/appEnvironment';
import { recordInternalLocation } from '@/lib/navigation';

type RuntimeState = AppEnvironment & {
  isOnline: boolean;
  isKeyboardOpen: boolean;
  retryConnection: () => Promise<boolean>;
};

const RuntimeContext = createContext<RuntimeState>({
  ...DEFAULT_APP_ENVIRONMENT,
  isOnline: true,
  isKeyboardOpen: false,
  retryConnection: async () => true,
});

function isEditableElement(element: Element | null) {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || (element instanceof HTMLElement && element.isContentEditable);
}

export function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [environment, setEnvironment] = useState(DEFAULT_APP_ENVIRONMENT);
  const [isOnline, setIsOnline] = useState(true);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const updateEnvironment = () => {
      const next = detectAppEnvironment();
      setEnvironment(next);
      root.dataset.platform = next.platform;
      root.dataset.standalone = String(next.isStandalone);
      root.dataset.capacitor = String(next.isCapacitor);
    };

    const updateViewport = () => {
      const active = document.activeElement;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      const offset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
      const keyboardOpen = isEditableElement(active) && offset > 100;
      root.style.setProperty('--keyboard-offset', `${keyboardOpen ? offset : 0}px`);
      root.style.setProperty('--visual-viewport-height', `${viewportHeight}px`);
      root.dataset.keyboardOpen = String(keyboardOpen);
      setIsKeyboardOpen(keyboardOpen);
    };

    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    const displayMode = window.matchMedia('(display-mode: standalone)');

    setIsOnline(navigator.onLine);
    updateEnvironment();
    updateViewport();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('focusin', updateViewport);
    window.addEventListener('focusout', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    displayMode.addEventListener?.('change', updateEnvironment);

    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focusin', updateViewport);
      window.removeEventListener('focusout', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      displayMode.removeEventListener?.('change', updateEnvironment);
      delete root.dataset.keyboardOpen;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    recordInternalLocation(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  }, [pathname]);

  useEffect(() => {
    if (!environment.isStandalone && !environment.isCapacitor) return;
    const boundaryKey = '__maratonouBoundary';
    const guardKey = '__maratonouGuard';
    const current = window.history.state || {};
    if (!current[boundaryKey] && !current[guardKey]) {
      window.history.replaceState({ ...current, [boundaryKey]: true }, '', window.location.href);
      window.history.pushState({ ...current, [guardKey]: true }, '', window.location.href);
    }

    const keepInsideApp = (event: PopStateEvent) => {
      if (!event.state?.[boundaryKey]) return;
      router.replace('/home');
      window.history.pushState({ ...(window.history.state || {}), [guardKey]: true }, '', '/home');
      recordInternalLocation('/home');
    };
    window.addEventListener('popstate', keepInsideApp);
    return () => window.removeEventListener('popstate', keepInsideApp);
  }, [environment.isCapacitor, environment.isStandalone, router]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((item) => {
          const script = item.active?.scriptURL || item.waiting?.scriptURL || item.installing?.scriptURL || '';
          if (script.endsWith('/sw.js') || script.endsWith('/firebase-messaging-sw.js')) item.unregister().catch(() => {});
        });
      }).catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((result) => {
        if (cancelled) return;
        registration = result;
        return result.update();
      })
      .catch((error) => console.warn('[PWA] Service worker registration failed', error));

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) registration?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', checkForUpdate);
      window.removeEventListener('online', checkForUpdate);
    };
  }, []);

  const retryConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    try {
      const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
      const connected = response.ok;
      setIsOnline(connected);
      return connected;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  const value = useMemo(() => ({
    ...environment,
    isOnline,
    isKeyboardOpen,
    retryConnection,
  }), [environment, isOnline, isKeyboardOpen, retryConnection]);

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export const useAppRuntime = () => useContext(RuntimeContext);

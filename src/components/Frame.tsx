'use client';
import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MobileFrame } from './MobileFrame';
import { TabBar } from './TabBar';
import { Sidebar } from './Sidebar';
import { useTheme } from '@/context/ThemeContext';

const TAB_PATHS = ['/home', '/search', '/calendar', '/lists', '/profile', '/user', '/movies', '/series', '/feed', '/trends', '/title', '/settings'];

export function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const fromProfile = searchParams.get('from') === 'profile';
  const showTabs = fromProfile || TAB_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    document.documentElement.dataset.hasTabbar = String(showTabs);

    const nativeWindow = window as Window & {
      webkit?: { messageHandlers?: Record<string, { postMessage: (value: unknown) => void }> };
      __MARATONOU_NATIVE_UI__?: unknown;
    };
    const nativeHandler = nativeWindow.webkit?.messageHandlers?.maratonouNativeChrome;
    nativeHandler?.postMessage({ type: 'visibility', visible: showTabs });
    nativeHandler?.postMessage({ type: 'route', path: pathname });
    nativeHandler?.postMessage({ type: 'theme', value: theme });

    return () => {
      delete document.documentElement.dataset.hasTabbar;
    };
  }, [pathname, showTabs, theme]);

  useEffect(() => {
    // Builds published before 3cd179d mirrored every web header action with a
    // UIKit button. A Vercel update cannot replace that installed native code,
    // so neutralize its scanner until the user installs the next iOS build.
    // Removing this metadata does not affect the SVG rendered by React.
    const nativeWindow = window as Window & {
      webkit?: { messageHandlers?: Record<string, { postMessage: (value: unknown) => void }> };
      __MARATONOU_NATIVE_UI__?: unknown;
    };
    const isLegacyNativeHeader = document.documentElement.dataset.nativeControls === 'true'
      || Boolean(nativeWindow.__MARATONOU_NATIVE_UI__);
    if (!isLegacyNativeHeader) return;

    const selectors = [
      '.ios-top-action',
      '.glass-header-action-slot > button',
      '.app-bar-action-slot > button',
      '.landing-page-header > button',
    ].join(',');
    const nativeHandler = nativeWindow.webkit?.messageHandlers?.maratonouNativeChrome;
    let frame = 0;
    let firstRun = true;

    const disableLegacyHeaderControls = () => {
      frame = 0;
      let changed = false;
      document.querySelectorAll<HTMLElement>(selectors).forEach((button) => {
        if (button.hasAttribute('data-native-control-ready')) {
          button.removeAttribute('data-native-control-ready');
          changed = true;
        }
        button.querySelectorAll<HTMLElement>('[data-maratonou-icon-id]').forEach((icon) => {
          icon.removeAttribute('data-maratonou-icon-id');
          changed = true;
        });
      });
      if (firstRun || changed) {
        firstRun = false;
        nativeHandler?.postMessage({
          type: 'controls',
          route: `${location.pathname}${location.search}`,
          controls: [],
        });
        window.dispatchEvent(new CustomEvent('maratonou:native-chrome-sync'));
      }
    };
    const scheduleDisable = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(disableLegacyHeaderControls);
    };

    delete document.documentElement.dataset.nativeControls;
    scheduleDisable();
    const observer = new MutationObserver(scheduleDisable);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-maratonou-icon-id', 'data-native-control-ready'],
    });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const handleNativeTab = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (href) router.push(href);
    };
    window.addEventListener('maratonou:native-tab-select', handleNativeTab);
    return () => window.removeEventListener('maratonou:native-tab-select', handleNativeTab);
  }, [router]);

  return (
    <MobileFrame hasTabBar={showTabs} sidebar={showTabs ? <Sidebar /> : undefined}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div className="screen-anim" key={pathname} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>
        <div id="modal-root" style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none' }} />
        {showTabs && (
          <div className="tab-bar-wrap" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto' }}>
              <TabBar />
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

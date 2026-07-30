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

    const nativeHandler = (window as Window & {
      webkit?: { messageHandlers?: Record<string, { postMessage: (value: unknown) => void }> };
    }).webkit?.messageHandlers?.maratonouNativeChrome;
    nativeHandler?.postMessage({ type: 'visibility', visible: showTabs });
    nativeHandler?.postMessage({ type: 'route', path: pathname });
    nativeHandler?.postMessage({ type: 'theme', value: theme });

    return () => {
      delete document.documentElement.dataset.hasTabbar;
    };
  }, [pathname, showTabs, theme]);

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

'use client';
import { ReactNode, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { MobileFrame } from './MobileFrame';
import { TabBar } from './TabBar';
import { Sidebar } from './Sidebar';

const TAB_PATHS = ['/home', '/search', '/calendar', '/lists', '/profile', '/user', '/movies', '/series', '/feed', '/trends', '/title', '/settings'];

export function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromProfile = searchParams.get('from') === 'profile';
  const showTabs = fromProfile || TAB_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    document.documentElement.dataset.hasTabbar = String(showTabs);
    return () => {
      delete document.documentElement.dataset.hasTabbar;
    };
  }, [showTabs]);

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

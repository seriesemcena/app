'use client';
import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MobileFrame } from './MobileFrame';
import { TabBar } from './TabBar';

const TAB_PATHS = ['/home', '/search', '/calendar', '/lists', '/profile', '/movies', '/series', '/feed', '/trends', '/title', '/settings'];

export function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const showTabs = mounted && TAB_PATHS.some((p) => pathname?.startsWith(p));

  return (
    <MobileFrame>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div className="screen-anim" key={pathname} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>
        {/* Portal root — modais renderizam aqui, acima do TabBar */}
        <div id="modal-root" style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none' }} />
        {showTabs && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto' }}>
              <TabBar />
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

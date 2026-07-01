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
      <div className="screen-anim" key={pathname} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
      {showTabs && (
        <div style={{ flexShrink: 0, position: 'relative', zIndex: 30 }}>
          <TabBar />
        </div>
      )}
    </MobileFrame>
  );
}

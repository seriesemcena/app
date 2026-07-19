'use client';
import { ReactNode } from 'react';
import { T } from '@/lib/tokens';

export function MobileFrame({ children, sidebar, hasTabBar = false }: { children: ReactNode; sidebar?: ReactNode; hasTabBar?: boolean }) {
  return (
    <div className={`mf-outer${hasTabBar ? ' has-tabbar' : ''}`}>
      {sidebar && (
        <aside className="sidebar-nav" style={{ display: 'none' }}>
          {sidebar}
        </aside>
      )}
      <div className="mf-inner" style={{ background: T.bg }}>
        {children}
      </div>
    </div>
  );
}

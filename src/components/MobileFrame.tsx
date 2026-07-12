'use client';
import { ReactNode } from 'react';
import { T } from '@/lib/tokens';

export function MobileFrame({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  return (
    <div className="mf-outer">
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

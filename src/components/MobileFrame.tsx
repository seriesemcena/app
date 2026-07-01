'use client';
import { ReactNode } from 'react';
import { T } from '@/lib/tokens';

/**
 * On real mobile devices (< 520px): fills the entire screen edge-to-edge.
 * On desktop (≥ 520px): shows a phone mockup centered on a dark background.
 * In Capacitor native app: WebView already fills the screen, so it behaves
 * identically to the mobile path.
 */
export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mf-outer">
      <div className="mf-inner" style={{ background: T.bg }}>
        {children}
      </div>
    </div>
  );
}

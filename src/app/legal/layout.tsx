import type { ReactNode } from 'react';
import { T } from '@/lib/tokens';

/* Public, crawlable document shell for the store-required legal pages
   (privacy, terms, account deletion). No auth, no tab bar — these URLs are
   opened by Apple/Google reviewers and linked from the stores. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: T.bg,
      color: T.t1,
      paddingTop: 'calc(var(--safe-area-top) + 24px)',
      paddingBottom: 'calc(var(--safe-area-bottom) + 48px)',
      paddingLeft: 'calc(var(--safe-area-left) + 20px)',
      paddingRight: 'calc(var(--safe-area-right) + 20px)',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
        <a href="/settings" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: T.pink, textDecoration: 'none', fontSize: 14, fontWeight: 700,
          marginBottom: 24,
          fontFamily: "'Area','Inter',sans-serif",
        }}>← Maratonou</a>
        {children}
      </div>
    </div>
  );
}

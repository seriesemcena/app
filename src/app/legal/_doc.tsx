import type { ReactNode } from 'react';
import { T } from '@/lib/tokens';

const FONT = "'Area','Inter',sans-serif";

export const DocTitle = ({ children, updated }: { children: ReactNode; updated: string }) => (
  <header style={{ marginBottom: 28 }}>
    <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.5px', margin: 0, fontFamily: FONT, color: T.t1 }}>{children}</h1>
    <p style={{ fontSize: 13, color: T.t3, marginTop: 8, fontFamily: FONT }}>Última atualização: {updated}</p>
  </header>
);

export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 style={{ fontSize: 18, fontWeight: 800, margin: '28px 0 10px', fontFamily: FONT, color: T.t1 }}>{children}</h2>
);

export const P = ({ children }: { children: ReactNode }) => (
  <p style={{ fontSize: 15, lineHeight: 1.65, color: T.t2, margin: '0 0 12px', fontFamily: FONT }}>{children}</p>
);

export const UL = ({ items }: { items: ReactNode[] }) => (
  <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
    {items.map((it, i) => (
      <li key={i} style={{ fontSize: 15, lineHeight: 1.6, color: T.t2, marginBottom: 6, fontFamily: FONT }}>{it}</li>
    ))}
  </ul>
);

export const Mail = ({ addr }: { addr: string }) => (
  <a href={`mailto:${addr}`} style={{ color: T.pink, textDecoration: 'none', fontWeight: 600 }}>{addr}</a>
);

export const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} style={{ color: T.pink, textDecoration: 'none', fontWeight: 600 }}>{children}</a>
);

'use client';
import { useRouter, usePathname } from 'next/navigation';
import { T } from '@/lib/tokens';
import { Icon } from './Icon';
import { Logo } from './primitives';
import type { IconName } from '@/lib/tokens';

const NAV: Array<{ id: string; icon: IconName; href: string; label: string }> = [
  { id: 'home',    icon: 'home',    href: '/home',    label: 'Home'   },
  { id: 'series',  icon: 'tv',      href: '/series',  label: 'Séries' },
  { id: 'movies',  icon: 'film',    href: '/movies',  label: 'Filmes' },
  { id: 'feed',      icon: 'message', href: '/feed',      label: 'Atividade'   },
  { id: 'curadoria', icon: 'award',   href: '/curadoria', label: 'Curadoria IA' },
  { id: 'profile',   icon: 'user',    href: '/profile',   label: 'Perfil'       },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const active = NAV.find((t) => pathname?.startsWith(t.href))?.id;
  const isSettings = pathname?.startsWith('/settings');

  return (
    <div style={{
      width: 220, height: '100dvh', flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      background: T.surface, borderRight: `1px solid ${T.border}`,
      overflowY: 'auto', scrollbarWidth: 'none',
    } as React.CSSProperties}>

      {/* Logo */}
      <div style={{ height: 72, padding: '0 20px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}` }}>
        <Logo height={22} />
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 12, width: '100%',
                background: isActive ? 'rgba(192,105,255,0.12)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
            >
              <Icon name={item.icon} size={20} color={isActive ? T.pink : T.t3} />
              <span style={{
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                color: isActive ? T.pink : T.t2,
                fontFamily: "'Area','Inter',sans-serif",
                transition: 'color 0.15s ease',
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom: Settings */}
      <div style={{ padding: '12px 10px', borderTop: `1px solid ${T.border}` }}>
        <button
          onClick={() => router.push('/settings')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 14px', borderRadius: 12, width: '100%',
            background: isSettings ? 'rgba(192,105,255,0.12)' : 'transparent',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            transition: 'background 0.15s ease',
          }}
        >
          <Icon name="settings" size={20} color={isSettings ? T.pink : T.t3} />
          <span style={{
            fontSize: 14, fontWeight: isSettings ? 700 : 500,
            color: isSettings ? T.pink : T.t2,
            fontFamily: "'Area','Inter',sans-serif",
          }}>
            Configurações
          </span>
        </button>
      </div>
    </div>
  );
}

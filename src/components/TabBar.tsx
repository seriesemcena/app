'use client';
import { useRouter, usePathname } from 'next/navigation';
import { T } from '@/lib/tokens';
import { Icon } from './Icon';
import type { IconName } from '@/lib/tokens';

const TABS: Array<{ id: string; icon: IconName; href: string; label: string }> = [
  { id: 'home',    icon: 'home',    href: '/home',    label: 'Home'   },
  { id: 'series',  icon: 'tv',      href: '/series',  label: 'Séries' },
  { id: 'movies',  icon: 'film',    href: '/movies',  label: 'Filmes' },
  { id: 'feed',    icon: 'message', href: '/feed',    label: 'Feed'   },
  { id: 'profile', icon: 'user',    href: '/profile', label: 'Perfil' },
];

export function TabBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const active   = TABS.find((t) => pathname?.startsWith(t.href))?.id;

  return (
    /* Outer wrapper: transparent, espaço para o safe-area e margens laterais */
    <div style={{
      padding: '8px 14px 20px',
      background: 'transparent',
    }}>
      {/* Pill com liquid glass */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderRadius: 40,
        backdropFilter: 'blur(40px) saturate(200%) brightness(1.08)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(1.08)',
        background: 'rgba(22, 22, 26, 0.78)',
        border: '1px solid rgba(255,255,255,0.13)',
        boxShadow: [
          'inset 0 1px 0 rgba(255,255,255,0.22)',
          'inset 0 -1px 0 rgba(0,0,0,0.30)',
          '0 8px 32px rgba(0,0,0,0.55)',
          '0 2px 8px rgba(0,0,0,0.30)',
        ].join(', '),
        padding: '6px 0',
      } as React.CSSProperties}>
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => router.push(t.href)}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '3px 0',
              }}
            >
              {/* Ícone com indicador de ativo */}
              <div style={{
                width: 44, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 15,
                background: isActive
                  ? 'rgba(192,105,255,0.20)'
                  : 'transparent',
                boxShadow: isActive
                  ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 4px rgba(192,105,255,0.25)'
                  : 'none',
                transition: 'background 0.25s, box-shadow 0.25s',
              }}>
                <Icon name={t.icon} size={20} color={isActive ? T.pink : 'rgba(255,255,255,0.45)'} />
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? T.pink : 'rgba(255,255,255,0.40)',
                fontFamily: "'Area','Inter',sans-serif",
                lineHeight: 1,
                transition: 'color 0.25s',
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

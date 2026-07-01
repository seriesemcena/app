'use client';
import { useRouter, usePathname } from 'next/navigation';
import { T } from '@/lib/tokens';
import { Icon } from './Icon';
import type { IconName } from '@/lib/tokens';

const TABS: Array<{ id: string; icon: IconName; href: string; label: string }> = [
  { id: 'home',    icon: 'home',   href: '/home',    label: 'Home'     },
  { id: 'series',  icon: 'tv',     href: '/series',  label: 'Séries'   },
  { id: 'movies',  icon: 'film',   href: '/movies',  label: 'Filmes'   },
  { id: 'feed',    icon: 'message', href: '/feed',   label: 'Feed'     },
  { id: 'profile', icon: 'user',   href: '/profile', label: 'Perfil'   },
];

export function TabBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const active   = TABS.find((t) => pathname?.startsWith(t.href))?.id;

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: T.card,
      borderTop: `1px solid ${T.border}`,
      padding: '8px 4px 20px',
    }}>
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => router.push(t.href)}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            <div style={{
              width: 40, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 16,
              background: isActive ? 'rgba(240,80,194,0.12)' : 'transparent',
              transition: 'background 0.2s',
            }}>
              <Icon name={t.icon} size={20} color={isActive ? T.pink : T.t3} />
            </div>
            <span style={{
              fontSize: 10, fontWeight: isActive ? 700 : 500,
              color: isActive ? T.pink : T.t3,
              fontFamily: "'Area','Inter',sans-serif",
              lineHeight: 1,
            }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

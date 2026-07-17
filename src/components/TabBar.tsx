'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useRef, useState, useLayoutEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Icon } from './Icon';
import type { IconName } from '@/lib/tokens';

const TABS: Array<{ id: string; icon: IconName; href: string; label: string }> = [
  { id: 'home',    icon: 'home',    href: '/home',    label: 'Home'      },
  { id: 'series',  icon: 'tv',      href: '/series',  label: 'Séries'    },
  { id: 'movies',  icon: 'film',    href: '/movies',  label: 'Filmes'    },
  { id: 'feed',    icon: 'message', href: '/feed',    label: 'Atividade' },
  { id: 'profile', icon: 'user',    href: '/profile', label: 'Perfil'    },
];

// Spring: leading edge uses ease-out (runs ahead), trailing uses spring+delay (follows with bounce)
const EASE_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const SPRING   = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const DUR      = '0.38s';
const DELAY    = '0.06s';

const TAB_STYLES = `
  .tb-btn {
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }
  .tb-btn:focus-visible {
    outline: 2px solid rgba(192,105,255,0.75);
    outline-offset: 4px;
    border-radius: 9999px;
  }
  .tb-icon {
    transition: transform 0.20s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .tb-btn:active .tb-icon {
    transform: scale(0.84);
  }
  @media (prefers-reduced-motion: reduce) {
    .tb-icon { transition: none !important; }
    .tb-btn:active .tb-icon { transform: none !important; }
  }
`;

type CapsuleState = { left: number; right: number; transition: string } | null;

export function TabBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const active         = TABS.find((t) => pathname?.startsWith(t.href))?.id;
  const lastActiveRef  = useRef<string>(active ?? 'home');
  if (active !== undefined) lastActiveRef.current = active;
  const effectiveActive = active ?? lastActiveRef.current;
  const activeIndex    = TABS.findIndex((t) => t.id === effectiveActive);

  const pillRef    = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const btnRefs    = useRef<(HTMLButtonElement | null)[]>([]);
  const prevIndex  = useRef<number | null>(null);

  const [capsule, setCapsule] = useState<CapsuleState>(null);

  /* ── Pill tokens ────────────────────────────── */
  const pillBg = isDark
    ? 'rgba(14, 14, 16, 0.84)'
    : 'rgba(255, 255, 255, 0.90)';
  const pillBorder = isDark
    ? '1px solid rgba(255,255,255,0.10)'
    : '1px solid rgba(0,0,0,0.07)';
  const pillShadow = isDark
    ? ['0 18px 56px rgba(0,0,0,0.72)', '0 4px 16px rgba(0,0,0,0.42)',
       'inset 0 1px 0 rgba(255,255,255,0.13)', 'inset 0 -1px 0 rgba(0,0,0,0.32)'].join(', ')
    : ['0 4px 32px rgba(0,0,0,0.13)', '0 1px 8px rgba(0,0,0,0.07)',
       'inset 0 1.5px 0 rgba(255,255,255,1.00)', 'inset 0 -1px 0 rgba(0,0,0,0.06)'].join(', ');

  /* ── Capsule tokens ─────────────────────────── */
  const activeBg = isDark
    ? 'rgba(244, 244, 246, 0.97)'
    : 'rgba(8, 8, 10, 0.93)';
  const activeShadow = isDark
    ? ['0 2px 16px rgba(0,0,0,0.34)', '0 1px 4px rgba(0,0,0,0.20)',
       'inset 0 1px 0 rgba(255,255,255,0.60)'].join(', ')
    : ['0 2px 12px rgba(0,0,0,0.28)', '0 1px 4px rgba(0,0,0,0.16)',
       'inset 0 1px 0 rgba(255,255,255,0.07)'].join(', ');

  const activeColor   = isDark ? '#0B0B0D' : '#FFFFFF';
  const inactiveColor = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)';
  const activeTab     = TABS[activeIndex];

  /* ── Compute and slide capsule ───────────────── */
  useLayoutEffect(() => {
    const pill      = pillRef.current;
    const measure   = measureRef.current;
    const activeBtn = btnRefs.current[activeIndex];
    if (!pill || !measure || !activeBtn) return;

    const PILL_W   = pill.clientWidth;
    const MIN_EDGE = 8;
    const capW     = measure.offsetWidth;
    const pillRect = pill.getBoundingClientRect();
    const btnRect  = activeBtn.getBoundingClientRect();

    // Center capsule within the active button's actual rendered position
    const btnCenter = btnRect.left - pillRect.left + btnRect.width / 2;
    let cssLeft  = btnCenter - capW / 2;
    let cssRight = PILL_W - cssLeft - capW;

    // Clamp so capsule never touches pill edges
    if (cssLeft < MIN_EDGE) {
      cssLeft  = MIN_EDGE;
      cssRight = PILL_W - MIN_EDGE - capW;
    } else if (cssRight < MIN_EDGE) {
      cssRight = MIN_EDGE;
      cssLeft  = PILL_W - MIN_EDGE - capW;
    }

    const prev    = prevIndex.current;
    const isFirst = prev === null;
    prevIndex.current = activeIndex;

    let transition: string;

    if (isFirst) {
      transition = 'none';
    } else if (activeIndex > prev!) {
      // Moving RIGHT → right edge leads (ease-out), left edge trails (spring + delay)
      transition = `left ${DUR} ${DELAY} ${SPRING}, right ${DUR} ${EASE_OUT}`;
    } else {
      // Moving LEFT → left edge leads (ease-out), right edge trails (spring + delay)
      transition = `left ${DUR} ${EASE_OUT}, right ${DUR} ${DELAY} ${SPRING}`;
    }

    setCapsule({ left: cssLeft, right: cssRight, transition });
  }, [activeIndex]);

  return (
    <>
      {/* Hidden measure: renders active content to get natural capsule width */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'fixed', top: -9999, left: -9999,
          display: 'flex', alignItems: 'center', gap: 6,
          paddingLeft: 16, paddingRight: 18, height: 44,
          pointerEvents: 'none', visibility: 'hidden',
          fontFamily: "'Area','Inter',sans-serif",
          fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
        }}
      >
        <Icon name={activeTab.icon} size={18} color={activeColor} />
        <span>{activeTab.label}</span>
      </div>

      <style>{TAB_STYLES}</style>

      {/* Outer wrapper — 22px sides gives the pill comfortable breathing room */}
      <div style={{
        padding: '8px 22px calc(12px + env(safe-area-inset-bottom))',
        background: 'transparent',
      }}>
        {/* Pill */}
        <div
          ref={pillRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            height: 64,
            borderRadius: 9999,
            padding: '10px 8px',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            background: pillBg,
            border: pillBorder,
            boxShadow: pillShadow,
          } as React.CSSProperties}
        >
          {/* ── Sliding capsule ── */}
          {capsule && (
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: capsule.left,
                right: capsule.right,
                height: 44,
                borderRadius: 9999,
                background: activeBg,
                boxShadow: activeShadow,
                pointerEvents: 'none',
                transition: capsule.transition,
              } as React.CSSProperties}
            />
          )}

          {/* ── Tab buttons ── */}
          {TABS.map((t, i) => {
            const isActive = effectiveActive === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => { btnRefs.current[i] = el; }}
                className="tb-btn"
                onClick={() => router.push(t.href)}
                aria-label={t.label}
                aria-current={active === t.id ? 'page' : undefined}
                style={{
                  flex: isActive ? 2 : 1,
                  minWidth: 0,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div className="tb-icon" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon
                    name={t.icon}
                    size={isActive ? 18 : 22}
                    color={isActive ? activeColor : inactiveColor}
                  />
                  {isActive && (
                    <span style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: activeColor,
                      fontFamily: "'Area','Inter',sans-serif",
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                      letterSpacing: '-0.2px',
                    }}>
                      {t.label}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

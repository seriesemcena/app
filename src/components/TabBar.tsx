'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRef, useState, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { useTheme } from '@/context/ThemeContext';
import { useMyProfileUrl } from '@/hooks/useMyProfileUrl';
import { Icon } from './Icon';
import type { IconName } from '@/lib/tokens';

const BASE_TABS: Array<{ id: string; icon: IconName; href: string; labelKey: string }> = [
  { id: 'home',    icon: 'home',    href: '/home',    labelKey: 'home'     },
  { id: 'series',  icon: 'tv',      href: '/series',  labelKey: 'series'   },
  { id: 'movies',  icon: 'film',    href: '/movies',  labelKey: 'movies'   },
  { id: 'feed',    icon: 'message', href: '/feed',    labelKey: 'activity' },
  { id: 'profile', icon: 'user',    href: '/profile', labelKey: 'profile'  },
];

// Spring: leading edge uses ease-out (runs ahead), trailing uses spring+delay (follows with bounce)
const EASE_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const SPRING   = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const DUR_MS   = 380;
const DELAY_MS = 60;

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

/* Every route change unmounts and rebuilds TabBar (each page renders its own
   <Frame>), so component refs reset and the capsule had nothing to animate
   from — it snapped. Parking the last active tab at module scope lets the
   fresh instance start where the previous one ended. Only the index is kept:
   pixels would go stale whenever the pill width changes between routes. */
let lastIndex: number | null = null;
let lastActiveTab = 'home';

export function TabBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t }    = useTranslation('navigation');
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // The profile tab points at the canonical /user/<username> route
  const myProfileUrl = useMyProfileUrl();
  const TABS = BASE_TABS.map(tab =>
    tab.id === 'profile' ? { ...tab, href: myProfileUrl } : tab
  );

  // Context pages don't share a prefix with their tab: title/episode pages
  // belong to Séries/Filmes, and ANY profile (own or someone else's) lights
  // up Perfil — /user/<slug> only equals the tab's own href for the owner.
  const fromProfile = searchParams.get('from') === 'profile';
  const contextActive =
    fromProfile || pathname?.startsWith('/settings') ? 'profile'
    : pathname?.startsWith('/title/tv') || pathname?.startsWith('/episode') ? 'series'
    : pathname?.startsWith('/title/movie') ? 'movies'
    : pathname?.startsWith('/user') || pathname?.startsWith('/profile') ? 'profile'
    : undefined;
  const active         = contextActive ?? TABS.find((t) => pathname?.startsWith(t.href))?.id;
  if (active !== undefined) lastActiveTab = active;
  const effectiveActive = active ?? lastActiveTab;
  const activeIndex    = TABS.findIndex((t) => t.id === effectiveActive);

  const pillRef    = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const btnRefs    = useRef<(HTMLButtonElement | null)[]>([]);
  const prevIndex  = useRef<number | null>(lastIndex);
  const capRef     = useRef<HTMLDivElement>(null);
  const animsRef   = useRef<Animation[]>([]);

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
    const pill    = pillRef.current;
    const measure = measureRef.current;
    if (!pill || !measure) return;

    const PILL_W   = pill.clientWidth;
    const MIN_EDGE = 8;
    const capW     = measure.offsetWidth;
    const pillRect = pill.getBoundingClientRect();

    // Measured off the live DOM for whichever tab we ask about, so it stays
    // correct even if the pill width changed since the previous route.
    const geomFor = (index: number) => {
      const btn = btnRefs.current[index];
      if (!btn) return null;
      const btnRect = btn.getBoundingClientRect();

      // Center capsule within that button's actual rendered position
      const btnCenter = btnRect.left - pillRect.left + btnRect.width / 2;
      let left  = btnCenter - capW / 2;
      let right = PILL_W - left - capW;

      // Clamp so capsule never touches pill edges
      if (left < MIN_EDGE) {
        left  = MIN_EDGE;
        right = PILL_W - MIN_EDGE - capW;
      } else if (right < MIN_EDGE) {
        right = MIN_EDGE;
        left  = PILL_W - MIN_EDGE - capW;
      }
      return { left, right };
    };

    const end = geomFor(activeIndex);
    if (!end) return;

    // Deliberately NOT advanced here. StrictMode runs this effect, tears it
    // down, then runs it again; mutating the ref in the body would leave the
    // second run thinking it had already arrived, and it would skip the
    // animation entirely. Advancing only on settle keeps the effect idempotent.
    const prev = prevIndex.current;

    // The capsule always renders at its destination; the travel is played on
    // top of it, so there is never a frame where the resting position is wrong.
    setCapsule({ ...end, transition: 'none' });

    const start = (prev === null || prev === activeIndex) ? null : geomFor(prev);
    if (!start) {
      prevIndex.current = activeIndex;
      lastIndex = activeIndex;
      return;
    }

    // Only claim the new tab once the capsule has actually settled there. The
    // outgoing instance is torn down mid-flight on every route change, and if
    // it had already claimed the destination the incoming instance would see
    // "already there" and render statically — which is why nothing animated.
    const settle = window.setTimeout(() => {
      prevIndex.current = activeIndex;
      lastIndex = activeIndex;
    }, DUR_MS + DELAY_MS + 20);

    const toRight = activeIndex > prev!;
    // Web Animations API rather than a CSS transition: it interpolates from an
    // explicit start value, so it does not depend on the browser having painted
    // the previous position. That timing is not guaranteed here — every route
    // change remounts this component, and StrictMode re-runs the effect — which
    // is exactly what made the transition collapse into a jump.
    const raf = requestAnimationFrame(() => {
      const node = capRef.current;
      if (!node) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animsRef.current.forEach((a) => a.cancel());
      // Leading edge runs ahead with ease-out; trailing edge follows with spring + delay
      animsRef.current = [
        node.animate(
          [{ left: `${start.left}px` }, { left: `${end.left}px` }],
          { duration: DUR_MS, delay: toRight ? DELAY_MS : 0,
            easing: toRight ? SPRING : EASE_OUT, fill: 'backwards' },
        ),
        node.animate(
          [{ right: `${start.right}px` }, { right: `${end.right}px` }],
          { duration: DUR_MS, delay: toRight ? 0 : DELAY_MS,
            easing: toRight ? EASE_OUT : SPRING, fill: 'backwards' },
        ),
      ];
    });

    // The rAF is intentionally left to fire: StrictMode's synchronous teardown
    // would otherwise cancel the only animation we scheduled. It no-ops safely
    // on a real unmount, when the capsule ref is already null.
    return () => clearTimeout(settle);
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
        <span>{t(activeTab.labelKey)}</span>
      </div>

      <style>{TAB_STYLES}</style>

      {/* Outer wrapper — 22px sides gives the pill comfortable breathing room */}
      <div style={{
        padding: '8px calc(22px + var(--safe-area-right)) calc(12px + var(--safe-area-bottom)) calc(22px + var(--safe-area-left))',
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
              ref={capRef}
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
          {TABS.map((tab, i) => {
            const isActive = effectiveActive === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => { btnRefs.current[i] = el; }}
                className="tb-btn"
                onClick={() => { lastActiveTab = tab.id; router.push(tab.href); }}
                aria-label={t(tab.labelKey)}
                aria-current={effectiveActive === tab.id ? 'page' : undefined}
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
                    name={tab.icon}
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
                      {t(tab.labelKey)}
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

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
  { id: 'search',  icon: 'search',  href: '/search',  labelKey: 'search'   },
  { id: 'movies',  icon: 'film',    href: '/movies',  labelKey: 'movies'   },
  { id: 'feed',    icon: 'message', href: '/feed',    labelKey: 'activity' },
  { id: 'profile', icon: 'user',    href: '/profile', labelKey: 'profile'  },
];

// SwiftUI's segmented controls use a short, highly damped spring. Moving the
// two horizontal edges independently recreates the matched-geometry stretch:
// the leading edge advances first and the trailing edge catches up softly.
const EASE_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const SPRING   = 'cubic-bezier(0.22, 1.28, 0.36, 1)';
const DUR_MS   = 440;
const DELAY_MS = 42;

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
    transform-origin: center;
    transition: transform 0.20s cubic-bezier(0.22, 1.28, 0.36, 1), opacity 0.16s ease;
  }
  .tb-btn:active .tb-icon {
    transform: scale(0.84);
  }
  .tb-btn[aria-current="page"] .tb-icon {
    animation: tb-segment-content-in 0.44s cubic-bezier(0.22, 1.28, 0.36, 1) both;
  }
  .tb-segment-label {
    display: inline-block;
    animation: tb-segment-label-in 0.34s cubic-bezier(0.22, 1.12, 0.36, 1) both;
    transform-origin: left center;
  }
  @keyframes tb-segment-content-in {
    0%   { opacity: 0.52; transform: scale(0.86); }
    62%  { opacity: 1; transform: scale(1.045); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes tb-segment-label-in {
    0%   { opacity: 0; transform: translateX(-7px) scale(0.92); }
    72%  { opacity: 1; transform: translateX(1px) scale(1.01); }
    100% { opacity: 1; transform: translateX(0) scale(1); }
  }
  .tb-pill {
    isolation: isolate;
    overflow: hidden;
    transform: translateZ(0);
  }
  .tb-pill::before,
  .tb-pill::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }
  .tb-pill::before {
    z-index: 1;
    background:
      radial-gradient(116% 92% at 16% -12%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.07) 31%, transparent 58%),
      linear-gradient(145deg, rgba(255,255,255,0.10) 0%, transparent 49%, rgba(255,255,255,0.04) 100%);
    mix-blend-mode: screen;
    opacity: 0.78;
  }
  .tb-pill::after {
    z-index: 1;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.26),
      inset 1px 0 0 rgba(255,255,255,0.08),
      inset 0 -1px 0 rgba(0,0,0,0.34);
  }
  .tb-capsule {
    overflow: hidden;
    will-change: left, right, transform;
    transform-origin: center;
    backdrop-filter: blur(14px) saturate(150%);
    -webkit-backdrop-filter: blur(14px) saturate(150%);
  }
  .tb-capsule::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(155deg, rgba(255,255,255,0.34), transparent 42%);
    opacity: 0.38;
    pointer-events: none;
  }
  html[data-platform="ios"][data-capacitor="true"] .tb-pill {
    background: rgba(38,38,42,0.48) !important;
    border-color: rgba(255,255,255,0.24) !important;
    backdrop-filter: blur(22px) saturate(180%) contrast(106%) brightness(108%) !important;
    -webkit-backdrop-filter: blur(22px) saturate(180%) contrast(106%) brightness(108%) !important;
    box-shadow:
      0 12px 36px rgba(0,0,0,0.34),
      0 4px 14px rgba(0,0,0,0.16),
      inset 0 1px 0 rgba(255,255,255,0.28),
      inset 0 -1px 0 rgba(255,255,255,0.08) !important;
  }
  html[data-platform="ios"][data-capacitor="true"][data-theme="light"] .tb-pill {
    background: rgba(255,255,255,0.68) !important;
    border-color: rgba(255,255,255,0.86) !important;
    backdrop-filter: blur(22px) saturate(170%) contrast(104%) brightness(104%) !important;
    -webkit-backdrop-filter: blur(22px) saturate(170%) contrast(104%) brightness(104%) !important;
    box-shadow:
      0 12px 36px rgba(31,31,38,0.12),
      0 4px 14px rgba(31,31,38,0.10),
      inset 0 1px 0 rgba(255,255,255,0.96),
      inset 0 -1px 0 rgba(70,70,78,0.08) !important;
  }
  html[data-platform="android"] .tb-pill {
    background: var(--c-card) !important;
    border-color: var(--c-border) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.18) !important;
  }
  html[data-platform="android"] .tb-pill::before,
  html[data-platform="android"] .tb-pill::after,
  html[data-platform="android"] .tb-capsule::after {
    display: none !important;
  }
  @media (prefers-reduced-transparency: reduce) {
    .tb-pill,
    .tb-capsule {
      background: var(--c-surface) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    .tb-pill::before,
    .tb-pill::after,
    .tb-capsule::after { display: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tb-icon { transition: none !important; }
    .tb-btn:active .tb-icon { transform: none !important; }
    .tb-btn[aria-current="page"] .tb-icon,
    .tb-segment-label { animation: none !important; }
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
    ? 'rgba(38, 38, 42, 0.48)'
    : 'rgba(255, 255, 255, 0.68)';
  const pillBorder = isDark
    ? '1px solid rgba(255,255,255,0.24)'
    : '1px solid rgba(255,255,255,0.86)';
  const pillShadow = isDark
    ? ['0 12px 36px rgba(0,0,0,0.34)', '0 4px 14px rgba(0,0,0,0.16)',
       'inset 0 1px 0 rgba(255,255,255,0.28)', 'inset 0 -1px 0 rgba(255,255,255,0.08)'].join(', ')
    : ['0 12px 36px rgba(31,31,38,0.12)', '0 4px 14px rgba(31,31,38,0.10)',
       'inset 0 1px 0 rgba(255,255,255,0.96)', 'inset 0 -1px 0 rgba(70,70,78,0.08)'].join(', ');

  /* ── Capsule tokens ─────────────────────────── */
  const activeBg = isDark
    ? 'rgba(244, 244, 246, 0.97)'
    : 'rgba(255, 255, 255, 0.98)';
  const activeShadow = isDark
    ? ['0 2px 16px rgba(0,0,0,0.34)', '0 1px 4px rgba(0,0,0,0.20)',
       'inset 0 1px 0 rgba(255,255,255,0.60)'].join(', ')
    : ['0 2px 12px rgba(0,0,0,0.28)', '0 1px 4px rgba(0,0,0,0.16)',
       'inset 0 1px 0 rgba(255,255,255,0.07)'].join(', ');

  const activeColor   = '#0B0B0D';
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
      // Leading edge runs ahead with ease-out; trailing edge follows with a
      // damped spring. The short vertical compression is the same tactile
      // settle used by SwiftUI segmented controls when selection changes.
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
        node.animate(
          [
            { transform: 'scaleY(1)', offset: 0 },
            { transform: 'scaleY(0.91)', offset: 0.30 },
            { transform: 'scaleY(1.025)', offset: 0.76 },
            { transform: 'scaleY(1)', offset: 1 },
          ],
          { duration: DUR_MS + DELAY_MS, easing: EASE_OUT },
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
      <div className="tab-bar-safe-wrap" style={{
        padding: '8px calc(22px + var(--safe-area-right)) var(--toolbar-bottom-gap) calc(22px + var(--safe-area-left))',
        background: 'transparent',
      }}>
        {/* Pill */}
        <div
          ref={pillRef}
          className="tb-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            height: 64,
            borderRadius: 9999,
            padding: '10px 8px',
            backdropFilter: 'blur(22px) saturate(180%) contrast(106%) brightness(108%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%) contrast(106%) brightness(108%)',
            background: pillBg,
            border: pillBorder,
            boxShadow: pillShadow,
          } as React.CSSProperties}
        >
          {/* ── Sliding capsule ── */}
          {capsule && (
            <div
              ref={capRef}
              className="tb-capsule"
              style={{
                position: 'absolute',
                top: 10,
                left: capsule.left,
                right: capsule.right,
                height: 44,
                borderRadius: 9999,
                background: activeBg,
                boxShadow: activeShadow,
                zIndex: 2,
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
                  zIndex: 3,
                }}
              >
                <div className="tb-icon" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon
                    name={tab.icon}
                    size={isActive ? 18 : 22}
                    color={isActive ? activeColor : inactiveColor}
                  />
                  {isActive && (
                    <span className="tb-segment-label" style={{
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

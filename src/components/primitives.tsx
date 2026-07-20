'use client';
import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '@/lib/tokens';
import { Icon } from './Icon';
import { useTheme } from '@/context/ThemeContext';

// size >= 20 → Greed (H1/H2 level); size < 20 → Area (H3/H4/body)
// size >= 20 → Greed (H1/H2); size < 20 → Area (H3/H4/body)
const fontFor = (size: number) =>
  size >= 20 ? "'Greed','Area',sans-serif" : "'Area',sans-serif";

export const Txt = ({
  size = 14, weight = 400, color, lineH, style = {}, children, ...rest
}: {
  size?: number; weight?: number; color?: string; lineH?: number; style?: CSSProperties; children?: ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) => (
  <span style={{ fontSize: `calc(${size}px * var(--font-scale, 1))`, fontWeight: weight, color: color || T.t1, lineHeight: lineH || 1.4, fontFamily: fontFor(size), ...style }} {...rest}>{children}</span>
);

export const Logo = ({ height = 22, style = {} }: { height?: number; style?: CSSProperties }) => (
  <>
    <img src="/logo_dark.png" alt="Maratonou" className="logo-dark"  style={{ height, width: 'auto', ...style }} />
    <img src="/logo_light.png" alt="Maratonou" className="logo-light" style={{ height, width: 'auto', ...style }} />
  </>
);

export const Screen = ({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) => (
  <div className="app-screen" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, fontFamily: "'Area',sans-serif", overflow: 'hidden', position: 'relative', ...style }}>{children}</div>
);

export const ScrollArea = ({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorY: 'contain', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', ...style, paddingBottom: 'var(--content-bottom-inset)' } as CSSProperties}>{children}</div>
);

export const AppBar = ({
  title, left, right, transparent,
}: { title?: string; left?: ReactNode; right?: ReactNode; transparent?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(var(--safe-area-top) + 12px) calc(var(--safe-area-right) + 16px) 12px calc(var(--safe-area-left) + 16px)', background: transparent ? 'transparent' : T.bg, borderBottom: transparent ? 'none' : `1px solid ${T.border}`, minHeight: 'calc(52px + var(--safe-area-top))', flexShrink: 0 }}>
    <div style={{ width: 44 }}>{left}</div>
    <Txt size={16} weight={700} color={T.t1}>{title}</Txt>
    <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
  </div>
);

/* ─────────────────────────────────────────────────────────
   GlassHeader — header sticky com logo centralizado,
   blur glass por trás, ação à esquerda e/ou direita
   ───────────────────────────────────────────────────────── */
export function GlassHeader({
  left, right, children, navTitle, showNavTitle,
}: {
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  navTitle?: string;
  showNavTitle?: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const tint = isDark
    ? 'linear-gradient(to bottom, rgba(13,13,15,0.82) 0%, rgba(13,13,15,0.30) 70%, transparent 100%)'
    : 'linear-gradient(to bottom, rgba(242,242,247,0.94) 0%, rgba(242,242,247,0.60) 70%, transparent 100%)';
  const navTitleColor = isDark ? '#fff' : 'rgba(0,0,0,0.85)';

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, flexShrink: 0, height: 'calc(56px + var(--safe-area-top))', overflow: 'visible' } as CSSProperties}>
      {/* Camadas de blur progressivo — opaco no topo, some para baixo */}
      {[
        { blur: 22, end: 35 },
        { blur: 14, end: 55 },
        { blur: 7,  end: 75 },
        { blur: 3,  end: 90 },
      ].map(({ blur, end }, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0,
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur}px)`,
          maskImage: `linear-gradient(to bottom, black 0%, transparent ${end}%)`,
          WebkitMaskImage: `linear-gradient(to bottom, black 0%, transparent ${end}%)`,
          pointerEvents: 'none',
        } as CSSProperties} />
      ))}

      {/* Tint em degradê — escuro no dark mode, cinza claro no light mode */}
      <div style={{
        position: 'absolute', inset: 0,
        background: tint,
        pointerEvents: 'none',
      }} />

      {/* Conteúdo — logo + botões */}
      <div style={{
        position: 'relative', zIndex: 2,
        height: 56, marginTop: 'var(--safe-area-top)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 12px',
      }}>
        <div style={{ width: 44, display: 'flex', alignItems: 'center' }}>{left}</div>

        <div style={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* Logo — some quando navTitle ativo */}
          <div style={{
            opacity: navTitle && showNavTitle ? 0 : 1,
            transform: navTitle && showNavTitle ? 'translateY(-4px) scale(0.92)' : 'translateY(0) scale(1)',
            transition: 'opacity 0.22s ease, transform 0.22s ease',
          } as CSSProperties}>
            {children ?? <Logo height={22} />}
          </div>

          {/* Nav title — aparece ao rolar */}
          {navTitle && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: showNavTitle ? 1 : 0,
              transform: showNavTitle ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity 0.22s ease, transform 0.22s ease',
              pointerEvents: 'none',
            } as CSSProperties}>
              <span style={{
                fontSize: 15, fontWeight: 800, color: navTitleColor,
                fontFamily: "'Area','Inter',sans-serif", letterSpacing: '-0.2px',
              }}>{navTitle}</span>
            </div>
          )}
        </div>

        <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>{right}</div>
      </div>
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'pink' | 'danger';
export const Btn = ({
  label, variant = 'primary', size = 'md', icon, onClick, style = {}, disabled = false, full = false,
}: {
  label: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg';
  icon?: Parameters<typeof Icon>[0]['name']; onClick?: () => void;
  style?: CSSProperties; disabled?: boolean; full?: boolean;
}) => {
  const [hov, setHov] = useState(false);
  const bases: Record<BtnVariant, CSSProperties> = {
    primary: { background: hov ? '#c4070f' : T.red, color: T.white, border: 'none' },
    secondary: { background: hov ? T.surface2 : T.surface, color: T.t1, border: `1px solid ${T.border}` },
    ghost: { background: 'transparent', color: hov ? T.t1 : T.t2, border: `1px solid ${hov ? T.border : 'transparent'}` },
    gold: { background: hov ? '#d4a810' : T.gold, color: '#000', border: 'none' },
    pink: { background: hov ? '#d040a8' : T.pink, color: T.white, border: 'none' },
    danger: { background: hov ? 'rgba(229,9,20,0.25)' : T.redDim, color: T.red, border: `1px solid rgba(229,9,20,0.3)` },
  };
  const pads = { sm: '8px 14px', md: '12px 20px', lg: '15px 28px' };
  const sizes = { sm: 12, md: 14, lg: 15 };
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: pads[size], borderRadius: T.radiusSm, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: "'Area','Inter',sans-serif", fontWeight: 600, fontSize: sizes[size], transition: 'all 0.15s ease', width: full ? '100%' : 'auto', ...bases[variant], ...style }}>
      {icon && <Icon name={icon} size={16} color={(bases[variant].color as string)} />}
      {label}
    </button>
  );
};

export const MetaChip = ({ label }: { label: string }) => (
  <div style={{ padding: '6px 16px', borderRadius: 20, background: 'var(--c-border)', display: 'inline-flex', alignItems: 'center' }}>
    <Txt size={12} weight={600} color={T.white}>{label}</Txt>
  </div>
);

export const Chip = ({ label, active, onClick, style = {} }: { label: string; active?: boolean; onClick?: () => void; style?: CSSProperties }) => (
  <button onClick={onClick} style={{ padding: '7px 14px', borderRadius: 20, border: active ? 'none' : `1px solid ${T.border}`, background: active ? T.active : 'transparent', color: active ? T.white : T.t2, fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s ease', flexShrink: 0, ...style }}>{label}</button>
);

export const PROBadge = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.goldDim, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 20, padding: size === 'sm' ? '3px 8px' : '5px 12px' }}>
    <Icon name="crown" size={size === 'sm' ? 10 : 13} color={T.gold} />
    <Txt size={size === 'sm' ? 9 : 11} weight={700} color={T.gold}>PRO</Txt>
  </div>
);

/** @deprecated Compatibility alias for older imports; renders the PRO badge. */
export const VIPBadge = PROBadge;

export const Skeleton = ({ w, h, radius = 8, style = {} }: { w: number | string; h: number | string; radius?: number; style?: CSSProperties }) => {
  const [pulse, setPulse] = useState(false);
  useEffect(() => { const iv = setInterval(() => setPulse((p) => !p), 800); return () => clearInterval(iv); }, []);
  return <div style={{ width: w, height: h, borderRadius: radius, background: pulse ? 'var(--c-glass-bg)' : 'var(--c-input-bg)', transition: 'background 0.8s ease', flexShrink: 0, ...style }} />;
};

export const Stars = ({ value = 0, max = 5, size = 14, onChange }: { value?: number; max?: number; size?: number; onChange?: (v: number) => void }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {[...Array(max)].map((_, i) => (
      <div key={i} onClick={() => onChange?.(i + 1)} style={{ cursor: onChange ? 'pointer' : 'default' }}>
        <Icon name="star" size={size} color={i < value ? T.gold : 'var(--c-t4)'} />
      </div>
    ))}
  </div>
);

export const Toast = ({ msg, visible, icon = 'check' }: { msg?: string | false | null; visible: boolean; icon?: Parameters<typeof Icon>[0]['name'] }) => (
  <div style={{ position: 'absolute', bottom: 'calc(var(--content-bottom-inset) + 10px)', left: '50%', transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`, opacity: visible ? 1 : 0, transition: 'all 0.25s ease', background: T.surface2, borderRadius: T.radiusSm, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100, whiteSpace: 'nowrap', border: `1px solid ${T.border}` }}>
    <Icon name={icon} size={14} color={T.pink} />
    <Txt size={13} weight={600}>{msg}</Txt>
  </div>
);

export const BottomSheet = ({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children?: ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.modalOpen = 'true';
    return () => { delete document.documentElement.dataset.modalOpen; };
  }, [visible]);

  const sheet = (
    <>
      {visible && (
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, pointerEvents: 'auto', touchAction: 'none' }} />
      )}
      <div
        aria-hidden={!visible}
        className={`safe-bottom-sheet${visible ? ' keyboard-aware-bottom' : ''}`}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)', background: T.surface, borderRadius: '20px 20px 0 0', zIndex: 51, maxHeight: '75%', overflow: 'hidden', display: 'flex', flexDirection: 'column', pointerEvents: visible ? 'auto' : 'none' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`, flexShrink: 0, position: 'relative' }}>
          <div style={{ width: 40 }} />
          <div style={{ width: 40, height: 4, background: T.t4, borderRadius: 2, position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
          <Txt size={15} weight={700}>{title}</Txt>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Icon name="close" size={18} color={T.t3} /></button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 16px calc(16px + var(--interactive-safe-bottom))' }}>{children}</div>
      </div>
    </>
  );

  if (!mounted) return null;
  const root = document.getElementById('modal-root');
  return root ? createPortal(sheet, root) : sheet;
};

export const StreamBadge = ({ name }: { name: string }) => {
  const colors: Record<string, string> = { Netflix: '#E50914', Prime: '#00A8E0', 'Disney+': '#113CCF', HBO: '#5800A0', Apple: '#555', Globo: '#D62929', Paramount: '#0064FF' };
  return (
    <div style={{ padding: '4px 10px', borderRadius: 6, background: colors[name] || T.surface2, display: 'inline-flex', alignItems: 'center' }}>
      <Txt size={10} weight={700} color={T.white}>{name}</Txt>
    </div>
  );
};

export const StreamCircle = ({ name = '', size = 52 }: { name?: string; size?: number }) => {
  const colors: Record<string, string> = { Netflix: '#E50914', Prime: '#00A8E0', 'Disney+': '#113CCF', HBO: '#5800A0', Apple: '#555', Globo: '#D62929', Paramount: '#0064FF' };
  const abbrev = (name || '').slice(0, 1).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: colors[name] || 'var(--c-t4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid var(--c-t4)` }}>
      <Txt size={size * 0.3} weight={800} color={T.white}>{abbrev}</Txt>
    </div>
  );
};

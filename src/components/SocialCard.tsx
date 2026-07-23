'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/primitives';
import { T, type IconName } from '@/lib/tokens';

export function SocialCard({ children, dimmed = false, edgeToEdge = false, onClick }: {
  children: ReactNode;
  dimmed?: boolean;
  edgeToEdge?: boolean;
  onClick?: () => void;
}) {
  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    if (!onClick) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return;
    onClick();
  };

  return (
    <article onClick={handleCardClick} style={{
      background: T.card, borderRadius: edgeToEdge ? 0 : 22, padding: edgeToEdge ? 16 : 14,
      borderTop: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`,
      borderLeft: edgeToEdge ? 'none' : `1px solid ${T.border}`,
      borderRight: edgeToEdge ? 'none' : `1px solid ${T.border}`,
      boxShadow: edgeToEdge ? 'none' : '0 3px 14px rgba(0,0,0,0.08)',
      position: 'relative', opacity: dimmed ? 0.5 : 1,
      transition: 'opacity 0.2s', overflow: 'visible',
      cursor: onClick ? 'pointer' : undefined,
    }}>
      {children}
    </article>
  );
}

export function SocialAuthor({
  name,
  time,
  avatar,
  photoUrl,
  color = T.pink,
  context,
  badge,
  endPadding = 0,
  contextOnSecondLine = false,
  onClick,
}: {
  name: string;
  time: string;
  avatar: string;
  photoUrl?: string;
  color?: string;
  context?: ReactNode;
  badge?: ReactNode;
  endPadding?: number;
  contextOnSecondLine?: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, paddingRight: endPadding }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Abrir perfil de ${name}`}
        style={{ width: 40, height: 40, borderRadius: 20, background: color, border: 'none', padding: 0, cursor: 'pointer', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <Txt size={14} weight={800} color="#fff">{avatar}</Txt>
        )}
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <button type="button" onClick={onClick} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
            <Txt size={14} weight={800} color={T.t1}>{name}</Txt>
          </button>
          {!contextOnSecondLine && context && <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>{context}</div>}
          {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
        </div>
        {contextOnSecondLine && context && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0, marginTop: 2 }}>
            {context}
          </div>
        )}
        {time && <Txt size={11} color={T.t4} style={{ display: 'block', marginTop: 1 }}>{time}</Txt>}
      </div>
    </div>
  );
}

export function SocialMedia({
  src,
  alt = '',
  compact = false,
}: {
  src: string;
  alt?: string;
  compact?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{
        width: compact ? '61%' : '100%',
        maxWidth: '100%',
        height: 'auto',
        margin: compact ? '0' : undefined,
        borderRadius: 16, display: 'block',
      }}
    />
  );
}

export function SocialAction({
  icon,
  active = false,
  onClick,
  children,
  ariaLabel,
  width,
  background,
}: {
  icon: IconName;
  active?: boolean;
  onClick: () => void;
  children?: ReactNode;
  ariaLabel?: string;
  width?: number;
  background?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: width ?? (children === undefined ? 40 : undefined), height: 40,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: width || children === undefined ? 0 : '0 12px',
        borderRadius: 20, background: active ? 'rgba(192,105,255,0.14)' : (background ?? T.surface2),
        border: `1px solid ${active ? 'rgba(192,105,255,0.24)' : T.border}`,
        cursor: 'pointer', color: active ? T.pink : T.t3,
      }}
    >
      <Icon name={icon} size={16} color="currentColor" />
      {children}
    </button>
  );
}

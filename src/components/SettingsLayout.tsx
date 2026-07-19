'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/primitives';
import { T } from '@/lib/tokens';

export function SettingsHeader({
  title,
  onBack,
  right,
  hideBack = false,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
  hideBack?: boolean;
}) {
  return (
    <div style={{
      minHeight: 68,
      padding: 'calc(var(--safe-area-top) + 12px) calc(var(--safe-area-right) + 16px) 12px calc(var(--safe-area-left) + 16px)',
      display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center',
      flexShrink: 0, background: T.bg,
    }}>
      <div>
        {!hideBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            style={{
              width: 40, height: 40, borderRadius: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.card, border: `1px solid ${T.border}`,
              boxShadow: '0 2px 10px rgba(0,0,0,0.08)', cursor: 'pointer',
            }}
          >
            <Icon name="chevronL" size={19} color={T.t1} />
          </button>
        )}
      </div>
      <Txt size={17} weight={800} color={T.t1} style={{ textAlign: 'center', letterSpacing: '-0.25px' }}>
        {title}
      </Txt>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
}

export function SettingsCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      background: T.card, borderRadius: 20, overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function SettingsPrimaryButton({
  label,
  onClick,
  disabled = false,
  style,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', minHeight: 54, padding: '14px 20px', borderRadius: 28,
        background: disabled ? T.surface2 : T.pink, border: 'none',
        color: disabled ? T.t3 : '#fff', cursor: disabled ? 'default' : 'pointer',
        fontFamily: "'Area','Inter',sans-serif", fontSize: 15, fontWeight: 800,
        boxShadow: disabled ? 'none' : '0 8px 22px rgba(192,105,255,0.24)',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export const settingsInputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', outline: 'none',
  border: 'none', background: 'transparent', color: T.t1,
  fontFamily: "'Area','Inter',sans-serif", fontSize: 14,
};

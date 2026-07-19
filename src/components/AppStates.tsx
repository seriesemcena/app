'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Logo, Skeleton, Txt } from '@/components/primitives';
import { T } from '@/lib/tokens';

export function StartupScreen({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="app-state app-startup" role="status" aria-live="polite">
      <Logo height={28} />
      <div className="app-state-pulse" aria-hidden />
      <Txt size={12} color={T.t3}>{label}</Txt>
    </div>
  );
}

export function PageLoadingState() {
  return (
    <div className="app-page-loading" role="status" aria-label="Carregando">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(var(--safe-area-top) + 14px) 16px 18px' }}>
        <Skeleton w={112} h={24} radius={8} />
        <Skeleton w={36} h={36} radius={18} />
      </div>
      <div style={{ padding: '0 16px var(--content-bottom-inset)', display: 'grid', gap: 12 }}>
        <Skeleton w="100%" h={150} radius={20} />
        <Skeleton w="72%" h={22} radius={8} />
        <Skeleton w="100%" h={78} radius={16} />
        <Skeleton w="100%" h={78} radius={16} />
        <Skeleton w="88%" h={78} radius={16} />
      </div>
    </div>
  );
}

export function AppErrorState({
  title,
  message,
  actionLabel = 'Tentar novamente',
  onRetry,
  icon = 'info',
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onRetry?: () => void;
  icon?: Parameters<typeof Icon>[0]['name'];
}) {
  return (
    <div className="app-state" role="alert">
      <div className="app-state-icon"><Icon name={icon} size={28} color={T.pink} /></div>
      <Txt size={21} weight={900} style={{ display: 'block', textAlign: 'center' }}>{title}</Txt>
      <Txt size={13} color={T.t3} lineH={1.55} style={{ display: 'block', textAlign: 'center', maxWidth: 330 }}>{message}</Txt>
      {onRetry && (
        <button type="button" className="app-state-action" onClick={onRetry}>{actionLabel}</button>
      )}
    </div>
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <AppErrorState
      title="Você está sem internet"
      message="Confira sua conexão e tente novamente. O que já está salvo no aparelho continua protegido."
      actionLabel="Tentar novamente"
      onRetry={onRetry}
      icon="wifi"
    />
  );
}

export function EmptyState({
  title,
  message,
  icon = 'info',
  action,
}: {
  title: string;
  message?: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  action?: ReactNode;
}) {
  return (
    <div className="app-empty-state">
      <Icon name={icon} size={38} color={T.t4} />
      <Txt size={15} weight={800} color={T.t2}>{title}</Txt>
      {message && <Txt size={12} color={T.t3} lineH={1.5} style={{ maxWidth: 300, textAlign: 'center' }}>{message}</Txt>}
      {action}
    </div>
  );
}

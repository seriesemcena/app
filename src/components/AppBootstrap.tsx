'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { useAuthContext } from '@/context/AuthContext';
import { useAppRuntime } from '@/context/AppRuntimeContext';
import { AppErrorState, StartupScreen } from '@/components/AppStates';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';

export function AppBootstrap({ children }: { children: ReactNode }) {
  const { loading, initializationError } = useAuthContext();
  const { isOnline, isKeyboardOpen, retryConnection } = useAppRuntime();
  const { t } = useTranslation('errors');

  if (loading) return <StartupScreen label={t('restoringSession')} />;

  if (initializationError) {
    return (
      <AppErrorState
        title={t('startupFailed')}
        message={t('startupFailedDetail')}
        actionLabel={t('retry')}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <>
      {children}
      {!isOnline && !isKeyboardOpen && (
        <div className="offline-banner" role="status" aria-live="polite">
          <Icon name="wifi" size={16} color={T.t2} />
          <span>{t('offlineShort')}</span>
          <button type="button" onClick={() => { void retryConnection(); }}>{t('retry')}</button>
        </div>
      )}
    </>
  );
}

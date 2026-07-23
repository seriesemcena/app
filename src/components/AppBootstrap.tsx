'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { useAuthContext } from '@/context/AuthContext';
import { useAppRuntime } from '@/context/AppRuntimeContext';
import { AppErrorState, StartupScreen } from '@/components/AppStates';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { usePathname, useRouter } from 'next/navigation';
import { useAppSettings } from '@/context/AppSettingsContext';
import { initializeFirebaseAppCheck } from '@/lib/firebase';
import { AI_CURATION_ENABLED } from '@/lib/features';
import { PushAlert } from '@/components/PushAlert';

export function AppBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => { void initializeFirebaseAppCheck(); }, []);
  const { loading, initializationError } = useAuthContext();
  const { isOnline, isKeyboardOpen, retryConnection } = useAppRuntime();
  const { t } = useTranslation('errors');
  const pathname = usePathname();
  const router = useRouter();
  const { settings } = useAppSettings();

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

  const maintenanceAllowed = pathname.startsWith('/admin') || pathname.startsWith('/auth');
  const disabledFeature =
    (!AI_CURATION_ENABLED && (pathname.startsWith('/curadoria') || pathname.startsWith('/ai-assistant')))
      ? 'A Curadoria por IA está temporariamente desativada.'
      : (!settings.commentsEnabled && (pathname.startsWith('/comments') || pathname.startsWith('/add-comment')))
      ? 'Os comentários estão temporariamente desativados.'
      : (!settings.reviewsEnabled && pathname.startsWith('/reviews'))
        ? 'As avaliações estão temporariamente desativadas.'
        : (!settings.proEnabled && (pathname.startsWith('/pro') || pathname.startsWith('/settings/pro') || pathname.startsWith('/vip')))
          ? 'Os recursos PRO estão temporariamente desativados.'
          : null;

  if (settings.maintenanceMode && !maintenanceAllowed) {
    return <AppErrorState title="Aplicativo em manutenção" message="Estamos realizando ajustes. Tente novamente em instantes." actionLabel="Tentar novamente" onRetry={() => window.location.reload()} />;
  }

  if (disabledFeature) {
    return <AppErrorState title="Recurso indisponível" message={disabledFeature} actionLabel="Voltar ao início" onRetry={() => router.replace('/home')} />;
  }

  return (
    <>
      {children}
      <PushAlert />
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

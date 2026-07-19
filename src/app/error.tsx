'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen } from '@/components/primitives';
import { AppErrorState } from '@/components/AppStates';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation('errors');
  useEffect(() => { console.error('[UI] Route error', error); }, [error]);

  return (
    <Frame>
      <Screen>
        <AppErrorState title={t('generic')} message={t('genericDetail')} actionLabel={t('retry')} onRetry={reset} />
      </Screen>
    </Frame>
  );
}

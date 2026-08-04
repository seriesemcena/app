'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen } from '@/components/primitives';
import { AppErrorState } from '@/components/AppStates';
import { purgeAppCaches } from '@/lib/store';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation('errors');
  useEffect(() => { console.error('[UI] Route error', error); }, [error]);

  // Self-heal: the usual cause of a render crash here is a corrupt/incompatible
  // local cache (which used to require a reinstall). Purge the app's own caches
  // — the account's data lives in Firestore and re-syncs on reload, and the
  // migration is merge-safe, so nothing is lost — then hard-reload. Falls back
  // to Next's reset() when there is no window (SSR).
  const recover = () => {
    try { purgeAppCaches(); } catch {}
    if (typeof window !== 'undefined') window.location.reload();
    else reset();
  };

  return (
    <Frame>
      <Screen>
        <AppErrorState title={t('generic')} message={t('genericDetail')} actionLabel={t('retry')} onRetry={recover} />
      </Screen>
    </Frame>
  );
}

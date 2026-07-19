'use client';

import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen } from '@/components/primitives';
import { OfflineState } from '@/components/AppStates';
import { useAppRuntime } from '@/context/AppRuntimeContext';
import { navigateBack } from '@/lib/navigation';

export default function OfflinePage() {
  const router = useRouter();
  const { retryConnection } = useAppRuntime();

  const retry = async () => {
    if (await retryConnection()) navigateBack(router, '/home');
  };

  return <Frame><Screen><OfflineState onRetry={() => { void retry(); }} /></Screen></Frame>;
}

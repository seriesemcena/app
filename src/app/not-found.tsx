'use client';

import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen } from '@/components/primitives';
import { AppErrorState } from '@/components/AppStates';

export default function NotFound() {
  const router = useRouter();
  return (
    <Frame>
      <Screen>
        <AppErrorState title="Página não encontrada" message="Este endereço não existe ou foi removido." actionLabel="Ir para o início" onRetry={() => router.replace('/home')} />
      </Screen>
    </Frame>
  );
}

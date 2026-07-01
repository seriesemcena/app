'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';

export default function SplashPage() {
  const router = useRouter();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => router.push('/onboarding'), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [router]);

  return (
    <Frame>
      <Screen style={{ alignItems: 'center', justifyContent: 'center', background: T.bg }}>
        <div style={{ opacity: phase === 0 ? 1 : 0, transition: 'opacity 0.6s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 80, height: 80, borderRadius: 22, background: `linear-gradient(135deg,${T.red},#8B0000)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px rgba(229,9,20,0.4)` }}>
            <Icon name="film" size={38} color={T.white} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.white, letterSpacing: -0.5 }}>Séries em Cena</div>
            <div style={{ fontSize: 13, color: T.t3, marginTop: 3 }}>Seu guia de filmes e séries</div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 60, display: 'flex', gap: 6 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: i === 0 ? T.red : T.t4 }} />)}
        </div>
      </Screen>
    </Frame>
  );
}

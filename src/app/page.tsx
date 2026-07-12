'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Logo } from '@/components/primitives';
import { useAuthContext } from '@/context/AuthContext';

export default function SplashPage() {
  const router = useRouter();
  const { user, loading, offline } = useAuthContext();

  useEffect(() => {
    if (loading) return; // wait for Firebase to initialise

    if (offline) {
      // Firebase not configured — go straight to home
      router.replace('/home');
      return;
    }

    if (!user) {
      // Not logged in — show splash briefly then welcome
      const t = setTimeout(() => router.replace('/welcome'), 1600);
      return () => clearTimeout(t);
    }

    // Logged in — check if onboarding was ever completed
    const onboardingDone = localStorage.getItem('onboarding_done');
    router.replace(onboardingDone ? '/home' : '/onboarding');
  }, [user, loading, offline, router]);

  return (
    <Frame>
      <Screen style={{ alignItems: 'center', justifyContent: 'center', background: '#0D0D0F' }}>
        {/* App name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Logo height={30} />
          <div style={{
            fontSize: 13, color: 'rgba(255,255,255,0.38)',
            fontFamily: "'Area','Inter',sans-serif",
          }}>
            Seu app de filmes e séries
          </div>
        </div>

        {/* Dots */}
        <div style={{ position: 'absolute', bottom: 60, display: 'flex', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: 3,
              background: i === 0 ? '#C069FF' : 'rgba(255,255,255,0.18)',
            }} />
          ))}
        </div>
      </Screen>
    </Frame>
  );
}

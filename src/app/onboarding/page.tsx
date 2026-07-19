'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { type IconName } from '@/lib/tokens';
import { prefsStore } from '@/lib/store';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbPrefsStore } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

const STEP_META: Array<{ id: number; icon: IconName; key: 'streams' | 'genres' | 'notifications' }> = [
  { id: 0, icon: 'wifi',  key: 'streams' },
  { id: 1, icon: 'heart', key: 'genres' },
  { id: 2, icon: 'bell',  key: 'notifications' },
];

const STREAMING_OPTIONS = ['Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Apple TV+', 'Globoplay', 'Paramount+'];

/* ── Dark skin tokens ── */
const DK = {
  bg:        '#0D0D0F',
  card:      'rgba(255,255,255,0.07)',
  border:    'rgba(255,255,255,0.12)',
  t1:        'rgba(255,255,255,0.92)',
  t2:        'rgba(255,255,255,0.55)',
  t3:        'rgba(255,255,255,0.28)',
  accent:    '#C069FF',
  accentDim: 'rgba(192,105,255,0.18)',
};

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation('home');
  const [step,     setStep]     = useState(0);
  const [selected, setSelected] = useState<string[][]>([[], [], []]);

  const STEPS = [
    { ...STEP_META[0], title: t('onboarding.step0Title'), subtitle: t('onboarding.step0Sub'), options: STREAMING_OPTIONS },
    { ...STEP_META[1], title: t('onboarding.step1Title'), subtitle: t('onboarding.step1Sub'), options: t('onboarding.genres', { returnObjects: true }) as string[] },
    { ...STEP_META[2], title: t('onboarding.step2Title'), subtitle: t('onboarding.step2Sub'), options: t('onboarding.notifOptions', { returnObjects: true }) as string[] },
  ];

  const data   = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const toggle = (opt: string) => {
    setSelected((prev) => {
      const next = [...prev];
      const cur  = new Set(next[step]);
      cur.has(opt) ? cur.delete(opt) : cur.add(opt);
      next[step] = [...cur];
      return next;
    });
  };

  const finish = async () => {
    const prefs = {
      streams:       selected[0],
      genres:        selected[1],
      notifications: selected[2],
    };
    prefsStore.set(prefs);
    if (firebaseConfigured && user) {
      try { await dbPrefsStore.set(getDB(), user.uid, prefs); } catch {}
    }
    // Mark onboarding as done so splash won't send user here again
    localStorage.setItem('onboarding_done', '1');
    router.push('/home');
  };

  return (
    <Frame>
      <Screen style={{ background: DK.bg, position: 'relative' }}>
        {/* Progress bar */}
        <div style={{ padding: '56px 24px 0', display: 'flex', gap: 8, flexShrink: 0 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= step ? DK.accent : 'rgba(255,255,255,0.14)',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        <ScrollArea style={{ padding: '32px 24px' }}>
          {/* Step icon */}
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: DK.accentDim,
            border: '1px solid rgba(192,105,255,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <Icon name={data.icon} size={28} color={DK.accent} />
          </div>

          {/* Title */}
          <div style={{
            fontSize: 26, fontWeight: 800, color: DK.t1,
            lineHeight: 1.2, marginBottom: 10,
            fontFamily: "'Greed','Area',sans-serif",
          }}>
            {data.title}
          </div>

          {/* Subtitle */}
          <div style={{
            fontSize: 14, color: DK.t2, lineHeight: 1.6,
            marginBottom: 28, fontFamily: "'Area','Inter',sans-serif",
          }}>
            {data.subtitle}
          </div>

          {/* Option chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {data.options.map((opt) => {
              const active = selected[step].includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  style={{
                    padding: '9px 16px', borderRadius: 20,
                    background: active ? DK.accentDim : DK.card,
                    border: active ? `1px solid rgba(192,105,255,0.45)` : `1px solid ${DK.border}`,
                    color: active ? DK.accent : DK.t1,
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    fontFamily: "'Area','Inter',sans-serif",
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Bottom spacer */}
          <div style={{ height: 120 }} />
        </ScrollArea>

        {/* Footer */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '20px calc(24px + var(--safe-area-right)) calc(20px + var(--safe-area-bottom)) calc(24px + var(--safe-area-left))',
          background: `linear-gradient(to top, ${DK.bg} 60%, transparent)`,
          display: 'flex', gap: 10,
        }}>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 50,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.13)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                color: DK.t1, fontSize: 15, fontWeight: 600,
                fontFamily: "'Area','Inter',sans-serif",
                cursor: 'pointer',
              }}
            >
              {t('onboarding.back')}
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            style={{
              flex: 2, padding: '14px 0', borderRadius: 50,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.25)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,1)',
              color: '#0D0D0F', fontSize: 15, fontWeight: 700,
              fontFamily: "'Area','Inter',sans-serif",
              cursor: 'pointer',
            }}
          >
            {isLast ? t('onboarding.begin') : t('onboarding.next')}
          </button>
        </div>
      </Screen>
    </Frame>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Btn } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T, type IconName } from '@/lib/tokens';
import { prefsStore } from '@/lib/store';

const STEPS: Array<{ id: number; icon: IconName; title: string; subtitle: string; options: string[]; key: 'streams' | 'genres' | 'notifications' }> = [
  { id: 0, icon: 'wifi', title: 'Seus streamings', subtitle: 'Diga quais plataformas você assina e nunca perca um lançamento.', options: ['Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Apple TV+', 'Globoplay', 'Paramount+'], key: 'streams' },
  { id: 1, icon: 'heart', title: 'Seus gostos', subtitle: 'Selecione os gêneros que mais curte para recomendações certeiras.', options: ['Ação', 'Drama', 'Comédia', 'Terror', 'Sci-Fi', 'Romance', 'Thriller', 'Documentário', 'Animação', 'Crime'], key: 'genres' },
  { id: 2, icon: 'bell', title: 'Notificações', subtitle: 'Quando você quer receber alertas?', options: ['Estreias no cinema', 'Chegou no streaming', 'Novo episódio', 'Lembretes VIP'], key: 'notifications' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[][]>([[], [], []]);
  const data = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const toggle = (opt: string) => {
    setSelected((prev) => {
      const next = [...prev];
      const cur = new Set(next[step]);
      cur.has(opt) ? cur.delete(opt) : cur.add(opt);
      next[step] = [...cur];
      return next;
    });
  };

  const finish = () => {
    prefsStore.set({
      streams: selected[0],
      genres: selected[1],
      notifications: selected[2],
    });
    router.push('/auth');
  };

  /* ── Cores sempre light (onboarding é sempre light-mode) ── */
  const OB = {
    bg:     '#F2F2F7',
    card:   '#FFFFFF',
    border: 'rgba(0,0,0,0.10)',
    t1:     'rgba(0,0,0,0.88)',
    t2:     'rgba(0,0,0,0.50)',
    t3:     'rgba(0,0,0,0.30)',
  };

  return (
    <Frame>
      <Screen style={{ background: OB.bg }}>
        {/* Progress dots */}
        <div style={{ padding: '52px 24px 0', display: 'flex', gap: 8 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? T.red : OB.border, transition: 'background 0.3s' }} />
          ))}
        </div>

        <ScrollArea style={{ padding: '32px 24px' }}>
          {/* Icon */}
          <div style={{ width: 64, height: 64, borderRadius: 18, background: T.redDim, border: `1px solid rgba(229,9,20,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Icon name={data.icon} size={28} color={T.red} />
          </div>

          {/* Title */}
          <div style={{ fontSize: 26, fontWeight: 800, color: OB.t1, lineHeight: 1.2, marginBottom: 10, fontFamily: "'Area','Inter',sans-serif" }}>
            {data.title}
          </div>

          {/* Subtitle */}
          <div style={{ fontSize: 14, color: OB.t2, lineHeight: 1.6, marginBottom: 28, fontFamily: "'Area','Inter',sans-serif" }}>
            {data.subtitle}
          </div>

          {/* Option chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {data.options.map((opt) => {
              const active = selected[step].includes(opt);
              return (
                <button key={opt} onClick={() => toggle(opt)} style={{
                  padding: '9px 16px', borderRadius: 20,
                  background: active ? T.red : OB.card,
                  border: active ? 'none' : `1px solid ${OB.border}`,
                  color: active ? '#fff' : OB.t1,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  fontFamily: "'Area','Inter',sans-serif",
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}>{opt}</button>
              );
            })}
          </div>
          <div style={{ height: 120 }} />
        </ScrollArea>

        {/* Footer buttons */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 24px 40px', background: `linear-gradient(to top, ${OB.bg} 70%, transparent)`, display: 'flex', gap: 12 }}>
          {step > 0 && <Btn label="Voltar" variant="ghost" size="lg" onClick={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
          <Btn label={isLast ? 'Começar' : 'Próximo'} variant="primary" size="lg"
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            style={{ flex: 2 }} />
        </div>
      </Screen>
    </Frame>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Btn, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T, type IconName } from '@/lib/tokens';

const PLANS = {
  mensal: { label: 'Mensal', price: 'R$ 14,90', period: '/mês', save: null as string | null },
  anual: { label: 'Anual', price: 'R$ 9,90', period: '/mês', save: 'Economize 34%' },
};

const FEATURES: Array<{ icon: IconName; label: string; desc: string }> = [
  { icon: 'bell', label: 'Alertas antecipados', desc: 'Saiba antes de todo mundo' },
  { icon: 'calendar', label: 'Calendário premium', desc: 'Visão completa de estreias' },
  { icon: 'search', label: 'Filtros avançados', desc: 'Por streaming, gênero, país' },
  { icon: 'list', label: 'Listas ilimitadas', desc: 'Organize do seu jeito' },
  { icon: 'smile', label: 'Recomendações IA', desc: 'Curadas para você' },
  { icon: 'eye', label: 'Modo sem anúncios', desc: 'Experiência limpa' },
  { icon: 'crown', label: 'Badge VIP', desc: 'Destaque no perfil' },
  { icon: 'fire', label: 'Estatísticas pessoais', desc: 'Análise do seu consumo' },
];

export default function VIPPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<'mensal' | 'anual'>('anual');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubscribe = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setSuccess(true); }, 1600);
  };

  if (success) return (
    <Frame>
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: 80, height: 80, borderRadius: 40, background: T.goldDim, border: `2px solid ${T.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: `0 0 40px rgba(245,197,24,0.3)` }}>
          <Icon name="crown" size={36} color={T.gold} />
        </div>
        <Txt size={26} weight={800} color={T.gold} style={{ display: 'block', textAlign: 'center', marginBottom: 8 }}>Bem-vindo ao VIP!</Txt>
        <Txt size={14} color={T.t2} style={{ display: 'block', textAlign: 'center', lineHeight: 1.6, marginBottom: 32 }}>Agora você tem acesso a todos os recursos exclusivos do Séries em Cena.</Txt>
        <Btn label="Ir para o início" variant="gold" size="lg" full onClick={() => router.push('/home')} />
      </Screen>
    </Frame>
  );

  return (
    <Frame>
      <Screen>
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,0.6)', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="close" size={18} color={T.white} />
          </button>
        </div>

        <ScrollArea>
          <div style={{ height: 200, background: `linear-gradient(135deg,#1a1200,#2d2000,#1a0a00)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom,transparent 60%,${T.bg} 100%)` }} />
            <div style={{ width: 64, height: 64, borderRadius: 32, background: T.goldDim, border: `2px solid rgba(245,197,24,0.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, boxShadow: `0 0 30px rgba(245,197,24,0.2)` }}>
              <Icon name="crown" size={30} color={T.gold} />
            </div>
            <div style={{ zIndex: 5, textAlign: 'center' }}>
              <Txt size={22} weight={800} color={T.gold} style={{ display: 'block' }}>Séries em Cena VIP</Txt>
              <Txt size={13} color={T.t3}>A experiência definitiva para cinéfilos</Txt>
            </div>
          </div>

          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {Object.entries(PLANS).map(([key, p]) => (
                <button key={key} onClick={() => setPlan(key as 'mensal' | 'anual')} style={{ flex: 1, padding: '14px 12px', borderRadius: T.radiusSm, background: plan === key ? T.goldDim : 'transparent', border: plan === key ? `2px solid ${T.gold}` : `1px solid ${T.border}`, cursor: 'pointer', textAlign: 'center', position: 'relative' }}>
                  {p.save && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: T.gold, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}><Txt size={9} weight={800} color="#000">{p.save}</Txt></div>}
                  <Txt size={12} weight={600} color={plan === key ? T.gold : T.t3} style={{ display: 'block', marginBottom: 4 }}>{p.label}</Txt>
                  <Txt size={22} weight={800} color={plan === key ? T.gold : T.t1} style={{ display: 'block' }}>{p.price}</Txt>
                  <Txt size={11} color={T.t3}>{p.period}</Txt>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <Txt size={11} weight={700} color={T.t2} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Tudo que você tem com VIP</Txt>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {FEATURES.map((f) => (
                  <div key={f.label} style={{ display: 'flex', gap: 10, padding: 12, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, alignItems: 'flex-start' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: T.goldDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={f.icon} size={15} color={T.gold} />
                    </div>
                    <div>
                      <Txt size={11} weight={700} style={{ display: 'block', lineHeight: 1.3 }}>{f.label}</Txt>
                      <Txt size={10} color={T.t3} style={{ display: 'block', lineHeight: 1.3, marginTop: 2 }}>{f.desc}</Txt>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: T.surface2 }}>
                <div style={{ padding: '10px 12px' }}><Txt size={11} weight={700} color={T.t3}>Recurso</Txt></div>
                <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={11} weight={700} color={T.t3}>Free</Txt></div>
                <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={11} weight={700} color={T.gold}>VIP</Txt></div>
              </div>
              {[['Catálogo completo', '✓', '✓'], ['Busca básica', '✓', '✓'], ['Listas (até 3)', '✓', '✓'], ['Listas ilimitadas', '—', '✓'], ['Alertas básicos', '—', '✓'], ['Alertas antecipados', '—', '✓'], ['Filtros avançados', '—', '✓'], ['Sem anúncios', '—', '✓']].map(([r, f, v], i) => (
                <div key={r as string} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: `1px solid ${T.border}`, background: i % 2 === 0 ? 'transparent' : T.surface }}>
                  <div style={{ padding: '10px 12px' }}><Txt size={11} color={T.t2}>{r}</Txt></div>
                  <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={12} color={f === '✓' ? '#4ade80' : T.t4}>{f}</Txt></div>
                  <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={12} color={v === '✓' ? T.gold : T.t4}>{v}</Txt></div>
                </div>
              ))}
            </div>

            <button onClick={handleSubscribe} disabled={loading} style={{ width: '100%', padding: '16px 0', borderRadius: T.radiusSm, background: loading ? T.surface2 : `linear-gradient(135deg,${T.gold},#d4a810)`, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
              <Icon name="crown" size={18} color={loading ? T.t3 : '#000'} />
              <Txt size={15} weight={800} color={loading ? T.t3 : '#000'}>{loading ? 'Processando...' : 'Assinar VIP agora'}</Txt>
            </button>

            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Txt size={11} color={T.t3}>7 dias grátis · Cancele quando quiser</Txt>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <Txt size={10} color={T.t4}>Pagamento seguro via Stripe · Renovação automática</Txt>
            </div>
          </div>
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

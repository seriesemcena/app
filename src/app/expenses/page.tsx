'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, GlassHeader, Btn, BottomSheet, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';

type Plan = { label: string; price: number };
type Stream = { id: string; name: string; color: string; plans: Plan[] };

const PRESET_STREAMS: Stream[] = [
  { id: 'netflix', name: 'Netflix', color: '#E50914', plans: [{ label: 'Básico', price: 20.90 }, { label: 'Padrão', price: 34.90 }, { label: 'Premium', price: 44.90 }] },
  { id: 'prime', name: 'Prime Video', color: '#00A8E0', plans: [{ label: 'Mensal', price: 14.90 }, { label: 'Anual', price: 9.90 }] },
  { id: 'disney', name: 'Disney+', color: '#113CCF', plans: [{ label: 'Mensal', price: 43.90 }, { label: 'Anual', price: 29.90 }] },
  { id: 'hbo', name: 'HBO Max', color: '#5800A0', plans: [{ label: 'Mobile', price: 19.90 }, { label: 'Básico', price: 29.90 }, { label: 'Padrão', price: 39.90 }] },
  { id: 'apple', name: 'Apple TV+', color: '#555555', plans: [{ label: 'Mensal', price: 21.90 }] },
  { id: 'globo', name: 'Globoplay', color: '#D62929', plans: [{ label: 'Globoplay', price: 22.90 }, { label: '+ Canais', price: 49.90 }] },
  { id: 'paramount', name: 'Paramount+', color: '#0064FF', plans: [{ label: 'Essential', price: 19.90 }, { label: 'Paramount+', price: 29.90 }] },
  { id: 'star', name: 'Star+', color: '#D42E1A', plans: [{ label: 'Mensal', price: 32.90 }, { label: 'Combo', price: 45.90 }] },
];

const KEY = 'sec_expenses_v1';

type Sub = { id: string; streamId: string; name: string; color: string; plan: string; price: number; active: boolean };

export default function ExpensesPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [subs, setSubs] = useState<Sub[]>([]);
  const [addSheet, setAddSheet] = useState(false);
  const [selStream, setSelStream] = useState<Stream | null>(null);
  const [selPlan, setSelPlan] = useState(0);
  const [customPrice, setCustomPrice] = useState('');
  const [showNavTitle, setShowNavTitle] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowNavTitle(!entry.isIntersecting),
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    try { setSubs(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
  }, []);

  const save = (next: Sub[]) => {
    setSubs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };

  const addSub = () => {
    if (!selStream) return;
    const price = customPrice ? parseFloat(customPrice.replace(',', '.')) : selStream.plans[selPlan].price;
    const entry: Sub = { id: selStream.id + '_' + Date.now(), streamId: selStream.id, name: selStream.name, color: selStream.color, plan: selStream.plans[selPlan].label, price, active: true };
    save([...subs, entry]);
    setAddSheet(false); setSelStream(null); setSelPlan(0); setCustomPrice('');
  };

  const removeSub = (id: string) => save(subs.filter((s) => s.id !== id));
  const toggleSub = (id: string) => save(subs.map((s) => s.id === id ? { ...s, active: !s.active } : s));

  const activeSubs = subs.filter((s) => s.active);
  const monthly = activeSubs.reduce((t, s) => t + s.price, 0);
  const annual = monthly * 12;
  const allMonthly = subs.reduce((t, s) => t + s.price, 0);
  const maxPrice = subs.length ? Math.max(...subs.map((x) => x.price)) : 1;

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            navTitle="Gastos de Streaming"
            showNavTitle={showNavTitle}
            left={
              <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevronL" size={18} color={isDark ? '#fff' : 'rgba(0,0,0,0.70)'} />
              </button>
            }
            right={
              <button onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={16} color={isDark ? '#fff' : 'rgba(0,0,0,0.70)'} />
              </button>
            }
          />

          <div ref={titleRef} style={{ padding: '20px 16px 4px' }}>
            <Txt size={22} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.5px' }}>
              Gastos de Streaming
            </Txt>
          </div>

          {/* ── Hero card ── */}
          <div style={{
            margin: '16px 16px 0', padding: '20px 20px 18px',
            background: 'linear-gradient(145deg, #181022 0%, #0e0c14 100%)',
            borderRadius: 22, border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            position: 'relative', overflow: 'hidden',
          } as React.CSSProperties}>

            {/* Glow blob */}
            <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, background: 'rgba(192,105,255,0.10)', filter: 'blur(48px)', pointerEvents: 'none' }} />

            {/* Label + dot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Txt size={10} weight={700} color="rgba(255,255,255,0.38)" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                GASTO MENSAL ATIVO
              </Txt>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: activeSubs.length > 0 ? '#22c55e' : 'rgba(255,255,255,0.2)', boxShadow: activeSubs.length > 0 ? '0 0 8px rgba(34,197,94,0.8)' : 'none' }} />
            </div>

            {/* Main value */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
              <Txt size={40} weight={900} color="#fff" style={{ lineHeight: 1, letterSpacing: '-1px' }}>
                R$ {monthly.toFixed(2).replace('.', ',')}
              </Txt>
              <Txt size={14} weight={400} color="rgba(255,255,255,0.32)">/mês</Txt>
            </div>

            {/* Annual + mini stats */}
            <Txt size={12} color="rgba(255,255,255,0.38)" style={{ display: 'block', marginBottom: 16 }}>
              R$ {annual.toFixed(2).replace('.', ',')} por ano · {activeSubs.length} ativa{activeSubs.length !== 1 ? 's' : ''}
              {subs.length - activeSubs.length > 0 && `, ${subs.length - activeSubs.length} pausada${subs.length - activeSubs.length !== 1 ? 's' : ''}`}
            </Txt>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAddSheet(true)} style={{ flex: 1, padding: '12px 0', borderRadius: 50, background: 'rgba(255,255,255,0.92)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#0e0c14', fontFamily: "'Area','Inter',sans-serif", letterSpacing: '-0.1px' }}>
                + Adicionar
              </button>
              <button onClick={() => {}} style={{ flex: 1, padding: '12px 0', borderRadius: 50, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.72)', fontFamily: "'Area','Inter',sans-serif" }}>
                Ver Distribuição
              </button>
            </div>
          </div>

          {subs.length > 0 && (
            <div style={{ margin: '16px 16px 0', padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
              <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Distribuição</Txt>
              {subs.map((s) => (
                <div key={s.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color, opacity: s.active ? 1 : 0.35 }} />
                      <Txt size={12} weight={600} color={s.active ? T.t1 : T.t3}>{s.name}</Txt>
                      {!s.active && <div style={{ padding: '1px 6px', borderRadius: 4, background: T.surface2 }}><Txt size={9} color={T.t3}>PAUSADA</Txt></div>}
                    </div>
                    <Txt size={12} color={s.active ? T.t1 : T.t3}>R$ {s.price.toFixed(2).replace('.', ',')}</Txt>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: T.surface2, overflow: 'hidden' }}>
                    <div style={{ width: `${(s.price / maxPrice) * 100}%`, height: '100%', borderRadius: 3, background: s.active ? s.color : 'var(--c-border)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '16px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Txt size={16} weight={700}>Minhas assinaturas</Txt>
              <Btn label="+ Adicionar" variant="pink" size="sm" onClick={() => setAddSheet(true)} />
            </div>

            {subs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                <Icon name="play" size={48} color={T.t4} style={{ marginBottom: 16 }} />
                <Txt size={15} weight={700} style={{ display: 'block', marginBottom: 8 }}>Nenhuma assinatura</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 20 }}>Adicione seus streamings para calcular seus gastos</Txt>
                <Btn label="+ Adicionar streaming" variant="pink" onClick={() => setAddSheet(true)} />
              </div>
            ) : subs.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 10, opacity: s.active ? 1 : 0.6 }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: s.active ? 1 : 0.5 }}>
                  <Txt size={14} weight={800} color={T.white}>{s.name[0]}</Txt>
                </div>
                <div style={{ flex: 1 }}>
                  <Txt size={14} weight={700} style={{ display: 'block' }}>{s.name}</Txt>
                  <Txt size={11} color={T.t3}>{s.plan} · R$ {s.price.toFixed(2).replace('.', ',')}/mês</Txt>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleSub(s.id)} style={{ width: 28, height: 28, borderRadius: 14, background: s.active ? 'rgba(192,105,255,0.15)' : T.surface2, border: `1px solid ${s.active ? T.pink : T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.active ? 'check' : 'close'} size={13} color={s.active ? T.pink : T.t3} />
                  </button>
                  <button onClick={() => removeSub(s.id)} style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(229,9,20,0.1)', border: `1px solid rgba(229,9,20,0.2)`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={13} color={T.red} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 90 }} />
        </ScrollArea>

        <BottomSheet visible={addSheet} onClose={() => { setAddSheet(false); setSelStream(null); }} title="Adicionar streaming">
          {!selStream ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {PRESET_STREAMS.map((s) => (
                <button key={s.id} onClick={() => setSelStream(s)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, cursor: 'pointer' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Txt size={13} weight={800} color={T.white}>{s.name[0]}</Txt>
                  </div>
                  <Txt size={13} weight={600} color={T.t1}>{s.name}</Txt>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: 12, background: T.surface, borderRadius: T.radiusSm }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: selStream.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={14} weight={800} color={T.white}>{selStream.name[0]}</Txt>
                </div>
                <Txt size={15} weight={700}>{selStream.name}</Txt>
              </div>
              <Txt size={12} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Plano</Txt>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {selStream.plans.map((p, i) => (
                  <button key={i} onClick={() => setSelPlan(i)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: selPlan === i ? 'rgba(192,105,255,0.12)' : T.surface, border: `1px solid ${selPlan === i ? T.pink : T.border}`, borderRadius: T.radiusSm, cursor: 'pointer' }}>
                    <Txt size={13} weight={600} color={selPlan === i ? T.white : T.t2}>{p.label}</Txt>
                    <Txt size={13} weight={700} color={selPlan === i ? T.pink : T.t3}>R$ {p.price.toFixed(2).replace('.', ',')}/mês</Txt>
                  </button>
                ))}
              </div>
              <Txt size={12} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Ou valor customizado</Txt>
              <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="Ex: 29,90"
                style={{ width: '100%', padding: '12px 16px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.white, fontSize: 14, fontFamily: "'Area','Inter',sans-serif", outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn label="Voltar" variant="ghost" onClick={() => setSelStream(null)} style={{ flex: 1 }} />
                <Btn label="Adicionar" variant="pink" onClick={addSub} style={{ flex: 2 }} />
              </div>
            </div>
          )}
        </BottomSheet>
      </Screen>
    </Frame>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, Btn, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T, type IconName } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';

type Item = { icon: IconName; label: string; sub?: string; action: () => void; gold?: boolean };

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const isLight = theme === 'light';

  // Todo usuário registrado é VIP
  const { user } = useAuth();
  const isVip = !!user;

  const sections: Array<{ title: string; items: Item[] }> = [
    {
      title: 'Minha conta', items: [
        { icon: 'user',  label: 'Editar perfil',   action: () => router.push('/settings/edit-profile') },
        { icon: 'lock',  label: 'Alterar senha',   action: () => router.push('/settings/change-password') },
        { icon: 'bell',  label: 'Notificações',    action: () => router.push('/notifications') },
      ],
    },
    {
      title: 'Preferências', items: [
        { icon: 'wifi',  label: 'Meus streamings',     action: () => router.push('/settings/streamings') },
        { icon: 'heart', label: 'Meus gêneros',         action: () => router.push('/settings/genres') },
        { icon: 'play',  label: 'Gastos de streaming', action: () => router.push('/expenses') },
      ],
    },
    {
      title: 'Dados', items: [
        { icon: 'tv',    label: 'Importar do TV Time', sub: 'Migre seu histórico de séries e filmes', action: () => router.push('/settings/import') },
      ],
    },
    {
      title: 'Geral', items: [
        { icon: 'info',  label: 'Sobre o app',    action: () => {} },
        { icon: 'share', label: 'Avaliar na loja', action: () => {} },
      ],
    },
  ];

  const SectionBox = ({ sec }: { sec: (typeof sections)[number] }) => (
    <div style={{ marginBottom: 20 }}>
      <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', paddingLeft: 4, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
        {sec.title}
      </Txt>
      <div style={{ background: T.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        {sec.items.map((item, i) => (
          <button key={item.label} onClick={item.action}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', borderBottom: i < sec.items.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: item.gold ? T.goldDim : T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={item.icon} size={17} color={item.gold ? T.gold : T.t2} />
            </div>
            <div style={{ flex: 1 }}>
              <Txt size={14} weight={600} color={item.gold ? T.gold : T.t1} style={{ display: 'block' }}>{item.label}</Txt>
              {item.sub && <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 1 }}>{item.sub}</Txt>}
            </div>
            <Icon name="chevronR" size={16} color={T.t3} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Frame>
      <Screen>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}>

          {/* ── Header glass sticky ── */}
          <GlassHeader
            right={
              <button onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={16} color="#fff" />
              </button>
            }
          />

          {/* ── Content ── */}
          <div style={{ minHeight: 500, padding: '0 16px 32px' }}>

            {/* Título */}
            <Txt size={22} weight={900} color={T.t1} style={{ display: 'block', paddingTop: 16, marginBottom: 20, letterSpacing: '-0.5px' }}>
              Configurações
            </Txt>

            {/* ══ Banner VIP ══ */}
            {!isVip ? (
              /* Não-VIP: "Assine já" */
              <div
                onClick={() => router.push('/vip')}
                style={{
                  marginBottom: 12, borderRadius: 18, overflow: 'hidden', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #f5c518 0%, #e0a800 60%, #c47d00 100%)',
                  boxShadow: '0 4px 20px rgba(245,197,24,0.35)',
                  padding: '20px 20px',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="crown" size={26} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <Txt size={16} weight={900} color="#fff" style={{ display: 'block', marginBottom: 3 }}>Seja VIP</Txt>
                  <Txt size={12} color="rgba(255,255,255,0.85)">Estatísticas avançadas, alertas e muito mais</Txt>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '7px 14px', flexShrink: 0 }}>
                  <Txt size={12} weight={800} color="#fff">Assine já</Txt>
                </div>
              </div>
            ) : (
              /* VIP ativo: plano atual */
              <div
                onClick={() => router.push('/vip')}
                style={{
                  marginBottom: 12, borderRadius: 18, overflow: 'hidden', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #7B2FBE 0%, #C069FF 100%)',
                  boxShadow: '0 4px 20px rgba(192,105,255,0.35)',
                  padding: '20px 20px',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="crown" size={26} color={T.gold} />
                </div>
                <div style={{ flex: 1 }}>
                  <Txt size={16} weight={900} color="#fff" style={{ display: 'block', marginBottom: 3 }}>Plano VIP · Ativo</Txt>
                  <Txt size={12} color="rgba(255,255,255,0.8)">Assinatura anual — renovação em 30 dias</Txt>
                </div>
                <Icon name="chevronR" size={18} color="rgba(255,255,255,0.7)" />
              </div>
            )}

            {/* ══ Cards: Curadoria IA + Estatísticas ══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>

              {/* Curadoria por IA */}
              <div
                onClick={() => router.push('/vip')}
                style={{
                  borderRadius: 18, padding: '18px 16px 16px', cursor: 'pointer',
                  background: 'linear-gradient(145deg, #1a1a2e 0%, #2d1b4e 100%)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  display: 'flex', flexDirection: 'column', gap: 10, minHeight: 110,
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(192,105,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="star" size={18} color="#C069FF" />
                </div>
                <div>
                  <Txt size={13} weight={900} color="#fff" style={{ display: 'block', lineHeight: 1.25 }}>Curadoria{'\n'}por IA</Txt>
                </div>
              </div>

              {/* Estatísticas da conta */}
              <div
                onClick={() => router.push('/profile')}
                style={{
                  borderRadius: 18, padding: '18px 16px 16px', cursor: 'pointer',
                  background: 'linear-gradient(145deg, #0f2027 0%, #203a43 60%, #2c5364 100%)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  display: 'flex', flexDirection: 'column', gap: 10, minHeight: 110,
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(52,199,89,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="chart" size={18} color="#34c759" />
                </div>
                <div>
                  <Txt size={13} weight={900} color="#fff" style={{ display: 'block', lineHeight: 1.25 }}>Estatísticas{'\n'}da conta</Txt>
                </div>
              </div>
            </div>

            {/* ══ Seções existentes ══ */}
            {sections.map((sec) => <SectionBox key={sec.title} sec={sec} />)}

            {/* ── Aparência ── */}
            <div style={{ marginBottom: 20 }}>
              <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', paddingLeft: 4, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                Aparência
              </Txt>
              <div style={{ background: T.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '16px' }}>
                <Txt size={13} weight={600} color={T.t2} style={{ display: 'block', marginBottom: 12 }}>Tema do app</Txt>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setTheme('dark')}
                    style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: `2px solid ${!isLight ? T.pink : T.border}`, background: !isLight ? 'rgba(192,105,255,0.08)' : T.surface2, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}>
                    <div style={{ width: 52, height: 36, borderRadius: 8, background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 8px', overflow: 'hidden' }}>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.6)', width: '70%' }} />
                      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.3)', width: '50%' }} />
                      <div style={{ height: 3, borderRadius: 2, background: '#C069FF', width: '35%' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {!isLight && <div style={{ width: 8, height: 8, borderRadius: 4, background: T.pink }} />}
                      <Txt size={12} weight={700} color={!isLight ? T.pink : T.t2}>Escuro</Txt>
                    </div>
                  </button>

                  <button onClick={() => setTheme('light')}
                    style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: `2px solid ${isLight ? T.pink : T.border}`, background: isLight ? 'rgba(192,105,255,0.08)' : T.surface2, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}>
                    <div style={{ width: 52, height: 36, borderRadius: 8, background: '#F2F2F7', border: '1px solid rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 8px', overflow: 'hidden' }}>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.65)', width: '70%' }} />
                      <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.25)', width: '50%' }} />
                      <div style={{ height: 3, borderRadius: 2, background: '#C069FF', width: '35%' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {isLight && <div style={{ width: 8, height: 8, borderRadius: 4, background: T.pink }} />}
                      <Txt size={12} weight={700} color={isLight ? T.pink : T.t2}>Claro</Txt>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Sair */}
            <Btn label="Sair da conta" variant="danger" full onClick={signOut} />
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

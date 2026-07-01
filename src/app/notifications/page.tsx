'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Txt, VIPBadge } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';

type SettingsKey = 'cinema' | 'streaming' | 'episodes' | 'reminders' | 'vipEarly' | 'newsletter' | 'push' | 'email';

export default function NotificationsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<SettingsKey, boolean>>({
    cinema: true, streaming: true, episodes: true, reminders: false,
    vipEarly: false, newsletter: false, push: true, email: true,
  });
  const toggle = (k: SettingsKey) => setSettings((s) => ({ ...s, [k]: !s[k] }));

  const Toggle = ({ k, label, desc, vip = false }: { k: SettingsKey; label: string; desc?: string; vip?: boolean }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Txt size={14} weight={600}>{label}</Txt>
          {vip && <VIPBadge />}
        </div>
        {desc && <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 2 }}>{desc}</Txt>}
      </div>
      <button onClick={() => { if (vip && !settings[k]) { router.push('/vip'); return; } toggle(k); }} style={{ width: 48, height: 28, borderRadius: 14, background: settings[k] ? T.red : T.surface2, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: T.white, position: 'absolute', top: 3, left: settings[k] ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
      </button>
    </div>
  );

  return (
    <Frame>
      <Screen>
        <AppBar title="Notificações" left={
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="chevronL" size={20} color={T.t2} /></button>
        } />
        <ScrollArea>
          <div style={{ padding: '16px 0' }}>
            <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', padding: '0 16px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Alertas de conteúdo</Txt>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, marginBottom: 16, overflow: 'hidden', margin: '0 16px 16px' }}>
              <Toggle k="cinema" label="Estreias no cinema" desc="Quando um filme entra em cartaz" />
              <Toggle k="streaming" label="Chegou ao streaming" desc="Quando um título chega a uma plataforma" />
              <Toggle k="episodes" label="Novos episódios" desc="Para séries que você acompanha" />
              <Toggle k="reminders" label="Lembretes personalizados" desc="Para títulos nas suas listas" />
            </div>

            <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', padding: '0 16px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Exclusivo VIP</Txt>
            <div style={{ background: T.card, border: `1px solid rgba(245,197,24,0.2)`, borderRadius: T.radiusSm, marginBottom: 16, overflow: 'hidden', margin: '0 16px 16px' }}>
              <Toggle k="vipEarly" label="Alertas antecipados" desc="Saiba dias antes do lançamento" vip />
              <Toggle k="newsletter" label="Novidades editoriais" desc="Curadoria semanal do Séries em Cena" vip />
            </div>

            <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', padding: '0 16px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Canal de entrega</Txt>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, overflow: 'hidden', margin: '0 16px' }}>
              <Toggle k="push" label="Notificações push" desc="No seu celular em tempo real" />
              <Toggle k="email" label="E-mail" desc="Resumo diário no seu e-mail" />
            </div>
          </div>
          <div style={{ height: 90 }} />
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

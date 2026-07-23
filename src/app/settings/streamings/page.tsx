'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SettingsCard, SettingsHeader, SettingsPrimaryButton } from '@/components/SettingsLayout';
import { T } from '@/lib/tokens';
import { profileStore } from '@/lib/store';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { navigateBack } from '@/lib/navigation';
import { STREAMING_COLORS } from '@/lib/streamingPlatforms';

const SERVICES = [
  { id: 'Netflix',    color: '#E50914', icon: 'N',  monthly: 'R$ 39,90' },
  { id: 'Prime',      color: STREAMING_COLORS.prime, icon: 'P',  monthly: 'R$ 19,90' },
  { id: 'Disney+',    color: STREAMING_COLORS.disney, icon: 'D+', monthly: 'R$ 27,90' },
  { id: 'HBO',        color: STREAMING_COLORS.hbo, icon: 'H',  monthly: 'R$ 34,90' },
  { id: 'Apple',      color: '#555',    icon: '',  monthly: 'R$ 21,90' },
  { id: 'Globo',      color: STREAMING_COLORS.globo, icon: 'G',  monthly: 'R$ 19,90' },
  { id: 'Paramount',  color: '#0064FF', icon: 'P+', monthly: 'R$ 19,90' },
  { id: 'Crunchyroll',color: '#F47521', icon: 'C',  monthly: 'R$ 11,99' },
  { id: 'Mubi',       color: '#000',    icon: 'M',  monthly: 'R$ 28,90' },
  { id: 'Telecine',   color: '#003399', icon: 'T',  monthly: 'R$ 37,90' },
];

export default function StreamingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { setSelected(profileStore.get(user?.uid).streamings); }, [user]);

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const save = async () => {
    profileStore.set({ streamings: selected }, user?.uid);
    if (firebaseConfigured && user) {
      try { await dbProfileStore.set(getDB(), user.uid, { streamings: selected }); } catch {}
    }
    setToast('Streamings salvos!');
    setTimeout(() => navigateBack(router, '/settings'), 1100);
  };

  const total = SERVICES.filter(s => selected.includes(s.id))
    .reduce((sum, s) => sum + parseFloat(s.monthly.replace('R$ ', '').replace(',', '.')), 0);

  return (
    <Frame>
      <Screen>
        <SettingsHeader title="Meus streamings" onBack={() => navigateBack(router, '/settings')} />
        <ScrollArea>
          <div style={{ padding: '18px 16px 32px' }}>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 18, lineHeight: 1.5 }}>
              Selecione os serviços que você assina
            </Txt>

            <SettingsCard>
              {SERVICES.map(s => {
                const on = selected.includes(s.id);
                const index = SERVICES.indexOf(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: on ? s.color + '12' : 'transparent', border: 'none', borderBottom: index < SERVICES.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s' }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Txt size={14} weight={900} color="#fff">{s.icon}</Txt>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Txt size={14} weight={700} style={{ display: 'block' }}>{s.id}</Txt>
                      <Txt size={12} color={T.t3}>{s.monthly}/mês</Txt>
                    </div>
                    <div style={{ width: 24, height: 24, borderRadius: 12, background: on ? T.pink : T.surface2, border: `2px solid ${on ? T.pink : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                      {on && <Icon name="check" size={12} color="#fff" />}
                    </div>
                  </button>
                );
              })}
            </SettingsCard>

            {selected.length > 0 && (
              <SettingsCard style={{ marginTop: 16, padding: 16 }}>
                <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 6 }}>{selected.length} serviço{selected.length > 1 ? 's' : ''} selecionado{selected.length > 1 ? 's' : ''}</Txt>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Txt size={14} weight={600}>Total estimado</Txt>
                  <Txt size={20} weight={900} color={T.pink}>R$ {total.toFixed(2).replace('.', ',')}/mês</Txt>
                </div>
              </SettingsCard>
            )}

            <SettingsPrimaryButton label="Salvar alterações" onClick={save} style={{ marginTop: 22 }} />
          </div>
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} icon="check" />
      </Screen>
    </Frame>
  );
}

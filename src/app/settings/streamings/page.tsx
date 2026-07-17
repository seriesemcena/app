'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { profileStore } from '@/lib/store';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

const SERVICES = [
  { id: 'Netflix',    color: '#E50914', icon: 'N',  monthly: 'R$ 39,90' },
  { id: 'Prime',      color: '#00A8E0', icon: 'P',  monthly: 'R$ 19,90' },
  { id: 'Disney+',    color: '#113CCF', icon: 'D+', monthly: 'R$ 27,90' },
  { id: 'HBO',        color: '#5800A0', icon: 'H',  monthly: 'R$ 34,90' },
  { id: 'Apple',      color: '#555',    icon: '',  monthly: 'R$ 21,90' },
  { id: 'Globo',      color: '#D62929', icon: 'G',  monthly: 'R$ 19,90' },
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
    setTimeout(() => router.back(), 1100);
  };

  const total = SERVICES.filter(s => selected.includes(s.id))
    .reduce((sum, s) => sum + parseFloat(s.monthly.replace('R$ ', '').replace(',', '.')), 0);

  return (
    <Frame>
      <Screen>
        <AppBar
          title="Meus streamings"
          left={<button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="chevronL" size={20} color={T.t2} /></button>}
          right={<button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Txt size={14} weight={700} color={T.pink}>Salvar</Txt></button>}
        />
        <ScrollArea>
          <div style={{ padding: '8px 16px 16px' }}>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>
              Selecione os serviços que você assina
            </Txt>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SERVICES.map(s => {
                const on = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: on ? s.color + '18' : T.card, border: `1px solid ${on ? s.color + '60' : T.border}`, borderRadius: 12, cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s' }}
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
            </div>

            {selected.length > 0 && (
              <div style={{ marginTop: 20, padding: 16, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 6 }}>{selected.length} serviço{selected.length > 1 ? 's' : ''} selecionado{selected.length > 1 ? 's' : ''}</Txt>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Txt size={14} weight={600}>Total estimado</Txt>
                  <Txt size={20} weight={900} color={T.pink}>R$ {total.toFixed(2).replace('.', ',')}/mês</Txt>
                </div>
              </div>
            )}

            <div style={{ height: 24 }} />
          </div>
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} icon="check" />
      </Screen>
    </Frame>
  );
}

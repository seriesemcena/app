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

const GENRES = [
  { id: 'Ação',         emoji: '💥' },
  { id: 'Aventura',     emoji: '🗺️' },
  { id: 'Animação',     emoji: '🎨' },
  { id: 'Comédia',      emoji: '😂' },
  { id: 'Crime',        emoji: '🔍' },
  { id: 'Documentário', emoji: '🎥' },
  { id: 'Drama',        emoji: '🎭' },
  { id: 'Fantasia',     emoji: '🧙' },
  { id: 'Ficção Científica', emoji: '🚀' },
  { id: 'Terror',       emoji: '👻' },
  { id: 'Mistério',     emoji: '🕵️' },
  { id: 'Musical',      emoji: '🎵' },
  { id: 'Romance',      emoji: '❤️' },
  { id: 'Suspense',     emoji: '😰' },
  { id: 'Western',      emoji: '🤠' },
  { id: 'Anime',        emoji: '⛩️' },
  { id: 'Reality',      emoji: '📺' },
  { id: 'Biografia',    emoji: '📖' },
];

export default function GenresPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { setSelected(profileStore.get(user?.uid).genres); }, [user]);

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const save = async () => {
    profileStore.set({ genres: selected }, user?.uid);
    if (firebaseConfigured && user) {
      try { await dbProfileStore.set(getDB(), user.uid, { genres: selected }); } catch {}
    }
    setToast('Gêneros salvos!');
    setTimeout(() => navigateBack(router, '/settings'), 1100);
  };

  return (
    <Frame>
      <Screen>
        <SettingsHeader title="Meus gêneros" onBack={() => navigateBack(router, '/settings')} />
        <ScrollArea>
          <div style={{ padding: '18px 16px 32px' }}>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 18, lineHeight: 1.5 }}>
              Escolha os gêneros que você mais curte assistir
            </Txt>
            <SettingsCard style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 8, gap: 8 }}>
              {GENRES.map(g => {
                const on = selected.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggle(g.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 54, padding: '11px 12px', background: on ? 'rgba(192,105,255,0.14)' : 'transparent', border: `1px solid ${on ? T.pink + '70' : 'transparent'}`, borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  >
                    <span style={{ fontSize: 22 }}>{g.emoji}</span>
                    <Txt size={13} weight={on ? 700 : 500} color={on ? T.pink : T.t2} style={{ flex: 1 }}>{g.id}</Txt>
                    {on && <Icon name="check" size={14} color={T.pink} />}
                  </button>
                );
              })}
            </SettingsCard>
            {selected.length > 0 && (
              <Txt size={12} color={T.t3} style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>
                {selected.length} gênero{selected.length > 1 ? 's' : ''} selecionado{selected.length > 1 ? 's' : ''}
              </Txt>
            )}
            <SettingsPrimaryButton label="Salvar alterações" onClick={save} style={{ marginTop: 22 }} />
          </div>
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} icon="check" />
      </Screen>
    </Frame>
  );
}

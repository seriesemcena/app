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

  useEffect(() => { setSelected(profileStore.get().genres); }, []);

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const save = async () => {
    profileStore.set({ genres: selected });
    if (firebaseConfigured && user) {
      try { await dbProfileStore.set(getDB(), user.uid, { genres: selected }); } catch {}
    }
    setToast('Gêneros salvos!');
    setTimeout(() => router.back(), 1100);
  };

  return (
    <Frame>
      <Screen>
        <AppBar
          title="Meus gêneros"
          left={<button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="chevronL" size={20} color={T.t2} /></button>}
          right={<button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Txt size={14} weight={700} color={T.pink}>Salvar</Txt></button>}
        />
        <ScrollArea>
          <div style={{ padding: '8px 16px 32px' }}>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>
              Escolha os gêneros que você mais curte assistir
            </Txt>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {GENRES.map(g => {
                const on = selected.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggle(g.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: on ? 'rgba(192,105,255,0.12)' : T.card, border: `1px solid ${on ? T.pink + '80' : T.border}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  >
                    <span style={{ fontSize: 22 }}>{g.emoji}</span>
                    <Txt size={13} weight={on ? 700 : 500} color={on ? T.white : T.t2} style={{ flex: 1 }}>{g.id}</Txt>
                    {on && <Icon name="check" size={14} color={T.pink} />}
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <Txt size={12} color={T.t3} style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>
                {selected.length} gênero{selected.length > 1 ? 's' : ''} selecionado{selected.length > 1 ? 's' : ''}
              </Txt>
            )}
          </div>
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} icon="check" />
      </Screen>
    </Frame>
  );
}

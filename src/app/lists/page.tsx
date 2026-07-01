'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Btn, Toast, Txt } from '@/components/primitives';
import { TMDBPoster } from '@/components/posters';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { listStore } from '@/lib/store';

const TABS = [
  { id: 'want',     label: 'Quero ver' },
  { id: 'watching', label: 'Assistindo' },
  { id: 'watched',  label: 'Assistido' },
  { id: 'custom',   label: 'Personalizadas' },
] as const;

type Tab = typeof TABS[number]['id'];

export default function ListsPage() {
  const router = useRouter();
  const [tab, setTab]     = useState<Tab>('want');
  const [toast, setToast] = useState<string | false>(false);
  const [items, setItems] = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);
  const [counts, setCounts] = useState<Record<Tab, number>>({ want: 0, watching: 0, watched: 0, custom: 0 });

  useEffect(() => {
    if (tab !== 'custom') {
      setItems(listStore.get(tab as 'want' | 'watching' | 'watched'));
    }
    setCounts({
      want:     listStore.get('want').length,
      watching: listStore.get('watching').length,
      watched:  listStore.get('watched').length,
      custom:   0,
    });
  }, [tab]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(false), 2000); };

  return (
    <Frame>
      <Screen>
        <AppBar title="Minhas Listas" right={
          <button onClick={() => showToast('Em breve!')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="plus" size={22} color={T.t2} /></button>
        } />

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 } as React.CSSProperties}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '9px 18px', borderRadius: 24, flexShrink: 0,
                  background: active ? T.white : 'transparent',
                  border: active ? 'none' : `1px solid ${T.dim}`,
                  color: active ? T.bg : T.t2,
                  fontSize: 13, fontWeight: 700,
                  fontFamily: "'Area','Inter',sans-serif",
                  cursor: 'pointer', transition: 'all 0.2s',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                {t.label}
                {counts[t.id] > 0 && (
                  <span style={{
                    background: active ? 'rgba(0,0,0,0.15)' : 'var(--c-t4)',
                    borderRadius: 8, padding: '1px 6px', fontSize: 10,
                  }}>
                    {counts[t.id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        <ScrollArea style={{ padding: 16 }}>

          {/* ── Personalizadas ── */}
          {tab === 'custom' && (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <Icon name="list" size={48} color={T.t4} style={{ marginBottom: 16 }} />
              <Txt size={16} weight={700} style={{ display: 'block', marginBottom: 8 }}>Nenhuma lista personalizada</Txt>
              <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 24 }}>Crie listas temáticas para organizar do seu jeito</Txt>
              <Btn label="+ Criar lista" variant="primary" onClick={() => showToast('Função VIP — desbloqueie!')} />
              <div style={{ marginTop: 16 }}>
                <button onClick={() => router.push('/vip')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Txt size={12} color={T.gold}>Listas ilimitadas com VIP →</Txt>
                </button>
              </div>
            </div>
          )}

          {/* ── Regular lists (want / watching / watched) ── */}
          {tab !== 'custom' && (
            items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <Icon name="list" size={48} color={T.t4} style={{ marginBottom: 16 }} />
                <Txt size={16} weight={700} style={{ display: 'block', marginBottom: 8 }}>Lista vazia</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block' }}>Adicione títulos para acompanhar aqui</Txt>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {items.map((item) => (
                  <div key={item.id} onClick={() => router.push(`/title/${item.type}/${item.id}`)} style={{ cursor: 'pointer' }}>
                    <div style={{ borderRadius: T.radiusSm, overflow: 'hidden' }}>
                      <TMDBPoster path={item.poster_path} width={108} height={161} title={item.title} />
                    </div>
                    <Txt size={11} weight={600} style={{ display: 'block', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title}
                    </Txt>
                  </div>
                ))}
              </div>
            )
          )}

          <div style={{ height: 90 }} />
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} icon="crown" />
      </Screen>
    </Frame>
  );
}

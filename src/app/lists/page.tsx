'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { listStore } from '@/lib/store';
import { MasonryGrid2 } from '@/components/posters';
import { type TMDBItem } from '@/lib/tmdb';

type ListTab = 'want' | 'watching' | 'watched';

const TABS: { id: ListTab; label: string; icon: string; emptyMsg: string }[] = [
  { id: 'want',     label: 'Quero ver',  icon: 'bookmark', emptyMsg: 'Nenhum título salvo para assistir' },
  { id: 'watching', label: 'Assistindo', icon: 'eye',      emptyMsg: 'Nenhum título em andamento'        },
  { id: 'watched',  label: 'Assistido',  icon: 'check',    emptyMsg: 'Nenhum título finalizado ainda'    },
];

export default function ListsPage() {
  const router = useRouter();
  const [tab, setTab]       = useState<ListTab>('want');
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);
  const [counts, setCounts] = useState<Record<ListTab, number>>({ want: 0, watching: 0, watched: 0 });

  useEffect(() => {
    setItems(listStore.get(tab));
    setCounts({
      want:     listStore.get('want').length,
      watching: listStore.get('watching').length,
      watched:  listStore.get('watched').length,
    });
  }, [tab]);

  const activeTabMeta = TABS.find((t) => t.id === tab)!;

  const watchedTag = tab === 'watched'
    ? () => ({ label: 'ASSISTIDO', color: '#fff', bg: 'rgba(52,199,89,0.75)' })
    : undefined;

  return (
    <Frame>
      <Screen>
        <div
          ref={scrollRef}
          onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)}
          style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}
        >

          {/* ── Glass header ── */}
          <GlassHeader />

          {/* ── Título ── */}
          <div style={{ padding: '12px 16px 0' }}>
            <Txt size={28} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.5px' }}>
              Minha lista
            </Txt>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginTop: 4, marginBottom: 16 }}>
              {counts.want + counts.watching + counts.watched} título{counts.want + counts.watching + counts.watched !== 1 ? 's' : ''} salvos
            </Txt>
          </div>

          {/* ── Tabs sticky ── */}
          <div style={{
            position: 'sticky', top: 56, zIndex: 48,
            display: 'flex', gap: 8,
            padding: scrolled ? '2px 16px 8px' : '4px 16px 12px',
            overflowX: 'auto', scrollbarWidth: 'none',
            transition: 'padding 0.25s ease',
          } as React.CSSProperties}>
            {TABS.map(({ id, label }) => {
              const active = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)} style={{
                  padding: scrolled ? '4.5px 13px' : '7px 16px',
                  borderRadius: 24, flexShrink: 0,
                  background: active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.12)',
                  border: active ? 'none' : '1px solid rgba(255,255,255,0.20)',
                  color: active ? '#C069FF' : 'rgba(255,255,255,0.80)',
                  fontSize: scrolled ? 11 : 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.25s ease',
                  backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                } as React.CSSProperties}>
                  {label}
                  {counts[id] > 0 && (
                    <span style={{
                      background: active ? 'rgba(192,105,255,0.18)' : 'rgba(255,255,255,0.15)',
                      borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 800,
                      color: active ? '#C069FF' : 'rgba(255,255,255,0.70)',
                    }}>
                      {counts[id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Content ── */}
          <div style={{ minHeight: 400 }}>
            {items.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '64px 24px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={activeTabMeta.icon as any} size={28} color={T.t3} />
                </div>
                <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>Lista vazia</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5 }}>{activeTabMeta.emptyMsg}</Txt>
                <button
                  onClick={() => router.push('/search')}
                  style={{ marginTop: 8, padding: '10px 24px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer' }}>
                  <Txt size={13} weight={700} color="#fff">Explorar títulos</Txt>
                </button>
              </div>
            ) : (
              <div style={{ padding: '8px 0 0' }}>
                <MasonryGrid2
                  items={items as unknown as TMDBItem[]}
                  onItem={(item) => router.push(`/title/${(item as any).type}/${item.id}`)}
                  getTag={watchedTag}
                />
              </div>
            )}
          </div>

        </div>
      </Screen>
    </Frame>
  );
}

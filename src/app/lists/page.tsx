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
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

type ListTab = 'want' | 'watching' | 'watched';

const TAB_ICONS: Record<ListTab, string> = { want: 'bookmark', watching: 'eye', watched: 'check' };

export default function ListsPage() {
  const router = useRouter();
  const { t } = useTranslation('home');
  const [tab, setTab]       = useState<ListTab>('want');
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const TABS = [
    { id: 'want'     as ListTab, label: t('myList.tabWant'),     icon: TAB_ICONS.want,     emptyMsg: t('myList.emptyWant')     },
    { id: 'watching' as ListTab, label: t('myList.tabWatching'), icon: TAB_ICONS.watching, emptyMsg: t('myList.emptyWatching') },
    { id: 'watched'  as ListTab, label: t('myList.tabWatched'),  icon: TAB_ICONS.watched,  emptyMsg: t('myList.emptyWatched')  },
  ];

  const [items, setItems] = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);
  const [counts, setCounts] = useState<Record<ListTab, number>>({ want: 0, watching: 0, watched: 0 });

  const reloadLists = React.useCallback(() => {
    setItems(listStore.get(tab));
    setCounts({
      want:     listStore.get('want').length,
      watching: listStore.get('watching').length,
      watched:  listStore.get('watched').length,
    });
  }, [tab]);

  useEffect(() => { reloadLists(); }, [reloadLists]);

  // Re-read after Firestore sync (new session / other device)
  useEffect(() => {
    window.addEventListener('maratonou:sync', reloadLists);
    return () => window.removeEventListener('maratonou:sync', reloadLists);
  }, [reloadLists]);

  const activeTabMeta = TABS.find((t) => t.id === tab)!;

  const watchedTag = tab === 'watched'
    ? () => ({ label: t('myList.watchedTag'), color: '#fff', bg: 'rgba(52,199,89,0.75)' })
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
              {t('myList.title')}
            </Txt>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginTop: 4, marginBottom: 16 }}>
              {t('myList.titleCount', { count: counts.want + counts.watching + counts.watched })}
            </Txt>
          </div>

          {/* ── Tabs sticky ── */}
          <div style={{
            position: 'sticky', top: 'calc(56px + var(--safe-area-top))', zIndex: 48,
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
                <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>{t('myList.emptyTitle')}</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5 }}>{activeTabMeta.emptyMsg}</Txt>
                <button
                  onClick={() => router.push('/search')}
                  style={{ marginTop: 8, padding: '10px 24px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer' }}>
                  <Txt size={13} weight={700} color="#fff">{t('myList.explore')}</Txt>
                </button>
              </div>
            ) : (
              <div className="masonry-2col" style={{ padding: '8px 0 0' }}>
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

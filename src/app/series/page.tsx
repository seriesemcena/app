'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, type TMDBItem } from '@/lib/tmdb';
import { listStore } from '@/lib/store';
import { MasonryGrid2 } from '@/components/posters';
import { useTheme } from '@/context/ThemeContext';

type SeriesTab = 'minha_lista' | 'em_breve' | 'atrasadas';
type WatchingTag = 'novo' | 'nao_assistido' | 'atrasado';

type WatchingItem = {
  id: number; title: string; type: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  nextSeason?: number; nextEpisode?: number;
  nextAirDate?: string | null;
  lastAirDate?: string | null;
  tag?: WatchingTag;
  network?: string;
};

const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return 'Hoje';
  if (d.getTime() === tomorrow.getTime()) return 'Amanhã';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export default function SeriesPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [tab, setTab] = useState<SeriesTab>('minha_lista');
  const [items, setItems] = useState<WatchingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [wantList,    setWantList]    = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);
  const [watchedList, setWatchedList] = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const watched = listStore.get('watched').filter((i) => i.type === 'tv');
    const watchedIds = new Set(watched.map((i) => i.id));
    setWatchedList(watched);
    setWantList(listStore.get('want').filter((i) => i.type === 'tv' && !watchedIds.has(i.id)));

    const watching = listStore.get('watching').filter((i) => i.type === 'tv' && !watchedIds.has(i.id));
    if (watching.length === 0) { setItems([]); setLoading(false); return; }
    setLoading(true);
    Promise.all(
      watching.map(async (item) => {
        try {
          const detail = await tmdb.tvDetail(item.id);
          const next = detail?.next_episode_to_air;
          const lastAirDate = detail?.last_episode_to_air?.air_date ?? null;
          let tag: WatchingTag | undefined;
          if (lastAirDate) {
            const diffDays = (Date.now() - new Date(lastAirDate).getTime()) / 86_400_000;
            if (diffDays <= 14) tag = 'novo';
            else if (diffDays > 30) tag = 'atrasado';
            else tag = 'nao_assistido';
          }
          return {
            id: item.id, title: item.title, type: item.type,
            poster_path: detail?.poster_path ?? item.poster_path ?? null,
            backdrop_path: detail?.backdrop_path ?? null,
            nextSeason: next?.season_number ?? undefined,
            nextEpisode: next?.episode_number ?? undefined,
            nextAirDate: next?.air_date ?? null,
            lastAirDate,
            tag,
            network: (detail as any)?.networks?.[0]?.name ?? '',
          } as WatchingItem;
        } catch {
          return { ...item } as WatchingItem;
        }
      })
    ).then((res) => { setItems(res); setLoading(false); });
  }, []);

  const atrasadas = useMemo(() => items.filter((i) => i.tag === 'atrasado'), [items]);
  const emBreve = useMemo(() =>
    items.filter((i) => i.nextAirDate)
      .sort((a, b) => new Date(a.nextAirDate!).getTime() - new Date(b.nextAirDate!).getTime()),
  [items]);

  const TAG_STYLES: Record<WatchingTag, { bg: string; color: string; label: string }> = {
    novo:          { bg: '#CCFF84', color: '#000', label: 'NOVO' },
    nao_assistido: { bg: '#FB772D', color: '#fff', label: 'NÃO ASSISTIDO' },
    atrasado:      { bg: '#e0352b', color: '#fff', label: 'ATRASADO' },
  };

  return (
    <Frame>
      <Screen>
        <div ref={scrollRef} onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>

          {/* ── Header glass sticky ── */}
          <GlassHeader
            navTitle="Séries"
            showNavTitle={scrolled}
            right={
              <button onClick={() => router.push('/search')} style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,12,0.12)', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.14)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as React.CSSProperties}>
                <Icon name="search" size={16} color={isDark ? '#fff' : 'rgba(0,0,0,0.75)'} />
              </button>
            }
          />

          {/* ── Tabs — sticky logo abaixo do header ── */}
          <div style={{
            position: 'sticky', top: 56, zIndex: 48,
            display: 'flex', gap: 8,
            padding: scrolled ? '2px 16px 8px' : '8px 16px 10px',
            overflowX: 'auto', scrollbarWidth: 'none',
            background: 'transparent',
            transition: 'padding 0.25s ease',
          } as React.CSSProperties}>
            {([
              ['minha_lista', 'Minha lista'],
              ['em_breve',    'Em breve'],
              ['atrasadas',   'Atrasadas'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: scrolled ? '4.5px 13px' : '7px 16px',
                borderRadius: 24, flexShrink: 0,
                background: tab === id
                  ? (isDark ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,12,0.88)')
                  : (isDark ? 'rgba(255,255,255,0.12)' : '#fff'),
                border: tab === id
                  ? 'none'
                  : (isDark ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(0,0,0,0.11)'),
                color: tab === id
                  ? (isDark ? '#C069FF' : '#fff')
                  : (isDark ? 'rgba(255,255,255,0.80)' : 'rgba(0,0,0,0.60)'),
                fontSize: scrolled ? 11 : 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.25s ease',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              } as React.CSSProperties}>{label}</button>
            ))}
          </div>

          {/* ── Content — fade in do bg cobre gradiente ao rolar ── */}
          <div style={{ minHeight: 400 }}>

            {/* ══ TAB: Minha lista ══ */}
            {tab === 'minha_lista' && (
              <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 32 }}>

                {/* ── Minhas séries (assistindo) ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Minhas séries</Txt>
                  {items.length === 0 && !loading ? (
                    <div style={{ padding: '20px 0', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, paddingLeft: 16 }}>
                      <Icon name="tv" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3} style={{ flex: 1 }}>
                        Adicione séries em <strong>Assistindo</strong> para vê-las aqui
                      </Txt>
                    </div>
                  ) : (
                    <MasonryGrid2
                      items={items as unknown as TMDBItem[]}
                      onItem={(item) => router.push(`/title/${(item as any).type}/${item.id}`)}
                      loading={loading}
                      skeletonCount={6}
                      padding="0"
                      getTag={(item) => {
                        const tag = (item as any).tag as WatchingTag | undefined;
                        return tag ? TAG_STYLES[tag] : undefined;
                      }}
                    />
                  )}
                </div>

                {/* ── Quero assistir ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Quero assistir</Txt>
                  {wantList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="bookmark" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>Nenhuma série salva para assistir</Txt>
                    </div>
                  ) : (
                    <MasonryGrid2
                      items={wantList as unknown as TMDBItem[]}
                      onItem={(item) => router.push(`/title/${(item as any).type}/${item.id}`)}
                      padding="0"
                    />
                  )}
                </div>

                {/* ── Finalizadas ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Finalizadas</Txt>
                  {watchedList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="check" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>Nenhuma série finalizada ainda</Txt>
                    </div>
                  ) : (
                    <MasonryGrid2
                      items={watchedList as unknown as TMDBItem[]}
                      onItem={(item) => router.push(`/title/${(item as any).type}/${item.id}`)}
                      padding="0"
                      getTag={() => ({ label: 'CONCLUÍDO', color: '#fff', bg: 'rgba(52,199,89,0.75)' })}
                    />
                  )}
                </div>

              </div>
            )}

            {/* ══ TAB: Em breve ══ */}
            {tab === 'em_breve' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>Em breve</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>Próximos episódios das suas séries</Txt>

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} style={{ height: 76, borderRadius: 16, background: T.surface2 }} />
                    ))}
                  </div>
                ) : emBreve.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0', textAlign: 'center' }}>
                    <Icon name="calendar" size={40} color={T.t4} />
                    <Txt size={15} weight={700} color={T.t2} style={{ display: 'block' }}>Sem episódios agendados</Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.4, maxWidth: 240 }}>
                      Quando suas séries tiverem novos episódios confirmados, eles aparecerão aqui
                    </Txt>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {emBreve.map((item) => {
                      const thumb = tmdbImg(item.backdrop_path ?? item.poster_path, 'w342');
                      const dateLabel = item.nextAirDate ? formatDate(item.nextAirDate) : '';
                      const isToday = dateLabel === 'Hoje';
                      const isTomorrow = dateLabel === 'Amanhã';
                      return (
                        <button
                          key={item.id}
                          onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                          {/* Thumbnail */}
                          <div style={{ width: 88, height: 60, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
                            {thumb
                              ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={20} color={T.t4} /></div>
                            }
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                              {item.title}
                            </Txt>
                            <Txt size={12} color={T.t3}>
                              {item.nextSeason && item.nextEpisode ? `T${item.nextSeason} · Ep ${item.nextEpisode}` : 'Novo episódio'}
                            </Txt>
                          </div>
                          {/* Date badge */}
                          <div style={{ flexShrink: 0 }}>
                            <span style={{
                              display: 'inline-block', padding: '5px 10px', borderRadius: 10,
                              background: isToday ? 'rgba(192,105,255,0.14)' : isTomorrow ? 'rgba(52,199,89,0.14)' : T.surface2,
                            }}>
                              <Txt size={11} weight={700} color={isToday ? T.pink : isTomorrow ? '#1a8f3a' : T.t2}>{dateLabel}</Txt>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: Atrasadas ══ */}
            {tab === 'atrasadas' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>Atrasadas</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>
                  Séries que você está há mais de 30 dias sem assistir
                </Txt>

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} style={{ height: 76, borderRadius: 16, background: T.surface2 }} />
                    ))}
                  </div>
                ) : atrasadas.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(52,199,89,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={30} color="#1a8f3a" />
                    </div>
                    <Txt size={15} weight={700} color={T.t1} style={{ display: 'block' }}>Você está em dia!</Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.4 }}>Nenhuma série atrasada. Continue assim!</Txt>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {atrasadas.map((item) => {
                      const thumb = tmdbImg(item.backdrop_path ?? item.poster_path, 'w342');
                      const lastDate = item.lastAirDate
                        ? `${new Date(item.lastAirDate + 'T00:00:00').getDate()} ${MONTHS_SHORT[new Date(item.lastAirDate + 'T00:00:00').getMonth()]}`
                        : null;
                      return (
                        <button
                          key={item.id}
                          onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.card, border: '1px solid rgba(255,59,48,0.18)', borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                          {/* Thumbnail */}
                          <div style={{ width: 88, height: 60, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
                            {thumb
                              ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={20} color={T.t4} /></div>
                            }
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
                              {item.title}
                            </Txt>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ padding: '2px 7px', borderRadius: 6, background: '#e0352b' }}>
                                <Txt size={10} weight={800} color="#fff">ATRASADO</Txt>
                              </span>
                              {lastDate && (
                                <Txt size={12} color={T.t3}>Último: {lastDate}</Txt>
                              )}
                            </div>
                          </div>
                          <Icon name="chevronR" size={16} color={T.t4} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ height: 24 }} />
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

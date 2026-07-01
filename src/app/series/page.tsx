'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg } from '@/lib/tmdb';
import { listStore } from '@/lib/store';

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
  const [tab, setTab] = useState<SeriesTab>('minha_lista');
  const [items, setItems] = useState<WatchingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [wantList,    setWantList]    = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);
  const [watchedList, setWatchedList] = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);

  useEffect(() => {
    setWantList(listStore.get('want').filter((i) => i.type === 'tv'));
    setWatchedList(listStore.get('watched').filter((i) => i.type === 'tv'));

    const watching = listStore.get('watching').filter((i) => i.type === 'tv');
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
    novo:          { bg: 'rgba(52,199,89,0.75)',  color: '#fff', label: 'NOVO' },
    nao_assistido: { bg: 'rgba(255,159,10,0.75)', color: '#fff', label: 'NÃO ASSISTIDO' },
    atrasado:      { bg: 'rgba(255,59,48,0.75)',  color: '#fff', label: 'ATRASADO' },
  };

  return (
    <Frame>
      <Screen style={{ background: 'transparent', position: 'relative' }}>
        {/* Gradient — imóvel, atrás de tudo */}
        <div style={{ position: 'absolute', inset: 0, background: 'var(--c-header-gradient)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', position: 'relative', zIndex: 1 } as React.CSSProperties}>

          {/* ── Header ── */}
          <div style={{ padding: '24px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1, color: '#fff', textTransform: 'uppercase', fontFamily: "'Area','Inter',sans-serif" }}>
              Maratonando
            </h1>
            <button
              onClick={() => router.push('/search')}
              style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="search" size={18} color="#fff" />
            </button>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px', overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
            {([
              ['minha_lista', 'Minha lista'],
              ['em_breve',    'Em breve'],
              ['atrasadas',   'Atrasadas'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: '9px 20px', borderRadius: 24, flexShrink: 0,
                background: tab === id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.18)',
                border: tab === id ? 'none' : '1px solid rgba(255,255,255,0.35)',
                color: tab === id ? '#A861FF' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
              }}>{label}</button>
            ))}
          </div>

          {/* ── Content — fade in do bg cobre gradiente ao rolar ── */}
          <div style={{ background: 'linear-gradient(to bottom, transparent 0px, var(--c-bg) 64px)', minHeight: 400 }}>

            {/* ══ TAB: Minha lista ══ */}
            {tab === 'minha_lista' && (
              <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 32 }}>

                {/* ── Minhas séries (assistindo) ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Minhas séries</Txt>
                  {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} style={{ aspectRatio: '2/3', borderRadius: 12, background: T.surface2 }} />
                      ))}
                    </div>
                  ) : items.length === 0 ? (
                    <div style={{ padding: '20px 0', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, paddingLeft: 16 }}>
                      <Icon name="tv" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3} style={{ flex: 1 }}>
                        Adicione séries em <strong>Assistindo</strong> para vê-las aqui
                      </Txt>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {items.map((item) => {
                        const poster = tmdbImg(item.poster_path, 'w342');
                        return (
                          <button
                            key={item.id}
                            onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: T.surface2, marginBottom: 6, position: 'relative' }}>
                              {poster
                                ? <img src={poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={24} color={T.t4} /></div>
                              }
                              {item.tag && (
                                <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 6px', borderRadius: 5, background: TAG_STYLES[item.tag].bg, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties}>
                                  <Txt size={9} weight={800} color={TAG_STYLES[item.tag].color}>{TAG_STYLES[item.tag].label}</Txt>
                                </div>
                              )}
                            </div>
                            <Txt size={12} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
                            {item.network && (
                              <Txt size={11} color={T.t3} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.network}</Txt>
                            )}
                          </button>
                        );
                      })}
                    </div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {wantList.map((item) => {
                        const poster = tmdbImg(item.poster_path, 'w342');
                        return (
                          <button
                            key={item.id}
                            onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: T.surface2, marginBottom: 6 }}>
                              {poster
                                ? <img src={poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={24} color={T.t4} /></div>
                              }
                            </div>
                            <Txt size={12} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
                          </button>
                        );
                      })}
                    </div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {watchedList.map((item) => {
                        const poster = tmdbImg(item.poster_path, 'w342');
                        return (
                          <button
                            key={item.id}
                            onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: T.surface2, marginBottom: 6, position: 'relative' }}>
                              {poster
                                ? <img src={poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={24} color={T.t4} /></div>
                              }
                              {/* Badge "CONCLUÍDO" */}
                              <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 6px', borderRadius: 5, background: 'rgba(52,199,89,0.75)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties}>
                                <Txt size={9} weight={800} color="#fff">CONCLUÍDO</Txt>
                              </div>
                            </div>
                            <Txt size={12} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
                          </button>
                        );
                      })}
                    </div>
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
                              background: isToday ? 'rgba(240,80,194,0.14)' : isTomorrow ? 'rgba(52,199,89,0.14)' : T.surface2,
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
                              <span style={{ padding: '2px 7px', borderRadius: 6, background: 'rgba(255,59,48,0.12)' }}>
                                <Txt size={10} weight={800} color="#c0392b">ATRASADO</Txt>
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

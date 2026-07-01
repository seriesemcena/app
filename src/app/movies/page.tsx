'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBPosterCard } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { listStore, revStore } from '@/lib/store';

type MoviesTab = 'minha_lista' | 'em_cartaz' | 'no_streaming' | 'avaliados';

type ListMovie = {
  id: number; title: string; type: string; poster_path?: string | null;
};

export default function MoviesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<MoviesTab>('minha_lista');
  const [wantList,     setWantList]     = useState<ListMovie[]>([]);
  const [favList,      setFavList]      = useState<ListMovie[]>([]);
  const [watchedList,  setWatchedList]  = useState<ListMovie[]>([]);
  const [reviewedList, setReviewedList] = useState<ListMovie[]>([]);

  // Em cartaz: discover com release_type=3 (Theatrical) — apenas cinema
  const { data: inTheaters, loading: lIT } = useTMDB(() =>
    tmdb.discover('movie', {
      with_release_type: '3',
      'primary_release_date.gte': new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
      sort_by: 'popularity.desc',
      region: 'BR',
    }), []);

  // No streaming: flatrate (assinatura) na região BR
  const { data: onStreaming, loading: lOS } = useTMDB(() =>
    tmdb.discover('movie', {
      with_watch_monetization_types: 'flatrate',
      watch_region: 'BR',
      sort_by: 'popularity.desc',
    }), []);

  useEffect(() => {
    const allLists = [
      ...listStore.get('want'),
      ...listStore.get('watching'),
      ...listStore.get('watched'),
      ...listStore.get('favorites'),
    ];
    const byId = new Map(allLists.map((i) => [i.id, i]));

    setWantList(listStore.get('want').filter((i) => i.type === 'movie'));
    setFavList(listStore.get('favorites').filter((i) => i.type === 'movie'));
    setWatchedList(listStore.get('watched').filter((i) => i.type === 'movie'));

    // Avaliados: filmes que têm pelo menos uma avaliação no revStore
    const reviewedIds: number[] = (() => {
      try {
        const all = JSON.parse(localStorage.getItem('sec_reviews_v1') || '{}');
        return Object.entries(all)
          .filter(([key, reviews]) => key.startsWith('movie_') && Array.isArray(reviews) && (reviews as any[]).length > 0)
          .map(([key]) => parseInt(key.replace('movie_', ''), 10))
          .filter((id) => !isNaN(id));
      } catch { return []; }
    })();
    setReviewedList(
      reviewedIds.map((id) => byId.get(id) ?? { id, title: `Filme ${id}`, type: 'movie', poster_path: null })
    );
  }, []);

  const openTitle = (id: number) => router.push(`/title/movie/${id}`);

  return (
    <Frame>
      <Screen style={{ background: 'transparent', position: 'relative' }}>
        {/* Gradient — imóvel, atrás de tudo */}
        <div style={{ position: 'absolute', inset: 0, background: 'var(--c-header-gradient)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', position: 'relative', zIndex: 1 } as React.CSSProperties}>

          {/* ── Header ── */}
          <div style={{ padding: '24px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1, color: '#fff', textTransform: 'uppercase', fontFamily: "'Area','Inter',sans-serif" }}>
              Meus Filmes
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
              ['minha_lista',  'Minha lista'],
              ['em_cartaz',    'Em cartaz'],
              ['no_streaming', 'No streaming'],
              ['avaliados',    'Avaliados'],
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

                {/* ── Quero ver ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Quero ver</Txt>
                  {wantList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="film" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>Nenhum filme salvo para assistir</Txt>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {wantList.map((item) => {
                        const poster = tmdbImg(item.poster_path, 'w342');
                        return (
                          <button key={item.id} onClick={() => openTitle(item.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: T.surface2, marginBottom: 6 }}>
                              {poster ? <img src={poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="film" size={24} color={T.t4} /></div>}
                            </div>
                            <Txt size={12} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Favoritos ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Favoritos</Txt>
                  {favList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="heart" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>Nenhum filme favorito ainda</Txt>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {favList.map((item) => {
                        const poster = tmdbImg(item.poster_path, 'w342');
                        return (
                          <button key={item.id} onClick={() => openTitle(item.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: T.surface2, marginBottom: 6 }}>
                              {poster ? <img src={poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="film" size={24} color={T.t4} /></div>}
                            </div>
                            <Txt size={12} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Concluídos ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Concluídos</Txt>
                  {watchedList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="check" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>Nenhum filme marcado como assistido</Txt>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {watchedList.map((item) => {
                        const poster = tmdbImg(item.poster_path, 'w342');
                        return (
                          <button key={item.id} onClick={() => openTitle(item.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: T.surface2, marginBottom: 6, position: 'relative' }}>
                              {poster ? <img src={poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="film" size={24} color={T.t4} /></div>}
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

            {/* ══ TAB: Em cartaz ══ */}
            {tab === 'em_cartaz' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>Em cartaz nos cinemas</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>Filmes em exibição nas salas de cinema</Txt>
                {lIT ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} style={{ aspectRatio: '2/3', borderRadius: 12, background: T.surface2 }} />
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {(inTheaters?.results || []).slice(0, 12).map((item: TMDBItem) => (
                      <TMDBPosterCard
                        key={item.id}
                        item={item}
                        size="sm"
                        onClick={() => { const n = normalize(item); router.push(`/title/${n.type}/${n.id}`); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: No streaming ══ */}
            {tab === 'no_streaming' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>No streaming</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>Filmes disponíveis para assistir agora</Txt>
                {lOS ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} style={{ aspectRatio: '2/3', borderRadius: 12, background: T.surface2 }} />
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {(onStreaming?.results || []).slice(0, 12).map((item: TMDBItem) => (
                      <TMDBPosterCard
                        key={item.id}
                        item={item}
                        size="sm"
                        onClick={() => { const n = normalize(item); router.push(`/title/${n.type}/${n.id}`); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: Avaliados ══ */}
            {tab === 'avaliados' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>Avaliados</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>Filmes que você já avaliou</Txt>
                {reviewedList.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0', textAlign: 'center' }}>
                    <Icon name="star" size={40} color={T.t4} />
                    <Txt size={15} weight={700} color={T.t2} style={{ display: 'block' }}>Nenhum filme avaliado ainda</Txt>
                    <button onClick={() => router.push('/search')} style={{ marginTop: 4, padding: '10px 24px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer' }}>
                      <Txt size={13} weight={700} color="#fff">Explorar filmes</Txt>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {reviewedList.map((item) => {
                      const poster = tmdbImg(item.poster_path, 'w342');
                      const reviews = revStore.get(`movie_${item.id}`);
                      const myRating = reviews[0]?.rating;
                      return (
                        <button key={item.id} onClick={() => openTitle(item.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: T.surface2, marginBottom: 6, position: 'relative' }}>
                            {poster
                              ? <img src={poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="film" size={24} color={T.t4} /></div>
                            }
                            {myRating && (
                              <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 8, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
                                <Icon name="star" size={9} color={T.gold} />
                                <Txt size={10} weight={800} color={T.gold}>{myRating}/10</Txt>
                              </div>
                            )}
                          </div>
                          <Txt size={12} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
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

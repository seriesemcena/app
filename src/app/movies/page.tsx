'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { MasonryGrid2 } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
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
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

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

  const toTMDBItem = (x: ListMovie): TMDBItem => ({
    id: x.id, title: x.title, name: x.title,
    media_type: 'movie', poster_path: x.poster_path || null,
    backdrop_path: null, overview: '', vote_average: 0,
    release_date: '', first_air_date: '', popularity: 0,
  } as TMDBItem);

  return (
    <Frame>
      <Screen>
        <div ref={scrollRef} onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>

          {/* ── Header glass sticky ── */}
          <GlassHeader
            right={
              <button onClick={() => router.push('/search')} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="search" size={16} color="#fff" />
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
              ['minha_lista',  'Minha lista'],
              ['em_cartaz',    'Em cartaz'],
              ['no_streaming', 'No streaming'],
              ['avaliados',    'Avaliados'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: scrolled ? '4.5px 13px' : '7px 16px',
                borderRadius: 24, flexShrink: 0,
                background: tab === id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.12)',
                border: tab === id ? 'none' : '1px solid rgba(255,255,255,0.20)',
                color: tab === id ? '#C069FF' : 'rgba(255,255,255,0.80)',
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

                {/* ── Quero ver ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>Quero ver</Txt>
                  {wantList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="film" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>Nenhum filme salvo para assistir</Txt>
                    </div>
                  ) : (
                    <MasonryGrid2
                      items={wantList.map(toTMDBItem)}
                      onItem={(item) => openTitle(item.id)}
                      padding="0"
                    />
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
                    <MasonryGrid2
                      items={favList.map(toTMDBItem)}
                      onItem={(item) => openTitle(item.id)}
                      padding="0"
                    />
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
                    <MasonryGrid2
                      items={watchedList.map(toTMDBItem)}
                      onItem={(item) => openTitle(item.id)}
                      padding="0"
                      getTag={() => ({ label: 'CONCLUÍDO', color: '#fff', bg: 'rgba(52,199,89,0.75)' })}
                    />
                  )}
                </div>

              </div>
            )}

            {/* ══ TAB: Em cartaz ══ */}
            {tab === 'em_cartaz' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>Em cartaz nos cinemas</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>Filmes em exibição nas salas de cinema</Txt>
                <MasonryGrid2
                  items={(inTheaters?.results || []).slice(0, 10)}
                  onItem={(item) => { const n = normalize(item); router.push(`/title/${n.type}/${n.id}`); }}
                  loading={!!lIT}
                  skeletonCount={8}
                  padding="0"
                />
              </div>
            )}

            {/* ══ TAB: No streaming ══ */}
            {tab === 'no_streaming' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>No streaming</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>Filmes disponíveis para assistir agora</Txt>
                <MasonryGrid2
                  items={(onStreaming?.results || []).slice(0, 10)}
                  onItem={(item) => { const n = normalize(item); router.push(`/title/${n.type}/${n.id}`); }}
                  loading={!!lOS}
                  skeletonCount={8}
                  padding="0"
                />
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
                  <MasonryGrid2
                    items={reviewedList.map(toTMDBItem)}
                    onItem={(item) => openTitle(item.id)}
                    padding="0"
                  />
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

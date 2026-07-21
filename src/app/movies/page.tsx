'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { MasonryGrid2 } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, type TMDBItem } from '@/lib/tmdb';
import { listStore } from '@/lib/store';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

type MoviesTab = 'minha_lista' | 'proximas_estreias' | 'avaliados';

type ListMovie = {
  id: number; title: string; type: string; poster_path?: string | null;
};

export default function MoviesPage() {
  const router = useRouter();
  const { t } = useTranslation('home');
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [tab, setTab] = useState<MoviesTab>('minha_lista');
  const [wantList,     setWantList]     = useState<ListMovie[]>([]);
  const [favList,      setFavList]      = useState<ListMovie[]>([]);
  const [watchedList,  setWatchedList]  = useState<ListMovie[]>([]);
  const [reviewedList, setReviewedList] = useState<ListMovie[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Catálogo oficial de próximas estreias da TMDB para a região do Brasil.
  const { data: upcomingMovies, loading: upcomingLoading } = useTMDB(
    () => tmdb.upcoming('BR'),
    []
  );

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
        <div className="app-page-scroll" ref={scrollRef} onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>

          {/* ── Header glass sticky ── */}
          <GlassHeader
            navTitle={t('movies', { ns: 'navigation' })}
            showNavTitle={scrolled}
            right={
              <button aria-label="Notificações" onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={16} color={isDark ? '#fff' : 'rgba(0,0,0,0.70)'} />
              </button>
            }
          />

          {/* ── Tabs — sticky logo abaixo do header ── */}
          <div style={{
            position: 'sticky', top: 'calc(56px + var(--safe-area-top))', zIndex: 48,
            display: 'flex', gap: 8,
            padding: scrolled ? '4px 16px 10px' : '8px 16px 12px',
            overflowX: 'auto', scrollbarWidth: 'none',
            background: 'transparent',
            transition: 'padding 0.25s ease',
          } as React.CSSProperties}>
            {(['minha_lista', 'proximas_estreias', 'avaliados'] as const).map((id) => (
              <button key={id} onClick={() => setTab(id)} style={{
                minHeight: scrolled ? 34 : 36,
                padding: scrolled ? '6px 15px' : '8px 18px',
                borderRadius: 24, flexShrink: 0,
                background: tab === id
                  ? (isDark ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,12,0.88)')
                  : (isDark ? 'rgba(255,255,255,0.12)' : '#fff'),
                border: tab === id
                  ? 'none'
                  : (isDark ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(0,0,0,0.11)'),
                color: tab === id
                  ? (isDark ? T.active : '#fff')
                  : (isDark ? 'rgba(255,255,255,0.80)' : 'rgba(0,0,0,0.60)'),
                fontSize: scrolled ? 13 : 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.25s ease',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              } as React.CSSProperties}>{t(`movies.tabs.${id}`)}</button>
            ))}
          </div>

          {/* ── Content — fade in do bg cobre gradiente ao rolar ── */}
          <div style={{ minHeight: 400 }}>

            {/* ══ TAB: Minha lista ══ */}
            {tab === 'minha_lista' && (
              <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 32 }}>

                {/* ── Quero ver ── */}
                <div>
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>{t('movies.wantSection')}</Txt>
                  {wantList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="film" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>{t('movies.emptyWant')}</Txt>
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
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>{t('movies.favSection')}</Txt>
                  {favList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="heart" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>{t('movies.emptyFav')}</Txt>
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
                  <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 14 }}>{t('movies.finishedSection')}</Txt>
                  {watchedList.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}` }}>
                      <Icon name="check" size={22} color={T.t4} />
                      <Txt size={13} color={T.t3}>{t('movies.emptyWatched')}</Txt>
                    </div>
                  ) : (
                    <MasonryGrid2
                      items={watchedList.map(toTMDBItem)}
                      onItem={(item) => openTitle(item.id)}
                      padding="0"
                      getTag={() => ({ label: t('tags.concluido'), color: '#fff', bg: 'rgba(52,199,89,0.75)' })}
                    />
                  )}
                </div>

              </div>
            )}

            {/* ══ TAB: Próximas estreias ══ */}
            {tab === 'proximas_estreias' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>{t('movies.upcomingTitle')}</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>{t('movies.upcomingSub')}</Txt>
                <MasonryGrid2
                  items={(upcomingMovies?.results || []).slice(0, 10)}
                  onItem={(item) => openTitle(item.id)}
                  loading={!!upcomingLoading}
                  skeletonCount={8}
                  padding="0"
                />
              </div>
            )}

            {/* ══ TAB: Avaliados ══ */}
            {tab === 'avaliados' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>{t('movies.ratedTitle')}</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>{t('movies.ratedSub')}</Txt>
                {reviewedList.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0', textAlign: 'center' }}>
                    <Icon name="star" size={40} color={T.t4} />
                    <Txt size={15} weight={700} color={T.t2} style={{ display: 'block' }}>{t('movies.emptyRated')}</Txt>
                    <button onClick={() => router.push('/search')} style={{ marginTop: 4, padding: '10px 24px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer' }}>
                      <Txt size={13} weight={700} color="#fff">{t('movies.exploreMovies')}</Txt>
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

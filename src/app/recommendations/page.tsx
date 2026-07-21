'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Txt, VIPBadge } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBPosterCard, SkeletonCards, HSection } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { prefsStore } from '@/lib/store';
import { navigateBack } from '@/lib/navigation';

const GENRE_MAP: Record<string, number> = { 'Ação': 28, 'Drama': 18, 'Sci-Fi': 878, 'Terror': 27, 'Comédia': 35, 'Romance': 10749, 'Thriller': 53 };

export default function RecommendationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'para_voce' | 'filmes' | 'series'>('para_voce');

  const prefs       = useMemo(() => prefsStore.get(), []);
  const likedGenres = prefs.genres?.length ? prefs.genres : ['Drama', 'Ação', 'Sci-Fi'];
  const gid1        = String(GENRE_MAP[likedGenres[0]] || 18);
  const gid2        = String(GENRE_MAP[likedGenres[1]] || 28);

  const { data: rec1,     loading: l1 } = useTMDB(() => tmdb.discover('movie', { with_genres: gid1, sort_by: 'vote_average.desc', 'vote_count.gte': '200' }), [gid1]);
  const { data: rec2,     loading: l2 } = useTMDB(() => tmdb.discover('tv',    { with_genres: gid2, sort_by: 'vote_average.desc', 'vote_count.gte': '100' }), [gid2]);
  const { data: trending }              = useTMDB(() => tmdb.trending('all', 'week'), []);
  const { data: topMovies }             = useTMDB(() => tmdb.topRated('movie'), []);
  const { data: topTV }                 = useTMDB(() => tmdb.topRated('tv'), []);

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  };

  const Row = ({ title, items, loading }: { title: string; items?: TMDBItem[]; loading?: boolean }) => (
    <HSection title={title}>
      {loading ? <SkeletonCards count={5} /> : (items || []).slice(0, 10).map((item) => (
        <TMDBPosterCard key={item.id} item={item} size="md" onClick={() => openTitle(item)} />
      ))}
    </HSection>
  );

  return (
    <Frame>
      <Screen>
        <AppBar title="Recomendações" left={
          <button onClick={() => navigateBack(router)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="chevronL" size={20} color={T.t2} />
          </button>
        } />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 } as React.CSSProperties}>
          {([['para_voce', 'Para Você'], ['filmes', 'Filmes'], ['series', 'Séries']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: '9px 20px', borderRadius: 24, flexShrink: 0, background: tab === id ? T.pillActiveBg : 'transparent', border: tab === id ? `1px solid ${T.pillActiveBorder}` : `1px solid ${T.dim}`, color: tab === id ? T.pillActiveText : T.t2, fontSize: 13, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        <ScrollArea style={{ paddingTop: 12 }}>
          {tab === 'para_voce' && (
            <>
              <div style={{ padding: '0 16px 16px' }}>
                <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Baseado nos seus gostos</Txt>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {likedGenres.map((g) => (
                    <div key={g} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(192,105,255,0.15)', border: `1px solid rgba(192,105,255,0.3)` }}>
                      <Txt size={12} weight={700} color={T.pink}>{g}</Txt>
                    </div>
                  ))}
                </div>
              </div>
              <Row title={`Porque você curte ${likedGenres[0]}`} items={rec1?.results} loading={l1} />
              <Row title={`Séries de ${likedGenres[1]}`}         items={rec2?.results} loading={l2} />
              <Row title="Em alta esta semana"                   items={trending?.results} loading={!trending} />

            </>
          )}

          {tab === 'filmes' && (
            <>
              <Row title="Mais bem avaliados"     items={topMovies?.results} loading={!topMovies} />
              <Row title={`${likedGenres[0]} — Para Você`} items={rec1?.results} loading={l1} />
              <Row title="Em Alta" items={(trending?.results || []).filter((i: TMDBItem) => !i.first_air_date)} loading={!trending} />
            </>
          )}

          {tab === 'series' && (
            <>
              <Row title="Top Séries"               items={topTV?.results}  loading={!topTV} />
              <Row title={`${likedGenres[1]} — Para Você`} items={rec2?.results} loading={l2} />
              <Row title="Séries em Alta" items={(trending?.results || []).filter((i: TMDBItem) => i.first_air_date)} loading={!trending} />
            </>
          )}

          <div style={{ height: 20 }} />
        </ScrollArea>
      </Screen>

    </Frame>
  );
}

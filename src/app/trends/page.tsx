'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBPosterCard } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';

type TrendsPeriod = 'day' | 'week';

/* streaming platforms with their TMDB watch_provider IDs */
const PLATFORMS = [
  { id: 'netflix',   name: 'Netflix',    providerId: '8',   color: '#E50914', logo: 'N' },
  { id: 'prime',     name: 'Prime',      providerId: '119', color: '#00A8E0', logo: 'P' },
  { id: 'disney',    name: 'Disney+',    providerId: '337', color: '#113CCF', logo: 'D+' },
  { id: 'hbo',       name: 'HBO Max',    providerId: '384', color: '#5800A0', logo: 'H' },
  { id: 'apple',     name: 'Apple TV+',  providerId: '350', color: '#444',    logo: '' },
  { id: 'paramount', name: 'Paramount+', providerId: '531', color: '#0064FF', logo: 'P+' },
];

function PlatformSection({ platform, period, onTitle }: {
  platform: typeof PLATFORMS[0]; period: TrendsPeriod;
  onTitle: (item: TMDBItem) => void;
}) {
  const { data: movies, loading: lm } = useTMDB(
    () => tmdb.discover('movie', { with_watch_providers: platform.providerId, watch_region: 'BR', sort_by: 'popularity.desc', page: '1' }),
    [platform.providerId, period]
  );
  const { data: shows, loading: ls } = useTMDB(
    () => tmdb.discover('tv', { with_watch_providers: platform.providerId, watch_region: 'BR', sort_by: 'popularity.desc', page: '1' }),
    [platform.providerId, period]
  );

  const items: TMDBItem[] = [
    ...(movies?.results || []).slice(0, 5).map((i: TMDBItem) => ({ ...i, media_type: 'movie' as const })),
    ...(shows?.results  || []).slice(0, 5).map((i: TMDBItem) => ({ ...i, media_type: 'tv'    as const })),
  ].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)).slice(0, 8);

  const loading = lm || ls;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Platform header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: platform.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Txt size={12} weight={900} color="#fff">{platform.logo}</Txt>
        </div>
        <Txt size={17} weight={800}>{platform.name}</Txt>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '2px 8px', borderRadius: 6, background: platform.color + '22', border: `1px solid ${platform.color}44` }}>
          <Txt size={10} weight={700} color={platform.color}>Em alta</Txt>
        </div>
      </div>

      {/* Horizontal scroll */}
      <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
        {loading
          ? [...Array(5)].map((_, i) => (
              <div key={i} style={{ width: 90, flexShrink: 0 }}>
                <div style={{ width: 90, height: 134, borderRadius: 10, background: T.card }} />
                <div style={{ height: 10, background: T.surface, borderRadius: 4, marginTop: 8, width: '80%' }} />
              </div>
            ))
          : items.map(item => (
              <div key={item.id} style={{ flexShrink: 0 }}>
                <TMDBPosterCard item={item} size="sm" onClick={() => onTitle(item)} />
              </div>
            ))
        }
        {!loading && items.length === 0 && (
          <Txt size={13} color={T.t3} style={{ padding: '20px 0' }}>Sem resultados para esta plataforma.</Txt>
        )}
      </div>
    </div>
  );
}

export default function TrendsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<TrendsPeriod>('week');
  const [activeTab, setActiveTab] = useState<'plataformas' | 'geral'>('plataformas');

  /* global trending for the "geral" tab */
  const { data: trendAll, loading: ltA } = useTMDB(() => tmdb.trending('all', period), [period]);
  const { data: trendMov, loading: ltM } = useTMDB(() => tmdb.trending('movie', period), [period]);
  const { data: trendTV,  loading: ltT } = useTMDB(() => tmdb.trending('tv',    period), [period]);

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type === 'person' ? 'movie' : n.type}/${n.id}`);
  };

  return (
    <Frame>
      <Screen>
        <AppBar title="Trends" right={
          <button onClick={() => router.push('/search')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="search" size={20} color={T.t2} />
          </button>
        } />

        {/* Main tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 } as React.CSSProperties}>
          {([['plataformas', 'Por plataforma'], ['geral', 'Geral']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{ padding: '9px 20px', borderRadius: 24, flexShrink: 0, background: activeTab === id ? T.white : 'transparent', border: activeTab === id ? 'none' : `1px solid ${T.dim}`, color: activeTab === id ? T.bg : T.t2, fontSize: 13, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Period toggle */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px', flexShrink: 0 }}>
          {(['day', 'week'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '6px 16px', borderRadius: 20, border: period === p ? 'none' : `1px solid ${T.border}`, background: period === p ? T.pink : 'transparent', color: period === p ? T.white : T.t3, fontSize: 12, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.15s' }}>
              {p === 'day' ? 'Hoje' : 'Esta semana'}
            </button>
          ))}
        </div>

        <ScrollArea style={{ paddingTop: 12 }}>
          {activeTab === 'plataformas' ? (
            <>
              {PLATFORMS.map(p => (
                <PlatformSection key={p.id} platform={p} period={period} onTitle={openTitle} />
              ))}
              <div style={{ height: 20 }} />
            </>
          ) : (
            <div style={{ padding: '0 0 80px' }}>
              {/* Top 10 geral */}
              <Txt size={17} weight={800} style={{ display: 'block', padding: '0 16px', marginBottom: 16 }}>🔥 Top geral</Txt>
              <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 28 } as React.CSSProperties}>
                {ltA
                  ? [...Array(6)].map((_, i) => <div key={i} style={{ width: 90, height: 134, borderRadius: 10, background: T.card, flexShrink: 0 }} />)
                  : (trendAll?.results || []).slice(0, 10).map((item: TMDBItem) => (
                      <div key={item.id} style={{ flexShrink: 0 }}>
                        <TMDBPosterCard item={item} size="sm" onClick={() => openTitle(item)} />
                      </div>
                    ))
                }
              </div>

              <Txt size={17} weight={800} style={{ display: 'block', padding: '0 16px', marginBottom: 16 }}>🎬 Filmes em alta</Txt>
              <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 28 } as React.CSSProperties}>
                {ltM
                  ? [...Array(6)].map((_, i) => <div key={i} style={{ width: 90, height: 134, borderRadius: 10, background: T.card, flexShrink: 0 }} />)
                  : (trendMov?.results || []).slice(0, 10).map((item: TMDBItem) => (
                      <div key={item.id} style={{ flexShrink: 0 }}>
                        <TMDBPosterCard item={item} size="sm" onClick={() => openTitle(item)} />
                      </div>
                    ))
                }
              </div>

              <Txt size={17} weight={800} style={{ display: 'block', padding: '0 16px', marginBottom: 16 }}>📺 Séries em alta</Txt>
              <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 28 } as React.CSSProperties}>
                {ltT
                  ? [...Array(6)].map((_, i) => <div key={i} style={{ width: 90, height: 134, borderRadius: 10, background: T.card, flexShrink: 0 }} />)
                  : (trendTV?.results || []).slice(0, 10).map((item: TMDBItem) => (
                      <div key={item.id} style={{ flexShrink: 0 }}>
                        <TMDBPosterCard item={item} size="sm" onClick={() => openTitle(item)} />
                      </div>
                    ))
                }
              </div>
            </div>
          )}
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

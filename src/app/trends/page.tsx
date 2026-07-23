'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { MasonryGrid2 } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { STREAMING_COLORS } from '@/lib/streamingPlatforms';

type TrendsPeriod = 'day' | 'week';

/* streaming platforms with their TMDB watch_provider IDs */
const PLATFORMS = [
  { id: 'netflix',   name: 'Netflix',    providerId: '8',   color: '#E50914', logo: 'N' },
  { id: 'prime',     name: 'Prime',      providerId: '119', color: STREAMING_COLORS.prime, logo: 'P' },
  { id: 'disney',    name: 'Disney+',    providerId: '337', color: STREAMING_COLORS.disney, logo: 'D+' },
  { id: 'hbo',       name: 'HBO Max',    providerId: '384', color: STREAMING_COLORS.hbo, logo: 'H' },
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

      {/* Masonry 2 colunas */}
      {items.length === 0 && !loading
        ? <Txt size={13} color={T.t3} style={{ padding: '0 16px 20px', display: 'block' }}>Sem resultados para esta plataforma.</Txt>
        : <MasonryGrid2
            items={items}
            onItem={onTitle}
            loading={loading}
            skeletonCount={6}
          />
      }
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
          <button aria-label="Notificações" onClick={() => router.push('/notifications')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="bell" size={20} color={T.t2} />
          </button>
        } />

        {/* Main tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 } as React.CSSProperties}>
          {([['plataformas', 'Por plataforma'], ['geral', 'Geral']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{ padding: '9px 20px', borderRadius: 24, flexShrink: 0, background: activeTab === id ? T.pillActiveBg : 'transparent', border: activeTab === id ? `1px solid ${T.pillActiveBorder}` : `1px solid ${T.dim}`, color: activeTab === id ? T.pillActiveText : T.t2, fontSize: 13, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Period toggle */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px', flexShrink: 0 }}>
          {(['day', 'week'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '6px 16px', borderRadius: 20, border: period === p ? `1px solid ${T.pillActiveBorder}` : `1px solid ${T.border}`, background: period === p ? T.pillActiveBg : 'transparent', color: period === p ? T.pillActiveText : T.t3, fontSize: 12, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.15s' }}>
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
              <Txt size={17} weight={800} style={{ display: 'block', padding: '0 16px', marginBottom: 14 }}>🔥 Top geral</Txt>
              <div style={{ marginBottom: 32 }}>
                <MasonryGrid2 items={(trendAll?.results || []).slice(0, 10)} onItem={openTitle} loading={ltA} skeletonCount={6} />
              </div>

              <Txt size={17} weight={800} style={{ display: 'block', padding: '0 16px', marginBottom: 14 }}>🎬 Filmes em alta</Txt>
              <div style={{ marginBottom: 32 }}>
                <MasonryGrid2 items={(trendMov?.results || []).slice(0, 10)} onItem={openTitle} loading={ltM} skeletonCount={6} />
              </div>

              <Txt size={17} weight={800} style={{ display: 'block', padding: '0 16px', marginBottom: 14 }}>📺 Séries em alta</Txt>
              <div style={{ marginBottom: 32 }}>
                <MasonryGrid2 items={(trendTV?.results || []).slice(0, 10)} onItem={openTitle} loading={ltT} skeletonCount={6} />
              </div>
            </div>
          )}
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

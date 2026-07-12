'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';

const PLATFORMS: Record<string, { name: string; color: string }> = {
  '8':    { name: 'Netflix',     color: '#E50914' },
  '337':  { name: 'Disney+',     color: '#113CCF' },
  '1899': { name: 'Max',         color: '#002BE7' },
  '119':  { name: 'Prime Video', color: '#00A8E0' },
  '307':  { name: 'Globoplay',   color: '#E8441C' },
  '531':  { name: 'Paramount+',  color: '#0064FF' },
};

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

/* ── Card de poster com tamanho fixo e textless poster ── */
function PosterCard({ item, onClick }: { item: TMDBItem; onClick: () => void }) {
  const [fetchDone,   setFetchDone]   = useState(false);
  const [textlessSrc, setTextlessSrc] = useState<string | null>(null);
  const [imgLoaded,   setImgLoaded]   = useState(false);

  const n       = normalize(item);
  const apiType = n.type === 'tv' ? 'tv' : 'movie';
  const fallback = n.poster_path ? tmdbImg(n.poster_path, 'w342') : null;
  const src      = fetchDone ? (textlessSrc ?? fallback) : null;

  useEffect(() => {
    if (!item.id) return;
    let alive = true;
    fetch(`/api/tmdb?endpoint=/${apiType}/${item.id}/images&include_image_language=null`)
      .then(r => r.json())
      .then(data => {
        if (!alive) return;
        const best = (data?.posters ?? [])
          .filter((p: any) => p.iso_639_1 === null)
          .sort((a: any, b: any) => b.vote_average - a.vote_average)[0];
        if (best?.file_path) setTextlessSrc(tmdbImg(best.file_path, 'w342') ?? null);
        setFetchDone(true);
      })
      .catch(() => { if (alive) setFetchDone(true); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, apiType]);

  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', flexShrink: 0, width: 120 }}
    >
      {/* Poster fixo 120×180 */}
      <div style={{
        width: 120, height: 180, borderRadius: 14, overflow: 'hidden',
        background: '#0a0a0c',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 2px 10px rgba(0,0,0,0.4)',
        position: 'relative',
      }}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src} alt={n.title}
            onLoad={() => setImgLoaded(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
          />
        )}
      </div>
      {/* Título */}
      <div style={{ padding: '7px 2px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.90)', fontFamily: "'Area',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {n.title}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', fontFamily: "'Area',sans-serif", marginTop: 2 }}>
          {apiType === 'tv' ? 'Série' : 'Filme'}{n.year ? ` · ${n.year}` : ''}
        </div>
      </div>
    </button>
  );
}

/* ── Row horizontal de cards ── */
function HRow({ items, loading, skeletonCount = 6, onItem }: {
  items: TMDBItem[]; loading?: boolean; skeletonCount?: number; onItem: (i: TMDBItem) => void;
}) {
  if (loading) return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
      <div style={{ width: 16, flexShrink: 0 }} />
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <div key={i} style={{ flexShrink: 0, width: 120 }}>
          <div style={{ width: 120, height: 180, borderRadius: 14, background: T.surface2 }} />
          <div style={{ height: 11, width: 90, borderRadius: 5, background: T.surface2, marginTop: 8 }} />
          <div style={{ height: 9, width: 60, borderRadius: 4, background: T.surface2, marginTop: 4 }} />
        </div>
      ))}
      <div style={{ width: 8, flexShrink: 0 }} />
    </div>
  );
  if (items.length === 0) return (
    <div style={{ paddingLeft: 16, paddingTop: 8 }}>
      <Txt size={13} color={T.t4}>Nenhum título encontrado</Txt>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', scrollSnapType: 'x mandatory', scrollPaddingLeft: 16 } as React.CSSProperties}>
      <div style={{ width: 16, flexShrink: 0 }} />
      {items.map(item => (
        <div key={item.id} style={{ scrollSnapAlign: 'start' }}>
          <PosterCard item={item} onClick={() => onItem(item)} />
        </div>
      ))}
      <div style={{ width: 8, flexShrink: 0 }} />
    </div>
  );
}

/* ── Cabeçalho de seção com barra colorida ── */
function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div style={{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 3, height: 20, borderRadius: 2, background: color, flexShrink: 0 }} />
      <Txt size={20} weight={900} style={{ fontStretch: 'condensed', lineHeight: 1 } as React.CSSProperties}>
        {title}
      </Txt>
    </div>
  );
}

/* ──────────────────────────────────────────────── */
export default function StreamingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }    = use(params);
  const router    = useRouter();
  const platform  = PLATFORMS[id] ?? { name: 'Streaming', color: '#555' };
  const { start, end } = getWeekRange();

  const [trendTab, setTrendTab] = useState<'series' | 'filmes'>('series');
  const [newTab,   setNewTab]   = useState<'series' | 'filmes'>('series');

  /* ── Em alta ── */
  const { data: trendTV,    loading: lTV  } = useTMDB(() =>
    tmdb.discover('tv',    { with_watch_providers: id, watch_region: 'BR', sort_by: 'popularity.desc' }), [id]);
  const { data: trendMovie, loading: lMov } = useTMDB(() =>
    tmdb.discover('movie', { with_watch_providers: id, watch_region: 'BR', sort_by: 'popularity.desc' }), [id]);

  /* ── Estreias da semana ── */
  const { data: newTV,    loading: lNTV  } = useTMDB(() =>
    tmdb.discover('tv', {
      with_watch_providers: id, watch_region: 'BR',
      'first_air_date.gte': start, 'first_air_date.lte': end,
      sort_by: 'popularity.desc',
    }), [id]);
  const { data: newMovie, loading: lNMov } = useTMDB(() =>
    tmdb.discover('movie', {
      with_watch_providers: id, watch_region: 'BR',
      'primary_release_date.gte': start, 'primary_release_date.lte': end,
      sort_by: 'popularity.desc',
    }), [id]);

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  };

  const trendSeries = (trendTV?.results    || []).slice(0, 20);
  const trendFilmes = (trendMovie?.results || []).slice(0, 20);
  const newSeries   = (newTV?.results      || []).slice(0, 20);
  const newFilmes   = (newMovie?.results   || []).slice(0, 20);

  return (
    <Frame>
      <Screen>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>

          {/* ── Header ── */}
          <GlassHeader
            left={
              <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                <Icon name="chevronL" size={16} color="#fff" />
              </button>
            }
          >
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'Area',sans-serif", letterSpacing: 0.5 }}>
              {platform.name}
            </span>
          </GlassHeader>

          {/* ── Banner ── */}
          <div style={{
            margin: '8px 16px 28px',
            borderRadius: 20, padding: '20px',
            background: `linear-gradient(135deg, ${platform.color}bb 0%, ${platform.color}44 100%)`,
            border: `1px solid ${platform.color}40`,
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: platform.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 16px ${platform.color}55` }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'Greed','Area',sans-serif" }}>{platform.name[0]}</span>
            </div>
            <div>
              <Txt size={20} weight={900} color="#fff" style={{ display: 'block', lineHeight: 1.1 }}>{platform.name}</Txt>
              <Txt size={12} color="rgba(255,255,255,0.55)" style={{ display: 'block', marginTop: 3 }}>Séries e filmes em destaque</Txt>
            </div>
          </div>

          {/* ══ Em alta esta semana ══ */}
          <div style={{ marginBottom: 36 }}>
            {/* Header + tabs */}
            <div style={{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: platform.color, flexShrink: 0 }} />
                <Txt size={20} weight={900} style={{ fontStretch: 'condensed', lineHeight: 1 } as React.CSSProperties}>Em alta esta semana</Txt>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['series', 'filmes'] as const).map(t => (
                  <button key={t} onClick={() => setTrendTab(t)} style={{
                    padding: '5px 14px', borderRadius: 20,
                    background: trendTab === t ? platform.color : 'rgba(255,255,255,0.08)',
                    border: trendTab === t ? 'none' : '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    fontFamily: "'Area',sans-serif", cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                    {t === 'series' ? 'Séries' : 'Filmes'}
                  </button>
                ))}
              </div>
            </div>

            <HRow
              items={trendTab === 'series' ? trendSeries : trendFilmes}
              loading={trendTab === 'series' ? lTV : lMov}
              onItem={openTitle}
            />
          </div>

          {/* ══ Estreias da semana ══ */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: platform.color, flexShrink: 0 }} />
                <Txt size={20} weight={900} style={{ fontStretch: 'condensed', lineHeight: 1 } as React.CSSProperties}>Estreias da semana</Txt>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['series', 'filmes'] as const).map(t => (
                  <button key={t} onClick={() => setNewTab(t)} style={{
                    padding: '5px 14px', borderRadius: 20,
                    background: newTab === t ? platform.color : 'rgba(255,255,255,0.08)',
                    border: newTab === t ? 'none' : '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    fontFamily: "'Area',sans-serif", cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                    {t === 'series' ? 'Séries' : 'Filmes'}
                  </button>
                ))}
              </div>
            </div>

            <HRow
              items={newTab === 'series' ? newSeries : newFilmes}
              loading={newTab === 'series' ? lNTV : lNMov}
              skeletonCount={4}
              onItem={openTitle}
            />
          </div>

          <div style={{ height: 32 }} />
        </div>
      </Screen>
    </Frame>
  );
}

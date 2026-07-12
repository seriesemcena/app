'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { listStore, revStore, prefsStore } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';

/* ── Genre color map ────────────────────────────────────────── */
const GENRE_COLORS: Record<string, string> = {
  'Drama':               '#C069FF', 'Ação': '#FF6B2B', 'Action': '#FF6B2B',
  'Comédia':             '#F5C518', 'Comedy': '#F5C518',
  'Ficção científica':   '#3b82f6', 'Ficção Científica': '#3b82f6',
  'Science Fiction':     '#3b82f6', 'Sci-Fi': '#3b82f6',
  'Terror':              '#8b5cf6', 'Horror': '#8b5cf6',
  'Romance':             '#ec4899', 'Thriller': '#ef4444',
  'Documentário':        '#10b981', 'Documentary': '#10b981',
  'Animação':            '#f97316', 'Animation': '#f97316',
  'Crime':               '#6366f1', 'Aventura': '#06b6d4', 'Adventure': '#06b6d4',
  'Família':             '#f59e0b', 'Family': '#f59e0b',
  'Mistério':            '#7c3aed', 'Mystery': '#7c3aed',
  'Western':             '#a16207', 'Guerra': '#dc2626', 'War': '#dc2626',
};

/* ── Mini bar used in genre chart ──────────────────────────── */
function GenreBar({ label, pct, color, delay = 0 }: { label: string; pct: number; color: string; delay?: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 120 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt size={12} weight={600} color={T.t2}>{label}</Txt>
        <Txt size={12} weight={700} color={color}>{pct}%</Txt>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: color,
          width: `${width}%`,
          transition: 'width 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: `0 0 8px ${color}55`,
        }} />
      </div>
    </div>
  );
}

/* ── Donut chart (SVG) ──────────────────────────────────────── */
function DonutChart({ moviesCount, tvCount }: { moviesCount: number; tvCount: number }) {
  const total = moviesCount + tvCount || 1;
  const moviePct = moviesCount / total;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const movieDash = circ * moviePct;
  const tvDash = circ * (1 - moviePct);
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(t); }, []);

  return (
    <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
      <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
        {/* track */}
        <circle cx={60} cy={60} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={14} />
        {/* series arc */}
        <circle
          cx={60} cy={60} r={r} fill="none"
          stroke="#a78bfa"
          strokeWidth={14}
          strokeDasharray={`${animated ? tvDash : 0} ${circ}`}
          strokeDashoffset={0}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
        />
        {/* movies arc */}
        <circle
          cx={60} cy={60} r={r} fill="none"
          stroke="#60a5fa"
          strokeWidth={14}
          strokeDasharray={`${animated ? movieDash : 0} ${circ}`}
          strokeDashoffset={`${animated ? -tvDash : 0}`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s, stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s' }}
        />
      </svg>
      {/* Centre label */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={20} weight={800} color={T.t1}>{total}</Txt>
        <Txt size={9}  weight={600} color={T.t3}>títulos</Txt>
      </div>
    </div>
  );
}

/* ── Platform pill ──────────────────────────────────────────── */
const STREAM_COLORS: Record<string, string> = {
  Netflix: '#E50914', Prime: '#00A8E0', 'Disney+': '#113CCF',
  HBO: '#5800A0', Apple: '#555', Globo: '#D62929', Paramount: '#0064FF',
};

/* ── Main page ──────────────────────────────────────────────── */
export default function StatsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [statsLoading, setStatsLoading] = useState(true);
  const [realStats, setRealStats] = useState<{
    totalHours: number;
    totalMinutes: number;
    moviesCount: number;
    tvCount: number;
    genres: Array<{ g: string; pct: number; color: string }>;
    platforms: string[];
    watchedCount: number;
    watchingCount: number;
    wantCount: number;
  } | null>(null);
  const [reviews, setReviews]  = useState(0);
  const [favCount, setFavCount] = useState(0);

  useEffect(() => {
    if (loading) return;

    const watched   = listStore.get('watched');
    const watching  = listStore.get('watching');
    const want      = listStore.get('want');
    const favs      = listStore.get('favorites');

    setReviews(revStore.countAll());
    setFavCount(favs.length);

    const allTracked = [...watched, ...watching];

    if (allTracked.length === 0) {
      setRealStats({
        totalHours: 0, totalMinutes: 0,
        moviesCount: 0, tvCount: 0,
        genres: [], platforms: [],
        watchedCount: 0, watchingCount: watching.length, wantCount: want.length,
      });
      setStatsLoading(false);
      return;
    }

    // Fetch TMDB data for watched + watching (capped at 40)
    const toFetch = allTracked.slice(0, 40);
    const watchedIds = new Set(watched.map((w) => w.id));

    Promise.all(
      toFetch.map(async (item) => {
        try {
          const ep = item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
          const res = await fetch(`/api/tmdb?endpoint=${ep}`);
          return await res.json();
        } catch { return null; }
      })
    ).then((results) => {
      let totalMinutes = 0;
      let moviesCount  = 0;
      let tvCount      = 0;
      const genreCount: Record<string, number> = {};

      results.forEach((d, i) => {
        if (!d) return;
        const item     = toFetch[i];
        const isWatched = watchedIds.has(item.id);
        (d.genres || []).forEach((g: { name: string }) => {
          genreCount[g.name] = (genreCount[g.name] || 0) + 1;
        });
        if (item.type === 'movie') {
          moviesCount++;
          // Only count runtime for fully watched movies
          if (isWatched) totalMinutes += d.runtime || 110;
        } else {
          tvCount++;
          const epRuntime = d.episode_run_time?.[0] || 45;
          if (isWatched) {
            // Finished: count estimated full seasons
            totalMinutes += epRuntime * Math.min(d.number_of_episodes || 10, 24);
          } else {
            // Watching: count episodes aired in current/latest season as estimate
            const lastSeason = (d.seasons || []).filter((s: { season_number: number; episode_count: number }) => s.season_number > 0).at(-1);
            const epsWatched = lastSeason?.episode_count ?? Math.min(d.number_of_episodes || 6, 12);
            totalMinutes += epRuntime * epsWatched;
          }
        }
      });

      const totalGenreCount = Math.max(Object.values(genreCount).reduce((a, b) => a + b, 0), 1);
      const genres = Object.entries(genreCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([name, count]) => ({
          g: name,
          pct: Math.round((count / totalGenreCount) * 100),
          color: GENRE_COLORS[name] || '#6b7280',
        }));

      const userStreams = prefsStore.get()?.streams ?? [];
      const platforms  = userStreams.slice(0, 5);

      setRealStats({
        totalHours: Math.round(totalMinutes / 60),
        totalMinutes,
        moviesCount, tvCount, genres, platforms,
        watchedCount: watched.length, watchingCount: watching.length, wantCount: want.length,
      });
      setStatsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  /* ── Skeleton ─── */
  if (statsLoading) {
    return (
      <Frame>
        <Screen>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '52px 16px 12px', gap: 12, flexShrink: 0 }}>
            <button
              onClick={() => router.back()}
              style={{
                width: 36, height: 36, borderRadius: 18,
                background: 'rgba(255,255,255,0.09)',
                border: '1px solid rgba(255,255,255,0.14)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              } as React.CSSProperties}
            >
              <Icon name="chevronL" size={17} color={T.t1} />
            </button>
            <Txt size={20} weight={800} color={T.t1}>Estatísticas</Txt>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, border: `3px solid ${T.pink}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            <Txt size={13} color={T.t3}>Calculando suas estatísticas...</Txt>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </Screen>
      </Frame>
    );
  }

  const days  = realStats ? Math.round((realStats.totalMinutes || 0) / 1440) : 0;
  const hours = realStats?.totalHours ?? 0;
  const mins  = realStats ? Math.round((realStats.totalMinutes || 0) % 60) : 0;

  return (
    <Frame>
      <Screen style={{ background: T.bg }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '52px 16px 12px', gap: 12, flexShrink: 0,
          borderBottom: `1px solid ${T.border}`,
        }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'rgba(255,255,255,0.09)',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            } as React.CSSProperties}
          >
            <Icon name="chevronL" size={17} color={T.t1} />
          </button>
          <div style={{ flex: 1 }}>
            <Txt size={20} weight={800} color={T.t1}>Estatísticas</Txt>
          </div>
        </div>

        <ScrollArea style={{ padding: '0 0 32px' }}>

          {/* ── Hero: time spent ── */}
          <div style={{
            margin: '16px 16px 0', padding: '20px 20px 22px',
            background: 'linear-gradient(135deg, #1a0d2e 0%, #0d1a2e 100%)',
            borderRadius: 20, overflow: 'hidden', position: 'relative',
          }}>
            {/* Glow */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, background: 'rgba(192,105,255,0.15)', filter: 'blur(30px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, borderRadius: 50, background: 'rgba(96,165,250,0.10)', filter: 'blur(24px)', pointerEvents: 'none' }} />

            <Txt size={11} weight={700} color="rgba(255,255,255,0.40)" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Tempo total assistido
            </Txt>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
              <Txt size={48} weight={900} color={T.white} style={{ lineHeight: 1 }}>{hours}</Txt>
              <Txt size={18} weight={600} color="rgba(255,255,255,0.50)" style={{ paddingBottom: 6 }}>h {mins}min</Txt>
            </div>

            <Txt size={12} color="rgba(255,255,255,0.40)">
              {days > 0
                ? `Equivalente a ${days} dia${days !== 1 ? 's' : ''} completo${days !== 1 ? 's' : ''} · inclui séries em andamento`
                : 'Adicione títulos assistidos para ver seu tempo'}
            </Txt>
          </div>

          {/* ── 4-tile grid: key numbers ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '10px 16px 0' }}>
            {[
              { value: realStats?.watchedCount ?? 0, label: 'Títulos assistidos', color: T.pink,   icon: 'check' as const },
              { value: realStats?.watchingCount ?? 0, label: 'Assistindo agora',   color: '#60a5fa', icon: 'play' as const  },
              { value: reviews,                        label: 'Avaliações',          color: '#F5C518', icon: 'star' as const  },
              { value: favCount,                       label: 'Favoritos',           color: '#FF6B2B', icon: 'heart' as const },
            ].map(({ value, label, color, icon }) => (
              <div key={label} style={{ padding: '16px', background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <Icon name={icon} size={15} color={color} />
                </div>
                <Txt size={26} weight={900} color={T.t1} style={{ display: 'block', lineHeight: 1, marginBottom: 2 }}>{value}</Txt>
                <Txt size={11} weight={500} color={T.t3}>{label}</Txt>
              </div>
            ))}
          </div>

          {/* ── Filmes vs Séries donut ── */}
          <div style={{ margin: '16px 16px 0', padding: 20, background: T.card, borderRadius: 20, border: `1px solid ${T.border}` }}>
            <Txt size={14} weight={800} color={T.t1} style={{ display: 'block', marginBottom: 16 }}>Filmes vs Séries</Txt>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <DonutChart moviesCount={realStats?.moviesCount ?? 0} tvCount={realStats?.tvCount ?? 0} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Filmes */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: '#60a5fa', flexShrink: 0 }} />
                    <Txt size={12} weight={600} color={T.t2}>Filmes</Txt>
                    <Txt size={12} weight={700} color="#60a5fa" style={{ marginLeft: 'auto' }}>
                      {realStats?.moviesCount ?? 0}
                    </Txt>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <AnimatedBar pct={realStats && (realStats.moviesCount + realStats.tvCount) > 0 ? Math.round((realStats.moviesCount / (realStats.moviesCount + realStats.tvCount)) * 100) : 0} color="#60a5fa" delay={0} />
                  </div>
                </div>
                {/* Séries */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: '#a78bfa', flexShrink: 0 }} />
                    <Txt size={12} weight={600} color={T.t2}>Séries</Txt>
                    <Txt size={12} weight={700} color="#a78bfa" style={{ marginLeft: 'auto' }}>
                      {realStats?.tvCount ?? 0}
                    </Txt>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <AnimatedBar pct={realStats && (realStats.moviesCount + realStats.tvCount) > 0 ? Math.round((realStats.tvCount / (realStats.moviesCount + realStats.tvCount)) * 100) : 0} color="#a78bfa" delay={80} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Gêneros favoritos ── */}
          {(realStats?.genres ?? []).length > 0 && (
            <div style={{ margin: '16px 16px 0', padding: 20, background: T.card, borderRadius: 20, border: `1px solid ${T.border}` }}>
              <Txt size={14} weight={800} color={T.t1} style={{ display: 'block', marginBottom: 16 }}>Gêneros favoritos</Txt>
              {(realStats?.genres ?? []).map(({ g, pct, color }, i) => (
                <GenreBar key={g} label={g} pct={pct} color={color} delay={i * 80} />
              ))}
            </div>
          )}

          {/* ── Plataformas ── */}
          {(realStats?.platforms ?? []).length > 0 && (
            <div style={{ margin: '16px 16px 0', padding: 20, background: T.card, borderRadius: 20, border: `1px solid ${T.border}` }}>
              <Txt size={14} weight={800} color={T.t1} style={{ display: 'block', marginBottom: 14 }}>Plataformas</Txt>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(realStats?.platforms ?? []).map((s) => (
                  <div key={s} style={{
                    padding: '8px 16px', borderRadius: 20,
                    background: STREAM_COLORS[s] ? `${STREAM_COLORS[s]}22` : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${STREAM_COLORS[s] ? `${STREAM_COLORS[s]}44` : T.border}`,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: STREAM_COLORS[s] || T.t3 }} />
                    <Txt size={13} weight={600} color={T.t1}>{s}</Txt>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Lista: quero ver ── */}
          <div style={{ margin: '16px 16px 0', padding: 20, background: T.card, borderRadius: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(245,197,24,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="star" size={14} color={T.gold} />
                </div>
                <div>
                  <Txt size={14} weight={700} color={T.t1} style={{ display: 'block' }}>Quero ver</Txt>
                  <Txt size={11} color={T.t3}>Na fila</Txt>
                </div>
              </div>
              <Txt size={28} weight={900} color={T.gold}>{realStats?.wantCount ?? 0}</Txt>
            </div>

            {/* Mini progress bar: watched vs want */}
            {((realStats?.watchedCount ?? 0) + (realStats?.wantCount ?? 0)) > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <Txt size={10} weight={600} color={T.t3}>Assistidos</Txt>
                  <Txt size={10} weight={600} color={T.t3}>Na fila</Txt>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', display: 'flex' }}>
                  <AnimatedBar
                    pct={Math.round(((realStats?.watchedCount ?? 0) / ((realStats?.watchedCount ?? 0) + (realStats?.wantCount ?? 0))) * 100)}
                    color={T.pink} delay={200}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Empty state if no data ── */}
          {(realStats?.watchedCount ?? 0) === 0 && (
            <div style={{ margin: '24px 16px 0', padding: '32px 20px', background: T.card, borderRadius: 20, border: `1px solid ${T.border}`, textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: 'rgba(192,105,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Icon name="play" size={24} color={T.pink} />
              </div>
              <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', marginBottom: 6 }}>Nenhum título assistido</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block' }}>
                Marque títulos como assistidos e suas estatísticas aparecerão aqui.
              </Txt>
            </div>
          )}

          <div style={{ height: 32 }} />
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

/* ── Thin animated bar (inline, re-usable) ──────────────────── */
function AnimatedBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 150 + delay); return () => clearTimeout(t); }, [pct, delay]);
  return (
    <div style={{
      height: '100%', borderRadius: 3,
      background: color,
      width: `${w}%`,
      transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
    }} />
  );
}

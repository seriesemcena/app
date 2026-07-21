'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import '@/lib/i18n';
import { navigateBack } from '@/lib/navigation';

/* ── TVMaze ── */
type TVMazeShow = {
  id: number; name: string;
  image?: { medium: string; original: string } | null;
  webChannel?: { name: string } | null;
  externals?: { imdb?: string | null; thetvdb?: number | null };
  tvmazeAirdate?: string;
};
type TVMazeEp = { _embedded?: { show: TVMazeShow }; airdate: string };

type EnrichedShow = TVMazeShow & {
  tmdbId?: number;
  tmdbTitle?: string;
  tmdbPoster?: string | null;
  tmdbBackdrop?: string | null;
  tmdbOverview?: string;
  tmdbRating?: number;
  tmdbDate?: string;
  tmdbType?: 'tv' | 'movie';
};

async function enrichWithTMDB(show: TVMazeShow): Promise<EnrichedShow> {
  const imdb = show.externals?.imdb;
  if (!imdb) return show;
  try {
    const url = new URL('/api/tmdb', window.location.origin);
    url.searchParams.set('endpoint', `/find/${imdb}`);
    url.searchParams.set('external_source', 'imdb_id');
    url.searchParams.set('language', i18next.language || 'pt-BR');
    const res = await fetch(url.toString());
    const data = await res.json();
    const tv = data.tv_results?.[0];
    const mv = data.movie_results?.[0];
    const hit = tv || mv;
    if (!hit) return show;
    return {
      ...show,
      tmdbId: hit.id,
      tmdbTitle: hit.name || hit.title,
      tmdbPoster: hit.poster_path,
      tmdbBackdrop: hit.backdrop_path,
      tmdbOverview: hit.overview,
      tmdbRating: hit.vote_average,
      tmdbDate: hit.first_air_date || hit.release_date,
      tmdbType: tv ? 'tv' : 'movie',
    };
  } catch { return show; }
}

const NOISE_BG = `url("data:image/svg+xml,%3Csvg xmlns%3D'http://www.w3.org/2000/svg'%3E%3Cfilter id%3D'n'%3E%3CfeTurbulence type%3D'fractalNoise' baseFrequency%3D'.75' numOctaves%3D'4'/%3E%3C/filter%3E%3Crect width%3D'100%25' height%3D'100%25' filter%3D'url(%23n)'/%3E%3C/svg%3E")`;

const PLATFORM_CHANNEL: Record<string, string[]> = {
  '8':    ['Netflix'],
  '337':  ['Disney+', 'Disney Plus'],
  '1899': ['HBO Max', 'Max'],
  '119':  ['Prime Video', 'Amazon Prime Video'],
  '307':  ['Globoplay'],
  '531':  ['Paramount+', 'Paramount Plus'],
};

async function fetchTVMazeDay(date: string): Promise<TVMazeEp[]> {
  try {
    const res = await fetch(`https://api.tvmaze.com/schedule/web?date=${date}`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

function getWeekDates(): string[] {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/* ── Estreias — helpers ── */
function formatDateLocale(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(i18next.language || 'pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(date).toUpperCase();
}

type EstreiaCardData = {
  id: number;
  title: string;
  backdropUrl: string | null;
  dateLabel: string | null;
  rating: string | null;
  overview: string | null;
  platform: string;
  mediaType: string;
};

const ESTREIA_STYLES = `
  .estreia-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 12px 16px 0;
  }
  @media (min-width: 640px) {
    .estreia-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 1024px) {
    .estreia-grid { grid-template-columns: repeat(3, 1fr); gap: 24px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .estreia-card, .estreia-card img { transition: none !important; transform: none !important; }
  }
`;

/* ── Estreia Card ── */
function EstreiaCard({ data, onOpen, onList }: {
  data: EstreiaCardData;
  onOpen: () => void;
  onList: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { title, backdropUrl, dateLabel, rating, overview, platform, mediaType: type } = data;

  // Always dark — card design is dark regardless of app theme
  const cardBg      = 'linear-gradient(160deg, #111114 0%, #0a0a0c 100%)';
  const cardBorder  = `1px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`;
  const cardShadow  = hovered
    ? '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)'
    : '0 2px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)';
  const overviewColor    = 'rgba(255,255,255,0.65)';
  const btnPrimaryBg     = 'rgba(255,255,255,0.11)';
  const btnPrimaryBorder = '1px solid rgba(255,255,255,0.2)';
  const btnPrimaryColor  = '#fff';
  const btnSecBorder     = '1px solid rgba(255,255,255,0.1)';
  const btnSecColor      = 'rgba(255,255,255,0.6)';
  const badgeBg          = 'rgba(0,0,0,0.65)';
  const badgeBorder      = '1px solid rgba(255,255,255,0.12)';
  const badgeTextColor   = 'rgba(255,255,255,0.88)';
  const noImgBg          = '#1a1a1e';
  const noImgIcon        = 'rgba(255,255,255,0.15)';

  return (
    <div
      className="estreia-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 22,
        overflow: 'hidden',
        background: cardBg,
        border: cardBorder,
        boxShadow: cardShadow,
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
        display: 'flex', flexDirection: 'column',
      }}>

      {/* Image */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}>
        {backdropUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backdropUrl}
            alt={title}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              transform: hovered ? 'scale(1.04)' : 'scale(1)',
              transition: 'transform 0.45s ease',
            }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: noImgBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="tv" size={36} color={noImgIcon} />
          </div>
        )}
        {/* Bottom gradient — always dark so image fades into the dark card bg */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(to top, rgba(10,10,12,0.95) 0%, transparent 100%)', pointerEvents: 'none' }} />
        {/* Side vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.3) 100%)', pointerEvents: 'none' }} />

        {/* Date badge — top left */}
        {dateLabel && (
          <div style={{
            position: 'absolute', top: 10, left: 10,
            display: 'inline-flex', alignItems: 'center',
            padding: '5px 9px', borderRadius: 8,
            background: badgeBg,
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            border: badgeBorder,
          } as React.CSSProperties}>
            <Txt size={10} weight={700} color={badgeTextColor} style={{ letterSpacing: '0.5px' }}>
              {i18next.t('streamingPage.releaseLabel', { ns: 'home', date: dateLabel })}
            </Txt>
          </div>
        )}

        {/* Rating badge — top right */}
        {rating && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 9px', borderRadius: 8,
            background: badgeBg,
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            border: badgeBorder,
          } as React.CSSProperties}>
            <span style={{ color: '#FFD700', fontSize: 11, lineHeight: 1 }}>★</span>
            <Txt size={11} weight={700} color={badgeTextColor}>{rating}</Txt>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Txt size={16} weight={800} color="rgba(255,255,255,0.95)" style={{ display: 'block', lineHeight: 1.3 }}>{title}</Txt>
        <Txt size={12} color="rgba(255,255,255,0.45)" style={{ display: 'block' }}>{platform} · {type}</Txt>
        {overview && (
          <div style={{ marginTop: 4 }}>
            <Txt size={13} color={overviewColor} style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.55,
            } as React.CSSProperties}>
              {overview}
            </Txt>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
          <button onClick={onOpen} style={{
            flex: 1, padding: '9px 0', borderRadius: 12, cursor: 'pointer',
            background: btnPrimaryBg, border: btnPrimaryBorder,
            color: btnPrimaryColor, fontSize: 13, fontWeight: 700,
            fontFamily: "'Area','Inter',sans-serif",
          }}>
            {i18next.t('streamingPage.viewDetails', { ns: 'home' })}
          </button>
          <button onClick={onList} style={{
            flex: 1, padding: '9px 0', borderRadius: 12, cursor: 'pointer',
            background: 'transparent', border: btnSecBorder,
            color: btnSecColor, fontSize: 13, fontWeight: 600,
            fontFamily: "'Area','Inter',sans-serif",
          }}>
            {i18next.t('streamingPage.addToList', { ns: 'home' })}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Estreia Grid ── */
function EstreiaGrid({ shows, loading, onItem }: {
  shows: EnrichedShow[]; loading: boolean;
  onItem: (show: EnrichedShow) => void;
}) {
  if (loading) return (
    <>
      <style>{ESTREIA_STYLES}</style>
      <div className="estreia-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ borderRadius: 22, background: T.card, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            <div style={{ aspectRatio: '16/9', background: T.surface2 }} />
            <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 18, background: T.surface2, borderRadius: 6, width: '70%' }} />
              <div style={{ height: 13, background: T.surface2, borderRadius: 6, width: '40%' }} />
              <div style={{ height: 58, background: T.surface2, borderRadius: 8, marginTop: 4 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, height: 38, background: T.surface2, borderRadius: 12 }} />
                <div style={{ flex: 1, height: 38, background: T.surface2, borderRadius: 12 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
  if (shows.length === 0) return (
    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
      <Txt size={13} color={T.t4}>{i18next.t('streamingPage.noTvReleases', { ns: 'home' })}</Txt>
    </div>
  );
  return (
    <>
      <style>{ESTREIA_STYLES}</style>
      <div className="estreia-grid">
        {shows.map(show => {
          const dateRaw = show.tvmazeAirdate || show.tmdbDate;
          return (
          <EstreiaCard
            key={show.id}
            data={{
              id: show.id,
              title: show.tmdbTitle || show.name,
              backdropUrl: show.tmdbBackdrop ? tmdbImg(show.tmdbBackdrop, 'w780') : (show.image?.original?.replace('http:', 'https:') ?? null),
              dateLabel: dateRaw ? formatDateLocale(dateRaw) : null,
              rating: show.tmdbRating && show.tmdbRating > 0 ? show.tmdbRating.toFixed(1) : null,
              overview: show.tmdbOverview ?? null,
              platform: show.webChannel?.name ?? 'Streaming',
              mediaType: show.tmdbType === 'movie' ? i18next.t('streamingPage.movieType', { ns: 'home' }) : i18next.t('streamingPage.seriesType', { ns: 'home' }),
            }}
            onOpen={() => onItem(show)}
            onList={() => onItem(show)}
          />
          );
        })}
      </div>
    </>
  );
}

/* ── Estreia Grid — Filmes (TMDB) ── */
function MovieEstreiaGrid({ items, loading, onItem, platformName }: {
  items: TMDBItem[]; loading: boolean;
  onItem: (i: TMDBItem) => void;
  platformName: string;
}) {
  if (loading) return (
    <>
      <style>{ESTREIA_STYLES}</style>
      <div className="estreia-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ borderRadius: 22, background: T.card, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            <div style={{ aspectRatio: '16/9', background: T.surface2 }} />
            <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 18, background: T.surface2, borderRadius: 6, width: '70%' }} />
              <div style={{ height: 13, background: T.surface2, borderRadius: 6, width: '40%' }} />
              <div style={{ height: 58, background: T.surface2, borderRadius: 8, marginTop: 4 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, height: 38, background: T.surface2, borderRadius: 12 }} />
                <div style={{ flex: 1, height: 38, background: T.surface2, borderRadius: 12 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
  if (items.length === 0) return (
    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
      <Txt size={13} color={T.t4}>{i18next.t('streamingPage.noMovieReleases', { ns: 'home' })}</Txt>
    </div>
  );
  return (
    <>
      <style>{ESTREIA_STYLES}</style>
      <div className="estreia-grid">
        {items.map(item => {
          const dateRaw = item.release_date || item.first_air_date;
          return (
            <EstreiaCard
              key={item.id}
              data={{
                id: item.id,
                title: item.title || item.name || '',
                backdropUrl: item.backdrop_path ? tmdbImg(item.backdrop_path, 'w780') : (item.poster_path ? tmdbImg(item.poster_path, 'w342') : null),
                dateLabel: dateRaw ? formatDateLocale(dateRaw) : null,
                rating: item.vote_average && item.vote_average > 0 ? item.vote_average.toFixed(1) : null,
                overview: item.overview ?? null,
                platform: platformName,
                mediaType: i18next.t('streamingPage.movieType', { ns: 'home' }),
              }}
              onOpen={() => onItem(item)}
              onList={() => onItem(item)}
            />
          );
        })}
      </div>
    </>
  );
}

const PLATFORMS: Record<string, { name: string; color: string; logo: string }> = {
  '8':    { name: 'Netflix',     color: '#E50914', logo: 'netflix'       },
  '337':  { name: 'Disney+',     color: '#113CCF', logo: 'dineyplus'     },
  '1899': { name: 'HBO Max',     color: '#002BE7', logo: 'hbomax'        },
  '119':  { name: 'Prime Video', color: '#00A8E0', logo: 'primevideo'    },
  '307':  { name: 'Globoplay',   color: '#E8441C', logo: 'globoplay'     },
  '531':  { name: 'Paramount+',  color: '#0064FF', logo: 'paramountplus' },
  '350':  { name: 'Apple TV+',   color: '#000000', logo: 'appletv'       },
  '34':   { name: 'MGM+',        color: '#1A1A2E', logo: 'mgm'           },
};

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7; // 1=Mon … 7=Sun
  const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  // Estende 7 dias para trás para capturar lançamentos com lag de provider no TMDB
  const startExtended = new Date(monday); startExtended.setDate(monday.getDate() - 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(startExtended), end: fmt(sunday) };
}

/* ── Tab pills com glass effect ── */
function GlassTabs<T extends string>({ options, value, onChange, color }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  color: string;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const inactiveBg     = isDark ? 'rgba(255,255,255,0.06)' : '#fff';
  const inactiveBorder = isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.11)';
  const inactiveColor  = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  const activeBg       = T.pillActiveBg;
  const activeBorder   = `1px solid ${T.pillActiveBorder}`;

  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px' }}>
      {options.map(({ id, label }) => {
        const active = value === id;
        return (
          <button key={id} onClick={() => onChange(id)} style={{
            padding: '7px 18px', borderRadius: 24, cursor: 'pointer',
            background: active ? activeBg : inactiveBg,
            border: active ? activeBorder : inactiveBorder,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            color: active ? T.pillActiveText : inactiveColor,
            fontSize: 13, fontWeight: active ? 700 : 500,
            fontFamily: "'Area','Inter',sans-serif",
            transition: 'all 0.2s',
          } as React.CSSProperties}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Grid numerado para "Em alta" — estilo "Minha lista" desktop ── */
function RankedGrid({ items, loading, onItem }: {
  items: TMDBItem[]; loading?: boolean; onItem: (i: TMDBItem) => void;
}) {
  // Always dark — ranked cards are dark regardless of app theme
  const cardBg = '#0a0a0a';

  const list = items.slice(0, 10);
  if (loading) return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none', padding: '12px 16px 4px', scrollSnapType: 'x mandatory', scrollPaddingLeft: 16 } as React.CSSProperties}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ flexShrink: 0, width: 290, borderRadius: 18, background: cardBg, border: `1px solid ${T.border}`, overflow: 'hidden', scrollSnapAlign: 'start' }}>
          <div style={{ width: '100%', aspectRatio: '3/2', background: T.surface2 }} />
          <div style={{ padding: '10px 12px 12px', height: 38 }} />
        </div>
      ))}
    </div>
  );
  if (list.length === 0) return (
    <div style={{ padding: '12px 16px' }}>
      <Txt size={13} color={T.t4}>{i18next.t('streamingPage.noTitles', { ns: 'home' })}</Txt>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none', padding: '12px 16px 4px', scrollSnapType: 'x mandatory', scrollPaddingLeft: 16 } as React.CSSProperties}>
      {list.map((item, idx) => {
        const n = normalize(item);
        const thumb = n.backdrop_path
          ? tmdbImg(n.backdrop_path, 'w780')
          : n.poster_path ? tmdbImg(n.poster_path, 'w342') : null;
        return (
          <button key={item.id} onClick={() => onItem(item)}
            style={{ flexShrink: 0, width: 290, background: cardBg, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, cursor: 'pointer', textAlign: 'left', padding: 0, overflow: 'hidden', scrollSnapAlign: 'start' }}>
            {/* Imagem landscape */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '3/2', background: T.surface2, overflow: 'hidden' }}>
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt={n.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
              {/* Gradiente inferior para o número */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)', pointerEvents: 'none' }} />
              {/* Número estilo grande */}
              <div style={{ position: 'absolute', bottom: -6, left: 6, lineHeight: 1 }}>
                <span style={{
                  fontSize: 52, fontWeight: 900, color: 'rgba(255,255,255,0.95)',
                  fontFamily: "'Greed','Area',sans-serif",
                  WebkitTextStroke: '1.5px rgba(0,0,0,0.5)',
                  textShadow: '0 2px 12px rgba(0,0,0,0.7)',
                  letterSpacing: '-2px',
                } as React.CSSProperties}>
                  {idx + 1}
                </span>
              </div>
            </div>
            {/* Título */}
            <div style={{ padding: '10px 12px 12px', background: cardBg }}>
              <Txt size={13} weight={700} color="rgba(255,255,255,0.95)" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</Txt>
            </div>
          </button>
        );
      })}
      <div style={{ flexShrink: 0, width: 16 }} />
    </div>
  );
}

/* ──────────────────────────────────────────────── */
export default function StreamingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = use(params);
  const router   = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { t } = useTranslation('home');
  const platform = PLATFORMS[id] ?? { name: 'Streaming', color: '#555' };
  const { start, end } = getWeekRange();

  /* ── Banner liquid glass tokens ── */
  const bannerBg     = isDark ? 'rgba(8, 8, 10, 0.82)' : 'rgba(250, 250, 252, 0.88)';
  const bannerBorder = isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)';
  const bannerShadow = isDark
    ? '0 56px 112px rgba(0,0,0,0.65), 0 20px 48px rgba(0,0,0,0.48), 0 6px 16px rgba(0,0,0,0.32), inset 0 1.5px 0 rgba(255,255,255,0.27), inset 0 -1px 0 rgba(0,0,0,0.45), inset 1px 0 0 rgba(255,255,255,0.07), inset -1px 0 0 rgba(255,255,255,0.04)'
    : '0 8px 40px rgba(0,0,0,0.10), 0 2px 12px rgba(0,0,0,0.07), inset 0 1.5px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.06), inset 1px 0 0 rgba(255,255,255,0.60), inset -1px 0 0 rgba(255,255,255,0.30)';
  const bannerSpecular = isDark
    ? 'radial-gradient(ellipse 90% 48% at 50% -10%, rgba(255,255,255,0.13) 0%, transparent 52%), radial-gradient(ellipse 52% 30% at 90% -4%, rgba(255,255,255,0.08) 0%, transparent 48%), radial-gradient(ellipse 68% 48% at 50% 110%, rgba(255,255,255,0.025) 0%, transparent 62%)'
    : 'radial-gradient(ellipse 90% 48% at 50% -10%, rgba(255,255,255,0.70) 0%, transparent 52%), radial-gradient(ellipse 52% 30% at 90% -4%, rgba(255,255,255,0.50) 0%, transparent 48%), radial-gradient(ellipse 68% 48% at 50% 110%, rgba(0,0,0,0.02) 0%, transparent 62%)';
  const bannerIconBg     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const bannerIconBorder = isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.10)';
  const bannerIconShadow = isDark ? '0 4px 16px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.14)' : '0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.90)';
  const bannerTitle   = isDark ? '#fff' : 'rgba(0,0,0,0.88)';
  const bannerSub     = isDark ? 'rgba(255,255,255,0.33)' : 'rgba(0,0,0,0.40)';
  const accentBar     = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
  const tabColor      = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.80)';
  const btnIconBg     = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)';
  const btnIconBorder = isDark ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.12)';
  const btnIconColor  = isDark ? '#fff' : T.t1;

  const [trendTab, setTrendTab] = useState<'series' | 'filmes'>('series');
  const [newTab,   setNewTab]   = useState<'series' | 'filmes'>('series');
  const [showNavTitle, setShowNavTitle] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  /* Nav title observer */
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setShowNavTitle(!e.isIntersecting),
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* ── Em alta ── */
  const { data: trendTV,    loading: lTV  } = useTMDB(() =>
    tmdb.discover('tv',    { with_watch_providers: id, watch_region: 'BR', sort_by: 'popularity.desc' }), [id]);
  const { data: trendMovie, loading: lMov } = useTMDB(() =>
    tmdb.discover('movie', { with_watch_providers: id, watch_region: 'BR', sort_by: 'popularity.desc' }), [id]);

  /* ── Estreias da semana: TVMaze para séries, TMDB para filmes ── */
  const [tvmazeShows, setTvmazeShows] = useState<EnrichedShow[]>([]);
  const [loadingTVMaze, setLoadingTVMaze] = useState(true);

  useEffect(() => {
    const channelNames = PLATFORM_CHANNEL[id] ?? [];
    setLoadingTVMaze(true);
    setTvmazeShows([]);
    Promise.all(getWeekDates().map(fetchTVMazeDay))
      .then(async results => {
        const allEps = results.flat() as TVMazeEp[];
        const filtered = allEps.filter(ep => {
          const ch = ep._embedded?.show?.webChannel?.name ?? '';
          return channelNames.some(n => ch.toLowerCase().includes(n.toLowerCase()));
        });
        const seen = new Set<number>();
        const raw: TVMazeShow[] = [];
        for (const ep of filtered) {
          const show = ep._embedded?.show;
          if (show && !seen.has(show.id)) { seen.add(show.id); raw.push({ ...show, tvmazeAirdate: ep.airdate }); }
        }
        // Enriquecer com dados pt-BR do TMDB em paralelo
        // Mantém só os que o TMDB localizou → proxy de "disponível no Brasil"
        const enriched = await Promise.all(raw.map(enrichWithTMDB));
        setTvmazeShows(enriched.filter(s => s.tmdbId != null));
        setLoadingTVMaze(false);
      })
      .catch(() => setLoadingTVMaze(false));
  }, [id]);

  /* Filmes: TMDB com provider + semana atual */
  const { data: newMovie, loading: lNMov } = useTMDB(() =>
    tmdb.discover('movie', {
      with_watch_providers: id, watch_region: 'BR',
      'primary_release_date.gte': start, 'primary_release_date.lte': end,
      sort_by: 'primary_release_date.desc',
    }), [start, end, id]);

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  };

  const openTVMazeShow = useCallback((show: EnrichedShow) => {
    if (show.tmdbId && show.tmdbType) {
      router.push(`/title/${show.tmdbType}/${show.tmdbId}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(show.name)}`);
    }
  }, [router]);

  const trendItems = trendTab === 'series'
    ? (trendTV?.results    || []).slice(0, 10)
    : (trendMovie?.results || []).slice(0, 10);
  const newMovieItems = (newMovie?.results || []).slice(0, 20);

  const TAB_OPTIONS = [
    { id: 'series' as const, label: t('streamingPage.seriesTab') },
    { id: 'filmes' as const, label: t('streamingPage.moviesTab') },
  ];

  return (
    <Frame>
      <Screen>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>

          {/* ── Header com logo + seta + sino ── */}
          <GlassHeader
            navTitle={platform.name}
            showNavTitle={showNavTitle}
            left={
              <button onClick={() => navigateBack(router)} style={{ width: 34, height: 34, borderRadius: 17, background: btnIconBg, border: btnIconBorder, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' } as React.CSSProperties}>
                <Icon name="chevronL" size={16} color={btnIconColor} />
              </button>
            }
            right={
              <button onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: btnIconBg, border: btnIconBorder, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' } as React.CSSProperties}>
                <Icon name="bell" size={16} color={btnIconColor} />
              </button>
            }
          />

          {/* ── Banner: Liquid Glass ── */}
          <div style={{
            margin: '8px 16px 24px',
            borderRadius: 44,
            position: 'relative',
            overflow: 'hidden',
            background: bannerBg,
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: bannerBorder,
            boxShadow: bannerShadow,
          }}>
            {/* Reflexos especulares */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: bannerSpecular,
            }} />
            {/* Textura */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              opacity: 0.045,
              mixBlendMode: 'overlay',
              backgroundImage: NOISE_BG,
              backgroundSize: '180px 180px',
            } as React.CSSProperties} />
            {/* Conteúdo */}
            <div style={{ position: 'relative', zIndex: 1, padding: '22px 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, textAlign: 'center' }}>
                <div style={{ width: 62, height: 62, borderRadius: 17, background: bannerIconBg, border: bannerIconBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: bannerIconShadow }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={isDark ? `/${platform.logo}_logo.png` : `/${platform.logo}_logo_black.png`}
                    alt={platform.name}
                    style={{ height: 32, width: 'auto', maxWidth: 46, objectFit: 'contain' }}
                  />
                </div>
                <div>
                  <h1 ref={titleRef} style={{ margin: 0, fontSize: 26, fontWeight: 900, color: bannerTitle, lineHeight: 1.1, fontFamily: "'Greed','Area',sans-serif", letterSpacing: '-0.3px' }}>
                    {platform.name}
                  </h1>
                  <Txt size={12} color={bannerSub} style={{ display: 'block', marginTop: 6 }}>{t('streamingPage.tagline')}</Txt>
                </div>
              </div>
            </div>
          </div>

          {/* ══ Em alta esta semana ══ */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ padding: '0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 20, borderRadius: 2, background: accentBar, flexShrink: 0 }} />
              <Txt size={20} weight={900} style={{ fontStretch: 'condensed', lineHeight: 1 } as React.CSSProperties}>
                {t('streamingPage.trending')}
              </Txt>
            </div>
            {/* Tabs glass abaixo do título */}
            <GlassTabs options={TAB_OPTIONS} value={trendTab} onChange={setTrendTab} color={tabColor} />
            <RankedGrid
              items={trendItems}
              loading={trendTab === 'series' ? lTV : lMov}
              onItem={openTitle}
            />
          </div>

          {/* ══ Estreias da semana ══ */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ padding: '0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 20, borderRadius: 2, background: accentBar, flexShrink: 0 }} />
              <Txt size={20} weight={900} style={{ fontStretch: 'condensed', lineHeight: 1 } as React.CSSProperties}>
                {t('streamingPage.newReleases')}
              </Txt>
            </div>
            <GlassTabs options={TAB_OPTIONS} value={newTab} onChange={setNewTab} color={tabColor} />
            <div style={{ marginTop: 12 }}>
              {newTab === 'series' ? (
                <EstreiaGrid shows={tvmazeShows} loading={loadingTVMaze} onItem={openTVMazeShow} />
              ) : (
              <MovieEstreiaGrid
                items={newMovieItems}
                loading={lNMov}
                onItem={openTitle}
                platformName={platform.name}
              />
              )}
            </div>
          </div>

          <div style={{ height: 32 }} />
        </div>
      </Screen>
    </Frame>
  );
}

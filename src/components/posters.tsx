'use client';
import React, { CSSProperties, ReactNode, useState, useEffect } from 'react';
import { T } from '@/lib/tokens';
import { Icon } from './Icon';
import { Txt, Skeleton } from './primitives';
import { tmdbImg, normalize, type TMDBItem } from '@/lib/tmdb';

const POSTER_GRADIENTS = [
  'linear-gradient(160deg,#c8b8a0,#a09080)',
  'linear-gradient(160deg,#8090a8,#607090)',
  'linear-gradient(160deg,#a8c0a0,#709070)',
  'linear-gradient(160deg,#b0a0c8,#8070a0)',
  'linear-gradient(160deg,#c0b0a0,#907860)',
  'linear-gradient(160deg,#a0b0c0,#708090)',
];

const HERO_GRADIENTS = [
  'linear-gradient(160deg,#e8ddd0 0%,#c8b8a8 40%,#a89888 100%)',
  'linear-gradient(160deg,#d8e0e8 0%,#b8c8d8 40%,#9090a8 100%)',
  'linear-gradient(160deg,#e0dcd0 0%,#c0b8a0 40%,#a09880 100%)',
  'linear-gradient(160deg,#dce8dc 0%,#b8d0b8 40%,#90a890 100%)',
  'linear-gradient(160deg,#e8dce0 0%,#c8b0b8 40%,#a89098 100%)',
];

const hashStr = (s: string) => Math.abs((s || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0));

export const PosterPlaceholder = ({ width, height, label = '' }: { width: number; height: number; label?: string }) => {
  const g = POSTER_GRADIENTS[hashStr(label) % POSTER_GRADIENTS.length];
  return (
    <div style={{ width, height, background: g, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      <div style={{ textAlign: 'center', padding: 8, opacity: 0.4 }}>
        <Icon name="film" size={width > 80 ? 28 : 18} color="rgba(0,0,0,0.4)" />
        {width > 80 && <div style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', marginTop: 4, lineHeight: 1.3, fontFamily: "'Area','Inter',sans-serif" }}>{label}</div>}
      </div>
    </div>
  );
};

export const HeroPoster = ({ title = '', width, height }: { title?: string; width: number; height: number }) => {
  const grad = HERO_GRADIENTS[hashStr(title) % HERO_GRADIENTS.length];
  return (
    <div style={{ width, height, background: grad, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', bottom: 0, left: '15%', width: '35%', height: '85%', background: 'linear-gradient(to top,rgba(0,0,0,0.3),transparent)', borderRadius: '50% 50% 0 0 / 30% 30% 0 0', opacity: 0.6 }} />
      <div style={{ position: 'absolute', bottom: 0, left: '40%', width: '40%', height: '95%', background: 'linear-gradient(to top,rgba(0,0,0,0.25),transparent)', borderRadius: '50% 50% 0 0 / 30% 30% 0 0', opacity: 0.7 }} />
      <div style={{ position: 'absolute', bottom: 0, right: '8%', width: '28%', height: '75%', background: 'linear-gradient(to top,rgba(0,0,0,0.2),transparent)', borderRadius: '50% 50% 0 0 / 30% 30% 0 0', opacity: 0.5 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: `linear-gradient(to bottom, transparent, ${T.bg})` }} />
    </div>
  );
};

export const ImgWithSkeleton = ({
  src, alt = '', width, height, radius = 0, objectPosition = 'center',
  style,
}: {
  src: string | null | undefined;
  alt?: string;
  width: number | string;
  height: number | string;
  radius?: number;
  objectPosition?: string;
  style?: React.CSSProperties;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr]       = useState(false);

  if (!src || err) {
    return <div className="img-skeleton" style={{ width, height, borderRadius: radius, flexShrink: 0, ...style }} />;
  }
  return (
    <div style={{ width, height, borderRadius: radius, overflow: 'hidden', position: 'relative', flexShrink: 0, ...style }}>
      {!loaded && <div className="img-skeleton" style={{ position: 'absolute', inset: 0 }} />}
      <img
        src={src} alt={alt}
        onLoad={() => setLoaded(true)} onError={() => { setErr(true); }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition, display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity 0.35s' }}
      />
    </div>
  );
};

export const TMDBPoster = ({ path, width, height, title = '' }: { path?: string | null; width: number; height: number; title?: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const src = path ? tmdbImg(path, 'w342') : null;
  if (!src || err) return <PosterPlaceholder width={width} height={height} label={title} />;
  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', background: T.surface }}>
      {!loaded && <div style={{ position: 'absolute', inset: 0 }}><PosterPlaceholder width={width} height={height} label={title} /></div>}
      <img src={src} alt={title} onLoad={() => setLoaded(true)} onError={() => setErr(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.4s' }} />
    </div>
  );
};

export const TMDBBackdrop = ({ path, width, height, title = '' }: { path?: string | null; width: number; height: number; title?: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const src = path ? tmdbImg(path, 'w780') : null;
  if (!src || err) return <HeroPoster title={title} width={width} height={height} />;
  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', background: T.surface }}>
      {!loaded && <div style={{ position: 'absolute', inset: 0 }}><HeroPoster title={title} width={width} height={height} /></div>}
      <img src={src} alt={title} onLoad={() => setLoaded(true)} onError={() => setErr(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.4s' }} />
    </div>
  );
};

export const ActorCircle = ({ name = '', size = 76 }: { name?: string; size?: number }) => {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  const grads = [
    'linear-gradient(135deg,#3a2030,#5a1030)',
    'linear-gradient(135deg,#1e2a3a,#0d2050)',
    'linear-gradient(135deg,#2a2a1a,#3a2a0a)',
    'linear-gradient(135deg,#1a2a2a,#0a3030)',
    'linear-gradient(135deg,#2a1a3a,#3a0a50)',
    'linear-gradient(135deg,#2a1a1a,#3a1a10)',
  ];
  const grad = grads[hashStr(name) % grads.length];
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${T.t4}` }}>
      <Txt size={size * 0.28} weight={700} color={T.t3}>{initials}</Txt>
    </div>
  );
};

export const TMDBPersonPhoto = ({ path, size = 76, name = '' }: { path?: string | null; size?: number; name?: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const src = path ? tmdbImg(path, 'w185') : null;
  if (!src || err) return <ActorCircle name={name} size={size} />;
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexShrink: 0, border: `2px solid ${T.t4}`, background: T.surface }}>
      {!loaded && <ActorCircle name={name} size={size} />}
      <img src={src} alt={name} onLoad={() => setLoaded(true)} onError={() => setErr(true)}
        style={{ width: size, height: size, objectFit: 'cover', display: loaded ? 'block' : 'none' }} />
    </div>
  );
};

const dimsBy: Record<string, [number, number]> = { sm: [90, 134], md: [120, 178], lg: [160, 238] };

export const TMDBPosterCard = ({
  item, size = 'md', isVIP, onClick,
}: { item: TMDBItem; size?: 'sm' | 'md' | 'lg'; isVIP?: boolean; onClick?: () => void }) => {
  const [hov, setHov] = useState(false);
  const [w, h] = dimsBy[size];
  const n = normalize(item);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: w, flexShrink: 0, cursor: 'pointer', transform: hov ? 'scale(1.03)' : 'scale(1)', transition: 'transform 0.2s ease' }}>
      <div style={{ borderRadius: T.radiusSm, overflow: 'hidden', position: 'relative', height: h }}>
        <TMDBPoster path={n.poster_path} width={w} height={h} title={n.title} />
        {isVIP && <div style={{ position: 'absolute', top: 6, right: 6, background: T.gold, borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center' }}><Icon name="crown" size={10} color="#000" /></div>}
      </div>
      <div style={{ marginTop: 6 }}>
        <Txt size={size === 'lg' ? 13 : size === 'md' ? 12 : 11} weight={700} color={T.t1} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: w }}>{n.title}</Txt>
        {n.year && <Txt size={size === 'lg' ? 11 : 10} color={T.t3} style={{ display: 'block' }}>{n.year}</Txt>}
      </div>
    </div>
  );
};

export const SkeletonCards = ({ count = 5, size = 'md' }: { count?: number; size?: 'sm' | 'md' | 'lg' }) => {
  const [w, h] = dimsBy[size];
  return (
    <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16 }}>
      {[...Array(count)].map((_, i) => (
        <div key={i} style={{ width: w, flexShrink: 0 }}>
          <Skeleton w={w} h={h} radius={T.radiusSm} />
          <Skeleton w={w * 0.8} h={10} style={{ marginTop: 8 }} />
          <Skeleton w={w * 0.5} h={8} style={{ marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   TMDBGridCard — card para grade 2 colunas
   Imagem no topo + título/info abaixo no fundo do card
   Busca poster sem texto (iso_639_1 = null) via TMDB images API
   ───────────────────────────────────────────────────────────── */
export const TMDBGridCard = ({
  item, onClick, tag,
}: {
  item: TMDBItem;
  onClick?: () => void;
  tag?: { label: string; color: string; bg: string };
}) => {
  const [imgLoaded,    setImgLoaded]    = useState(false);
  const [imgErr,       setImgErr]       = useState(false);
  const [textlessSrc,  setTextlessSrc]  = useState<string | null>(null);
  const [fetchDone,    setFetchDone]    = useState(false);

  const n        = normalize(item);
  // normalize() usa media_type ou first_air_date para detectar TV.
  // WatchingItem não tem nenhum dos dois — usa o campo próprio `type`.
  const resolvedType: 'tv' | 'movie' =
    n.type === 'tv' ? 'tv' : ((item as any).type === 'tv' ? 'tv' : 'movie');
  const apiType  = resolvedType === 'tv' ? 'tv' : 'movie';
  const fallback = n.poster_path ? tmdbImg(n.poster_path, 'w342') : null;
  // Só mostra imagem após o fetch terminar — evita glitch de troca
  const src      = fetchDone ? (textlessSrc ?? fallback) : null;

  const isTV    = resolvedType === 'tv';
  const seasons = (item as any).number_of_seasons as number | undefined;
  const subtitle = isTV
    ? (seasons ? `${seasons} temporada${seasons !== 1 ? 's' : ''}` : 'Série')
    : `Filme${n.year ? ` · ${n.year}` : ''}`;

  /* Lazy-fetch textless poster (iso_639_1 === null) */
  useEffect(() => {
    if (!item.id) return;
    let alive = true;
    const url = `/api/tmdb?endpoint=/${apiType}/${item.id}/images&include_image_language=null`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (!alive) return;
        const posters: Array<{ file_path: string; iso_639_1: string | null; vote_average: number }> =
          data?.posters ?? [];
        const best = posters
          .filter(p => p.iso_639_1 === null)
          .sort((a, b) => b.vote_average - a.vote_average)[0];
        if (best?.file_path) {
          setTextlessSrc(tmdbImg(best.file_path, 'w342') ?? null);
        }
        setFetchDone(true); // revela a imagem (textless ou fallback) só agora
      })
      .catch(() => {
        if (!alive) return;
        setFetchDone(true); // erro: revela o fallback sem textless
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, apiType]);

  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0c',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 2px 12px rgba(0,0,0,0.45)',
      }}
    >
      {/* ── Imagem com aspecto fixo + gradiente que dissolve no fundo ── */}
      <div style={{ position: 'relative', aspectRatio: '5 / 6.6', overflow: 'hidden', flexShrink: 0 }}>
        {/* Skeleton shimmer enquanto a imagem não carregou */}
        {(!fetchDone || (src && !imgLoaded && !imgErr)) && (
          <div className="img-skeleton" style={{ position: 'absolute', inset: 0 }} />
        )}
        {src && !imgErr && (
          <img
            key={src}
            src={src}
            alt={n.title}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgErr(true)}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.35s',
              transform: 'scale(1.10)',
            }}
          />
        )}

        {/* Gradiente: dissolve para o mesmo fundo escuro do texto abaixo */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 42%, #0a0a0c 100%)',
          pointerEvents: 'none',
        }} />

        {/* Tag badge — topo esquerdo */}
        {tag && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            padding: '3px 7px', borderRadius: 6,
            background: tag.bg,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          } as React.CSSProperties}>
            <span style={{
              fontSize: 9, fontWeight: 800,
              color: tag.color,
              fontFamily: "'Area','Inter',sans-serif",
              letterSpacing: 0.4,
            }}>{tag.label}</span>
          </div>
        )}
      </div>

      {/* ── Texto abaixo — mesmo fundo do gradiente, altura livre ── */}
      <div style={{ padding: '2px 11px 13px', background: '#0a0a0c' }}>
        <div style={{
          fontSize: 14, fontWeight: 700,
          color: 'rgba(255,255,255,0.95)',
          fontFamily: "'Area','Inter',sans-serif",
          lineHeight: 1.5,
          marginBottom: 4,
        }}>{n.title}</div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.50)',
          fontFamily: "'Area','Inter',sans-serif",
          lineHeight: 1.5,
        }}>{subtitle}</div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   MasonryGrid2 — grade masonry 2 colunas com alturas variáveis
   Distribui items alternadamente nas colunas (0,2,4… / 1,3,5…)
   ───────────────────────────────────────────────────────────── */
export const MasonryGrid2 = ({
  items, onItem, loading = false, skeletonCount = 8, getTag, padding = '0 16px',
}: {
  items: TMDBItem[];
  onItem: (item: TMDBItem) => void;
  loading?: boolean;
  skeletonCount?: number;
  getTag?: (item: TMDBItem) => { label: string; color: string; bg: string } | undefined;
  padding?: string;
}) => {
  const col1 = items.filter((_, i) => i % 2 === 0);
  const col2 = items.filter((_, i) => i % 2 === 1);
  const sk1  = Math.ceil(skeletonCount / 2);
  const sk2  = Math.floor(skeletonCount / 2);

  if (loading) return (
    <div style={{ display: 'flex', gap: 13, padding }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {Array.from({ length: sk1 }).map((_, i) => (
          <div key={i} style={{ borderRadius: 16, background: 'var(--c-surface2)', aspectRatio: '5/6.6' }} />
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {Array.from({ length: sk2 }).map((_, i) => (
          <div key={i} style={{ borderRadius: 16, background: 'var(--c-surface2)', aspectRatio: '5/6.6' }} />
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 13, padding }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {col1.map(item => (
          <TMDBGridCard key={item.id} item={item} onClick={() => onItem(item)} tag={getTag?.(item)} />
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {col2.map(item => (
          <TMDBGridCard key={item.id} item={item} onClick={() => onItem(item)} tag={getTag?.(item)} />
        ))}
      </div>
    </div>
  );
};

export const HSection = ({
  title, badge, children, onSeeAll, style = {},
}: { title: string; badge?: string; children: ReactNode; onSeeAll?: () => void; style?: CSSProperties }) => (
  <div style={{ marginBottom: 24, ...style }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Txt size={16} weight={700} color={T.t1}>{title}</Txt>
        {badge && <div style={{ background: T.redDim, borderRadius: 5, padding: '2px 7px' }}><Txt size={10} weight={700} color={T.red}>{badge}</Txt></div>}
      </div>
      {onSeeAll && <button onClick={onSeeAll} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Txt size={12} color={T.pink} weight={600}>Ver tudo</Txt></button>}
    </div>
    <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as CSSProperties}>
      {children}
    </div>
  </div>
);

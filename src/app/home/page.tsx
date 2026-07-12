'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, Btn, Logo } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBBackdrop, MasonryGrid2 } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { listStore, sliderStore, type SliderItem, type SliderCategory } from '@/lib/store';
import { checkUpcomingReleases } from '@/lib/releaseNotifier';

type HomeTab = 'para_voce' | 'em_alta' | 'novidades';

type NewsPost = { id: number; title: string; image: string | null; link: string; date: string };

type WatchingTag = 'em_breve' | 'novo' | 'nao_assistido' | 'atrasado';

type WatchingItem = {
  id: number; title: string; type: string;
  poster_path?: string | null; backdrop_path?: string | null;
  // next episode (future — EM BREVE)
  nextSeason?: number; nextEpisode?: number; nextAirDate?: string | null;
  // last aired episode (NOVO / NÃO ASSISTIDO / ATRASADO)
  lastSeason?: number; lastEpisode?: number; lastAirDate?: string | null;
  tag?: WatchingTag;
};

const PLATFORMS = [
  { id: 8,    name: 'Netflix',      color: '#E50914' },
  { id: 337,  name: 'Disney+',      color: '#113CCF' },
  { id: 1899, name: 'Max',          color: '#002BE7' },
  { id: 119,  name: 'Prime Video',  color: '#00A8E0' },
  { id: 307,  name: 'Globoplay',    color: '#E8441C' },
  { id: 531,  name: 'Paramount+',   color: '#0064FF' },
];

export default function HomePage() {
  const router = useRouter();
  const [homeTab, setHomeTab]           = useState<HomeTab>('para_voce');
  const [heroIdx, setHeroIdx]           = useState(0);
  const [newsItems, setNewsItems]       = useState<NewsPost[]>([]);
  const [customSlider, setCustomSlider] = useState<SliderItem[]>([]);
  const [watchingItems, setWatchingItems] = useState<WatchingItem[]>([]);
  const [trendFilter, setTrendFilter]   = useState<'series' | 'movies'>('series');
  const [novFilter, setNovFilter]       = useState<'series' | 'movies'>('series');
  const [trendLimit, setTrendLimit]     = useState(10);
  const [novLimit, setNovLimit]         = useState(10);

  const heroScrollRef = useRef<HTMLDivElement>(null);
  const [textlessPosters, setTextlessPosters] = useState<Record<number, string | null>>({});

  /* ── init: custom slider + upcoming releases ── */
  useEffect(() => {
    setCustomSlider(sliderStore.get());
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const initial = setTimeout(() => { checkUpcomingReleases().catch(() => {}); }, 4000);
    const interval = setInterval(() => { checkUpcomingReleases().catch(() => {}); }, 30 * 60 * 1000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []);

  /* ── fetch watching series with next episode info ── */
  useEffect(() => {
    const watching = listStore.get('watching').filter((i) => i.type === 'tv');
    if (watching.length === 0) { setWatchingItems([]); return; }

    Promise.all(
      watching.slice(0, 10).map(async (item) => {
        try {
          const detail = await tmdb.tvDetail(item.id);
          const next = detail?.next_episode_to_air;
          const last = detail?.last_episode_to_air;
          const lastAirDate  = last?.air_date ?? null;
          const nextAirDate  = next?.air_date ?? null;
          const now = Date.now();

          // ── Tag logic ──────────────────────────────────────────
          // EM BREVE: próximo episódio existe e ainda não estreou
          // NOVO: último ep já estreou há ≤ 14 dias (ainda não assistido)
          // NÃO ASSISTIDO: 15-30 dias sem assistir
          // ATRASADO: > 30 dias sem assistir
          let tag: WatchingTag | undefined;
          const nextIsFuture = nextAirDate && new Date(nextAirDate).getTime() > now;
          if (nextIsFuture) {
            tag = 'em_breve';
          } else if (lastAirDate) {
            const diffDays = (now - new Date(lastAirDate).getTime()) / 86_400_000;
            if (diffDays <= 14)      tag = 'novo';
            else if (diffDays > 30)  tag = 'atrasado';
            else                     tag = 'nao_assistido';
          }

          return {
            ...item,
            backdrop_path: detail?.backdrop_path ?? (item as WatchingItem).backdrop_path ?? null,
            // próximo ep (EM BREVE)
            nextSeason:   next?.season_number  ?? undefined,
            nextEpisode:  next?.episode_number ?? undefined,
            nextAirDate,
            // último ep já ao ar (NOVO / NÃO ASSISTIDO / ATRASADO)
            lastSeason:   last?.season_number  ?? undefined,
            lastEpisode:  last?.episode_number ?? undefined,
            lastAirDate,
            tag,
          } as WatchingItem;
        } catch {
          return { ...item } as WatchingItem;
        }
      })
    ).then(setWatchingItems);
  }, []);

  /* ── fetch news ── */
  useEffect(() => {
    fetch('/api/news')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setNewsItems(d.slice(0, 6)); })
      .catch(() => {});
  }, []);

  /* ── TMDB data ── */
  const { data: trendingAll }                      = useTMDB(() => tmdb.trending('all', 'week'), []);
  const { data: trendMovies,  loading: lTM }      = useTMDB(() => tmdb.trending('movie', 'week'), []);
  const { data: trendTV,      loading: lTTV }     = useTMDB(() => tmdb.trending('tv', 'week'), []);
  const { data: topRatedMov,  loading: lTRM }     = useTMDB(() => tmdb.topRated('movie'), []);
  const { data: topRatedTV,   loading: lTRTV }    = useTMDB(() => tmdb.topRated('tv'), []);
  const { data: nowPlaying,   loading: lNP }      = useTMDB(() => tmdb.nowPlaying(), []);
  const { data: onAir,        loading: lOA }      = useTMDB(() => tmdb.onAir(), []);

  /* ── hero slider — admin slider with TMDB trending fallback ── */
  const heroes: SliderItem[] = useMemo(() => {
    if (customSlider.length > 0) return customSlider;
    // fallback: convert TMDB trending to SliderItem with default fields
    return (trendingAll?.results || []).slice(0, 5).map((r: TMDBItem) => {
      const n = normalize(r);
      return {
        id: n.id, title: n.title, type: n.type as 'movie' | 'tv',
        backdrop_path: r.backdrop_path ?? null,
        poster_path: r.poster_path ?? null,
        overview: r.overview || '',
        buttonText: 'Quero ver',
        category: n.type === 'movie' ? 'nos_cinemas' : 'no_streaming',
      } as SliderItem;
    });
  }, [customSlider, trendingAll]);

  /* ── fetch textless posters for slider items ── */
  useEffect(() => {
    if (heroes.length === 0) return;
    heroes.forEach(async (item) => {
      if (textlessPosters[item.id] !== undefined) return;
      try {
        const endpoint = `/${item.type}/${item.id}/images?include_image_language=null`;
        const data = await fetch(`/api/tmdb?endpoint=${encodeURIComponent(endpoint)}`).then(r => r.json());
        const found = (data.posters || []).find((p: any) => p.iso_639_1 === null);
        setTextlessPosters(prev => ({
          ...prev,
          [item.id]: found ? `https://image.tmdb.org/t/p/w780${found.file_path}` : null,
        }));
      } catch {
        setTextlessPosters(prev => ({ ...prev, [item.id]: null }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroes]);

  const openTitle = useCallback((item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  }, [router]);


  /* ── Section masonry 2 colunas ── */
  const SectionGrid = ({ title, items, loading, limit = 10, onLoadMore }: { title?: string; items?: TMDBItem[]; loading?: boolean; limit?: number; onLoadMore?: () => void }) => {
    const sliced = (items || []).slice(0, limit);
    const hasMore = !loading && (items || []).length > limit;
    return (
      <div style={{ marginBottom: 28 }}>
        {title && <Txt size={22} weight={800} style={{ display: 'block', paddingLeft: 16, paddingRight: 16, marginBottom: 14, fontStretch: 'condensed' } as React.CSSProperties}>{title}</Txt>}
        <MasonryGrid2
          items={sliced}
          onItem={openTitle}
          loading={loading}
          skeletonCount={6}
        />
        {hasMore && onLoadMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
            <button onClick={onLoadMore} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 24px', borderRadius: 24,
              background: 'transparent', border: `1px solid ${T.border}`,
              cursor: 'pointer', fontFamily: "'Area','Inter',sans-serif",
            }}>
              <Txt size={13} weight={700} color={T.t2}>Carregar mais</Txt>
              <Icon name="chevronR" size={13} color={T.t3} style={{ transform: 'rotate(90deg)' }} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Frame>
      <Screen style={{ background: 'var(--c-bg)' }}>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}>

          {/* ── Hero Section — slider só em Para você ── */}
          {homeTab === 'para_voce' ? (() => {
            const CARD_H = 460;
            return (
              <div style={{ position: 'relative', height: CARD_H }}>

                {/* Slider scroll — preenche o hero inteiro */}
                <div
                  ref={heroScrollRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const perCard = el.scrollWidth / (heroes.length || 1);
                    setHeroIdx(Math.round(el.scrollLeft / perCard));
                  }}
                  style={{ position: 'absolute', inset: 0, overflowX: 'auto', display: 'flex', scrollbarWidth: 'none', scrollSnapType: 'x mandatory' } as React.CSSProperties}
                >
                  {heroes.length === 0
                    ? [0,1,2].map((i) => (
                        <div key={i} style={{ width: '100%', flexShrink: 0, height: '100%', background: T.surface2, scrollSnapAlign: 'start' }} />
                      ))
                    : heroes.map((item) => {
                        // undefined = fetch still pending → show nothing (prevents glitch)
                        // null     = fetch done, no textless found → fall back to standard poster
                        // string   = textless poster url → use it
                        const textless = textlessPosters[item.id];
                        const fetchDone = textless !== undefined;
                        const imgUrl = fetchDone
                          ? (textless ?? tmdbImg(item.poster_path, 'w780') ?? tmdbImg(item.backdrop_path, 'w780'))
                          : null;
                        return (
                          <div
                            key={item.id}
                            onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                            style={{ width: '100%', flexShrink: 0, height: '100%', overflow: 'hidden', position: 'relative', cursor: 'pointer', scrollSnapAlign: 'start', background: '#0a0a0c' }}
                          >
                            {/* Background image — só aparece após fetch concluir, com fade-in */}
                            {imgUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imgUrl} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block', animation: 'heroFadeIn 0.4s ease forwards' }} />
                            )}
                            {/* Gradient escuro de baixo para cima */}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 50%, transparent 80%)', zIndex: 1 }} />
                            {/* Fade cor da página — atrás do conteúdo */}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 150, background: 'linear-gradient(to bottom, transparent 0%, var(--c-bg) 100%)', pointerEvents: 'none', zIndex: 2 }} />
                            {/* Título + botões */}
                            <div style={{ position: 'absolute', bottom: 52, left: 16, right: 16, zIndex: 3 }}>
                              <Txt size={32} weight={900} color="#fff"
                                style={{ display: 'block', lineHeight: 1.05, letterSpacing: -1, marginBottom: 14, textShadow: '0 2px 20px rgba(0,0,0,0.7)', fontFamily: "'Greed','Area',sans-serif" } as React.CSSProperties}>
                                {item.title}
                              </Txt>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={(e) => { e.stopPropagation(); router.push(`/title/${item.type}/${item.id}`); }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 24, background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,1)' } as React.CSSProperties}>
                                  <Icon name="plus" size={13} color="#0a0a0a" />
                                  <Txt size={13} weight={700} color="#0a0a0a">Adicionar à lista</Txt>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); router.push(`/title/${item.type}/${item.id}`); }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 24, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.25)' } as React.CSSProperties}>
                                  <Icon name="star" size={13} color="#fff" />
                                  <Txt size={13} weight={600} color="#fff">Avaliar</Txt>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  }
                </div>

                {/* Gradiente topo — legibilidade do header/tabs */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)', zIndex: 4, pointerEvents: 'none' }} />

                {/* Dots */}
                {heroes.length > 0 && (
                  <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 5 }}>
                    {heroes.map((_, i) => (
                      <div key={i} onClick={(e) => {
                        e.stopPropagation();
                        const el = heroScrollRef.current;
                        if (!el) return;
                        const perCard = el.scrollWidth / (heroes.length || 1);
                        el.scrollTo({ left: perCard * i, behavior: 'smooth' });
                      }}
                      style={{ width: i === heroIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === heroIdx ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.3s ease', cursor: 'pointer', flexShrink: 0 }} />
                    ))}
                  </div>
                )}

                {/* Header — centralizado, sobreposto */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, height: 74, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 76 }} />
                  <Logo height={20} />
                  <div style={{ width: 76, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => router.push('/search')}
                      style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                      <Icon name="search" size={16} color="#fff" />
                    </button>
                    <button onClick={() => router.push('/notifications')}
                      style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                      <Icon name="bell" size={16} color="#fff" />
                    </button>
                  </div>
                </div>

                {/* Tabs — sobreposto, Liquid Glass */}
                <div style={{ position: 'absolute', top: 74, left: 0, right: 0, zIndex: 10, padding: '0 16px', display: 'flex', gap: 6 }}>
                  {([
                    ['para_voce', 'Para você'],
                    ['em_alta',   'Em alta'],
                    ['novidades', 'Novidades'],
                  ] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setHomeTab(id)} style={{
                      padding: '6px 14px', borderRadius: 20, flexShrink: 0,
                      background: homeTab === id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.12)',
                      border: homeTab === id ? '1px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.22)',
                      color: homeTab === id ? '#C069FF' : '#fff',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                      backdropFilter: 'blur(24px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                      boxShadow: homeTab === id
                        ? '0 2px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,1)'
                        : '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
                    } as React.CSSProperties}>{label}</button>
                  ))}
                </div>
              </div>
            );
          })() : (
            /* ── Header simples para Em alta / Novidades ── */
            <div style={{ position: 'relative' }}>
              <div style={{ height: 74, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 76 }} />
                <Logo height={20} />
                <div style={{ width: 76, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => router.push('/search')}
                    style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--c-glass-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--c-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' } as React.CSSProperties}>
                    <Icon name="search" size={16} color="var(--c-t1)" />
                  </button>
                  <button onClick={() => router.push('/notifications')}
                    style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--c-glass-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--c-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' } as React.CSSProperties}>
                    <Icon name="bell" size={16} color="var(--c-t1)" />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, padding: '0 16px 16px' }}>
                {([
                  ['para_voce', 'Para você'],
                  ['em_alta',   'Em alta'],
                  ['novidades', 'Novidades'],
                ] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setHomeTab(id)} style={{
                    padding: '6px 14px', borderRadius: 20, flexShrink: 0,
                    background: homeTab === id ? 'var(--c-t1)' : 'var(--c-glass-bg)',
                    border: `1px solid ${homeTab === id ? 'transparent' : 'var(--c-border)'}`,
                    color: homeTab === id ? 'var(--c-bg)' : 'var(--c-t2)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                    backdropFilter: 'blur(20px)',
                    boxShadow: homeTab === id ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.1)',
                  } as React.CSSProperties}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              TAB: Para você
             ══════════════════════════════════════════════ */}
          {homeTab === 'para_voce' && (
            <>
              {/* ── Content below hero ── */}
              <div style={{ background: 'var(--c-bg)', paddingTop: 12 }}>

              {/* ── Minha lista (watching series) ── */}
              <div style={{ margin: '0 16px 28px' }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Txt size={22} weight={800} style={{ fontStretch: 'condensed' } as React.CSSProperties}>Minha lista</Txt>
                  <button
                    onClick={() => router.push('/lists')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Txt size={13} weight={700} color={T.pink}>Ver tudo</Txt>
                    <Icon name="chevronR" size={14} color={T.pink} />
                  </button>
                </div>

                {watchingItems.length === 0 ? (
                  <div style={{ padding: '20px 16px', borderRadius: 16, background: T.card, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                    <Icon name="tv" size={28} color={T.t3} />
                    <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.4 }}>
                      Adicione séries em <strong>Assistindo</strong> para ver os próximos episódios aqui
                    </Txt>
                    <button
                      onClick={() => router.push('/search')}
                      style={{ padding: '8px 20px', borderRadius: 20, background: T.pink, border: 'none', cursor: 'pointer' }}>
                      <Txt size={13} weight={700} color="#fff">Explorar séries</Txt>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {watchingItems.map((item) => {
                      const thumbUrl = tmdbImg(item.backdrop_path, 'w342') ?? tmdbImg(item.poster_path, 'w342') ?? undefined;
                      return (
                        <button
                          key={item.id}
                          onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                          {/* Landscape thumbnail */}
                          <div style={{ width: 100, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
                            {thumbUrl
                              ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={22} color={T.t4} /></div>
                            }
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight={700} color={T.t1} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{item.title}</Txt>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {item.tag && (() => {
                                const tagStyles: Record<WatchingTag, { bg: string; color: string; label: string }> = {
                                  em_breve:      { bg: '#D92FFF',  color: '#fff', label: 'EM BREVE' },
                                  novo:          { bg: '#CCFF84',  color: '#000', label: 'NOVO' },
                                  nao_assistido: { bg: '#FB772D',  color: '#fff', label: 'NÃO ASSISTIDO' },
                                  atrasado:      { bg: '#e0352b',  color: '#fff', label: 'ATRASADO' },
                                };
                                const s = tagStyles[item.tag];
                                return (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 7px', borderRadius: 6, background: s.bg }}>
                                    <Txt size={10} weight={800} color={s.color} style={{ letterSpacing: '0.4px', lineHeight: 1 }}>{s.label}</Txt>
                                  </span>
                                );
                              })()}
                              <Txt size={12} color={T.t3}>
                                {item.tag === 'em_breve' && item.nextSeason && item.nextEpisode
                                  ? `T${item.nextSeason} · Ep ${item.nextEpisode}`
                                  : item.tag === 'novo' && item.lastSeason && item.lastEpisode
                                    ? `T${item.lastSeason} · Ep ${item.lastEpisode}`
                                    : item.lastSeason && item.lastEpisode
                                      ? `T${item.lastSeason} · Ep ${item.lastEpisode}`
                                      : 'Assistindo'}
                              </Txt>
                            </div>
                          </div>
                          <Icon name="chevronR" size={16} color={T.t4} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Séries recomendadas ── */}
              <SectionGrid title="Séries recomendadas" items={topRatedTV?.results} loading={lTRTV} />

              {/* ── Filmes recomendados ── */}
              <SectionGrid title="Filmes recomendados" items={topRatedMov?.results} loading={lTRM} />

              {/* ── Streamings ── */}
              <div style={{ marginBottom: 28 }}>
                <Txt size={22} weight={800} style={{ display: 'block', paddingLeft: 16, marginBottom: 14, fontStretch: 'condensed' } as React.CSSProperties}>
                  Streamings
                </Txt>
                <div style={{
                  display: 'flex', gap: 10,
                  overflowX: 'auto', scrollbarWidth: 'none',
                  paddingBottom: 4,
                  scrollSnapType: 'x mandatory',
                  scrollPaddingLeft: 16,
                } as React.CSSProperties}>
                  <div style={{ width: 16, flexShrink: 0 }} />
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/streaming/${p.id}`)}
                      style={{
                        flexShrink: 0, scrollSnapAlign: 'start',
                        width: 150, height: 106,
                        borderRadius: 18, cursor: 'pointer',
                        position: 'relative', overflow: 'hidden',
                        background: `linear-gradient(135deg, ${p.color}dd 0%, ${p.color}88 100%)`,
                        border: `1px solid ${p.color}55`,
                        boxShadow: `0 4px 20px ${p.color}33`,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-start', justifyContent: 'flex-end',
                        padding: '12px 14px',
                        textAlign: 'left',
                      } as React.CSSProperties}
                    >
                      {/* Inicial da plataforma no canto superior */}
                      <span style={{
                        position: 'absolute', top: 10, right: 14,
                        fontSize: 32, fontWeight: 900, color: 'rgba(255,255,255,0.15)',
                        fontFamily: "'Greed','Area',sans-serif", lineHeight: 1,
                      }}>{p.name[0]}</span>
                      {/* Nome */}
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: "'Area',sans-serif", lineHeight: 1.2, display: 'block' }}>
                        {p.name}
                      </span>
                      {/* Sub */}
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.60)', fontFamily: "'Area',sans-serif", marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        Em alta <Icon name="chevronR" size={9} color="rgba(255,255,255,0.50)" />
                      </span>
                    </button>
                  ))}
                  <div style={{ width: 8, flexShrink: 0 }} />
                </div>
              </div>

              {/* ── Fique por dentro (news) ── */}
              {newsItems.length > 0 && (
                <div style={{ background: T.card, padding: '20px 16px 24px', marginBottom: 8 }}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <Txt size={22} weight={800} style={{ fontStretch: 'condensed' } as React.CSSProperties}>Fique por dentro</Txt>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://seriesemcena.com.br/wp-content/uploads/2025/01/sec_logo_20252.png"
                      alt="Séries em Cena"
                      style={{ height: 22, width: 'auto', objectFit: 'contain' }}
                    />
                  </div>

                  {/* Featured card — first news item */}
                  {newsItems[0] && (
                    <a href={newsItems[0].link} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9', background: T.surface2, textDecoration: 'none', marginBottom: 12 }}>
                      {newsItems[0].image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={newsItems[0].image} alt={newsItems[0].title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.88) 100%)' }} />
                      <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14 }}>
                        <Txt size={15} weight={800} color="#fff"
                          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35 } as React.CSSProperties}>
                          {newsItems[0].title}
                        </Txt>
                      </div>
                    </a>
                  )}

                  {/* List — next 4 news items (no wrapper card) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {newsItems.slice(1, 5).map((post, idx) => (
                      <div key={post.id}>
                        {idx > 0 && <div style={{ height: 1, background: T.border, marginLeft: 92 }} />}
                        <a href={post.link} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', padding: '12px 0' }}>
                          <div style={{ width: 80, height: 54, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
                            {post.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={post.image} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            )}
                          </div>
                          <Txt size={13} weight={600} color={T.t1}
                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4, flex: 1 } as React.CSSProperties}>
                            {post.title}
                          </Txt>
                        </a>
                      </div>
                    ))}
                  </div>

                  {/* Ver mais button */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                    <a href="https://seriesemcena.com.br" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '10px 24px', borderRadius: 24, background: T.bg, border: `1px solid ${T.border}` }}>
                      <Txt size={13} weight={700} color={T.t2}>Ver mais notícias</Txt>
                      <Icon name="chevronR" size={13} color={T.t3} />
                    </a>
                  </div>
                </div>
              )}
              </div>{/* /solid-bg wrapper */}
            </>
          )}

          {/* ══════════════════════════════════════════════
              TAB: Em alta
             ══════════════════════════════════════════════ */}
          {homeTab === 'em_alta' && (
            <div style={{ paddingTop: 8, background: 'var(--c-bg)' }}>
              <div style={{ display: 'flex', gap: 8, padding: '0 16px 20px' }}>
                {(['series', 'movies'] as const).map((f) => (
                  <button key={f} onClick={() => { setTrendFilter(f); setTrendLimit(10); }} style={{
                    padding: '8px 20px', borderRadius: 24, flexShrink: 0,
                    background: trendFilter === f ? T.pink : T.surface2,
                    border: trendFilter === f ? 'none' : `1px solid ${T.border}`,
                    color: trendFilter === f ? '#fff' : T.t2,
                    fontSize: 13, fontWeight: 700,
                    fontFamily: "'Area','Inter',sans-serif",
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {f === 'series' ? 'Séries' : 'Filmes'}
                  </button>
                ))}
              </div>
              {trendFilter === 'series'
                ? <SectionGrid items={trendTV?.results}     loading={lTTV} limit={trendLimit} onLoadMore={() => setTrendLimit(l => l + 10)} />
                : <SectionGrid items={trendMovies?.results} loading={lTM}  limit={trendLimit} onLoadMore={() => setTrendLimit(l => l + 10)} />
              }
            </div>
          )}

          {/* ══════════════════════════════════════════════
              TAB: Novidades
             ══════════════════════════════════════════════ */}
          {homeTab === 'novidades' && (
            <div style={{ paddingTop: 8, background: 'var(--c-bg)' }}>
              <div style={{ display: 'flex', gap: 8, padding: '0 16px 20px' }}>
                {(['series', 'movies'] as const).map((f) => (
                  <button key={f} onClick={() => { setNovFilter(f); setNovLimit(10); }} style={{
                    padding: '8px 20px', borderRadius: 24, flexShrink: 0,
                    background: novFilter === f ? T.pink : T.surface2,
                    border: novFilter === f ? 'none' : `1px solid ${T.border}`,
                    color: novFilter === f ? '#fff' : T.t2,
                    fontSize: 13, fontWeight: 700,
                    fontFamily: "'Area','Inter',sans-serif",
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {f === 'series' ? 'Séries' : 'Filmes'}
                  </button>
                ))}
              </div>
              {novFilter === 'series'
                ? <SectionGrid items={onAir?.results}      loading={lOA} limit={novLimit} onLoadMore={() => setNovLimit(l => l + 10)} />
                : <SectionGrid items={nowPlaying?.results} loading={lNP} limit={novLimit} onLoadMore={() => setNovLimit(l => l + 10)} />
              }
            </div>
          )}

          <div style={{ height: 24, background: 'var(--c-bg)' }} />
        </div>
      </Screen>
    </Frame>
  );
}

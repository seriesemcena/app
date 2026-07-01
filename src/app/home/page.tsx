'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, Btn } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBBackdrop, TMDBPosterCard } from '@/components/posters';
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

  const heroScrollRef = useRef<HTMLDivElement>(null);
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
      watching.slice(0, 6).map(async (item) => {
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

  /* ── Plataformas para a seção Trends ── */
  const [trendPlatformId, setTrendPlatformId] = useState<number>(PLATFORMS[0].id);
  const trendPlatform = PLATFORMS.find((p) => p.id === trendPlatformId) ?? PLATFORMS[0];

  const { data: trendByPlatform, loading: lTBP } = useTMDB(() =>
    tmdb.discover('tv', {
      with_watch_providers: String(trendPlatformId),
      watch_region: 'BR',
      sort_by: 'popularity.desc',
    }), [trendPlatformId]);

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

  const openTitle = useCallback((item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  }, [router]);


  /* ── Section scroll row (2 cards visible per screen) ── */
  /* ── Section scroll row (2 cards visible per screen) ── */
  const SectionGrid = ({ title, items, loading }: { title: string; items?: TMDBItem[]; loading?: boolean }) => (
    <div style={{ marginBottom: 28 }}>
      <Txt size={22} weight={800} style={{ display: 'block', paddingLeft: 20, paddingRight: 16, marginBottom: 14, fontStretch: 'condensed' } as React.CSSProperties}>{title}</Txt>
      <div style={{
        display: 'flex', gap: 10,
        overflowX: 'auto', scrollbarWidth: 'none',
        paddingLeft: 20, paddingBottom: 4,
        scrollSnapType: 'x mandatory',
        scrollPaddingLeft: 20,
      } as React.CSSProperties}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ width: 160, height: 238, flexShrink: 0, borderRadius: 12, background: T.surface2, scrollSnapAlign: 'start' }} />
            ))
          : (items || []).slice(0, 12).map((item) => (
              <div key={item.id} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
                <TMDBPosterCard item={item} size="lg" onClick={() => openTitle(item)} />
              </div>
            ))
        }
        {/* right breathing room sentinel */}
        <div style={{ width: 20, flexShrink: 0 }} />
      </div>
    </div>
  );

  return (
    <Frame>
      <Screen style={{ background: 'transparent', position: 'relative' }}>
        {/* Gradient background — absolute, never moves */}
        <div style={{ position: 'absolute', inset: 0, background: 'var(--c-header-gradient)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', position: 'relative', zIndex: 1 } as React.CSSProperties}>

          {/* ── Header ── */}
          <div style={{ padding: '24px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 900,
              letterSpacing: '-1px', lineHeight: 1,
              color: '#fff', textTransform: 'uppercase',
              fontFamily: "'Area','Inter',sans-serif",
            }}>
              Maratonou
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => router.push('/search')}
                style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="search" size={18} color="#fff" />
              </button>
              <button
                onClick={() => router.push('/notifications')}
                style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={18} color="#fff" />
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px', overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
            {([
              ['para_voce', 'Para você'],
              ['em_alta',   'Em alta'],
              ['novidades', 'Novidades'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setHomeTab(id)} style={{
                padding: '9px 20px', borderRadius: 24, flexShrink: 0,
                background: homeTab === id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.18)',
                border: homeTab === id ? 'none' : '1px solid rgba(255,255,255,0.35)',
                color: homeTab === id ? '#A861FF' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
              }}>{label}</button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════
              TAB: Para você
             ══════════════════════════════════════════════ */}
          {homeTab === 'para_voce' && (
            <>
              {/* ── Hero slider ── */}
              {(() => {
                const CARD_H = 230; const PAD = 16; const GAP = 12;

                const CATEGORY_CONFIG: Record<NonNullable<SliderCategory>, { label: string; icon: string; bg: string }> = {
                  nos_cinemas:  { label: 'NOS CINEMAS',   icon: '🎬', bg: 'rgba(120,60,220,0.92)' },
                  no_streaming: { label: 'NO STREAMING',  icon: '📺', bg: 'rgba(229,46,113,0.92)' },
                  em_breve:     { label: 'EM BREVE',       icon: '🕐', bg: 'rgba(0,0,0,0.55)'      },
                };

                return (
                  <div
                    ref={heroScrollRef}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const perCard = (el.scrollWidth - PAD * 2) / (heroes.length || 1);
                      setHeroIdx(Math.round(el.scrollLeft / perCard));
                    }}
                    style={{ overflowX: 'auto', display: 'flex', gap: GAP, padding: `0 ${PAD}px 16px`, scrollbarWidth: 'none', scrollSnapType: 'x mandatory', scrollPaddingInline: `${PAD}px` } as React.CSSProperties}
                  >
                    {heroes.length === 0
                      ? [0,1,2].map((i) => (
                          <div key={i} style={{ width: `calc(100% - ${PAD * 2}px)`, flexShrink: 0, height: CARD_H, borderRadius: 22, background: T.surface2, scrollSnapAlign: 'center' }} />
                        ))
                      : heroes.map((item, i) => {
                          const imgUrl = tmdbImg(item.backdrop_path, 'w780') ?? tmdbImg(item.poster_path, 'w780');
                          const cat = item.category ? CATEGORY_CONFIG[item.category] : null;
                          return (
                            <div
                              key={item.id}
                              onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                              style={{ width: `calc(100% - ${PAD * 2}px)`, flexShrink: 0, height: CARD_H, borderRadius: 22, overflow: 'hidden', position: 'relative', cursor: 'pointer', scrollSnapAlign: 'center', background: T.surface2 }}
                            >
                              {/* Background image */}
                              {imgUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={imgUrl} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              )}
                              {/* Gradient overlay */}
                              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 40%, transparent 70%)' }} />

                              {/* Category badge — top right */}
                              {cat && (
                                <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: cat.bg, backdropFilter: 'blur(8px)' }}>
                                  <span style={{ fontSize: 12 }}>{cat.icon}</span>
                                  <Txt size={10} weight={800} color="#fff" style={{ letterSpacing: '0.5px' }}>{cat.label}</Txt>
                                </div>
                              )}

                              {/* Bottom content */}
                              <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
                                <Txt size={22} weight={900} color="#fff"
                                  style={{ display: 'block', lineHeight: 1.15, letterSpacing: -0.5, marginBottom: 12, textShadow: '0 2px 16px rgba(0,0,0,0.6)' } as React.CSSProperties}>
                                  {item.title}
                                </Txt>
                                {/* CTA Button */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); router.push(`/title/${item.type}/${item.id}`); }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 24, background: '#7B2FBE', border: 'none', cursor: 'pointer' }}>
                                  <span style={{ fontSize: 13, color: '#fff' }}>→</span>
                                  <Txt size={13} weight={800} color="#fff">{item.buttonText || 'Quero ver'}</Txt>
                                </button>
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                );
              })()}

              {/* Hero dots */}
              {heroes.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: -8, marginBottom: 24 }}>
                  {heroes.map((_, i) => (
                    <div key={i} onClick={() => {
                      const el = heroScrollRef.current;
                      if (!el) return;
                      const perCard = (el.scrollWidth - 32) / (heroes.length || 1);
                      el.scrollTo({ left: perCard * i, behavior: 'smooth' });
                    }}
                    style={{ width: i === heroIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === heroIdx ? T.pink : T.dim, transition: 'all 0.3s ease', cursor: 'pointer', flexShrink: 0 }} />
                  ))}
                </div>
              )}

              {/* ── Content below hero — fade in cobre o gradiente ao rolar ── */}
              <div style={{ background: 'linear-gradient(to bottom, transparent 0px, var(--c-bg) 32px)' }}>

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
                                  em_breve:      { bg: 'rgba(90,120,255,0.14)',  color: '#2d5be3', label: 'EM BREVE' },
                                  novo:          { bg: 'rgba(52,199,89,0.14)',   color: '#1a8f3a', label: 'NOVO' },
                                  nao_assistido: { bg: 'rgba(255,159,10,0.14)',  color: '#b86e00', label: 'NÃO ASSISTIDO' },
                                  atrasado:      { bg: 'rgba(255,59,48,0.14)',   color: '#c0392b', label: 'ATRASADO' },
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

              {/* ── Séries em alta por plataforma ── */}
              <div style={{ marginBottom: 28 }}>
                {/* Título */}
                <Txt size={22} weight={800} style={{ display: 'block', paddingLeft: 20, marginBottom: 12, fontStretch: 'condensed' } as React.CSSProperties}>
                  Séries em alta
                </Txt>

                {/* Pills com logo + nome */}
                <div style={{ display: 'flex', gap: 8, paddingLeft: 20, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                  {PLATFORMS.map((p) => {
                    const active = trendPlatformId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setTrendPlatformId(p.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px 6px 8px', borderRadius: 20, flexShrink: 0,
                          background: active ? '#1a1a1a' : T.surface2,
                          border: active ? 'none' : `1px solid ${T.border}`,
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >
                        {/* Logo da plataforma — placeholder até os logos individuais serem definidos */}
                        <img
                          src="https://static.vecteezy.com/system/resources/previews/017/396/814/non_2x/netflix-mobile-application-logo-free-png.png"
                          alt={p.name}
                          style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }}
                        />
                        <Txt size={12} weight={700} color={active ? '#fff' : T.t2}>{p.name}</Txt>
                      </button>
                    );
                  })}
                  <div style={{ width: 4, flexShrink: 0 }} />
                </div>

                {/* Cards com ranking */}
                <div style={{
                  display: 'flex', gap: 10,
                  overflowX: 'auto', scrollbarWidth: 'none',
                  paddingLeft: 20, paddingBottom: 4,
                  scrollSnapType: 'x mandatory', scrollPaddingLeft: 20,
                } as React.CSSProperties}>
                  {lTBP
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={{ width: 155, flexShrink: 0, scrollSnapAlign: 'start' }}>
                          <div style={{ height: 232, borderRadius: 14, background: T.surface2, marginBottom: 8 }} />
                          <div style={{ height: 13, width: '75%', borderRadius: 6, background: T.surface2, marginBottom: 5 }} />
                          <div style={{ height: 11, width: '45%', borderRadius: 5, background: T.surface2 }} />
                        </div>
                      ))
                    : (trendByPlatform?.results || []).slice(0, 10).map((item: TMDBItem, idx: number) => {
                        const n = normalize(item);
                        return (
                          <button
                            key={item.id}
                            onClick={() => openTitle(item)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', flexShrink: 0, scrollSnapAlign: 'start', width: 155 }}
                          >
                            {/* Poster + ranking */}
                            <div style={{ position: 'relative', height: 232, borderRadius: 14, overflow: 'hidden', background: T.surface2, marginBottom: 8 }}>
                              {item.poster_path && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                                  alt={n.title}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                                />
                              )}
                              {/* Gradiente para o número */}
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }} />
                              {/* Número de ranking */}
                              <span style={{
                                position: 'absolute', bottom: 6, left: 10,
                                fontSize: 48, fontWeight: 900, lineHeight: 1,
                                color: '#fff',
                                fontFamily: "'Area','Inter',sans-serif",
                                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
                                WebkitTextStroke: '1px rgba(255,255,255,0.15)',
                              } as React.CSSProperties}>
                                {idx + 1}
                              </span>
                            </div>
                            {/* Título + plataforma */}
                            <Txt size={13} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                              {n.title}
                            </Txt>
                            <Txt size={11} color={T.t3} style={{ display: 'block' }}>{trendPlatform.name}</Txt>
                          </button>
                        );
                      })
                  }
                  <div style={{ width: 20, flexShrink: 0 }} />
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
            <div style={{ paddingTop: 4, background: 'var(--c-bg)' }}>
              <SectionGrid title="🔥 Filmes em alta" items={trendMovies?.results} loading={lTM} />
              <SectionGrid title="🔥 Séries em alta" items={trendTV?.results} loading={lTTV} />
            </div>
          )}

          {/* ══════════════════════════════════════════════
              TAB: Novidades
             ══════════════════════════════════════════════ */}
          {homeTab === 'novidades' && (
            <div style={{ paddingTop: 4, background: 'var(--c-bg)' }}>
              <SectionGrid title="🎬 Nos cinemas agora" items={nowPlaying?.results} loading={lNP} />
              <SectionGrid title="📺 No streaming hoje" items={onAir?.results}     loading={lOA} />
            </div>
          )}

          <div style={{ height: 24, background: 'var(--c-bg)' }} />
        </div>
      </Screen>
    </Frame>
  );
}

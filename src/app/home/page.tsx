'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, Btn, Logo, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBBackdrop, MasonryGrid2, TMDBGridCard } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, normalizeTMDBImageUrl, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { DEFAULT_PRO_HOME_SECTIONS, epWatchedStore, listStore, profileStore, proSettingsStore, sliderStore, syncProReminderNotifications, type ProHomeSectionKey, type SliderItem, type SliderCategory } from '@/lib/store';
import { getPersonalizedRecommendations, type PersonalizedRecommendations } from '@/lib/personalizedRecommendations';
import { checkUpcomingReleases } from '@/lib/releaseNotifier';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProSettingsStore } from '@/lib/db';
import { AppBannerSlot } from '@/components/AppBannerSlot';

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

/* título localizado + poster textless dos heroes, por `${type}_${id}_${lang}` —
   sobrevive a remontagens da página, então voltar à home não refaz fetches */
const heroMetaCache = new Map<string, { title: string | null; textless: string | null }>();

const PLATFORMS = [
  { id: 8,    name: 'Netflix',      logo: 'netflix'       },
  { id: 337,  name: 'Disney+',      logo: 'dineyplus'     },
  { id: 1899, name: 'HBO Max',       logo: 'hbomax'        },
  { id: 119,  name: 'Prime Video',  logo: 'primevideo'    },
  { id: 307,  name: 'Globoplay',    logo: 'globoplay'     },
  { id: 531,  name: 'Paramount+',   logo: 'paramountplus' },
  { id: 350,  name: 'Apple TV+',    logo: 'appletv'       },
  { id: 2141, name: 'MGM+',         logo: 'mgm'           },
];

const STREAM_NOISE = `url("data:image/svg+xml,%3Csvg xmlns%3D'http://www.w3.org/2000/svg'%3E%3Cfilter id%3D'n'%3E%3CfeTurbulence type%3D'fractalNoise' baseFrequency%3D'.75' numOctaves%3D'4'/%3E%3C/filter%3E%3Crect width%3D'100%25' height%3D'100%25' filter%3D'url(%23n)'/%3E%3C/svg%3E")`;

type HomeSectionGridProps = {
  title?: string;
  items?: TMDBItem[];
  loading?: boolean;
  limit?: number;
  loadMoreLabel: string;
  onItem: (item: TMDBItem) => void;
  onLoadMore?: () => void;
};

type HomeSectionView = 'grid' | 'list';

/* Kept outside HomePage so ordinary home state updates do not remount every
   poster card and repeat all of their metadata/image requests. */
function HomeSectionGrid({
  title, items, loading, limit = 10, loadMoreLabel, onItem, onLoadMore,
}: HomeSectionGridProps) {
  const { t } = useTranslation('home');
  const [view, setView] = useState<HomeSectionView>('grid');
  const uniqueItems = (items || []).filter((item, idx, all) =>
    all.findIndex((candidate) =>
      candidate.id === item.id
      && (candidate.media_type ?? (candidate as any).type) === (item.media_type ?? (item as any).type)
    ) === idx
  );
  const limitedItems = uniqueItems.slice(0, limit);
  const evenCount = limitedItems.length > 1
    ? limitedItems.length - (limitedItems.length % 2)
    : limitedItems.length;
  const sliced = limitedItems.slice(0, evenCount);
  const hasMore = !loading && uniqueItems.length > sliced.length;
  return (
    <div style={{ marginBottom: 28 }}>
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, paddingLeft: 16, paddingRight: 16, marginBottom: 14,
        }}>
          <Txt size={22} weight={800} style={{ minWidth: 0, fontStretch: 'condensed' } as React.CSSProperties}>{title}</Txt>
          <div
            role="group"
            aria-label={t('view.label')}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3,
              padding: 3, borderRadius: 12,
              background: T.card, border: `1px solid ${T.border}`,
            }}
          >
            {(['grid', 'list'] as const).map((option) => {
              const active = view === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-label={t(`view.${option}`)}
                  aria-pressed={active}
                  onClick={() => setView(option)}
                  style={{
                    width: 32, height: 30, borderRadius: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', cursor: 'pointer',
                    background: active ? T.pillActiveBg : 'transparent',
                    color: active ? T.pillActiveText : T.t3,
                    transition: 'background 0.18s ease, color 0.18s ease',
                  }}
                >
                  <Icon name={option === 'grid' ? 'grid' : 'list'} size={16} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'grid' || !title ? (
        <MasonryGrid2
          items={sliced}
          onItem={onItem}
          loading={loading}
          skeletonCount={6}
        />
      ) : (
        <div
          aria-label={title}
          style={{
            display: 'flex', gap: 12, overflowX: 'auto',
            padding: '0 16px 12px',
            scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
            scrollSnapType: 'x mandatory', scrollPaddingInline: 16,
          } as React.CSSProperties}
        >
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="img-skeleton"
                  style={{
                    flex: '0 0 clamp(168px, 42vw, 220px)',
                    aspectRatio: '5 / 7.6', borderRadius: 16,
                    scrollSnapAlign: 'start',
                  }}
                />
              ))
            : limitedItems.map((item) => (
                <div
                  key={`${item.media_type ?? (item as any).type ?? ''}-${item.id}`}
                  style={{
                    flex: '0 0 clamp(168px, 42vw, 220px)',
                    minWidth: 0, scrollSnapAlign: 'start',
                  }}
                >
                  <TMDBGridCard item={item} onClick={() => onItem(item)} />
                </div>
              ))
          }
        </div>
      )}
      {hasMore && onLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
          <button onClick={onLoadMore} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 24px', borderRadius: 24,
            background: 'transparent', border: `1px solid ${T.border}`,
            cursor: 'pointer', fontFamily: "'Area','Inter',sans-serif",
          }}>
            <Txt size={13} weight={700} color={T.t2}>{loadMoreLabel}</Txt>
            <Icon name="chevronR" size={13} color={T.t3} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { t, i18n } = useTranslation('home');
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === 'dark';

  /* ── Streaming card: liquid glass por tema ── */
  const scBg     = isDark ? 'rgba(18, 18, 22, 0.76)' : 'rgba(255, 255, 255, 0.72)';
  const scBorder = isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.08)';
  const scShadow = isDark
    ? [
        '0 8px 32px rgba(0,0,0,0.52)',
        '0 2px 8px rgba(0,0,0,0.30)',
        'inset 0 1.5px 0 rgba(255,255,255,0.22)',
        'inset 0 -1px 0 rgba(0,0,0,0.40)',
        'inset 1px 0 0 rgba(255,255,255,0.06)',
        'inset -1px 0 0 rgba(255,255,255,0.03)',
      ].join(', ')
    : [
        '0 4px 20px rgba(0,0,0,0.10)',
        '0 1px 4px rgba(0,0,0,0.07)',
        'inset 0 1.5px 0 rgba(255,255,255,0.90)',
        'inset 0 -1px 0 rgba(0,0,0,0.06)',
        'inset 1px 0 0 rgba(255,255,255,0.50)',
        'inset -1px 0 0 rgba(255,255,255,0.30)',
      ].join(', ');
  const scNameColor = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.82)';
  const scSubColor  = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.40)';
  const scInitialColor = isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.07)';
  const scSpecular = isDark
    ? [
        'radial-gradient(ellipse 90% 52% at 50% -10%, rgba(255,255,255,0.13) 0%, transparent 54%)',
        'radial-gradient(ellipse 48% 36% at 96% -2%, rgba(255,255,255,0.08) 0%, transparent 50%)',
        'radial-gradient(ellipse 60% 44% at 50% 112%, rgba(255,255,255,0.025) 0%, transparent 60%)',
      ].join(', ')
    : [
        'radial-gradient(ellipse 90% 52% at 50% -10%, rgba(255,255,255,0.70) 0%, transparent 54%)',
        'radial-gradient(ellipse 48% 36% at 96% -2%, rgba(255,255,255,0.45) 0%, transparent 50%)',
        'radial-gradient(ellipse 60% 44% at 50% 112%, rgba(0,0,0,0.03) 0%, transparent 60%)',
      ].join(', ');

  const [homeTab, setHomeTab]           = useState<HomeTab>('para_voce');
  const [heroIdx, setHeroIdx]           = useState(0);
  const [newsItems, setNewsItems]       = useState<NewsPost[]>([]);
  const [customSlider, setCustomSlider] = useState<SliderItem[]>([]);
  const [watchingItems, setWatchingItems] = useState<WatchingItem[]>([]);
  const [heroTitles, setHeroTitles]     = useState<Record<number, string>>({});
  const [trendFilter, setTrendFilter]   = useState<'series' | 'movies'>('series');
  const [novFilter, setNovFilter]       = useState<'series' | 'movies'>('series');
  const [trendLimit, setTrendLimit]     = useState(10);
  const [novLimit, setNovLimit]         = useState(10);
  const [homeSections, setHomeSections] = useState(DEFAULT_PRO_HOME_SECTIONS);
  const [recommendations, setRecommendations] = useState<PersonalizedRecommendations | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [recommendationRevision, setRecommendationRevision] = useState(0);

  const heroScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [textlessPosters, setTextlessPosters] = useState<Record<string, string | null>>({});
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  /* ── init: custom slider + offline-only notification fallback ── */
  useEffect(() => {
    setCustomSlider(sliderStore.get());
    // Configured installations use the scheduled Firebase worker. Running
    // the same detector in Home would produce a second push for one event.
    if (firebaseConfigured) return;
    const initial = setTimeout(() => { checkUpcomingReleases().catch(() => {}); }, 4000);
    const interval = setInterval(() => { checkUpcomingReleases().catch(() => {}); }, 30 * 60 * 1000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) { setHomeSections(DEFAULT_PRO_HOME_SECTIONS); return; }
    const refresh = () => {
      const isProMember = profileStore.get(user.uid).proMember === true;
      setHomeSections(isProMember ? proSettingsStore.get(user.uid).homeSections : DEFAULT_PRO_HOME_SECTIONS);
      if (!isProMember) return;
      const reminderSettings = syncProReminderNotifications(user.uid);
      if (reminderSettings && firebaseConfigured) {
        dbProSettingsStore.set(getDB(), user.uid, reminderSettings).catch(() => {});
      }
    };
    refresh();
    window.addEventListener('maratonou:pro', refresh);
    window.addEventListener('maratonou:sync', refresh);
    return () => {
      window.removeEventListener('maratonou:pro', refresh);
      window.removeEventListener('maratonou:sync', refresh);
    };
  }, [user?.uid]);

  const showSection = (section: ProHomeSectionKey) => homeSections[section] !== false;

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
            title: detail?.name || detail?.title || item.title,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

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

  /* ── recommendations inferred from what this user actually watches ── */
  useEffect(() => {
    const refresh = () => setRecommendationRevision((revision) => revision + 1);
    window.addEventListener('maratonou:sync', refresh);
    return () => window.removeEventListener('maratonou:sync', refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRecommendationsLoading(true);

    const watching = listStore.get('watching');
    const watched = listStore.get('watched');
    const excluded = [
      ...listStore.get('want'),
      ...watching,
      ...watched,
      ...listStore.get('favorites'),
    ];

    getPersonalizedRecommendations({
      watching,
      watched,
      excluded,
      episodeHistory: epWatchedStore.getAll(),
    }).then((personalized) => {
      if (!cancelled) setRecommendations(personalized);
    }).catch(() => {
      if (!cancelled) setRecommendations(null);
    }).finally(() => {
      if (!cancelled) setRecommendationsLoading(false);
    });

    return () => { cancelled = true; };
  }, [user?.uid, i18n.language, recommendationRevision]);

  const recommendedSeries = recommendations?.tv.length ? recommendations.tv : topRatedTV?.results;
  const recommendedMovies = recommendations?.movie.length ? recommendations.movie : topRatedMov?.results;
  const recommendedSeriesLoading = recommendationsLoading || (!recommendedSeries && lTRTV);
  const recommendedMoviesLoading = recommendationsLoading || (!recommendedMovies && lTRM);

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

  /* ── one fetch per hero: localized title + textless poster together ──
     The old poster fetch packed "?include_image_language=null" INSIDE the
     endpoint param — the API's endpoint allowlist rejects "?"/"=" in the
     path, so every hero poster came back 400 and the slider fell back to
     localized art. append_to_response also halves the request count. */
  useEffect(() => {
    if (heroes.length === 0) return;
    const lang = i18n.language || 'pt-BR';
    heroes.forEach(async (item) => {
      const posterKey = `${item.type}_${item.id}`;
      const cacheKey = `${item.type}_${item.id}_${lang}`;
      const hit = heroMetaCache.get(cacheKey);
      if (hit) {
        if (hit.title) setHeroTitles(prev => ({ ...prev, [item.id]: hit.title! }));
        setTextlessPosters(prev => ({ ...prev, [posterKey]: normalizeTMDBImageUrl(hit.textless) }));
        return;
      }
      try {
        const data = await fetch(
          `/api/tmdb?endpoint=/${item.type}/${item.id}&language=${lang}&append_to_response=images&include_image_language=null`
        ).then(r => r.json());
        const title: string | null = data?.title || data?.name || null;
        const found = (data?.images?.posters || []).find((p: any) => p.iso_639_1 === null);
        const textless = found ? tmdbImg(found.file_path, 'w780') : null;
        heroMetaCache.set(cacheKey, { title, textless });
        if (title) setHeroTitles(prev => ({ ...prev, [item.id]: title }));
        setTextlessPosters(prev => ({ ...prev, [posterKey]: textless }));
      } catch {
        setTextlessPosters(prev => ({ ...prev, [posterKey]: null }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroes, i18n.language]);

  const openTitle = useCallback((item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  }, [router]);


  return (
    <Frame>
      <Screen style={{ background: 'var(--c-bg)' }}>
        <div
          ref={mainScrollRef}
          onScroll={() => {
            const el = mainScrollRef.current;
            if (!el) return;
            setScrollRatio(Math.min(el.scrollTop / 80, 1));
          }}
          style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}>

          {/* ── Sticky header + tabs ── */}
          {(() => {
            const pV  = 8  - scrollRatio * 2;   // padding vertical: 8 → 6px
            const pH  = 16 - scrollRatio * 3;   // padding horizontal: 16 → 13px
            const fs  = 14 - scrollRatio * 1;   // font-size: 14 → 13px
            const menuHeight = 36 - scrollRatio * 2; // altura: 36 → 34px
            const pbRow = 12 - scrollRatio * 4; // row bottom padding: 12 → 8px
            return (
              <div style={{ position: 'sticky', top: 0, zIndex: 50, flexShrink: 0, overflow: 'visible', paddingTop: 'var(--safe-area-top)' } as React.CSSProperties}>
                {[{ blur: 22, end: 35 }, { blur: 14, end: 60 }, { blur: 7, end: 80 }, { blur: 3, end: 95 }].map(({ blur, end }, i) => (
                  <div key={i} style={{ position: 'absolute', inset: 0, backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: `linear-gradient(to bottom, black 0%, transparent ${end}%)`, WebkitMaskImage: `linear-gradient(to bottom, black 0%, transparent ${end}%)`, pointerEvents: 'none' } as React.CSSProperties} />
                ))}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(13,13,15,0.85) 0%, rgba(13,13,15,0.40) 70%, transparent 100%)', pointerEvents: 'none' }} />
                {/* Logo row */}
                <div style={{ position: 'relative', zIndex: 2, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
                  <div style={{ width: 76 }} />
                  <img src="/logo_dark.png" alt="Maratonou" style={{ height: 22, width: 'auto' }} />
                  <div style={{ width: 76, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <button aria-label="Notificações" onClick={() => router.push('/notifications')}
                      style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                      <Icon name="bell" size={16} color="#fff" />
                    </button>
                  </div>
                </div>
                {/* Tabs row — encolhe ao rolar */}
                <div style={{ position: 'relative', zIndex: 2, padding: `0 16px ${pbRow}px`, display: 'flex', gap: 6 }}>
                  {(['para_voce','em_alta','novidades'] as const).map((id) => (
                    <button key={id} onClick={() => setHomeTab(id)} style={{
                      padding: `${pV}px ${pH}px`, minHeight: menuHeight, borderRadius: 20, flexShrink: 0,
                      background: homeTab === id ? T.pillActiveBg : 'rgba(255,255,255,0.12)',
                      border: homeTab === id ? `1px solid ${T.pillActiveBorder}` : '1px solid rgba(255,255,255,0.22)',
                      color: homeTab === id ? T.pillActiveText : '#fff',
                      fontSize: fs, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Area','Inter',sans-serif",
                      backdropFilter: 'blur(24px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                      boxShadow: homeTab === id ? '0 2px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,1)' : '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
                    } as React.CSSProperties}>{t(`tabs.${id}`)}</button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Hero Section — slider só em Para você ── */}
          {homeTab === 'para_voce' && showSection('hero') ? (() => {
            const CARD_H = isDesktop ? 580 : 460;
            return (
              <div className="hero-slider-wrap" style={{ position: 'relative', height: CARD_H, marginTop: -100, borderRadius: isDark ? 0 : '0 0 28px 28px', overflow: isDark ? 'visible' : 'hidden' }}>

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
                        // Desktop: usa backdrop diretamente (sem textless)
                        // Mobile: textless poster com fallback para poster padrão
                        const posterKey = `${item.type}_${item.id}`;
                        const fetchDone = Object.prototype.hasOwnProperty.call(textlessPosters, posterKey);
                        const textless = fetchDone ? normalizeTMDBImageUrl(textlessPosters[posterKey]) : null;
                        const imgUrl = isDesktop
                          ? (tmdbImg(item.backdrop_path, 'original') ?? tmdbImg(item.poster_path, 'w780'))
                          : fetchDone
                            ? (textless ?? tmdbImg(item.poster_path, 'w780') ?? tmdbImg(item.backdrop_path, 'w780'))
                            : null;
                        return (
                          <div
                            key={`${item.type}-${item.id}`}
                            onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                            style={{ width: '100%', flexShrink: 0, height: '100%', overflow: 'hidden', position: 'relative', cursor: 'pointer', scrollSnapAlign: 'start', background: '#0a0a0c' }}
                          >
                            {/* Background image — só aparece após fetch concluir, com fade-in */}
                            {imgUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imgUrl} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: isDesktop ? 'center center' : 'center top', display: 'block', animation: 'heroFadeIn 0.4s ease forwards' }} />
                            )}
                            {/* Gradient escuro de baixo para cima */}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 50%, transparent 80%)', zIndex: 1 }} />
                            {/* Fade cor da página — apenas no dark mode */}
                            {isDark && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 150, background: 'linear-gradient(to bottom, transparent 0%, var(--c-bg) 100%)', pointerEvents: 'none', zIndex: 2 }} />}
                            {/* Título + botões */}
                            <div style={{ position: 'absolute', bottom: 52, left: 16, right: 16, zIndex: 3 }}>
                              <Txt size={32} weight={900} color="#fff"
                                style={{ display: 'block', lineHeight: 1.05, letterSpacing: -1, marginBottom: 14, textShadow: '0 2px 20px rgba(0,0,0,0.7)', fontFamily: "'Greed','Area',sans-serif" } as React.CSSProperties}>
                                {heroTitles[item.id] ?? item.title}
                              </Txt>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={(e) => { e.stopPropagation(); router.push(`/title/${item.type}/${item.id}`); }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 24, background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,1)' } as React.CSSProperties}>
                                  <Icon name="plus" size={13} color="#0a0a0a" />
                                  <Txt size={13} weight={700} color="#0a0a0a">{t('addToList')}</Txt>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); router.push(`/title/${item.type}/${item.id}`); }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 24, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.25)' } as React.CSSProperties}>
                                  <Icon name="star" size={13} color="#fff" />
                                  <Txt size={13} weight={600} color="#fff">{t('rate')}</Txt>
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

              </div>
            );
          })() : null}

          {/* ══════════════════════════════════════════════
              TAB: Para você
             ══════════════════════════════════════════════ */}
          {homeTab === 'para_voce' && (
            <>
              {/* ── Content below hero ── */}
              <div style={{ background: 'var(--c-bg)', paddingTop: 12 }}>

              <AppBannerSlot page="home" />


              {/* ── Minha lista (watching series) ── */}
              {showSection('watching') && <div style={{ margin: '0 16px 28px' }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Txt size={22} weight={800} style={{ fontStretch: 'condensed' } as React.CSSProperties}>{t('sections.myList')}</Txt>
                  <button
                    onClick={() => router.push('/series')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Txt size={13} weight={700} color={T.pink}>{t('sections.seeAll')}</Txt>
                    <Icon name="chevronR" size={14} color={T.pink} />
                  </button>
                </div>

                {watchingItems.length === 0 ? (
                  <div style={{ padding: '20px 16px', borderRadius: 16, background: T.card, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                    <Icon name="tv" size={28} color={T.t3} />
                    <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.4 }}>
                      {t('emptyWatchingDetail')}
                    </Txt>
                    <button
                      onClick={() => router.push('/search')}
                      style={{ padding: '8px 20px', borderRadius: 20, background: T.pink, border: 'none', cursor: 'pointer' }}>
                      <Txt size={13} weight={700} color="#fff">{t('explore')}</Txt>
                    </button>
                  </div>
                ) : isDesktop ? (
                  /* ── Desktop: horizontal scroll row with large backdrop cards ── */
                  <div style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4, scrollSnapType: 'x mandatory' } as React.CSSProperties}>
                    {watchingItems.map((item) => {
                      const thumbUrl = tmdbImg(item.backdrop_path, 'w780') ?? tmdbImg(item.poster_path, 'w342') ?? undefined;
                      const tagStyles: Record<WatchingTag, { bg: string; color: string; label: string }> = {
                        em_breve:      { bg: '#D92FFF',  color: '#fff', label: t('tags.em_breve') },
                        novo:          { bg: '#CCFF84',  color: '#000', label: t('tags.novo') },
                        nao_assistido: { bg: '#FB772D',  color: '#fff', label: t('tags.nao_assistido') },
                        atrasado:      { bg: '#e0352b',  color: '#fff', label: t('tags.atrasado') },
                      };
                      const epLabel = item.tag === 'em_breve' && item.nextSeason && item.nextEpisode
                        ? `T${item.nextSeason} · Ep ${item.nextEpisode}`
                        : item.lastSeason && item.lastEpisode
                          ? `T${item.lastSeason} · Ep ${item.lastEpisode}`
                          : t('watching');
                      return (
                        <button
                          key={item.id}
                          onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                          style={{ flexShrink: 0, width: 280, background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, cursor: 'pointer', textAlign: 'left', padding: 0, overflow: 'hidden', scrollSnapAlign: 'start' }}>
                          {/* Backdrop image */}
                          <div style={{ width: '100%', height: 157, background: T.surface2, position: 'relative', overflow: 'hidden' }}>
                            {thumbUrl
                              ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={32} color={T.t4} /></div>
                            }
                            {/* Tag overlay */}
                            {item.tag && (
                              <span style={{ position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: 7, background: tagStyles[item.tag].bg }}>
                                <Txt size={10} weight={800} color={tagStyles[item.tag].color} style={{ letterSpacing: '0.4px', lineHeight: 1 }}>{tagStyles[item.tag].label}</Txt>
                              </span>
                            )}
                          </div>
                          {/* Info */}
                          <div style={{ padding: '12px 14px 14px' }}>
                            <Txt size={15} weight={800} color={T.t1} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 5 }}>{item.title}</Txt>
                            <Txt size={13} color={T.t3}>{epLabel}</Txt>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Mobile: vertical list ── */
                  <div className="home-watching-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {watchingItems.map((item) => {
                      const thumbUrl = tmdbImg(item.backdrop_path, 'w342') ?? tmdbImg(item.poster_path, 'w342') ?? undefined;
                      const tagStyles: Record<WatchingTag, { bg: string; color: string; label: string }> = {
                        em_breve:      { bg: '#D92FFF', color: '#fff', label: t('tags.em_breve') },
                        novo:          { bg: '#CCFF84', color: '#000', label: t('tags.novo') },
                        nao_assistido: { bg: '#FB772D', color: '#fff', label: t('tags.nao_assistido') },
                        atrasado:      { bg: '#e0352b', color: '#fff', label: t('tags.atrasado') },
                      };
                      const seasonNumber = item.tag === 'em_breve' && item.nextSeason
                        ? item.nextSeason
                        : item.lastSeason;
                      const episodeNumber = item.tag === 'em_breve' && item.nextEpisode
                        ? item.nextEpisode
                        : item.lastEpisode;
                      return (
                        <button
                          key={item.id}
                          onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                          style={{ width: '100%', minHeight: 101, display: 'flex', alignItems: 'stretch', gap: 14, padding: 0, overflow: 'hidden', background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                          {/* Landscape thumbnail */}
                          <div style={{ width: 148, minHeight: 101, overflow: 'hidden', flexShrink: 0, background: T.surface2, position: 'relative' }}>
                            {thumbUrl
                              ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={22} color={T.t4} /></div>
                            }
                            {item.tag && (
                              <span style={{ position: 'absolute', left: 10, bottom: 9, display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 999, background: tagStyles[item.tag].bg, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
                                <Txt size={9} weight={800} color={tagStyles[item.tag].color} style={{ letterSpacing: '0.4px', lineHeight: 1 }}>{tagStyles[item.tag].label}</Txt>
                              </span>
                            )}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0, padding: '14px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <Txt size={15} weight={800} color={T.t1} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>{item.title}</Txt>
                            {seasonNumber && episodeNumber ? (
                              <Txt size={12} weight={400} color={T.t2} style={{ display: 'block', lineHeight: 1.35 }}>
                                {t('season', { number: seasonNumber, ns: 'title' })} · {t('episode', { number: episodeNumber, ns: 'title' })}
                              </Txt>
                            ) : (
                              <Txt size={12} weight={400} color={T.t2} style={{ display: 'block' }}>{t('watching')}</Txt>
                            )}
                          </div>
                          <Icon name="chevronR" size={16} color={T.t4} style={{ alignSelf: 'center', marginRight: 14 }} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>}

              {/* ── Séries recomendadas ── */}
              {showSection('recommendedSeries') && <HomeSectionGrid title={t('sections.recommendedSeries')} items={recommendedSeries} loading={recommendedSeriesLoading} loadMoreLabel={t('loadMore')} onItem={openTitle} />}

              {/* ── Filmes recomendados ── */}
              {showSection('recommendedMovies') && <HomeSectionGrid title={t('sections.recommendedMovies')} items={recommendedMovies} loading={recommendedMoviesLoading} loadMoreLabel={t('loadMore')} onItem={openTitle} />}

              {/* ── Streamings ── */}
              {showSection('streamings') && <div style={{ marginBottom: 28 }}>
                <Txt size={22} weight={800} style={{ display: 'block', paddingLeft: 16, marginBottom: 14, fontStretch: 'condensed' } as React.CSSProperties}>
                  {t('streamings')}
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
                      className="stream-card"
                      style={{
                        flexShrink: 0, scrollSnapAlign: 'start',
                        width: 174, height: 122,
                        borderRadius: 18, cursor: 'pointer',
                        position: 'relative', overflow: 'hidden',
                        background: scBg,
                        backdropFilter: 'blur(28px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                        border: scBorder,
                        boxShadow: scShadow,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-start', justifyContent: 'flex-end',
                        padding: '14px 16px',
                        textAlign: 'left',
                      } as React.CSSProperties}
                    >
                      {/* Reflexo especular */}
                      <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        background: scSpecular,
                      }} />
                      {/* Textura granulada */}
                      <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        opacity: 0.05, mixBlendMode: 'overlay',
                        backgroundImage: STREAM_NOISE, backgroundSize: '160px 160px',
                      } as React.CSSProperties} />
                      {/* Logo da plataforma */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={isDark ? `/${p.logo}_logo.png` : `/${p.logo}_logo_black.png`}
                        alt={p.name}
                        style={{
                          position: 'absolute', top: 14, right: 16, zIndex: 1,
                          height: 30, width: 'auto', maxWidth: 74,
                          objectFit: 'contain', objectPosition: 'right center',
                        }}
                      />
                      {/* Nome */}
                      <span className="stream-name" style={{
                        fontSize: 15, fontWeight: 800, color: scNameColor,
                        fontFamily: "'Area',sans-serif", lineHeight: 1.2,
                        display: 'block', position: 'relative', zIndex: 1,
                      }}>
                        {p.name}
                      </span>
                      {/* Sub */}
                      <span className="stream-sub" style={{
                        fontSize: 11, color: scSubColor,
                        fontFamily: "'Area',sans-serif", marginTop: 3,
                        display: 'flex', alignItems: 'center', gap: 3,
                        position: 'relative', zIndex: 1,
                      }}>
                        {t('streamingTrending')} <Icon name="chevronR" size={9} color={scSubColor} />
                      </span>
                    </button>
                  ))}
                  <div style={{ width: 8, flexShrink: 0 }} />
                </div>
              </div>}

              {/* ── Fique por dentro (news) ── */}
              {showSection('news') && newsItems.length > 0 && (
                <div style={{ background: T.card, padding: '20px 16px 24px', marginBottom: 8 }}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <Txt size={22} weight={800} style={{ fontStretch: 'condensed' } as React.CSSProperties}>{t('keepUpToDate')}</Txt>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/api/news-image?path=%2Fwp-content%2Fuploads%2F2025%2F01%2Fsec_logo_20252.png"
                      alt="Séries em Cena"
                      style={{ height: 22, width: 'auto', objectFit: 'contain' }}
                    />
                  </div>

                  {/* ── Mobile layout (featured + lista) ── */}
                  <div className="news-mobile">
                    {newsItems[0] && (
                      <a href={newsItems[0].link} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'block', position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9', background: T.surface2, textDecoration: 'none', marginBottom: 12 }}>
                        {newsItems[0].image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={newsItems[0].image} alt={newsItems[0].title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        )}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.88) 100%)' }} />
                        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14 }}>
                          <Txt size={17} weight={800} color="#fff"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35 } as React.CSSProperties}>
                            {newsItems[0].title}
                          </Txt>
                        </div>
                      </a>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {newsItems.slice(1, 5).map((post, idx) => (
                        <div key={post.id}>
                          {idx > 0 && <div style={{ height: 1, background: T.border, marginLeft: 120 }} />}
                          <a href={post.link} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', gap: 14, alignItems: 'center', textDecoration: 'none', padding: '14px 0' }}>
                            <div style={{ width: 106, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
                              {post.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={post.image} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              )}
                            </div>
                            <Txt size={14} weight={700} color={T.t1}
                              style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4, flex: 1 } as React.CSSProperties}>
                              {post.title}
                            </Txt>
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Desktop layout: grid 2 colunas × 3 linhas ── */}
                  <div className="news-desktop">
                    {newsItems.slice(0, 6).map((post) => (
                      <a key={post.id} href={post.link} target="_blank" rel="noopener noreferrer" className="news-desktop-card" style={{ textDecoration: 'none' }}>
                        <div className="news-desktop-img">
                          {post.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={post.image} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          )}
                        </div>
                        <p className="news-desktop-title">{post.title}</p>
                      </a>
                    ))}
                  </div>

                  {/* Ver mais button */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                    <a href="https://seriesemcena.com.br" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '10px 24px', borderRadius: 24, background: T.bg, border: `1px solid ${T.border}` }}>
                      <Txt size={13} weight={700} color={T.t2}>{t('seeMoreNews')}</Txt>
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
                  <button key={f} className="home-filter-btn" onClick={() => { setTrendFilter(f); setTrendLimit(10); }} style={{
                    padding: '8px 20px', borderRadius: 24, flexShrink: 0,
                    background: trendFilter === f
                      ? T.pillActiveBg
                      : (isDark ? T.surface2 : '#fff'),
                    border: trendFilter === f
                      ? 'none'
                      : (isDark ? `1px solid ${T.border}` : '1px solid rgba(0,0,0,0.11)'),
                    color: trendFilter === f ? T.pillActiveText : (isDark ? T.t2 : 'rgba(0,0,0,0.55)'),
                    fontSize: 13, fontWeight: 700,
                    fontFamily: "'Area','Inter',sans-serif",
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {t(`filter.${f}`)}
                  </button>
                ))}
              </div>
              {trendFilter === 'series'
                ? <HomeSectionGrid items={trendTV?.results}     loading={lTTV} limit={trendLimit} loadMoreLabel={t('loadMore')} onItem={openTitle} onLoadMore={() => setTrendLimit(l => l + 10)} />
                : <HomeSectionGrid items={trendMovies?.results} loading={lTM}  limit={trendLimit} loadMoreLabel={t('loadMore')} onItem={openTitle} onLoadMore={() => setTrendLimit(l => l + 10)} />
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
                  <button key={f} className="home-filter-btn" onClick={() => { setNovFilter(f); setNovLimit(10); }} style={{
                    padding: '8px 20px', borderRadius: 24, flexShrink: 0,
                    background: novFilter === f
                      ? T.pillActiveBg
                      : (isDark ? T.surface2 : '#fff'),
                    border: novFilter === f
                      ? 'none'
                      : (isDark ? `1px solid ${T.border}` : '1px solid rgba(0,0,0,0.11)'),
                    color: novFilter === f ? T.pillActiveText : (isDark ? T.t2 : 'rgba(0,0,0,0.55)'),
                    fontSize: 13, fontWeight: 700,
                    fontFamily: "'Area','Inter',sans-serif",
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {t(`filter.${f}`)}
                  </button>
                ))}
              </div>
              {novFilter === 'series'
                ? <HomeSectionGrid items={onAir?.results}      loading={lOA} limit={novLimit} loadMoreLabel={t('loadMore')} onItem={openTitle} onLoadMore={() => setNovLimit(l => l + 10)} />
                : <HomeSectionGrid items={nowPlaying?.results} loading={lNP} limit={novLimit} loadMoreLabel={t('loadMore')} onItem={openTitle} onLoadMore={() => setNovLimit(l => l + 10)} />
              }
            </div>
          )}

          <div style={{ height: 24, background: 'var(--c-bg)' }} />
        </div>
      </Screen>
    </Frame>
  );
}

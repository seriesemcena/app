'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAppSettings } from '@/context/AppSettingsContext';
import { Frame } from '@/components/Frame';
import { Screen, Txt, Btn, MetaChip, Toast, BottomSheet, Stars } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBBackdrop, TMDBPersonPhoto, TMDBPosterCard, ImgWithSkeleton } from '@/components/posters';
import { StreamCircle } from '@/components/primitives';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, useTMDB } from '@/lib/tmdb';
import { navigateBack } from '@/lib/navigation';
import { AppErrorState } from '@/components/AppStates';
import { listStore, revStore, profileStore, epWatchedStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRevStore, dbListStore, dbActivityStore, dbEpWatchedStore, dbRatingSummaryStore, type RatingSummary } from '@/lib/db';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

const EMOJI_GROUPS = [
  { label: '😀', emojis: ['😀','😂','🤣','😍','🥰','😎','🤩','😱','😭','😤','🙄','🤔','😴','🤯','🥳'] },
  { label: '❤️', emojis: ['❤️','🔥','⭐','💯','👏','🎬','🍿','📺','🎥','🏆','💀','✨','💫','🎭','🎞️'] },
  { label: '👍', emojis: ['👍','👎','🤌','💪','🙏','👀','🫣','🤦','🤷','💁','🫡','🫶','🤟','✌️','🤞'] },
];

type GiphyGif = {
  id: string;
  title: string;
  images: {
    fixed_height_small: { url: string; width: string; height: string };
    downsized_small:     { mp4: string };
  };
};

export default function TitleDetailPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { settings: appSettings } = useAppSettings();
  const isDark = theme === 'dark';
  const { user } = useAuth();
  const params = useParams<{ type: string; id: string }>();
  const isTV = params.type === 'tv';
  const id = params.id;
  const itemKey = `${params.type}_${id}`;

  const { t } = useTranslation('title');
  type Tab = 'about' | 'episodes' | 'whereToWatch' | 'reviews';
  const [tab, setTab] = useState<Tab>(params.type === 'tv' ? 'episodes' : 'about');
  const [isFav, setIsFav] = useState(false);

  // Status icon: determina qual ícone mostrar no canto do hero
  type StatusKey = 'atrasado' | 'watching' | 'favorites' | 'want' | null;
  const [statusKey, setStatusKey] = useState<StatusKey>(null);
  type ListStatus = 'want' | 'watching' | 'watched' | null;
  const [listStatus, setListStatus] = useState<ListStatus>(null);
  const [toast, setToast] = useState<string | false>(false);
  const [listSheet, setListSheet] = useState(false);
  const [maisSheet, setMaisSheet] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [episodeRatings, setEpisodeRatings] = useState<Review[]>([]);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [selectedGif, setSelectedGif]   = useState<GiphyGif | null>(null);
  const [showGif, setShowGif]           = useState(false);
  const [gifSearch, setGifSearch]       = useState('');
  const [gifResults, setGifResults]     = useState<GiphyGif[]>([]);
  const [gifLoading, setGifLoading]     = useState(false);
  const [showEmoji, setShowEmoji]       = useState(false);
  const [emojiTab, setEmojiTab]         = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [epWatchedRefresh, setEpWatchedRefresh] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reviewTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showNavTitle, setShowNavTitle] = useState(false);

  // Load reviews: localStorage first, then Firestore for cross-device sync
  useEffect(() => {
    const local = revStore.get(itemKey);
    setReviews(local);
    setEpisodeRatings(isTV ? revStore.getByPrefix(`ep_${id}_`).filter((review) => review.rating > 0) : []);
    if (!firebaseConfigured) return;
    const summaryRequest = isTV
      ? dbRatingSummaryStore.getSeries(getDB(), id)
      : dbRatingSummaryStore.get(getDB(), itemKey);
    summaryRequest.then(setRatingSummary).catch(() => {});
    dbRevStore.get(getDB(), itemKey).then(cloud => {
      if (cloud.length > 0) {
        const cloudIds = new Set(cloud.map(r => r.id));
        const onlyLocal = local.filter(r => !cloudIds.has(r.id));
        const merged = [...onlyLocal, ...cloud];
        setReviews(merged);
        revStore.set(itemKey, merged);
      }
    }).catch(() => {});
  }, [id, isTV, itemKey]);

  /* ── Giphy (movie reviews only) ── */
  useEffect(() => {
    if (!showGif || !showForm || isTV) return;
    const delay = gifSearch ? 400 : 0;
    const timer = setTimeout(async () => {
      setGifLoading(true);
      try {
        const res  = await fetch(`/api/giphy?q=${encodeURIComponent(gifSearch)}&limit=15`);
        const data = await res.json();
        setGifResults(data.data || []);
      } catch {}
      setGifLoading(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [gifSearch, showGif, showForm, isTV]);

  const { data: detail, loading, error, retry } = useTMDB(
    () => tmdb.titleDetail(isTV ? 'tv' : 'movie', id),
    [id, isTV]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => setShowNavTitle(el.scrollTop > 360);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [loading]);

  // Status icon — MUST be before early return to respect Rules of Hooks
  const readListStatus = useCallback(() => {
    if (!detail) return;
    const iid = detail.id as number;
    const isWatching = listStore.get('watching').some((i) => i.id === iid);
    const isFavorite = listStore.get('favorites').some((i) => i.id === iid);
    const isWant     = listStore.get('want').some((i) => i.id === iid);
    const isWatched  = listStore.get('watched').some((i) => i.id === iid);
    setIsFav(isFavorite);
    // listStatus button
    if (isWatched)       setListStatus('watched');
    else if (isWatching) setListStatus('watching');
    else if (isWant)     setListStatus('want');
    else                 setListStatus(null);
    // statusKey badge
    if (isWatching) {
      const lastAir = (detail as any).last_episode_to_air?.air_date;
      if (lastAir) {
        const diff = (Date.now() - new Date(lastAir + 'T00:00:00').getTime()) / 86_400_000;
        if (diff > 30) { setStatusKey('atrasado'); return; }
      }
      setStatusKey('watching'); return;
    }
    if (isFavorite) { setStatusKey('favorites'); return; }
    if (isWant)     { setStatusKey('want'); return; }
    setStatusKey(null);
  }, [detail]);

  useEffect(() => { readListStatus(); }, [readListStatus]);

  // Re-read after Firestore sync (new session / other device)
  useEffect(() => {
    window.addEventListener('maratonou:sync', readListStatus);
    return () => window.removeEventListener('maratonou:sync', readListStatus);
  }, [readListStatus]);

  if (loading) {
    return (
      <Frame>
        <Screen>
          <div style={{ height: 320, background: T.card }} />
          <div style={{ padding: 16 }}>
            <div style={{ height: 24, width: '60%', background: T.surface2, borderRadius: 4, marginBottom: 12 }} />
            <div style={{ height: 14, width: '90%', background: T.surface, borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 14, width: '80%', background: T.surface, borderRadius: 4 }} />
          </div>
        </Screen>
      </Frame>
    );
  }

  if (error || !detail) {
    return (
      <Frame>
        <Screen>
          <AppErrorState
            title="Não foi possível carregar este título"
            message="Confira sua conexão e tente novamente."
            onRetry={retry}
          />
        </Screen>
      </Frame>
    );
  }

  const title: string = detail.title || detail.name || '';
  const overview: string = detail.overview || t('overviewFallback');
  const genre: string = detail.genres?.[0]?.name || '';
  const rating: string = detail.vote_average ? detail.vote_average.toFixed(1) : '';
  const runtime: string = detail.runtime ? `${detail.runtime}Min` : detail.episode_run_time?.[0] ? `${detail.episode_run_time[0]}Min` : '';
  const cast = (detail.credits?.cast || []).slice(0, 12);
  const crew = (detail.credits?.crew || []).filter((c: any) => ['Director', 'Creator'].includes(c.job)).slice(0, 3);
  const similar = (detail.similar?.results || []).slice(0, 8);
  const textlessPosterPath = detail.images?.posters?.find(
    (image: { iso_639_1: string | null; file_path: string }) => image.iso_639_1 === null,
  )?.file_path;
  const heroPosterPath = textlessPosterPath || detail.poster_path || detail.backdrop_path;
  const seasons: number[] = (detail.seasons || []).map((s: any) => s.season_number).filter((n: number) => n > 0);
  // Default to last/latest season
  const activeSeason = selectedSeason ?? seasons[seasons.length - 1] ?? 1;

  // Tabs
  const tabs: Tab[] = [
    ...(isTV ? (['episodes'] as Tab[]) : []),
    'about',
    ...(!isTV ? (['reviews'] as Tab[]) : []),
    'whereToWatch',
  ];

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2500); };
  const openProblemReport = () => {
    setMaisSheet(false);
    setListSheet(false);
    setShowForm(false);
    setShowGif(false);
    setShowEmoji(false);
    setReportTarget({
      kind: 'problem',
      targetId: itemKey,
      titleKey: itemKey,
      targetLabel: title,
    });
  };

  const toggleFav = async () => {
    const item = { id: detail.id, title, type: isTV ? 'tv' : 'movie', poster_path: detail.poster_path };
    if (isFav) {
      listStore.remove('favorites', detail.id);
      showToast(t('removedFromFav'));
      if (firebaseConfigured && user) {
        try { await dbListStore.remove(getDB(), user.uid, 'favorites', detail.id); } catch {}
      }
    } else {
      listStore.add('favorites', item);
      showToast(t('addedToFav'));
      if (firebaseConfigured && user) {
        try { await dbListStore.add(getDB(), user.uid, 'favorites', item); } catch {}
      }
    }
    setIsFav((v) => !v);
  };

  const submitReview = async () => {
    if (!appSettings.reviewsEnabled) { showToast('As avaliações estão temporariamente desativadas.'); return; }
    if (reviewRating === 0 && !reviewText.trim() && !selectedGif) { showToast(t('addRatingOrComment')); return; }
    const prof         = profileStore.get(user?.uid);
    const displayName  = prof.username || prof.name || user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const photoUrl     = user?.photoURL || prof.avatarImage || '';
    const rev: Review = {
      id:      `r_${Date.now()}`,
      user:    displayName,
      uid:     user?.uid || '',
      avatar:  avatarLetter,
      photoUrl,
      rating:  reviewRating * 2,
      text:    reviewText.trim(),
      gifUrl:  selectedGif?.images?.fixed_height_small?.url || '',
      date:    new Date().toISOString(),
      likes: 0, likedBy: [], replies: [],
    };
    const updated = revStore.addReview(itemKey, rev);
    setReviews(updated);
    setReviewText(''); setReviewRating(0); setShowForm(false);
    setSelectedGif(null); setShowGif(false); setShowEmoji(false); setGifSearch('');
    showToast(t('reviewPublished'));
    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), itemKey, rev); } catch {}
    }
  };

  const toggleLike = async (reviewId: string) => {
    if (!user) { showToast('Faça login para curtir.'); return; }
    // Optimistic local update
    const updated = revStore.toggleLike(itemKey, reviewId);
    setReviews([...updated]);
    // Sync to Firestore
    if (firebaseConfigured) {
      try {
        const cloud = await dbRevStore.toggleLike(getDB(), itemKey, reviewId, user.uid);
        if (cloud) { setReviews([...cloud]); revStore.set(itemKey, cloud); }
      } catch {}
    }
  };

  const ratedReviews = reviews.filter((review) => review.rating > 0);
  const locallyRatedReviews = isTV ? episodeRatings : ratedReviews;
  const avgRating = ratingSummary?.total
    ? ratingSummary.average.toFixed(1)
    : locallyRatedReviews.length
      ? (locallyRatedReviews.reduce((sum, review) => sum + review.rating, 0) / locallyRatedReviews.length).toFixed(1)
      : null;
  const totalRatings = ratingSummary?.total || locallyRatedReviews.length;

  return (
    <Frame>
      <Screen>
        {/* ── Floating header — o glass aparece apenas após o scroll ── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40, pointerEvents: 'none',
          opacity: showNavTitle ? 1 : 0,
          transition: 'opacity 0.22s ease',
        }}>
          {/* Camadas de blur progressivo (mais intenso no topo, some embaixo) */}
          {[
            { blur: 24, start: 0,  end: 25  },
            { blur: 16, start: 5,  end: 40  },
            { blur: 8,  start: 20, end: 55  },
            { blur: 4,  start: 40, end: 75  },
            { blur: 2,  start: 60, end: 90  },
            { blur: 1,  start: 80, end: 100 },
          ].map(({ blur, start, end }, i) => (
            <div key={i} style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 110,
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: `linear-gradient(to bottom, black ${start}%, transparent ${end}%)`,
              WebkitMaskImage: `linear-gradient(to bottom, black ${start}%, transparent ${end}%)`,
            } as React.CSSProperties} />
          ))}
          {/* Tint escuro — mais forte no topo */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 110,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.10) 60%, transparent 100%)',
          }} />
        </div>
        {/* Conteúdo do header — por cima das camadas de blur */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 41,
          display: 'flex', alignItems: 'center',
          padding: 'calc(var(--safe-area-top) + 12px) 14px 10px',
          pointerEvents: 'auto',
        }}>
          {/* Botão voltar */}
          <button aria-label="Voltar" onClick={() => navigateBack(router)} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)', flexShrink: 0 } as React.CSSProperties}>
            <Icon name="chevronL" size={16} color="#fff" />
          </button>

          {/* Nav title — aparece ao rolar */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 'calc(100% - 180px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            overflow: 'hidden',
            opacity: showNavTitle ? 1 : 0,
            transform: showNavTitle ? 'translate(-50%, calc(-50% + 3px))' : 'translate(-50%, calc(-50% + 8px))',
            transition: 'opacity 0.22s ease, transform 0.22s ease',
            pointerEvents: 'none',
          } as React.CSSProperties}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'Area','Inter',sans-serif", letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          </div>

          {/* Icons direita */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
            <button aria-label="Compartilhar" onClick={() => { if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ title, url: window.location.href }).catch(() => {}); }} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
              <Icon name="share" size={15} color="#fff" />
            </button>
            <button aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} onClick={toggleFav} style={{ width: 34, height: 34, borderRadius: 17, background: isFav ? 'rgba(192,105,255,0.30)' : 'rgba(255,255,255,0.14)', border: `1px solid ${isFav ? 'rgba(192,105,255,0.45)' : 'rgba(255,255,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
              <Icon name={isFav ? 'heart' : 'heartO'} size={15} color={isFav ? '#C069FF' : '#fff'} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}>

          {/* ── Backdrop hero com título e botões sobrepostos ── */}
          <div style={{ height: 480, position: 'relative', overflow: 'hidden' }}>
            <ImgWithSkeleton
              src={tmdbImg(heroPosterPath, 'w780')}
              alt={title}
              width="100%" height={480}
              objectPosition="center 20%"
              style={{ position: 'absolute', inset: 0 }}
            />
            {/* Gradiente escuro de baixo */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 50%, transparent 80%)', pointerEvents: 'none' }} />
            {/* Fade para cor do fundo */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 140, background: `linear-gradient(to bottom, transparent 0%, ${T.bg} 100%)`, pointerEvents: 'none' }} />

            {/* Título + botões sobrepostos */}
            <div style={{ position: 'absolute', bottom: 20, left: 16, right: 16 }}>
              <h1 style={{ margin: '0 0 14px', fontSize: 34, fontWeight: 900, color: '#fff', lineHeight: 1.05, letterSpacing: -1, fontFamily: "'Greed','Area',sans-serif", textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
                {title}
              </h1>
              {(() => {
                const LIST_META: Record<NonNullable<ListStatus>, { label: string; icon: import('@/lib/tokens').IconName; accent: string; bg: string; border: string }> = {
                  want:     { label: t('wantStatus'),     icon: 'bookmark', accent: '#C069FF', bg: 'rgba(192,105,255,0.22)', border: 'rgba(192,105,255,0.28)' },
                  watching: { label: t('watchingStatus'), icon: 'eye',      accent: '#FF8C00', bg: 'rgba(255,140,0,0.22)',   border: 'rgba(255,140,0,0.28)'   },
                  watched:  { label: t('finishedStatus'), icon: 'check',    accent: '#34D399', bg: 'rgba(52,211,153,0.22)',  border: 'rgba(52,211,153,0.28)'  },
                };
                const meta = listStatus ? LIST_META[listStatus] : null;
                const accent = meta?.accent ?? '#F2F2F5';
                return (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" onClick={() => setListSheet(true)}
                  style={{
                    position: 'relative', isolation: 'isolate', overflow: 'hidden',
                    minWidth: 174, minHeight: 48,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                    padding: '11px 16px 11px 18px', borderRadius: 24, cursor: 'pointer',
                    background: `linear-gradient(145deg, rgba(46,45,51,0.76) 0%, rgba(25,24,29,0.84) 72%, ${accent}0D 100%)`,
                    border: `1px solid ${meta?.border ?? 'rgba(255,255,255,0.26)'}`,
                    backdropFilter: 'blur(24px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                    boxShadow: `0 8px 22px rgba(0,0,0,0.20), 0 0 12px ${accent}12, inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 ${accent}24`,
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  } as React.CSSProperties}>
                  <span aria-hidden style={{
                    position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none',
                    background: `radial-gradient(120% 160% at 100% -20%, ${accent}38 0%, ${accent}12 34%, transparent 68%)`,
                    opacity: 0.56,
                  }} />
                  <span aria-hidden style={{
                    position: 'absolute', top: 0, left: '12%', right: '5%', height: 1, pointerEvents: 'none',
                    background: `linear-gradient(90deg, rgba(255,255,255,0.20), ${accent}70)`,
                    filter: 'blur(0.2px)',
                  }} />
                  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Icon name={meta ? meta.icon : 'plus'} size={15} color={accent} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Area','Inter',sans-serif", whiteSpace: 'nowrap' }}>
                      {meta ? meta.label : t('addToList')}
                    </span>
                  </span>
                  <Icon name="chevronR" size={12} color="rgba(255,255,255,0.68)" />
                </button>
                <button type="button" aria-label="Mais opções" onClick={() => setMaisSheet(true)}
                  style={{
                    position: 'relative', isolation: 'isolate', overflow: 'hidden',
                    width: 48, height: 48, borderRadius: 24, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(145deg, rgba(46,45,51,0.76) 0%, rgba(25,24,29,0.84) 74%, rgba(242,242,245,0.05) 100%)',
                    border: '1px solid rgba(255,255,255,0.26)',
                    cursor: 'pointer',
                    backdropFilter: 'blur(24px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                    boxShadow: '0 8px 22px rgba(0,0,0,0.20), 0 0 12px rgba(242,242,245,0.08), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(242,242,245,0.14)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  } as React.CSSProperties}>
                  <span aria-hidden style={{
                    position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none',
                    background: 'radial-gradient(120% 150% at 100% -15%, rgba(255,255,255,0.24) 0%, rgba(242,242,245,0.08) 36%, transparent 70%)',
                  }} />
                  <span aria-hidden style={{
                    position: 'absolute', top: 0, left: '22%', right: '10%', height: 1, pointerEvents: 'none',
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.42))',
                  }} />
                  <Icon name="plusPlain" size={18} color="#F2F2F5" />
                </button>
              </div>
                );
              })()}
            </div>
          </div>

          {/* ── Info card — overlaps hero ── */}
          <div style={{ margin: '16px 12px 0', background: isDark ? 'var(--c-card-deep)' : '#fff', borderRadius: 20, padding: '18px 18px 20px', position: 'relative', boxShadow: '0 -2px 24px rgba(0,0,0,0.08)' }}>
            {/* Chips: nota do app · genre · runtime */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {/* Nota média do app */}
              {avgRating ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: '#FFEB13' }}>
                  <Icon name="star" size={11} color="#1a1400" />
                  <Txt size={11} weight={700} color="#1a1400">{avgRating}/10</Txt>
                  <Txt size={10} weight={500} color="#1a1400" style={{ opacity: 0.6 }}>({totalRatings})</Txt>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: T.surface2 }}>
                  <Icon name="star" size={11} color={T.t3} />
                  <Txt size={11} weight={600} color={T.t3}>{t('noRating')}</Txt>
                </span>
              )}
              {genre && (
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 8, background: T.surface2 }}>
                  <Txt size={11} weight={600} color={T.t2}>{genre}</Txt>
                </span>
              )}
              {runtime && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: T.surface2 }}>
                  <Txt size={11} weight={600} color={T.t2}>⏱ {runtime}</Txt>
                </span>
              )}
            </div>
            {/* Description */}
            {!expanded && overview.length > 140 ? (
              <>
                <div style={{ position: 'relative', overflow: 'hidden', maxHeight: '4.8em' }}>
                  <Txt size={13} color={T.t2} style={{ lineHeight: 1.7, display: 'block' }}>{overview}</Txt>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2em', background: isDark ? 'linear-gradient(to bottom, transparent, var(--c-card-deep))' : 'linear-gradient(to bottom, transparent, #fff)', pointerEvents: 'none' }} />
                </div>
                <button onClick={() => setExpanded(true)} style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Txt size={13} weight={700} color={T.t2}>{t('readMore')}</Txt>
                </button>
              </>
            ) : (
              <>
                <Txt size={13} color={T.t2} style={{ lineHeight: 1.7, display: 'block' }}>{overview}</Txt>
                {overview.length > 140 && (
                  <button onClick={() => setExpanded(false)} style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Txt size={13} weight={700} color={T.t2}>{t('readLess')}</Txt>
                  </button>
                )}
              </>
            )}

            {/* ── Progresso da temporada selecionada ── */}
            {isTV && (
              <SeasonProgressPanel
                tvId={id}
                seasonNum={activeSeason}
                fallbackRuntime={Number((detail as any).episode_run_time?.[0]) || 45}
                refreshKey={epWatchedRefresh}
                user={user}
                onChanged={() => setEpWatchedRefresh((value) => value + 1)}
                onToast={showToast}
              />
            )}

          </div>

          {/* ── Tab bar wrapper — position:relative para o dropdown se ancorar aqui ── */}
          <div style={{ position: 'relative', padding: '12px 0 16px' }}>
            {/* Linha scrollável */}
            <div style={{ display: 'flex', gap: 8, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
              {tabs.map((tabKey) => {
                const isActive = tab === tabKey;
                const label = t(`tabs.${tabKey}`);
                const tabBg     = isActive
                  ? T.pillActiveBg
                  : (isDark ? 'rgba(255,255,255,0.06)' : '#fff');
                const tabBorder = isActive
                  ? `1px solid ${T.pillActiveBorder}`
                  : (isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.11)');
                const tabColor  = isActive
                  ? T.pillActiveText
                  : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)');
                return (
                  <button
                    key={tabKey}
                    onClick={() => setTab(tabKey)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '10px 22px', borderRadius: 999, flexShrink: 0,
                      background: tabBg,
                      border: tabBorder,
                      color: tabColor,
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>

          </div>

          {/* ── Tab content ── */}
          <div style={{ padding: '0 16px 16px' }}>

            {/* Episódios */}
            {tab === 'episodes' && isTV && (
              <div>
                {seasons.length > 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <SeasonDropdown
                      seasons={seasons}
                      active={activeSeason}
                      onSelect={(sn) => setSelectedSeason(sn)}
                    />
                  </div>
                )}
                <EpisodeList
                  tvId={id} seasonNum={activeSeason} refreshKey={epWatchedRefresh}
                  showName={title} network={(detail as any).networks?.[0]?.name || ''}
                  onEpisode={(ep: any) => {
                    const p = new URLSearchParams({
                      tvId: id, season: String(activeSeason),
                      epNum: String(ep.episode_number), name: ep.name || '',
                      showName: title, runtime: String(ep.runtime || ''),
                      overview: ep.overview || '', still: ep.still_path || '',
                      network: (detail as any).networks?.[0]?.name || '',
                      airDate: ep.air_date || '',
                    });
                    router.push(`/episode?${p.toString()}`);
                  }}
                />
              </div>
            )}

            {/* Onde assistir */}
            {tab === 'whereToWatch' && (
              <WatchProvidersTab type={isTV ? 'tv' : 'movie'} id={id} onVIP={() => router.push('/pro')} />
            )}

            {/* Avaliações (filmes) */}
            {tab === 'reviews' && !isTV && (
              <MovieReviewsTab
                reviews={reviews}
                avgRating={avgRating}
                totalRatings={ratingSummary?.total ?? ratedReviews.length}
                onAddReview={() => appSettings.reviewsEnabled ? setShowForm(true) : showToast('As avaliações estão temporariamente desativadas.')}
                onViewComments={() => appSettings.commentsEnabled ? router.push(`/comments?key=${encodeURIComponent(itemKey)}&title=${encodeURIComponent(title)}&showName=${encodeURIComponent(title)}`) : showToast('Os comentários estão temporariamente desativados.')}
                onLike={toggleLike}
              />
            )}

            {/* Sobre: elenco + informações + títulos semelhantes */}
            {tab === 'about' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {cast.length > 0 && (
                  <div>
                    <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>{t('cast')}</Txt>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {cast.map((c: any) => (
                        <button key={c.id} onClick={() => router.push(`/actor/${c.id}`)}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 12px', background: 'var(--c-card)', border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'center' }}>
                          <div style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${T.border}` }}>
                            <TMDBPersonPhoto path={c.profile_path} size={60} name={c.name} />
                          </div>
                          <div style={{ width: '100%' }}>
                            <Txt size={13} weight={700} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</Txt>
                            <Txt size={11} color={T.t3} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{c.character}</Txt>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <InformationsTab
                  detail={detail} crew={crew} similar={similar} isTV={isTV}
                  onCrew={(cid: string) => router.push(`/actor/${cid}`)}
                  onSimilar={(s: any) => router.push(`/title/${s.media_type || (isTV ? 'tv' : 'movie')}/${s.id}`)}
                />
              </div>
            )}

          </div>

          <div style={{ height: 100 }} />
        </div>

        <Toast msg={toast} visible={!!toast} />
        <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />

        {/* ── Modal de avaliação (filmes) ── */}
        {showForm && !isTV && reportTarget === null && (
          <>
            <div onClick={() => { setShowForm(false); setShowGif(false); setShowEmoji(false); }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40 }} />
            <div className="safe-bottom-sheet keyboard-aware-bottom" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, background: T.surface, borderRadius: '20px 20px 0 0', overflow: 'hidden', maxHeight: '88%', display: 'flex', flexDirection: 'column' }}>
              {/* handle + title */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, position: 'relative' }}>
                <div style={{ width: 36, height: 4, background: T.t4, borderRadius: 2, position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
                <Txt size={15} weight={700}>{t('rateMovie')}</Txt>
                <button onClick={() => { setShowForm(false); setShowGif(false); setShowEmoji(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Icon name="close" size={18} color={T.t3} />
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 16px 0', flex: 1 }}>
                {/* Star rating */}
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{t('yourRating')}</Txt>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Stars value={reviewRating} max={5} size={36} onChange={setReviewRating} />
                  </div>
                  {reviewRating > 0 && (
                    <Txt size={13} weight={700} color={T.pink} style={{ display: 'block', marginTop: 6 }}>
                      {reviewRating > 0 ? t(`ratingLabel_${reviewRating}`) : ''}
                    </Txt>
                  )}
                </div>

                {/* GIF preview */}
                {selectedGif && (
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <img src={selectedGif.images.fixed_height_small.url} alt={selectedGif.title}
                      style={{ width: '100%', borderRadius: 10, display: 'block', maxHeight: 140, objectFit: 'cover' }} />
                    <button onClick={() => setSelectedGif(null)}
                      style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="close" size={12} color={T.white} />
                    </button>
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  ref={reviewTextareaRef}
                  value={reviewText}
                  onChange={e => setReviewText(e.target.value)}
                  placeholder={t('writeReview')}
                  maxLength={500}
                  rows={4}
                  style={{ width: '100%', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, color: T.white, fontSize: 14, fontFamily: "'Area','Inter',sans-serif", padding: '12px 14px', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 4 }}
                />
                <Txt size={10} color={T.t4} style={{ display: 'block', textAlign: 'right', marginBottom: 12 }}>{reviewText.length}/500</Txt>

                {/* Emoji + GIF buttons */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => { setShowEmoji(s => !s); setShowGif(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, background: showEmoji ? T.pink : T.surface2, border: showEmoji ? 'none' : `1px solid ${T.border}`, cursor: 'pointer' }}>
                    <span style={{ fontSize: 14 }}>😀</span>
                    <Txt size={12} weight={700} color={showEmoji ? '#fff' : T.t2}>Emoji</Txt>
                  </button>
                  <button onClick={() => { setShowGif(s => !s); setShowEmoji(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, background: showGif ? T.pink : T.surface2, border: showGif ? 'none' : `1px solid ${T.border}`, cursor: 'pointer' }}>
                    <Txt size={12} weight={700} color={showGif ? '#fff' : T.t2}>GIF</Txt>
                  </button>
                </div>

                {/* Emoji picker */}
                {showEmoji && (
                  <div style={{ background: T.surface2, borderRadius: 14, border: `1px solid ${T.border}`, padding: 12, marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      {EMOJI_GROUPS.map((g, i) => (
                        <button key={i} onClick={() => setEmojiTab(i)}
                          style={{ fontSize: 18, padding: '4px 8px', borderRadius: 8, background: emojiTab === i ? T.pink : 'transparent', border: 'none', cursor: 'pointer' }}>
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {EMOJI_GROUPS[emojiTab].emojis.map(e => (
                        <button key={e} onClick={() => { setReviewText(t => t + e); setShowEmoji(false); reviewTextareaRef.current?.focus(); }}
                          style={{ fontSize: 22, padding: 6, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* GIF picker */}
                {showGif && (
                  <div style={{ background: T.surface2, borderRadius: 14, border: `1px solid ${T.border}`, padding: 10, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <input value={gifSearch} onChange={e => setGifSearch(e.target.value)} placeholder={t('searchGif')}
                        style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '8px 14px', outline: 'none' }} />
                      <span style={{ fontSize: 11, color: T.t4, fontWeight: 700, letterSpacing: 0.5 }}>GIPHY</span>
                    </div>
                    {gifLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}><Txt size={12} color={T.t3}>{t('loadingGif')}</Txt></div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
                        {gifResults.map(gif => (
                          <button key={gif.id} onClick={() => { setSelectedGif(gif); setShowGif(false); }}
                            style={{ padding: 0, border: 'none', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', height: 110, background: T.surface }}>
                            <img src={gif.images.fixed_height_small.url} alt={gif.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 16px calc(16px + var(--interactive-safe-bottom))', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                <button onClick={submitReview}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                  <Txt size={15} weight={700} color="#fff">{t('publishReview')}</Txt>
                </button>
              </div>
            </div>
          </>
        )}

        {listSheet && reportTarget === null && (
        <BottomSheet visible onClose={() => setListSheet(false)} title={listStatus ? t('myList') : t('addToList')}>
          {([
            { key: 'want',     label: t('wantStatus'),     icon: 'bookmark' as const, action: 'want'     as const },
            { key: 'watching', label: t('watchingStatus'), icon: 'eye'      as const, action: 'watching' as const },
            { key: 'watched',  label: t('finishedStatus'), icon: 'check'    as const, action: 'watched'  as const },
          ] as const).map(({ key, label, icon, action }) => {
            const isActive = listStatus === key;
            return (
            <button key={key} onClick={async () => {
              const item = { id: detail.id, title, type: isTV ? 'tv' : 'movie', poster_path: detail.poster_path };
              const others = (['want', 'watching', 'watched'] as const).filter((l) => l !== key);
              others.forEach((l) => listStore.remove(l, detail.id));
              listStore.add(key, item);
              setListStatus(key);
              setListSheet(false);
              showToast(`${label} ✓`);
              // Mark all episodes as watched when setting as Finalizado
              if (key === 'watched' && isTV) {
                const seasonData: Record<string, number[]> = {};
                (detail.seasons || []).forEach((s: any) => {
                  if (s.season_number > 0 && s.episode_count > 0) {
                    seasonData[String(s.season_number)] = Array.from({ length: s.episode_count }, (_, i) => i + 1);
                  }
                });
                epWatchedStore.setShow(detail.id, seasonData);
                setEpWatchedRefresh(v => v + 1);
              }
              if (firebaseConfigured && user) {
                const db = getDB();
                try {
                  await Promise.all(others.map((l) => dbListStore.remove(db, user.uid, l, detail.id)));
                  await dbListStore.add(db, user.uid, key, item);
                  if (key === 'watched' && isTV) {
                    await dbEpWatchedStore.set(db, user.uid, epWatchedStore.getAll());
                  }
                  const prof2        = profileStore.get(user.uid);
                  const displayName  = prof2.username || prof2.name || user.displayName || user.email?.split('@')[0] || 'Usuário';
                  await dbActivityStore.add(db, {
                    uid: user.uid, userId: user.uid,
                    username: displayName, authorUsername: prof2.username || displayName,
                    authorName: prof2.name || user.displayName || displayName,
                    avatar: displayName[0]?.toUpperCase() || 'U',
                    photoUrl: prof2.avatarThumbImage || user.photoURL || prof2.avatarImage || '',
                    authorAvatarUrl: prof2.avatarThumbImage || user.photoURL || prof2.avatarImage || '',
                    titleKey: `${isTV ? 'tv' : 'movie'}_${detail.id}`,
                    titleId: String(detail.id), titleName: title, titleType: isTV ? 'tv' : 'movie',
                    titleImageUrl: detail.poster_path ?? null,
                    poster: detail.poster_path ?? null, action, rating: 0, text: '',
                    createdAt: new Date().toISOString(),
                  });
                } catch {}
              }
            }} style={{ width: '100%', padding: '14px 0', background: isActive ? 'rgba(192,105,255,0.08)' : 'none', border: 'none', borderBottom: `1px solid ${T.border}`, borderRadius: isActive ? 10 : 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 4, paddingRight: 4 }}>
              <Icon name={icon} size={17} color={isActive ? T.pink : T.t3} />
              <span style={{ flex: 1, color: isActive ? T.pink : T.t1, fontSize: 14, fontWeight: isActive ? 700 : 600, fontFamily: "'Area','Inter',sans-serif" }}>{label}</span>
              {isActive && <Icon name="check" size={16} color={T.pink} />}
            </button>
            );
          })}
          {listStatus && (
            <button onClick={() => {
              (['want', 'watching', 'watched'] as const).forEach((l) => listStore.remove(l, detail.id));
              setListStatus(null);
              setListSheet(false);
              showToast(t('removedFromList'));
            }} style={{ width: '100%', padding: '14px 0', background: 'none', border: 'none', marginTop: 4, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="close" size={17} color={T.t3} />
              <span style={{ color: T.t3, fontSize: 14, fontWeight: 600, fontFamily: "'Area','Inter',sans-serif" }}>{t('removeFromList')}</span>
            </button>
          )}
        </BottomSheet>
        )}

        {maisSheet && reportTarget === null && (
          <BottomSheet visible onClose={() => setMaisSheet(false)} title={t('moreOptions')}>
            {([
              { icon: 'play'     as const, label: t('viewTrailer'),  action: () => { setTab('whereToWatch'); setMaisSheet(false); } },
              { icon: 'bookmark' as const, label: t('addToList'),    action: () => { setMaisSheet(false); setListSheet(true); } },
              { icon: 'share'    as const, label: t('shareTitle'),   action: () => { if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ title, url: window.location.href }).catch(() => {}); setMaisSheet(false); } },
              { icon: 'flag'     as const, label: t('reportIssue'),  action: openProblemReport },
            ]).map(({ icon, label, action }, idx, arr) => (
              <button key={label} onClick={action} style={{ width: '100%', padding: '16px 0', background: 'none', border: 'none', borderBottom: idx < arr.length - 1 ? `1px solid ${T.border}` : 'none', textAlign: 'left', color: T.t1, fontSize: 14, fontWeight: 600, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={icon} size={17} color={T.t2} />
                </div>
                {label}
              </button>
            ))}
          </BottomSheet>
        )}
      </Screen>
    </Frame>
  );
}

/* ── Movie reviews tab ── */
function MovieReviewsTab({ reviews, avgRating, totalRatings, onAddReview, onViewComments, onLike }: {
  reviews: Review[];
  avgRating: string | null;
  totalRatings: number;
  onAddReview: () => void;
  onViewComments: () => void;
  onLike: (id: string) => void;
}) {
  const { t } = useTranslation('title');
  const [sort, setSort] = useState<'recentes' | 'melhores' | 'piores'>('recentes');

  function timeAgo(dateStr: string): string {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1)  return t('now', { ns: 'common' });
      if (m < 60) return t('minutesAgo', { count: m, ns: 'common' });
      const h = Math.floor(m / 60);
      if (h < 24) return t('hoursAgo', { count: h, ns: 'common' });
      return t('daysAgo', { count: Math.floor(h / 24), ns: 'common' });
    } catch { return dateStr; }
  }

  const sorted = [...reviews].sort((a, b) => {
    if (sort === 'melhores') return b.rating - a.rating;
    if (sort === 'piores')   return a.rating - b.rating;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const SORT_OPTIONS = [
    { key: 'recentes' as const, label: t('sort.recentes') },
    { key: 'melhores' as const, label: t('sort.melhores') },
    { key: 'piores'   as const, label: t('sort.piores')   },
  ];

  return (
    <div>
      {/* ── Média geral ── */}
      {avgRating ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, background: '#FFEB13', marginBottom: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#1a1400', lineHeight: 1, fontFamily: "'Greed','Area',sans-serif" }}>{avgRating}</div>
            <div style={{ fontSize: 11, color: 'rgba(26,20,0,0.6)', marginTop: 2 }}>/10</div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(26,20,0,0.15)' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1400', fontFamily: "'Area',sans-serif" }}>
              {t('reviewCount', { count: totalRatings })}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
              {[1,2,3,4,5].map(i => (
                <Icon key={i} name="star" size={12} color={i <= Math.round(Number(avgRating) / 2) ? '#1a1400' : 'rgba(26,20,0,0.25)'} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, marginBottom: 20 }}>
          <Icon name="star" size={20} color={T.t4} />
          <Txt size={13} weight={600} color={T.t2}>{t('noReviewsYet')}</Txt>
        </div>
      )}

      {/* ── Filtros ── */}
      {reviews.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button key={key} onClick={() => setSort(key)} style={{
              padding: '7px 16px', borderRadius: 20, flexShrink: 0,
              background: sort === key ? T.pillActiveBg : T.surface2,
              border: sort === key ? 'none' : `1px solid ${T.border}`,
              color: sort === key ? T.pillActiveText : T.t2,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* ── Lista de avaliações ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {sorted.map(rev => {
          const liked = !!(rev as any).liked;
          return (
            <div key={rev.id} style={{ padding: '14px 16px', background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 19, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Txt size={13} weight={800} color="#fff">{rev.avatar}</Txt>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={13} weight={700} style={{ display: 'block' }}>{rev.user}</Txt>
                  <Txt size={11} color={T.t4} style={{ display: 'block' }}>{timeAgo(rev.date)}</Txt>
                </div>
                {rev.rating > 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 8, background: '#FFEB13' }}>
                    <Icon name="star" size={10} color="#1a1400" />
                    <Txt size={12} weight={700} color="#1a1400">{rev.rating}/10</Txt>
                  </div>
                )}
              </div>
              {rev.gifUrl && (
                <img src={rev.gifUrl} alt="" style={{ width: '100%', borderRadius: 10, display: 'block', marginBottom: 10, maxHeight: 160, objectFit: 'cover' }} />
              )}
              {rev.text ? (
                <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.65, marginBottom: 10 }}>{rev.text}</Txt>
              ) : null}
              <button onClick={() => onLike(rev.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <Icon name={liked ? 'heart' : 'heartO'} size={15} color={liked ? T.pink : T.t3} />
                <Txt size={12} color={liked ? T.pink : T.t3}>{(rev.likes || 0) + (liked ? 1 : 0)}</Txt>
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Botões de ação ── */}
      <button onClick={onAddReview}
        style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}`, marginBottom: 10 }}>
        <Txt size={15} weight={700} color="#fff">{t('addReviewBtn')}</Txt>
      </button>
      <button onClick={onViewComments}
        style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: T.card, border: `1px solid ${T.border}`, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="message" size={16} color={T.t2} />
          <Txt size={15} weight={700} color={T.t1}>{t('viewComments')}</Txt>
        </div>
      </button>
    </div>
  );
}

function WatchProvidersTab({ type, id, onVIP }: {
  type: 'movie' | 'tv'; id: string; onVIP: () => void;
}) {
  const { t } = useTranslation('title');
  const { data, loading } = useTMDB(() => tmdb.watchProviders(type, id), [type, id]);
  const regionData = data?.results?.BR || data?.results?.US || Object.values(data?.results || {})[0] as any;
  const flatrate: any[] = regionData?.flatrate || [];
  const rent: any[]     = regionData?.rent     || [];
  const buy: any[]      = regionData?.buy      || [];

  type ProviderType = 'subscription' | 'rent' | 'buy';
  const ProviderRow = ({ p, providerType }: { p: any; providerType: ProviderType }) => {
    const label = providerType === 'subscription' ? t('subscriptionIncluded') : providerType === 'rent' ? t('rentBtn') : t('buyBtn');
    const btnLabel = providerType === 'subscription' ? t('watchBtn') : label;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 8 }}>
        {p.logo_path
          ? <img src={tmdbImg(p.logo_path, 'w92') ?? ''} alt={p.provider_name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
          : <StreamCircle name={p.provider_name} size={44} />
        }
        <div style={{ flex: 1 }}>
          <Txt size={14} weight={700} style={{ display: 'block' }}>{p.provider_name}</Txt>
          <Txt size={11} color={T.t3}>{t('streamingPlatform')}</Txt>
        </div>
        <Btn label={btnLabel} variant="pink" size="sm" />
      </div>
    );
  };

  return (
    <div>
      {loading && (
        <div>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 68, borderRadius: 10, background: T.card, marginBottom: 8 }} />)}</div>
      )}
      {!loading && flatrate.length === 0 && rent.length === 0 && buy.length === 0 && (
        <div style={{ padding: '28px 0', textAlign: 'center' }}>
          <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 4 }}>{t('noStreamingBrazil')}</Txt>
          <Txt size={12} color={T.t4}>{t('checkBackSoon')}</Txt>
        </div>
      )}
      {flatrate.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {flatrate.map((p: any) => <ProviderRow key={p.provider_id} p={p} providerType="subscription" />)}
        </div>
      )}
      {rent.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {rent.map((p: any) => <ProviderRow key={p.provider_id} p={p} providerType="rent" />)}
        </div>
      )}
      {buy.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {buy.map((p: any) => <ProviderRow key={p.provider_id} p={p} providerType="buy" />)}
        </div>
      )}
    </div>
  );
}

function InformationsTab({ detail, crew, similar, isTV, onCrew, onSimilar }: {
  detail: any; crew: any[]; similar: any[]; isTV: boolean;
  onCrew: (id: string) => void; onSimilar: (s: any) => void;
}) {
  const { t } = useTranslation('title');
  const allCrew = (detail.credits?.crew || []).filter((c: any) =>
    ['Director', 'Creator', 'Producer', 'Executive Producer', 'Screenplay', 'Writer'].includes(c.job)
  ).slice(0, 8);

  const infoRows = [
    { label: t('info.country'),  value: (detail.production_countries || [])[0]?.name || '—' },
    { label: t('info.language'), value: (detail.spoken_languages || [])[0]?.name || '—' },
    ...(isTV ? [
      { label: t('info.seasonsLabel'), value: String(detail.number_of_seasons || '—') },
      { label: t('info.episodesLabel'), value: String(detail.number_of_episodes || '—') },
      { label: t('info.statusLabel'), value: t(`status.${detail.status}`, { defaultValue: detail.status || '—' }) },
    ] : []),
    { label: t('genres'), value: (detail.genres || []).map((g: any) => g.name).join(', ') || '—' },
  ];

  return (
    <div>
      {/* Info grid */}
      <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>{t('info.title')}</Txt>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
        {infoRows.map(({ label, value }) => (
          <div key={label} style={{ padding: '10px 12px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
            <Txt size={10} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Txt>
            <Txt size={12} weight={600}>{value}</Txt>
          </div>
        ))}
      </div>

      {/* Equipe de criação */}
      {allCrew.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>{t('crew')}</Txt>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {allCrew.map((c: any, idx: number) => (
              <button key={`${c.id}-${c.job}`} onClick={() => onCrew(c.id)} style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', background: 'none', border: 'none', borderBottom: idx < allCrew.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${T.border}` }}>
                  <TMDBPersonPhoto path={c.profile_path} size={44} name={c.name} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={13} weight={700} style={{ display: 'block' }}>{c.name}</Txt>
                  <Txt size={11} color={T.t3}>{c.job}</Txt>
                </div>
                <Icon name="chevronR" size={14} color={T.t4} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Títulos semelhantes */}
      {similar.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>{t('similarTitles')}</Txt>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', marginLeft: -16, paddingLeft: 16, paddingRight: 16 } as React.CSSProperties}>
            {similar.map((s: any) => (
              <TMDBPosterCard key={s.id} item={s} size="lg" onClick={() => onSimilar(s)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeasonDropdown({ seasons, active, onSelect }: { seasons: number[]; active: number; onSelect: (sn: number) => void }) {
  const { t } = useTranslation('title');
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', marginBottom: 16, zIndex: 10 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 0', borderRadius: 0,
          background: 'none', border: 'none',
          color: T.t1, fontSize: 16, fontWeight: 800,
          fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', outline: 'none',
        }}>
        {t('season', { number: active })}
        <Icon name="chevronD" size={16} color={T.t3} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {/* Dropdown list */}
      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            background: T.card, borderRadius: 14,
            border: `1px solid ${T.border}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            overflow: 'hidden', zIndex: 10, minWidth: 180,
          }}>
            {seasons.map((sn, idx) => (
              <button
                key={sn}
                onClick={() => { onSelect(sn); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px', background: 'none',
                  border: 'none',
                  borderBottom: idx < seasons.length - 1 ? `1px solid ${T.border}` : 'none',
                  color: sn === active ? T.pink : T.t1,
                  fontSize: 14, fontWeight: sn === active ? 700 : 500,
                  fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', textAlign: 'left',
                }}>
                {t('season', { number: sn })}
                {sn === active && <Icon name="check" size={15} color={T.pink} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatSeasonTime(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function SeasonProgressPanel({
  tvId,
  seasonNum,
  fallbackRuntime,
  refreshKey,
  user,
  onChanged,
  onToast,
}: {
  tvId: string;
  seasonNum: number;
  fallbackRuntime: number;
  refreshKey: number;
  user: { uid: string } | null | undefined;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation('title');
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data, loading } = useTMDB(() => tmdb.season(tvId, seasonNum), [tvId, seasonNum]);
  const episodes: any[] = data?.episodes || [];
  const [watchedMap, setWatchedMap] = useState<Record<string, number[]>>({});

  useEffect(() => {
    setWatchedMap(epWatchedStore.getShow(tvId));
  }, [tvId, seasonNum, refreshKey]);

  const watchedNumbers = new Set(watchedMap[String(seasonNum)] ?? []);
  const watchedCount = episodes.filter((episode) => watchedNumbers.has(episode.episode_number)).length;
  const totalCount = episodes.length;
  const percentage = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;
  const completed = totalCount > 0 && watchedCount === totalCount;
  const remainingMinutes = episodes.reduce((total, episode) => {
    if (watchedNumbers.has(episode.episode_number)) return total;
    const runtime = Number(episode.runtime) || fallbackRuntime;
    return total + runtime;
  }, 0);
  const circleLength = 138.23;

  const finishSeason = async () => {
    if (totalCount === 0 || completed) return;
    const nextShow = {
      ...epWatchedStore.getShow(tvId),
      [String(seasonNum)]: episodes.map((episode) => episode.episode_number),
    };
    epWatchedStore.setShow(tvId, nextShow);
    setWatchedMap(nextShow);
    onChanged();
    onToast(t('seasonFinishedToast', { number: seasonNum }));

    if (firebaseConfigured && user) {
      try {
        await dbEpWatchedStore.set(getDB(), user.uid, epWatchedStore.getAll());
      } catch {}
    }
  };

  if (loading) {
    return (
      <div style={{
        height: 154, marginTop: 16, borderRadius: 18,
        background: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        overflow: 'hidden', position: 'relative',
      }}>
        <div className="img-skeleton" style={{ position: 'absolute', inset: 0 }} />
      </div>
    );
  }

  if (totalCount === 0) return null;

  return (
    <div style={{
      marginTop: 16, padding: '16px', borderRadius: 18, overflow: 'hidden',
      position: 'relative',
      background: isDark
        ? 'linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))'
        : 'linear-gradient(145deg, rgba(0,0,0,0.025), rgba(0,0,0,0.012))',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'}`,
      boxShadow: isDark
        ? 'inset 0 1px 0 rgba(255,255,255,0.045)'
        : 'inset 0 1px 0 rgba(255,255,255,0.8)',
    }}>
      <div style={{
        position: 'absolute', width: 150, height: 150, borderRadius: '50%',
        right: -60, top: -75, pointerEvents: 'none',
        background: `radial-gradient(circle, ${T.pink}18 0%, transparent 70%)`,
      }} />

      <Txt size={9} weight={800} color={T.t3} style={{
        display: 'block', textTransform: 'uppercase', letterSpacing: 1.15, marginBottom: 12,
      }}>
        {t('seasonProgress')}
      </Txt>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div
          role="progressbar"
          aria-label={t('seasonProgress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          style={{ width: 68, height: 68, flexShrink: 0, position: 'relative' }}
        >
          <svg width="68" height="68" viewBox="0 0 58 58" aria-hidden>
            <circle cx="29" cy="29" r="22" fill="none" stroke={T.surface2} strokeWidth="7" />
            <circle
              cx="29" cy="29" r="22" fill="none" stroke={completed ? '#7BE35A' : T.pink}
              strokeWidth="7" strokeLinecap="round"
              strokeDasharray={circleLength}
              strokeDashoffset={circleLength * (1 - percentage / 100)}
              transform="rotate(-90 29 29)"
              style={{ transition: 'stroke-dashoffset .35s ease' }}
            />
          </svg>
          <Txt size={13} weight={800} color={T.t1} style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {percentage}%
          </Txt>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Txt size={16} weight={800} color={T.t1} style={{ display: 'block', marginBottom: 5 }}>
            {t('season', { number: seasonNum })}
          </Txt>
          <Txt size={12} weight={600} color={T.t2} style={{ display: 'block', marginBottom: 3 }}>
            {t('seasonProgressEpisodes', { watched: watchedCount, total: totalCount })}
          </Txt>
          <Txt size={11} color={completed ? '#7BE35A' : T.t3} style={{ display: 'block' }}>
            {completed
              ? t('seasonCompleted')
              : t('seasonTimeRemaining', { time: formatSeasonTime(remainingMinutes) })}
          </Txt>
        </div>
      </div>

      <button
        type="button"
        disabled={completed}
        onClick={() => { void finishSeason(); }}
        style={{
          width: '100%', marginTop: 14, minHeight: 42, padding: '10px 14px',
          borderRadius: 999, border: `1px solid ${completed ? 'rgba(123,227,90,.26)' : T.pillActiveBorder}`,
          background: completed ? 'rgba(123,227,90,.10)' : T.pillActiveBg,
          color: completed ? '#7BE35A' : T.pillActiveText,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: "'Area','Inter',sans-serif", fontSize: 13, fontWeight: 800,
          cursor: completed ? 'default' : 'pointer',
        }}
      >
        <Icon name="check" size={15} color={completed ? '#7BE35A' : T.pillActiveText} />
        {completed ? t('seasonCompleted') : t('finishSeason')}
      </button>
    </div>
  );
}

function EpisodeList({ tvId, seasonNum, showName, network, onEpisode, refreshKey }: { tvId: string; seasonNum: number; showName: string; network: string; onEpisode: (ep: any) => void; refreshKey?: number }) {
  const { t } = useTranslation('title');
  const { data, loading } = useTMDB(() => tmdb.season(tvId, seasonNum), [tvId, seasonNum]);
  const episodes = data?.episodes || [];
  const [watchedMap, setWatchedMap] = useState<Record<string, number[]>>({});
  useEffect(() => { setWatchedMap(epWatchedStore.getShow(tvId)); }, [tvId, seasonNum, refreshKey]);
  const isWatched = (epNum: number) => (watchedMap[String(seasonNum)] ?? []).includes(epNum);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ minHeight: 101, display: 'flex', gap: 14, alignItems: 'stretch', padding: 0, overflow: 'hidden', background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
          <div style={{ width: 148, minHeight: 101, background: T.surface2, flexShrink: 0 }} />
          <div style={{ flex: 1, padding: '14px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ height: 14, width: '70%', background: T.surface2, borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 11, width: '50%', background: T.surface2, borderRadius: 4, marginBottom: 5 }} />
            <div style={{ height: 11, width: '38%', background: T.surface2, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {episodes.map((ep: any) => (
        <button
          key={ep.id}
          onClick={() => onEpisode(ep)}
          style={{
            width: '100%', minHeight: 101, display: 'flex', gap: 14, alignItems: 'stretch',
            padding: 0, overflow: 'hidden',
            background: T.card,
            borderRadius: 16,
            border: `1px solid ${T.border}`,
            cursor: 'pointer', textAlign: 'left',
            boxSizing: 'border-box',
          } as React.CSSProperties}>
          {/* Landscape thumbnail — same composition as "Minha lista" on home */}
          <div style={{ width: 148, minHeight: 101, overflow: 'hidden', flexShrink: 0, background: T.surface2, position: 'relative' }}>
            <ImgWithSkeleton
              src={tmdbImg(ep.still_path, 'w300')}
              alt={ep.name || t('episode', { number: ep.episode_number })}
              width="100%" height="100%"
              style={{ position: 'absolute', inset: 0 }}
            />
            {isWatched(ep.episode_number) && (
              <span style={{
                position: 'absolute', left: 10, bottom: 9,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 999,
                background: '#7BE35A', boxShadow: '0 2px 8px rgba(0,0,0,.2)',
              }}>
                <Icon name="check" size={10} color="#11210c" />
                <Txt size={9} weight={800} color="#11210c" style={{ letterSpacing: '0.35px', lineHeight: 1 }}>
                  {t('watchedMark')}
                </Txt>
              </span>
            )}
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, padding: '14px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Txt size={15} weight={800} color={T.t1}
              style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 7 }}>
              {ep.name || t('episode', { number: ep.episode_number })}
            </Txt>
            <Txt size={13} weight={600} color={T.t3} style={{ display: 'block', lineHeight: 1.4 }}>
              {t('episode', { number: ep.episode_number })}
            </Txt>
          </div>
          <Icon name="chevronR" size={16} color={T.t4} style={{ alignSelf: 'center', marginRight: 14 }} />
        </button>
      ))}
    </div>
  );
}

function ReviewsTab({ reviews, avgRating, showForm, reviewText, reviewRating, onToggleForm, onTextChange, onRatingChange, onSubmit, onLike }: {
  reviews: Review[]; avgRating: string; showForm: boolean;
  reviewText: string; reviewRating: number;
  onToggleForm: () => void; onTextChange: (v: string) => void;
  onRatingChange: (v: number) => void; onSubmit: () => void;
  onLike: (id: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Txt size={36} weight={800} color={T.gold}>{avgRating}</Txt>
          <div style={{ paddingBottom: 6 }}>
            <Stars value={Math.round(Number(avgRating) / 2)} max={5} size={14} onChange={() => {}} />
            <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 2 }}>{reviews.length} avaliações</Txt>
          </div>
        </div>
        <button onClick={onToggleForm} style={{ padding: '10px 16px', borderRadius: T.radiusSm, background: showForm ? T.surface2 : T.pink, border: 'none', cursor: 'pointer', boxShadow: showForm ? 'none' : `0 2px 12px ${T.pinkGlow}` }}>
          <Txt size={12} weight={700} color={T.white}>{showForm ? 'Cancelar' : '+ Avaliar'}</Txt>
        </button>
      </div>
      {showForm && (
        <div style={{ padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <Txt size={13} weight={700} style={{ display: 'block', marginBottom: 10 }}>Sua avaliação</Txt>
          <div style={{ marginBottom: 12 }}>
            <Stars value={reviewRating} max={10} size={22} onChange={onRatingChange} />
            {reviewRating > 0 && <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 4 }}>{reviewRating}/10</Txt>}
          </div>
          <textarea value={reviewText} onChange={(e) => onTextChange(e.target.value)} placeholder="Escreva sua crítica..." rows={3}
            style={{ width: '100%', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '10px 12px', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          <button onClick={onSubmit} style={{ marginTop: 10, width: '100%', padding: '12px 0', borderRadius: T.radiusSm, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 2px 12px ${T.pinkGlow}` }}>
            <Txt size={14} weight={700} color={T.white}>Publicar</Txt>
          </button>
        </div>
      )}
      {reviews.map((rev) => (
        <ReviewCard key={rev.id} review={rev} onLike={() => onLike(rev.id)} />
      ))}
    </div>
  );
}

function ReviewCard({ review, onLike }: { review: Review; onLike: () => void }) {
  const [open, setOpen] = useState(false);
  const liked = (review.likedBy || []).includes('me');
  return (
    <div style={{ padding: '14px 16px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Txt size={12} weight={800} color={T.t2}>{review.avatar}</Txt>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Txt size={13} weight={700} style={{ display: 'block' }}>{review.user}</Txt>
          <Txt size={11} color={T.t3}>{review.date}</Txt>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 16, background: T.goldDim, border: `1px solid rgba(245,197,24,0.2)` }}>
          <Icon name="star" size={10} color={T.gold} />
          <Txt size={12} weight={700} color={T.gold}>{review.rating}/10</Txt>
        </div>
      </div>
      <Txt size={13} color={T.t2} style={{ lineHeight: 1.65, display: 'block', marginBottom: 10 }}>{review.text}</Txt>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={onLike} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name={liked ? 'heart' : 'heartO'} size={15} color={liked ? T.red : T.t3} />
          <Txt size={12} color={liked ? T.red : T.t3}>{(review.likes || 0) + (liked ? 1 : 0)}</Txt>
        </button>
        <button onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name="message" size={15} color={T.t3} />
          <Txt size={12} color={T.t3}>{(review.replies || []).length} respostas</Txt>
        </button>
      </div>
      {open && (review.replies || []).length === 0 && (
        <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 8, fontStyle: 'italic' }}>Sem respostas ainda.</Txt>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   HeroWithGlur — PosterRamen / Glur technique
   maskImage on wrapper div  →  controls visibility band
   filter:blur on inner <img> →  blurs that copy of the image
   scale on inner <img> only  →  hides blur-edge bleed, no duplication
───────────────────────────────────────────── */
const STATUS_ICON_MAP = {
  watching:  { icon: 'eye'      as const, bg: '#FF8C00', color: '#fff' },
  favorites: { icon: 'heart'    as const, bg: '#E5002E', color: '#fff' },
  want:      { icon: 'search'   as const, bg: '#C069FF', color: '#fff' },
  atrasado:  { icon: 'clock'    as const, bg: '#FF3B30', color: '#fff' },
};

function HeroWithGlur({
  backdropPath, title, genre, rating, runtime, statusKey,
}: {
  backdropPath: string | null;
  title: string; genre: string; rating: string; runtime: string;
  statusKey: 'atrasado' | 'watching' | 'favorites' | 'want' | null;
}) {
  const BLUR_HEIGHT = 36;   // % of hero height covered by blur (from bottom)
  const BLUR_DETAIL = 6;    // number of layers
  const BLUR_AMOUNT = 1;    // base blur px — doubles each step: 1,2,4,8,16,32
  const IMG_SCALE   = 1.12; // only the blurred <img> scales to hide edge bleed

  const imgUrl = backdropPath
    ? (tmdbImg(backdropPath, 'w780') ?? '')
    : '';

  // evenly-spaced vertical checkpoints across the blur zone
  const checkpoints: number[] = [];
  const inc = BLUR_HEIGHT / BLUR_DETAIL;
  for (let i = 0; i <= BLUR_DETAIL; i++) {
    checkpoints.push(100 - BLUR_HEIGHT + inc * i);
  }

  return (
    <div style={{ height: 390, position: 'relative', overflow: 'hidden' }}>

      {/* ① Base image — sharp, normal render */}
      {imgUrl
        ? <img src={imgUrl} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', background: T.card }} />
      }

      {/* ② Glur layers — wrapper clips visibility band; inner <img> carries blur */}
      {Array.from({ length: BLUR_DETAIL }, (_, step) => {
        const startOverrides: Record<number, number> = { 0: 94, 1: 90 };
        const startPct = startOverrides[step] ?? checkpoints[step];
        const offsets = [
          `rgba(0,0,0,0) ${startPct}%`,
          `rgba(0,0,0,1) ${checkpoints[step + 1]}%`,
        ];
        if (checkpoints[step + 2] !== undefined) offsets.push(`rgba(0,0,0,1) ${checkpoints[step + 2]}%`);
        if (checkpoints[step + 3] !== undefined) offsets.push(`rgba(0,0,0,0) ${checkpoints[step + 3]}%`);
        const grad = `linear-gradient(to bottom,${offsets.join(',')})`;
        return (
          <div key={step} style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            maskImage: grad,
            WebkitMaskImage: grad,
            zIndex: step + 1,
            pointerEvents: 'none',
          } as React.CSSProperties}>
            <img
              src={imgUrl} alt="" aria-hidden
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', display: 'block',
                filter: `blur(${BLUR_AMOUNT * Math.pow(2, step)}px)`,
                transform: `scale(${IMG_SCALE})`, // scale img only → hides blur edge, no offset vs base
              }}
            />
          </div>
        );
      })}

      {/* ③ Narrow dark gradient at bottom for text legibility */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
        background: 'linear-gradient(transparent 0%, rgba(10,10,10,0.05) 50%, rgba(10,10,10,0.04) 78%, rgba(10,10,10,0.37) 100%)',
        zIndex: BLUR_DETAIL + 2, pointerEvents: 'none',
      }} />

      {/* ④ Title + chips */}
      <div style={{ position: 'absolute', bottom: 20, left: 16, right: 16, zIndex: BLUR_DETAIL + 3 }}>
        <Txt size={28} weight={800} color={T.white} style={{ display: 'block', lineHeight: 1.15, letterSpacing: -0.5, marginBottom: 10, textShadow: 'none' }}>{title}</Txt>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {genre && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, background: 'var(--c-t4)', border: '1px solid var(--c-t4)' }}>
              <Txt size={11} weight={700} color={T.white}>{genre}</Txt>
            </div>
          )}
          {runtime && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: 'var(--c-t4)', border: '1px solid var(--c-t4)' }}>
              <Txt size={11} weight={600} color={T.white}>⏱ {runtime}</Txt>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

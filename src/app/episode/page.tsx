'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Stars, StreamBadge, Toast, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { revStore, profileStore, epWatchedStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRevStore } from '@/lib/db';
import { useTranslation } from 'react-i18next';
import { navigateBack } from '@/lib/navigation';
import i18next from 'i18next';
import '@/lib/i18n';
import { tmdbImg } from '@/lib/tmdb';

const EPISODE_REACTIONS = [
  { id: 'loved', key: 'reactionLoved', emoji: '😍', color: '#C069FF' },
  { id: 'hated', key: 'reactionHated', emoji: '😡', color: '#FF5B68' },
  { id: 'shocked', key: 'reactionShocked', emoji: '😱', color: '#6C8CFF' },
  { id: 'sad', key: 'reactionSad', emoji: '😢', color: '#55B7E8' },
  { id: 'afraid', key: 'reactionAfraid', emoji: '😨', color: '#8A79D6' },
  { id: 'expectedMore', key: 'reactionExpectedMore', emoji: '😕', color: '#F5A94A' },
] as const;

type EpisodeReaction = typeof EPISODE_REACTIONS[number]['id'];

function EpisodePageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation('title');

  /* ── params from URL ── */
  const tvId    = sp.get('tvId')    || '';
  const season  = sp.get('season')  || '1';
  const epNum   = sp.get('epNum')   || '1';
  const epName  = sp.get('name')    || '';
  const episodeCode = `${season}X${epNum.padStart(2, '0')}`;
  const showName= sp.get('showName')|| '';
  const runtime = sp.get('runtime') || '';
  const overview= sp.get('overview')|| '';
  const still   = sp.get('still')   || '';
  const network = sp.get('network') || '';
  const airDate = sp.get('airDate') || '';

  /* ── Format air date ── */
  const formattedAirDate = airDate ? (() => {
    try {
      return new Date(airDate + 'T00:00:00').toLocaleDateString(i18next.language || 'pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return airDate; }
  })() : null;

  /* localStorage key — unique per show + season + episode */
  const storageKey = `ep_${tvId}_s${season}_e${epNum}`;

  /* ── state ── */
  const [watched, setWatched]         = useState(false);
  const [toast, setToast]             = useState<string | false>(false);
  const [reviews, setReviews]         = useState<Review[]>([]);
  const [socialTab, setSocialTab]     = useState<'ratings' | 'reactions'>('ratings');

  /* ── Computed: ratings are private per user, only avg is public ── */
  const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'Você';
  const ratedReviews    = reviews.filter(r => r.rating > 0);
  const avgRating       = ratedReviews.length > 0
    ? (ratedReviews.reduce((s, r) => s + r.rating, 0) / ratedReviews.length).toFixed(1)
    : null;
  const myRating        = reviews.find(r => r.user === currentUserName)?.rating || 0;
  const commentCount    = reviews.filter(r => r.text).length;
  const reactionReviews = reviews.filter(review => !!review.reaction);
  const reactionBuckets = EPISODE_REACTIONS.map(reaction => ({
    ...reaction,
    label: t(reaction.key),
    count: reactionReviews.filter(review => review.reaction === reaction.id).length,
  }));

  /* review modal */
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalRating, setModalRating] = useState(0);
  const [modalReaction, setModalReaction] = useState<EpisodeReaction | null>(null);
  const [replyOpen, setReplyOpen]     = useState<string | null>(null);
  const [replyText, setReplyText]     = useState('');
  const [showNavTitle, setShowNavTitle] = useState(false);
  const epTitleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = epTitleRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowNavTitle(!entry.isIntersecting),
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* ── Load watched + reviews from localStorage, then sync Firestore ── */
  useEffect(() => {
    if (!storageKey) return;

    // Restore watched state — old per-key flag OR unified epWatchedStore
    const oldFlag = localStorage.getItem(`sec_watched_${storageKey}`) === 'true';
    const inStore = epWatchedStore.isWatched(tvId, parseInt(season), parseInt(epNum));
    if (oldFlag || inStore) setWatched(true);

    // Show local data immediately while Firestore loads
    const local = revStore.get(storageKey);
    setReviews(local);

    if (!firebaseConfigured) return;
    dbRevStore.get(getDB(), storageKey).then(cloud => {
      if (cloud.length > 0) {
        // Merge: Firestore is the truth, but include any unsaved local items
        const cloudIds = new Set(cloud.map(r => r.id));
        const onlyLocal = local.filter(r => !cloudIds.has(r.id));
        const merged = [...onlyLocal, ...cloud];
        setReviews(merged);
        revStore.set(storageKey, merged);
      }
    }).catch(() => {});
  }, [storageKey]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(false), 2000);
  };

  const submitReview = async () => {
    if (modalRating === 0 && !modalReaction) {
      showToast(t('addRatingOrReaction'));
      return;
    }
    const prof         = profileStore.get(user?.uid);
    const displayName  = prof.username || prof.name || user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const photoUrl     = user?.photoURL || prof.avatarImage || '';
    const newRev: Review = {
      id: `ep_${Date.now()}`,
      user: displayName,
      uid: user?.uid || '',
      avatar: avatarLetter,
      photoUrl,
      rating: modalRating * 2,
      reaction: modalReaction || undefined,
      text: '',
      date: new Date().toISOString(),
      likes: 0,
    };
    // Optimistic: update UI and localStorage immediately
    const updated = revStore.addReview(storageKey, newRev);
    setReviews(updated);
    setModalOpen(false);
    setModalRating(0);
    setModalReaction(null);
    showToast(t('reviewPublished'));
    // Sync to Firestore in background
    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), storageKey, newRev); } catch {}
    }
  };

  const toggleLike = async (id: string) => {
    if (!user) { showToast('Faça login para curtir.'); return; }
    // Optimistic local update
    const updated = reviews.map(r => {
      if (r.id !== id) return r;
      const wasLiked = !!(r as any).liked;
      return { ...r, likes: (r.likes || 0) + (wasLiked ? -1 : 1), liked: !wasLiked } as Review;
    });
    setReviews(updated);
    revStore.set(storageKey, updated);
    // Sync to Firestore
    if (firebaseConfigured) {
      try {
        const cloud = await dbRevStore.toggleLike(getDB(), storageKey, id, user.uid);
        if (cloud) { setReviews(cloud); revStore.set(storageKey, cloud); }
      } catch {}
    }
  };

  const submitReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    const prof         = profileStore.get(user?.uid);
    const displayName  = prof.username || prof.name || user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const newReply = { id: `rep_${Date.now()}`, user: displayName, avatar: avatarLetter, text: replyText.trim(), date: new Date().toISOString() };
    const updated = reviews.map(r =>
      r.id === reviewId
        ? { ...r, replies: [...(r.replies || []), newReply] }
        : r
    );
    setReviews(updated);
    revStore.set(storageKey, updated);
    setReplyText('');
    setReplyOpen(null);
    showToast(t('comments.replySent'));
    // Sync to Firestore
    if (firebaseConfigured) {
      try { await dbRevStore.addReply(getDB(), storageKey, reviewId, newReply); } catch {}
    }
  };

  function timeAgo(dateStr: string): string {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1)   return 'agora';
      if (m < 60)  return `${m}min atrás`;
      const h = Math.floor(m / 60);
      if (h < 24)  return `${h}h atrás`;
      return `${Math.floor(h / 24)}d atrás`;
    } catch { return dateStr; }
  }

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            left={
              <button onClick={() => navigateBack(router)}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                <Icon name="chevronL" size={16} color={T.white} />
              </button>
            }
            right={
              <button onClick={() => router.push('/notifications')}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                <Icon name="bell" size={16} color={T.white} />
              </button>
            }
            navTitle={`${episodeCode}${epName ? `: ${epName}` : ''}`}
            showNavTitle={showNavTitle}
          />
          {/* ── Backdrop / still ── */}
          <div style={{ height: 270, margin: '8px 16px 0', borderRadius: 20, position: 'relative', overflow: 'hidden', background: still ? 'transparent' : 'var(--c-surface2)' }}>
            {still && (
              <img
                src={tmdbImg(still, 'w780') ?? ''}
                alt={epName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 30%, ${T.bg} 100%)` }} />
          </div>

          <div style={{ padding: '0 16px' }}>

            {/* ── Episode info header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, marginTop: 4 }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                {showName ? (
                  <Txt size={12} color={T.pink} weight={700} style={{ display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {showName}
                  </Txt>
                ) : null}
                <div ref={epTitleRef}>
                  <Txt size={20} weight={800} style={{ display: 'block', marginBottom: 6, lineHeight: 1.25 }}>
                    {episodeCode}{epName ? `: ${epName}` : ''}
                  </Txt>
                </div>
                {/* Air date · Duration */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {formattedAirDate && (
                    <Txt size={12} color={T.t3}>{formattedAirDate}</Txt>
                  )}
                  {formattedAirDate && runtime && (
                    <Txt size={12} color={T.t4}>·</Txt>
                  )}
                  {runtime && (
                    <Txt size={12} color={T.t3}>{runtime} min</Txt>
                  )}
                </div>
              </div>
              {/* Streaming badge */}
              {network ? <StreamBadge name={network} /> : null}
            </div>

            {/* Overview */}
            {overview ? (
              <Txt size={13} color={T.t2} style={{ lineHeight: 1.7, display: 'block', marginBottom: 20 }}>
                {overview}
              </Txt>
            ) : null}

            {/* ── Mark as watched ── */}
            <button
              onClick={() => {
                if (!watched) {
                  setWatched(true);
                  localStorage.setItem(`sec_watched_${storageKey}`, 'true');
                  epWatchedStore.markWatched(tvId, parseInt(season), parseInt(epNum));
                  // Only open modal if user hasn't reviewed yet
                  const alreadyReviewed = revStore.get(storageKey).some(r => r.user === currentUserName);
                  if (!alreadyReviewed) setModalOpen(true);
                  else showToast(t('markedWatched'));
                } else {
                  setWatched(false);
                  localStorage.removeItem(`sec_watched_${storageKey}`);
                  epWatchedStore.unmarkWatched(tvId, parseInt(season), parseInt(epNum));
                  showToast(t('unmarkWatched'));
                }
              }}
              style={{ width: '100%', padding: '15px 0', borderRadius: T.radiusSm, background: watched ? T.surface2 : T.pink, border: watched ? `1px solid ${T.border}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', marginBottom: 12, boxShadow: watched ? 'none' : `0 4px 16px ${T.pinkGlow}` }}>
              <Icon name={watched ? 'check' : 'eye'} size={18} color={watched ? T.t2 : T.white} />
              <Txt size={15} weight={700} color={watched ? T.t2 : T.white}>
                {watched ? t('watchedMark') : t('markAsWatched')}
              </Txt>
            </button>

            {/* ── Ver comentários button ── */}
            <button onClick={() => router.push(`/comments?key=${encodeURIComponent(storageKey)}&title=${encodeURIComponent(`${episodeCode}${epName ? `: ${epName}` : ''}`)}&showName=${encodeURIComponent(showName)}`)}
              style={{ width: '100%', padding: '15px 0', borderRadius: T.radiusSm, background: T.card, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
              <Icon name="message" size={18} color={T.t2} />
              <Txt size={15} weight={700} color={T.t1}>
                {t('viewComments')}{commentCount > 0 ? ` (${commentCount})` : ''}
              </Txt>
            </button>

            {/* ── Avaliações e estatísticas de reações ── */}
            <section style={{ marginBottom: 24 }}>
              <div role="tablist" aria-label={t('episodeCommunity')} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {([
                  { key: 'ratings' as const, label: t('ratingsTab') },
                  { key: 'reactions' as const, label: t('reactionsTab') },
                ]).map(item => {
                  const active = socialTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSocialTab(item.key)}
                      style={{
                        padding: '9px 18px', borderRadius: 999, cursor: 'pointer',
                        background: active ? T.surface2 : 'transparent',
                        border: `1px solid ${active ? T.t3 : T.border}`,
                        color: active ? T.t1 : T.t3,
                        fontSize: 13, fontWeight: 700,
                        fontFamily: "'Area','Inter',sans-serif",
                      }}>
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {socialTab === 'ratings' ? (
                avgRating ? (
                  <div style={{ padding: '14px 16px', background: T.card, borderRadius: 14, border: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ background: '#FFEB13', borderRadius: 10, padding: '8px 14px', textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#1a1400', lineHeight: 1, fontFamily: "'Greed','Area',sans-serif" }}>{avgRating}</div>
                        <div style={{ fontSize: 10, color: 'rgba(26,20,0,0.6)', marginTop: 1 }}>/10</div>
                      </div>
                      <div>
                        <Txt size={13} weight={700} style={{ display: 'block' }}>{t('reviewCount', { count: ratedReviews.length })}</Txt>
                        {myRating > 0 && (
                          <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 3 }}>{t('yourRatingValue', { value: myRating })}</Txt>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 6px' }}>
                    <Icon name="star" size={16} color={T.t4} />
                    <Txt size={13} weight={600} color={T.t3}>{t('noRatingYet')}</Txt>
                  </div>
                )
              ) : reactionReviews.length > 0 ? (
                <div>
                  <Txt size={11} color={T.t4} style={{ display: 'block', marginBottom: 12 }}>{t('reactionStatsHint')}</Txt>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {reactionBuckets.map(bucket => {
                      const percentage = Math.round((bucket.count / reactionReviews.length) * 100);
                      return (
                        <div key={bucket.label} style={{ display: 'grid', gridTemplateColumns: '26px 92px minmax(0, 1fr) 34px', alignItems: 'center', gap: 8 }}>
                          <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>{bucket.emoji}</span>
                          <Txt size={12} weight={600} color={T.t2}>{bucket.label}</Txt>
                          <div style={{ height: 7, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
                            <div style={{ width: `${percentage}%`, height: '100%', borderRadius: 999, background: bucket.color, transition: 'width 0.25s ease' }} />
                          </div>
                          <Txt size={11} weight={700} color={T.t3} style={{ textAlign: 'right' }}>{percentage}%</Txt>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 6px' }}>
                  <span aria-hidden style={{ fontSize: 16 }}>😶</span>
                  <Txt size={13} weight={600} color={T.t3}>{t('noReactionsYet')}</Txt>
                </div>
              )}
            </section>
          </div>
          <div style={{ height: 80 }} />
        </ScrollArea>

        <Toast msg={toast} visible={!!toast} />

        {/* ── Review modal ── */}
        {modalOpen && (
          <>
            <div onClick={() => { setModalOpen(false); setModalRating(0); setModalReaction(null); }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40 }} />

            <div className="safe-bottom-sheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, background: T.surface, borderRadius: '20px 20px 0 0', overflow: 'hidden', maxHeight: '88%', display: 'flex', flexDirection: 'column' }}>
              {/* handle + title */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, position: 'relative' }}>
                <div style={{ width: 36, height: 4, background: T.t4, borderRadius: 2, position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
                <Txt size={15} weight={700}>{t('rateEpisode')}</Txt>
                <button onClick={() => { setModalOpen(false); setModalRating(0); setModalReaction(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Icon name="close" size={18} color={T.t3} />
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 16px 0', flex: 1 }}>
                {/* Star rating */}
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{t('yourRating')}</Txt>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Stars value={modalRating} max={5} size={36} onChange={setModalRating} />
                  </div>
                  {modalRating > 0 && (
                    <Txt size={13} color={T.gold} weight={700} style={{ display: 'block', marginTop: 6 }}>
                      {'★'.repeat(modalRating)} {['', t('ratingLabel_1'), t('ratingLabel_2'), t('ratingLabel_3'), t('ratingLabel_4'), t('ratingLabel_5')][modalRating]}
                    </Txt>
                  )}
                </div>

                {/* Episode reaction */}
                <div style={{ marginBottom: 18 }}>
                  <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' }}>{t('yourReaction')}</Txt>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {EPISODE_REACTIONS.map(reaction => {
                      const selected = modalReaction === reaction.id;
                      return (
                        <button
                          key={reaction.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setModalReaction(current => current === reaction.id ? null : reaction.id)}
                          style={{
                            minHeight: 50, padding: '9px 12px', borderRadius: 14, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
                            background: selected ? `${reaction.color}20` : T.surface2,
                            border: `1px solid ${selected ? reaction.color : T.border}`,
                            fontFamily: "'Area','Inter',sans-serif",
                          }}>
                          <span aria-hidden style={{ fontSize: 21, lineHeight: 1 }}>{reaction.emoji}</span>
                          <Txt size={12} weight={700} color={selected ? T.t1 : T.t2}>{t(reaction.key)}</Txt>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div style={{ padding: '12px 16px calc(16px + var(--interactive-safe-bottom))', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                <button onClick={submitReview}
                  style={{ width: '100%', padding: '14px 0', borderRadius: T.radiusSm, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                  <Txt size={15} weight={700} color={T.white}>{t('publishReview')}</Txt>
                </button>
              </div>
            </div>
          </>
        )}
      </Screen>
    </Frame>
  );
}

/* ── Review card ── */
function ReviewCard({ rev, timeAgo, onLike, replyOpen, onToggleReply, replyText, onReplyChange, onSubmitReply }: {
  rev: Review & { liked?: boolean; gifUrl?: string };
  timeAgo: (d: string) => string;
  onLike: () => void;
  replyOpen: boolean;
  onToggleReply: () => void;
  replyText: string;
  onReplyChange: (v: string) => void;
  onSubmitReply: () => void;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const gifUrl = rev.gifUrl;

  return (
    <div style={{ padding: 14, background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: T.surface2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Txt size={11} weight={800} color={T.t2}>{rev.avatar}</Txt>
        </div>
        <div style={{ flex: 1 }}>
          <Txt size={13} weight={700} style={{ display: 'block' }}>{rev.user}</Txt>
          <Txt size={11} color={T.t4}>{timeAgo(rev.date)}</Txt>
        </div>
        {rev.rating > 0 && (
          <div style={{ display: 'flex', gap: 2 }}>
            {[...Array(5)].map((_, i) => (
              <Icon key={i} name="star" size={11} color={i < rev.rating ? T.gold : T.t4} />
            ))}
          </div>
        )}
      </div>

      {rev.text && (
        <Txt size={13} color={T.t2} style={{ lineHeight: 1.65, display: 'block', marginBottom: rev.gifUrl ? 10 : 12 }}>
          {rev.text}
        </Txt>
      )}

      {rev.gifUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rev.gifUrl}
          alt="GIF"
          style={{ width: '100%', borderRadius: 8, display: 'block', marginBottom: 12 }}
        />
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={onLike} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name={rev.liked ? 'heart' : 'heartO'} size={15} color={rev.liked ? T.red : T.t3} />
          <Txt size={12} color={rev.liked ? T.red : T.t3}>{rev.likes || 0}</Txt>
        </button>
        <button onClick={onToggleReply} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name="message" size={15} color={replyOpen ? T.pink : T.t3} />
          <Txt size={12} color={replyOpen ? T.pink : T.t3}>{i18next.t('comments.reply', { ns: 'title' })}</Txt>
        </button>
        {(rev.replies?.length ?? 0) > 0 && (
          <button onClick={() => setShowReplies(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Icon name="chevronD" size={13} color={T.t3} />
            <Txt size={12} color={T.t3}>{i18next.t('comments.replyCount', { ns: 'title', count: rev.replies!.length })}</Txt>
          </button>
        )}
      </div>

      {showReplies && rev.replies?.map(r => (
        <div key={r.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, paddingLeft: 12, borderLeft: `2px solid ${T.border}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <Txt size={12} weight={700}>{r.user}</Txt>
            <Txt size={10} color={T.t4}>{timeAgo(r.date)}</Txt>
          </div>
          <Txt size={12} color={T.t2}>{r.text}</Txt>
        </div>
      ))}

      {replyOpen && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input value={replyText} onChange={e => onReplyChange(e.target.value)}
            placeholder={i18next.t('comments.replyPlaceholderFull', { ns: 'title' })}
            style={{ flex: 1, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 20, color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '8px 14px', outline: 'none' }}
            onKeyDown={e => e.key === 'Enter' && onSubmitReply()}
          />
          <button onClick={onSubmitReply}
            style={{ width: 36, height: 36, borderRadius: 18, background: T.pink, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="chevronR" size={16} color={T.white} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Suspense wrapper required for useSearchParams ── */
export default function EpisodePage() {
  return (
    <Suspense>
      <EpisodePageInner />
    </Suspense>
  );
}

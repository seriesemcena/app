'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Stars, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { GlassHeader } from '@/components/primitives';
import { T } from '@/lib/tokens';
import { revStore, profileStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRatingSummaryStore, dbRevStore, type RatingSummary, type ReviewPageCursor } from '@/lib/db';
import { navigateBack } from '@/lib/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

type SortKey = 'recentes' | 'melhores' | 'piores';

function ReviewsPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation('title');

  const storageKey = sp.get('key') || '';
  const title      = sp.get('title') || t('tabs.reviews');
  const showName   = sp.get('showName') || '';

  const [reviews, setReviews]   = useState<Review[]>([]);
  const [sort, setSort]         = useState<SortKey>('recentes');
  const [toast, setToast]       = useState<string | false>(false);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [cursor, setCursor] = useState<ReviewPageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /* modal de nova avaliação */
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalRating, setModalRating] = useState(0);
  const [comment, setComment]         = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2200); };

  useEffect(() => {
    if (!storageKey) return;
    const local = revStore.get(storageKey);
    setReviews(local.slice(0, 20));
    setCursor(null);
    setHasMore(local.length > 20);
    if (!firebaseConfigured) return;
    dbRatingSummaryStore.get(getDB(), storageKey).then(setRatingSummary).catch(() => {});
    dbRevStore.getPage(getDB(), storageKey).then(page => {
      if (page.items.length > 0) {
        const cloudIds = new Set(page.items.map(r => r.id));
        const merged = [...local.filter(r => !cloudIds.has(r.id)).slice(0, Math.max(0, 20 - page.items.length)), ...page.items];
        setReviews(merged);
      }
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    }).catch(() => {});
  }, [storageKey]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    if (!firebaseConfigured) {
      const local = revStore.get(storageKey);
      setReviews(local.slice(0, reviews.length + 20));
      setHasMore(local.length > reviews.length + 20);
      return;
    }
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await dbRevStore.getPage(getDB(), storageKey, cursor);
      setReviews((current) => {
        const seen = new Set(current.map((review) => review.id));
        return [...current, ...page.items.filter((review) => !seen.has(review.id))];
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } finally { setLoadingMore(false); }
  };

  const submitReview = async () => {
    if (modalRating === 0 && !comment.trim()) { showToast(t('addRatingOrComment')); return; }
    const displayName  = user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const photoUrl     = user?.photoURL || profileStore.get().avatarImage || '';
    const newRev: Review = {
      id: `rev_${Date.now()}`,
      user: displayName,
      uid: user?.uid || '',
      avatar: avatarLetter,
      photoUrl,
      rating: modalRating * 2,   /* 1-5 stars → 2-10 scale */
      text: comment.trim(),
      date: new Date().toISOString(),
      likes: 0, likedBy: [], replies: [],
    };
    const updated = revStore.addReview(storageKey, newRev);
    setReviews(updated);
    setModalOpen(false); setModalRating(0); setComment('');
    showToast(t('reviewPublished'));
    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), storageKey, newRev); } catch {}
    }
  };

  const toggleLike = async (id: string) => {
    if (!user) { showToast('Faça login para curtir.'); return; }
    const updated = reviews.map(r => {
      if (r.id !== id) return r;
      const wasLiked = !!(r as any).liked;
      return { ...r, likes: (r.likes || 0) + (wasLiked ? -1 : 1), liked: !wasLiked } as Review;
    });
    setReviews(updated);
    revStore.set(storageKey, updated);
    if (firebaseConfigured) {
      try {
        const cloud = await dbRevStore.toggleLike(getDB(), storageKey, id, user.uid);
        if (cloud) {
          setReviews((current) => {
            const replacements = new Map(cloud.map((review) => [review.id, review]));
            return current.map((review) => replacements.get(review.id) || review);
          });
        }
      } catch {}
    }
  };

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

  const ratedReviews = reviews.filter((review) => review.rating > 0);
  const avgRating = ratingSummary?.total
    ? ratingSummary.average.toFixed(1)
    : ratedReviews.length
      ? (ratedReviews.reduce((sum, review) => sum + review.rating, 0) / ratedReviews.length).toFixed(1)
      : null;

  const sorted = [...reviews].sort((a, b) => {
    if (sort === 'melhores') return b.rating - a.rating;
    if (sort === 'piores')   return a.rating - b.rating;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'recentes', label: t('sort.recentes') },
    { key: 'melhores', label: t('sort.melhores') },
    { key: 'piores',   label: t('sort.piores')   },
  ];

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            left={
              <button onClick={() => navigateBack(router)}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                <Icon name="chevronL" size={16} color="#fff" />
              </button>
            }
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'Area',sans-serif" }}>{t('tabs.reviews')}</div>
              {showName && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: "'Area',sans-serif", marginTop: 1 }}>{showName}</div>
              )}
            </div>
          </GlassHeader>
          <div style={{ padding: '16px 16px 0' }}>

            {/* ── Título do episódio ── */}
            {title && (
              <Txt size={13} weight={700} color={T.t2} style={{ display: 'block', marginBottom: 16 }}>{title}</Txt>
            )}

            {/* ── Resumo da nota média ── */}
            {avgRating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: '#FFEB13', marginBottom: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: '#1a1400', lineHeight: 1, fontFamily: "'Greed','Area',sans-serif" }}>{avgRating}</div>
                  <div style={{ fontSize: 11, color: 'rgba(26,20,0,0.6)', marginTop: 2 }}>/10</div>
                </div>
                <div style={{ width: 1, height: 40, background: 'rgba(26,20,0,0.15)' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1400', fontFamily: "'Area',sans-serif" }}>
                    {t('reviewCount', { count: ratingSummary?.total ?? ratedReviews.length })}
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                    {[1,2,3,4,5].map(i => (
                      <Icon key={i} name="star" size={12} color={i <= Math.round(Number(avgRating) / 2) ? '#1a1400' : 'rgba(26,20,0,0.25)'} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Filtros ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {SORT_OPTIONS.map(({ key, label }) => (
                <button key={key} onClick={() => setSort(key)} style={{
                  padding: '7px 16px', borderRadius: 20, flexShrink: 0,
                  background: sort === key ? T.pillActiveBg : T.surface2,
                  border: sort === key ? 'none' : `1px solid ${T.border}`,
                  color: sort === key ? T.pillActiveText : T.t2,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Lista de avaliações ── */}
            {sorted.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Icon name="message" size={40} color={T.t4} />
                <Txt size={15} weight={700} color={T.t2} style={{ display: 'block', marginTop: 14, marginBottom: 6 }}>{t('noReviewsYet')}</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 24, lineHeight: 1.5 }}>
                  {t('beFirstEpisode')}
                </Txt>
                <button onClick={() => setModalOpen(true)}
                  style={{ padding: '12px 28px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                  <Txt size={14} weight={700} color="#fff">{t('rateNow')}</Txt>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sorted.map(rev => (
                  <ReviewCard key={rev.id} rev={rev} timeAgo={timeAgo} onLike={() => toggleLike(rev.id)} />
                ))}
                {hasMore && (
                  <button type="button" onClick={loadMore} disabled={loadingMore} style={{ alignSelf: 'center', marginTop: 6, padding: '10px 20px', borderRadius: 22, border: `1px solid ${T.border}`, background: T.surface2, color: T.t1, fontWeight: 700, cursor: loadingMore ? 'default' : 'pointer' }}>
                    {loadingMore ? 'Carregando…' : 'Carregar mais'}
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ height: 100 }} />
        </ScrollArea>

        {/* ── Botão fixo de avaliar ── */}
        <div className="keyboard-aware-bottom" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px calc(16px + var(--safe-area-right)) calc(16px + var(--interactive-safe-bottom)) calc(16px + var(--safe-area-left))', background: `linear-gradient(to bottom, transparent, ${T.bg} 40%)`, pointerEvents: 'none' }}>
          <button onClick={() => setModalOpen(true)}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}`, pointerEvents: 'auto' }}>
            <Txt size={15} weight={700} color="#fff">{t('addReviewBtn')}</Txt>
          </button>
        </div>

        <Toast msg={toast} visible={!!toast} />

        {/* ── Modal de avaliação ── */}
        {modalOpen && (
          <>
            <div onClick={() => setModalOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40 }} />
            <div className="safe-bottom-sheet keyboard-aware-bottom" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, background: T.surface, borderRadius: '20px 20px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, position: 'relative' }}>
                <div style={{ width: 36, height: 4, background: T.t4, borderRadius: 2, position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
                <Txt size={15} weight={700}>{t('rateEpisode')}</Txt>
                <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Icon name="close" size={18} color={T.t3} />
                </button>
              </div>
              <div style={{ padding: '20px 16px 0' }}>
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{t('yourRating')}</Txt>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Stars value={modalRating} max={5} size={36} onChange={setModalRating} />
                  </div>
                  {modalRating > 0 && (
                    <Txt size={13} weight={700} color={T.pink} style={{ display: 'block', marginTop: 6 }}>
                      {modalRating > 0 ? t(`ratingLabel_${modalRating}`) : ''}
                    </Txt>
                  )}
                </div>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={t('writeComment')}
                  rows={3}
                  maxLength={500}
                  style={{ width: '100%', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, color: T.white, fontSize: 14, fontFamily: "'Area','Inter',sans-serif", padding: '12px 14px', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 4 }}
                />
              </div>
              <div style={{ padding: '12px 16px calc(16px + var(--interactive-safe-bottom))', borderTop: `1px solid ${T.border}`, marginTop: 8 }}>
                <button onClick={submitReview}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                  <Txt size={15} weight={700} color="#fff">{t('publishReview')}</Txt>
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
function ReviewCard({ rev, timeAgo, onLike }: {
  rev: Review & { liked?: boolean };
  timeAgo: (d: string) => string;
  onLike: () => void;
}) {
  const liked = !!(rev as any).liked;
  return (
    <div style={{ padding: '14px 16px', background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
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
      {rev.text ? (
        <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.65, marginBottom: 10 }}>{rev.text}</Txt>
      ) : null}
      <button onClick={onLike}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <Icon name={liked ? 'heart' : 'heartO'} size={15} color={liked ? T.pink : T.t3} />
        <Txt size={12} color={liked ? T.pink : T.t3}>{(rev.likes || 0) + (liked ? 1 : 0)}</Txt>
      </button>
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense>
      <ReviewsPageInner />
    </Suspense>
  );
}

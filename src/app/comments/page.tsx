'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SocialAction, SocialAuthor, SocialCard, SocialMedia } from '@/components/SocialCard';
import { GlassHeader } from '@/components/primitives';
import { T } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';
import { revStore, profileStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { navigateBack } from '@/lib/navigation';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbActivityStore, dbRevStore, dbNotifStore } from '@/lib/db';
import { isAdminUser } from '@/lib/admin';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

type SortKey = 'recentes' | 'populares';

type Reply = NonNullable<Review['replies']>[number];

type GiphyGif = {
  id: string;
  title: string;
  images: { fixed_height_small: { url: string; width: string; height: string } };
};

function CommentsPageInner() {
  const router   = useRouter();
  const sp       = useSearchParams();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t }    = useTranslation('title');
  const isDark = theme === 'dark';

  const storageKey = sp.get('key')      || '';
  const title      = sp.get('title')    || 'Comentários';
  const showName   = sp.get('showName') || '';

  const [reviews, setReviews] = useState<Review[]>([]);
  const [sort, setSort]       = useState<SortKey>('recentes');
  const [toast, setToast]     = useState<string | false>(false);

  /* fixed composer */
  const [comment, setComment]           = useState('');
  const [showMore, setShowMore]         = useState(false);
  const [composerPanel, setComposerPanel] = useState<'gif' | 'image' | null>(null);
  const [spoiler, setSpoiler]           = useState(false);
  const [selectedGif, setSelectedGif]   = useState<GiphyGif | null>(null);
  const [imageDraft, setImageDraft]     = useState('');
  const [imageUrl, setImageUrl]         = useState('');
  const [gifSearch, setGifSearch]       = useState('');
  const [gifResults, setGifResults]     = useState<GiphyGif[]>([]);
  const [gifLoading, setGifLoading]     = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  /* reply state (comment state removed — now in /add-comment page) */
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText]     = useState('');
  const replyInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2200); };

  useEffect(() => {
    if (!storageKey) return;
    const local = revStore.get(storageKey);
    setReviews(local);
    if (!firebaseConfigured) return;
    dbRevStore.get(getDB(), storageKey).then(cloud => {
      if (cloud.length > 0) {
        const cloudIds = new Set(cloud.map(r => r.id));
        const merged = [...local.filter(r => !cloudIds.has(r.id)), ...cloud];
        setReviews(merged);
        revStore.set(storageKey, merged);
      }
    }).catch(() => {});
  }, [storageKey]);

  useEffect(() => {
    if (composerPanel !== 'gif') return;
    const timer = setTimeout(async () => {
      setGifLoading(true);
      try {
        const res = await fetch(`/api/giphy?q=${encodeURIComponent(gifSearch)}&limit=18`);
        const data = await res.json();
        setGifResults(data.data || []);
      } catch {
        setGifResults([]);
      }
      setGifLoading(false);
    }, gifSearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [composerPanel, gifSearch]);

  /* focus reply input whenever it opens */
  useEffect(() => {
    if (replyOpenId) setTimeout(() => replyInputRef.current?.focus(), 80);
  }, [replyOpenId]);

  const submitReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    const prof         = profileStore.get(user?.uid);
    const displayName  = prof.username || prof.name || user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const newReply: Reply = {
      id: `rep_${Date.now()}`,
      user: displayName,
      avatar: avatarLetter,
      text: replyText.trim(),
      date: new Date().toISOString(),
    };
    const updated = reviews.map(r =>
      r.id === reviewId
        ? { ...r, replies: [...(r.replies || []), newReply] }
        : r
    );
    setReviews(updated);
    revStore.set(storageKey, updated);
    setReplyText('');
    setReplyOpenId(null);
    showToast(t('comments.replySent'));
    if (firebaseConfigured) {
      try { await dbRevStore.addReply(getDB(), storageKey, reviewId, newReply); } catch {}
      // Notify the review author
      if (user) {
        const origReview = reviews.find(r => r.id === reviewId);
        const authorUid = origReview?.uid;
        if (authorUid && authorUid !== user.uid) {
          const { profileStore } = await import('@/lib/store');
          const myProf = profileStore.get(user.uid);
          const myUsername = myProf.username || user.email?.split('@')[0] || '';
          const myName = myProf.name || user.displayName || myUsername;
          dbNotifStore.add(getDB(), {
            recipientId: authorUid,
            category: 'account',
            type: 'comment_reply',
            actorId: user.uid,
            actorUsername: myUsername,
            actorName: myName,
            actorAvatarLetter: (myName[0] || 'U').toUpperCase(),
            actorAvatarImage: user.photoURL || myProf.avatarImage || '',
            titleKey: storageKey,
            titleName: showName || title,
            commentSnippet: origReview?.text?.slice(0, 80) || '',
            createdAt: new Date().toISOString(),
            link: `/comments?key=${encodeURIComponent(storageKey)}&title=${encodeURIComponent(title)}&showName=${encodeURIComponent(showName)}`,
          }).catch(() => {});
        }
      }
    }
  };

  const attachExternalImage = () => {
    try {
      const parsed = new URL(imageDraft.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
      setImageUrl(parsed.toString());
      setSelectedGif(null);
      setComposerPanel(null);
      setShowMore(false);
    } catch {
      showToast(t('comments.invalidImageUrl'));
    }
  };

  const submitComment = async () => {
    if (!comment.trim() && !selectedGif && !imageUrl) {
      showToast(t('comments.emptyComposer'));
      composerRef.current?.focus();
      return;
    }
    const prof         = profileStore.get(user?.uid);
    const displayName  = prof.username || prof.name || user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const newReview: Review = {
      id: `rev_${Date.now()}`,
      user: displayName,
      uid: user?.uid || '',
      avatar: avatarLetter,
      photoUrl: user?.photoURL || prof.avatarImage || '',
      rating: 0,
      text: comment.trim(),
      gifUrl: selectedGif?.images.fixed_height_small.url || '',
      imageUrl,
      spoiler,
      date: new Date().toISOString(),
      likes: 0,
      likedBy: [],
      replies: [],
    };

    setReviews(current => [newReview, ...current]);
    revStore.addReview(storageKey, newReview);
    setSort('recentes');
    setComment('');
    setSelectedGif(null);
    setImageUrl('');
    setImageDraft('');
    setSpoiler(false);
    setShowMore(false);
    setComposerPanel(null);
    showToast(t('comments.published'));

    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), storageKey, newReview); } catch {}
      if (user) {
        try {
          await dbActivityStore.add(getDB(), {
            uid: user.uid,
            reviewId: newReview.id,
            username: displayName,
            avatar: avatarLetter,
            photoUrl: newReview.photoUrl || '',
            titleKey: storageKey,
            titleName: showName || title,
            poster: null,
            action: 'reviewed',
            rating: 0,
            text: newReview.text,
            mediaUrl: newReview.gifUrl || newReview.imageUrl || '',
            spoiler: newReview.spoiler,
            createdAt: newReview.date,
          });
        } catch {}
      }
    }
  };

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const reportComment = (rev: Review) => setReportTarget({
    kind: 'comment',
    targetId: rev.id,
    titleKey: storageKey,
    targetLabel: [showName, title].filter(Boolean).join(' · ') || storageKey,
    contentSnippet: rev.text || rev.gifUrl || '',
    reportedUser: rev.user,
  });

  /* Author or admin — the Firestore rules enforce the same pair server-side,
     so the doc really goes away for every user and device. */
  const deleteComment = async (id: string) => {
    if (!window.confirm('Excluir este comentário?')) return;
    const updated = reviews.filter(r => r.id !== id);
    setReviews(updated);
    revStore.set(storageKey, updated);
    if (firebaseConfigured) {
      try { await dbRevStore.remove(getDB(), storageKey, id); } catch {}
    }
    showToast('Comentário excluído.');
  };

  const toggleLike = async (id: string) => {
    // Anonymous likes shared one identity ('anon') — one visitor's like
    // removed another's. Liking now requires a signed-in account.
    if (!user) { showToast('Faça login para curtir.'); return; }
    const reviewToLike = reviews.find(r => r.id === id);
    const isNewLike = reviewToLike ? !reviewToLike.likedBy?.includes(user?.uid ?? '') : false;

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
        if (cloud) { setReviews(cloud); revStore.set(storageKey, cloud); }
      } catch {}
      // Notify the review author on new like
      if (isNewLike && user) {
        const authorUid = reviewToLike?.uid;
        if (authorUid && authorUid !== user.uid) {
          const { profileStore } = await import('@/lib/store');
          const myProf = profileStore.get(user.uid);
          const myUsername = myProf.username || user.email?.split('@')[0] || '';
          const myName = myProf.name || user.displayName || myUsername;
          dbNotifStore.add(getDB(), {
            recipientId: authorUid,
            category: 'account',
            type: 'comment_like',
            actorId: user.uid,
            actorUsername: myUsername,
            actorName: myName,
            actorAvatarLetter: (myName[0] || 'U').toUpperCase(),
            actorAvatarImage: user.photoURL || myProf.avatarImage || '',
            titleKey: storageKey,
            titleName: showName || title,
            commentSnippet: reviewToLike?.text?.slice(0, 80) || '',
            createdAt: new Date().toISOString(),
            link: `/comments?key=${encodeURIComponent(storageKey)}&title=${encodeURIComponent(title)}&showName=${encodeURIComponent(showName)}`,
          }).catch(() => {});
        }
      }
    }
  };

  const goToProfile = (username: string) =>
    router.push(`/user/${encodeURIComponent(username)}`);

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

  /* Only show reviews that have text or attached media */
  const withText = reviews.filter(r => r.text || r.gifUrl || r.imageUrl);

  const sorted = [...withText].sort((a, b) => {
    if (sort === 'populares') return (b.likes || 0) - (a.likes || 0);
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'recentes',  label: t('comments.sort.recentes') },
    { key: 'populares', label: t('comments.sort.populares') },
  ];

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            left={
              <button onClick={() => navigateBack(router)}
                style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' } as React.CSSProperties}>
                <Icon name="chevronL" size={16} color={isDark ? '#fff' : 'rgba(0,0,0,0.70)'} />
              </button>
            }
            right={
              <button onClick={() => router.push('/notifications')}
                style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' } as React.CSSProperties}>
                <Icon name="bell" size={16} color={isDark ? '#fff' : 'rgba(0,0,0,0.70)'} />
              </button>
            }
          />
          <div style={{ padding: '16px 16px 0' }}>

            {/* ── Título ── */}
            <Txt size={22} weight={800} style={{ display: 'block', marginBottom: 2, fontStretch: 'condensed' } as React.CSSProperties}>
              {t('comments.title')}
            </Txt>
            {(showName || title) && (
              <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 20 }}>
                {[showName, title].filter(Boolean).join(' · ')}
              </Txt>
            )}

            {/* ── Filtros ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {SORT_OPTIONS.map(({ key, label }) => (
                <button key={key} onClick={() => setSort(key)} style={{
                  padding: '7px 16px', borderRadius: 20, flexShrink: 0,
                  background: sort === key ? T.pink : T.surface2,
                  border: sort === key ? 'none' : `1px solid ${T.border}`,
                  color: sort === key ? '#fff' : T.t2,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Lista de comentários ── */}
            {sorted.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Icon name="message" size={40} color={T.t4} />
                <Txt size={15} weight={700} color={T.t2} style={{ display: 'block', marginTop: 14, marginBottom: 6 }}>{t('comments.empty')}</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 24, lineHeight: 1.5 }}>
                  {t('comments.beFirst')}
                </Txt>
                <button onClick={() => composerRef.current?.focus()}
                  style={{ padding: '12px 28px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                  <Txt size={14} weight={700} color="#fff">{t('comments.commentNow')}</Txt>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sorted.map(rev => (
                  <CommentCard
                    key={rev.id}
                    rev={rev}
                    timeAgo={timeAgo}
                    onLike={() => toggleLike(rev.id)}
                    onProfile={goToProfile}
                    replyOpen={replyOpenId === rev.id}
                    onToggleReply={() => {
                      setReplyOpenId(id => id === rev.id ? null : rev.id);
                      setReplyText('');
                    }}
                    replyText={replyText}
                    onReplyChange={setReplyText}
                    onSubmitReply={() => submitReply(rev.id)}
                    replyInputRef={replyOpenId === rev.id ? replyInputRef : undefined}
                    onDelete={(rev.uid && rev.uid === user?.uid) || isAdminUser(user)
                      ? () => deleteComment(rev.id)
                      : undefined}
                    onReport={rev.uid !== user?.uid ? () => reportComment(rev) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ height: 150 }} />
        </ScrollArea>

        {/* ── Compositor fixo de comentários ── */}
        <div className="keyboard-aware-bottom" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, padding: '48px calc(12px + var(--safe-area-right)) calc(12px + var(--interactive-safe-bottom)) calc(12px + var(--safe-area-left))', background: `linear-gradient(to bottom, transparent, ${T.bg} 34%)` }}>

          {/* More menu */}
          {showMore && !composerPanel && (
            <div style={{ position: 'absolute', bottom: 'calc(100% - 48px)', left: 12, width: 250, background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.34)' }}>
              {[
                { label: spoiler ? t('comments.spoilerOn') : t('comments.markSpoiler'), icon: 'eye' as const, action: () => { setSpoiler(v => !v); setShowMore(false); } },
                { label: t('comments.addGif'), icon: 'film' as const, action: () => setComposerPanel('gif' as const) },
                { label: t('comments.useImage'), icon: 'plus' as const, action: () => setComposerPanel('image' as const) },
              ].map((option, index, all) => (
                <button
                  type="button"
                  key={option.label}
                  onClick={option.action}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', borderBottom: index < all.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Icon name={option.icon} size={17} color={spoiler && index === 0 ? T.pink : T.t2} />
                  <Txt size={13} weight={700} color={spoiler && index === 0 ? T.pink : T.t1}>{option.label}</Txt>
                </button>
              ))}
            </div>
          )}

          {/* Giphy window */}
          {composerPanel === 'gif' && (
            <div style={{ position: 'absolute', bottom: 'calc(100% - 48px)', left: 12, right: 12, maxHeight: '52vh', background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 12, boxShadow: '0 12px 36px rgba(0,0,0,0.34)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input
                  value={gifSearch}
                  onChange={e => setGifSearch(e.target.value)}
                  placeholder={t('searchGif')}
                  autoFocus
                  style={{ flex: 1, minWidth: 0, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 18, color: T.t1, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '9px 13px', outline: 'none' }}
                />
                <Txt size={10} weight={800} color={T.t4}>GIPHY</Txt>
                <button type="button" onClick={() => setComposerPanel(null)} aria-label="Fechar GIFs" style={{ width: 32, height: 32, borderRadius: 16, background: T.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="close" size={13} color={T.t2} />
                </button>
              </div>
              {gifLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}><Txt size={12} color={T.t3}>{t('loadingGif')}</Txt></div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, maxHeight: '42vh', overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                  {gifResults.map(gif => (
                    <button
                      type="button"
                      key={gif.id}
                      onClick={() => { setSelectedGif(gif); setImageUrl(''); setImageDraft(''); setComposerPanel(null); setShowMore(false); }}
                      style={{ height: 96, padding: 0, border: 'none', borderRadius: 9, overflow: 'hidden', background: T.surface2, cursor: 'pointer' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={gif.images.fixed_height_small.url} alt={gif.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* External image URL window */}
          {composerPanel === 'image' && (
            <div style={{ position: 'absolute', bottom: 'calc(100% - 48px)', left: 12, right: 12, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 14, boxShadow: '0 12px 36px rgba(0,0,0,0.34)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Txt size={14} weight={800}>{t('comments.useImage')}</Txt>
                <button type="button" onClick={() => setComposerPanel(null)} aria-label="Fechar imagem" style={{ width: 30, height: 30, borderRadius: 15, background: T.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="close" size={13} color={T.t2} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={imageDraft}
                  onChange={e => setImageDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && attachExternalImage()}
                  placeholder={t('comments.imageUrlPlaceholder')}
                  autoFocus
                  inputMode="url"
                  style={{ flex: 1, minWidth: 0, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 18, color: T.t1, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '10px 13px', outline: 'none' }}
                />
                <button type="button" onClick={attachExternalImage} style={{ border: 'none', borderRadius: 18, background: T.pink, color: '#fff', padding: '0 14px', fontFamily: "'Area','Inter',sans-serif", fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  {t('comments.attachImage')}
                </button>
              </div>
            </div>
          )}

          {/* Composer dock */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 22, padding: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.24)' }}>
            {(selectedGif || imageUrl || spoiler) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px 8px' }}>
                {spoiler && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 13, background: 'rgba(192,105,255,0.14)' }}>
                    <Icon name="eye" size={13} color={T.pink} />
                    <Txt size={10} weight={800} color={T.pink}>{t('comments.spoilerOn')}</Txt>
                  </div>
                )}
                {(selectedGif || imageUrl) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedGif?.images.fixed_height_small.url || imageUrl} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                    <Txt size={10} color={T.t3} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedGif ? 'GIF' : imageUrl}</Txt>
                    <button type="button" onClick={() => { setSelectedGif(null); setImageUrl(''); setImageDraft(''); }} aria-label={t('comments.removeAttachment')} style={{ width: 26, height: 26, borderRadius: 13, background: T.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <Icon name="close" size={11} color={T.t2} />
                    </button>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (showMore || composerPanel) { setShowMore(false); setComposerPanel(null); }
                  else setShowMore(true);
                }}
                aria-label={t('comments.moreOptions')}
                style={{ width: 40, height: 40, borderRadius: 20, background: showMore || composerPanel ? T.pink : T.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <Icon name={showMore || composerPanel ? 'close' : 'plus'} size={17} color={showMore || composerPanel ? '#fff' : T.t2} />
              </button>
              <textarea
                ref={composerRef}
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={t('comments.composerPlaceholder')}
                maxLength={500}
                rows={1}
                style={{ flex: 1, minWidth: 0, minHeight: 40, maxHeight: 92, resize: 'none', overflowY: 'auto', boxSizing: 'border-box', background: T.surface2, border: 'none', borderRadius: 20, color: T.t1, fontSize: 14, lineHeight: 1.4, fontFamily: "'Area','Inter',sans-serif", padding: '10px 14px', outline: 'none' }}
              />
              <button
                type="button"
                onClick={submitComment}
                disabled={!comment.trim() && !selectedGif && !imageUrl}
                style={{ minHeight: 40, padding: '0 14px', borderRadius: 20, background: comment.trim() || selectedGif || imageUrl ? T.pink : T.surface2, border: 'none', color: comment.trim() || selectedGif || imageUrl ? '#fff' : T.t4, fontFamily: "'Area','Inter',sans-serif", fontSize: 12, fontWeight: 800, cursor: comment.trim() || selectedGif || imageUrl ? 'pointer' : 'default', flexShrink: 0 }}
              >
                {t('comments.publish')}
              </button>
            </div>
          </div>
        </div>

        <Toast msg={toast} visible={!!toast} />
        <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />

      </Screen>
    </Frame>
  );
}

/* ── Comment card ── */
function CommentCard({ rev, timeAgo, onLike, onProfile, replyOpen, onToggleReply, replyText, onReplyChange, onSubmitReply, replyInputRef, onDelete, onReport }: {
  rev: Review & { liked?: boolean };
  timeAgo: (d: string) => string;
  onLike: () => void;
  onProfile: (username: string) => void;
  replyOpen: boolean;
  onToggleReply: () => void;
  replyText: string;
  onReplyChange: (v: string) => void;
  onSubmitReply: () => void;
  replyInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Present for the comment's author and for admins (moderation). */
  onDelete?: () => void;
  /** Present for everyone except the comment's author. */
  onReport?: () => void;
}) {
  const { t }         = useTranslation('title');
  const liked         = !!(rev as any).liked;
  const [showReplies, setShowReplies] = useState(false);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const replyCount    = rev.replies?.length ?? 0;
  const mediaUrl      = rev.gifUrl || rev.imageUrl || '';
  const spoilerHidden = !!rev.spoiler && !spoilerRevealed;

  return (
    <SocialCard>

      {/* ── Author row (clickable → profile) ── */}
      <div style={{ marginBottom: 12 }}>
        <SocialAuthor
          name={rev.user}
          time={timeAgo(rev.date)}
          avatar={rev.avatar}
          photoUrl={rev.photoUrl}
          onClick={() => onProfile(rev.user)}
        />
      </div>

      {/* ── Comment content / spoiler cover ── */}
      <div style={{ position: 'relative', minHeight: spoilerHidden ? 76 : undefined, marginBottom: 12, overflow: 'hidden', borderRadius: 16 }}>
        <div style={{ filter: spoilerHidden ? 'blur(12px)' : 'none', transform: spoilerHidden ? 'scale(1.03)' : 'none', transition: 'filter 0.2s ease, transform 0.2s ease', pointerEvents: spoilerHidden ? 'none' : 'auto', userSelect: spoilerHidden ? 'none' : 'auto' }}>
          {rev.text ? (
            <Txt size={15} color={T.t1} style={{ display: 'block', lineHeight: 1.55, marginBottom: mediaUrl ? 12 : 0 }}>{rev.text}</Txt>
          ) : null}
          {mediaUrl && <SocialMedia src={mediaUrl} alt={rev.gifUrl ? 'GIF do comentário' : 'Imagem do comentário'} />}
        </div>
        {spoilerHidden && (
          <button
            type="button"
            onClick={() => setSpoilerRevealed(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(18,18,22,0.56)', border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="eye" size={16} color="#fff" />
              <Txt size={12} weight={800} color="#fff">{t('comments.spoilerWarning')}</Txt>
            </div>
            <Txt size={10} color="rgba(255,255,255,0.7)">{t('comments.tapToReveal')}</Txt>
          </button>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SocialAction icon="message" active={replyOpen} onClick={onToggleReply} ariaLabel={t('comments.reply')}>
          <Txt size={12} weight={700} color="currentColor">{replyCount || t('comments.reply')}</Txt>
        </SocialAction>
        <SocialAction icon={liked ? 'heart' : 'heartO'} active={liked} onClick={onLike} ariaLabel="Curtir comentário">
          <Txt size={12} weight={700} color="currentColor">{(rev.likes || 0) + (liked ? 1 : 0)}</Txt>
        </SocialAction>
        {onDelete && (
          <button onClick={onDelete} aria-label="Excluir comentário"
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '7px 4px' }}>
            <Icon name="close" size={14} color={T.red ?? '#ff4444'} />
          </button>
        )}
        {onReport && (
          <button onClick={onReport} aria-label="Denunciar comentário"
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '7px 4px' }}>
            <Icon name="flag" size={14} color={T.t4} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        {replyCount > 0 && (
          <button onClick={() => setShowReplies(s => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '7px 2px' }}>
            <Txt size={11} weight={600} color={T.t4}>{showReplies ? 'Ocultar' : t('comments.replyCount', { count: replyCount })}</Txt>
            <Icon name={showReplies ? 'chevronR' : 'chevronD'} size={12} color={T.t4} />
          </button>
        )}
      </div>

      {/* ── Reply input ── */}
      {replyOpen && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            ref={replyInputRef}
            value={replyText}
            onChange={e => onReplyChange(e.target.value)}
            placeholder={t('comments.replyPlaceholderFull')}
            maxLength={300}
            onKeyDown={e => e.key === 'Enter' && onSubmitReply()}
            style={{ flex: 1, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 20, color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '9px 14px', outline: 'none' }}
          />
          <button onClick={onSubmitReply}
            style={{ width: 36, height: 36, borderRadius: 18, background: T.pink, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="chevronR" size={16} color="#fff" />
          </button>
        </div>
      )}

      {/* ── Replies list ── */}
      {showReplies && replyCount > 0 && (
        <div style={{ marginTop: 12, paddingLeft: 14, borderLeft: `2px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rev.replies!.map(r => (
            <div key={r.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 26, height: 26, borderRadius: 13, background: T.surface2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Txt size={10} weight={800} color={T.t2}>{r.avatar}</Txt>
                </div>
                <Txt size={12} weight={700}>{r.user}</Txt>
                <Txt size={10} color={T.t4}>{timeAgo(r.date)}</Txt>
              </div>
              <Txt size={12} color={T.t2} style={{ display: 'block', lineHeight: 1.6, paddingLeft: 34 }}>{r.text}</Txt>
            </div>
          ))}
        </div>
      )}
    </SocialCard>
  );
}

export default function CommentsPage() {
  return (
    <Suspense>
      <CommentsPageInner />
    </Suspense>
  );
}

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
import { revStore, profileStore, blockStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { useResolvedAvatar } from '@/hooks/useResolvedAvatar';
import { useModerator } from '@/hooks/useModerator';
import { navigateBack } from '@/lib/navigation';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbActivityStore, dbRevStore, dbNotifStore, dbProfileStore, type ReviewPageCursor } from '@/lib/db';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';
import { useAuthGate } from '@/components/AuthGateSheet';
import { GiphyImage } from '@/components/GiphyImage';
import { useTranslation } from 'react-i18next';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { fetchGiphyGifs, giphyDisplayUrl, type GiphyGif } from '@/lib/giphy';
import '@/lib/i18n';

type SortKey = 'recentes' | 'populares';

type Reply = NonNullable<Review['replies']>[number];

type ReplyDraft = {
  text: string;
  gifUrl: string;
  imageUrl: string;
  spoiler: boolean;
};

function CommentsPageInner() {
  const router   = useRouter();
  const sp       = useSearchParams();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t }    = useTranslation('title');
  const isDark = theme === 'dark';
  const isModerator = useModerator();

  const storageKey = sp.get('key')      || '';
  const title      = sp.get('title')    || 'Comentários';
  const showName   = sp.get('showName') || '';
  const replyTarget = sp.get('replyTo') || '';
  const selectedCommentId = sp.get('commentId') || replyTarget;
  const episodeMatch = storageKey.match(/^ep_.+_s(\d+)_e(\d+)$/i);
  const contentTitle = showName || title;
  const episodeLabel = episodeMatch
    ? t('comments.episodeContext', {
        season: Number(episodeMatch[1]),
        episode: Number(episodeMatch[2]),
      })
    : '';

  const [reviews, setReviews] = useState<Review[]>([]);
  const [sort, setSort]       = useState<SortKey>('recentes');
  const [toast, setToast]     = useState<string | false>(false);
  const [pageCursor, setPageCursor] = useState<ReviewPageCursor | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const requestGeneration = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* fixed composer */
  const [composerExpanded, setComposerExpanded] = useState(false);
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
  const openedReplyTargetRef = useRef('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2200); };
  const { promptSignIn, authGate } = useAuthGate();

  const openComposer = () => {
    if (!user) { promptSignIn('comment'); return; }
    setReplyOpenId(null);
    setComposerExpanded(true);
    setTimeout(() => composerRef.current?.focus(), 80);
  };

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setPageCursor(null);
    setHasMoreComments(false);
    setPageError('');
    setPageLoading(false);
    if (!storageKey) { setReviews([]); return; }
    const local = revStore.get(storageKey).slice(0, 20);
    setReviews(local);
    if (!firebaseConfigured) return;
    setPageLoading(true);
    dbRevStore.getPage(getDB(), storageKey).then(async page => {
      if (generation !== requestGeneration.current) return;
      const selected = selectedCommentId
        && !page.items.some(review => review.id === selectedCommentId)
        && !local.some(review => review.id === selectedCommentId)
        ? await dbRevStore.getById(getDB(), storageKey, selectedCommentId)
        : null;
      if (generation !== requestGeneration.current) return;
      const cloudItems = selected ? [selected, ...page.items] : page.items;
      const cloudIds = new Set(cloudItems.map(r => r.id));
      const merged = [...cloudItems, ...local.filter(r => !cloudIds.has(r.id))].slice(0, 21);
      setReviews(merged);
      revStore.set(storageKey, merged);
      setPageCursor(page.cursor);
      setHasMoreComments(page.hasMore);
      // Second pass: replace the embedded legacy replies with the real per-reply
      // subcollection docs so likes and deletions act on the migrated documents.
      const hydrated = await hydrateReplies(merged);
      if (generation !== requestGeneration.current) return;
      setReviews(hydrated);
      revStore.set(storageKey, hydrated);
    }).catch(() => {
      if (generation === requestGeneration.current) setPageError('Não foi possível atualizar os comentários.');
    }).finally(() => {
      if (generation === requestGeneration.current) setPageLoading(false);
    });
    return () => { requestGeneration.current += 1; };
  }, [selectedCommentId, storageKey]);

  const loadMoreComments = async () => {
    if (!firebaseConfigured || !storageKey || !pageCursor || !hasMoreComments || pageLoading) return;
    const generation = requestGeneration.current;
    setPageLoading(true);
    setPageError('');
    try {
      const page = await dbRevStore.getPage(getDB(), storageKey, pageCursor);
      if (generation !== requestGeneration.current) return;
      setReviews((current) => {
        const seen = new Set(current.map((review) => review.id));
        const merged = [...current, ...page.items.filter((review) => !seen.has(review.id))];
        revStore.set(storageKey, merged);
        return merged;
      });
      setPageCursor(page.cursor);
      setHasMoreComments(page.hasMore);
    } catch {
      if (generation === requestGeneration.current) setPageError('Não foi possível carregar mais comentários.');
    } finally {
      if (generation === requestGeneration.current) setPageLoading(false);
    }
  };

  const {
    sentinelRef: commentsSentinelRef,
    observerSupported: commentsObserverSupported,
  } = useInfiniteScroll({
    rootRef: scrollRef,
    hasMore: hasMoreComments,
    loading: pageLoading,
    onLoadMore: loadMoreComments,
    enabled: !pageError,
  });

  useEffect(() => {
    if (composerPanel !== 'gif') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setGifLoading(true);
      try {
        setGifResults(await fetchGiphyGifs(gifSearch, 18, controller.signal));
      } catch {
        if (!controller.signal.aborted) setGifResults([]);
      } finally {
        if (!controller.signal.aborted) setGifLoading(false);
      }
    }, gifSearch ? 350 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [composerPanel, gifSearch]);

  /* Deep links from the feed open the matching reply editor immediately. */
  useEffect(() => {
    if (!replyTarget || openedReplyTargetRef.current === replyTarget) return;
    if (!reviews.some(review => review.id === replyTarget)) return;
    openedReplyTargetRef.current = replyTarget;
    setReplyOpenId(replyTarget);
  }, [replyTarget, reviews]);

  const submitReply = async (reviewId: string, draft: ReplyDraft) => {
    if (!draft.text.trim() && !draft.gifUrl && !draft.imageUrl) return;
    const prof         = profileStore.get(user?.uid);
    const displayName  = prof.username || prof.name || user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const newReply: Reply = {
      id: `rep_${Date.now()}`,
      uid: user?.uid,
      user: displayName,
      avatar: avatarLetter,
      photoUrl: user?.photoURL || prof.avatarImage || '',
      text: draft.text.trim(),
      gifUrl: draft.gifUrl,
      imageUrl: draft.imageUrl,
      spoiler: draft.spoiler,
      date: new Date().toISOString(),
    };
    const updated = reviews.map(r =>
      r.id === reviewId
        ? { ...r, replies: [...(r.replies || []), newReply] }
        : r
    );
    setReviews(updated);
    revStore.set(storageKey, updated);
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
      gifUrl: selectedGif ? giphyDisplayUrl(selectedGif) : '',
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
    setComposerExpanded(false);
    showToast(t('comments.published'));

    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), storageKey, newReview); } catch {}
      if (user) {
        try {
          await dbActivityStore.add(getDB(), {
            uid: user.uid,
            userId: user.uid,
            reviewId: newReview.id,
            username: displayName,
            authorUsername: prof.username || displayName,
            authorName: prof.name || user.displayName || displayName,
            avatar: avatarLetter,
            photoUrl: prof.avatarThumbImage || newReview.photoUrl || '',
            authorAvatarUrl: prof.avatarThumbImage || newReview.photoUrl || '',
            titleKey: storageKey,
            titleId: storageKey,
            titleName: showName || title,
            titleType: storageKey.startsWith('ep_') ? 'episode' : storageKey.startsWith('tv_') ? 'tv' : 'movie',
            titleImageUrl: null,
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
    contentType: 'comment',
    contentId: rev.id,
    targetId: rev.id,
    titleKey: storageKey,
    targetLabel: [showName, title].filter(Boolean).join(' · ') || storageKey,
    contentSnippet: rev.text || rev.gifUrl || '',
    reportedUser: rev.user,
    reportedUserId: rev.uid,
    titleId: storageKey,
  });
  const reportReply = (rev: Review, reply: Reply) => setReportTarget({
    kind: 'comment',
    contentType: 'reply',
    contentId: reply.id,
    parentContentId: rev.id,
    targetId: reply.id,
    titleKey: storageKey,
    targetLabel: [showName, title].filter(Boolean).join(' · ') || storageKey,
    contentSnippet: reply.text || reply.gifUrl || reply.imageUrl || '',
    reportedUser: reply.user,
    reportedUserId: reply.uid,
    titleId: storageKey,
  });

  /* Author or admin — the Firestore rules enforce the same pair server-side,
     so the doc really goes away for every user and device. */
  const deleteComment = async (id: string) => {
    if (!window.confirm('Excluir este comentário?')) return;
    const target = reviews.find(review => review.id === id);
    if (firebaseConfigured) {
      try {
        const db = getDB();
        await dbRevStore.remove(db, storageKey, id);
        if (target) {
          await dbActivityStore.deleteForReview(db, {
            reviewId: id,
            titleKey: storageKey,
            uid: target.uid,
            username: target.user,
            text: target.text,
            rating: target.rating || 0,
            createdAt: target.date,
          });
        }
      } catch (error) {
        console.error('[comments] Falha ao excluir comentário:', error);
        showToast('Não foi possível excluir o comentário.');
        return;
      }
    }

    // Only update local state after the cloud operation succeeds. A missing
    // cloud document is valid for comments that exist exclusively on-device.
    const updated = reviews.filter(r => r.id !== id);
    setReviews(updated);
    revStore.set(storageKey, updated);
    showToast('Comentário excluído.');
  };

  const toggleLike = async (id: string) => {
    // Anonymous likes shared one identity ('anon') — one visitor's like
    // removed another's. Liking now requires a signed-in account.
    if (!user) { promptSignIn('like'); return; }
    const reviewToLike = reviews.find(r => r.id === id);
    const isNewLike = reviewToLike ? !reviewToLike.likedBy?.includes(user.uid) : false;
    const previous = reviews;

    const updated = reviews.map(r => {
      if (r.id !== id) return r;
      const likedBy = [...(r.likedBy || [])];
      const index = likedBy.indexOf(user.uid);
      if (index >= 0) likedBy.splice(index, 1);
      else likedBy.push(user.uid);
      return { ...r, likedBy, likes: likedBy.length };
    });
    setReviews(updated);
    revStore.set(storageKey, updated);
    if (firebaseConfigured) {
      try {
        const cloud = await dbRevStore.toggleLike(getDB(), storageKey, id, user.uid);
        if (cloud) {
          setReviews((current) => {
            const replacements = new Map(cloud.map((review) => [review.id, review]));
            const merged = current.map((review) => replacements.get(review.id) || review);
            revStore.set(storageKey, merged);
            return merged;
          });
        }
      } catch (error) {
        console.error('[comments] Falha ao atualizar curtida:', error);
        setReviews(previous);
        revStore.set(storageKey, previous);
        showToast('Não foi possível atualizar a curtida.');
        return;
      }
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

  /** Fold each review's per-reply subcollection into rev.replies, merged over
      any legacy array reply, so the card renders the real reply docs (with
      likes and per-reply deletion). */
  const hydrateReplies = async (list: Review[]): Promise<Review[]> => {
    if (!firebaseConfigured || !storageKey) return list;
    return Promise.all(list.map(async (review) => {
      const subReplies = await dbRevStore.getReplies(getDB(), storageKey, review.id);
      if (subReplies.length === 0) return review;
      const subIds = new Set(subReplies.map((reply) => reply.id));
      const legacyOnly = (review.replies || []).filter((reply) => !subIds.has(reply.id));
      return {
        ...review,
        replies: [...subReplies, ...legacyOnly].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
      };
    }));
  };

  const toggleReplyLike = async (reviewId: string, replyId: string) => {
    if (!user) { promptSignIn('like'); return; }
    const previous = reviews;
    const updated = reviews.map((review) => {
      if (review.id !== reviewId) return review;
      return {
        ...review,
        replies: (review.replies || []).map((reply) => {
          if (reply.id !== replyId) return reply;
          const likedBy = [...(reply.likedBy || [])];
          const index = likedBy.indexOf(user.uid);
          if (index >= 0) likedBy.splice(index, 1); else likedBy.push(user.uid);
          return { ...reply, likedBy, likes: likedBy.length };
        }),
      };
    });
    setReviews(updated);
    revStore.set(storageKey, updated);
    if (!firebaseConfigured) return;
    try {
      const result = await dbRevStore.toggleReplyLike(getDB(), storageKey, reviewId, replyId, user.uid);
      // A null result means the reply doc does not exist yet (legacy, not
      // migrated); revert so we never show a like the backend did not store.
      if (result === null) {
        setReviews(previous);
        revStore.set(storageKey, previous);
        showToast('Esta resposta ainda está sendo sincronizada. Tente em instantes.');
      }
    } catch {
      setReviews(previous);
      revStore.set(storageKey, previous);
      showToast('Não foi possível atualizar a curtida.');
    }
  };

  const deleteReply = async (reviewId: string, replyId: string) => {
    if (!user) return;
    if (!window.confirm('Excluir esta resposta?')) return;
    const previous = reviews;
    const updated = reviews.map((review) => (
      review.id === reviewId
        ? { ...review, replies: (review.replies || []).filter((reply) => reply.id !== replyId) }
        : review
    ));
    setReviews(updated);
    revStore.set(storageKey, updated);
    if (!firebaseConfigured) return;
    try {
      await dbRevStore.removeReply(getDB(), storageKey, reviewId, replyId);
    } catch {
      setReviews(previous);
      revStore.set(storageKey, previous);
      showToast('Não foi possível excluir a resposta.');
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

  /* Only show reviews that have text or attached media, and hide content
     from blocked users — including their replies inside other people's
     threads (App Store 1.2 requirement). */
  const withText = reviews
    .filter(r => (r.text || r.gifUrl || r.imageUrl) && !blockStore.isBlocked(r.uid))
    .map(r => r.replies?.some(rep => blockStore.isBlocked(rep.uid))
      ? { ...r, replies: r.replies.filter(rep => !blockStore.isBlocked(rep.uid)) }
      : r);

  const sorted = [...withText].sort((a, b) => {
    if (sort === 'populares') return (b.likes || 0) - (a.likes || 0);
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  const focusedComments = selectedCommentId
    ? sorted.filter(review => review.id === selectedCommentId)
    : sorted;

  const showAllComments = () => {
    const params = new URLSearchParams({
      key: storageKey,
      title,
    });
    if (showName) params.set('showName', showName);
    router.push(`/comments?${params.toString()}`);
  };

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'recentes',  label: t('comments.sort.recentes') },
    { key: 'populares', label: t('comments.sort.populares') },
  ];

  return (
    <Frame>
      <Screen>
        <ScrollArea ref={scrollRef}>
          <GlassHeader
            navTitle={t('comments.title')}
            showNavTitle
            showLogo={false}
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
            <Txt size={22} weight={800} style={{ display: 'block', marginBottom: episodeLabel ? 2 : 20, fontStretch: 'condensed' } as React.CSSProperties}>
              {contentTitle}
            </Txt>
            {episodeLabel && (
              <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 20 }}>
                {episodeLabel}
              </Txt>
            )}

            {/* ── Filtros ── */}
            {!selectedCommentId && (
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
            )}

            {/* ── Lista de comentários ── */}
            {pageLoading && focusedComments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Txt size={13} color={T.t3}>Carregando comentários…</Txt>
              </div>
            ) : focusedComments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Icon name="message" size={40} color={T.t4} />
                <Txt size={15} weight={700} color={T.t2} style={{ display: 'block', marginTop: 14, marginBottom: 6 }}>
                  {selectedCommentId ? 'Comentário indisponível' : t('comments.empty')}
                </Txt>
                {selectedCommentId ? (
                  <button onClick={showAllComments}
                    style={{ marginTop: 14, padding: '12px 24px', borderRadius: 24, background: T.pillActiveBg, color: T.pillActiveText, border: 'none', cursor: 'pointer', fontFamily: "'Area','Inter',sans-serif", fontSize: 13, fontWeight: 800 }}>
                    Ver mais comentários
                  </button>
                ) : (
                  <>
                    <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 24, lineHeight: 1.5 }}>
                      {t('comments.beFirst')}
                    </Txt>
                    <button onClick={openComposer}
                      style={{ padding: '12px 28px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                      <Txt size={14} weight={700} color="#fff">{t('comments.commentNow')}</Txt>
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginLeft: -16, marginRight: -16 }}>
                {focusedComments.map((rev, index) => (
                  <div
                    key={rev.id}
                    style={{ background: index % 2 === 1 ? T.card : 'transparent' }}
                  >
                    <CommentCard
                      rev={rev}
                      timeAgo={timeAgo}
                      onLike={() => toggleLike(rev.id)}
                      onProfile={goToProfile}
                      replyOpen={replyOpenId === rev.id}
                      currentUserId={user?.uid}
                      isModerator={isModerator}
                      onToggleReply={() => {
                        setReplyOpenId(id => id === rev.id ? null : rev.id);
                      }}
                      onDelete={rev.uid && rev.uid === user?.uid
                        ? () => deleteComment(rev.id)
                        : undefined}
                      onReport={rev.uid !== user?.uid ? () => reportComment(rev) : undefined}
                      onReportReply={(reply) => reportReply(rev, reply)}
                      onReplyLike={(reply) => toggleReplyLike(rev.id, reply.id)}
                      onReplyDelete={(reply) => deleteReply(rev.id, reply.id)}
                    />
                  </div>
                ))}
                {selectedCommentId && (
                  <button
                    type="button"
                    onClick={showAllComments}
                    style={{ alignSelf: 'center', minHeight: 42, margin: '16px 16px 4px', padding: '0 20px', borderRadius: 21, border: 'none', background: T.pillActiveBg, color: T.pillActiveText, fontFamily: "'Area','Inter',sans-serif", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                  >
                    Ver mais comentários
                  </button>
                )}
                {!selectedCommentId && pageError && (
                  <div style={{ textAlign: 'center', padding: '4px 16px' }}>
                    <Txt size={12} color="#FF7378">{pageError}</Txt>
                  </div>
                )}
                {!selectedCommentId && pageError && hasMoreComments ? (
                  <button
                    type="button"
                    onClick={loadMoreComments}
                    disabled={pageLoading}
                    style={{ alignSelf: 'center', minHeight: 40, padding: '0 18px', borderRadius: 20, border: `1px solid ${T.border}`, background: T.surface2, color: T.t1, fontFamily: "'Area','Inter',sans-serif", fontSize: 12, fontWeight: 800, cursor: pageLoading ? 'default' : 'pointer', opacity: pageLoading ? 0.65 : 1 }}
                  >
                    {pageLoading ? 'Carregando…' : 'Tentar novamente'}
                  </button>
                ) : !selectedCommentId && hasMoreComments && !commentsObserverSupported ? (
                  <button
                    type="button"
                    onClick={loadMoreComments}
                    disabled={pageLoading}
                    style={{ alignSelf: 'center', minHeight: 40, padding: '0 18px', borderRadius: 20, border: `1px solid ${T.border}`, background: T.surface2, color: T.t1, fontFamily: "'Area','Inter',sans-serif", fontSize: 12, fontWeight: 800, cursor: pageLoading ? 'default' : 'pointer', opacity: pageLoading ? 0.65 : 1 }}
                  >
                    {pageLoading ? 'Carregando…' : 'Carregar mais comentários'}
                  </button>
                ) : !selectedCommentId && hasMoreComments ? (
                  <div
                    ref={commentsSentinelRef}
                    aria-hidden="true"
                    style={{ minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {pageLoading && <Txt size={12} color={T.t3}>Carregando…</Txt>}
                  </div>
                ) : !selectedCommentId && !pageLoading && sorted.length > 0 ? (
                  <Txt size={11} color={T.t3} style={{ display: 'block', textAlign: 'center', padding: '6px 0' }}>
                    Não há mais comentários.
                  </Txt>
                ) : null}
              </div>
            )}
          </div>
          <div style={{ height: sorted.length > 0 || composerExpanded || replyOpenId ? 190 : 24 }} />
        </ScrollArea>

        {/* ── Compositor fixo de comentários e respostas ── */}
        {(sorted.length > 0 || composerExpanded || replyOpenId) && (
        <div className="keyboard-aware-bottom" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, padding: '12px calc(12px + var(--safe-area-right)) calc(12px + var(--interactive-safe-bottom)) calc(12px + var(--safe-area-left))', background: 'transparent' }}>

          {/* More menu */}
          {!replyOpenId && composerExpanded && showMore && !composerPanel && (
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
          {!replyOpenId && composerExpanded && composerPanel === 'gif' && (
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
                      <GiphyImage gif={gif} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* External image URL window */}
          {!replyOpenId && composerExpanded && composerPanel === 'image' && (
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
          {replyOpenId ? (
            <ReplyEditor
              key={replyOpenId}
              docked
              onSubmit={(draft) => submitReply(replyOpenId, draft)}
              onError={showToast}
            />
          ) : !composerExpanded ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={openComposer}
                aria-label={t('comments.commentNow')}
                style={{ minHeight: 48, padding: '0 20px', borderRadius: 24, background: T.pink, border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: `0 6px 20px ${T.pinkGlow}`, cursor: 'pointer', fontFamily: "'Area','Inter',sans-serif", fontSize: 14, fontWeight: 800 }}
              >
                <Icon name="message" size={19} color="#fff" />
                {t('comments.commentNow')}
              </button>
            </div>
          ) : (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 22, padding: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.24)' }}>
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
                    {selectedGif ? (
                      <GiphyImage gif={selectedGif} alt="" eager style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <Txt size={10} color={T.t3} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedGif ? 'GIF' : imageUrl}</Txt>
                    <button type="button" onClick={() => { setSelectedGif(null); setImageUrl(''); setImageDraft(''); }} aria-label={t('comments.removeAttachment')} style={{ width: 26, height: 26, borderRadius: 13, background: T.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <Icon name="close" size={11} color={T.t2} />
                    </button>
                  </div>
                )}
              </div>
            )}
            <textarea
              ref={composerRef}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('comments.composerPlaceholder')}
              maxLength={500}
              rows={3}
              style={{ width: '100%', minHeight: 92, maxHeight: 148, resize: 'none', overflowY: 'auto', boxSizing: 'border-box', background: T.surface2, border: 'none', borderRadius: 17, color: T.t1, fontSize: 14, lineHeight: 1.45, fontFamily: "'Area','Inter',sans-serif", padding: '12px 14px', outline: 'none', display: 'block', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <button
                type="button"
                onClick={submitComment}
                disabled={!comment.trim() && !selectedGif && !imageUrl}
                style={{ minHeight: 40, padding: '0 18px', borderRadius: 20, background: comment.trim() || selectedGif || imageUrl ? T.pink : T.surface2, border: 'none', color: comment.trim() || selectedGif || imageUrl ? '#fff' : T.t4, fontFamily: "'Area','Inter',sans-serif", fontSize: 12, fontWeight: 800, cursor: comment.trim() || selectedGif || imageUrl ? 'pointer' : 'default', flex: 1 }}
              >
                {t('comments.publish')}
              </button>
            </div>
          </div>
          )}
        </div>
        )}

        <Toast msg={toast} visible={!!toast} />
        <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
        {authGate}

      </Screen>
    </Frame>
  );
}

/* ── Full reply composer ── */
function ReplyEditor({
  onSubmit,
  onError,
  docked = false,
}: {
  onSubmit: (draft: ReplyDraft) => void | Promise<void>;
  onError: (message: string) => void;
  docked?: boolean;
}) {
  const { t } = useTranslation('title');
  const [text, setText] = useState('');
  const [panel, setPanel] = useState<'gif' | 'image' | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [spoiler, setSpoiler] = useState(false);
  const [selectedGif, setSelectedGif] = useState<GiphyGif | null>(null);
  const [imageDraft, setImageDraft] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<GiphyGif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasContent = !!(text.trim() || selectedGif || imageUrl);

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    if (panel !== 'gif') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setGifLoading(true);
      try {
        setGifResults(await fetchGiphyGifs(gifSearch, 18, controller.signal));
      } catch {
        if (!controller.signal.aborted) setGifResults([]);
      } finally {
        if (!controller.signal.aborted) setGifLoading(false);
      }
    }, gifSearch ? 350 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [panel, gifSearch]);

  const attachImage = () => {
    try {
      const parsed = new URL(imageDraft.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
      setImageUrl(parsed.toString());
      setSelectedGif(null);
      setPanel(null);
    } catch {
      onError(t('comments.invalidImageUrl'));
    }
  };

  const publish = async () => {
    if (!hasContent) {
      onError(t('comments.emptyComposer'));
      inputRef.current?.focus();
      return;
    }
    await onSubmit({
      text: text.trim(),
      gifUrl: selectedGif ? giphyDisplayUrl(selectedGif) : '',
      imageUrl,
      spoiler,
    });
  };

  return (
    <div style={{ position: 'relative', marginTop: docked ? 0 : 14, padding: 10, borderRadius: 22, border: `1px solid ${T.border}`, background: T.card, boxShadow: '0 8px 28px rgba(0,0,0,0.24)' }}>
      {(selectedGif || imageUrl || spoiler) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 9px' }}>
          {spoiler && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 13, background: 'rgba(192,105,255,0.14)' }}>
              <Icon name="eye" size={13} color={T.pink} />
              <Txt size={10} weight={800} color={T.pink}>{t('comments.spoilerOn')}</Txt>
            </div>
          )}
          {(selectedGif || imageUrl) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
              {selectedGif ? (
                <GiphyImage gif={selectedGif} alt="" eager style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <Txt size={10} color={T.t3} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedGif ? 'GIF' : imageUrl}
              </Txt>
              <button
                type="button"
                onClick={() => { setSelectedGif(null); setImageUrl(''); setImageDraft(''); }}
                aria-label={t('comments.removeAttachment')}
                style={{ width: 26, height: 26, borderRadius: 13, background: T.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <Icon name="close" size={11} color={T.t2} />
              </button>
            </div>
          )}
        </div>
      )}

      <textarea
        ref={inputRef}
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder={t('comments.replyPlaceholderFull')}
        maxLength={500}
        rows={3}
        style={{ width: '100%', minHeight: 92, maxHeight: 148, resize: 'none', overflowY: 'auto', boxSizing: 'border-box', background: T.surface2, border: 'none', borderRadius: 17, color: T.t1, fontSize: 14, lineHeight: 1.45, fontFamily: "'Area','Inter',sans-serif", padding: '12px 14px', outline: 'none', display: 'block', marginBottom: 8 }}
      />

      {showMore && !panel && (
        <div style={{ marginBottom: 8, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
          {[
            { label: spoiler ? t('comments.spoilerOn') : t('comments.markSpoiler'), icon: 'eye' as const, action: () => { setSpoiler(current => !current); setShowMore(false); } },
            { label: t('comments.addGif'), icon: 'film' as const, action: () => { setPanel('gif'); setShowMore(false); } },
            { label: t('comments.useImage'), icon: 'plus' as const, action: () => { setPanel('image'); setShowMore(false); } },
          ].map((option, index, all) => (
            <button
              type="button"
              key={option.label}
              onClick={option.action}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', background: 'none', border: 'none', borderBottom: index < all.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <Icon name={option.icon} size={16} color={spoiler && index === 0 ? T.pink : T.t2} />
              <Txt size={12} weight={700} color={spoiler && index === 0 ? T.pink : T.t1}>{option.label}</Txt>
            </button>
          ))}
        </div>
      )}

      {panel === 'gif' && (
        <div style={{ marginBottom: 8, padding: 9, borderRadius: 15, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <input
              value={gifSearch}
              onChange={event => setGifSearch(event.target.value)}
              placeholder={t('searchGif')}
              autoFocus
              style={{ flex: 1, minWidth: 0, height: 36, boxSizing: 'border-box', background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, color: T.t1, fontSize: 12, fontFamily: "'Area','Inter',sans-serif", padding: '0 12px', outline: 'none' }}
            />
            <Txt size={9} weight={800} color={T.t4}>GIPHY</Txt>
            <button type="button" onClick={() => setPanel(null)} aria-label="Fechar GIFs" style={{ width: 30, height: 30, borderRadius: 15, background: T.card, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="close" size={12} color={T.t2} />
            </button>
          </div>
          {gifLoading ? (
            <div style={{ padding: 22, textAlign: 'center' }}><Txt size={11} color={T.t3}>{t('loadingGif')}</Txt></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5, maxHeight: 230, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
              {gifResults.map(gif => (
                <button
                  type="button"
                  key={gif.id}
                  onClick={() => {
                    setSelectedGif(gif);
                    setImageUrl('');
                    setImageDraft('');
                    setPanel(null);
                  }}
                  style={{ height: 82, padding: 0, border: 'none', borderRadius: 9, overflow: 'hidden', background: T.card, cursor: 'pointer' }}
                >
                  <GiphyImage gif={gif} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {panel === 'image' && (
        <div style={{ marginBottom: 8, padding: 9, borderRadius: 15, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              value={imageDraft}
              onChange={event => setImageDraft(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && attachImage()}
              placeholder={t('comments.imageUrlPlaceholder')}
              autoFocus
              inputMode="url"
              style={{ flex: 1, minWidth: 0, height: 38, boxSizing: 'border-box', background: T.card, border: `1px solid ${T.border}`, borderRadius: 19, color: T.t1, fontSize: 12, fontFamily: "'Area','Inter',sans-serif", padding: '0 12px', outline: 'none' }}
            />
            <button type="button" onClick={attachImage} style={{ border: 'none', borderRadius: 19, background: T.pink, color: '#fff', padding: '0 13px', fontFamily: "'Area','Inter',sans-serif", fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
              {t('comments.attachImage')}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            if (showMore || panel) {
              setShowMore(false);
              setPanel(null);
            } else {
              setShowMore(true);
            }
          }}
          aria-label={t('comments.moreOptions')}
          style={{ width: 40, height: 40, borderRadius: 20, background: showMore || panel ? T.pink : T.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name={showMore || panel ? 'close' : 'plus'} size={17} color={showMore || panel ? '#fff' : T.t2} />
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={!hasContent}
          style={{ minHeight: 40, padding: '0 18px', borderRadius: 20, background: hasContent ? T.pink : T.surface2, border: 'none', color: hasContent ? '#fff' : T.t4, fontFamily: "'Area','Inter',sans-serif", fontSize: 12, fontWeight: 800, cursor: hasContent ? 'pointer' : 'default', flex: 1 }}
        >
          {t('comments.reply')}
        </button>
      </div>
    </div>
  );
}

function ReplyItem({ reply, timeAgo, onReport, onProfile, onLike, onDelete, currentUserId }: {
  reply: Reply;
  timeAgo: (date: string) => string;
  onReport?: () => void;
  onProfile?: (username: string) => void;
  onLike?: () => void;
  onDelete?: () => void;
  currentUserId?: string;
}) {
  const { t } = useTranslation('title');
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  // Same live-avatar resolution as the feed and top-level comments, so a reply
  // shows the author's current picture instead of a stale snapshot (or the
  // letter fallback when the reply was stored without one).
  const avatarUrl = useResolvedAvatar(reply.uid, reply.photoUrl, reply.user);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const mediaUrl = reply.gifUrl || reply.imageUrl || '';
  const spoilerHidden = !!reply.spoiler && !spoilerRevealed;
  const openProfile = onProfile ? () => onProfile(reply.user) : undefined;
  const liked = !!currentUserId && !!reply.likedBy?.includes(currentUserId);
  const likeCount = reply.likes ?? reply.likedBy?.length ?? 0;

  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          onClick={openProfile}
          disabled={!openProfile}
          aria-label={openProfile ? `Abrir perfil de ${reply.user}` : undefined}
          style={{ width: 40, height: 40, borderRadius: 20, background: T.surface2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', padding: 0, cursor: openProfile ? 'pointer' : 'default' }}
        >
          {avatarUrl && !avatarFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={`Avatar de ${reply.user}`}
              onError={() => setAvatarFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Txt size={14} weight={800} color={T.t2}>{reply.avatar}</Txt>
          )}
        </button>
        <button
          type="button"
          onClick={openProfile}
          disabled={!openProfile}
          style={{ background: 'none', border: 'none', padding: 0, cursor: openProfile ? 'pointer' : 'default', textAlign: 'left' }}
        >
          <Txt size={14} weight={800}>{reply.user}</Txt>
        </button>
        <Txt size={11} color={T.t3}>{timeAgo(reply.date)}</Txt>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Excluir resposta"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0, border: 'none', borderRadius: 16, background: 'transparent', cursor: 'pointer' }}
            >
              <Icon name="trash" size={14} color={T.red ?? '#ff4444'} />
            </button>
          )}
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              aria-label="Denunciar resposta"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0, border: 'none', borderRadius: 16, background: 'transparent', cursor: 'pointer' }}
            >
              <Icon name="flag" size={14} color={T.t4} />
            </button>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', minHeight: spoilerHidden ? 76 : undefined, overflow: 'hidden', borderRadius: 16 }}>
        <div style={{ filter: spoilerHidden ? 'blur(11px)' : 'none', transform: spoilerHidden ? 'scale(1.025)' : 'none', pointerEvents: spoilerHidden ? 'none' : 'auto', userSelect: spoilerHidden ? 'none' : 'auto' }}>
          {reply.text && (
            <Txt size={15} color={T.t1} style={{ display: 'block', lineHeight: 1.55, marginBottom: mediaUrl ? 12 : 0 }}>{reply.text}</Txt>
          )}
          {mediaUrl && <SocialMedia src={mediaUrl} alt={reply.gifUrl ? 'GIF da resposta' : 'Imagem da resposta'} compact />}
        </div>
        {spoilerHidden && (
          <button
            type="button"
            onClick={() => setSpoilerRevealed(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', border: `1px solid ${T.border}`, borderRadius: 13, background: 'rgba(18,18,22,0.62)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="eye" size={14} color="#fff" />
              <Txt size={11} weight={800} color="#fff">{t('comments.spoilerWarning')}</Txt>
            </div>
            <Txt size={9} color="rgba(255,255,255,0.7)">{t('comments.tapToReveal')}</Txt>
          </button>
        )}
      </div>
      {onLike && (
        <div style={{ marginTop: 10 }}>
          <SocialAction icon={liked ? 'heart' : 'heartO'} active={liked} onClick={onLike} ariaLabel="Curtir resposta">
            {likeCount > 0 && <Txt size={13} weight={700} color={liked ? T.pink : T.t3}>{likeCount}</Txt>}
          </SocialAction>
        </div>
      )}
    </div>
  );
}

/* ── Comment card ── */
function CommentCard({ rev, timeAgo, onLike, onProfile, replyOpen, currentUserId, isModerator, onToggleReply, onDelete, onReport, onReportReply, onReplyLike, onReplyDelete }: {
  rev: Review;
  timeAgo: (d: string) => string;
  onLike: () => void;
  onProfile: (username: string) => void;
  replyOpen: boolean;
  currentUserId?: string;
  /** Whether the signed-in user may delete any reply (moderation). */
  isModerator?: boolean;
  onToggleReply: () => void;
  /** Present only for the author. Moderators act through the separate panel. */
  onDelete?: () => void;
  /** Present for everyone except the comment's author. */
  onReport?: () => void;
  /** Structured moderation target for a reply. */
  onReportReply?: (reply: Reply) => void;
  /** Toggle the current user's like on a reply. */
  onReplyLike?: (reply: Reply) => void;
  /** Delete a reply (author or moderator). */
  onReplyDelete?: (reply: Reply) => void;
}) {
  const { t }         = useTranslation('title');
  const liked         = !!currentUserId && !!rev.likedBy?.includes(currentUserId);
  const resolvedAvatar = useResolvedAvatar(rev.uid, rev.photoUrl, rev.user);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [repliesExpanded, setRepliesExpanded] = useState(replyOpen);
  const replyCount    = rev.replies?.length ?? 0;
  const mediaUrl      = rev.gifUrl || rev.imageUrl || '';
  const spoilerHidden = !!rev.spoiler && !spoilerRevealed;

  useEffect(() => {
    if (replyOpen) setRepliesExpanded(true);
  }, [replyOpen]);

  return (
    <SocialCard edgeToEdge>

      {/* ── Author row (clickable → profile) ── */}
      <div style={{ marginBottom: 12 }}>
        <SocialAuthor
          name={rev.user}
          time={timeAgo(rev.date)}
          avatar={rev.avatar}
          photoUrl={resolvedAvatar}
          timeColor={T.t3}
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
          <Txt size={12} weight={700} color="currentColor">{rev.likedBy?.length ?? rev.likes ?? 0}</Txt>
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
      </div>

      {/* ── Replies dropdown ── */}
      {replyCount > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={() => setRepliesExpanded(expanded => !expanded)}
            aria-expanded={repliesExpanded}
            style={{
              width: '100%', padding: 0, border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', gap: 7,
              color: T.t2, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Txt size={13} weight={800} color="currentColor">
              {t('comments.repliesTitle')}
            </Txt>
            <Txt size={11} weight={700} color={T.t3}>{replyCount}</Txt>
            <Icon
              name="chevronD"
              size={13}
              color="currentColor"
              style={{
                transform: repliesExpanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>
          {repliesExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
              {rev.replies!.map(r => (
                <ReplyItem
                  key={r.id}
                  reply={r}
                  timeAgo={timeAgo}
                  currentUserId={currentUserId}
                  onProfile={onProfile}
                  onReport={r.uid !== currentUserId ? () => onReportReply?.(r) : undefined}
                  onLike={onReplyLike ? () => onReplyLike(r) : undefined}
                  onDelete={
                    onReplyDelete && ((!!r.uid && r.uid === currentUserId) || !!isModerator)
                      ? () => onReplyDelete(r)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
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

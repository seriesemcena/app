'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SocialAction, SocialAuthor, SocialCard, SocialMedia } from '@/components/SocialCard';
import { T } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';
import { profileStore, notifInboxStore, reactionStore, revStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbActivityStore, dbRevStore, dbReactionStore, type ActivityDoc, type ActivityPageCursor } from '@/lib/db';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';

type FeedTab = 'para_voce' | 'seguindo';

type ActivityItem = {
  id: string;
  uid?: string;              // Firebase UID do autor
  firestoreDocId?: string;   // ID do doc em activity/{id}
  reviewId?: string;         // ID dentro do array reviews/{titleKey}.items
  reviewTitleKey?: string;   // titleKey para reviews
  titleKey: string;
  displayTitle: string;
  user: string;
  avatar: string;
  color: string;
  photoUrl?: string;
  action: string;
  rating: number;
  text: string;
  time: string;
  rawDate: string;
  posterColor: string;
  mediaUrl?: string;
  spoiler?: boolean;
  isMe?: boolean;
};

function findReviewForFeedItem(reviews: Review[], item: ActivityItem): Review | undefined {
  if (item.reviewId) return reviews.find(review => review.id === item.reviewId);

  const candidates = reviews.filter(review => {
    const sameAuthor = item.uid && review.uid
      ? review.uid === item.uid
      : review.user === item.user;
    return sameAuthor
      && (review.text || '') === item.text
      && (review.rating || 0) === item.rating;
  });

  const targetTime = new Date(item.rawDate).getTime();
  return candidates.sort((a, b) =>
    Math.abs(new Date(a.date).getTime() - targetTime)
    - Math.abs(new Date(b.date).getTime() - targetTime)
  )[0];
}

const POSTER_COLORS = ['#1a3a5c','#2a1a0a','#5c1a3a','#0a1a2a','#1a2a1a','#1a0a2a','#0a2a1a','#2a0a1a'];
const EMOJIS = ['🔥', '❤️', '😮', '😂', '👏'];

function posterColorFor(key: string) {
  const hash = [...key].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0);
  return POSTER_COLORS[hash % POSTER_COLORS.length];
}

function activityToFeedItem(a: ActivityDoc & { docId: string }): ActivityItem | null {
  if (a.action !== 'reviewed') return null;
  return {
    id:             `act_${a.docId}`,
    uid:            a.uid,
    firestoreDocId: a.docId,
    reviewId:       a.reviewId,
    titleKey:       a.titleKey,
    displayTitle:   a.titleName,
    user:           a.authorUsername || a.username,
    avatar:         a.avatar,
    color:          '#C069FF',
    photoUrl:       a.authorAvatarUrl || a.photoUrl,
    action:         a.rating > 0 ? 'avaliou' : 'comentou',
    rating:         a.rating,
    text:           a.text,
    mediaUrl:       a.mediaUrl || '',
    spoiler:        !!a.spoiler,
    time:           timeAgo(a.createdAt),
    rawDate:        a.createdAt,
    posterColor:    posterColorFor(a.titleKey),
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'agora';
  if (m < 60)  return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

/* ──────────────────────────────────────────────── */
export default function FeedPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [feedTab, setFeedTab]         = useState<FeedTab>('para_voce');
  const [globalFeed, setGlobalFeed]   = useState<ActivityItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedCursor, setFeedCursor] = useState<ActivityPageCursor | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [scrolled, setScrolled]       = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUnreadNotifs(user ? notifInboxStore.unreadCount(user.uid) : 0);
  }, [user]);

  /* ── Only reviews/comments from Firestore ── */
  useEffect(() => {
    async function loadFeed() {
      setLoadingFeed(true);
      if (!firebaseConfigured) { setLoadingFeed(false); return; }
      try {
        const db    = getDB();
        const page = await dbActivityStore.getPage(db);
        const items = page.items.map(activityToFeedItem).filter((item): item is ActivityItem => item !== null);
        setGlobalFeed(items);
        setFeedCursor(page.cursor);
        setFeedHasMore(page.hasMore);
      } catch { setFeedError('Não foi possível atualizar o feed.'); }
      setLoadingFeed(false);
    }
    loadFeed();
  }, []);

  const loadMoreFeed = async () => {
    if (!feedCursor || !feedHasMore || loadingMore || !firebaseConfigured) return;
    setLoadingMore(true);
    setFeedError('');
    try {
      const page = await dbActivityStore.getPage(getDB(), feedCursor);
      const next = page.items.map(activityToFeedItem).filter((item): item is ActivityItem => item !== null);
      setGlobalFeed((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...next.filter((item) => !seen.has(item.id))];
      });
      setFeedCursor(page.cursor);
      setFeedHasMore(page.hasMore);
    } catch {
      setFeedError('Não foi possível carregar mais atividades.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDeleteItem = (id: string, titleKey: string, reviewId?: string) =>
    setGlobalFeed(prev => prev.filter(item => {
      if (item.id === id) return false;
      return !(reviewId && item.titleKey === titleKey && item.reviewId === reviewId);
    }));

  const feedItems: ActivityItem[] = globalFeed;

  const isEmpty = !loadingFeed && feedItems.length === 0;

  return (
    <Frame>
      <Screen>
        <div
          className="app-page-scroll"
          ref={scrollRef}
          onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)}
          style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}
        >

          {/* ── Header glass sticky ── */}
          <GlassHeader
            right={
              <button onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Icon name="bell" size={16} color={isDark ? '#fff' : 'rgba(0,0,0,0.70)'} />
                {unreadNotifs > 0 && (
                  <div style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 4, background: T.pink, border: '1.5px solid rgba(0,0,0,0.4)' }} />
                )}
              </button>
            }
          />

          {/* ── Tabs — sticky logo abaixo do header ── */}
          <div style={{
            position: 'sticky', top: 'calc(56px + var(--safe-area-top))', zIndex: 48,
            display: 'flex', gap: 8,
            padding: scrolled ? '2px 16px 8px' : '8px 16px 10px',
            overflowX: 'auto', scrollbarWidth: 'none',
            background: 'transparent',
            transition: 'padding 0.25s ease',
          } as React.CSSProperties}>
            {([['para_voce', 'Para você'], ['seguindo', 'Seguindo']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFeedTab(id)} style={{
                padding: scrolled ? '4.5px 13px' : '7px 16px',
                borderRadius: 24, flexShrink: 0,
                background: feedTab === id
                  ? (isDark ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,12,0.88)')
                  : (isDark ? 'rgba(255,255,255,0.12)' : '#fff'),
                border: feedTab === id
                  ? 'none'
                  : (isDark ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(0,0,0,0.11)'),
                color: feedTab === id
                  ? (isDark ? T.active : '#fff')
                  : (isDark ? 'rgba(255,255,255,0.80)' : 'rgba(0,0,0,0.60)'),
                fontSize: scrolled ? 11 : 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.25s ease',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              } as React.CSSProperties}>{label}</button>
            ))}
          </div>

          {/* ── Content ── */}
          <div style={{ minHeight: 400 }}>

            {/* Loading skeletons */}
            {loadingFeed && (
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ background: T.card, borderRadius: 20, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 21, background: T.surface2, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 13, width: '55%', borderRadius: 6, background: T.surface2, marginBottom: 6 }} />
                        <div style={{ height: 11, width: '30%', borderRadius: 5, background: T.surface2 }} />
                      </div>
                    </div>
                    <div style={{ height: 200, borderRadius: 14, background: T.surface2, marginBottom: 14 }} />
                    <div style={{ display: 'flex', gap: 20 }}>
                      {[40, 60, 80].map(w => <div key={w} style={{ height: 11, width: w, borderRadius: 5, background: T.surface2 }} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {isEmpty && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px', textAlign: 'center' }}>
                <Icon name="message" size={44} color={T.t4} />
                <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>Feed vazio por enquanto</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>
                  Adicione filmes e séries às suas listas e avalie títulos — suas atividades aparecerão aqui.
                </Txt>
              </div>
            )}

            {/* Feed items */}
            {!loadingFeed && feedItems.length > 0 && (
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {feedItems.map((item) => <FeedCard key={item.id} item={item} onDelete={handleDeleteItem} />)}
                {feedError && <Txt size={12} color="#FF7378" style={{ display: 'block', textAlign: 'center' }}>{feedError}</Txt>}
                {feedHasMore ? (
                  <button type="button" onClick={loadMoreFeed} disabled={loadingMore} style={{ alignSelf: 'center', minHeight: 40, padding: '0 18px', borderRadius: 20, border: `1px solid ${T.border}`, background: T.surface2, color: T.t1, fontFamily: "'Area','Inter',sans-serif", fontSize: 12, fontWeight: 800, cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.65 : 1 }}>
                    {loadingMore ? 'Carregando…' : 'Carregar mais atividades'}
                  </button>
                ) : (
                  <Txt size={11} color={T.t4} style={{ display: 'block', textAlign: 'center', padding: '6px 0' }}>Não há mais atividades.</Txt>
                )}
              </div>
            )}
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

/* ──────────────────────────────────────────────── */
function FeedCard({ item, onDelete }: {
  item: ActivityItem;
  onDelete: (id: string, titleKey: string, reviewId?: string) => void;
}) {
  const router      = useRouter();
  const { user }    = useAuth();
  const actionLabel = item.action === 'comentou' ? 'comentou em' : item.action;

  const myName   = user?.displayName || user?.email?.split('@')[0] || '';
  const isMyPost = !!user && (
    (item.uid ? item.uid === user.uid : false) ||
    (!!myName && item.user === myName)
  );

  const goToProfile = () => router.push(`/user/${encodeURIComponent(item.user)}`);

  /* ── TMDB label ── */
  const displayLabel = item.displayTitle || item.titleKey;
  // Title artwork is context, not user content. Only explicit GIF/image
  // attachments are rendered inside a feed post.
  const mediaSrc = item.mediaUrl || '';
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const spoilerHidden = !!item.spoiler && !spoilerRevealed;

  /* ── Emoji reactions (persisted to Firestore) ── */
  const [reactions, setReactions]       = useState<Record<string, number>>({});
  const [myReaction, setMyReaction]     = useState<string | null>(null);
  const [showEmojis, setShowEmojis]     = useState(false);
  const [showReactors, setShowReactors] = useState(false);

  /* Apply a { uid: emoji } map to the counts + my-reaction UI state */
  const applyReactionMap = (map: Record<string, string>) => {
    const counts: Record<string, number> = {};
    Object.values(map).forEach(e => { if (e) counts[e] = (counts[e] || 0) + 1; });
    setReactions(counts);
    setMyReaction(user && map[user.uid] ? map[user.uid] : null);
  };

  /* Load persisted reactions: localStorage first, then merge Firestore */
  useEffect(() => {
    const localMap = reactionStore.getMap(item.id);
    applyReactionMap(localMap);
    if (!firebaseConfigured) return;
    let alive = true;
    dbReactionStore.get(getDB(), item.id).then(cloudMap => {
      if (!alive || !cloudMap || Object.keys(cloudMap).length === 0) return;
      // Cloud holds other users' reactions; local keeps mine if the cloud
      // write was blocked. Cloud wins on conflicts for a shared uid.
      applyReactionMap({ ...localMap, ...cloudMap });
    }).catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, user]);

  const react = async (emoji: string) => {
    setShowEmojis(false);
    if (!user) return;
    const prev = myReaction;
    const nextEmoji = prev === emoji ? null : emoji;
    // Optimistic update
    setReactions(cur => {
      const next = { ...cur };
      if (prev)      next[prev]      = Math.max(0, (next[prev] || 0) - 1);
      if (nextEmoji) next[nextEmoji] = (next[nextEmoji] || 0) + 1;
      return next;
    });
    setMyReaction(nextEmoji);
    // Persist locally (survives refresh) + best-effort shared cloud write
    reactionStore.set(item.id, user.uid, nextEmoji);
    if (firebaseConfigured) {
      try { await dbReactionStore.set(getDB(), item.id, user.uid, nextEmoji); } catch {}
    }
  };

  const totalReactions  = Object.values(reactions).reduce((a, b) => a + b, 0);
  const reactionEntries = Object.entries(reactions).filter(([, c]) => c > 0);

  /* ── Reply count for this exact root comment/review ── */
  const [replyCount, setReplyCount] = useState(0);
  useEffect(() => {
    if (!firebaseConfigured || !item.titleKey) return;
    let alive = true;
    dbRevStore.get(getDB(), item.titleKey).then(list => {
      if (!alive) return;
      const exact = findReviewForFeedItem(list, item);
      setReplyCount(exact?.replies?.length ?? 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [item.rating, item.rawDate, item.reviewId, item.text, item.titleKey, item.uid, item.user]);

  /* ── Three-dot menu ── */
  const [showMenu,   setShowMenu]   = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [toast,      setToast]      = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const handleDelete = async () => {
    setShowMenu(false);
    if (!firebaseConfigured) return;
    setDeleting(true);
    try {
      const db = getDB();
      let removed = false;
      const reviewKey = item.reviewTitleKey || item.titleKey;
      const reviews = item.reviewId
        ? []
        : await dbRevStore.get(db, reviewKey);
      const matchedReview = item.reviewId
        ? undefined
        : findReviewForFeedItem(reviews, item);
      const resolvedReviewId = item.reviewId || matchedReview?.id;

      // A feed card can have both an activity document and its source review.
      // Delete the source first so it cannot reappear after a refresh.
      if (resolvedReviewId) {
        const source = await dbRevStore.remove(
          db,
          reviewKey,
          resolvedReviewId,
        );
        removed = source !== 'missing';
        revStore.removeReview(reviewKey, resolvedReviewId);
      }

      const deletedActivities = await dbActivityStore.deleteForReview(db, {
        docId: item.firestoreDocId,
        reviewId: resolvedReviewId,
        titleKey: reviewKey,
        uid: item.uid,
        username: item.user,
        text: item.text,
        rating: item.rating,
        createdAt: item.rawDate,
      });
      removed = removed || deletedActivities > 0;

      if (!removed) throw new Error('Comentário não encontrado no Firestore.');
      onDelete(item.id, reviewKey, resolvedReviewId);
      showToast('Comentário excluído.');
    } catch (error) {
      setDeleting(false);
      console.error('[feed] Falha ao excluir comentário:', error);
      showToast('Erro ao excluir. Tente novamente.');
    }
  };

  const handleReport = () => {
    setShowMenu(false);
    setReportTarget({
      kind: 'comment',
      targetId: item.reviewId || item.id,
      titleKey: item.reviewTitleKey || item.titleKey,
      targetLabel: displayLabel,
      contentSnippet: item.text,
      reportedUser: item.user,
    });
  };

  const handleShare = async () => {
    setShowMenu(false);
    const url = `${window.location.origin}/comments?key=${encodeURIComponent(item.titleKey)}&title=${encodeURIComponent(displayLabel)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: displayLabel, text: item.text, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Link copiado.');
      }
    } catch { /* user cancelled native share */ }
  };

  const menuOptions = [
    { label: 'Compartilhar', icon: 'share' as const, color: T.t2, action: handleShare },
    { label: 'Denunciar',  icon: 'flag'  as const, color: T.red ?? '#ff4444', action: handleReport },
    ...(!isMyPost ? [{ label: 'Ocultar conteúdo deste usuário', icon: 'eye' as const, color: T.t2, action: () => { setShowMenu(false); showToast('Conteúdo ocultado.'); } }] : []),
    // Client deletion is author-only. Administrative moderation uses the
    // separate panel and central API.
    ...(isMyPost
      ? [{ label: isMyPost ? 'Excluir comentário' : 'Excluir (moderação)', icon: 'close' as const, color: T.red ?? '#ff4444', action: handleDelete }]
      : []),
  ];

  return (
    <SocialCard dimmed={deleting}>

      {/* Toast feedback */}
      {toast && (
        <div style={{ position: 'absolute', bottom: 12, left: 16, right: 16, zIndex: 50, background: 'rgba(30,30,34,0.96)', border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 14px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as React.CSSProperties}>
          <Txt size={13} weight={600} color={T.t1}>{toast}</Txt>
        </div>
      )}

      {/* ── Menu discreto — topo direito do card ── */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        <button
          type="button"
          aria-label={`Mais opções de ${item.user}`}
          onClick={() => setShowMenu(v => !v)}
          style={{ width: 28, height: 28, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="menuDots" size={18} color={T.t2} />
        </button>
        {showMenu && (
          <>
            <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
            <div style={{ position: 'absolute', top: 32, right: 0, zIndex: 30, background: T.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', border: `1px solid ${T.border}`, minWidth: 230 }}>
              {menuOptions.map(({ label, icon, color, action }, idx) => (
                <button key={label} onClick={action} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'none', border: 'none', borderBottom: idx < menuOptions.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <Icon name={icon} size={16} color={color} />
                  <Txt size={13} weight={600} color={color}>{label}</Txt>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── User row ── */}
      <div style={{ marginBottom: 12 }}>
        <SocialAuthor
          name={item.user}
          time={item.time}
          avatar={item.avatar}
          photoUrl={item.photoUrl}
          color={item.color}
          endPadding={24}
          onClick={goToProfile}
          context={(
            <>
              <Txt size={11} weight={700} color={T.t3} style={{ flexShrink: 0 }}>{actionLabel}</Txt>
              <Txt size={12} weight={700} color={T.t1} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {displayLabel}
              </Txt>
            </>
          )}
        />
      </div>

      {/* ── Review content / spoiler cover ── */}
      <div style={{ position: 'relative', minHeight: spoilerHidden ? 86 : undefined, marginBottom: 12, overflow: 'hidden', borderRadius: 16 }}>
        <div style={{ filter: spoilerHidden ? 'blur(12px)' : 'none', transform: spoilerHidden ? 'scale(1.03)' : 'none', transition: 'filter 0.2s ease, transform 0.2s ease', pointerEvents: spoilerHidden ? 'none' : 'auto', userSelect: spoilerHidden ? 'none' : 'auto' }}>
          {item.text ? (
            <Txt size={15} color={T.t1} style={{ display: 'block', lineHeight: 1.55, marginBottom: mediaSrc ? 12 : 0 }}>
              {item.text}
            </Txt>
          ) : null}
          {mediaSrc && <SocialMedia src={mediaSrc} alt={displayLabel} compact />}
        </div>
        {spoilerHidden && (
          <button type="button" onClick={() => setSpoilerRevealed(true)} style={{ position: 'absolute', inset: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(18,18,22,0.56)', border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="eye" size={16} color="#fff" />
              <Txt size={12} weight={800} color="#fff">Este comentário contém spoiler</Txt>
            </div>
            <Txt size={10} color="rgba(255,255,255,0.7)">Toque para revelar</Txt>
          </button>
        )}
      </div>

      {/* ── Actions bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>

        {/* Reacts: emoji picker trigger + count que abre popup de quem reagiu */}
        <div style={{ position: 'relative', width: 58, height: 40, display: 'flex', alignItems: 'center', background: myReaction ? 'rgba(192,105,255,0.14)' : T.surface2, border: `1px solid ${myReaction ? 'rgba(192,105,255,0.24)' : T.border}`, borderRadius: 20, overflow: 'visible' }}>
          {/* Emoji trigger — ícone coração por padrão */}
          <button
            onClick={() => setShowEmojis(v => !v)}
            style={{ width: 28, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: myReaction ? T.pink : T.t3 }}>
            {myReaction
              ? <span style={{ fontSize: 18, lineHeight: 1 }}>{myReaction}</span>
              : <Icon name="heartO" size={16} color="currentColor" />
            }
          </button>

          {/* Count — abre popup de quem reagiu */}
          <button
            onClick={() => totalReactions > 0 ? setShowReactors(true) : setShowEmojis(v => !v)}
            style={{ width: 30, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 5px' }}>
            <Txt size={12} weight={700} color={myReaction ? T.pink : T.t3}>{totalReactions}</Txt>
          </button>

          {/* Emoji picker */}
          {showEmojis && (
            <>
              <div onClick={() => setShowEmojis(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
              <div style={{ position: 'absolute', bottom: 40, left: 0, zIndex: 20, background: T.card, borderRadius: 20, padding: '8px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.20)', border: `1px solid ${T.border}`, display: 'flex', gap: 4 }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => react(e)} style={{ fontSize: 22, background: myReaction === e ? 'rgba(192,105,255,0.12)' : 'transparent', border: 'none', borderRadius: 10, padding: '4px 6px', cursor: 'pointer', transform: myReaction === e ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }}>{e}</button>
                ))}
              </div>
            </>
          )}

          {/* Reactors popup */}
          {showReactors && (
            <>
              <div onClick={() => setShowReactors(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
              <div style={{ position: 'absolute', bottom: 44, left: 0, zIndex: 30, background: T.card, borderRadius: 16, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', border: `1px solid ${T.border}`, minWidth: 200 }}>
                <Txt size={12} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Reações</Txt>
                {reactionEntries.map(([emoji, count]) => (
                  <div key={emoji} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{emoji}</span>
                    <Txt size={13} color={T.t2}>{count} pessoa{count !== 1 ? 's' : ''}</Txt>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Respostas recebidas por este comentário principal */}
        <SocialAction
          icon="message"
          width={58}
          ariaLabel="Abrir respostas"
          onClick={() => router.push(`/comments?key=${encodeURIComponent(item.titleKey)}&title=${encodeURIComponent(displayLabel)}`)}
        >
          <Txt size={12} weight={700} color="currentColor">{replyCount}</Txt>
        </SocialAction>

        <div style={{ flex: 1 }} />

        {/* Nota da avaliação — ocupa o antigo espaço do compartilhamento */}
        {item.rating > 0 && (
          <div style={{ minWidth: 60, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 11px', borderRadius: 17, background: '#FFEB13', flexShrink: 0 }}>
            <Icon name="star" size={12} color="#1a1400" />
            <Txt size={12} weight={800} color="#1a1400">{item.rating}/10</Txt>
          </div>
        )}
      </div>
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
    </SocialCard>
  );
}

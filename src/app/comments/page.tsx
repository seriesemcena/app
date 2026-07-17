'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { GlassHeader } from '@/components/primitives';
import { T } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';
import { revStore, profileStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRevStore } from '@/lib/db';

type SortKey = 'recentes' | 'populares';

type Reply = NonNullable<Review['replies']>[number];

function CommentsPageInner() {
  const router   = useRouter();
  const sp       = useSearchParams();
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const storageKey = sp.get('key')      || '';
  const title      = sp.get('title')    || 'Comentários';
  const showName   = sp.get('showName') || '';

  const [reviews, setReviews] = useState<Review[]>([]);
  const [sort, setSort]       = useState<SortKey>('recentes');
  const [toast, setToast]     = useState<string | false>(false);

  const goToAddComment = () =>
    router.push(`/add-comment?key=${encodeURIComponent(storageKey)}&title=${encodeURIComponent(title)}&showName=${encodeURIComponent(showName)}`);

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
    showToast('Resposta enviada!');
    if (firebaseConfigured) {
      try { await dbRevStore.set(getDB(), storageKey, updated); } catch {}
    }
  };

  const toggleLike = async (id: string) => {
    const updated = reviews.map(r => {
      if (r.id !== id) return r;
      const wasLiked = !!(r as any).liked;
      return { ...r, likes: (r.likes || 0) + (wasLiked ? -1 : 1), liked: !wasLiked } as Review;
    });
    setReviews(updated);
    revStore.set(storageKey, updated);
    if (firebaseConfigured) {
      try {
        const cloud = await dbRevStore.toggleLike(getDB(), storageKey, id, user?.uid || 'anon');
        setReviews(cloud); revStore.set(storageKey, cloud);
      } catch {}
    }
  };

  const goToProfile = (username: string) =>
    router.push(`/user/${encodeURIComponent(username)}`);

  function timeAgo(dateStr: string): string {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1)  return 'agora';
      if (m < 60) return `${m}min atrás`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h atrás`;
      return `${Math.floor(h / 24)}d atrás`;
    } catch { return dateStr; }
  }

  /* Only show reviews that have a text comment or a GIF */
  const withText = reviews.filter(r => r.text || r.gifUrl);

  const sorted = [...withText].sort((a, b) => {
    if (sort === 'populares') return (b.likes || 0) - (a.likes || 0);
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'recentes',  label: 'Recentes' },
    { key: 'populares', label: 'Populares' },
  ];

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            left={
              <button onClick={() => router.back()}
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
              Comentários
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
                <Txt size={15} weight={700} color={T.t2} style={{ display: 'block', marginTop: 14, marginBottom: 6 }}>Sem comentários ainda</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 24, lineHeight: 1.5 }}>
                  Seja o primeiro a comentar!
                </Txt>
                <button onClick={goToAddComment}
                  style={{ padding: '12px 28px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                  <Txt size={14} weight={700} color="#fff">Comentar agora</Txt>
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
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ height: 100 }} />
        </ScrollArea>

        {/* ── Botão fixo de comentar ── */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px 24px', background: `linear-gradient(to bottom, transparent, ${T.bg} 40%)`, pointerEvents: 'none' }}>
          <button onClick={goToAddComment}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}`, pointerEvents: 'auto' }}>
            <Txt size={15} weight={700} color="#fff">+ Adicionar comentário</Txt>
          </button>
        </div>

        <Toast msg={toast} visible={!!toast} />

      </Screen>
    </Frame>
  );
}

/* ── Comment card ── */
function CommentCard({ rev, timeAgo, onLike, onProfile, replyOpen, onToggleReply, replyText, onReplyChange, onSubmitReply, replyInputRef }: {
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
}) {
  const liked         = !!(rev as any).liked;
  const [showReplies, setShowReplies] = useState(false);
  const replyCount    = rev.replies?.length ?? 0;

  return (
    <div style={{ padding: '14px 16px', background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>

      {/* ── Author row (clickable → profile) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button onClick={() => onProfile(rev.user)}
          style={{ width: 38, height: 38, borderRadius: 19, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0 }}>
          <Txt size={13} weight={800} color="#fff">{rev.avatar}</Txt>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button onClick={() => onProfile(rev.user)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <Txt size={13} weight={700} style={{ display: 'block' }}>{rev.user}</Txt>
          </button>
          <Txt size={11} color={T.t4} style={{ display: 'block' }}>{timeAgo(rev.date)}</Txt>
        </div>
      </div>

      {/* ── Comment text ── */}
      {rev.text ? (
        <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.65, marginBottom: rev.gifUrl ? 10 : 12 }}>{rev.text}</Txt>
      ) : null}

      {/* ── GIF ── */}
      {rev.gifUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rev.gifUrl} alt="gif" style={{ display: 'block', borderRadius: 10, maxWidth: '100%', maxHeight: 200, objectFit: 'cover', marginBottom: 12 }} />
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={onLike}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name={liked ? 'heart' : 'heartO'} size={15} color={liked ? T.pink : T.t3} />
          <Txt size={12} color={liked ? T.pink : T.t3}>{(rev.likes || 0) + (liked ? 1 : 0)}</Txt>
        </button>
        <button onClick={onToggleReply}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name="message" size={15} color={replyOpen ? T.pink : T.t3} />
          <Txt size={12} color={replyOpen ? T.pink : T.t3}>Responder</Txt>
        </button>
        {replyCount > 0 && (
          <button onClick={() => setShowReplies(s => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Icon name={showReplies ? 'chevronR' : 'chevronD'} size={12} color={T.t4} />
            <Txt size={12} color={T.t4}>{replyCount} resposta{replyCount > 1 ? 's' : ''}</Txt>
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
            placeholder="Escreva uma resposta..."
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
    </div>
  );
}

export default function CommentsPage() {
  return (
    <Suspense>
      <CommentsPageInner />
    </Suspense>
  );
}

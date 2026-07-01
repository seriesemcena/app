'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Stars, StreamBadge, Toast, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { revStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRevStore } from '@/lib/db';

/* ── emoji picker data ── */
const EMOJI_GROUPS = [
  { label: '😀', emojis: ['😀','😂','🤣','😍','🥰','😎','🤩','😱','😭','😤','🙄','🤔','😴','🤯','🥳'] },
  { label: '❤️', emojis: ['❤️','🔥','⭐','💯','👏','🎬','🍿','📺','🎥','🏆','💀','✨','💫','🎭','🎞️'] },
  { label: '👍', emojis: ['👍','👎','🤌','💪','🙏','👀','🫣','🤦','🤷','💁','🫡','🫶','🤟','✌️','🤞'] },
];

const FAKE_GIFS = [
  { id: 'g1', label: 'Mind blown',      emoji: '🤯' },
  { id: 'g2', label: 'Standing ovation',emoji: '👏' },
  { id: 'g3', label: 'Crying',          emoji: '😭' },
  { id: 'g4', label: "Chef's kiss",     emoji: '🤌' },
  { id: 'g5', label: 'Fire',            emoji: '🔥' },
  { id: 'g6', label: 'Amazing',         emoji: '✨' },
];

function EpisodePageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();

  /* ── params from URL ── */
  const tvId    = sp.get('tvId')    || '';
  const season  = sp.get('season')  || '1';
  const epNum   = sp.get('epNum')   || '1';
  const epName  = sp.get('name')    || '';
  const showName= sp.get('showName')|| '';
  const runtime = sp.get('runtime') || '';
  const overview= sp.get('overview')|| '';
  const still   = sp.get('still')   || '';
  const network = sp.get('network') || '';

  /* localStorage key — unique per show + season + episode */
  const storageKey = `ep_${tvId}_s${season}_e${epNum}`;

  /* ── state ── */
  const [watched, setWatched]         = useState(false);
  const [toast, setToast]             = useState<string | false>(false);
  const [reviews, setReviews]         = useState<Review[]>([]);

  /* review modal */
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalRating, setModalRating] = useState(0);
  const [comment, setComment]         = useState('');
  const [selectedGif, setSelectedGif] = useState<typeof FAKE_GIFS[0] | null>(null);
  const [emojiTab, setEmojiTab]       = useState(0);
  const [showEmoji, setShowEmoji]     = useState(false);
  const [showGif, setShowGif]         = useState(false);
  const [gifSearch, setGifSearch]     = useState('');
  const [replyOpen, setReplyOpen]     = useState<string | null>(null);
  const [replyText, setReplyText]     = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── Load reviews: localStorage first (instant), then Firestore (sync) ── */
  useEffect(() => {
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

  const insertEmoji = (e: string) => {
    setComment(c => c + e);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  const submitReview = async () => {
    if (modalRating === 0 && !comment.trim()) {
      showToast('Adicione nota ou comentário');
      return;
    }
    const displayName  = user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const newRev: Review = {
      id: `ep_${Date.now()}`,
      user: displayName,
      avatar: avatarLetter,
      rating: modalRating,
      text: comment.trim(),
      date: new Date().toISOString(),
      likes: 0,
    };
    // Optimistic: update UI and localStorage immediately
    const updated = revStore.addReview(storageKey, newRev);
    setReviews(updated);
    setModalOpen(false);
    setModalRating(0);
    setComment('');
    setSelectedGif(null);
    showToast('Avaliação publicada! 🎉');
    // Sync to Firestore in background
    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), storageKey, newRev); } catch {}
    }
  };

  const toggleLike = async (id: string) => {
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
        const cloud = await dbRevStore.toggleLike(getDB(), storageKey, id, user?.uid || 'anon');
        setReviews(cloud);
        revStore.set(storageKey, cloud);
      } catch {}
    }
  };

  const submitReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    const displayName  = user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const updated = reviews.map(r =>
      r.id === reviewId
        ? {
            ...r,
            replies: [
              ...(r.replies || []),
              { id: `rep_${Date.now()}`, user: displayName, avatar: avatarLetter, text: replyText.trim(), date: new Date().toISOString() },
            ],
          }
        : r
    );
    setReviews(updated);
    revStore.set(storageKey, updated);
    setReplyText('');
    setReplyOpen(null);
    showToast('Resposta enviada!');
    // Sync to Firestore
    if (firebaseConfigured) {
      try { await dbRevStore.set(getDB(), storageKey, updated); } catch {}
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

  const filteredGifs = FAKE_GIFS.filter(
    g => !gifSearch || g.label.toLowerCase().includes(gifSearch.toLowerCase())
  );

  return (
    <Frame>
      <Screen>
        {/* Back button */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20 }}>
          <button onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,0.55)', border: `1px solid var(--c-t4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="chevronL" size={18} color={T.white} />
          </button>
        </div>

        <ScrollArea>
          {/* ── Backdrop / still ── */}
          <div style={{ height: 210, position: 'relative', overflow: 'hidden', background: still ? 'transparent' : 'var(--c-surface2)' }}>
            {still && (
              <img
                src={`https://image.tmdb.org/t/p/w780${still}`}
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
                {/* Show name */}
                {showName ? (
                  <Txt size={12} color={T.pink} weight={700} style={{ display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {showName}
                  </Txt>
                ) : null}
                {/* Episode name */}
                <Txt size={20} weight={800} style={{ display: 'block', marginBottom: 6, lineHeight: 1.25 }}>
                  {epName || `Episódio ${epNum}`}
                </Txt>
                {/* Season · Episode · Duration */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Txt size={12} color={T.t3}>
                    T{season} · E{epNum}{runtime ? ` · ${runtime} min` : ''}
                  </Txt>
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
              onClick={() => { setWatched(w => !w); showToast(watched ? 'Desmarcado' : 'Marcado como assistido ✓'); }}
              style={{ width: '100%', padding: '15px 0', borderRadius: T.radiusSm, background: watched ? T.surface2 : T.pink, border: watched ? `1px solid ${T.border}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', marginBottom: 12, boxShadow: watched ? 'none' : `0 4px 16px ${T.pinkGlow}` }}>
              <Icon name={watched ? 'check' : 'eye'} size={18} color={watched ? T.t2 : T.white} />
              <Txt size={15} weight={700} color={watched ? T.t2 : T.white}>
                {watched ? 'Assistido ✓' : 'Marcar como assistido'}
              </Txt>
            </button>

            {/* ── Avaliar button ── */}
            <button onClick={() => setModalOpen(true)}
              style={{ width: '100%', padding: '15px 0', borderRadius: T.radiusSm, background: T.card, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
              <Icon name="star" size={18} color={T.gold} />
              <Txt size={15} weight={700} color={T.t1}>Avalie este episódio</Txt>
            </button>

            {/* ── Reviews ── */}
            {reviews.length > 0 ? (
              <>
                <Txt size={15} weight={800} style={{ display: 'block', marginBottom: 14 }}>
                  Avaliações ({reviews.length})
                </Txt>
                {reviews.map(rev => (
                  <ReviewCard
                    key={rev.id}
                    rev={rev}
                    timeAgo={timeAgo}
                    onLike={() => toggleLike(rev.id)}
                    replyOpen={replyOpen === rev.id}
                    onToggleReply={() => setReplyOpen(r => r === rev.id ? null : rev.id)}
                    replyText={replyText}
                    onReplyChange={setReplyText}
                    onSubmitReply={() => submitReply(rev.id)}
                    gifData={FAKE_GIFS}
                  />
                ))}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
                <Txt size={13} color={T.t3} style={{ display: 'block' }}>
                  Seja o primeiro a avaliar este episódio!
                </Txt>
              </div>
            )}
          </div>
          <div style={{ height: 80 }} />
        </ScrollArea>

        <Toast msg={toast} visible={!!toast} />

        {/* ── Review modal ── */}
        {modalOpen && (
          <>
            <div onClick={() => { setModalOpen(false); setShowEmoji(false); setShowGif(false); }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40 }} />

            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, background: T.surface, borderRadius: '20px 20px 0 0', overflow: 'hidden', maxHeight: '88%', display: 'flex', flexDirection: 'column' }}>
              {/* handle + title */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, position: 'relative' }}>
                <div style={{ width: 36, height: 4, background: T.t4, borderRadius: 2, position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
                <Txt size={15} weight={700}>Avaliar episódio</Txt>
                <button onClick={() => { setModalOpen(false); setShowEmoji(false); setShowGif(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Icon name="close" size={18} color={T.t3} />
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 16px 0', flex: 1 }}>
                {/* Star rating */}
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Sua nota</Txt>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Stars value={modalRating} max={5} size={36} onChange={setModalRating} />
                  </div>
                  {modalRating > 0 && (
                    <Txt size={13} color={T.gold} weight={700} style={{ display: 'block', marginTop: 6 }}>
                      {'★'.repeat(modalRating)} {['', 'Ruim', 'Regular', 'Bom', 'Ótimo', 'Obra-prima'][modalRating]}
                    </Txt>
                  )}
                </div>

                {/* GIF preview */}
                {selectedGif && (
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <div style={{ height: 80, borderRadius: 10, background: 'var(--c-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 36 }}>{selectedGif.emoji}</span>
                      <Txt size={12} color={T.t3} style={{ marginLeft: 8 }}>{selectedGif.label}</Txt>
                    </div>
                    <button onClick={() => setSelectedGif(null)}
                      style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="close" size={12} color={T.white} />
                    </button>
                  </div>
                )}

                {/* Textarea */}
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Escreva seu comentário..."
                    rows={3}
                    maxLength={500}
                    style={{ width: '100%', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, color: T.white, fontSize: 14, fontFamily: "'Area','Inter',sans-serif", padding: '12px 14px', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                  />
                  <Txt size={10} color={T.t4} style={{ position: 'absolute', bottom: 8, right: 10 }}>{comment.length}/500</Txt>
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => { setShowEmoji(e => !e); setShowGif(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, background: showEmoji ? T.pink : T.surface2, border: `1px solid ${showEmoji ? T.pink : T.border}`, cursor: 'pointer' }}>
                    <span style={{ fontSize: 16 }}>😀</span>
                    <Txt size={12} weight={600} color={showEmoji ? T.white : T.t2}>Emoji</Txt>
                  </button>
                  <button onClick={() => { setShowGif(g => !g); setShowEmoji(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, background: showGif ? T.pink : T.surface2, border: `1px solid ${showGif ? T.pink : T.border}`, cursor: 'pointer' }}>
                    <Txt size={11} weight={800} color={showGif ? T.white : T.t2}>GIF</Txt>
                  </button>
                </div>

                {/* Emoji picker */}
                {showEmoji && (
                  <div style={{ background: T.surface2, borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                      {EMOJI_GROUPS.map((g, i) => (
                        <button key={i} onClick={() => setEmojiTab(i)}
                          style={{ flex: 1, padding: '8px 0', background: emojiTab === i ? T.surface : 'transparent', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 8 }}>
                      {EMOJI_GROUPS[emojiTab].emojis.map(e => (
                        <button key={e} onClick={() => insertEmoji(e)}
                          style={{ width: 38, height: 38, fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* GIF picker */}
                {showGif && (
                  <div style={{ background: T.surface2, borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}` }}>
                      <input value={gifSearch} onChange={e => setGifSearch(e.target.value)} placeholder="Buscar GIF..."
                        style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.t1, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: 8 }}>
                      {filteredGifs.map(g => (
                        <button key={g.id} onClick={() => { setSelectedGif(g); setShowGif(false); }}
                          style={{ height: 64, borderRadius: 8, background: 'var(--c-surface)', border: selectedGif?.id === g.id ? `2px solid ${T.pink}` : `2px solid ${T.border}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                          <span style={{ fontSize: 24 }}>{g.emoji}</span>
                          <Txt size={9} color={T.t3}>{g.label}</Txt>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit */}
              <div style={{ padding: '12px 16px 24px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                <button onClick={submitReview}
                  style={{ width: '100%', padding: '14px 0', borderRadius: T.radiusSm, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}>
                  <Txt size={15} weight={700} color={T.white}>Publicar avaliação</Txt>
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
function ReviewCard({ rev, timeAgo, onLike, replyOpen, onToggleReply, replyText, onReplyChange, onSubmitReply, gifData }: {
  rev: Review & { liked?: boolean };
  timeAgo: (d: string) => string;
  onLike: () => void;
  replyOpen: boolean;
  onToggleReply: () => void;
  replyText: string;
  onReplyChange: (v: string) => void;
  onSubmitReply: () => void;
  gifData: typeof FAKE_GIFS;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const gif = gifData.find(g => g.id === (rev as any).gif);

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
        <Txt size={13} color={T.t2} style={{ lineHeight: 1.65, display: 'block', marginBottom: gif ? 10 : 12 }}>
          {rev.text}
        </Txt>
      )}

      {gif && (
        <div style={{ height: 64, borderRadius: 8, background: 'var(--c-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, border: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 28 }}>{gif.emoji}</span>
          <Txt size={11} color={T.t3}>{gif.label}</Txt>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={onLike} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name={rev.liked ? 'heart' : 'heartO'} size={15} color={rev.liked ? T.red : T.t3} />
          <Txt size={12} color={rev.liked ? T.red : T.t3}>{rev.likes || 0}</Txt>
        </button>
        <button onClick={onToggleReply} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name="message" size={15} color={replyOpen ? T.pink : T.t3} />
          <Txt size={12} color={replyOpen ? T.pink : T.t3}>Responder</Txt>
        </button>
        {(rev.replies?.length ?? 0) > 0 && (
          <button onClick={() => setShowReplies(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Icon name="chevronD" size={13} color={T.t3} />
            <Txt size={12} color={T.t3}>{rev.replies!.length} resposta{rev.replies!.length > 1 ? 's' : ''}</Txt>
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
            placeholder="Escreva uma resposta..."
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

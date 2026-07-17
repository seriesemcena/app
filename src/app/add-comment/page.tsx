'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, Toast, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { revStore, profileStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRevStore } from '@/lib/db';

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
    downsized_small: { mp4: string };
  };
};

function AddCommentPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();

  const storageKey = sp.get('key')      || '';
  const title      = sp.get('title')    || '';
  const showName   = sp.get('showName') || '';

  const [comment, setComment]         = useState('');
  const [toast, setToast]             = useState<string | false>(false);
  const [selectedGif, setSelectedGif] = useState<GiphyGif | null>(null);
  const [showEmoji, setShowEmoji]     = useState(false);
  const [emojiTab, setEmojiTab]       = useState(0);
  const [showGif, setShowGif]         = useState(false);
  const [gifSearch, setGifSearch]     = useState('');
  const [gifResults, setGifResults]   = useState<GiphyGif[]>([]);
  const [gifLoading, setGifLoading]   = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2200); };

  useEffect(() => {
    if (!showGif) return;
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
  }, [gifSearch, showGif]);

  const insertEmoji = (e: string) => {
    setComment(c => c + e);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  const submitComment = async () => {
    if (!comment.trim() && !selectedGif) {
      showToast('Escreva um comentário ou adicione um GIF');
      return;
    }
    const prof         = profileStore.get(user?.uid);
    const displayName  = prof.username || prof.name || user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const photoUrl     = user?.photoURL || prof.avatarImage || '';
    const newRev: Review = {
      id:       `rev_${Date.now()}`,
      user:     displayName,
      avatar:   avatarLetter,
      photoUrl,
      rating:   0,
      text:     comment.trim(),
      gifUrl:   selectedGif?.images?.fixed_height_small?.url || '',
      date:     new Date().toISOString(),
      likes: 0, likedBy: [], replies: [],
    };
    revStore.addReview(storageKey, newRev);
    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), storageKey, newRev); } catch {}
    }
    router.back();
  };

  const subtitle = [showName, title].filter(Boolean).join(' · ');

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            left={
              <button
                onClick={() => router.back()}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}
              >
                <Icon name="chevronL" size={16} color="#fff" />
              </button>
            }
            right={
              <button
                onClick={() => router.push('/notifications')}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}
              >
                <Icon name="bell" size={16} color="#fff" />
              </button>
            }
          />
          <div style={{ padding: '20px 16px 0' }}>

            {/* ── Título ── */}
            <Txt size={22} weight={800} style={{ display: 'block', marginBottom: 2, fontStretch: 'condensed' } as React.CSSProperties}>
              Novo comentário
            </Txt>
            {subtitle && (
              <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 20 }}>
                {subtitle}
              </Txt>
            )}

            {/* GIF preview */}
            {selectedGif && (
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <img
                  src={selectedGif.images.fixed_height_small.url}
                  alt={selectedGif.title}
                  style={{ width: '100%', borderRadius: 12, display: 'block', maxHeight: 200, objectFit: 'cover' }}
                />
                <button
                  onClick={() => setSelectedGif(null)}
                  style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, background: 'rgba(0,0,0,0.65)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="close" size={13} color={T.white} />
                </button>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Escreva seu comentário..."
              maxLength={500}
              autoFocus
              style={{ width: '100%', minHeight: 160, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14, color: T.white, fontSize: 15, fontFamily: "'Area','Inter',sans-serif", padding: '14px 16px', outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}
            />
            <Txt size={11} color={T.t4} style={{ display: 'block', textAlign: 'right', marginTop: 4, marginBottom: 16 }}>
              {comment.length}/500
            </Txt>

            {/* Tools row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => { setShowEmoji(s => !s); setShowGif(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, background: showEmoji ? T.pink : T.surface2, border: showEmoji ? 'none' : `1px solid ${T.border}`, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 15 }}>😀</span>
                <Txt size={12} weight={700} color={showEmoji ? '#fff' : T.t2}>Emoji</Txt>
              </button>
              <button
                onClick={() => { setShowGif(s => !s); setShowEmoji(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, background: showGif ? T.pink : T.surface2, border: showGif ? 'none' : `1px solid ${T.border}`, cursor: 'pointer' }}
              >
                <Txt size={12} weight={700} color={showGif ? '#fff' : T.t2}>GIF</Txt>
              </button>
            </div>

            {/* Emoji picker */}
            {showEmoji && (
              <div style={{ background: T.surface2, borderRadius: 14, border: `1px solid ${T.border}`, padding: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {EMOJI_GROUPS.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setEmojiTab(i)}
                      style={{ fontSize: 18, padding: '4px 8px', borderRadius: 8, background: emojiTab === i ? T.pink : 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {EMOJI_GROUPS[emojiTab].emojis.map(e => (
                    <button
                      key={e}
                      onClick={() => insertEmoji(e)}
                      style={{ fontSize: 22, padding: 6, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* GIF picker */}
            {showGif && (
              <div style={{ background: T.surface2, borderRadius: 14, border: `1px solid ${T.border}`, padding: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input
                    value={gifSearch}
                    onChange={e => setGifSearch(e.target.value)}
                    placeholder="Buscar GIF..."
                    style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '8px 14px', outline: 'none' }}
                  />
                  <span style={{ fontSize: 11, color: T.t4, fontWeight: 700, letterSpacing: 0.5 }}>GIPHY</span>
                </div>
                {gifLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Txt size={12} color={T.t3}>Carregando...</Txt>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
                    {gifResults.map(gif => (
                      <button
                        key={gif.id}
                        onClick={() => { setSelectedGif(gif); setShowGif(false); }}
                        style={{ padding: 0, border: 'none', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', height: 110, background: T.surface }}
                      >
                        <img
                          src={gif.images.fixed_height_small.url}
                          alt={gif.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ height: 100 }} />
        </ScrollArea>

        {/* Publish button */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px 28px', background: `linear-gradient(to bottom, transparent, ${T.bg} 40%)` }}>
          <button
            onClick={submitComment}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${T.pinkGlow}` }}
          >
            <Txt size={15} weight={700} color="#fff">Publicar comentário</Txt>
          </button>
        </div>

        <Toast msg={toast} visible={!!toast} />
      </Screen>
    </Frame>
  );
}

export default function AddCommentPage() {
  return (
    <Suspense>
      <AddCommentPageInner />
    </Suspense>
  );
}

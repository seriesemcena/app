'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { listStore, profileStore, notifInboxStore } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { dbActivityStore } from '@/lib/db';

type FeedTab = 'para_voce' | 'seguindo';

type ActivityItem = {
  id: string;
  titleKey: string;       // e.g. "tv_1396", "movie_550", "ep_1396_s4_e1"
  displayTitle: string;   // human-readable fallback
  user: string;
  avatar: string;
  color: string;
  photoUrl?: string;
  action: string;
  rating: number;
  text: string;
  time: string;
  posterColor: string;
  isMe?: boolean;
};

const ACTION_COLOR: Record<string, string> = {
  avaliou:   T.gold,
  adicionou: '#60a5fa',
  terminou:  '#4ade80',
  comentou:  T.pink,
};
const ACTION_ICON: Record<string, string> = {
  avaliou:   'star',
  adicionou: 'plus',
  terminou:  'check',
  comentou:  'message',
};
const POSTER_COLORS = ['#1a3a5c','#2a1a0a','#5c1a3a','#0a1a2a','#1a2a1a','#1a0a2a','#0a2a1a','#2a0a1a'];
const EMOJIS = ['🔥', '❤️', '😮', '😂', '👏'];

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

/* ── Parse Firestore titleKey → TMDB identifiers ── */
type ParsedKey =
  | { type: 'episode'; showId: number; season: number; episode: number }
  | { type: 'tv';      showId: number }
  | { type: 'movie';   movieId: number }
  | { type: 'unknown' };

function parseTitleKey(key: string): ParsedKey {
  const ep = key.match(/^ep_(\d+)_s(\d+)_e(\d+)/);
  if (ep) return { type: 'episode', showId: +ep[1], season: +ep[2], episode: +ep[3] };
  const tv = key.match(/^tv_(\d+)/);
  if (tv) return { type: 'tv', showId: +tv[1] };
  const mv = key.match(/^movie_(\d+)/);
  if (mv) return { type: 'movie', movieId: +mv[1] };
  return { type: 'unknown' };
}

/* ── Fetch TMDB data for a card ── */
async function fetchCardData(titleKey: string, fallback: string): Promise<{ label: string; imageUrl: string | null }> {
  const parsed = parseTitleKey(titleKey);
  try {
    if (parsed.type === 'episode') {
      const [showData, epData] = await Promise.all([
        fetch(`/api/tmdb?endpoint=/tv/${parsed.showId}`).then(r => r.json()),
        fetch(`/api/tmdb?endpoint=/tv/${parsed.showId}/season/${parsed.season}/episode/${parsed.episode}`).then(r => r.json()),
      ]);
      const sNum = parsed.season;
      const eNum = String(parsed.episode).padStart(2, '0');
      const showName = showData.name || 'Série';
      const label = `${showName} · ${sNum}×${eNum}`;
      const imageUrl = epData.still_path
        ? `https://image.tmdb.org/t/p/w780${epData.still_path}`
        : showData.poster_path
          ? `https://image.tmdb.org/t/p/w342${showData.poster_path}`
          : null;
      return { label, imageUrl };
    }
    if (parsed.type === 'tv') {
      const d = await fetch(`/api/tmdb?endpoint=/tv/${parsed.showId}`).then(r => r.json());
      return {
        label:    d.name || fallback,
        imageUrl: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null,
      };
    }
    if (parsed.type === 'movie') {
      const d = await fetch(`/api/tmdb?endpoint=/movie/${parsed.movieId}`).then(r => r.json());
      return {
        label:    d.title || fallback,
        imageUrl: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null,
      };
    }
  } catch { /* ignore */ }
  return { label: fallback, imageUrl: null };
}

/* ──────────────────────────────────────────────── */
export default function FeedPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [feedTab, setFeedTab]         = useState<FeedTab>('para_voce');
  const [globalFeed, setGlobalFeed]   = useState<ActivityItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [scrolled, setScrolled]       = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setUnreadNotifs(notifInboxStore.unreadCount()); }, []);

  const displayName  = user?.displayName || user?.email?.split('@')[0] || 'Você';
  const avatarLetter = displayName[0]?.toUpperCase() || 'U';
  const myPhotoUrl   = user?.photoURL || profileStore.get().avatarImage || '';

  /* ── My real activities from local lists ── */
  const myActivities = useMemo<ActivityItem[]>(() => {
    const watched = listStore.get('watched');
    const want    = listStore.get('want');
    return [
      ...watched.slice(0, 3).map((item, i) => ({
        id: `me_watched_${i}`,
        titleKey: `${item.type}_${item.id}`,
        displayTitle: item.title,
        user: displayName, avatar: avatarLetter, color: '#C069FF', photoUrl: myPhotoUrl,
        action: 'terminou', rating: 0, text: '',
        time: 'recentemente', posterColor: POSTER_COLORS[i % POSTER_COLORS.length], isMe: true,
      })),
      ...want.slice(0, 2).map((item, i) => ({
        id: `me_want_${i}`,
        titleKey: `${item.type}_${item.id}`,
        displayTitle: item.title,
        user: displayName, avatar: avatarLetter, color: '#C069FF', photoUrl: myPhotoUrl,
        action: 'adicionou', rating: 0, text: '',
        time: 'recentemente', posterColor: POSTER_COLORS[(i + 3) % POSTER_COLORS.length], isMe: true,
      })),
    ];
  }, [displayName, avatarLetter, myPhotoUrl]);

  /* ── Global feed: activity collection + reviews collection ── */
  useEffect(() => {
    async function loadFeed() {
      setLoadingFeed(true);
      if (!firebaseConfigured) { setLoadingFeed(false); return; }
      try {
        const db    = getDB();
        const items: ActivityItem[] = [];

        // 1. Activity items (watched/watching/want actions)
        const activityDocs = await dbActivityStore.getRecent(db, 60);
        activityDocs.forEach((a) => {
          const actionLabel =
            a.action === 'watched'  ? 'finalizou' :
            a.action === 'watching' ? 'está assistindo' :
            a.action === 'want'     ? 'adicionou à lista' : 'avaliou';
          items.push({
            id:           `act_${a.uid}_${a.titleKey}_${a.createdAt}`,
            titleKey:     a.titleKey,
            displayTitle: a.titleName,
            user:         a.username,
            avatar:       a.avatar,
            color:        '#C069FF',
            photoUrl:     a.photoUrl,
            action:       actionLabel,
            rating:       a.rating,
            text:         a.text,
            time:         timeAgo(a.createdAt),
            posterColor:  POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)],
          });
        });

        // 2. Reviews
        const snap = await getDocs(collection(db, 'reviews'));
        snap.forEach((doc) => {
          const titleKey = doc.id;
          const reviews: any[] = doc.data()?.items ?? [];
          reviews.slice(0, 2).forEach((rev: any) => {
            items.push({
              id:           `rev_${titleKey}_${rev.id}`,
              titleKey,
              displayTitle: titleKey,
              user:         rev.user || 'Usuário',
              avatar:       rev.avatar || rev.user?.[0]?.toUpperCase() || 'U',
              color:        '#6366f1',
              photoUrl:     rev.photoUrl || '',
              action:       'avaliou',
              rating:       rev.rating || 0,
              text:         rev.text || '',
              time:         rev.date ? timeAgo(rev.date) : rev.date || '',
              posterColor:  POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)],
            });
          });
        });

        // Sort combined list by recency (activity docs have ISO createdAt, reviews have date)
        items.sort((a, b) => (b.time > a.time ? 1 : -1));
        setGlobalFeed(items);
      } catch { /* ignore */ }
      setLoadingFeed(false);
    }
    loadFeed();
  }, []);

  const feedItems: ActivityItem[] =
    feedTab === 'para_voce' ? [...myActivities, ...globalFeed] : globalFeed;

  const isEmpty = !loadingFeed && feedItems.length === 0;

  return (
    <Frame>
      <Screen>
        <div
          ref={scrollRef}
          onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)}
          style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}
        >

          {/* ── Header glass sticky ── */}
          <GlassHeader
            right={
              <button onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Icon name="bell" size={16} color="#fff" />
                {unreadNotifs > 0 && (
                  <div style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 4, background: T.pink, border: '1.5px solid rgba(0,0,0,0.4)' }} />
                )}
              </button>
            }
          />

          {/* ── Tabs — sticky logo abaixo do header ── */}
          <div style={{
            position: 'sticky', top: 56, zIndex: 48,
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
                background: feedTab === id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.12)',
                border: feedTab === id ? 'none' : '1px solid rgba(255,255,255,0.20)',
                color: feedTab === id ? '#C069FF' : 'rgba(255,255,255,0.80)',
                fontSize: scrolled ? 11 : 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.25s ease',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              } as React.CSSProperties}>{label}</button>
            ))}
          </div>

          {/* ── Content ── */}
          <div style={{ minHeight: 400, padding: '0 0 100px' }}>

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
                {feedItems.map((item) => <FeedCard key={item.id} item={item} />)}
              </div>
            )}
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

/* ──────────────────────────────────────────────── */
function FeedCard({ item }: { item: ActivityItem }) {
  const router      = useRouter();
  const actionColor = ACTION_COLOR[item.action] || T.t2;
  const actionIcon  = ACTION_ICON[item.action]  || 'star';

  const goToProfile = () => router.push(`/user/${encodeURIComponent(item.user)}`);

  /* ── TMDB resolved data ── */
  const [cardData, setCardData] = useState<{ label: string; imageUrl: string | null } | null>(null);
  useEffect(() => {
    fetchCardData(item.titleKey, item.displayTitle).then(setCardData);
  }, [item.titleKey, item.displayTitle]);

  const displayLabel = cardData?.label ?? item.displayTitle;
  const imageUrl     = cardData?.imageUrl ?? null;

  /* ── Emoji reactions ── */
  const [reactions, setReactions]   = useState<Record<string, number>>({});
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);

  const react = (emoji: string) => {
    setReactions(prev => {
      const next = { ...prev };
      if (myReaction) next[myReaction] = Math.max(0, (next[myReaction] || 0) - 1);
      if (myReaction !== emoji) {
        next[emoji] = (next[emoji] || 0) + 1;
        setMyReaction(emoji);
      } else {
        setMyReaction(null);
      }
      return next;
    });
    setShowEmojis(false);
  };

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);

  /* ── Reply box ── */
  const [showReply, setShowReply]   = useState(false);
  const [replyText, setReplyText]   = useState('');
  const [replies, setReplies]       = useState<string[]>([]);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const sendReply = () => {
    if (!replyText.trim()) return;
    setReplies(prev => [...prev, replyText.trim()]);
    setReplyText('');
    setShowReply(false);
  };

  useEffect(() => {
    if (showReply) replyRef.current?.focus();
  }, [showReply]);

  return (
    <div style={{ background: T.card, borderRadius: 20, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

      {/* ── User row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={goToProfile} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photoUrl} alt={item.user} style={{ width: 42, height: 42, borderRadius: 21, objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: 42, height: 42, borderRadius: 21, background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={15} weight={800} color="#fff">{item.avatar}</Txt>
            </div>
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <button onClick={goToProfile} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <Txt size={14} weight={700} color={T.t1}>{item.user}</Txt>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Icon name={actionIcon as Parameters<typeof Icon>[0]['name']} size={11} color={actionColor} />
              <Txt size={12} weight={600} color={actionColor}>{item.action}</Txt>
            </div>
          </div>
          {/* Formatted title: "Show Name · S4E01" */}
          <Txt size={12} weight={600} color={T.t2} style={{ display: 'block', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayLabel}
          </Txt>
          <Txt size={11} color={T.t4} style={{ display: 'block', marginTop: 1 }}>{item.time}</Txt>
        </div>
      </div>

      {/* ── Review text — sem background ── */}
      {item.text ? (
        <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.65, marginBottom: 12, fontStyle: 'italic' }}>
          "{item.text}"
        </Txt>
      ) : null}

      {/* ── Poster / still image ── */}
      <div style={{ width: '100%', height: 200, borderRadius: 14, background: imageUrl ? 'transparent' : item.posterColor, overflow: 'hidden', position: 'relative', marginBottom: 14 }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={displayLabel}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={13} weight={600} color="rgba(255,255,255,0.5)">{displayLabel}</Txt>
          </div>
        )}
      </div>

      {/* ── Replies ── */}
      {replies.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {replies.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Txt size={11} weight={800} color="#fff">V</Txt>
              </div>
              <div style={{ flex: 1, background: T.surface2, borderRadius: 10, padding: '7px 10px' }}>
                <Txt size={12} color={T.t1}>{r}</Txt>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Reply input box ── */}
      {showReply && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={replyRef}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Escreva uma resposta..."
            rows={2}
            style={{
              flex: 1, padding: '10px 12px',
              background: T.surface2,
              border: `1.5px solid ${T.pink}`,
              borderRadius: 12, resize: 'none',
              color: T.t1, fontSize: 13,
              fontFamily: "'Area','Inter',sans-serif",
              outline: 'none', lineHeight: 1.5,
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
          />
          <button
            onClick={sendReply}
            style={{ width: 36, height: 36, borderRadius: 18, background: T.pink, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="chevronR" size={16} color="#fff" />
          </button>
        </div>
      )}

      {/* ── Actions bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>

        {/* Emoji reactions trigger */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowEmojis(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: myReaction ? 'rgba(192,105,255,0.10)' : 'none', border: 'none', borderRadius: 16, padding: '5px 8px', cursor: 'pointer' }}>
            <span style={{ fontSize: 16 }}>{myReaction || '🙂'}</span>
            {totalReactions > 0 && <Txt size={12} color={T.t2} weight={600}>{totalReactions}</Txt>}
          </button>

          {/* Emoji picker */}
          {showEmojis && (
            <>
              <div onClick={() => setShowEmojis(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
              <div style={{
                position: 'absolute', bottom: 40, left: 0, zIndex: 20,
                background: T.card, borderRadius: 20, padding: '8px 12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                border: `1px solid ${T.border}`,
                display: 'flex', gap: 4,
              }}>
                {EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => react(e)}
                    style={{
                      fontSize: 22, background: myReaction === e ? 'rgba(192,105,255,0.12)' : 'transparent',
                      border: 'none', borderRadius: 10, padding: '4px 6px', cursor: 'pointer',
                      transform: myReaction === e ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.15s',
                    }}
                  >{e}</button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Reaction summary row */}
        {Object.entries(reactions).filter(([, c]) => c > 0).map(([emoji, count]) => (
          <div key={emoji} style={{ display: 'flex', alignItems: 'center', gap: 2, background: T.surface2, borderRadius: 12, padding: '3px 8px' }}>
            <span style={{ fontSize: 13 }}>{emoji}</span>
            <Txt size={11} weight={600} color={T.t3}>{count}</Txt>
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Reply button */}
        <button
          onClick={() => setShowReply(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px', borderRadius: 12 }}>
          <Icon name="message" size={15} color={showReply ? T.pink : T.t3} />
          <Txt size={12} color={showReply ? T.pink : T.t3} weight={showReply ? 700 : 400}>Responder</Txt>
        </button>

        {/* Share button */}
        <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px', borderRadius: 12 }}>
          <Icon name="share" size={15} color={T.t3} />
          <Txt size={12} color={T.t3}>Compartilhar</Txt>
        </button>
      </div>
    </div>
  );
}

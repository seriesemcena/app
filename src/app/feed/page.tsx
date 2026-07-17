'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';
import { profileStore, notifInboxStore } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { dbActivityStore, dbRevStore, dbReportStore } from '@/lib/db';

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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [feedTab, setFeedTab]         = useState<FeedTab>('para_voce');
  const [globalFeed, setGlobalFeed]   = useState<ActivityItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
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
        const items: ActivityItem[] = [];

        // 1. Activity docs — apenas avaliações (action === 'reviewed')
        const activityDocs = await dbActivityStore.getRecent(db, 60);
        activityDocs.forEach((a) => {
          if (a.action !== 'reviewed') return;
          items.push({
            id:             `act_${a.docId}`,
            uid:            a.uid,
            firestoreDocId: a.docId,
            titleKey:       a.titleKey,
            displayTitle:   a.titleName,
            user:           a.username,
            avatar:         a.avatar,
            color:          '#C069FF',
            photoUrl:       a.photoUrl,
            action:         a.rating > 0 ? 'avaliou' : 'comentou',
            rating:         a.rating,
            text:           a.text,
            time:           timeAgo(a.createdAt),
            rawDate:        a.createdAt,
            posterColor:    POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)],
          });
        });

        // 2. Reviews collection
        const snap = await getDocs(collection(db, 'reviews'));
        snap.forEach((doc) => {
          const titleKey = doc.id;
          const reviews: any[] = doc.data()?.items ?? [];
          const sorted = [...reviews].sort((a: any, b: any) =>
            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
          );
          sorted.slice(0, 2).forEach((rev: any) => {
            if (!rev.text && !rev.gifUrl) return;
            items.push({
              id:             `rev_${titleKey}_${rev.id}`,
              reviewId:       rev.id,
              reviewTitleKey: titleKey,
              titleKey,
              displayTitle:   titleKey,
              user:           rev.user || 'Usuário',
              avatar:         rev.avatar || rev.user?.[0]?.toUpperCase() || 'U',
              color:          '#6366f1',
              photoUrl:       rev.photoUrl || '',
              action:         (rev.rating || 0) > 0 ? 'avaliou' : 'comentou',
              rating:         rev.rating || 0,
              text:           rev.text || '',
              mediaUrl:       rev.gifUrl || '',
              time:           rev.date ? timeAgo(rev.date) : '',
              rawDate:        rev.date || '',
              posterColor:    POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)],
            });
          });
        });

        items.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
        setGlobalFeed(items);
      } catch { /* ignore */ }
      setLoadingFeed(false);
    }
    loadFeed();
  }, []);

  const handleDeleteItem = (id: string) =>
    setGlobalFeed(prev => prev.filter(i => i.id !== id));

  const feedItems: ActivityItem[] = globalFeed;

  const isEmpty = !loadingFeed && feedItems.length === 0;

  return (
    <Frame>
      <Screen>
        <div
          ref={scrollRef}
          onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)}
          style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}
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
                background: feedTab === id
                  ? (isDark ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,12,0.88)')
                  : (isDark ? 'rgba(255,255,255,0.12)' : '#fff'),
                border: feedTab === id
                  ? 'none'
                  : (isDark ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(0,0,0,0.11)'),
                color: feedTab === id
                  ? (isDark ? '#C069FF' : '#fff')
                  : (isDark ? 'rgba(255,255,255,0.80)' : 'rgba(0,0,0,0.60)'),
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
                {feedItems.map((item) => <FeedCard key={item.id} item={item} onDelete={handleDeleteItem} />)}
              </div>
            )}
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

/* ──────────────────────────────────────────────── */
function FeedCard({ item, onDelete }: { item: ActivityItem; onDelete: (id: string) => void }) {
  const router      = useRouter();
  const { user }    = useAuth();
  const actionColor = ACTION_COLOR[item.action] || T.t2;
  const actionIcon  = ACTION_ICON[item.action]  || 'star';

  const myName   = user?.displayName || user?.email?.split('@')[0] || '';
  const isMyPost = !!user && (
    (item.uid ? item.uid === user.uid : false) ||
    (!!myName && item.user === myName)
  );

  const goToProfile = () => router.push(`/user/${encodeURIComponent(item.user)}`);

  /* ── TMDB label ── */
  const [displayLabel, setDisplayLabel] = useState(item.displayTitle);
  useEffect(() => {
    fetchCardData(item.titleKey, item.displayTitle).then(d => setDisplayLabel(d.label));
  }, [item.titleKey, item.displayTitle]);

  /* ── Emoji reactions ── */
  const [reactions, setReactions]       = useState<Record<string, number>>({});
  const [myReaction, setMyReaction]     = useState<string | null>(null);
  const [showEmojis, setShowEmojis]     = useState(false);
  const [showReactors, setShowReactors] = useState(false);

  const react = (emoji: string) => {
    setReactions(prev => {
      const next = { ...prev };
      if (myReaction) next[myReaction] = Math.max(0, (next[myReaction] || 0) - 1);
      if (myReaction !== emoji) { next[emoji] = (next[emoji] || 0) + 1; setMyReaction(emoji); }
      else { setMyReaction(null); }
      return next;
    });
    setShowEmojis(false);
  };

  const totalReactions  = Object.values(reactions).reduce((a, b) => a + b, 0);
  const reactionEntries = Object.entries(reactions).filter(([, c]) => c > 0);

  /* ── Three-dot menu ── */
  const [showMenu,   setShowMenu]   = useState(false);
  const [deleting,   setDeleting]   = useState(false);
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
      if (item.firestoreDocId) {
        await dbActivityStore.delete(db, item.firestoreDocId);
      } else if (item.reviewId && item.reviewTitleKey) {
        await dbRevStore.remove(db, item.reviewTitleKey, item.reviewId);
      }
      onDelete(item.id);
    } catch {
      setDeleting(false);
      showToast('Erro ao excluir. Tente novamente.');
    }
  };

  const handleReport = async () => {
    setShowMenu(false);
    if (!firebaseConfigured || !user) {
      showToast('Faça login para denunciar.');
      return;
    }
    try {
      const db = getDB();
      await dbReportStore.add(db, {
        itemId:       item.id,
        reportedUser: item.user,
        content:      item.text,
        reportedBy:   user.uid,
        reportedAt:   new Date().toISOString(),
      });
      showToast('Denúncia enviada. Obrigado!');
    } catch {
      showToast('Erro ao enviar denúncia.');
    }
  };

  const menuOptions = [
    { label: 'Denunciar',  icon: 'flag'  as const, color: T.red ?? '#ff4444', action: handleReport },
    ...(!isMyPost ? [{ label: 'Ocultar conteúdo deste usuário', icon: 'eye' as const, color: T.t2, action: () => { setShowMenu(false); showToast('Conteúdo ocultado.'); } }] : []),
    ...(isMyPost  ? [{ label: 'Excluir comentário', icon: 'close' as const, color: T.red ?? '#ff4444', action: handleDelete }] : []),
  ];

  return (
    <div style={{ background: T.card, borderRadius: 20, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', position: 'relative', opacity: deleting ? 0.5 : 1, transition: 'opacity 0.2s' }}>

      {/* Toast feedback */}
      {toast && (
        <div style={{ position: 'absolute', bottom: 12, left: 16, right: 16, zIndex: 50, background: 'rgba(30,30,34,0.96)', border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 14px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as React.CSSProperties}>
          <Txt size={13} weight={600} color={T.t1}>{toast}</Txt>
        </div>
      )}

      {/* ── Three-dot menu — topo direito ── */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 16, color: T.t4, letterSpacing: 1, lineHeight: 1, fontWeight: 700 }}>···</span>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingRight: 28 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1, minWidth: 0 }}>
            <Txt size={12} weight={600} color={T.t2} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {displayLabel}
            </Txt>
            {item.rating > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 7, background: '#FFEB13', flexShrink: 0 }}>
                <Icon name="star" size={9} color="#1a1400" />
                <Txt size={11} weight={700} color="#1a1400">{item.rating}/10</Txt>
              </div>
            )}
          </div>
          <Txt size={11} color={T.t4} style={{ display: 'block', marginTop: 1 }}>{item.time}</Txt>
        </div>
      </div>

      {/* ── Review text ── */}
      {item.text ? (
        <Txt size={15} color={T.t2} style={{ display: 'block', lineHeight: 1.65, marginBottom: 12 }}>
          {item.text}
        </Txt>
      ) : null}

      {/* ── Imagem/GIF — apenas se o usuário escolheu durante a avaliação ── */}
      {item.mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.mediaUrl}
          alt=""
          style={{ width: '100%', borderRadius: 14, display: 'block', marginBottom: 12, maxHeight: 320, objectFit: 'cover' }}
        />
      )}

      {/* ── Actions bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, paddingTop: 10, borderTop: `1px solid ${T.border}`, position: 'relative' }}>

        {/* Reacts: emoji picker trigger + count que abre popup de quem reagiu */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* Emoji trigger — ícone coração por padrão */}
          <button
            onClick={() => setShowEmojis(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: myReaction ? 'rgba(192,105,255,0.10)' : 'none', border: 'none', borderRadius: 14, padding: '5px 8px 5px 6px', cursor: 'pointer' }}>
            {myReaction
              ? <span style={{ fontSize: 18, lineHeight: 1 }}>{myReaction}</span>
              : <Icon name={myReaction ? 'heart' : 'heartO'} size={18} color={T.t3} />
            }
          </button>

          {/* Count — abre popup de quem reagiu */}
          <button
            onClick={() => totalReactions > 0 ? setShowReactors(true) : setShowEmojis(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px' }}>
            <Txt size={13} weight={600} color={totalReactions > 0 ? T.t1 : T.t3}>{totalReactions}</Txt>
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

        <div style={{ width: 1, height: 18, background: T.border, margin: '0 8px' }} />

        {/* Respostas — navega para página de comentários */}
        <button
          onClick={() => router.push(`/comments?key=${encodeURIComponent(item.titleKey)}&title=${encodeURIComponent(displayLabel)}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px', borderRadius: 12 }}>
          <Icon name="message" size={15} color={T.t3} />
          <Txt size={13} weight={600} color={T.t3}>0</Txt>
        </button>

        <div style={{ flex: 1 }} />

        {/* Compartilhar */}
        <button
          onClick={() => { if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ url: window.location.href }).catch(() => {}); }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px', borderRadius: 12 }}>
          <Icon name="share" size={15} color={T.t3} />
        </button>
      </div>
    </div>
  );
}

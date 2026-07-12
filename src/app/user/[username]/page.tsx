'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { ImgWithSkeleton } from '@/components/posters';
import { listStore, revStore, profileStore, prefsStore, type Profile } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore } from '@/lib/db';


const COLLAGE_SLOTS: Array<{ left?: number; right?: number; top: number; rotate: number; width: number }> = [
  { left:  -18, top:  8,  rotate: -20, width: 115 },
  { left:   72, top: -18, rotate:  -8, width: 108 },
  { left:  158, top:  12, rotate:   6, width: 118 },
  { left:  255, top: -12, rotate:  16, width: 110 },
  { right: -20, top:  20, rotate:  24, width: 108 },
  { left:   30, top:  90, rotate: -12, width: 100 },
];

function UserProfileInner() {
  const router            = useRouter();
  const params            = useParams();
  const { user, loading } = useAuth();

  const username     = decodeURIComponent((params.username as string) || '');
  const avatarLetter = username[0]?.toUpperCase() || '?';

  const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'Você';
  const isMe            = username === currentUserName;

  /* ── Own-user data (from localStorage) ── */
  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [stats,    setStats]    = useState({ watched: 0, watching: 0, want: 0, reviews: 0 });
  const [totalHours, setTotalHours] = useState(0);

  const favoritos  = useMemo(() => isMe ? listStore.get('favorites') : [], [isMe]);
  const wantList   = useMemo(() => isMe ? listStore.get('want')      : [], [isMe]);
  const watchingList = useMemo(() => isMe ? listStore.get('watching'): [], [isMe]);
  const watchedList  = useMemo(() => isMe ? listStore.get('watched') : [], [isMe]);

  /* ── Follow state (localStorage-based) ── */
  const [isFollowing,       setIsFollowing]       = useState(false);
  const [followersCount,    setFollowersCount]    = useState(0);
  const [publicFollowing,   setPublicFollowing]   = useState(0);
  const [mounted,           setMounted]           = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!username || isMe) return;
    try {
      const followingList: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
      setIsFollowing(followingList.includes(username));
      const count = Number(localStorage.getItem(`sec_followers_${username}`) || '0');
      setFollowersCount(count);
      // We don't track other users' following lists — keep at 0
      setPublicFollowing(0);
    } catch {}
  }, [username, isMe]);

  const toggleFollow = () => {
    try {
      const following: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
      let newCount = followersCount;
      if (isFollowing) {
        const updated = following.filter(u => u !== username);
        localStorage.setItem('sec_following', JSON.stringify(updated));
        newCount = Math.max(0, followersCount - 1);
      } else {
        following.push(username);
        localStorage.setItem('sec_following', JSON.stringify(following));
        newCount = followersCount + 1;
      }
      localStorage.setItem(`sec_followers_${username}`, String(newCount));
      setFollowersCount(newCount);
      setIsFollowing(f => !f);
    } catch {}
  };


  useEffect(() => {
    if (!isMe || loading) return;

    setStats({
      watched:  listStore.get('watched').length,
      watching: listStore.get('watching').length,
      want:     listStore.get('want').length,
      reviews:  revStore.countAll(),
    });

    const applyProfile = (base: Profile, cloudOverride?: Partial<Profile>) => {
      const merged = cloudOverride ? { ...base, ...cloudOverride } : base;
      if (user) {
        const resolvedName = (merged.name && merged.name !== 'Lucas Tales')
          ? merged.name
          : (user.displayName || merged.name || 'Usuário');
        setProfile({
          ...merged,
          name:         resolvedName,
          username:     (merged.username && merged.username !== 'lucastales') ? merged.username : (user.email?.split('@')[0] || merged.username),
          avatarImage:  merged.avatarImage || user.photoURL || '',
          avatarLetter: resolvedName[0]?.toUpperCase() || 'U',
        });
      } else {
        setProfile(merged);
      }
    };

    const local = profileStore.get();
    applyProfile(local);

    if (user && firebaseConfigured) {
      dbProfileStore.get(getDB(), user.uid).then(cloud => {
        if (cloud && (cloud.name || cloud.username || cloud.bio)) {
          profileStore.set({ ...local, ...cloud });
          applyProfile(local, cloud);
        }
      }).catch(() => {});
    }

    /* Quick hour estimate from watched list */
    const watched = listStore.get('watched');
    const hours   = Math.round(watched.length * 1.5); // rough avg
    setTotalHours(hours);
  }, [isMe, user, loading]);


  if (loading && isMe) {
    return (
      <Frame><Screen>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, border: `3px solid ${T.pink}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </Screen></Frame>
    );
  }

  /* resolved display values */
  const displayName     = isMe ? (profile?.name || username) : username;
  const displayUsername = isMe ? (profile?.username || username) : username;
  const displayAvatar   = isMe && profile?.avatarImage ? profile.avatarImage : '';
  const displayGradient = isMe && profile?.avatarGradient ? profile.avatarGradient : `linear-gradient(135deg,${T.pink},#8B2FFF)`;
  const bio             = isMe ? profile?.bio : '';
  const followers       = isMe ? (profile?.followers ?? 0) : followersCount;
  const following       = isMe ? (profile?.following ?? 0) : publicFollowing;
  const topPct          = mounted && isMe && stats.watched > 0 ? Math.max(1, Math.round(100 / (stats.watched + 1))) : null;

  const collageSources     = [...favoritos, ...wantList];
  const collagePosterItems = collageSources.filter(x => !!x.poster_path).slice(0, 6);

  return (
    <Frame>
      <Screen>
        <ScrollArea>

          {/* ── Cover with collage ── */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative', height: 260, overflow: 'hidden', background: 'linear-gradient(160deg,#1a0d2e 0%,#0d0d1a 60%,#0a0a14 100%)' }}>
              {collagePosterItems.map((item, idx) => {
                const slot = COLLAGE_SLOTS[idx];
                if (!slot || !item.poster_path) return null;
                const posStyle: React.CSSProperties = {
                  position: 'absolute', top: slot.top, width: slot.width,
                  borderRadius: 12, overflow: 'hidden',
                  transform: `rotate(${slot.rotate}deg)`,
                  opacity: 0.65, boxShadow: '0 6px 20px rgba(0,0,0,0.7)',
                };
                if (slot.left  !== undefined) posStyle.left  = slot.left;
                if (slot.right !== undefined) posStyle.right = slot.right;
                return (
                  <div key={item.id} style={posStyle}>
                    <ImgWithSkeleton
                      src={`https://image.tmdb.org/t/p/w185${item.poster_path}`}
                      alt="" width="100%" height="auto"
                      style={{ display: 'block', aspectRatio: '2/3' }}
                    />
                  </div>
                );
              })}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 60%, rgba(13,13,15,1) 100%)', zIndex: 2 }} />

              {/* Back + actions */}
              <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 10 }}>
                <button onClick={() => router.back()}
                  style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                  <Icon name="chevronL" size={18} color="#fff" />
                </button>
              </div>
              <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 10 }}>
                {isMe ? (
                  <button onClick={() => router.push('/settings')}
                    style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Icon name="settings" size={18} color="#fff" />
                  </button>
                ) : (
                  <button style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Icon name="flag" size={16} color="#fff" />
                  </button>
                )}
              </div>
            </div>

            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -52, position: 'relative', zIndex: 20 }}>
              <div style={{
                width: 100, height: 100, borderRadius: 50,
                background: displayAvatar ? `url(${displayAvatar}) center/cover no-repeat` : displayGradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '3.5px solid #C069FF',
                boxShadow: '0 0 0 4px rgba(192,105,255,0.20), 0 8px 32px rgba(0,0,0,0.7)',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {!displayAvatar && <Txt size={36} weight={900} color="#fff">{displayName[0]?.toUpperCase() || avatarLetter}</Txt>}
              </div>
            </div>
          </div>

          {/* ── Name + username + bio ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 16px 0', gap: 5 }}>
            <Txt size={28} weight={900} color={T.white} style={{ display: 'block', textAlign: 'center', letterSpacing: '-0.5px' }}>
              {displayName}
            </Txt>
            <Txt size={13} color="rgba(255,255,255,0.45)" style={{ display: 'block', textAlign: 'center' }}>
              @{displayUsername}
            </Txt>
            {bio && (
              <Txt size={13} color="rgba(255,255,255,0.55)" style={{ display: 'block', textAlign: 'center', maxWidth: 280, lineHeight: 1.45, marginTop: 2 }}>
                {bio}
              </Txt>
            )}

            {/* ── Seguir button (outros usuários) ── */}
            {!isMe && (
              <button onClick={toggleFollow} style={{
                marginTop: 16,
                padding: '10px 36px', borderRadius: 24,
                background: isFollowing ? T.surface2 : T.pink,
                border: isFollowing ? `1px solid ${T.border}` : 'none',
                cursor: 'pointer',
                boxShadow: isFollowing ? 'none' : `0 4px 14px ${T.pinkGlow}`,
                transition: 'all 0.2s',
              }}>
                <Txt size={14} weight={700} color={isFollowing ? T.t2 : '#fff'}>
                  {isFollowing ? 'Seguindo ✓' : 'Seguir'}
                </Txt>
              </button>
            )}

            {/* ── Social pills ── */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { value: followers,  label: 'seguidores'  },
                { value: following,  label: 'seguindo'    },
                { value: isMe ? totalHours : 0, label: 'h assistidas' },
                ...(topPct !== null ? [{ value: `Top ${topPct}%`, label: 'ranking' }] : []),
              ].map(({ value, label }) => (
                <div key={label} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 18px', borderRadius: 24,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  minWidth: 70,
                }}>
                  <Txt size={15} weight={800} color={T.white}>{String(value)}</Txt>
                  <Txt size={10} weight={600} color="rgba(255,255,255,0.50)">{label}</Txt>
                </div>
              ))}
            </div>

            {/* ── Stats grid (own user only) ── */}
            {isMe && (
              <div style={{ display: 'flex', gap: 0, marginTop: 16, borderRadius: T.radiusSm, overflow: 'hidden', border: `1px solid ${T.border}`, width: '100%' }}>
                {[
                  [stats.watched,  'Assistidos'],
                  [stats.watching, 'Assistindo'],
                  [stats.want,     'Quero ver' ],
                  [stats.reviews,  'Reviews'   ],
                ].map(([v, l], i) => (
                  <div key={i} style={{ flex: 1, padding: '12px 4px', textAlign: 'center', background: T.card, borderRight: i < 3 ? `1px solid ${T.border}` : 'none' }}>
                    <Txt size={18} weight={800} color={T.t1} style={{ display: 'block' }}>{String(v || 0)}</Txt>
                    <Txt size={9}  color={T.t3}  weight={600} style={{ display: 'block', marginTop: 2, lineHeight: 1.3 }}>{String(l)}</Txt>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Favoritos ── */}
          {(isMe ? favoritos : []).length > 0 && (
            <PosterRow
              title="Favoritos"
              items={favoritos}
              onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
            />
          )}

          {/* ── Minhas listas (own user) ── */}
          {isMe && (
            <div style={{ margin: '16px 16px 0' }}>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px' }}>
                  <Txt size={16} weight={800}>Minhas listas</Txt>
                  <button onClick={() => router.push('/lists')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Txt size={12} color={T.pink} weight={600}>Ver tudo</Txt>
                  </button>
                </div>
                <ListSection label="Quero ver"   icon="bookmark" items={wantList}    onItem={(x) => router.push(`/title/${x.type}/${x.id}`)} />
                <ListSection label="Assistindo"  icon="play"     items={watchingList} onItem={(x) => router.push(`/title/${x.type}/${x.id}`)} />
                <ListSection label="Concluídos"  icon="check"    items={watchedList}  onItem={(x) => router.push(`/title/${x.type}/${x.id}`)} last />
              </div>
            </div>
          )}

          <div style={{ height: 60 }} />
        </ScrollArea>
      </Screen>
    </Frame>
  );

  function timeAgo(dateStr: string): string {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const m    = Math.floor(diff / 60000);
      if (m < 1)  return 'agora';
      if (m < 60) return `${m}min atrás`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h atrás`;
      const d = Math.floor(h / 24);
      if (d < 30) return `${d}d atrás`;
      return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch { return dateStr; }
  }

  function labelFromKey(key: string): string {
    if (key.startsWith('ep_')) {
      const m = key.match(/^ep_\d+_s(\d+)_e(\d+)$/);
      if (m) return `T${m[1]} · Ep. ${m[2]}`;
    }
    if (key.startsWith('movie_')) return 'Filme';
    return key;
  }
}

/* ── Horizontal poster row ── */
function PosterRow({ title, items, onItem, onSeeAll }: {
  title: string;
  items: Array<{ id: number; title: string; type: string; poster_path?: string | null }>;
  onItem: (x: { id: number; title: string; type: string; poster_path?: string | null }) => void;
  onSeeAll?: () => void;
}) {
  return (
    <div style={{ margin: '16px 16px 0' }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
          <Txt size={16} weight={800}>{title}</Txt>
          {onSeeAll && (
            <button onClick={onSeeAll} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <Txt size={12} color={T.pink} weight={600}>Ver tudo</Txt>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 } as React.CSSProperties}>
          {items.slice(0, 10).map(x => (
            <div key={x.id} onClick={() => onItem(x)} style={{ flexShrink: 0, cursor: 'pointer' }}>
              <ImgWithSkeleton
                src={x.poster_path ? `https://image.tmdb.org/t/p/w185${x.poster_path}` : null}
                alt={x.title} width={84} height={126} radius={10}
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── List section row ── */
function ListSection({ label, icon, items, onItem, last }: {
  label: string;
  icon: import('@/lib/tokens').IconName;
  items: Array<{ id: number; title: string; type: string; poster_path?: string | null }>;
  onItem: (x: { id: number; title: string; type: string; poster_path?: string | null }) => void;
  last?: boolean;
}) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}` }}>
      <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={14} color={T.t3} />
        <Txt size={13} weight={700} color={T.t2}>{label}</Txt>
        <Txt size={12} color={T.t4} style={{ marginLeft: 'auto' }}>{items.length}</Txt>
      </div>
      {items.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingLeft: 16, paddingRight: 16, paddingBottom: last ? 16 : 12 } as React.CSSProperties}>
          {items.slice(0, 10).map(x => (
            <div key={x.id} onClick={() => onItem(x)} style={{ flexShrink: 0, cursor: 'pointer' }}>
              <ImgWithSkeleton
                src={x.poster_path ? `https://image.tmdb.org/t/p/w185${x.poster_path}` : null}
                alt={x.title} width={60} height={90} radius={8}
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: `4px 16px ${last ? 16 : 10}px` }}>
          <Txt size={12} color={T.t4}>Nenhum item ainda</Txt>
        </div>
      )}
    </div>
  );
}

export default function UserProfilePage() {
  return (
    <Suspense>
      <UserProfileInner />
    </Suspense>
  );
}

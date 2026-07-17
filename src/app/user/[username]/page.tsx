'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { ImgWithSkeleton } from '@/components/posters';
import { listStore, revStore, profileStore, type Profile } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore, dbFollowStore, getUserByUsername } from '@/lib/db';

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
  const currentUserName = user?.displayName || user?.email?.split('@')[0] || '';
  const isMe            = !!user && (username === currentUserName || username === user.email?.split('@')[0]);

  const [profile,      setProfile]      = useState<Profile | null>(null);
  const [stats,        setStats]        = useState({ watched: 0, watching: 0, want: 0, reviews: 0 });
  const [totalHours,   setTotalHours]   = useState(0);
  const [socialSheet,  setSocialSheet]  = useState<'followers' | 'following' | null>(null);

  /* ── Follow state ── */
  const [isFollowing,    setIsFollowing]    = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingNames, setFollowingNames] = useState<string[]>([]);

  /* ── Target user (when !isMe) ── */
  const [targetUid,     setTargetUid]     = useState<string | null>(null);
  const [targetProfile, setTargetProfile] = useState<Profile | null>(null);

  const favoritos    = useMemo(() => isMe ? listStore.get('favorites') : [], [isMe]);
  const watchingList = useMemo(() => isMe ? listStore.get('watching')  : [], [isMe]);
  const wantList     = useMemo(() => isMe ? listStore.get('want')      : [], [isMe]);
  const watchedList  = useMemo(() => isMe ? listStore.get('watched')   : [], [isMe]);

  /* Sync own following list from localStorage (updated by subscribeUserDoc) */
  useEffect(() => {
    if (!isMe) return;
    try {
      const list: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
      setFollowingNames(list);
    } catch {}
  }, [isMe]);

  /* Load target user profile + isFollowing state from Firestore */
  useEffect(() => {
    if (isMe || loading) return;

    // Optimistic read from localStorage first
    try {
      const list: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
      setIsFollowing(list.includes(username));
    } catch {}

    if (!firebaseConfigured) return;
    const db = getDB();

    // Load the target user's full profile (gives us their UID for bidirectional writes)
    getUserByUsername(db, username).then(result => {
      if (!result) return;
      setTargetUid(result.uid);
      setTargetProfile(result.profile);
      setFollowersCount(result.profile.followers ?? 0);
    });

    // Confirm isFollowing from Firestore (authoritative after login)
    if (user) {
      dbFollowStore.get(db, user.uid).then(list => {
        setIsFollowing(list.includes(username));
        try { localStorage.setItem('sec_following', JSON.stringify(list)); } catch {}
      });
    }
  }, [username, isMe, user, loading]);

  const toggleFollow = async () => {
    const wasFollowing  = isFollowing;
    const prevCount     = followersCount;
    const nextCount     = wasFollowing ? Math.max(0, prevCount - 1) : prevCount + 1;

    // Optimistic update
    setIsFollowing(!wasFollowing);
    setFollowersCount(nextCount);
    try {
      const list: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
      const updated = wasFollowing ? list.filter(u => u !== username) : [...list, username];
      localStorage.setItem('sec_following', JSON.stringify(updated));
    } catch {}

    if (!firebaseConfigured || !user) return;

    try {
      const db = getDB();
      if (wasFollowing) {
        const uid = targetUid ?? (await getUserByUsername(db, username))?.uid ?? null;
        if (uid) await dbFollowStore.unfollow(db, user.uid, username, uid);
        else await dbFollowStore.set(db, user.uid, (await dbFollowStore.get(db, user.uid)).filter(u => u !== username));
      } else {
        const uid = targetUid ?? (await getUserByUsername(db, username))?.uid ?? null;
        if (uid) {
          setTargetUid(uid);
          await dbFollowStore.follow(db, user.uid, username, uid);
        } else {
          // target not found in Firestore — update own list only
          const current = await dbFollowStore.get(db, user.uid);
          await dbFollowStore.set(db, user.uid, [...current, username]);
        }
      }
    } catch (err) {
      console.error('[Follow] Error:', err);
      // Rollback
      setIsFollowing(wasFollowing);
      setFollowersCount(prevCount);
      try {
        const list: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
        const restored = wasFollowing ? [...list, username] : list.filter(u => u !== username);
        localStorage.setItem('sec_following', JSON.stringify(restored));
      } catch {}
    }
  };

  useEffect(() => {
    if (!isMe || loading) return;

    setStats({
      watched:  listStore.get('watched').length,
      watching: listStore.get('watching').length,
      want:     listStore.get('want').length,
      reviews:  revStore.countAll(),
    });
    setTotalHours(Math.round(listStore.get('watched').length * 1.5));

    const applyProfile = (base: Profile, cloudOverride?: Partial<Profile>) => {
      const merged = cloudOverride ? { ...base, ...cloudOverride } : base;
      if (user) {
        const resolvedName = merged.name || user.displayName || 'Usuário';
        setProfile({
          ...merged,
          name:         resolvedName,
          username:     merged.username || user.email?.split('@')[0] || 'usuario',
          avatarImage:  merged.avatarImage || user.photoURL || '',
          avatarLetter: resolvedName[0]?.toUpperCase() || 'U',
        });
      } else {
        setProfile(merged);
      }
    };

    const local = profileStore.get(user?.uid);
    applyProfile(local);

    if (user && firebaseConfigured) {
      dbProfileStore.get(getDB(), user.uid).then(cloud => {
        if (cloud && (cloud.name || cloud.username || cloud.bio)) {
          profileStore.set({ ...local, ...cloud }, user.uid);
          applyProfile(local, cloud);
        }
      }).catch(() => {});
    }
  }, [isMe, user, loading]);

  if (loading && isMe) {
    return (
      <Frame><Screen>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 32 }}>
          <div style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--c-glass-bg)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 140, height: 16, borderRadius: 8, background: 'var(--c-glass-bg)' }} />
        </div>
      </Screen></Frame>
    );
  }

  const activeProfile   = isMe ? profile : targetProfile;
  const displayName     = activeProfile?.name || username;
  const displayUsername = activeProfile?.username || username;
  const displayAvatar   = activeProfile?.avatarImage || '';
  const displayGradient = activeProfile?.avatarGradient || `linear-gradient(135deg,${T.pink},#8B2FFF)`;
  const bio             = activeProfile?.bio || '';
  const followingCount  = isMe ? followingNames.length : (targetProfile?.following ?? 0);
  const followersVal    = isMe ? (profile?.followers ?? 0) : followersCount;
  const topPct          = isMe && stats.watched > 0 ? Math.max(1, Math.round(100 / (stats.watched + 1))) : null;

  const collageSources     = [...favoritos, ...wantList];
  const collagePosterItems = collageSources.filter(x => !!x.poster_path).slice(0, 6);

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            left={
              <button onClick={() => router.back()}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                <Icon name="chevronL" size={16} color="#fff" />
              </button>
            }
            right={
              isMe ? (
                <button onClick={() => router.push('/settings')}
                  style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                  <Icon name="settings" size={16} color="#fff" />
                </button>
              ) : (
                <button style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
                  <Icon name="flag" size={15} color="#fff" />
                </button>
              )
            }
          />

          {/* ── Capa com collage ── */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative', height: 180, overflow: 'hidden', background: 'linear-gradient(160deg,#1a0d2e 0%,#0d0d1a 60%,#0a0a14 100%)' }}>
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt="" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                  </div>
                );
              })}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.50) 65%, rgba(13,13,15,1) 100%)', zIndex: 2 }} />

            </div>

            {/* ── Avatar + Nome + Seguir ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 16px 8px', marginTop: -48, position: 'relative', zIndex: 20 }}>
              <div style={{
                width: 88, height: 88, borderRadius: 44, flexShrink: 0,
                background: displayAvatar ? `url(${displayAvatar}) center/cover no-repeat` : displayGradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '3px solid var(--c-bg)',
                boxShadow: '0 0 0 2px #C069FF, 0 8px 28px rgba(0,0,0,0.7)',
                overflow: 'hidden',
              }}>
                {!displayAvatar && <Txt size={32} weight={900} color={T.white}>{displayName[0]?.toUpperCase() || '?'}</Txt>}
              </div>
              <div style={{ paddingBottom: 6, flex: 1, minWidth: 0 }}>
                <Txt size={24} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block' }}>
                  @{displayUsername}
                </Txt>
              </div>
              {!isMe && (
                <button onClick={toggleFollow} style={{
                  flexShrink: 0, marginBottom: 6,
                  padding: '8px 20px', borderRadius: 24,
                  background: isFollowing ? T.surface2 : T.pink,
                  border: isFollowing ? `1px solid ${T.border}` : 'none',
                  cursor: 'pointer',
                  boxShadow: isFollowing ? 'none' : `0 4px 14px ${T.pinkGlow}`,
                }}>
                  <Txt size={13} weight={700} color={isFollowing ? T.t2 : '#fff'}>
                    {isFollowing ? 'Seguindo ✓' : 'Seguir'}
                  </Txt>
                </button>
              )}
            </div>
          </div>

          {/* ── Bio ── */}
          {bio && (
            <div style={{ padding: '10px 16px 0' }}>
              <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.6 }}>{bio}</Txt>
            </div>
          )}

          {/* ── Seguindo / Seguidores ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 16px 0' }}>
            <button
              onClick={() => setSocialSheet('following')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6, padding: 0 }}>
              <Txt size={17} weight={900} color={T.t1}>{followingCount}</Txt>
              <Txt size={12} weight={600} color={T.t3} style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}>Seguindo</Txt>
            </button>
            <div style={{ width: 1, height: 16, background: T.border, margin: '0 6px' }} />
            <button
              onClick={() => setSocialSheet('followers')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6, padding: 0 }}>
              <Txt size={17} weight={900} color={T.t1}>{followersVal}</Txt>
              <Txt size={12} weight={600} color={T.t3} style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}>Seguidores</Txt>
            </button>
          </div>

          {/* ── Boxes de estatísticas ── */}
          <div style={{ display: 'flex', gap: 12, padding: '24px 16px 0' }}>
            {[
              { value: isMe ? String(totalHours) : '—', label: 'h assistidas', icon: 'clock' as const },
              { value: isMe ? String(stats.reviews) : '—', label: 'avaliações', icon: 'star' as const },
              ...(topPct !== null ? [{ value: `Top ${topPct}%`, label: 'ranking', icon: 'award' as const }] : [
                { value: '—', label: 'ranking', icon: 'award' as const },
              ]),
            ].map(({ value, label, icon }) => (
              <div key={label} style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '14px 8px',
                borderRadius: T.radius,
                background: 'var(--c-card)',
                border: '1px solid var(--c-border)',
                gap: 4,
              }}>
                <Icon name={icon} size={16} color={T.pink} />
                <Txt size={18} weight={900} color={T.t1}>{value}</Txt>
                <Txt size={10} weight={600} color={T.t3} style={{ textAlign: 'center' }}>{label}</Txt>
              </div>
            ))}
          </div>

          {/* ── Favoritos ── */}
          <PosterRow
            title="Favoritos"
            items={favoritos}
            onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
          />

          {/* ── Assistindo ── */}
          <div style={{ margin: '16px 16px 0' }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px' }}>
                <Txt size={16} weight={800}>Maratonando agora</Txt>
              </div>
              <ListSection
                label="Assistindo"
                icon="play"
                items={watchingList}
                onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
              />
              <ListSection
                label="Quero ver"
                icon="bookmark"
                items={wantList}
                onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
              />
              <ListSection
                label="Concluídos"
                icon="check"
                items={watchedList}
                onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
                last
              />
            </div>
          </div>

          <div style={{ height: 90 }} />
        </ScrollArea>

        {/* ── Bottom sheet: seguidores / seguindo ── */}
        {socialSheet && (
          <>
            <div onClick={() => setSocialSheet(null)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.60)', zIndex: 40 }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 'var(--tab-h, 84px)', zIndex: 50,
              background: T.surface, borderRadius: '20px 20px 0 0',
              maxHeight: 'calc(85% - var(--tab-h, 84px))', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '12px 16px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                <div style={{ width: 36, height: 4, background: T.t4, borderRadius: 2, margin: '0 auto 12px' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt size={15} weight={700}>{socialSheet === 'followers' ? 'Seguidores' : 'Seguindo'}</Txt>
                  <button onClick={() => setSocialSheet(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Icon name="close" size={18} color={T.t3} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', padding: '10px 16px', gap: 8, flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
                {(['followers', 'following'] as const).map(tab => (
                  <button key={tab} onClick={() => setSocialSheet(tab)} style={{
                    padding: '6px 16px', borderRadius: 20,
                    background: socialSheet === tab ? T.pink : T.surface2,
                    border: socialSheet === tab ? 'none' : `1px solid ${T.border}`,
                    color: socialSheet === tab ? '#fff' : T.t2,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Area','Inter',sans-serif",
                  }}>
                    {tab === 'followers' ? `Seguidores · ${followersVal}` : `Seguindo · ${isMe ? followingNames.length : followingCount}`}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                {socialSheet === 'following' && isMe && followingNames.length > 0 ? (
                  followingNames.map((name, i) => (
                    <div
                      key={name}
                      onClick={() => { setSocialSheet(null); router.push(`/user/${encodeURIComponent(name)}`); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < followingNames.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 22, background: `linear-gradient(135deg,${T.pink},#8B2FFF)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Txt size={16} weight={800} color="#fff">{name[0]?.toUpperCase() || '?'}</Txt>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={14} weight={700} color={T.t1} style={{ display: 'block' }}>{name}</Txt>
                        <Txt size={12} color={T.t3}>@{name}</Txt>
                      </div>
                      <Icon name="chevronR" size={14} color={T.t4} />
                    </div>
                  ))
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 28, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <Icon name="user" size={24} color={T.t4} />
                    </div>
                    <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', marginBottom: 6 }}>
                      {socialSheet === 'followers' ? 'Nenhum seguidor ainda' : 'Ninguém sendo seguido'}
                    </Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5 }}>
                      {socialSheet === 'followers'
                        ? 'Quando alguém seguir este perfil, aparecerá aqui.'
                        : 'Explore perfis e comece a seguir pessoas.'}
                    </Txt>
                  </div>
                )}
              </div>
              <div style={{ height: 28 }} />
            </div>
          </>
        )}
      </Screen>
    </Frame>
  );
}

/* ── Horizontal poster row ── */
function PosterRow({ title, items, onItem, onSeeAll }: {
  title: string;
  items: Array<{ id: number; title: string; type: string; poster_path?: string | null }>;
  onItem: (x: { id: number; title: string; type: string; poster_path?: string | null }) => void;
  onSeeAll?: () => void;
}) {
  const placeholders = [{} as any, {} as any, {} as any, {} as any];
  const list = items.length > 0 ? items.slice(0, 10) : placeholders;

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
          {list.map((x, i) => (
            <div key={x.id ?? i} onClick={() => x.id && onItem(x)} style={{ flexShrink: 0, cursor: x.id ? 'pointer' : 'default' }}>
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
                alt={x.title} width={84} height={126} radius={10}
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

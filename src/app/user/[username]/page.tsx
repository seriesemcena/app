'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { ImgWithSkeleton } from '@/components/posters';
import { DEFAULT_PRO_THEME, listStore, proSettingsStore, revStore, profileStore, blockStore, type ProReminder, type Profile } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore, dbFollowStore, dbBlockStore, dbUserStatsStore, getUserByUsername, dbListStore, dbNotifStore, getFollowers, getFollowRelationsPage, type FollowerInfo, type FollowPageCursor } from '@/lib/db';
import { navigateBack, withProfileOrigin } from '@/lib/navigation';
import { usernameFromNameOrEmail } from '@/lib/username';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { tmdbImg } from '@/lib/tmdb';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';
import { AppBannerSlot } from '@/components/AppBannerSlot';

type ListItem = { id: number; title: string; type: string; poster_path?: string | null };
type Lists = { watching: ListItem[]; want: ListItem[]; watched: ListItem[]; favorites: ListItem[] };
const EMPTY_LISTS: Lists = { watching: [], want: [], watched: [], favorites: [] };

const COLLAGE_SLOTS: Array<{ left?: number; right?: number; top: number; rotate: number; width: number }> = [
  { left:  -18, top:  8,  rotate: -20, width: 115 },
  { left:   72, top: -18, rotate:  -8, width: 108 },
  { left:  158, top:  12, rotate:   6, width: 118 },
  { left:  255, top: -12, rotate:  16, width: 110 },
  { right: -20, top:  20, rotate:  24, width: 108 },
  { left:   30, top:  90, rotate: -12, width: 100 },
];

const STREAMING_LOGOS: Record<string, string> = {
  netflix: 'netflix',
  prime: 'primevideo',
  disney: 'dineyplus',
  hbo: 'hbomax',
  apple: 'appletv',
  globo: 'globoplay',
  paramount: 'paramountplus',
  mgm: 'mgm',
  star: 'mgm',
};

const STREAMING_LOGOS_BY_NAME: Record<string, string> = {
  Netflix: 'netflix',
  'Prime Video': 'primevideo',
  'Disney+': 'dineyplus',
  'HBO Max': 'hbomax',
  'Apple TV+': 'appletv',
  Globoplay: 'globoplay',
  'Paramount+': 'paramountplus',
  'MGM+': 'mgm',
  'Star+': 'mgm',
};

type WatchCalendarCell = { key: string; count: number; future: boolean };

const localDateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

function buildWatchCalendar(dateValues: string[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(monday.getDate() - 21);

  const counts = new Map<string, number>();
  dateValues.forEach((value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    const key = localDateKey(parsed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const weekdays = Array(7).fill(0) as number[];
  const cells: WatchCalendarCell[] = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const count = counts.get(localDateKey(date)) ?? 0;
    if (date <= today) weekdays[index % 7] += count;
    return { key: localDateKey(date), count, future: date > today };
  });
  return { cells, weekdays };
}

function UserProfileInner() {
  const router            = useRouter();
  const { t, i18n }       = useTranslation('profile');
  const { theme }         = useTheme();
  const isDark            = theme === 'dark';
  const params            = useParams();
  const { user, loading } = useAuth();

  const slug = decodeURIComponent((params.username as string) || '');

  /* ── Is this my own profile? ──
     Matches my uid or my *effective* username — the stored one, or the
     name-slug fallback when Firestore hasn't synced yet. This must stay
     identical to useMyProfileUrl(), otherwise the Perfil tab links to a
     URL this page doesn't recognise as mine.
     An old alias is deliberately NOT matched here: another account may
     currently own that username, and the real owner must win. Those
     cases fall through to the lookup below, which compares uids. */
  const localProfile = user ? profileStore.get(user.uid) : null;
  const myUsername = user
    ? (localProfile?.username || usernameFromNameOrEmail(localProfile?.name || user.displayName, user.email))
    : '';
  const directIsMe = !!user && (
    slug === user.uid ||
    (!!myUsername && slug === myUsername)
  );
  const [resolvedSelf, setResolvedSelf] = useState(false);
  const isMe = directIsMe || resolvedSelf;

  /* ── Profile + lists ── */
  const [myProfile,     setMyProfile]     = useState<Profile | null>(null);
  const [targetProfile, setTargetProfile] = useState<Profile | null>(null);
  const [reportTarget, setReportTarget]   = useState<ReportTarget | null>(null);
  const [blockedUids, setBlockedUids]     = useState<string[]>([]);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [targetUid,     setTargetUid]     = useState<string | null>(null);
  const [targetLists,   setTargetLists]   = useState<Lists>(EMPTY_LISTS);
  const [notFound,      setNotFound]      = useState(false);
  const [reviewCount,   setReviewCount]   = useState(0);
  const [watchCalendar, setWatchCalendar] = useState<WatchCalendarCell[]>(() => buildWatchCalendar([]).cells);
  const [watchWeekdays, setWatchWeekdays] = useState<number[]>(Array(7).fill(0));
  const [proReminders, setProReminders] = useState<ProReminder[]>([]);

  /* ── Social ── */
  const [socialSheet,    setSocialSheet]    = useState<'followers' | 'following' | null>(null);
  const [followingNames, setFollowingNames] = useState<string[]>([]);
  const [myFollowing,    setMyFollowing]    = useState<string[]>([]);
  const [followers,      setFollowers]      = useState<FollowerInfo[]>([]);
  const [targetFollowing, setTargetFollowing] = useState(0);
  const [followingPeople, setFollowingPeople] = useState<FollowerInfo[]>([]);
  const [socialCursor, setSocialCursor] = useState<FollowPageCursor | null>(null);
  const [socialHasMore, setSocialHasMore] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  /* ── My own data (localStorage) ── */
  const myLists: Lists = useMemo(() => (isMe ? {
    watching:  listStore.get('watching'),
    want:      listStore.get('want'),
    watched:   listStore.get('watched'),
    favorites: listStore.get('favorites'),
  } : EMPTY_LISTS), [isMe]);

  /* Every name this profile may be recorded under in someone's following_list:
     canonical username, old aliases, display name, and the URL slug. Legacy
     follows stored the display name, so a single-key check misses them. */
  const targetIdentities = useMemo(() => Array.from(new Set([
    targetProfile?.username, ...(targetProfile?.aliases ?? []), targetProfile?.name, slug,
  ].filter(Boolean) as string[])), [targetProfile, slug]);

  const isFollowing = useMemo(
    () => myFollowing.some(f => targetIdentities.includes(f)),
    [myFollowing, targetIdentities],
  );

  const lists      = isMe ? myLists : targetLists;
  const favoritos  = lists.favorites;
  const minhaLista = lists.want;
  const assistindo = lists.watching;
  const concluidos = lists.watched;

  const activeProfile = isMe ? myProfile : targetProfile;

  /* ── Load my profile ── */
  useEffect(() => {
    if (!isMe || loading || !user) return;
    setReviewCount(revStore.countAll());
    const applyProfile = (base: Profile, cloudOverride?: Partial<Profile>) => {
      const merged = cloudOverride ? { ...base, ...cloudOverride } : base;
      const resolvedName = merged.name || user.displayName || 'Usuário';
      setMyProfile({
        ...merged,
        name:         resolvedName,
        username:     merged.username || usernameFromNameOrEmail(resolvedName, user.email),
        avatarImage:  merged.avatarImage || user.photoURL || '',
        avatarLetter: resolvedName[0]?.toUpperCase() || 'U',
      });
    };
    const local = profileStore.get(user.uid);
    setProReminders(proSettingsStore.get(user.uid).reminders);
    applyProfile(local);
    try {
      const list: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
      setFollowingNames(list);
    } catch {}
    if (firebaseConfigured) {
      dbProfileStore.get(getDB(), user.uid).then(cloud => {
        if (cloud && (cloud.name || cloud.username || cloud.bio)) {
          profileStore.set({ ...local, ...cloud }, user.uid);
          applyProfile(local, cloud);
        }
        // Derive my own follower list the same way (no stored counter)
        const p = { ...local, ...(cloud ?? {}) } as Profile;
        return getFollowers(getDB(), [p.username, ...(p.aliases ?? []), p.name, slug], user.uid);
      }).then(f => { if (f) setFollowers(f); }).catch(() => {});
    }
  }, [isMe, user, loading, slug]);

  useEffect(() => {
    if (!isMe || !user) return;
    const refresh = () => setProReminders(proSettingsStore.get(user.uid).reminders);
    window.addEventListener('maratonou:pro', refresh);
    return () => window.removeEventListener('maratonou:pro', refresh);
  }, [isMe, user]);

  /* Navigating to a different profile clears the "resolved to me" flag */
  useEffect(() => {
    setResolvedSelf(false);
    setNotFound(false);
    setTargetProfile(null);
    setTargetLists(EMPTY_LISTS);
  }, [slug]);

  /* ── Load someone else's profile (public) ── */
  useEffect(() => {
    if (isMe || loading) return;
    try {
      setMyFollowing(JSON.parse(localStorage.getItem('sec_following') || '[]'));
    } catch {}
    if (!firebaseConfigured) return;
    const db = getDB();
    let alive = true;

    getUserByUsername(db, slug).then(async result => {
      if (!alive) return;
      if (!result) { setNotFound(true); return; }
      setNotFound(false);
      // The slug resolved back to me (e.g. one of my old usernames, and
      // nobody else claimed it) — render the owner view instead.
      if (user && result.uid === user.uid) { setResolvedSelf(true); return; }
      setTargetUid(result.uid);
      setTargetProfile(result.profile);
      setTargetFollowing(result.followingCount);
      // Followers are derived: match the canonical username, any alias, and
      // the display name (legacy follows stored the name, e.g. "Danilo").
      getFollowers(db, [result.profile.username, ...(result.profile.aliases ?? []), result.profile.name, slug], result.uid)
        .then(f => { if (alive) setFollowers(f); }).catch(() => {});
      try {
        const [watching, want, watched, favorites] = await Promise.all([
          dbListStore.get(db, result.uid, 'watching'),
          dbListStore.get(db, result.uid, 'want'),
          dbListStore.get(db, result.uid, 'watched'),
          dbListStore.get(db, result.uid, 'favorites'),
        ]);
        if (alive) setTargetLists({ watching, want, watched, favorites });
      } catch {}
    });

    if (user) {
      dbFollowStore.get(db, user.uid).then(list => {
        if (!alive) return;
        // A follow may be recorded under the canonical username or, for older
        // entries, the display name / whatever slug the URL carried.
        setMyFollowing(list);
        try { localStorage.setItem('sec_following', JSON.stringify(list)); } catch {}
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [slug, isMe, user, loading]);

  useEffect(() => {
    if (!socialSheet || !firebaseConfigured) return;
    const profileUid = isMe ? user?.uid : targetUid;
    if (!profileUid) return;
    let alive = true;
    setSocialLoading(true);
    setSocialCursor(null);
    getFollowRelationsPage(getDB(), profileUid, socialSheet).then((page) => {
      if (!alive) return;
      if (socialSheet === 'followers' && page.items.length) setFollowers(page.items);
      if (socialSheet === 'following') setFollowingPeople(page.items);
      setSocialCursor(page.cursor);
      setSocialHasMore(page.hasMore);
    }).finally(() => { if (alive) setSocialLoading(false); });
    return () => { alive = false; };
  }, [socialSheet, isMe, user?.uid, targetUid]);

  const loadMoreSocial = async () => {
    if (!socialSheet || socialLoading || !socialHasMore || !socialCursor) return;
    const profileUid = isMe ? user?.uid : targetUid;
    if (!profileUid) return;
    setSocialLoading(true);
    try {
      const page = await getFollowRelationsPage(getDB(), profileUid, socialSheet, socialCursor);
      if (socialSheet === 'followers') setFollowers((current) => [...current, ...page.items]);
      else setFollowingPeople((current) => [...current, ...page.items]);
      setSocialCursor(page.cursor);
      setSocialHasMore(page.hasMore);
    } finally { setSocialLoading(false); }
  };

  /* ── Real stats from the watched list (works for any profile) ── */
  const [realStats, setRealStats] = useState<{
    totalHours: number; moviesCount: number; tvCount: number;
  } | null>(null);

  useEffect(() => {
    const watched = concluidos;
    if (watched.length === 0) {
      setRealStats({ totalHours: 0, moviesCount: 0, tvCount: 0 });
      return;
    }
    let alive = true;
    const toFetch = watched.slice(0, 20);
    Promise.all(
      toFetch.map(async (item) => {
        try {
          const ep = item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
          return await fetch(`/api/tmdb?endpoint=${ep}`).then(r => r.json());
        } catch { return null; }
      })
    ).then((results) => {
      if (!alive) return;
      let totalMinutes = 0, moviesCount = 0, tvCount = 0;
      results.forEach((d, i) => {
        if (!d) return;
        const item = toFetch[i];
        if (item.type === 'movie') { moviesCount++; totalMinutes += d.runtime || 110; }
        else { tvCount++; totalMinutes += (d.episode_run_time?.[0] || 45) * Math.min(d.number_of_episodes || 10, 24); }
      });
      setRealStats({ totalHours: Math.round(totalMinutes / 60), moviesCount, tvCount });
    });
    return () => { alive = false; };
  }, [concluidos]);

  /* ── Activity calendar: last four weeks, Monday → Sunday ── */
  useEffect(() => {
    if (!isMe || loading || !user) return;
    let alive = true;
    const profileName = myProfile?.name || user.displayName || '';
    const reviewDates = profileName ? revStore.getByUser(profileName).map((review) => review.date) : [];
    const applyDates = (dates: string[]) => {
      if (!alive) return;
      const { cells, weekdays } = buildWatchCalendar(dates);
      setWatchCalendar(cells);
      setWatchWeekdays(weekdays);
    };

    if (!firebaseConfigured) {
      applyDates(reviewDates);
      return () => { alive = false; };
    }

    dbUserStatsStore.get(getDB(), user.uid)
      .then((aggregate) => {
        const watchedDates = Object.entries(aggregate.recentDays)
          .flatMap(([date, value]) => Array.from({ length: value.watched || 0 }, () => date));
        applyDates(watchedDates.length > 0 ? watchedDates : reviewDates);
      })
      .catch(() => applyDates(reviewDates));
    return () => { alive = false; };
  }, [isMe, loading, user, myProfile?.name]);

  /* ── Follow / unfollow ── */
  /* Blocking is unilateral and private: hide the blocked user's content in
     the feed/comments, and stop following them. Blocked state keys on the
     target uid, which feed/comment items reliably carry. */
  useEffect(() => {
    const load = () => setBlockedUids(blockStore.get());
    load();
    window.addEventListener('maratonou:sync', load);
    return () => window.removeEventListener('maratonou:sync', load);
  }, [user?.uid, slug]);

  const isBlocked = !!targetUid && blockedUids.includes(targetUid);

  const toggleBlock = async () => {
    setMenuOpen(false);
    if (!user) { router.push('/auth'); return; }
    let uid = targetUid;
    if (!uid && firebaseConfigured) {
      try { uid = (await getUserByUsername(getDB(), slug))?.uid ?? null; } catch {}
    }
    if (!uid) return;
    setTargetUid(uid);
    const wasBlocked = blockStore.isBlocked(uid);
    if (wasBlocked) {
      blockStore.remove(uid);
      setBlockedUids(blockStore.get());
      if (firebaseConfigured) { try { await dbBlockStore.unblock(getDB(), user.uid, uid); } catch {} }
    } else {
      // Blocking implies unfollowing.
      if (isFollowing) { try { await toggleFollow(); } catch {} }
      blockStore.add(uid);
      setBlockedUids(blockStore.get());
      if (firebaseConfigured) { try { await dbBlockStore.block(getDB(), user.uid, uid); } catch {} }
    }
  };

  const toggleFollow = async () => {
    if (!user) { router.push('/auth'); return; }
    const wasFollowing = isFollowing;
    // Always record the target's CANONICAL username. Storing the URL slug
    // (often a display name like "Danilo") made the entry unmatchable, so
    // the follower count could never find it.
    const canonical = targetProfile?.username || slug;
    // Optimistic: add the canonical name, or drop every identity this
    // profile could be recorded under (canonical, aliases, display name).
    const optimistic = wasFollowing
      ? myFollowing.filter(u => !targetIdentities.includes(u))
      : Array.from(new Set([...myFollowing, canonical]));
    setMyFollowing(optimistic);
    setFollowers(prev => wasFollowing
      ? prev.filter(f => f.uid !== user.uid)
      : [...prev, { uid: user.uid, username: '', name: '', avatarImage: '', avatarLetter: '', avatarGradient: '' }]);
    try { localStorage.setItem('sec_following', JSON.stringify(optimistic)); } catch {}

    if (!firebaseConfigured) return;
    try {
      const db  = getDB();
      const uid = targetUid ?? (await getUserByUsername(db, slug))?.uid ?? null;
      if (wasFollowing) {
        // Drop the canonical entry and any legacy display-name entry
        const current = await dbFollowStore.get(db, user.uid);
        const next = current.filter(u => !targetIdentities.includes(u));
        await dbFollowStore.unfollow(db, user.uid, targetIdentities, uid ?? undefined);
        setMyFollowing(next);
        try { localStorage.setItem('sec_following', JSON.stringify(next)); } catch {}
      } else if (uid) {
        setTargetUid(uid);
        await dbFollowStore.follow(db, user.uid, canonical, uid, {
          name: targetProfile?.name || canonical,
          username: targetProfile?.username || canonical,
          avatarImage: targetProfile?.avatarThumbImage || targetProfile?.avatarImage || '',
          avatarLetter: targetProfile?.avatarLetter || '',
          avatarGradient: targetProfile?.avatarGradient || '',
        });
        const myProf     = profileStore.get(user.uid);
        const myUsername = myProf.username || usernameFromNameOrEmail(myProf.name || user.displayName, user.email);
        const myName     = myProf.name || user.displayName || myUsername;
        dbNotifStore.add(db, {
          recipientId: uid,
          category: 'account',
          type: 'new_follower',
          actorId: user.uid,
          actorUsername: myUsername,
          actorName: myName,
          actorAvatarLetter: (myName[0] || 'U').toUpperCase(),
          actorAvatarImage: user.photoURL || myProf.avatarImage || '',
          createdAt: new Date().toISOString(),
          link: `/user/${encodeURIComponent(myUsername)}`,
        }).catch(() => {});
      } else {
        const current = await dbFollowStore.get(db, user.uid);
        await dbFollowStore.set(db, user.uid, Array.from(new Set([...current, canonical])));
      }
      // Re-derive from the server so the count reflects what was persisted
      if (targetProfile) {
        const fresh = await getFollowers(db, [
          targetProfile.username, ...(targetProfile.aliases ?? []), targetProfile.name, slug,
        ], uid ?? undefined);
        setFollowers(fresh);
      }
    } catch {
      setMyFollowing(myFollowing); // roll back to the pre-click list
    }
  };

  /* ── Loading / not found ── */
  if (loading || (isMe && !myProfile)) {
    return (
      <Frame><Screen>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 32 }}>
          <div style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--c-glass-bg)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 140, height: 16, borderRadius: 8, background: 'var(--c-glass-bg)' }} />
          <div style={{ width: 100, height: 12, borderRadius: 6, background: 'var(--c-input-bg)' }} />
        </div>
      </Screen></Frame>
    );
  }

  if (!isMe && notFound) {
    return (
      <Frame><Screen>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="user" size={28} color={T.t4} />
          </div>
          <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>{t('userNotFound')}</Txt>
          <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>@{slug}</Txt>
          <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>{t('userNotFoundDetail')}</Txt>
          <button onClick={() => navigateBack(router)} style={{ marginTop: 8, padding: '10px 24px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer' }}>
            <Txt size={13} weight={700} color="#fff">{t('goBack')}</Txt>
          </button>
        </div>
      </Screen></Frame>
    );
  }

  const displayName     = activeProfile?.name || slug;
  const displayUsername = activeProfile?.username || slug;
  const displayAvatar   = activeProfile?.avatarImage || '';
  const displayGradient = activeProfile?.avatarGradient || `linear-gradient(135deg,${T.pink},#8B2FFF)`;
  const bio             = activeProfile?.bio || '';
  const isProProfile    = activeProfile?.proMember === true;
  const proTheme        = activeProfile?.proTheme ?? DEFAULT_PRO_THEME;
  const proAccent       = isProProfile ? proTheme.accent : T.pink;
  const proThemeCover   = isProProfile ? tmdbImg(proTheme.posterPath, 'w780') : null;
  const profileCover    = isProProfile ? (activeProfile?.coverImage || proThemeCover || '') : '';
  // Aggregated counters are the source of truth after migration. Loaded lists
  // remain a safe fallback for accounts that have not been backfilled yet.
  const followingCount  = Math.max(
    activeProfile?.counters?.followingCount ?? 0,
    isMe ? followingNames.length : targetFollowing,
  );
  const followersVal    = Math.max(activeProfile?.counters?.followersCount ?? 0, followers.length);
  const topPct          = concluidos.length > 0 ? Math.max(1, Math.round(100 / (concluidos.length + 1))) : null;
  const legacyFollowingPeople: FollowerInfo[] = followingNames.map((name) => ({
    uid: `legacy:${name}`, username: name, name,
    avatarImage: '', avatarLetter: name[0]?.toUpperCase() || '?', avatarGradient: '',
  }));
  const socialPeople = socialSheet === 'followers'
    ? followers
    : (followingPeople.length ? followingPeople : (isMe ? legacyFollowingPeople : []));

  const collageSources     = [...favoritos, ...minhaLista];
  const collagePosterItems = collageSources.filter(x => !!x.poster_path).slice(0, 6);
  const nextProReminder = isMe && isProProfile
    ? proReminders
        .filter((reminder) => new Date(`${reminder.remindAt}T12:00:00`).getTime() >= Date.now() - 86_400_000)
        .sort((a, b) => a.remindAt.localeCompare(b.remindAt))[0]
    : undefined;

  return (
    <Frame>
      <Screen>
        <ScrollArea>

          {/* ── Capa: personalizada/tema para PRO; collage no perfil comum ── */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative', height: 180, overflow: 'hidden', background: isProProfile ? proTheme.gradient : 'linear-gradient(160deg,#1a0d2e 0%,#0d0d1a 60%,#0a0a14 100%)' }}>
              {profileCover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileCover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
              {!isProProfile && collagePosterItems.map((item, idx) => {
                const slot = COLLAGE_SLOTS[idx];
                if (!slot || !item.poster_path) return null;
                const url = tmdbImg(item.poster_path, 'w185');
                if (!url) return null;
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
                    <img src={url} alt="" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                  </div>
                );
              })}
              <div style={{ position: 'absolute', inset: 0, background: isProProfile ? `radial-gradient(circle at 86% 12%,${proAccent}38,transparent 45%),linear-gradient(to bottom,rgba(0,0,0,0.08) 0%,rgba(0,0,0,0.44) 62%,rgba(13,13,15,1) 100%)` : 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.50) 65%, rgba(13,13,15,1) 100%)', zIndex: 2 }} />

              {/* Ações no topo */}
              <div style={{ position: 'absolute', top: 'calc(var(--safe-area-top) + 14px)', left: 14, right: 14, display: 'flex', alignItems: 'center', zIndex: 10 }}>
                {!isMe && (
                  <button onClick={() => navigateBack(router)}
                    style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Icon name="chevronL" size={16} color="#fff" />
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                  {!isMe && (
                    <button
                      title="Mais opções"
                      aria-label="Mais opções"
                      onClick={() => setMenuOpen(o => !o)}
                      style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Icon name="menuDots" size={18} color="#fff" />
                    </button>
                  )}
                  {!isMe && menuOpen && (
                    <>
                      <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                      <div style={{
                        position: 'absolute', top: 42, right: 0, zIndex: 31,
                        minWidth: 190, background: T.card, borderRadius: 14,
                        border: `1px solid ${T.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                        overflow: 'hidden',
                      }}>
                        <button
                          onClick={() => { setMenuOpen(false); setReportTarget({
                            kind: 'profile',
                            targetId: targetProfile?.username || slug,
                            targetLabel: `@${targetProfile?.username || slug}`,
                            reportedUser: targetProfile?.name || targetProfile?.username || slug,
                          }); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', textAlign: 'left' }}>
                          <Icon name="flag" size={16} color={T.t2} />
                          <Txt size={14} weight={600} color={T.t1}>{t('reportProfile')}</Txt>
                        </button>
                        <button
                          onClick={toggleBlock}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <Icon name="close" size={16} color={isBlocked ? T.t2 : (T.red ?? '#FF5A5F')} />
                          <Txt size={14} weight={600} color={isBlocked ? T.t1 : (T.red ?? '#FF5A5F')}>
                            {isBlocked ? t('unblockUser') : t('blockUser')}
                          </Txt>
                        </button>
                      </div>
                    </>
                  )}
                  {isMe && (
                    <button onClick={() => router.push(withProfileOrigin('/settings'))}
                      style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Icon name="settings" size={18} color="#fff" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Avatar + Nome ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 16px 8px', marginTop: isDark ? -48 : -20, position: 'relative', zIndex: 20 }}>
              <div style={{
                width: 88, height: 88, borderRadius: 44, flexShrink: 0,
                background: displayAvatar ? `url(${displayAvatar}) center/cover no-repeat` : displayGradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '3px solid var(--c-bg)',
                boxShadow: `0 0 0 2px ${proAccent}, 0 8px 28px rgba(0,0,0,0.7)`,
                overflow: 'hidden',
              }}>
                {!displayAvatar && <Txt size={32} weight={900} color={T.white}>{displayName[0]?.toUpperCase() || 'U'}</Txt>}
              </div>

              <div style={{ paddingBottom: 6, flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Txt size={24} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {displayName}
                  </Txt>
                  {isProProfile && <span style={{ flexShrink: 0, padding: '3px 7px', borderRadius: 9, background: `${proAccent}24`, border: `1px solid ${proAccent}55`, color: proAccent, fontSize: 9, fontWeight: 900, letterSpacing: 0.5 }}>PRO</span>}
                </div>
                <Txt size={13} color={T.t3} style={{ display: 'block' }}>@{displayUsername}</Txt>
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
                    {isFollowing ? `${t('followingButton')} ✓` : t('followButton')}
                  </Txt>
                </button>
              )}
            </div>
          </div>

          {/* ── Bio ── */}
          {bio && (
            <div style={{ padding: '18px 16px 0' }}>
              <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.6 }}>{bio}</Txt>
            </div>
          )}

          {/* ── Seguindo / Seguidores ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '28px 16px 0' }}>
            <button onClick={() => setSocialSheet('following')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6, padding: 0 }}>
              <Txt size={14} weight={900} color={T.t1}>{followingCount}</Txt>
              <Txt size={11} weight={600} color={T.t3} style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}>{t('followingLabel')}</Txt>
            </button>
            <div style={{ width: 1, height: 14, background: T.border, margin: '0 6px' }} />
            <button onClick={() => setSocialSheet('followers')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6, padding: 0 }}>
              <Txt size={14} weight={900} color={T.t1}>{followersVal}</Txt>
              <Txt size={11} weight={600} color={T.t3} style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}>{t('followersLabel')}</Txt>
            </button>
          </div>

          {/* ── Boxes de stats ── */}
          <div style={{ display: 'flex', gap: 12, padding: '28px 16px 0' }}>
            {[
              { value: `${realStats?.totalHours ?? 0}h`, label: t('stats.hoursLabel'),   icon: 'clock' as const },
              ...(isMe ? [{ value: String(reviewCount), label: t('stats.ratingsLabel'), icon: 'star' as const }] : []),
              ...(topPct !== null ? [{ value: `Top ${topPct}%`, label: t('stats.rankingLabel'), icon: 'award' as const }] : []),
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
                <Icon name={icon} size={16} color={proAccent} />
                <Txt size={18} weight={900} color={T.t1}>{value}</Txt>
                <Txt size={10} weight={600} color={T.t3} style={{ textAlign: 'center' }}>{label}</Txt>
              </div>
            ))}
          </div>

          {nextProReminder && (
            <button onClick={() => router.push(withProfileOrigin('/settings/pro#reminders'))} style={{ width: 'calc(100% - 32px)', margin: '16px 16px 0', padding: '13px 14px', borderRadius: 18, border: `1px solid ${proAccent}44`, background: `linear-gradient(135deg,${proAccent}1f,rgba(255,255,255,0.025))`, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0, background: `${proAccent}20`, border: `1px solid ${proAccent}45` }}><Icon name="bell" size={19} color={proAccent} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Txt size={10} weight={800} color={proAccent} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.7 }}>{nextProReminder.listName}</Txt>
                <Txt size={13} weight={800} color={T.t1} style={{ display: 'block', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextProReminder.title}</Txt>
                <Txt size={10} color={T.t3} style={{ display: 'block', marginTop: 3 }}>{new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short' }).format(new Date(`${nextProReminder.remindAt}T12:00:00`))}</Txt>
              </div>
              <Icon name="chevronR" size={15} color={T.t3} />
            </button>
          )}

          <AppBannerSlot page="profile" />

          {/* ── Favoritos ── */}
          <PosterRow
            title={t('favorites')}
            seeAllLabel={t('seeAll')}
            items={favoritos}
            onItem={(x) => router.push(withProfileOrigin(`/title/${x.type}/${x.id}`))}
            onSeeAll={isMe ? () => router.push(withProfileOrigin('/lists')) : undefined}
          />

          {/* ── Listas ── */}
          <div style={{ margin: '16px 16px 0' }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px' }}>
                <Txt size={16} weight={800}>{isMe ? t('myLists') : t('maratonandoNow')}</Txt>
                {isMe && (
                  <button onClick={() => router.push(withProfileOrigin('/lists'))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Txt size={12} color={T.pink} weight={600}>{t('seeAll')}</Txt>
                  </button>
                )}
              </div>

              <ListSection label={t('want')}       emptyLabel={t('emptyList')} icon="bookmark" items={minhaLista}
                onItem={(x) => router.push(withProfileOrigin(`/title/${x.type}/${x.id}`))} />
              <ListSection label={t('watching')}   emptyLabel={t('emptyList')} icon="play"     items={assistindo}
                onItem={(x) => router.push(withProfileOrigin(`/title/${x.type}/${x.id}`))} />
              <ListSection label={t('concluidos')} emptyLabel={t('emptyList')} icon="check"    items={concluidos}
                onItem={(x) => router.push(withProfileOrigin(`/title/${x.type}/${x.id}`))} last />
            </div>
          </div>

          {/* ── Grid: Estatísticas + Streaming (dono do perfil) ── */}
          {isMe && (() => {
            type Sub = { streamId?: string; name: string; color: string; price: number; active: boolean };
            const activeSubs: Sub[] = (() => {
              try { return (JSON.parse(localStorage.getItem('sec_expenses_v1') || '[]') as Sub[]).filter(s => s.active !== false); }
              catch { return []; }
            })();
            const userPlatforms = activeSubs.slice(0, 5);
            const totalMonthly = userPlatforms.reduce((sum, platform) => sum + (Number(platform.price) || 0), 0);
            const maxPlatformPrice = Math.max(...userPlatforms.map((platform) => Number(platform.price) || 0), 1);
            const priceFormatter = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'BRL' });
            const totalItems = (realStats?.moviesCount ?? 0) + (realStats?.tvCount ?? 0);

            return (
              <div style={{ margin: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Bloco 1 — Estatísticas */}
                <button onClick={() => router.push(withProfileOrigin('/stats'))}
                  style={{ width: '100%', background: 'linear-gradient(145deg, #1c1c1e 0%, #111113 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, cursor: 'pointer', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10, textAlign: 'left', minHeight: 258, position: 'relative', overflow: 'hidden', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Txt size={16} weight={800} color="#fff">{t('stats.title')}</Txt>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <Txt size={11} weight={700} color={T.pink}>{t('seeMore')}</Txt>
                      <Icon name="chevronR" size={11} color={T.pink} />
                    </div>
                  </div>

                  <div data-summary-layout="stacked" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, width: '100%' }}>
                    <Txt size={11} color="rgba(255,255,255,0.38)" style={{ whiteSpace: 'nowrap' }}>
                      {realStats ? t('stats.titlesCount', { h: realStats.totalHours, n: totalItems }) : '—'}
                    </Txt>

                    {(() => {
                      const tv = realStats?.tvCount ?? 0;
                      const mv = realStats?.moviesCount ?? 0;
                      const total = tv + mv || 1;
                      const tvPct = tv / total;
                      const r = 34, cx = 46, cy = 46, circ = 2 * Math.PI * r;
                      const tvLen = circ * tvPct;
                      const mvLen = circ * (1 - tvPct);
                      const dayReference = new Date(2024, 0, 1); // segunda-feira
                      const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
                        const date = new Date(dayReference);
                        date.setDate(dayReference.getDate() + index);
                        return new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' }).format(date).toUpperCase();
                      });
                      const weekdayNames = Array.from({ length: 7 }, (_, index) => {
                        const date = new Date(dayReference);
                        date.setDate(dayReference.getDate() + index);
                        return new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(date);
                      });
                      const maxCellCount = Math.max(...watchCalendar.map((cell) => cell.count), 1);
                      const maxWeekdayCount = Math.max(...watchWeekdays, 0);
                      const mostActiveDay = maxWeekdayCount > 0 ? weekdayNames[watchWeekdays.indexOf(maxWeekdayCount)] : null;
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, width: '100%', minWidth: 0 }}>
                          <div style={{ minWidth: 0, padding: '10px 10px 11px', borderRadius: 16, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Txt size={10} weight={800} color="rgba(255,255,255,0.48)" style={{ display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('stats.contentChart')}</Txt>
                            <svg width={92} height={92} viewBox="0 0 92 92" style={{ flexShrink: 0 }}>
                              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={11} />
                              {tv > 0 && (
                                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#C069FF" strokeWidth={11}
                                  strokeDasharray={`${tvLen} ${circ}`} strokeDashoffset={circ / 4}
                                  style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` } as React.CSSProperties} />
                              )}
                              {mv > 0 && (
                                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FF6B2B" strokeWidth={11}
                                  strokeDasharray={`${mvLen} ${circ}`} strokeDashoffset={circ / 4 - tvLen}
                                  style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` } as React.CSSProperties} />
                              )}
                              <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={800} fontFamily="'Area','Inter',sans-serif">{tv + mv}</text>
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', marginTop: 7 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 7, height: 7, borderRadius: 2, background: '#C069FF', flexShrink: 0 }} />
                                <Txt size={10} color="rgba(255,255,255,0.55)">{tv} {t('stats.seriesLabel')}</Txt>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 7, height: 7, borderRadius: 2, background: '#FF6B2B', flexShrink: 0 }} />
                                <Txt size={10} color="rgba(255,255,255,0.55)">{mv} {t('stats.moviesLabel')}</Txt>
                              </div>
                            </div>
                          </div>

                          <div aria-label={t('stats.weekdayChart')} style={{ minWidth: 0, padding: '10px 10px 11px', borderRadius: 16, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                            <Txt size={10} weight={800} color="rgba(255,255,255,0.48)" style={{ display: 'block', marginBottom: 9, textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'center' }}>{t('stats.weekdayChart')}</Txt>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, width: '100%' }}>
                              {weekdayLabels.map((label, index) => (
                                <Txt key={`weekday-${index}`} size={8} weight={800} color="rgba(255,255,255,0.38)" style={{ textAlign: 'center', lineHeight: 1 }}>{label}</Txt>
                              ))}
                              {watchCalendar.map((cell) => {
                                const alpha = cell.count > 0 ? 0.28 + (cell.count / maxCellCount) * 0.62 : 0;
                                return (
                                  <div key={cell.key} title={`${cell.key}: ${cell.count}`} style={{ aspectRatio: '1', borderRadius: 4, background: cell.future ? 'transparent' : cell.count > 0 ? `rgba(192,105,255,${alpha})` : 'rgba(255,255,255,0.065)', border: cell.future ? '1px solid rgba(255,255,255,0.025)' : '1px solid rgba(255,255,255,0.045)' }} />
                                );
                              })}
                            </div>
                            <div style={{ marginTop: 9, minHeight: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                              <Txt size={9} weight={700} color={mostActiveDay ? '#D79BFF' : 'rgba(255,255,255,0.32)'} style={{ lineHeight: 1.25 }}>
                                {mostActiveDay ? t('stats.mostWatchedDay', { day: mostActiveDay }) : t('stats.noWatchActivity')}
                              </Txt>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </button>

                {/* Bloco 2 — Gastos de streaming */}
                <button onClick={() => router.push(withProfileOrigin('/expenses'))}
                  style={{ width: '100%', background: 'linear-gradient(145deg, #1c1c1e 0%, #111113 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, cursor: 'pointer', padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10, textAlign: 'left', minHeight: 126, position: 'relative', overflow: 'hidden', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Txt size={16} weight={800} color="#fff">{t('streaming')}</Txt>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <Txt size={11} weight={700} color={T.pink}>{t('seeAll')}</Txt>
                      <Icon name="chevronR" size={11} color={T.pink} />
                    </div>
                  </div>

                  <div data-summary-layout="stacked" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                      <Txt size={11} color="rgba(255,255,255,0.38)" style={{ whiteSpace: 'nowrap' }}>{t('monthlyExpenses')}</Txt>
                      {userPlatforms.length > 0 && <Txt size={13} weight={800} color="#fff">{priceFormatter.format(totalMonthly)}</Txt>}
                    </div>
                    <div data-streaming-chart="compact" style={{ padding: '10px', borderRadius: 14, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      {userPlatforms.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${userPlatforms.length}, minmax(0, 1fr))`, gap: 8, width: '100%', minWidth: 0 }}>
                          {userPlatforms.map((p) => {
                            const logo = STREAMING_LOGOS[p.streamId ?? ''] ?? STREAMING_LOGOS_BY_NAME[p.name];
                            const value = Number(p.price) || 0;
                            const width = `${Math.max(8, (value / maxPlatformPrice) * 100)}%`;
                            return (
                              <div key={p.name} aria-label={p.name} style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                  {logo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={`/${logo}_logo.png`} alt="" style={{ width: '76%', height: '72%', objectFit: 'contain', display: 'block' }} />
                                  ) : (
                                    <Txt size={11} weight={800} color="#fff">{p.name.slice(0, 1)}</Txt>
                                  )}
                                </div>
                                <div style={{ width: '100%', height: 5, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.10)' }}>
                                  <div style={{ width, height: '100%', borderRadius: 4, background: p.color || 'rgba(255,255,255,0.28)' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <Txt size={11} color="rgba(255,255,255,0.28)">{t('noExpenses')}</Txt>
                      )}
                    </div>
                  </div>
                </button>

                {/* Bloco 3 — Destaque do ranking mensal */}
                <button
                  onClick={() => router.push(withProfileOrigin('/ranking'))}
                  style={{ width: '100%', minHeight: 148, padding: '18px', borderRadius: 22, border: '1px solid rgba(245,197,24,0.28)', cursor: 'pointer', overflow: 'hidden', position: 'relative', textAlign: 'left', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 104px', alignItems: 'center', gap: 14, background: 'radial-gradient(circle at 88% 14%, rgba(245,197,24,0.22), transparent 34%), linear-gradient(135deg, rgba(75,31,112,0.98) 0%, rgba(31,18,50,0.98) 52%, rgba(17,17,20,0.99) 100%)', boxShadow: '0 12px 34px rgba(87,34,132,0.24), inset 0 1px 0 rgba(255,255,255,0.10)' } as React.CSSProperties}
                >
                  <div style={{ minWidth: 0, position: 'relative', zIndex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,197,24,0.14)', border: '1px solid rgba(245,197,24,0.34)' }}>
                        <Icon name="crown" size={17} color="#F5C518" />
                      </div>
                      <Txt size={17} weight={900} color="#fff">{t('ranking.title', { ns: 'home' })}</Txt>
                    </div>
                    <Txt size={11} color="rgba(255,255,255,0.58)" style={{ display: 'block', lineHeight: 1.45 }}>
                      {t('ranking.scoreFormula', { ns: 'home' })}
                    </Txt>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 13 }}>
                      <Txt size={12} weight={800} color="#D79BFF">{t('rankingHighlightAction')}</Txt>
                      <Icon name="chevronR" size={12} color="#D79BFF" />
                    </div>
                  </div>

                  <div aria-hidden style={{ height: 106, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, position: 'relative', zIndex: 2 }}>
                    {[
                      { rank: 2, height: 60, color: '#AEB4BF' },
                      { rank: 1, height: 88, color: '#F5C518' },
                      { rank: 3, height: 48, color: '#CD7F32' },
                    ].map((place) => (
                      <div key={place.rank} style={{ width: 27, height: place.height, borderRadius: '10px 10px 4px 4px', background: `linear-gradient(180deg, ${place.color}38, ${place.color}0D)`, border: `1px solid ${place.color}58`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 9, boxSizing: 'border-box', boxShadow: place.rank === 1 ? `0 0 20px ${place.color}30` : 'none' }}>
                        <Txt size={11} weight={900} color={place.color}>{place.rank}</Txt>
                      </div>
                    ))}
                  </div>
                </button>
              </div>
            );
          })()}

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
                  <Txt size={15} weight={700}>{socialSheet === 'followers' ? t('followersLabel') : t('followingLabel')}</Txt>
                  <button onClick={() => setSocialSheet(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Icon name="close" size={18} color={T.t3} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', padding: '10px 16px', gap: 8, flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
                {(['followers', 'following'] as const).map(tab => (
                  <button key={tab} onClick={() => setSocialSheet(tab)} style={{
                    padding: '6px 16px', borderRadius: 20,
                    background: socialSheet === tab ? T.pillActiveBg : T.surface2,
                    border: socialSheet === tab ? 'none' : `1px solid ${T.border}`,
                    color: socialSheet === tab ? T.pillActiveText : T.t2,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Area','Inter',sans-serif",
                  }}>
                    {tab === 'followers' ? `${t('followersLabel')} · ${followersVal}` : `${t('followingLabel')} · ${followingCount}`}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                {socialPeople.length > 0 ? (
                  socialPeople.map((f, i) => {
                    const label = f.name || f.username || '?';
                    return (
                      <div key={f.uid}
                        onClick={() => { if (!f.username) return; setSocialSheet(null); router.push(`/user/${encodeURIComponent(f.username)}`); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < socialPeople.length - 1 ? `1px solid ${T.border}` : 'none', cursor: f.username ? 'pointer' : 'default' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', background: f.avatarGradient || `linear-gradient(135deg,${T.pink},#8B2FFF)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {f.avatarImage
                            /* eslint-disable-next-line @next/next/no-img-element */
                            ? <img src={f.avatarImage} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <Txt size={16} weight={800} color="#fff">{(f.avatarLetter || label[0] || '?').toUpperCase()}</Txt>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Txt size={14} weight={700} color={T.t1} style={{ display: 'block' }}>{label}</Txt>
                          {f.username && <Txt size={12} color={T.t3}>@{f.username}</Txt>}
                        </div>
                        {f.username && <Icon name="chevronR" size={14} color={T.t4} />}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 28, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <Icon name="user" size={24} color={T.t4} />
                    </div>
                    <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', marginBottom: 6 }}>
                      {socialSheet === 'followers' ? t('emptyFollowers') : (isMe ? t('emptyFollowing') : t('noFollowingYet'))}
                    </Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5 }}>
                      {socialSheet === 'followers'
                        ? (isMe ? t('followersEmptyDetail') : t('publicFollowersEmptyDetail'))
                        : t('followingEmptyDetail')}
                    </Txt>
                  </div>
                )}
                {socialHasMore && (
                  <button type="button" onClick={loadMoreSocial} disabled={socialLoading} style={{ display: 'block', margin: '12px auto', padding: '9px 18px', borderRadius: 20, border: `1px solid ${T.border}`, background: T.surface2, color: T.t1, fontWeight: 700, cursor: socialLoading ? 'default' : 'pointer' }}>
                    {socialLoading ? 'Carregando…' : 'Carregar mais'}
                  </button>
                )}
              </div>
              <div style={{ height: 28 }} />
            </div>
          </>
        )}
        <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      </Screen>
    </Frame>
  );
}

/* ── Horizontal poster row ── */
function PosterRow({ title, seeAllLabel, items, onItem, onSeeAll }: {
  title: string;
  seeAllLabel?: string;
  items: ListItem[];
  onItem: (x: ListItem) => void;
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
              <Txt size={12} color={T.pink} weight={600}>{seeAllLabel ?? 'Ver tudo'}</Txt>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 } as React.CSSProperties}>
          {list.map((x, i) => (
            <div key={x.id ?? i} onClick={() => x.id && onItem(x)} style={{ flexShrink: 0, cursor: x.id ? 'pointer' : 'default' }}>
              <ImgWithSkeleton
                src={tmdbImg(x.poster_path, 'w185')}
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

/* ── Compact list section row ── */
function ListSection({ label, emptyLabel, icon, items, onItem, last }: {
  label: string;
  emptyLabel?: string;
  icon: import('@/lib/tokens').IconName;
  items: ListItem[];
  onItem: (x: ListItem) => void;
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
                src={tmdbImg(x.poster_path, 'w185')}
                alt={x.title} width={84} height={126} radius={10}
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: `4px 16px ${last ? 16 : 10}px` }}>
          <Txt size={12} color={T.t4}>{emptyLabel ?? 'Nenhum item ainda'}</Txt>
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

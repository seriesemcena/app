'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader, Skeleton } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import {
  dbFollowStore,
  dbProfileStore,
  getFollowers,
  getFollowRelationsPage,
  getUserByUsername,
  type FollowerInfo,
  type FollowPageCursor,
} from '@/lib/db';
import { profileStore, type Profile } from '@/lib/store';
import { usernameFromNameOrEmail } from '@/lib/username';
import { navigateBack } from '@/lib/navigation';

type SocialTab = 'followers' | 'following';
type SocialCounts = Record<SocialTab, number>;

const relationFromName = (name: string): FollowerInfo => ({
  uid: `legacy:${name}`,
  username: name,
  name,
  avatarImage: '',
  avatarLetter: name[0]?.toUpperCase() || '?',
  avatarGradient: '',
});

function SocialConnectionsPageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation('profile');
  const slug = decodeURIComponent((params.username as string) || '');
  const requestedTab: SocialTab = searchParams.get('tab') === 'following' ? 'following' : 'followers';

  const [tab, setTab] = useState<SocialTab>(requestedTab);
  const [profileUid, setProfileUid] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [people, setPeople] = useState<FollowerInfo[]>([]);
  const [counts, setCounts] = useState<SocialCounts>({ followers: 0, following: 0 });
  const [cursor, setCursor] = useState<FollowPageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => setTab(requestedTab), [requestedTab]);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;

    const resolveProfile = async () => {
      setLoading(true);
      setNotFound(false);

      const local = user ? profileStore.get(user.uid) : null;
      const fallbackName = user
        ? (local?.name || user.displayName || 'Usuário')
        : '';
      const ownUsername = user
        ? (local?.username || usernameFromNameOrEmail(fallbackName, user.email))
        : '';
      const ownsRoute = !!user && (
        slug === user.uid
        || slug === ownUsername
        || local?.aliases?.includes(slug) === true
      );

      if (ownsRoute && user && local) {
        let resolvedProfile = local;
        if (firebaseConfigured) {
          const cloud = await dbProfileStore.get(getDB(), user.uid).catch(() => null);
          if (cloud) resolvedProfile = { ...local, ...cloud };
        }
        if (!alive) return;
        setIsOwnProfile(true);
        setProfileUid(user.uid);
        setProfile(resolvedProfile);
        setCounts({
          followers: resolvedProfile.counters?.followersCount ?? 0,
          following: Math.max(
            resolvedProfile.counters?.followingCount ?? 0,
            (() => {
              try {
                return (JSON.parse(localStorage.getItem('sec_following') || '[]') as string[]).length;
              } catch {
                return 0;
              }
            })(),
          ),
        });
        return;
      }

      if (!firebaseConfigured) {
        if (alive) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      const result = await getUserByUsername(getDB(), slug).catch(() => null);
      if (!alive) return;
      if (!result) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setIsOwnProfile(result.uid === user?.uid);
      setProfileUid(result.uid);
      setProfile(result.profile);
      setCounts({
        followers: result.profile.counters?.followersCount ?? 0,
        following: Math.max(result.profile.counters?.followingCount ?? 0, result.followingCount),
      });
    };

    void resolveProfile();
    return () => { alive = false; };
  }, [authLoading, slug, user]);

  const identities = useMemo(() => Array.from(new Set([
    profile?.username,
    ...(profile?.aliases ?? []),
    profile?.name,
    slug,
  ].filter(Boolean) as string[])), [profile, slug]);

  useEffect(() => {
    if (!profileUid || !profile) return;
    let alive = true;
    setLoading(true);
    setPeople([]);
    setCursor(null);
    setHasMore(false);

    const loadFirstPage = async () => {
      if (!firebaseConfigured) {
        const localFollowing = tab === 'following'
          ? (() => {
              try {
                return (JSON.parse(localStorage.getItem('sec_following') || '[]') as string[]).map(relationFromName);
              } catch {
                return [];
              }
            })()
          : [];
        if (!alive) return;
        setPeople(localFollowing);
        setCounts((current) => ({ ...current, [tab]: Math.max(current[tab], localFollowing.length) }));
        setLoading(false);
        return;
      }

      const page = await getFollowRelationsPage(getDB(), profileUid, tab);
      let resolvedPeople = page.items;

      if (resolvedPeople.length === 0 && tab === 'followers') {
        resolvedPeople = await getFollowers(getDB(), identities, profileUid);
      }
      if (resolvedPeople.length === 0 && tab === 'following') {
        const legacyNames = await dbFollowStore.get(getDB(), profileUid).catch(() => [] as string[]);
        resolvedPeople = legacyNames.map(relationFromName);
      }

      if (!alive) return;
      setPeople(resolvedPeople);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setCounts((current) => ({ ...current, [tab]: Math.max(current[tab], resolvedPeople.length) }));
      setLoading(false);
    };

    void loadFirstPage();
    return () => { alive = false; };
  }, [identities, profile, profileUid, tab]);

  const changeTab = (nextTab: SocialTab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    router.replace(`/user/${encodeURIComponent(slug)}/followers?tab=${nextTab}`);
  };

  const loadMore = useCallback(async () => {
    if (!firebaseConfigured || !profileUid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getFollowRelationsPage(getDB(), profileUid, tab, cursor);
      setPeople((current) => {
        const unique = new Map(current.map((person) => [person.uid, person]));
        page.items.forEach((person) => unique.set(person.uid, person));
        return Array.from(unique.values());
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, profileUid, tab]);

  const displayName = profile?.name || profile?.username || slug;
  const displayUsername = profile?.username || slug;

  return (
    <Frame>
      <Screen>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}>
          <GlassHeader
            navTitle={t('connectionsTitle')}
            showNavTitle
            left={
              <button
                type="button"
                aria-label={t('goBack')}
                onClick={() => navigateBack(router, `/user/${encodeURIComponent(slug)}`)}
                style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="chevronL" size={18} color="#fff" />
              </button>
            }
          />

          <div style={{ padding: '10px 16px 18px' }}>
            <Txt size={22} weight={900} color={T.t1} style={{ display: 'block' }}>{displayName}</Txt>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginTop: 3 }}>@{displayUsername}</Txt>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', borderBottom: `1px solid ${T.border}` }}>
            {(['followers', 'following'] as const).map((item) => {
              const active = tab === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => changeTab(item)}
                  style={{
                    minHeight: 38,
                    padding: '8px 17px',
                    borderRadius: 22,
                    background: active ? T.pillActiveBg : T.surface2,
                    border: active ? 'none' : `1px solid ${T.border}`,
                    color: active ? T.pillActiveText : T.t2,
                    fontFamily: "'Area','Inter',sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {item === 'followers' ? t('followersLabel') : t('followingLabel')} · {counts[item]}
                </button>
              );
            })}
          </div>

          {notFound ? (
            <div style={{ padding: '72px 24px', textAlign: 'center' }}>
              <Icon name="user" size={34} color={T.t4} />
              <Txt size={17} weight={800} color={T.t1} style={{ display: 'block', marginTop: 14 }}>{t('userNotFound')}</Txt>
              <Txt size={13} color={T.t3} style={{ display: 'block', marginTop: 6 }}>{t('userNotFoundDetail')}</Txt>
            </div>
          ) : loading ? (
            <div style={{ padding: '8px 16px' }}>
              {[0, 1, 2, 3].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: `1px solid ${T.border}` }}>
                  <Skeleton w={48} h={48} radius={24} />
                  <div style={{ flex: 1, display: 'grid', gap: 7 }}>
                    <Skeleton w="42%" h={14} radius={5} />
                    <Skeleton w="30%" h={11} radius={5} />
                  </div>
                </div>
              ))}
            </div>
          ) : people.length > 0 ? (
            <div>
              {people.map((person, index) => {
                const label = person.name || person.username || '?';
                const avatar = person.avatarThumbImage || person.avatarImage;
                return (
                  <button
                    key={person.uid}
                    type="button"
                    disabled={!person.username}
                    onClick={() => person.username && router.push(`/user/${encodeURIComponent(person.username)}`)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 13,
                      padding: '14px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: index < people.length - 1 ? `1px solid ${T.border}` : 'none',
                      cursor: person.username ? 'pointer' : 'default',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', background: person.avatarGradient || `linear-gradient(135deg,${T.pink},#8B2FFF)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {avatar
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={avatar} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <Txt size={17} weight={800} color="#fff">{(person.avatarLetter || label[0] || '?').toUpperCase()}</Txt>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Txt>
                      {person.username && <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 2 }}>@{person.username}</Txt>}
                    </div>
                    {person.username && <Icon name="chevronR" size={15} color={T.t4} />}
                  </button>
                );
              })}
              {hasMore && (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={loadMore}
                  style={{ display: 'block', margin: '18px auto 8px', padding: '10px 20px', borderRadius: 22, border: 'none', background: '#F4F4F6', color: '#0B0B0D', fontFamily: "'Area','Inter',sans-serif", fontSize: 13, fontWeight: 800, cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.65 : 1 }}
                >
                  {loadingMore ? t('loadingSocial') : t('loadMoreSocial')}
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '72px 24px', textAlign: 'center' }}>
              <div style={{ width: 62, height: 62, borderRadius: 31, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 15 }}>
                <Icon name="user" size={27} color={T.t4} />
              </div>
              <Txt size={16} weight={800} color={T.t1}>
                {tab === 'followers' ? t('emptyFollowers') : (isOwnProfile ? t('emptyFollowing') : t('noFollowingYet'))}
              </Txt>
              <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5, marginTop: 7, maxWidth: 310 }}>
                {tab === 'followers'
                  ? (isOwnProfile ? t('followersEmptyDetail') : t('publicFollowersEmptyDetail'))
                  : t('followingEmptyDetail')}
              </Txt>
            </div>
          )}
        </div>
      </Screen>
    </Frame>
  );
}

export default function SocialConnectionsPage() {
  return (
    <Suspense fallback={<Frame><div style={{ flex: 1, background: T.bg }} /></Frame>}>
      <SocialConnectionsPageInner />
    </Suspense>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { ImgWithSkeleton, MasonryGrid2 } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { useAuth } from '@/hooks/useAuth';
import { searchUsers, type UserSearchResult } from '@/lib/db';
import { AppErrorState } from '@/components/AppStates';
import { getDB } from '@/lib/firebase';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/context/ThemeContext';
import '@/lib/i18n';
import { AppBannerSlot } from '@/components/AppBannerSlot';
import {
  addRecentSearchLocal,
  clearRecentSearchesLocal,
  dbRecentSearchStore,
  loadRecentSearchesLocal,
  mergeRecentSearches,
  recentSearchKey,
  saveRecentSearchesLocal,
  type RecentSearchItem,
} from '@/lib/recentSearches';

type FilterType = 'series' | 'movies' | 'people' | 'users';
type SortOrder = 'relevance' | 'newest' | 'oldest';
type TrendingType = 'tv' | 'movie';

export default function SearchPage() {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDQ] = useState('');
  const [filter, setFilter] = useState<FilterType>('series');
  const [sort, setSort] = useState<SortOrder>('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const [trendingType, setTrendingType] = useState<TrendingType>('tv');
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const [textlessPosters, setTextlessPosters] = useState<Record<string, string | null>>({});
  const requestedPosterKeys = useRef(new Set<string>());
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecentSearches(loadRecentSearchesLocal());
    if (!user?.uid) return () => { cancelled = true; };

    void (async () => {
      try {
        const db = getDB();
        const cloud = await dbRecentSearchStore.get(db, user.uid);
        if (cancelled) return;
        // Read local again so a search made while Firestore was loading is kept.
        const merged = mergeRecentSearches(loadRecentSearchesLocal(), cloud);
        saveRecentSearchesLocal(merged);
        setRecentSearches(merged);
        await dbRecentSearchStore.set(db, user.uid, merged);
      } catch {
        // Offline/auth failures keep the per-device history available.
      }
    });

    return () => { cancelled = true; };
  }, [user?.uid]);

  useEffect(() => {
    recentSearches.forEach((item) => {
      const key = recentSearchKey(item);
      if (requestedPosterKeys.current.has(key)) return;
      requestedPosterKeys.current.add(key);
      void (async () => {
        try {
          // Wait for the definitive language-free artwork instead of briefly
          // showing the translated poster and swapping it afterwards.
          const data = await fetch(`/api/tmdb?endpoint=/${item.type}/${item.id}/images&include_image_language=null`).then(r => r.json());
          const found = (data.posters || []).find((p: { iso_639_1?: string | null }) => p.iso_639_1 === null);
          setTextlessPosters(prev => ({ ...prev, [key]: found ? tmdbImg(found.file_path, 'w342') : null }));
        } catch {
          setTextlessPosters(prev => ({ ...prev, [key]: null }));
        }
      })();
    });
  }, [recentSearches]);

  const isSearching = query.length > 0;

  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Search Firestore users when "Usuários" tab is active
  useEffect(() => {
    if (filter !== 'users' || debouncedQ.length < 2) {
      setUserResults([]);
      return;
    }
    setUserLoading(true);
    try {
      const db = getDB();
      searchUsers(db, debouncedQ).then((res) => {
        setUserResults(res);
        setUserLoading(false);
      }).catch(() => { setUserResults([]); setUserLoading(false); });
    } catch { setUserResults([]); setUserLoading(false); }
  }, [debouncedQ, filter]);

  const { data: trending, loading: trendingLoading } = useTMDB(
    () => tmdb.trending(trendingType, 'day'),
    [trendingType]
  );
  const { data: searchRes, loading: searchLoad, error: searchError, retry: retrySearch } = useTMDB(
    () => debouncedQ.length > 1 ? tmdb.search(debouncedQ) : Promise.resolve(null),
    [debouncedQ]
  );

  const rawResults: TMDBItem[] = (searchRes?.results || []).filter((i: TMDBItem) => {
    if (filter === 'series')  return i.media_type === 'tv';
    if (filter === 'movies')  return i.media_type === 'movie';
    if (filter === 'people')  return i.media_type === 'person';
    if (filter === 'users')   return false; // handled separately
    return true;
  });

  const results = [...rawResults].sort((a, b) => {
    if (sort === 'newest') return (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || '');
    if (sort === 'oldest') return (a.release_date || a.first_air_date || '').localeCompare(b.release_date || b.first_air_date || '');
    return 0;
  });

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    const recent = { id: n.id, title: n.title, type: n.type, poster_path: item.poster_path };
    const next = addRecentSearchLocal(recent);
    setRecentSearches(next);
    if (user?.uid) {
      try {
        void dbRecentSearchStore.set(getDB(), user.uid, next).catch(() => {});
      } catch {}
    }
    router.push(`/title/${n.type}/${n.id}`);
  };

  const openRecent = (item: RecentSearchItem) => {
    const next = addRecentSearchLocal({ ...item, searchedAt: Date.now() });
    setRecentSearches(next);
    if (user?.uid) {
      try {
        void dbRecentSearchStore.set(getDB(), user.uid, next).catch(() => {});
      } catch {}
    }
    router.push(`/title/${item.type}/${item.id}`);
  };

  const tabs: FilterType[] = ['series', 'movies', 'people', 'users'];

  return (
    <Frame>
      <Screen style={{ background: 'transparent', position: 'relative' }}>
        <div className="app-page-scroll" style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', position: 'relative' } as React.CSSProperties}>

          {/* ── Header card ── */}
          <div style={{ position: 'relative', margin: '0 0 16px', overflow: 'hidden', borderRadius: '0 0 28px 28px', background: 'var(--c-card)' }}>

            <div style={{
              position: 'relative', zIndex: 1,
              padding: 'calc(var(--safe-area-top) + 12px) calc(var(--safe-area-right) + 16px) 20px calc(var(--safe-area-left) + 16px)',
            }}>

              {/* Barra de pesquisa + notificações */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  minWidth: 0,
                  flex: 1,
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,15,20,0.06)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  borderRadius: 999,
                  padding: '11px 14px',
                  border: isDark ? 'none' : '1px solid rgba(0,0,0,0.06)',
                } as React.CSSProperties}>
                  <Icon name="search" size={18} color={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.52)'} />
                  <input
                    className="search-primary-input"
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={t('search.placeholder')}
                    style={{ minWidth: 0, flex: 1, background: 'transparent', border: 'none', color: isDark ? '#fff' : T.t1, fontSize: 14, fontFamily: "'Area','Inter',sans-serif", outline: 'none', '--search-placeholder-color': isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.46)' } as React.CSSProperties}
                  />
                  {query && (
                    <button onClick={() => { setQuery(''); setDQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <Icon name="close" size={16} color={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.52)'} />
                    </button>
                  )}
                </div>

                <button
                  className="ios-top-action"
                  aria-label={t('notifications.title')}
                  onClick={() => router.push('/notifications')}
                  style={{ width: 42, height: 42, borderRadius: 21, flexShrink: 0, background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.07)', border: isDark ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(0,0,0,0.10)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bell" size={18} color={isDark ? '#fff' : 'rgba(0,0,0,0.72)'} />
                </button>
              </div>

              {/* Linha 3: Pesquisas recentes */}
              {recentSearches.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Txt size={22} weight={800} color={isDark ? 'rgba(255,255,255,0.90)' : T.t1} style={{ fontStretch: 'condensed' } as React.CSSProperties}>
                      {t('search.recentSearches')}
                    </Txt>
                    <button
                      onClick={() => {
                        clearRecentSearchesLocal();
                        setRecentSearches([]);
                        setTextlessPosters({});
                        requestedPosterKeys.current.clear();
                        if (user?.uid) {
                          try {
                            void dbRecentSearchStore.clear(getDB(), user.uid).catch(() => {});
                          } catch {}
                        }
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                      <Txt size={11} weight={700} color={T.pink}>{t('search.clear')}</Txt>
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 } as React.CSSProperties}>
                    {recentSearches.map((item) => (
                      <div key={recentSearchKey(item)} onClick={() => openRecent(item)} style={{ flexShrink: 0, cursor: 'pointer' }}>
                        <div style={{ width: 130, height: 130, borderRadius: 28, overflow: 'hidden', background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.04)', border: isDark ? '2px solid rgba(255,255,255,0.18)' : '2px solid rgba(0,0,0,0.10)', position: 'relative', flexShrink: 0 }}>
                          {(() => {
                            const poster = textlessPosters[recentSearchKey(item)];
                            if (poster === undefined) {
                              return <div className="img-skeleton" style={{ position: 'absolute', inset: 0 }} />;
                            }
                            const src = poster || tmdbImg(item.poster_path, 'w185');
                            return src
                              ? <ImgWithSkeleton src={src} alt={item.title} width="100%" height="100%" />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Icon name="film" size={36} color={isDark ? 'rgba(255,255,255,0.4)' : T.t3} />
                                </div>;
                          })()}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.20) 50%, transparent 100%)' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 14px' }}>
                            <Txt size={12} weight={700} color="#fff" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 } as React.CSSProperties}>
                              {item.title}
                            </Txt>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <AppBannerSlot page="search" />

          {/* ── Content ── */}
          <div style={{ padding: '0 16px 24px' }}>

            {!isSearching ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <Txt size={22} weight={800} color={T.t1} style={{ display: 'block', fontStretch: 'condensed' } as React.CSSProperties}>
                    {t('search.trendingToday')}
                  </Txt>
                  <div role="tablist" aria-label={t('search.trendingToday')} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {([
                      ['tv', t('search.filter.series')],
                      ['movie', t('search.filter.movies')],
                    ] as const).map(([type, label]) => {
                      const active = trendingType === type;
                      return (
                        <button
                          key={type}
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTrendingType(type)}
                          style={{
                            padding: '7px 13px', borderRadius: 18, flexShrink: 0,
                            background: active ? T.pillActiveBg : T.card,
                            border: active ? `1px solid ${T.pillActiveBorder}` : `1px solid ${T.border}`,
                            color: active ? T.pillActiveText : T.t2,
                            fontSize: 12, fontWeight: 700,
                            fontFamily: "'Area','Inter',sans-serif",
                            cursor: 'pointer', transition: 'all 0.2s',
                          }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <MasonryGrid2
                  items={trending?.results?.slice(0, 12) ?? []}
                  onItem={openTitle}
                  loading={trendingLoading}
                  skeletonCount={6}
                  padding="0"
                />
              </>
            ) : (
              <>
                {/* Filter chips + sort */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                    {tabs.map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                          padding: '8px 18px', borderRadius: 24, flexShrink: 0,
                          background: filter === f ? T.pillActiveBg : 'transparent',
                          border: filter === f ? 'none' : `1px solid ${T.border}`,
                          color: filter === f ? T.pillActiveText : T.t2,
                          fontSize: 13, fontWeight: 700,
                          fontFamily: "'Area','Inter',sans-serif",
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                        {t(`search.filter.${f}`)}
                      </button>
                    ))}
                    {filter !== 'users' && (
                      <button
                        aria-label={t('search.sort.relevance')}
                        onClick={() => setSortOpen((v) => !v)}
                        style={{
                          marginLeft: 'auto', width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                          background: sortOpen ? T.active : T.card,
                          border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.2s',
                        }}>
                        <Icon name="menuDots" size={18} color="#fff" />
                      </button>
                    )}
                  </div>

                  {sortOpen && (
                    <>
                      <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                      <div style={{ position: 'absolute', top: 50, right: 0, zIndex: 20, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 160, overflow: 'hidden' }}>
                        {(['relevance', 'newest', 'oldest'] as SortOrder[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => { setSort(s); setSortOpen(false); }}
                            style={{ width: '100%', padding: '13px 16px', background: sort === s ? '#fff' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Area','Inter',sans-serif" }}>
                            <Txt size={14} weight={sort === s ? 700 : 500} color={sort === s ? T.active : T.t1}>{t(`search.sort.${s}`)}</Txt>
                            {sort === s && <Icon name="check" size={14} color={T.active} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* ── Usuários tab ── */}
                {filter === 'users' ? (
                  debouncedQ.length < 2 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px', textAlign: 'center' }}>
                      <Icon name="search" size={44} color={T.t4} />
                      <Txt size={15} weight={700} color={T.t2} style={{ display: 'block' }}>{t('search.typeToSearchUsers')}</Txt>
                    </div>
                  ) : userLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[1,2,3].map(i => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                          <div className="img-skeleton" style={{ width: 44, height: 44, borderRadius: 22, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div className="img-skeleton" style={{ width: '40%', height: 14, borderRadius: 6, marginBottom: 6 }} />
                            <div className="img-skeleton" style={{ width: '60%', height: 11, borderRadius: 5 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : userResults.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px', textAlign: 'center' }}>
                      <Icon name="user" size={44} color={T.t4} />
                      <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>{t('search.noUsersFound')}</Txt>
                      <Txt size={13} color={T.t3} style={{ display: 'block' }}>{t('search.tryUsernameHint')}</Txt>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {userResults.map((u) => (
                        <div
                          key={u.uid}
                          onClick={() => router.push(`/user/${encodeURIComponent(u.username || u.uid)}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', cursor: 'pointer', borderBottom: `1px solid ${T.border}` }}>
                          {/* Avatar */}
                          <div style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', flexShrink: 0, background: u.avatarGradient || 'linear-gradient(135deg,#C069FF,#6B10A0)' }}>
                            {u.avatarImage
                              ? <img src={u.avatarImage} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Txt size={18} weight={800} color="#fff">{u.avatarLetter || u.name?.[0]?.toUpperCase() || 'U'}</Txt>
                                </div>
                            }
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight={700} color={T.t1} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {u.name || u.username}
                            </Txt>
                            {u.username && (
                              <Txt size={12} color={T.t3} style={{ display: 'block' }}>@{u.username}</Txt>
                            )}
                            {u.bio && (
                              <Txt size={12} color={T.t3} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.bio}</Txt>
                            )}
                          </div>
                          <Icon name="chevronR" size={14} color={T.t4} />
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  /* ── Séries / Filmes / Pessoas tabs ── */
                  searchError ? (
                    <AppErrorState
                      title={t('searchFailed', { ns: 'errors' })}
                      message={t('network', { ns: 'errors' })}
                      actionLabel={t('retry', { ns: 'errors' })}
                      onRetry={retrySearch}
                    />
                  ) : results.length === 0 && !searchLoad ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px', textAlign: 'center' }}>
                      <Icon name="search" size={44} color={T.t4} />
                      <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>{t('search.noResults')}</Txt>
                      <Txt size={13} color={T.t3} style={{ display: 'block' }}>{t('search.tryOtherTerms')}</Txt>
                    </div>
                  ) : (
                    <>
                      {!searchLoad && results.length > 0 && (
                        <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 12 }}>
                          {t('search.resultsCount', { count: results.length, defaultValue: `${results.length} resultado${results.length !== 1 ? 's' : ''}` })}
                        </Txt>
                      )}
                      <MasonryGrid2
                        items={results.slice(0, 30)}
                        onItem={openTitle}
                        loading={searchLoad}
                        skeletonCount={6}
                        padding="0"
                      />
                    </>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

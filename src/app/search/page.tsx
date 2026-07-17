'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, Logo } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { MasonryGrid2 } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';
import { profileStore } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { searchUsers, type UserSearchResult } from '@/lib/db';
import { getDB } from '@/lib/firebase';

type FilterType = 'Séries' | 'Filmes' | 'Pessoas' | 'Usuários';
type SortOrder = 'Relevância' | 'Recentes' | 'Antigos';
type RecentItem = { id: number; title: string; type: string; poster_path?: string | null };

const RECENT_KEY = 'sec_recent_search_v1';

function loadRecent(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(item: RecentItem) {
  const prev = loadRecent().filter((r) => r.id !== item.id);
  const next = [item, ...prev].slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
}

export default function SearchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDQ] = useState('');
  const [filter, setFilter] = useState<FilterType>('Séries');
  const [sort, setSort] = useState<SortOrder>('Relevância');
  const [sortOpen, setSortOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentItem[]>([]);
  const [textlessPosters, setTextlessPosters] = useState<Record<number, string | null>>({});
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const profile = profileStore.get();
  const avatarLetter = profile.avatarLetter || user?.displayName?.[0]?.toUpperCase() || 'U';
  const avatarGradient = profile.avatarGradient || 'linear-gradient(135deg,#C069FF,#6B10A0)';
  const avatarImage = profile.avatarImage || user?.photoURL || null;

  useEffect(() => {
    const recents = loadRecent();
    setRecentSearches(recents);
    recents.forEach(async (item) => {
      if (textlessPosters[item.id] !== undefined) return;
      try {
        const endpoint = `/${item.type}/${item.id}/images?include_image_language=null`;
        const data = await fetch(`/api/tmdb?endpoint=${encodeURIComponent(endpoint)}`).then(r => r.json());
        const found = (data.posters || []).find((p: any) => p.iso_639_1 === null);
        setTextlessPosters(prev => ({ ...prev, [item.id]: found ? `https://image.tmdb.org/t/p/w342${found.file_path}` : null }));
      } catch {
        setTextlessPosters(prev => ({ ...prev, [item.id]: null }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSearching = query.length > 0;

  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Search Firestore users when "Usuários" tab is active
  useEffect(() => {
    if (filter !== 'Usuários' || debouncedQ.length < 2) {
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

  const { data: trending } = useTMDB(() => tmdb.trending('all', 'day'), []);
  const { data: searchRes, loading: searchLoad } = useTMDB(
    () => debouncedQ.length > 1 ? tmdb.search(debouncedQ) : Promise.resolve(null),
    [debouncedQ]
  );

  const rawResults: TMDBItem[] = (searchRes?.results || []).filter((i: TMDBItem) => {
    if (filter === 'Séries')  return i.media_type === 'tv';
    if (filter === 'Filmes')  return i.media_type === 'movie';
    if (filter === 'Pessoas') return i.media_type === 'person';
    if (filter === 'Usuários') return false; // handled separately
    return true;
  });

  const results = [...rawResults].sort((a, b) => {
    if (sort === 'Recentes') return (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || '');
    if (sort === 'Antigos')  return (a.release_date || a.first_air_date || '').localeCompare(b.release_date || b.first_air_date || '');
    return 0;
  });

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    const recent: RecentItem = { id: n.id, title: n.title, type: n.type, poster_path: item.poster_path };
    saveRecent(recent);
    setRecentSearches(loadRecent());
    router.push(`/title/${n.type}/${n.id}`);
  };

  const openRecent = (item: RecentItem) => {
    saveRecent(item);
    setRecentSearches(loadRecent());
    router.push(`/title/${item.type}/${item.id}`);
  };

  const tabs: FilterType[] = ['Séries', 'Filmes', 'Pessoas', 'Usuários'];

  return (
    <Frame>
      <Screen style={{ background: 'transparent', position: 'relative' }}>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', position: 'relative' } as React.CSSProperties}>

          {/* ── Header card ── */}
          <div style={{ position: 'relative', margin: '0 0 16px', overflow: 'hidden', borderRadius: '0 0 28px 28px', background: 'var(--c-card)' }}>

            <div style={{ position: 'relative', zIndex: 1, padding: '16px 16px 20px' }}>

              {/* Linha 1: Avatar + Logo + Notificações */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingTop: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', border: '2px solid rgba(255,255,255,0.25)' }} onClick={() => router.push('/profile')}>
                  {avatarImage
                    ? <img src={avatarImage} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', height: '100%', background: avatarGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Txt size={14} weight={800} color="#fff">{avatarLetter}</Txt>
                      </div>
                  }
                </div>

                <Logo height={22} />

                <button
                  onClick={() => router.push('/notifications')}
                  style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.20)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bell" size={17} color="#fff" />
                </button>
              </div>

              {/* Linha 2: Barra de pesquisa */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderRadius: T.radiusSm,
                padding: '11px 14px',
                border: 'none',
              } as React.CSSProperties}>
                <Icon name="search" size={18} color="rgba(255,255,255,0.55)" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Buscar filmes, séries, pessoas..."
                  style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 14, fontFamily: "'Area','Inter',sans-serif", outline: 'none' }}
                />
                {query && (
                  <button onClick={() => { setQuery(''); setDQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Icon name="close" size={16} color="rgba(255,255,255,0.55)" />
                  </button>
                )}
              </div>

              {/* Linha 3: Pesquisas recentes */}
              {recentSearches.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Txt size={22} weight={800} color="rgba(255,255,255,0.90)" style={{ fontStretch: 'condensed' } as React.CSSProperties}>
                      Pesquisas recentes
                    </Txt>
                    <button
                      onClick={() => { localStorage.removeItem(RECENT_KEY); setRecentSearches([]); setTextlessPosters({}); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                      <Txt size={11} weight={700} color={T.pink}>Limpar</Txt>
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 } as React.CSSProperties}>
                    {recentSearches.map((item) => (
                      <div key={item.id} onClick={() => openRecent(item)} style={{ flexShrink: 0, cursor: 'pointer' }}>
                        <div style={{ width: 130, height: 130, borderRadius: 28, overflow: 'hidden', background: 'rgba(255,255,255,0.10)', border: '2px solid rgba(255,255,255,0.18)', position: 'relative', flexShrink: 0 }}>
                          {(() => {
                            const src = textlessPosters[item.id] ?? (item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null);
                            return src
                              ? <img src={src} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Icon name="film" size={36} color="rgba(255,255,255,0.4)" />
                                </div>;
                          })()}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.20) 50%, transparent 100%)' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px' }}>
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

          {/* ── Content ── */}
          <div style={{ padding: '0 16px 24px' }}>

            {!isSearching ? (
              <>
                <Txt size={22} weight={800} color={T.t1} style={{ display: 'block', marginBottom: 14, fontStretch: 'condensed' } as React.CSSProperties}>
                  Em alta hoje
                </Txt>
                <MasonryGrid2
                  items={trending?.results?.slice(0, 12) ?? []}
                  onItem={openTitle}
                  loading={!trending}
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
                          background: filter === f ? T.card : 'transparent',
                          border: filter === f ? 'none' : `1px solid ${T.border}`,
                          color: filter === f ? '#fff' : T.t2,
                          fontSize: 13, fontWeight: 700,
                          fontFamily: "'Area','Inter',sans-serif",
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                        {f}
                      </button>
                    ))}
                    {filter !== 'Usuários' && (
                      <button
                        onClick={() => setSortOpen((v) => !v)}
                        style={{
                          marginLeft: 'auto', width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                          background: sortOpen ? T.pink : T.card,
                          border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.2s',
                        }}>
                        <Icon name="list" size={16} color="#fff" />
                      </button>
                    )}
                  </div>

                  {sortOpen && (
                    <>
                      <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                      <div style={{ position: 'absolute', top: 50, right: 0, zIndex: 20, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 160, overflow: 'hidden' }}>
                        {(['Relevância', 'Recentes', 'Antigos'] as SortOrder[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => { setSort(s); setSortOpen(false); }}
                            style={{ width: '100%', padding: '13px 16px', background: sort === s ? 'rgba(192,105,255,0.08)' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Area','Inter',sans-serif" }}>
                            <Txt size={14} weight={sort === s ? 700 : 500} color={sort === s ? T.pink : T.t1}>{s}</Txt>
                            {sort === s && <Icon name="check" size={14} color={T.pink} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* ── Usuários tab ── */}
                {filter === 'Usuários' ? (
                  debouncedQ.length < 2 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px', textAlign: 'center' }}>
                      <Icon name="search" size={44} color={T.t4} />
                      <Txt size={15} weight={700} color={T.t2} style={{ display: 'block' }}>Digite para buscar usuários</Txt>
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
                      <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>Nenhum usuário encontrado</Txt>
                      <Txt size={13} color={T.t3} style={{ display: 'block' }}>Tente buscar pelo nome de usuário</Txt>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {userResults.map((u) => (
                        <div
                          key={u.uid}
                          onClick={() => router.push(`/user/${u.uid}`)}
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
                  results.length === 0 && !searchLoad ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px', textAlign: 'center' }}>
                      <Icon name="search" size={44} color={T.t4} />
                      <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>Nenhum resultado</Txt>
                      <Txt size={13} color={T.t3} style={{ display: 'block' }}>Tente outros termos ou filtros</Txt>
                    </div>
                  ) : (
                    <>
                      {!searchLoad && results.length > 0 && (
                        <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 12 }}>
                          {results.length} resultado{results.length !== 1 ? 's' : ''}
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

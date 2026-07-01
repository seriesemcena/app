'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBPosterCard } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, type TMDBItem } from '@/lib/tmdb';

type FilterType = 'Séries' | 'Filmes' | 'Usuários';
type SortOrder = 'Relevância' | 'Recentes' | 'Antigos';

export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDQ] = useState('');
  const [filter, setFilter] = useState<FilterType>('Séries');
  const [sort, setSort] = useState<SortOrder>('Relevância');
  const [sortOpen, setSortOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const isSearching = query.length > 0;

  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  /* ── TMDB data ── */
  const { data: trending } = useTMDB(() => tmdb.trending('all', 'day'), []);
  const { data: searchRes, loading: searchLoad } = useTMDB(
    () => debouncedQ.length > 1 ? tmdb.search(debouncedQ) : Promise.resolve(null),
    [debouncedQ]
  );

  /* ── Filter + sort results ── */
  const rawResults: TMDBItem[] = (searchRes?.results || []).filter((i: TMDBItem) => {
    if (filter === 'Séries')  return i.media_type === 'tv';
    if (filter === 'Filmes')  return i.media_type === 'movie';
    if (filter === 'Usuários') return i.media_type === 'person';
    return true;
  });

  const results = [...rawResults].sort((a, b) => {
    if (sort === 'Recentes') {
      const da = (a.release_date || a.first_air_date || '');
      const db = (b.release_date || b.first_air_date || '');
      return db.localeCompare(da);
    }
    if (sort === 'Antigos') {
      const da = (a.release_date || a.first_air_date || '');
      const db = (b.release_date || b.first_air_date || '');
      return da.localeCompare(db);
    }
    return 0; // Relevância = TMDB order
  });

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  };

  return (
    <Frame>
      <Screen style={{ background: 'transparent', position: 'relative' }}>
        {/* Gradient — imóvel, atrás de tudo */}
        <div style={{ position: 'absolute', inset: 0, background: 'var(--c-header-gradient)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', position: 'relative', zIndex: 1 } as React.CSSProperties}>

          {/* ── Header — igual home ── */}
          <div style={{ padding: '24px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1, color: '#fff', textTransform: 'uppercase', fontFamily: "'Area','Inter',sans-serif" }}>
              Maratonou
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => router.push('/notifications')}
                style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={18} color="#fff" />
              </button>
            </div>
          </div>

          {/* ── Content ── */}
          <div style={{ background: 'linear-gradient(to bottom, transparent 0px, var(--c-bg) 56px)', minHeight: 400, padding: '0 16px 24px' }}>

            {/* Título + search bar — dentro do content para ficar sobre o bg claro */}
            <div style={{ paddingTop: 16, paddingBottom: 14 }}>
              <Txt size={22} weight={900} color={T.t1} style={{ display: 'block', marginBottom: 12, letterSpacing: '-0.5px' }}>Buscar</Txt>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: T.card,
                borderRadius: 14, padding: '11px 14px',
                border: focused ? `1.5px solid ${T.pink}` : `1.5px solid ${T.border}`,
                transition: 'border 0.2s',
              }}>
                <Icon name="search" size={18} color={T.t3} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Buscar filmes, séries, pessoas..."
                  style={{ flex: 1, background: 'transparent', border: 'none', color: T.t1, fontSize: 14, fontFamily: "'Area','Inter',sans-serif", outline: 'none' }}
                />
                {query && (
                  <button onClick={() => { setQuery(''); setDQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Icon name="close" size={16} color={T.t3} />
                  </button>
                )}
              </div>
            </div>

            {!isSearching ? (
              /* ══ DEFAULT: Em alta hoje ══ */
              <>
                <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Em alta hoje
                </Txt>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {trending
                    ? (trending.results || []).slice(0, 9).map((item: TMDBItem) => (
                        <TMDBPosterCard key={item.id} item={item} size="sm" onClick={() => openTitle(item)} />
                      ))
                    : Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} style={{ aspectRatio: '2/3', borderRadius: 12, background: T.surface2 }} />
                      ))
                  }
                </div>
              </>
            ) : (
              /* ══ SEARCH: Filtros + resultados ══ */
              <>
                {/* Filter chips + sort button */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                    {(['Séries', 'Filmes', 'Usuários'] as FilterType[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                          padding: '8px 18px', borderRadius: 24, flexShrink: 0,
                          background: filter === f ? '#1a1a1a' : 'transparent',
                          border: filter === f ? 'none' : `1px solid ${T.border}`,
                          color: filter === f ? '#fff' : T.t2,
                          fontSize: 13, fontWeight: 700,
                          fontFamily: "'Area','Inter',sans-serif",
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >
                        {f}
                      </button>
                    ))}

                    {/* Sort filter button */}
                    <button
                      onClick={() => setSortOpen((v) => !v)}
                      style={{
                        marginLeft: 'auto', width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                        background: sortOpen ? T.pink : '#1a1a1a',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.2s',
                      }}
                    >
                      <Icon name="list" size={16} color="#fff" />
                    </button>
                  </div>

                  {/* Sort dropdown */}
                  {sortOpen && (
                    <>
                      <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                      <div style={{
                        position: 'absolute', top: 50, right: 0, zIndex: 20,
                        background: T.card, borderRadius: 14,
                        border: `1px solid ${T.border}`,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        minWidth: 160, overflow: 'hidden',
                      }}>
                        {(['Relevância', 'Recentes', 'Antigos'] as SortOrder[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => { setSort(s); setSortOpen(false); }}
                            style={{
                              width: '100%', padding: '13px 16px',
                              background: sort === s ? 'rgba(240,80,194,0.08)' : 'transparent',
                              border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              fontFamily: "'Area','Inter',sans-serif",
                            }}
                          >
                            <Txt size={14} weight={sort === s ? 700 : 500} color={sort === s ? T.pink : T.t1}>{s}</Txt>
                            {sort === s && <Icon name="check" size={14} color={T.pink} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Results */}
                {searchLoad ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} style={{ aspectRatio: '2/3', borderRadius: 12, background: T.surface2 }} />
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px', textAlign: 'center' }}>
                    <Icon name="search" size={44} color={T.t4} />
                    <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>Nenhum resultado</Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block' }}>Tente outros termos ou filtros</Txt>
                  </div>
                ) : (
                  <>
                    <Txt size={12} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 12 }}>
                      {results.length} resultado{results.length !== 1 ? 's' : ''}
                    </Txt>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {results.slice(0, 30).map((item) => (
                        <TMDBPosterCard key={item.id} item={item} size="sm" onClick={() => openTitle(item)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

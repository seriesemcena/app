'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, normalize, type TMDBItem } from '@/lib/tmdb';
import { revStore, profileStore, PROFILE_KEY_BASE } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB, authHeader } from '@/lib/firebase';
import { dbProfileStore } from '@/lib/db';
import { navigateBack } from '@/lib/navigation';

type Suggestion = { title: string; year: string; type: 'movie' | 'tv'; reason: string };
type Result     = { suggestion: Suggestion; tmdb: TMDBItem | null };
type Mode       = 'discover' | 'search';

const ALL_GENRES = ['Ação', 'Drama', 'Comédia', 'Terror', 'Sci-Fi', 'Thriller', 'Romance', 'Crime', 'Fantasia', 'Animação', 'Documentário'];
const DECADES    = ['Qualquer', '2020s', '2010s', '2000s', 'Clássicos'];
const RATINGS    = [5, 6, 7, 8, 9, 10];

const GENRE_MAP_TV: Record<string, number> = {
  'Ação': 10759, 'Drama': 18, 'Comédia': 35, 'Terror': 27, 'Sci-Fi': 10765,
  'Romance': 10749, 'Thriller': 53, 'Fantasia': 10765, 'Crime': 80,
  'Documentário': 99, 'Animação': 16,
};

const QUICK_PROMPTS = [
  'Thriller psicológico intenso',
  'Série para maratonar no fim de semana',
  'Comédia que faça rir de verdade',
  'Drama familiar emocionante',
  'Ficção científica com boa história',
  'Terror atmosférico sem jump scares',
];

// ── Result card ────────────────────────────────────────────────
function ResultCard({ result, onClick }: { result: Result; onClick: () => void }) {
  const { suggestion, tmdb: item } = result;
  const poster = item ? tmdbImg(item.poster_path, 'w185') : null;
  const title  = item ? normalize(item).title : suggestion.title;

  return (
    <div
      onClick={item ? onClick : undefined}
      style={{
        display: 'flex', gap: 14, padding: '14px 16px',
        background: 'var(--c-card-deep)', borderRadius: 16,
        border: `1px solid ${T.border}`, cursor: item ? 'pointer' : 'default',
      }}
    >
      <div style={{ width: 64, height: 92, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
        {poster && <img src={poster} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', marginBottom: 2 }}>{title}</Txt>
        <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 8 }}>
          {suggestion.year}{suggestion.year ? ' · ' : ''}{suggestion.type === 'tv' ? 'Série' : 'Filme'}
        </Txt>
        <div style={{ padding: '7px 10px', background: 'rgba(192,105,255,0.10)', borderRadius: 8, border: '1px solid rgba(192,105,255,0.18)' }}>
          <Txt size={11} color={T.pink} style={{ display: 'block', lineHeight: 1.45 }}>
            💡 {suggestion.reason}
          </Txt>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────
function LoadingResults() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--c-card-deep)', borderRadius: 16, border: `1px solid ${T.border}` }}>
          <div style={{ width: 64, height: 92, borderRadius: 10, background: T.surface2, flexShrink: 0, animation: `pulse 1.4s ${i * 0.1}s ease-in-out infinite` }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
            <div style={{ height: 16, width: '65%', borderRadius: 6, background: T.surface2, animation: `pulse 1.4s ${i * 0.1}s ease-in-out infinite` }} />
            <div style={{ height: 12, width: '35%', borderRadius: 6, background: T.surface2, animation: `pulse 1.4s ${i * 0.1 + 0.05}s ease-in-out infinite` }} />
            <div style={{ height: 44, borderRadius: 8, background: T.surface2, animation: `pulse 1.4s ${i * 0.1 + 0.1}s ease-in-out infinite` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Filter chip ────────────────────────────────────────────────
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
      background: active ? T.active : 'rgba(255,255,255,0.08)',
      color: active ? '#fff' : T.t2,
      fontSize: 13, fontWeight: active ? 700 : 500,
      fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function CuradoriaPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [mode, setMode]           = useState<Mode>('discover');
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState<Result[] | null>(null);
  const [aiProfile, setAiProfile] = useState('');
  const [error, setError]         = useState('');

  // Profile data
  const [userGenres, setUserGenres]       = useState<string[]>([]);
  const [likedTitles, setLikedTitles]     = useState<Array<{ title: string; rating: number }>>([]);

  // Discover filters
  const [selGenres, setSelGenres]   = useState<string[]>([]);
  const [decade, setDecade]         = useState('Qualquer');
  const [minRating, setMinRating]   = useState(7);
  const [mediaType, setMediaType]   = useState<'all' | 'tv' | 'movie'>('all');

  // Load profile with 3-tier fallback
  useEffect(() => {
    if (authLoading) return;
    (async () => {
      let p = profileStore.get(user?.uid);
      if (!p.genres?.length) {
        try {
          const legacy = JSON.parse(localStorage.getItem(PROFILE_KEY_BASE) || '{}');
          if (legacy.genres?.length) p = { ...p, ...legacy };
        } catch {}
      }
      if (!p.genres?.length && user && firebaseConfigured) {
        try {
          const cloud = await dbProfileStore.get(getDB(), user.uid);
          if (cloud?.genres?.length) { p = { ...p, ...cloud }; profileStore.set(cloud, user.uid); }
        } catch {}
      }
      setUserGenres(p.genres || []);
      setSelGenres(p.genres?.slice(0, 3) || []);
      const username = p.username || user?.displayName || user?.email?.split('@')[0] || '';
      const reviews  = revStore.getByUser(username);
      setLikedTitles(reviews.filter(r => r.rating >= 8).slice(0, 12).map(r => ({ title: r.itemKey, rating: r.rating })));
    })();
  }, [user, authLoading]);

  // Reset on mode change
  useEffect(() => { setResults(null); setAiProfile(''); setError(''); }, [mode]);

  const fetchTmdb = useCallback(async (suggestions: Suggestion[]): Promise<Result[]> =>
    Promise.all(suggestions.map(async s => {
      try {
        const data  = await tmdb.search(s.title);
        const found = (data?.results || []).find((r: TMDBItem) => {
          const t = normalize(r).title.toLowerCase();
          const q = s.title.toLowerCase();
          return t.includes(q.slice(0, 8)) || q.includes(t.slice(0, 8));
        }) || data?.results?.[0] || null;
        return { suggestion: s, tmdb: found };
      } catch { return { suggestion: s, tmdb: null }; }
    }))
  , []);

  // ── Discover ────────────────────────────────────────────────
  const runDiscover = async () => {
    setLoading(true); setResults(null); setError('');
    try {
      const res  = await fetch('/api/curadoria', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          mode: 'discover',
          likedTitles,
          filters: { genres: selGenres, decade, minRating, mediaType },
        }),
      });
      const data = await res.json();
      if (data.profile) setAiProfile(data.profile);
      setResults(await fetchTmdb(data.suggestions || []));
    } catch { setError('Erro ao gerar sugestões. Tente novamente.'); }
    setLoading(false);
  };

  // ── Search ──────────────────────────────────────────────────
  const runSearch = useCallback(async (q = query) => {
    if (!q.trim()) return;
    setLoading(true); setResults(null); setError('');
    try {
      const res  = await fetch('/api/curadoria', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ mode: 'search', query: q.trim() }),
      });
      const data = await res.json();
      setResults(await fetchTmdb(data.suggestions || []));
    } catch { setError('Erro ao buscar sugestões. Tente novamente.'); }
    setLoading(false);
  }, [query, fetchTmdb]);

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  };

  const toggleGenre = (g: string) =>
    setSelGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  return (
    <Frame>
      <Screen>
        <GlassHeader
          left={
            <button onClick={() => navigateBack(router)} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
              <Icon name="chevronL" size={16} color="#fff" />
            </button>
          }
          right={
            <button onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
              <Icon name="bell" size={16} color="#fff" />
            </button>
          }
        />

        <ScrollArea style={{ padding: '0 16px' }}>

          {/* Page title */}
          <Txt size={22} weight={800} style={{ display: 'block', marginTop: 24, marginBottom: 20, fontStretch: 'condensed' } as React.CSSProperties}>Curadoria IA</Txt>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            {([['discover', '✦ Descobrir'], ['search', '⌕ Buscar']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setMode(id)} style={{
                padding: '10px 22px', borderRadius: 999, border: 'none',
                background: mode === id ? '#fff' : 'rgba(255,255,255,0.10)',
                color: mode === id ? '#111' : 'rgba(255,255,255,0.55)',
                fontSize: 14, fontWeight: 600, fontFamily: "'Area','Inter',sans-serif",
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── DESCOBRIR ─────────────────────────────────── */}
          {mode === 'discover' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Filters card */}
              <div style={{ background: 'var(--c-card-deep)', borderRadius: 16, border: `1px solid ${T.border}`, padding: '16px' }}>

                {/* Liked titles summary */}
                {likedTitles.length > 0 && (
                  <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${T.border}` }}>
                    <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Baseado em {likedTitles.length} avaliação{likedTitles.length > 1 ? 'ões' : ''} com 4+ estrelas
                    </Txt>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {likedTitles.slice(0, 6).map((t, i) => (
                        <div key={i} style={{ padding: '4px 10px', borderRadius: 16, background: 'rgba(192,105,255,0.12)', border: '1px solid rgba(192,105,255,0.20)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Txt size={11} color={T.t2}>{t.title}</Txt>
                          <Txt size={10} color={T.pink}>★{t.rating}</Txt>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Media type filter */}
                <div style={{ marginBottom: 14 }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tipo</Txt>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['all', 'Todos'], ['tv', 'Séries'], ['movie', 'Filmes']] as const).map(([val, label]) => (
                      <FilterChip key={val} label={label} active={mediaType === val} onClick={() => setMediaType(val)} />
                    ))}
                  </div>
                </div>

                {/* Genre filter */}
                <div style={{ marginBottom: 14 }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Gêneros</Txt>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ALL_GENRES.map(g => (
                      <FilterChip key={g} label={g} active={selGenres.includes(g)} onClick={() => toggleGenre(g)} />
                    ))}
                  </div>
                </div>

                {/* Decade filter */}
                <div style={{ marginBottom: 14 }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Década</Txt>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DECADES.map(d => (
                      <FilterChip key={d} label={d} active={decade === d} onClick={() => setDecade(d)} />
                    ))}
                  </div>
                </div>

                {/* Min rating filter */}
                <div>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Avaliação mínima
                  </Txt>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {RATINGS.map(r => (
                      <FilterChip key={r} label={`${r}★`} active={minRating === r} onClick={() => setMinRating(r)} />
                    ))}
                  </div>
                </div>
              </div>

              {/* AI profile text */}
              {aiProfile && (
                <div style={{ padding: '10px 14px', background: 'rgba(192,105,255,0.08)', borderRadius: 12, borderLeft: `3px solid ${T.pink}` }}>
                  <Txt size={12} color={T.t2} style={{ display: 'block', lineHeight: 1.5, fontStyle: 'italic' }}>{aiProfile}</Txt>
                </div>
              )}

              {/* Generate button */}
              {!loading && (
                <button onClick={runDiscover} style={{
                  width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg, #6B10A0, #C069FF)',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  fontFamily: "'Area','Inter',sans-serif",
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(192,105,255,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Icon name="award" size={18} color="#fff" />
                  {results ? 'Gerar novas sugestões' : 'Descobrir títulos para mim'}
                </button>
              )}

              {error && <Txt size={13} color={T.t3} style={{ display: 'block', textAlign: 'center' }}>{error}</Txt>}
              {loading && <LoadingResults />}

              {results && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 2 }}>
                    {results.length} sugestões para seu perfil
                  </Txt>
                  {results.map((r, i) => (
                    <ResultCard key={i} result={r} onClick={() => r.tmdb && openTitle(r.tmdb)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── BUSCAR ───────────────────────────────────── */}
          {mode === 'search' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Input */}
              <div style={{ background: 'var(--c-card-deep)', borderRadius: 16, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                <textarea
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch(); } }}
                  placeholder={'Descreva o que você quer assistir…\nEx: quero um thriller psicológico com narrativa não linear'}
                  rows={3}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    color: T.t1, fontSize: 14, fontFamily: "'Area','Inter',sans-serif",
                    padding: '14px 16px', outline: 'none', resize: 'none',
                    boxSizing: 'border-box', lineHeight: 1.5,
                  }}
                />
                <div style={{ padding: '0 12px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => runSearch()}
                    disabled={!query.trim() || loading}
                    style={{
                      padding: '9px 20px', borderRadius: 24, border: 'none',
                      background: query.trim() && !loading ? T.pink : T.surface2,
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      fontFamily: "'Area','Inter',sans-serif",
                      cursor: query.trim() && !loading ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.2s',
                    }}
                  >
                    <Icon name="star" size={14} color="#fff" />
                    Buscar
                  </button>
                </div>
              </div>

              {/* Quick prompts */}
              {!results && !loading && (
                <>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Sugestões rápidas
                  </Txt>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {QUICK_PROMPTS.map(p => (
                      <button key={p} onClick={() => { setQuery(p); runSearch(p); }} style={{
                        padding: '8px 14px', borderRadius: 20,
                        background: 'var(--c-card-deep)', border: `1px solid ${T.border}`,
                        color: T.t2, fontSize: 13, fontFamily: "'Area','Inter',sans-serif",
                        cursor: 'pointer',
                      }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {error && <Txt size={13} color={T.t3} style={{ display: 'block', textAlign: 'center' }}>{error}</Txt>}
              {loading && <LoadingResults />}

              {results && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 2 }}>
                    {results.length} resultado{results.length !== 1 ? 's' : ''} para "{query}"
                  </Txt>
                  {results.map((r, i) => (
                    <ResultCard key={i} result={r} onClick={() => r.tmdb && openTitle(r.tmdb)} />
                  ))}
                  {results.length > 0 && (
                    <button onClick={() => runSearch()} style={{
                      padding: '12px', borderRadius: 12, border: `1px solid ${T.border}`,
                      background: 'transparent', color: T.t2, fontSize: 13,
                      fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer',
                    }}>
                      Gerar outras sugestões
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ height: 32 }} />
        </ScrollArea>
      </Screen>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
    </Frame>
  );
}

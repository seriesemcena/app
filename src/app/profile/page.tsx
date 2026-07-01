'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, VIPBadge } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBPosterCard } from '@/components/posters';
import { T } from '@/lib/tokens';
import { listStore, revStore, profileStore, prefsStore, type Profile } from '@/lib/store';
import { type TMDBItem } from '@/lib/tmdb';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore } from '@/lib/db';


export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<'estatísticas' | 'avaliações'>('estatísticas');
  const [stats, setStats] = useState({ watched: 0, watching: 0, want: 0, reviews: 0 });
  // Start as null so we never flash stale localStorage data before auth resolves
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    // Wait for Firebase auth to resolve before showing any profile data
    if (loading) return;

    setStats({
      watched: listStore.get('watched').length,
      watching: listStore.get('watching').length,
      want: listStore.get('want').length,
      reviews: revStore.countAll(),
    });

    const applyProfile = (base: Profile, cloudOverride?: Partial<Profile>) => {
      const merged = cloudOverride ? { ...base, ...cloudOverride } : base;
      if (user) {
        const FACTORY_USERNAME = 'lucastales';
        const FACTORY_NAME     = 'Lucas Tales';
        const resolvedName = (merged.name && merged.name !== FACTORY_NAME)
          ? merged.name
          : (user.displayName || merged.name || 'Usuário');
        setProfile({
          ...merged,
          name: resolvedName,
          username: (merged.username && merged.username !== FACTORY_USERNAME)
            ? merged.username
            : (user.email?.split('@')[0] || merged.username || 'usuario'),
          avatarImage: merged.avatarImage || user.photoURL || '',
          avatarLetter: resolvedName[0]?.toUpperCase() || 'U',
        });
      } else {
        setProfile(merged);
      }
    };

    const local = profileStore.get();
    // Show local data immediately
    applyProfile(local);

    // Then load Firestore for cross-device profile (bio, username, social links, etc.)
    if (user && firebaseConfigured) {
      dbProfileStore.get(getDB(), user.uid).then(cloud => {
        if (cloud && (cloud.name || cloud.username || cloud.bio)) {
          profileStore.set({ ...local, ...cloud }); // cache locally
          applyProfile(local, cloud);
        }
      }).catch(() => {});
    }
  }, [user, loading]);

  const minhaLista = useMemo(() => listStore.get('want').concat(listStore.get('watching')), []);
  const favoritos = useMemo(() => listStore.get('favorites'), []);

  const toTMDBItem = (x: { id: number; title: string; type: string; poster_path?: string | null }): TMDBItem => ({
    id: x.id, title: x.title, name: x.title,
    media_type: x.type, poster_path: x.poster_path || null,
    backdrop_path: null, overview: '', vote_average: 0,
    release_date: '', first_air_date: '', popularity: 0,
  } as TMDBItem);

  /* ── VIP + real stats ── */
  const [isVip, setIsVip] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [realStats, setRealStats] = useState<{
    totalHours: number;
    moviesCount: number;
    tvCount: number;
    genres: Array<{ g: string; pct: number; color: string }>;
    platforms: Array<{ s: string; pct: number }>;
  } | null>(null);

  useEffect(() => {
    setIsVip(localStorage.getItem('sec_vip_v1') === 'true');
  }, []);

  const GENRE_COLORS: Record<string, string> = {
    'Drama': '#E050C8', 'Ação': '#FF6B2B', 'Action': '#FF6B2B',
    'Comédia': '#F5C518', 'Comedy': '#F5C518',
    'Ficção científica': '#3b82f6', 'Ficção Científica': '#3b82f6',
    'Science Fiction': '#3b82f6', 'Sci-Fi': '#3b82f6',
    'Terror': '#8b5cf6', 'Horror': '#8b5cf6',
    'Romance': '#ec4899', 'Thriller': '#ef4444',
    'Documentário': '#10b981', 'Documentary': '#10b981',
    'Animação': '#f97316', 'Animation': '#f97316',
    'Crime': '#6366f1', 'Aventura': '#06b6d4', 'Adventure': '#06b6d4',
    'Família': '#f59e0b', 'Family': '#f59e0b',
    'Mistério': '#7c3aed', 'Mystery': '#7c3aed',
    'Western': '#a16207', 'Guerra': '#dc2626', 'War': '#dc2626',
  };

  useEffect(() => {
    if (!isVip) return;
    const watched = listStore.get('watched');
    if (watched.length === 0) {
      setRealStats({ totalHours: 0, moviesCount: 0, tvCount: 0, genres: [], platforms: [] });
      return;
    }
    setStatsLoading(true);
    const toFetch = watched.slice(0, 20);

    Promise.all(
      toFetch.map(async (item) => {
        try {
          const ep = item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
          const res = await fetch(`/api/tmdb?endpoint=${ep}`);
          return await res.json();
        } catch { return null; }
      })
    ).then((results) => {
      let totalMinutes = 0;
      let moviesCount = 0;
      let tvCount = 0;
      const genreCount: Record<string, number> = {};

      results.forEach((d, i) => {
        if (!d) return;
        const item = toFetch[i];
        (d.genres || []).forEach((g: { name: string }) => {
          genreCount[g.name] = (genreCount[g.name] || 0) + 1;
        });
        if (item.type === 'movie') {
          moviesCount++;
          totalMinutes += d.runtime || 110;
        } else {
          tvCount++;
          const epRuntime = d.episode_run_time?.[0] || 45;
          const epCount   = Math.min(d.number_of_episodes || 10, 24);
          totalMinutes   += epRuntime * epCount;
        }
      });

      const totalGenreCount = Math.max(Object.values(genreCount).reduce((a, b) => a + b, 0), 1);
      const genres = Object.entries(genreCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({
          g: name,
          pct: Math.round((count / totalGenreCount) * 100),
          color: GENRE_COLORS[name] || '#6b7280',
        }));

      const userStreams = prefsStore.get()?.streams ?? [];
      const total = userStreams.length || 1;
      const platforms = userStreams.slice(0, 5).map((s, i) => ({
        s,
        pct: Math.max(5, Math.round((100 / total) * Math.pow(0.78, i))),
      }));

      setRealStats({ totalHours: Math.round(totalMinutes / 60), moviesCount, tvCount, genres, platforms });
      setStatsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVip]);

  // Show skeleton while auth is still resolving
  if (loading || !profile) {
    return (
      <Frame>
        <Screen>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 32 }}>
            <div style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--c-glass-bg)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: 140, height: 16, borderRadius: 8, background: 'var(--c-glass-bg)' }} />
            <div style={{ width: 100, height: 12, borderRadius: 6, background: 'var(--c-input-bg)' }} />
          </div>
        </Screen>
      </Frame>
    );
  }

  return (
    <Frame>
      <Screen>
        <ScrollArea>

          {/* ── Backdrop header ── */}
          <div style={{ position: 'relative', overflow: 'hidden', background: profile.coverImage ? `url(${profile.coverImage}) center/cover no-repeat` : 'linear-gradient(160deg,#2a1a3a 0%,#1a1a2a 60%,#0a0a1a 100%)' }}>
            {/* Glow blobs — only when no cover image */}
            {!profile.coverImage && <>
              <div style={{ position: 'absolute', top: -20, right: -10, width: 200, height: 200, borderRadius: 100, background: 'rgba(240,80,194,0.18)', filter: 'blur(50px)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: 0, left: -20, width: 160, height: 160, borderRadius: 80, background: 'rgba(80,120,240,0.14)', filter: 'blur(40px)', pointerEvents: 'none' }} />
            </>}
            {/* Gradient overlay when cover image exists */}
            {profile.coverImage && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)' }} />}

            {/* Report + Settings side by side (top-right) */}
            <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 10 }}>
              <button title="Reportar usuário" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name="flag" size={16} color="#fff" />
              </button>
              <button onClick={() => router.push('/settings')} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name="settings" size={18} color="#fff" />
              </button>
            </div>

            {/* ── Conteúdo centrado na capa ── */}
            <div style={{ position: 'relative', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 52, paddingBottom: 28, gap: 10 }}>
              {/* Avatar */}
              <div style={{ width: 88, height: 88, borderRadius: 44, background: profile.avatarImage ? `url(${profile.avatarImage}) center/cover no-repeat` : profile.avatarGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)', overflow: 'hidden', flexShrink: 0 }}>
                {!profile.avatarImage && <Txt size={32} weight={900} color={T.white}>{profile.name?.[0]?.toUpperCase() || 'U'}</Txt>}
              </div>

              {/* Nome + VIP lado a lado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <Txt size={20} weight={800} color={T.white} style={{ display: 'block', textAlign: 'center', lineHeight: 1.2 }}>{profile.name}</Txt>
                <VIPBadge />
              </div>

              {/* @ + redes sociais */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Txt size={12} color="rgba(255,255,255,0.6)">@{profile.username}</Txt>
                {profile.social.instagram && (
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: '#e1306c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="share" size={9} color={T.white} />
                  </div>
                )}
                {profile.social.twitter && (
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: '#1d9bf0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="share" size={9} color={T.white} />
                  </div>
                )}
                {profile.social.letterboxd && (
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: '#00c030', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="film" size={9} color={T.white} />
                  </div>
                )}
              </div>

              {/* Bio */}
              {profile.bio && (
                <Txt size={12} color="rgba(255,255,255,0.55)" style={{ display: 'block', textAlign: 'center', maxWidth: 260, lineHeight: 1.4 }}>{profile.bio}</Txt>
              )}
            </div>
          </div>

          {/* ── Real stats ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', margin: '20px 16px 24px', borderRadius: T.radiusSm, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            {[
              [stats.watched, 'Títulos\nassistidos'],
              [stats.watching, 'Títulos\nmaratonar'],
              [stats.want, 'Títulos\npara assistir'],
              [stats.reviews, 'Avaliações'],
            ].map(([v, l], i) => (
              <div key={i} style={{ padding: '14px 6px', textAlign: 'center', background: T.card, borderRight: i < 3 ? `1px solid ${T.border}` : 'none' }}>
                <Txt size={20} weight={800} color={T.t1} style={{ display: 'block' }}>
                  {String(v || 0)}
                </Txt>
                <Txt size={9} color={T.t3} weight={600} style={{ display: 'block', marginTop: 3, lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                  {String(l)}
                </Txt>
              </div>
            ))}
          </div>

          {/* ── Minha lista — horizontal scroll ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 16, marginBottom: 14 }}>
              <Txt size={20} weight={800}>Minha lista</Txt>
              <button onClick={() => router.push('/lists')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Txt size={12} color={T.pink} weight={600}>Ver tudo</Txt>
              </button>
            </div>
            {minhaLista.length > 0 ? (
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingLeft: 20, paddingBottom: 4, scrollSnapType: 'x mandatory', scrollPaddingLeft: 20 } as React.CSSProperties}>
                {minhaLista.slice(0, 10).map((x) => (
                  <div key={x.id} style={{ flexShrink: 0, scrollSnapAlign: 'start' }}>
                    <TMDBPosterCard item={toTMDBItem(x)} size="lg" onClick={() => router.push(`/title/${x.type}/${x.id}`)} />
                  </div>
                ))}
                <div style={{ width: 20, flexShrink: 0 }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, paddingLeft: 20 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 160, height: 238, borderRadius: 12, background: T.card, border: `1px solid ${T.border}`, flexShrink: 0 }} />
                ))}
              </div>
            )}
          </div>

          {/* ── Favoritos (from heart button in title page) — horizontal scroll ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 16, marginBottom: 14 }}>
              <Txt size={20} weight={800}>Favoritos</Txt>
              <button onClick={() => router.push('/lists')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Txt size={12} color={T.pink} weight={600}>Ver tudo</Txt>
              </button>
            </div>
            {favoritos.length > 0 ? (
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingLeft: 20, paddingBottom: 4, scrollSnapType: 'x mandatory', scrollPaddingLeft: 20 } as React.CSSProperties}>
                {favoritos.slice(0, 10).map((x) => (
                  <div key={x.id} style={{ flexShrink: 0, scrollSnapAlign: 'start' }}>
                    <TMDBPosterCard item={toTMDBItem(x)} size="lg" onClick={() => router.push(`/title/${x.type}/${x.id}`)} />
                  </div>
                ))}
                <div style={{ width: 20, flexShrink: 0 }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, paddingLeft: 20 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 160, height: 238, borderRadius: 12, background: T.card, border: `1px solid ${T.border}`, flexShrink: 0 }} />
                ))}
              </div>
            )}
          </div>

          {/* ── Stats / Avaliações tabs ── */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
            {(['estatísticas', 'avaliações'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '9px 20px', borderRadius: 24, flexShrink: 0,
                background: tab === t ? T.pink : 'transparent',
                border: tab === t ? 'none' : `1px solid ${T.border}`,
                color: tab === t ? '#fff' : T.t2,
                fontSize: 13, fontWeight: 700,
                fontFamily: "'Area','Inter',sans-serif",
                cursor: 'pointer', transition: 'all 0.2s',
                textTransform: 'capitalize',
              }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ padding: 16 }}>
            {tab === 'estatísticas' && (
              <div style={{ position: 'relative' }}>

                {/* ── Conteúdo (blur se não for VIP) ── */}
                <div style={{ filter: isVip ? 'none' : 'blur(6px)', pointerEvents: isVip ? 'auto' : 'none', userSelect: isVip ? 'auto' : 'none' }}>

                  {/* Horas assistidas */}
                  <div style={{ padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                    <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Horas assistidas</Txt>
                    {statsLoading ? (
                      <div style={{ height: 40, background: T.surface2, borderRadius: 8, marginBottom: 16 }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                        <Txt size={40} weight={800} color={T.pink}>{realStats?.totalHours ?? 0}</Txt>
                        <Txt size={14} color={T.t3}>horas assistidas</Txt>
                      </div>
                    )}
                    {/* Filmes vs Séries */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                      {[
                        { label: 'Filmes', count: realStats?.moviesCount ?? 0, color: T.pink },
                        { label: 'Séries', count: realStats?.tvCount ?? 0, color: '#6366f1' },
                      ].map(({ label, count, color }) => (
                        <div key={label} style={{ flex: 1, padding: '10px 12px', background: T.surface2, borderRadius: 12 }}>
                          <Txt size={22} weight={800} color={color} style={{ display: 'block' }}>{count}</Txt>
                          <Txt size={11} color={T.t3}>{label} concluídos</Txt>
                        </div>
                      ))}
                    </div>
                    {/* Distribuição filmes vs séries */}
                    {(realStats?.moviesCount || 0) + (realStats?.tvCount || 0) > 0 && (() => {
                      const total = (realStats?.moviesCount ?? 0) + (realStats?.tvCount ?? 0);
                      const moviePct = Math.round(((realStats?.moviesCount ?? 0) / total) * 100);
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Txt size={10} color={T.t3}>Filmes</Txt>
                            <Txt size={10} color={T.t3}>Séries</Txt>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: '#6366f1', overflow: 'hidden' }}>
                            <div style={{ width: `${moviePct}%`, height: '100%', background: T.pink, borderRadius: '4px 0 0 4px' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            <Txt size={10} color={T.pink} weight={700}>{moviePct}%</Txt>
                            <Txt size={10} color="#6366f1" weight={700}>{100 - moviePct}%</Txt>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Gêneros favoritos */}
                  <div style={{ padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                    <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Gêneros favoritos</Txt>
                    {statsLoading
                      ? Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} style={{ marginBottom: 10 }}>
                            <div style={{ height: 12, width: '60%', borderRadius: 6, background: T.surface2, marginBottom: 6 }} />
                            <div style={{ height: 6, borderRadius: 3, background: T.surface2 }} />
                          </div>
                        ))
                      : realStats?.genres.length
                        ? realStats.genres.map(({ g, pct, color }) => (
                            <div key={g} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Txt size={12} weight={600}>{g}</Txt>
                                <Txt size={12} color={T.t3}>{pct}%</Txt>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: T.surface2, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color }} />
                              </div>
                            </div>
                          ))
                        : <Txt size={12} color={T.t3}>Nenhum título assistido ainda.</Txt>
                    }
                  </div>

                  {/* Plataformas */}
                  <div style={{ padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                    <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Suas plataformas</Txt>
                    {realStats?.platforms.length
                      ? realStats.platforms.map(({ s, pct }) => (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <Txt size={12} style={{ width: 80 }}>{s}</Txt>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: T.surface2, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${T.pink},#c030a0)` }} />
                            </div>
                          </div>
                        ))
                      : <Txt size={12} color={T.t3}>Configure suas plataformas nas configurações.</Txt>
                    }
                  </div>
                </div>

                {/* ── VIP gate overlay ── */}
                {!isVip && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 12, padding: '0 32px', textAlign: 'center',
                  }}>
                    <div style={{ width: 56, height: 56, borderRadius: 28, background: `linear-gradient(135deg,${T.gold},#e0a800)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(245,197,24,0.4)' }}>
                      <Icon name="crown" size={26} color="#fff" />
                    </div>
                    <Txt size={18} weight={800} color={T.t1} style={{ display: 'block' }}>Estatísticas VIP</Txt>
                    <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.6 }}>
                      Veja seus gêneros favoritos, horas reais assistidas e plataformas mais usadas.
                    </Txt>
                    <button
                      onClick={() => router.push('/vip')}
                      style={{
                        marginTop: 4, padding: '12px 28px', borderRadius: 24,
                        background: `linear-gradient(135deg,${T.gold},#e0a800)`,
                        border: 'none', cursor: 'pointer',
                        fontFamily: "'Area','Inter',sans-serif", fontWeight: 700, fontSize: 14, color: '#fff',
                      }}>
                      Assinar VIP
                    </button>
                  </div>
                )}
              </div>
            )}
            {tab === 'avaliações' && (
              <Txt size={13} color={T.t3} style={{ display: 'block', textAlign: 'center', padding: '40px 0' }}>
                {stats.reviews > 0 ? `Você fez ${stats.reviews} avaliação${stats.reviews > 1 ? 'ões' : ''}.` : 'Suas avaliações aparecerão aqui.'}
              </Txt>
            )}
          </div>

          {/* CTAs */}
          <div onClick={() => router.push('/vip')} style={{ margin: '0 16px 12px', padding: 16, background: `linear-gradient(135deg,rgba(245,197,24,0.1),rgba(245,197,24,0.05))`, borderRadius: T.radiusSm, border: `1px solid rgba(245,197,24,0.2)`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="crown" size={28} color={T.gold} />
            <div style={{ flex: 1 }}>
              <Txt size={14} weight={700} color={T.gold} style={{ display: 'block' }}>Seja VIP</Txt>
              <Txt size={11} color={T.t3}>Estatísticas avançadas, alertas e muito mais</Txt>
            </div>
            <Icon name="chevronR" size={16} color={T.gold} />
          </div>
          <div onClick={() => router.push('/expenses')} style={{ margin: '0 16px 16px', padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="play" size={22} color={T.pink} />
            <div style={{ flex: 1 }}>
              <Txt size={14} weight={700} style={{ display: 'block' }}>Gastos de streaming</Txt>
              <Txt size={11} color={T.t3}>Calcule quanto você gasta por mês</Txt>
            </div>
            <Icon name="chevronR" size={16} color={T.t3} />
          </div>

          <div style={{ height: 90 }} />
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { ImgWithSkeleton } from '@/components/posters';
import { listStore, revStore, profileStore, prefsStore, type Profile } from '@/lib/store';
import { type TMDBItem } from '@/lib/tmdb';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore } from '@/lib/db';
import { useTheme } from '@/context/ThemeContext';

function tmdbImg(poster_path: string | null | undefined, size: string): string | null {
  if (!poster_path) return null;
  return `https://image.tmdb.org/t/p/${size}${poster_path}`;
}

const COLLAGE_SLOTS: Array<{ left?: number; right?: number; top: number; rotate: number; width: number }> = [
  { left:  -18, top:  8,  rotate: -20, width: 115 },
  { left:   72, top: -18, rotate:  -8, width: 108 },
  { left:  158, top:  12, rotate:   6, width: 118 },
  { left:  255, top: -12, rotate:  16, width: 110 },
  { right: -20, top:  20, rotate:  24, width: 108 },
  { left:   30, top:  90, rotate: -12, width: 100 },
];

export default function ProfilePage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { user, loading } = useAuth();
  const [stats, setStats] = useState({ watched: 0, watching: 0, want: 0, reviews: 0 });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [socialSheet,      setSocialSheet]      = useState<'followers' | 'following' | null>(null);
  const [followingNames,   setFollowingNames]   = useState<string[]>([]);
  const [realFollowers,    setRealFollowers]     = useState<number | null>(null);

  useEffect(() => {
    try {
      const list: string[] = JSON.parse(localStorage.getItem('sec_following') || '[]');
      setFollowingNames(list);
    } catch {}
  }, []);

  useEffect(() => {
    if (!profile) return;
    const uname = profile.username || profile.name || '';
    if (!uname) return;
    const count = Number(localStorage.getItem(`sec_followers_${uname}`) || '0');
    setRealFollowers(count > 0 ? count : null);
  }, [profile]);

  useEffect(() => {
    if (loading) return;

    setStats({
      watched:  listStore.get('watched').length,
      watching: listStore.get('watching').length,
      want:     listStore.get('want').length,
      reviews:  revStore.countAll(),
    });

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
  }, [user, loading]);

  const minhaLista  = useMemo(() => listStore.get('want'),      []);
  const assistindo  = useMemo(() => listStore.get('watching'),  []);
  const concluidos  = useMemo(() => listStore.get('watched'),   []);
  const favoritos   = useMemo(() => listStore.get('favorites'), []);

  const toTMDBItem = (x: { id: number; title: string; type: string; poster_path?: string | null }): TMDBItem => ({
    id: x.id, title: x.title, name: x.title,
    media_type: x.type, poster_path: x.poster_path || null,
    backdrop_path: null, overview: '', vote_average: 0,
    release_date: '', first_air_date: '', popularity: 0,
  } as TMDBItem);

  const isVip = !!user;
  const [statsLoading, setStatsLoading] = useState(false);
  const [realStats, setRealStats] = useState<{
    totalHours: number;
    moviesCount: number;
    tvCount: number;
    genres: Array<{ g: string; pct: number; color: string }>;
    platforms: Array<{ s: string; pct: number }>;
  } | null>(null);

  const GENRE_COLORS: Record<string, string> = {
    'Drama': '#C069FF', 'Ação': '#FF6B2B', 'Action': '#FF6B2B',
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
          totalMinutes += (d.episode_run_time?.[0] || 45) * Math.min(d.number_of_episodes || 10, 24);
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
  }, [user]);

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

  const collageSources = [...favoritos, ...minhaLista];
  const collagePosterItems = collageSources.filter(x => !!x.poster_path).slice(0, 6);
  const topPct = stats.watched > 0 ? Math.max(1, Math.round(100 / (stats.watched + 1))) : null;

  return (
    <Frame>
      <Screen>
        <ScrollArea>

          {/* ── Capa com collage ── */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative', height: 180, overflow: 'hidden', background: 'linear-gradient(160deg,#1a0d2e 0%,#0d0d1a 60%,#0a0a14 100%)' }}>
              {collagePosterItems.map((item, idx) => {
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
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.50) 65%, rgba(13,13,15,1) 100%)', zIndex: 2 }} />
              <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 10 }}>
                <button title="Reportar usuário" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="flag" size={16} color="#fff" />
                </button>
                <button onClick={() => router.push('/settings')} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="settings" size={18} color="#fff" />
                </button>
              </div>
            </div>

            {/* ── Avatar + Nome — sobreposição na capa ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 16px 8px', marginTop: isDark ? -48 : -20, position: 'relative', zIndex: 20 }}>
              {/* Avatar */}
              <div style={{
                width: 88, height: 88, borderRadius: 44, flexShrink: 0,
                background: profile.avatarImage ? `url(${profile.avatarImage}) center/cover no-repeat` : (profile.avatarGradient || 'linear-gradient(135deg,#C069FF,#6B10A0)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '3px solid var(--c-bg)',
                boxShadow: '0 0 0 2px #C069FF, 0 8px 28px rgba(0,0,0,0.7)',
                overflow: 'hidden',
              }}>
                {!profile.avatarImage && <Txt size={32} weight={900} color={T.white}>{profile.name?.[0]?.toUpperCase() || 'U'}</Txt>}
              </div>

              {/* Nome + username */}
              <div style={{ paddingBottom: 6, flex: 1, minWidth: 0 }}>
                <Txt size={24} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.name}
                </Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block' }}>
                  @{profile.username}
                </Txt>
              </div>
            </div>
          </div>

          {/* ── Bio ── */}
          {profile.bio && (
            <div style={{ padding: '18px 16px 0' }}>
              <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.6 }}>
                {profile.bio}
              </Txt>
            </div>
          )}

          {/* ── Seguindo / Seguidores ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '28px 16px 0' }}>
            <button
              onClick={() => setSocialSheet('following')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6, padding: 0 }}>
              <Txt size={14} weight={900} color={T.t1}>{followingNames.length}</Txt>
              <Txt size={11} weight={600} color={T.t3} style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}>Seguindo</Txt>
            </button>
            <div style={{ width: 1, height: 14, background: T.border, margin: '0 6px' }} />
            <button
              onClick={() => setSocialSheet('followers')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6, padding: 0 }}>
              <Txt size={14} weight={900} color={T.t1}>{realFollowers ?? profile.followers ?? 0}</Txt>
              <Txt size={11} weight={600} color={T.t3} style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}>Seguidores</Txt>
            </button>
          </div>

          {/* ── Boxes de stats ── */}
          <div style={{ display: 'flex', gap: 12, padding: '28px 16px 0' }}>
            {[
              { value: `${realStats?.totalHours ?? 0}h`, label: 'assistidas', icon: 'clock' as const },
              { value: String(stats.reviews),              label: 'avaliações',   icon: 'star'  as const },
              ...(topPct !== null ? [{ value: `Top ${topPct}%`, label: 'ranking', icon: 'award' as const }] : []),
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
            onSeeAll={() => router.push('/lists')}
          />

          {/* ── Listas ── */}
          <div style={{ margin: '16px 16px 0' }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px' }}>
                <Txt size={16} weight={800}>Minhas listas</Txt>
                <button onClick={() => router.push('/lists')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Txt size={12} color={T.pink} weight={600}>Ver tudo</Txt>
                </button>
              </div>

              {/* Quero ver */}
              <ListSection
                label="Quero ver"
                icon="bookmark"
                items={minhaLista}
                onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
              />

              {/* Assistindo */}
              <ListSection
                label="Assistindo"
                icon="play"
                items={assistindo}
                onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
              />

              {/* Concluídos */}
              <ListSection
                label="Concluídos"
                icon="check"
                items={concluidos}
                onItem={(x) => router.push(`/title/${x.type}/${x.id}`)}
                last
              />
            </div>
          </div>

          {/* ── Grid 2 colunas: Estatísticas + Streaming ── */}
          {(() => {
            const PLATFORM_COLORS: Record<string, string> = {
              'Netflix': '#E50914', 'Disney+': '#113CCF', 'Max': '#002BE7',
              'Prime Video': '#00A8E0', 'Globoplay': '#E8441C', 'Paramount+': '#0064FF',
              'Apple TV+': '#555', 'Crunchyroll': '#FF6600',
            };
            type Sub = { name: string; color: string; price: number; active: boolean };
            const activeSubs: Sub[] = (() => {
              try { return (JSON.parse(localStorage.getItem('sec_expenses_v1') || '[]') as Sub[]).filter(s => s.active !== false); }
              catch { return []; }
            })();
            const userPlatforms = activeSubs.slice(0, 6);
            const genres = realStats?.genres ?? [];
            const totalItems = (realStats?.moviesCount ?? 0) + (realStats?.tvCount ?? 0);

            return (
              <div style={{ margin: '16px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                {/* Bloco 1 — Estatísticas */}
                <button
                  onClick={() => router.push('/stats')}
                  style={{ background: 'linear-gradient(145deg, #1c1c1e 0%, #111113 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, cursor: 'pointer', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', minHeight: 170, position: 'relative', overflow: 'hidden', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}>

                  <div>
                    <Txt size={14} weight={800} color="#fff" style={{ display: 'block' }}>Estatísticas</Txt>
                    <Txt size={11} color="rgba(255,255,255,0.38)">
                      {realStats ? `${realStats.totalHours}h · ${totalItems} títulos` : '—'}
                    </Txt>
                  </div>

                  {/* Donut séries vs filmes */}
                  {(() => {
                    const tv  = realStats?.tvCount    ?? 0;
                    const mv  = realStats?.moviesCount ?? 0;
                    const total = tv + mv || 1;
                    const tvPct = tv / total;
                    const r = 26, cx = 34, cy = 34, circ = 2 * Math.PI * r;
                    const tvLen = circ * tvPct;
                    const mvLen = circ * (1 - tvPct);
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        <svg width={68} height={68} viewBox="0 0 68 68" style={{ flexShrink: 0 }}>
                          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={9} />
                          {tv > 0 && (
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#C069FF" strokeWidth={9}
                              strokeDasharray={`${tvLen} ${circ}`} strokeDashoffset={circ / 4}
                              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` } as React.CSSProperties} />
                          )}
                          {mv > 0 && (
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FF6B2B" strokeWidth={9}
                              strokeDasharray={`${mvLen} ${circ}`} strokeDashoffset={circ / 4 - tvLen}
                              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` } as React.CSSProperties} />
                          )}
                          <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={800} fontFamily="'Area','Inter',sans-serif">{total}</text>
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 7, height: 7, borderRadius: 2, background: '#C069FF', flexShrink: 0 }} />
                            <Txt size={10} color="rgba(255,255,255,0.55)">{tv} séries</Txt>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 7, height: 7, borderRadius: 2, background: '#FF6B2B', flexShrink: 0 }} />
                            <Txt size={10} color="rgba(255,255,255,0.55)">{mv} filmes</Txt>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Txt size={11} weight={700} color={T.pink}>Ver mais</Txt>
                    <Icon name="chevronR" size={11} color={T.pink} />
                  </div>
                </button>

                {/* Bloco 2 — Gastos de streaming */}
                <button
                  onClick={() => router.push('/expenses')}
                  style={{ background: 'linear-gradient(145deg, #1c1c1e 0%, #111113 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, cursor: 'pointer', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', minHeight: 170, position: 'relative', overflow: 'hidden', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}>

                  <div>
                    <Txt size={14} weight={800} color="#fff" style={{ display: 'block' }}>Streaming</Txt>
                    <Txt size={11} color="rgba(255,255,255,0.38)">Gastos mensais</Txt>
                  </div>

                  {/* Ícones das plataformas */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {userPlatforms.length > 0
                      ? userPlatforms.map((p) => (
                          <div key={p.name} style={{ width: 30, height: 30, borderRadius: 9, background: p.color ?? 'rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Txt size={10} weight={800} color="#fff">{p.name.slice(0, 1)}</Txt>
                          </div>
                        ))
                      : <Txt size={11} color="rgba(255,255,255,0.28)">Nenhum gasto adicionado</Txt>
                    }
                  </div>

                  {/* Barra segmentada por plataforma */}
                  <div style={{ height: 6, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 2 }}>
                    {userPlatforms.length > 0
                      ? userPlatforms.map((p) => (
                          <div key={p.name} style={{ height: '100%', flex: 1, background: p.color ?? 'rgba(255,255,255,0.15)' }} />
                        ))
                      : <div style={{ height: '100%', width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 4 }} />
                    }
                  </div>

                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Txt size={11} weight={700} color={T.pink}>Ver tudo</Txt>
                    <Icon name="chevronR" size={11} color={T.pink} />
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
              {/* Handle + header */}
              <div style={{ padding: '12px 16px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, position: 'relative' }}>
                <div style={{ width: 36, height: 4, background: T.t4, borderRadius: 2, margin: '0 auto 12px' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt size={15} weight={700}>{socialSheet === 'followers' ? 'Seguidores' : 'Seguindo'}</Txt>
                  <button onClick={() => setSocialSheet(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Icon name="close" size={18} color={T.t3} />
                  </button>
                </div>
              </div>

              {/* Tab switcher */}
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
                    {tab === 'followers' ? `Seguidores · ${realFollowers ?? profile?.followers ?? 0}` : `Seguindo · ${followingNames.length}`}
                  </button>
                ))}
              </div>

              {/* Conteúdo */}
              <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                {socialSheet === 'following' && followingNames.length > 0 ? (
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
                      {socialSheet === 'followers' ? 'Nenhum seguidor ainda' : 'Você não está seguindo ninguém'}
                    </Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5 }}>
                      {socialSheet === 'followers'
                        ? 'Quando alguém te seguir, aparecerá aqui.'
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

/* ── Compact list section row inside Minhas listas card ── */
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

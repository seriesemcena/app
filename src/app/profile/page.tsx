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
  const { user, loading } = useAuth();
  const [stats, setStats] = useState({ watched: 0, watching: 0, want: 0, reviews: 0 });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [socialSheet, setSocialSheet] = useState<'followers' | 'following' | null>(null);

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
          avatarImage:  merged.avatarImage  || user.photoURL || '',
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
            <div style={{ position: 'relative', height: 221, overflow: 'hidden', background: 'linear-gradient(160deg,#1a0d2e 0%,#0d0d1a 60%,#0a0a14 100%)' }}>
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
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 60%, rgba(13,13,15,1) 100%)', zIndex: 2 }} />
              <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 10 }}>
                <button title="Reportar usuário" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="flag" size={16} color="#fff" />
                </button>
                <button onClick={() => router.push('/settings')} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="settings" size={18} color="#fff" />
                </button>
              </div>
            </div>

            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -52, position: 'relative', zIndex: 20 }}>
              <div style={{
                width: 100, height: 100, borderRadius: 50,
                background: profile.avatarImage ? `url(${profile.avatarImage}) center/cover no-repeat` : profile.avatarGradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '3.5px solid #C069FF',
                boxShadow: '0 0 0 4px rgba(192,105,255,0.20), 0 8px 32px rgba(0,0,0,0.7)',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {!profile.avatarImage && <Txt size={36} weight={900} color={T.white}>{profile.name?.[0]?.toUpperCase() || 'U'}</Txt>}
              </div>
            </div>
          </div>

          {/* ── Info ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 16px 0', gap: 5 }}>
            <Txt size={28} weight={900} color={T.white} style={{ display: 'block', textAlign: 'center', letterSpacing: '-0.5px' }}>
              {profile.name}
            </Txt>
            <Txt size={13} color="rgba(255,255,255,0.45)" style={{ display: 'block', textAlign: 'center' }}>
              @{profile.username}
            </Txt>
            {profile.bio && (
              <Txt size={13} color="rgba(255,255,255,0.55)" style={{ display: 'block', textAlign: 'center', maxWidth: 280, lineHeight: 1.45, marginTop: 2 }}>
                {profile.bio}
              </Txt>
            )}

            {/* ── Seguidores / Seguindo — fora do box, clicáveis ── */}
            <div style={{ display: 'flex', gap: 28, marginTop: 16, justifyContent: 'center' }}>
              {[
                { value: profile.followers ?? 0, label: 'seguidores', key: 'followers' },
                { value: profile.following ?? 0, label: 'seguindo',   key: 'following' },
              ].map(({ value, label, key }) => (
                <button key={key} onClick={() => setSocialSheet(key as 'followers' | 'following')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 0 }}>
                  <Txt size={17} weight={800} color={T.white}>{String(value)}</Txt>
                  <Txt size={11} weight={500} color="rgba(255,255,255,0.50)">{label}</Txt>
                </button>
              ))}
            </div>

            {/* ── h assistidas + avaliações + ranking — em box ── */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
              {[
                { value: realStats?.totalHours ?? 0, label: 'h assistidas' },
                { value: stats.reviews,              label: 'avaliações'   },
                ...(topPct !== null ? [{ value: `Top ${topPct}%`, label: 'ranking' }] : []),
              ].map(({ value, label }) => (
                <div key={label} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 18px', borderRadius: 24,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  minWidth: 80,
                }}>
                  <Txt size={15} weight={800} color={T.white}>{String(value)}</Txt>
                  <Txt size={10} weight={600} color="rgba(255,255,255,0.50)">{label}</Txt>
                </div>
              ))}
            </div>

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

          {/* ── Banner Estatísticas ── */}
          <div style={{ margin: '16px 16px 0' }}>
            <button onClick={() => router.push('/stats')} style={{
              width: '100%', padding: 0, border: 'none', cursor: 'pointer', borderRadius: 18, overflow: 'hidden',
              background: 'linear-gradient(135deg, #1a0d2e 0%, #0d1a2e 100%)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Top row — headline */}
              <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(192,105,255,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="star" size={16} color={T.pink} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <Txt size={14} weight={800} color={T.white} style={{ display: 'block' }}>Estatísticas</Txt>
                    <Txt size={11} color="rgba(255,255,255,0.40)">Seu histórico detalhado</Txt>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Txt size={11} weight={700} color={T.pink}>Ver tudo</Txt>
                  <Icon name="chevronR" size={13} color={T.pink} />
                </div>
              </div>
              {/* Bottom row — key numbers */}
              <div style={{ display: 'flex', padding: '12px 16px 16px', gap: 0 }}>
                {[
                  { value: realStats?.totalHours ?? 0, label: 'h assistidas',    color: T.pink   },
                  { value: realStats?.moviesCount ?? 0, label: 'filmes',          color: '#60a5fa' },
                  { value: realStats?.tvCount     ?? 0, label: 'séries',          color: '#a78bfa' },
                  { value: stats.reviews,               label: 'avaliações',      color: '#4ade80' },
                ].map(({ value, label, color }, i, arr) => (
                  <div key={label} style={{ flex: 1, textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    <Txt size={20} weight={800} color={color} style={{ display: 'block' }}>{String(value)}</Txt>
                    <Txt size={9}  weight={600} color="rgba(255,255,255,0.40)">{label}</Txt>
                  </div>
                ))}
              </div>
            </button>
          </div>

          {/* CTA gastos */}
          <div onClick={() => router.push('/expenses')} style={{ margin: '16px 16px 0', padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="play" size={22} color={T.pink} />
            <div style={{ flex: 1 }}>
              <Txt size={14} weight={700} style={{ display: 'block' }}>Gastos de streaming</Txt>
              <Txt size={11} color={T.t3}>Calcule quanto você gasta por mês</Txt>
            </div>
            <Icon name="chevronR" size={16} color={T.t3} />
          </div>

          <div style={{ height: 90 }} />
        </ScrollArea>

        {/* ── Bottom sheet: seguidores / seguindo ── */}
        {socialSheet && (
          <>
            <div onClick={() => setSocialSheet(null)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.60)', zIndex: 40 }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
              background: T.surface, borderRadius: '20px 20px 0 0',
              maxHeight: '70%', display: 'flex', flexDirection: 'column',
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
                    {tab === 'followers' ? `Seguidores · ${profile?.followers ?? 0}` : `Seguindo · ${profile?.following ?? 0}`}
                  </button>
                ))}
              </div>

              {/* Empty state */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
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

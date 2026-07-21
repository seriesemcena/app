'use client';
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, MetaChip, Skeleton, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { ActorCircle, TMDBPosterCard } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, tmdbImg, type TMDBItem } from '@/lib/tmdb';
import { navigateBack } from '@/lib/navigation';
import { AppErrorState } from '@/components/AppStates';

const BIO_LIMIT = 180;

export default function ActorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const personId = params.id;

  const { data, loading, error, retry } = useTMDB<any>(() => tmdb.personDetail(personId), [personId]);
  const person = data || {};
  const movieCredits = ((person.movie_credits?.cast || []) as any[]).sort((a, b) => b.popularity - a.popularity).slice(0, 20);
  const tvCredits = ((person.tv_credits?.cast || []) as any[]).sort((a, b) => b.popularity - a.popularity).slice(0, 20);
  const directed = [...(person.movie_credits?.crew || []), ...(person.tv_credits?.crew || [])]
    .filter((c: any) => ['Director', 'Creator', 'Executive Producer'].includes(c.job))
    .sort((a: any, b: any) => b.popularity - a.popularity).slice(0, 12);

  const [tab, setTab] = useState<'filmes' | 'séries' | 'direção'>('filmes');
  const [bioExpanded, setBioExpanded] = useState(false);
  const photo = person.profile_path ? tmdbImg(person.profile_path, 'w342') : null;
  const knownFor = [...movieCredits, ...tvCredits].sort((a: any, b: any) => b.vote_average - a.vote_average).slice(0, 4);

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  };

  type Tab = 'filmes' | 'séries' | 'direção';
  const tabs: Tab[] = ['filmes', 'séries', ...(directed.length ? (['direção'] as Tab[]) : [])];

  const bioText = String(person.biography || '');
  const bioTruncated = bioText.length > BIO_LIMIT;

  return (
    <Frame>
      <Screen>
        <div style={{ position: 'absolute', top: 'calc(var(--safe-area-top) + 12px)', left: 12, zIndex: 30 }}>
          <button onClick={() => navigateBack(router)} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
            <Icon name="chevronL" size={18} color={T.white} />
          </button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Skeleton w={100} h={100} radius={50} />
              <Skeleton w={160} h={20} />
              <Skeleton w={120} h={14} />
            </div>
          </div>
        ) : error || !data ? (
          <AppErrorState
            title="Não foi possível carregar esta pessoa"
            message="Confira sua conexão e tente novamente."
            onRetry={retry}
          />
        ) : (
          <ScrollArea>
            <div style={{ height: 260, position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#2a1a2a,#1a1a2a)' }}>
              {photo && (
                <>
                  <img src={photo} alt={person.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px)', transform: 'scale(1.1)', opacity: 0.35 }} />
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom,transparent 30%,${T.bg} 100%)` }} />
                </>
              )}
              <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
                {photo ? (
                  <div style={{ width: 108, height: 108, borderRadius: 54, overflow: 'hidden', border: `3px solid var(--c-t4)`, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    <img src={photo} alt={person.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : <ActorCircle name={person.name || '?'} size={108} />}
              </div>
            </div>

            {/* ── Info + bio ── */}
            <div style={{ textAlign: 'center', padding: '12px 24px 20px' }}>
              <Txt size={22} weight={800} style={{ display: 'block', marginBottom: 4 }}>{person.name || '—'}</Txt>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                {person.known_for_department && <MetaChip label={person.known_for_department === 'Acting' ? 'Ator/Atriz' : 'Direção'} />}
                {person.birthday && <MetaChip label={person.birthday.slice(0, 4)} />}
                {person.place_of_birth && <MetaChip label={String(person.place_of_birth).split(',').pop()?.trim() || ''} />}
              </div>
              {person.biography && (
                <div style={{ textAlign: 'left' }}>
                  <Txt size={13} color={T.t2} style={{ lineHeight: 1.7, display: 'block' }}>
                    {bioExpanded || !bioTruncated
                      ? bioText
                      : bioText.slice(0, BIO_LIMIT) + '...'}
                  </Txt>
                  {bioTruncated && (
                    <button
                      onClick={() => setBioExpanded(!bioExpanded)}
                      style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#C069FF', fontSize: 13, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif" }}
                    >
                      {bioExpanded ? 'Leia menos' : 'Leia mais'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Conhecido por — grid 2 colunas estilo "Em alta" ── */}
            {knownFor.length > 0 && (
              <div style={{ padding: '0 16px 28px' }}>
                <div style={{ marginBottom: 12 }}>
                  <Txt size={16} weight={700}>Conhecido por</Txt>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {knownFor.map((item: any) => {
                    const n = normalize(item);
                    const thumb = n.backdrop_path
                      ? tmdbImg(n.backdrop_path, 'w780')
                      : n.poster_path ? tmdbImg(n.poster_path, 'w342') : null;
                    return (
                      <button
                        key={item.id}
                        onClick={() => openTitle(item)}
                        style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, cursor: 'pointer', textAlign: 'left', padding: 0, overflow: 'hidden' }}
                      >
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: 'var(--c-surface2)', overflow: 'hidden' }}>
                          {thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={n.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          )}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)', pointerEvents: 'none' }} />
                        </div>
                        <div style={{ padding: '8px 10px 10px', background: '#0a0a0a' }}>
                          <Txt size={12} weight={700} color="rgba(255,255,255,0.92)" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {n.title}
                          </Txt>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Tabs filmografia ── */}
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
              {tabs.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 20px', borderRadius: 24, flexShrink: 0, background: tab === t ? T.pillActiveBg : 'transparent', border: tab === t ? `1px solid ${T.pillActiveBorder}` : `1px solid ${T.dim}`, color: tab === t ? T.pillActiveText : T.t2, fontSize: 13, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.2s', textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>

            <div style={{ padding: 16 }}>
              {tab === 'filmes' && (
                movieCredits.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {movieCredits.map((item: any) => (
                      <TMDBPosterCard key={item.id} item={{ ...item, media_type: 'movie' }} size="sm" onClick={() => openTitle({ ...item, media_type: 'movie' })} />
                    ))}
                  </div>
                ) : <Txt size={13} color={T.t3} style={{ textAlign: 'center', display: 'block', padding: '40px 0' }}>Sem filmes encontrados</Txt>
              )}
              {tab === 'séries' && (
                tvCredits.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {tvCredits.map((item: any) => (
                      <TMDBPosterCard key={item.id} item={{ ...item, media_type: 'tv' }} size="sm" onClick={() => openTitle({ ...item, media_type: 'tv' })} />
                    ))}
                  </div>
                ) : <Txt size={13} color={T.t3} style={{ textAlign: 'center', display: 'block', padding: '40px 0' }}>Sem séries encontradas</Txt>
              )}
              {tab === 'direção' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {directed.map((item: any) => (
                    <TMDBPosterCard key={item.id + '_d'} item={item} size="sm" onClick={() => openTitle(item)} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 90 }} />
          </ScrollArea>
        )}
      </Screen>
    </Frame>
  );
}

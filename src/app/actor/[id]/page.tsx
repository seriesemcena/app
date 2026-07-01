'use client';
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, MetaChip, Skeleton, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { ActorCircle, TMDBPosterCard } from '@/components/posters';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB, normalize, tmdbImg, type TMDBItem } from '@/lib/tmdb';

export default function ActorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const personId = params.id;

  const { data, loading } = useTMDB<any>(() => tmdb.personDetail(personId), [personId]);
  const person = data || {};
  const movieCredits = ((person.movie_credits?.cast || []) as any[]).sort((a, b) => b.popularity - a.popularity).slice(0, 20);
  const tvCredits = ((person.tv_credits?.cast || []) as any[]).sort((a, b) => b.popularity - a.popularity).slice(0, 20);
  const directed = [...(person.movie_credits?.crew || []), ...(person.tv_credits?.crew || [])]
    .filter((c: any) => ['Director', 'Creator', 'Executive Producer'].includes(c.job))
    .sort((a: any, b: any) => b.popularity - a.popularity).slice(0, 12);

  const [tab, setTab] = useState<'filmes' | 'séries' | 'direção'>('filmes');
  const photo = person.profile_path ? tmdbImg(person.profile_path, 'w342') : null;
  const knownFor = [...movieCredits, ...tvCredits].sort((a: any, b: any) => b.vote_average - a.vote_average).slice(0, 4);

  const openTitle = (item: TMDBItem) => {
    const n = normalize(item);
    router.push(`/title/${n.type}/${n.id}`);
  };

  type Tab = 'filmes' | 'séries' | 'direção';
  const tabs: Tab[] = ['filmes', 'séries', ...(directed.length ? (['direção'] as Tab[]) : [])];

  return (
    <Frame>
      <Screen>
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 30 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,0.5)', border: `1px solid var(--c-t4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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

            <div style={{ textAlign: 'center', padding: '12px 24px 20px' }}>
              <Txt size={22} weight={800} style={{ display: 'block', marginBottom: 4 }}>{person.name || '—'}</Txt>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                {person.known_for_department && <MetaChip label={person.known_for_department === 'Acting' ? 'Ator/Atriz' : 'Direção'} />}
                {person.birthday && <MetaChip label={person.birthday.slice(0, 4)} />}
                {person.place_of_birth && <MetaChip label={String(person.place_of_birth).split(',').pop()?.trim() || ''} />}
              </div>
              {person.biography && (
                <Txt size={13} color={T.t2} style={{ lineHeight: 1.7, display: 'block', textAlign: 'left' }}>
                  {String(person.biography).slice(0, 300)}{String(person.biography).length > 300 ? '...' : ''}
                </Txt>
              )}
            </div>

            {knownFor.length > 0 && (
              <div style={{ paddingBottom: 24 }}>
                <div style={{ paddingLeft: 16, marginBottom: 12 }}>
                  <Txt size={16} weight={700}>Conhecido por</Txt>
                </div>
                <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                  {knownFor.map((item: any) => (
                    <TMDBPosterCard key={item.id} item={item} size="md" onClick={() => openTitle(item)} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
              {tabs.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 20px', borderRadius: 24, flexShrink: 0, background: tab === t ? T.white : 'transparent', border: tab === t ? 'none' : `1px solid ${T.dim}`, color: tab === t ? T.bg : T.t2, fontSize: 13, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.2s', textTransform: 'capitalize' }}>
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

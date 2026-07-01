'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, Btn, MetaChip, Toast, BottomSheet, Stars } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { TMDBBackdrop, TMDBPersonPhoto, TMDBPosterCard } from '@/components/posters';
import { StreamCircle } from '@/components/primitives';
import { T } from '@/lib/tokens';
import { tmdb, useTMDB } from '@/lib/tmdb';
import { listStore, revStore, type Review } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRevStore, dbListStore } from '@/lib/db';

export default function TitleDetailPage() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useParams<{ type: string; id: string }>();
  const isTV = params.type === 'tv';
  const id = params.id;
  const itemKey = `${params.type}_${id}`;

  type Tab = 'episódios' | 'onde assistir' | 'avaliações' | 'detalhes';
  const [tab, setTab] = useState<Tab>(params.type === 'tv' ? 'episódios' : 'onde assistir');
  const [isFav, setIsFav] = useState(false);

  // Status icon: determina qual ícone mostrar no canto do hero
  type StatusKey = 'atrasado' | 'watching' | 'favorites' | 'want' | null;
  const [statusKey, setStatusKey] = useState<StatusKey>(null);
  const [toast, setToast] = useState<string | false>(false);
  const [listSheet, setListSheet] = useState(false);
  const [maisSheet, setMaisSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [seasonDropOpen, setSeasonDropOpen] = useState(false);
  const seasonBtnRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load reviews: localStorage first, then Firestore for cross-device sync
  useEffect(() => {
    const local = revStore.get(itemKey);
    setReviews(local);
    if (!firebaseConfigured) return;
    dbRevStore.get(getDB(), itemKey).then(cloud => {
      if (cloud.length > 0) {
        const cloudIds = new Set(cloud.map(r => r.id));
        const onlyLocal = local.filter(r => !cloudIds.has(r.id));
        const merged = [...onlyLocal, ...cloud];
        setReviews(merged);
        revStore.set(itemKey, merged);
      }
    }).catch(() => {});
  }, [itemKey]);

  const { data: detail, loading } = useTMDB(
    () => isTV ? tmdb.tvDetail(id) : tmdb.movieDetail(id),
    [id, isTV]
  );

  // Status icon — MUST be before early return to respect Rules of Hooks
  useEffect(() => {
    if (!detail) return;
    const iid = detail.id as number;
    const isWatching = listStore.get('watching').some((i) => i.id === iid);
    const isFavorite = listStore.get('favorites').some((i) => i.id === iid);
    const isWant     = listStore.get('want').some((i) => i.id === iid);
    setIsFav(isFavorite);
    if (isWatching) {
      const lastAir = (detail as any).last_episode_to_air?.air_date;
      if (lastAir) {
        const diff = (Date.now() - new Date(lastAir + 'T00:00:00').getTime()) / 86_400_000;
        if (diff > 30) { setStatusKey('atrasado'); return; }
      }
      setStatusKey('watching'); return;
    }
    if (isFavorite) { setStatusKey('favorites'); return; }
    if (isWant)     { setStatusKey('want'); return; }
    setStatusKey(null);
  }, [detail]);

  if (loading || !detail) {
    return (
      <Frame>
        <Screen>
          <div style={{ height: 320, background: T.card }} />
          <div style={{ padding: 16 }}>
            <div style={{ height: 24, width: '60%', background: T.surface2, borderRadius: 4, marginBottom: 12 }} />
            <div style={{ height: 14, width: '90%', background: T.surface, borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 14, width: '80%', background: T.surface, borderRadius: 4 }} />
          </div>
        </Screen>
      </Frame>
    );
  }

  const title: string = detail.title || detail.name || '';
  const overview: string = detail.overview || 'Uma produção imperdível com atuações incríveis e roteiro envolvente.';
  const genre: string = detail.genres?.[0]?.name || '';
  const rating: string = detail.vote_average ? detail.vote_average.toFixed(1) : '';
  const runtime: string = detail.runtime ? `${detail.runtime}Min` : detail.episode_run_time?.[0] ? `${detail.episode_run_time[0]}Min` : '';
  const cast = (detail.credits?.cast || []).slice(0, 12);
  const crew = (detail.credits?.crew || []).filter((c: any) => ['Director', 'Creator'].includes(c.job)).slice(0, 3);
  const similar = (detail.similar?.results || []).slice(0, 8);
  const seasons: number[] = (detail.seasons || []).map((s: any) => s.season_number).filter((n: number) => n > 0);
  // Default to last/latest season
  const activeSeason = selectedSeason ?? seasons[seasons.length - 1] ?? 1;

  // Tabs: episódios só para TV
  const tabs: Tab[] = [
    ...(isTV ? (['episódios'] as Tab[]) : []),
    'onde assistir', 'avaliações', 'detalhes',
  ];

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2500); };

  const toggleFav = async () => {
    const item = { id: detail.id, title, type: isTV ? 'tv' : 'movie', poster_path: detail.poster_path };
    if (isFav) {
      listStore.remove('favorites', detail.id);
      showToast('Removido dos favoritos');
      if (firebaseConfigured && user) {
        try { await dbListStore.remove(getDB(), user.uid, 'favorites', detail.id); } catch {}
      }
    } else {
      listStore.add('favorites', item);
      showToast('Adicionado aos favoritos ⭐');
      if (firebaseConfigured && user) {
        try { await dbListStore.add(getDB(), user.uid, 'favorites', item); } catch {}
      }
    }
    setIsFav((v) => !v);
  };

  const submitReview = async () => {
    if (!reviewText.trim() || reviewRating === 0) { showToast('Adicione nota e texto'); return; }
    const displayName = user?.displayName || user?.email?.split('@')[0] || 'Você';
    const avatarLetter = displayName[0]?.toUpperCase() || 'V';
    const rev: Review = {
      id: `r_${Date.now()}`,
      user: displayName,
      avatar: avatarLetter,
      rating: reviewRating,
      text: reviewText.trim(),
      date: new Date().toISOString(),
      likes: 0, likedBy: [], replies: [],
    };
    // Optimistic: localStorage + UI immediately
    const updated = revStore.addReview(itemKey, rev);
    setReviews(updated);
    setReviewText(''); setReviewRating(0); setShowForm(false);
    showToast('Avaliação publicada!');
    // Sync to Firestore in background
    if (firebaseConfigured) {
      try { await dbRevStore.add(getDB(), itemKey, rev); } catch {}
    }
  };

  const toggleLike = async (reviewId: string) => {
    // Optimistic local update
    const updated = revStore.toggleLike(itemKey, reviewId);
    setReviews([...updated]);
    // Sync to Firestore
    if (firebaseConfigured) {
      try {
        const cloud = await dbRevStore.toggleLike(getDB(), itemKey, reviewId, user?.uid || 'anon');
        setReviews([...cloud]);
        revStore.set(itemKey, cloud);
      } catch {}
    }
  };

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : rating;

  return (
    <Frame>
      <Screen>
        {/* ── Floating header — BlurUIKit style: camadas de blur progressivo, sempre ativo ── */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40, pointerEvents: 'none' }}>
          {/* Camadas de blur progressivo (mais intenso no topo, some embaixo) */}
          {[
            { blur: 24, start: 0,  end: 25  },
            { blur: 16, start: 5,  end: 40  },
            { blur: 8,  start: 20, end: 55  },
            { blur: 4,  start: 40, end: 75  },
            { blur: 2,  start: 60, end: 90  },
            { blur: 1,  start: 80, end: 100 },
          ].map(({ blur, start, end }, i) => (
            <div key={i} style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 110,
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: `linear-gradient(to bottom, black ${start}%, transparent ${end}%)`,
              WebkitMaskImage: `linear-gradient(to bottom, black ${start}%, transparent ${end}%)`,
            } as React.CSSProperties} />
          ))}
          {/* Tint escuro — mais forte no topo */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 110,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.10) 60%, transparent 100%)',
          }} />
        </div>
        {/* Conteúdo do header — por cima das camadas de blur */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 41,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '20px 16px 12px',
          pointerEvents: 'auto',
        }}>
          {/* App name / back */}
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.1, color: '#fff', textTransform: 'uppercase', fontFamily: "'Area','Inter',sans-serif", textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              Mara-<br />tonando
            </h1>
          </button>
          {/* Icons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => { if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ title, url: window.location.href }).catch(() => {}); }} style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as React.CSSProperties}>
              <Icon name="share" size={17} color="#fff" />
            </button>
            <button onClick={() => router.push('/notifications')} style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as React.CSSProperties}>
              <Icon name="bell" size={17} color="#fff" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>

          {/* ── Backdrop hero ── */}
          <div style={{ height: 345, position: 'relative', overflow: 'hidden' }}>
            {detail.backdrop_path
              ? <img src={`https://image.tmdb.org/t/p/w780${detail.backdrop_path}`} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
              : <div style={{ width: '100%', height: '100%', background: T.surface2 }} />
            }
            {/* Gradient fade to page bg */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, background: `linear-gradient(to bottom, transparent 0%, ${T.bg} 100%)`, pointerEvents: 'none' }} />
          </div>

          {/* ── Info card — overlaps hero ── */}
          <div style={{ margin: '-28px 12px 0', background: T.card, borderRadius: 20, padding: '18px 18px 20px', position: 'relative', boxShadow: '0 -2px 24px rgba(0,0,0,0.08)' }}>
            {/* Status icon — top right */}
            {statusKey && (() => {
              const s = STATUS_ICON_MAP[statusKey];
              return (
                <div style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(0,0,0,0.25)' }}>
                  <Icon name={s.icon} size={18} color={s.color} />
                </div>
              );
            })()}
            {/* Title */}
            <Txt size={26} weight={900} color={T.t1} style={{ display: 'block', lineHeight: 1.15, letterSpacing: -0.5, marginBottom: 10, paddingRight: statusKey ? 52 : 0 }}>{title}</Txt>
            {/* Chips: genre · rating · runtime */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {genre && (
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 8, background: T.surface2 }}>
                  <Txt size={11} weight={600} color={T.t2}>{genre}</Txt>
                </span>
              )}
              {rating && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: T.goldDim }}>
                  <Icon name="star" size={11} color={T.gold} />
                  <Txt size={11} weight={700} color={T.gold}>{rating}/10</Txt>
                </span>
              )}
              {runtime && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: T.surface2 }}>
                  <Txt size={11} weight={600} color={T.t2}>⏱ {runtime}</Txt>
                </span>
              )}
            </div>
            {/* Description */}
            {!expanded && overview.length > 140 ? (
              <>
                <div style={{ position: 'relative', overflow: 'hidden', maxHeight: '4.8em' }}>
                  <Txt size={13} color={T.t2} style={{ lineHeight: 1.7, display: 'block' }}>{overview}</Txt>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2em', background: `linear-gradient(to bottom, transparent, ${T.card})`, pointerEvents: 'none' }} />
                </div>
                <button onClick={() => setExpanded(true)} style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Txt size={13} weight={700} color={T.t2}>Ler mais</Txt>
                </button>
              </>
            ) : (
              <>
                <Txt size={13} color={T.t2} style={{ lineHeight: 1.7, display: 'block' }}>{overview}</Txt>
                {overview.length > 140 && (
                  <button onClick={() => setExpanded(false)} style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Txt size={13} weight={700} color={T.t2}>Ler menos</Txt>
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Action buttons ── */}
          <div style={{ display: 'flex', gap: 10, padding: '20px 16px 6px', justifyContent: 'center' }}>
            {([
              { icon: 'play',                              label: 'Trailer',   action: () => setTab('onde assistir') },
              { icon: isFav ? 'heart' : 'heartO',          label: isFav ? 'Favorito' : 'Favoritar', action: toggleFav, active: isFav },
              { icon: 'award',                             label: 'Avaliar',   action: () => { setTab('avaliações'); setShowForm(true); } },
              { icon: 'bookmark',                          label: 'Listas',    action: () => setListSheet(true) },
              { icon: 'plus',                              label: 'Mais',      action: () => setMaisSheet(true) },
            ] as Array<{ icon: import('@/lib/tokens').IconName; label: string; action: () => void; active?: boolean }>).map(({ icon, label, action, active }) => (
              <button key={label} onClick={action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 26,
                  background: active ? T.redDim : T.surface2,
                  border: `1.5px solid ${active ? T.red : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={icon} size={20} color={active ? T.red : T.t1} />
                </div>
                <Txt size={9} weight={600} color={T.t3} style={{ textAlign: 'center' }}>{label}</Txt>
              </button>
            ))}
          </div>

          {/* ── Tab bar wrapper — position:relative para o dropdown se ancorar aqui ── */}
          <div style={{ position: 'relative', padding: '12px 0 16px' }}>
            {/* Linha scrollável */}
            <div style={{ display: 'flex', gap: 8, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
              {tabs.map((t) => {
                const isActive = tab === t;
                if (t === 'episódios' && isTV) {
                  return (
                    <button
                      key={t}
                      ref={seasonBtnRef}
                      onClick={() => { setTab('episódios'); setSeasonDropOpen((o) => !o); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '9px 18px', borderRadius: 24, flexShrink: 0,
                        background: isActive ? T.t1 : 'transparent',
                        border: isActive ? 'none' : `1px solid ${T.dim}`,
                        color: isActive ? T.bg : T.t2,
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                      }}>
                      {seasons.length > 0 ? `Temporada ${activeSeason}` : 'Episódios'}
                      {seasons.length > 1 && (
                        <Icon name="chevronD" size={14} color={isActive ? T.bg : T.t2}
                          style={{ transition: 'transform 0.2s', transform: seasonDropOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                      )}
                    </button>
                  );
                }
                return (
                  <button key={t} onClick={() => { setTab(t); setSeasonDropOpen(false); }} style={{
                    padding: '9px 22px', borderRadius: 24, flexShrink: 0,
                    background: isActive ? T.t1 : 'transparent',
                    border: isActive ? 'none' : `1px solid ${T.dim}`,
                    color: isActive ? T.bg : T.t2,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                    textTransform: 'capitalize',
                  }}>
                    {t}
                  </button>
                );
              })}
            </div>

            {/* Dropdown — fora do overflow, ancorado no wrapper */}
            {seasonDropOpen && seasons.length > 1 && (
              <>
                <div onClick={() => setSeasonDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                <div style={{
                  position: 'absolute', top: '100%', left: 16,
                  background: T.card, borderRadius: 14,
                  border: `1px solid ${T.border}`,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                  overflow: 'hidden', zIndex: 20, minWidth: 190,
                }}>
                  {seasons.map((sn, idx) => (
                    <button key={sn}
                      onClick={() => { setSelectedSeason(sn); setSeasonDropOpen(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '13px 16px', background: 'none', border: 'none',
                        borderBottom: idx < seasons.length - 1 ? `1px solid ${T.border}` : 'none',
                        color: sn === activeSeason ? T.pink : T.t1,
                        fontSize: 14, fontWeight: sn === activeSeason ? 700 : 500,
                        fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', textAlign: 'left',
                      }}>
                      Temporada {sn}
                      {sn === activeSeason && <Icon name="check" size={15} color={T.pink} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Tab content ── */}
          <div style={{ padding: '0 16px 16px' }}>

            {/* Episódios */}
            {tab === 'episódios' && isTV && (
              <div>
                <EpisodeList
                  tvId={id} seasonNum={activeSeason}
                  showName={title} network={(detail as any).networks?.[0]?.name || ''}
                  onEpisode={(ep: any) => {
                    const p = new URLSearchParams({
                      tvId: id, season: String(activeSeason),
                      epNum: String(ep.episode_number), name: ep.name || '',
                      showName: title, runtime: String(ep.runtime || ''),
                      overview: ep.overview || '', still: ep.still_path || '',
                      network: (detail as any).networks?.[0]?.name || '',
                    });
                    router.push(`/episode?${p.toString()}`);
                  }}
                />
              </div>
            )}

            {/* Onde assistir */}
            {tab === 'onde assistir' && (
              <WatchProvidersTab type={isTV ? 'tv' : 'movie'} id={id} onVIP={() => router.push('/vip')} />
            )}

            {/* Avaliações */}
            {tab === 'avaliações' && (
              <ReviewsTab
                reviews={reviews} avgRating={avgRating}
                showForm={showForm} reviewText={reviewText} reviewRating={reviewRating}
                onToggleForm={() => setShowForm((f) => !f)}
                onTextChange={setReviewText} onRatingChange={setReviewRating}
                onSubmit={submitReview} onLike={toggleLike}
              />
            )}

            {/* Detalhes: elenco + informações */}
            {tab === 'detalhes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {cast.length > 0 && (
                  <div>
                    <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>Elenco</Txt>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {cast.map((c: any, idx: number) => (
                        <button key={c.id} onClick={() => router.push(`/actor/${c.id}`)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', background: 'none', border: 'none', borderBottom: idx < cast.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${T.border}` }}>
                            <TMDBPersonPhoto path={c.profile_path} size={52} name={c.name} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight={700} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</Txt>
                            <Txt size={12} color={T.t3} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.character}</Txt>
                          </div>
                          <Icon name="chevronR" size={14} color={T.t4} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <InformationsTab
                  detail={detail} crew={crew} similar={similar} isTV={isTV}
                  onCrew={(cid: string) => router.push(`/actor/${cid}`)}
                  onSimilar={(s: any) => router.push(`/title/${s.media_type || (isTV ? 'tv' : 'movie')}/${s.id}`)}
                />
              </div>
            )}

          </div>

          <div style={{ height: 100 }} />
        </div>

        <Toast msg={toast} visible={!!toast} />
        <BottomSheet visible={listSheet} onClose={() => setListSheet(false)} title="Adicionar à lista">
          {([
            { key: 'want',     label: 'Quero assistir' },
            { key: 'watching', label: 'Maratonando' },
            { key: 'watched',  label: 'Finalizado' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={async () => {
              const item = { id: detail.id, title, type: isTV ? 'tv' : 'movie', poster_path: detail.poster_path };
              listStore.add(key, item);
              setListSheet(false);
              showToast(`Adicionado: ${label}`);
              if (firebaseConfigured && user) {
                try { await dbListStore.add(getDB(), user.uid, key, item); } catch {}
              }
            }} style={{ width: '100%', padding: '14px 0', background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, textAlign: 'left', color: T.t1, fontSize: 14, fontWeight: 600, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="plus" size={16} color={T.pink} />{label}
            </button>
          ))}
        </BottomSheet>

        <BottomSheet visible={maisSheet} onClose={() => setMaisSheet(false)} title="Mais opções">
          {([
            { icon: 'share' as const, label: 'Compartilhar',    action: () => { showToast('Link copiado!'); setMaisSheet(false); } },
            { icon: 'flag' as const,  label: 'Relatar problema', action: () => { showToast('Obrigado pelo relato!'); setMaisSheet(false); } },
          ]).map(({ icon, label, action }) => (
            <button key={label} onClick={action} style={{ width: '100%', padding: '16px 0', background: 'none', border: 'none', borderBottom: `1px solid ${T.border}`, textAlign: 'left', color: T.t1, fontSize: 14, fontWeight: 600, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={icon} size={17} color={T.t2} />
              </div>
              {label}
            </button>
          ))}
        </BottomSheet>
      </Screen>
    </Frame>
  );
}

function WatchProvidersTab({ type, id, onVIP }: {
  type: 'movie' | 'tv'; id: string; onVIP: () => void;
}) {
  const { data, loading } = useTMDB(() => tmdb.watchProviders(type, id), [type, id]);
  const regionData = data?.results?.BR || data?.results?.US || Object.values(data?.results || {})[0] as any;
  const flatrate: any[] = regionData?.flatrate || [];
  const rent: any[]     = regionData?.rent     || [];
  const buy: any[]      = regionData?.buy      || [];

  const ProviderRow = ({ p, label }: { p: any; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 8 }}>
      {p.logo_path
        ? <img src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
        : <StreamCircle name={p.provider_name} size={44} />
      }
      <div style={{ flex: 1 }}>
        <Txt size={14} weight={700} style={{ display: 'block' }}>{p.provider_name}</Txt>
        <Txt size={11} color={T.t3}>{label}</Txt>
      </div>
      <Btn label={label === 'Incluído na assinatura' ? 'Assistir' : label} variant="pink" size="sm" />
    </div>
  );

  return (
    <div>
      {loading && (
        <div>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 68, borderRadius: 10, background: T.card, marginBottom: 8 }} />)}</div>
      )}
      {!loading && flatrate.length === 0 && rent.length === 0 && buy.length === 0 && (
        <div style={{ padding: '28px 0', textAlign: 'center' }}>
          <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 4 }}>Não disponível em streaming no Brasil</Txt>
          <Txt size={12} color={T.t4}>Verifique em breve ou confira opções de aluguel</Txt>
        </div>
      )}
      {flatrate.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Incluído na assinatura</Txt>
          {flatrate.map((p: any) => <ProviderRow key={p.provider_id} p={p} label="Incluído na assinatura" />)}
        </div>
      )}
      {rent.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Alugar</Txt>
          {rent.map((p: any) => <ProviderRow key={p.provider_id} p={p} label="Alugar" />)}
        </div>
      )}
      {buy.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Comprar</Txt>
          {buy.map((p: any) => <ProviderRow key={p.provider_id} p={p} label="Comprar" />)}
        </div>
      )}
      {/* VIP card */}
      <div onClick={onVIP} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: T.card, borderRadius: T.radiusSm, border: `1px solid rgba(245,197,24,0.2)`, marginTop: 8, cursor: 'pointer' }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: T.goldDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="crown" size={18} color={T.gold} />
        </div>
        <div style={{ flex: 1 }}>
          <Txt size={13} weight={700} color={T.gold} style={{ display: 'block' }}>Mais com VIP</Txt>
          <Txt size={11} color={T.t3}>Alertas quando chegar em novos streamings</Txt>
        </div>
        <Btn label="VIP" variant="gold" size="sm" onClick={onVIP} />
      </div>
    </div>
  );
}

function InformationsTab({ detail, crew, similar, isTV, onCrew, onSimilar }: {
  detail: any; crew: any[]; similar: any[]; isTV: boolean;
  onCrew: (id: string) => void; onSimilar: (s: any) => void;
}) {
  const allCrew = (detail.credits?.crew || []).filter((c: any) =>
    ['Director', 'Creator', 'Producer', 'Executive Producer', 'Screenplay', 'Writer'].includes(c.job)
  ).slice(0, 8);

  const infoRows = [
    { label: 'Lançamento',  value: detail.release_date || detail.first_air_date || '—' },
    { label: 'Duração',     value: detail.runtime ? `${detail.runtime} min` : detail.episode_run_time?.[0] ? `${detail.episode_run_time[0]} min/ep` : '—' },
    { label: 'País',        value: (detail.production_countries || [])[0]?.name || '—' },
    { label: 'Idioma',      value: (detail.spoken_languages || [])[0]?.name || '—' },
    ...(isTV ? [
      { label: 'Temporadas', value: String(detail.number_of_seasons || '—') },
      { label: 'Episódios',  value: String(detail.number_of_episodes || '—') },
      { label: 'Status',     value: detail.status === 'Ended' ? 'Encerrada' : detail.status === 'Returning Series' ? 'Em andamento' : detail.status || '—' },
    ] : []),
    { label: 'Gêneros', value: (detail.genres || []).map((g: any) => g.name).join(', ') || '—' },
  ];

  return (
    <div>
      {/* Info grid */}
      <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>Informações</Txt>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
        {infoRows.map(({ label, value }) => (
          <div key={label} style={{ padding: '10px 12px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
            <Txt size={10} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Txt>
            <Txt size={12} weight={600}>{value}</Txt>
          </div>
        ))}
      </div>

      {/* Equipe de criação */}
      {allCrew.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>Equipe de criação</Txt>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {allCrew.map((c: any, idx: number) => (
              <button key={`${c.id}-${c.job}`} onClick={() => onCrew(c.id)} style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', background: 'none', border: 'none', borderBottom: idx < allCrew.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${T.border}` }}>
                  <TMDBPersonPhoto path={c.profile_path} size={44} name={c.name} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={13} weight={700} style={{ display: 'block' }}>{c.name}</Txt>
                  <Txt size={11} color={T.t3}>{c.job}</Txt>
                </div>
                <Icon name="chevronR" size={14} color={T.t4} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Títulos semelhantes */}
      {similar.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Txt size={17} weight={800} style={{ display: 'block', marginBottom: 14 }}>Você também pode gostar</Txt>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', marginLeft: -16, paddingLeft: 16, paddingRight: 16 } as React.CSSProperties}>
            {similar.map((s: any) => (
              <TMDBPosterCard key={s.id} item={s} size="sm" onClick={() => onSimilar(s)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeasonDropdown({ seasons, active, onSelect }: { seasons: number[]; active: number; onSelect: (sn: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', marginBottom: 16, zIndex: 10 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 12,
          background: T.surface2, border: `1px solid ${T.border}`,
          color: T.t1, fontSize: 14, fontWeight: 700,
          fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', outline: 'none',
        }}>
        Temporada {active}
        <Icon name="chevronD" size={16} color={T.t3} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {/* Dropdown list */}
      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            background: T.card, borderRadius: 14,
            border: `1px solid ${T.border}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            overflow: 'hidden', zIndex: 10, minWidth: 180,
          }}>
            {seasons.map((sn, idx) => (
              <button
                key={sn}
                onClick={() => { onSelect(sn); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px', background: 'none',
                  border: 'none',
                  borderBottom: idx < seasons.length - 1 ? `1px solid ${T.border}` : 'none',
                  color: sn === active ? T.pink : T.t1,
                  fontSize: 14, fontWeight: sn === active ? 700 : 500,
                  fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', textAlign: 'left',
                }}>
                Temporada {sn}
                {sn === active && <Icon name="check" size={15} color={T.pink} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EpisodeList({ tvId, seasonNum, showName, network, onEpisode }: { tvId: string; seasonNum: number; showName: string; network: string; onEpisode: (ep: any) => void }) {
  const { data, loading } = useTMDB(() => tmdb.season(tvId, seasonNum), [tvId, seasonNum]);
  const episodes = data?.episodes || [];

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px', background: T.card, borderRadius: 14, border: `1px solid ${T.border}` }}>
          <div style={{ width: 120, height: 80, borderRadius: 10, background: T.surface2, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, width: '70%', background: T.surface2, borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 12, width: '50%', background: T.surface2, borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 22, width: 64, background: T.surface2, borderRadius: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {episodes.map((ep: any) => (
        <button
          key={ep.id}
          onClick={() => onEpisode(ep)}
          style={{
            width: '100%', display: 'flex', gap: 14, alignItems: 'center',
            padding: '12px',
            background: T.card,
            borderRadius: 14,
            border: `1px solid ${T.border}`,
            cursor: 'pointer', textAlign: 'left',
            boxSizing: 'border-box',
          } as React.CSSProperties}>
          {/* Thumbnail — landscape */}
          <div style={{ width: 120, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
            {ep.still_path
              ? <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="play" size={22} color={T.t4} /></div>
            }
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Txt size={14} weight={700} color={T.t1}
              style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
              {ep.name}
            </Txt>
            <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 8 }}>
              Temporada {seasonNum} - Ep {ep.episode_number}
            </Txt>
            {ep.vote_average > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 8, background: T.goldDim, border: `1px solid rgba(245,197,24,0.2)` }}>
                <Icon name="star" size={10} color={T.gold} />
                <Txt size={11} weight={700} color={T.gold}>{ep.vote_average.toFixed(1)}/10</Txt>
              </span>
            )}
          </div>
          <Icon name="chevronR" size={14} color={T.t4} />
        </button>
      ))}
    </div>
  );
}

function ReviewsTab({ reviews, avgRating, showForm, reviewText, reviewRating, onToggleForm, onTextChange, onRatingChange, onSubmit, onLike }: {
  reviews: Review[]; avgRating: string; showForm: boolean;
  reviewText: string; reviewRating: number;
  onToggleForm: () => void; onTextChange: (v: string) => void;
  onRatingChange: (v: number) => void; onSubmit: () => void;
  onLike: (id: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Txt size={36} weight={800} color={T.gold}>{avgRating}</Txt>
          <div style={{ paddingBottom: 6 }}>
            <Stars value={Math.round(Number(avgRating) / 2)} max={5} size={14} onChange={() => {}} />
            <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 2 }}>{reviews.length} avaliações</Txt>
          </div>
        </div>
        <button onClick={onToggleForm} style={{ padding: '10px 16px', borderRadius: T.radiusSm, background: showForm ? T.surface2 : T.pink, border: 'none', cursor: 'pointer', boxShadow: showForm ? 'none' : `0 2px 12px ${T.pinkGlow}` }}>
          <Txt size={12} weight={700} color={T.white}>{showForm ? 'Cancelar' : '+ Avaliar'}</Txt>
        </button>
      </div>
      {showForm && (
        <div style={{ padding: 16, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <Txt size={13} weight={700} style={{ display: 'block', marginBottom: 10 }}>Sua avaliação</Txt>
          <div style={{ marginBottom: 12 }}>
            <Stars value={reviewRating} max={10} size={22} onChange={onRatingChange} />
            {reviewRating > 0 && <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 4 }}>{reviewRating}/10</Txt>}
          </div>
          <textarea value={reviewText} onChange={(e) => onTextChange(e.target.value)} placeholder="Escreva sua crítica..." rows={3}
            style={{ width: '100%', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '10px 12px', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          <button onClick={onSubmit} style={{ marginTop: 10, width: '100%', padding: '12px 0', borderRadius: T.radiusSm, background: T.pink, border: 'none', cursor: 'pointer', boxShadow: `0 2px 12px ${T.pinkGlow}` }}>
            <Txt size={14} weight={700} color={T.white}>Publicar</Txt>
          </button>
        </div>
      )}
      {reviews.map((rev) => (
        <ReviewCard key={rev.id} review={rev} onLike={() => onLike(rev.id)} />
      ))}
    </div>
  );
}

function ReviewCard({ review, onLike }: { review: Review; onLike: () => void }) {
  const [open, setOpen] = useState(false);
  const liked = (review.likedBy || []).includes('me');
  return (
    <div style={{ padding: '14px 16px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Txt size={12} weight={800} color={T.t2}>{review.avatar}</Txt>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Txt size={13} weight={700} style={{ display: 'block' }}>{review.user}</Txt>
          <Txt size={11} color={T.t3}>{review.date}</Txt>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 16, background: T.goldDim, border: `1px solid rgba(245,197,24,0.2)` }}>
          <Icon name="star" size={10} color={T.gold} />
          <Txt size={12} weight={700} color={T.gold}>{review.rating}/10</Txt>
        </div>
      </div>
      <Txt size={13} color={T.t2} style={{ lineHeight: 1.65, display: 'block', marginBottom: 10 }}>{review.text}</Txt>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={onLike} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name={liked ? 'heart' : 'heartO'} size={15} color={liked ? T.red : T.t3} />
          <Txt size={12} color={liked ? T.red : T.t3}>{(review.likes || 0) + (liked ? 1 : 0)}</Txt>
        </button>
        <button onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name="message" size={15} color={T.t3} />
          <Txt size={12} color={T.t3}>{(review.replies || []).length} respostas</Txt>
        </button>
      </div>
      {open && (review.replies || []).length === 0 && (
        <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 8, fontStyle: 'italic' }}>Sem respostas ainda.</Txt>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   HeroWithGlur — PosterRamen / Glur technique
   maskImage on wrapper div  →  controls visibility band
   filter:blur on inner <img> →  blurs that copy of the image
   scale on inner <img> only  →  hides blur-edge bleed, no duplication
───────────────────────────────────────────── */
const STATUS_ICON_MAP = {
  watching:  { icon: 'eye'      as const, bg: '#FF8C00', color: '#fff' },
  favorites: { icon: 'heart'    as const, bg: '#E5002E', color: '#fff' },
  want:      { icon: 'search'   as const, bg: '#A861FF', color: '#fff' },
  atrasado:  { icon: 'clock'    as const, bg: '#FF3B30', color: '#fff' },
};

function HeroWithGlur({
  backdropPath, title, genre, rating, runtime, statusKey,
}: {
  backdropPath: string | null;
  title: string; genre: string; rating: string; runtime: string;
  statusKey: 'atrasado' | 'watching' | 'favorites' | 'want' | null;
}) {
  const BLUR_HEIGHT = 36;   // % of hero height covered by blur (from bottom)
  const BLUR_DETAIL = 6;    // number of layers
  const BLUR_AMOUNT = 1;    // base blur px — doubles each step: 1,2,4,8,16,32
  const IMG_SCALE   = 1.12; // only the blurred <img> scales to hide edge bleed

  const imgUrl = backdropPath
    ? `https://image.tmdb.org/t/p/w780${backdropPath}`
    : '';

  // evenly-spaced vertical checkpoints across the blur zone
  const checkpoints: number[] = [];
  const inc = BLUR_HEIGHT / BLUR_DETAIL;
  for (let i = 0; i <= BLUR_DETAIL; i++) {
    checkpoints.push(100 - BLUR_HEIGHT + inc * i);
  }

  return (
    <div style={{ height: 390, position: 'relative', overflow: 'hidden' }}>

      {/* ① Base image — sharp, normal render */}
      {imgUrl
        ? <img src={imgUrl} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', background: T.card }} />
      }

      {/* ② Glur layers — wrapper clips visibility band; inner <img> carries blur */}
      {Array.from({ length: BLUR_DETAIL }, (_, step) => {
        const startOverrides: Record<number, number> = { 0: 94, 1: 90 };
        const startPct = startOverrides[step] ?? checkpoints[step];
        const offsets = [
          `rgba(0,0,0,0) ${startPct}%`,
          `rgba(0,0,0,1) ${checkpoints[step + 1]}%`,
        ];
        if (checkpoints[step + 2] !== undefined) offsets.push(`rgba(0,0,0,1) ${checkpoints[step + 2]}%`);
        if (checkpoints[step + 3] !== undefined) offsets.push(`rgba(0,0,0,0) ${checkpoints[step + 3]}%`);
        const grad = `linear-gradient(to bottom,${offsets.join(',')})`;
        return (
          <div key={step} style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            maskImage: grad,
            WebkitMaskImage: grad,
            zIndex: step + 1,
            pointerEvents: 'none',
          } as React.CSSProperties}>
            <img
              src={imgUrl} alt="" aria-hidden
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', display: 'block',
                filter: `blur(${BLUR_AMOUNT * Math.pow(2, step)}px)`,
                transform: `scale(${IMG_SCALE})`, // scale img only → hides blur edge, no offset vs base
              }}
            />
          </div>
        );
      })}

      {/* ③ Narrow dark gradient at bottom for text legibility */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
        background: 'linear-gradient(transparent 0%, rgba(10,10,10,0.05) 50%, rgba(10,10,10,0.04) 78%, rgba(10,10,10,0.37) 100%)',
        zIndex: BLUR_DETAIL + 2, pointerEvents: 'none',
      }} />

      {/* ④ Status icon — top right */}
      {statusKey && (() => {
        const s = STATUS_ICON_MAP[statusKey];
        return (
          <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: BLUR_DETAIL + 3,
            width: 42, height: 42, borderRadius: 21,
            background: s.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 3px 14px rgba(0,0,0,0.35)`,
          }}>
            <Icon name={s.icon} size={20} color={s.color} />
          </div>
        );
      })()}

      {/* ⑤ Title + chips */}
      <div style={{ position: 'absolute', bottom: 20, left: 16, right: 16, zIndex: BLUR_DETAIL + 3 }}>
        <Txt size={28} weight={800} color={T.white} style={{ display: 'block', lineHeight: 1.15, letterSpacing: -0.5, marginBottom: 10, textShadow: 'none' }}>{title}</Txt>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {genre && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, background: 'var(--c-t4)', border: '1px solid var(--c-t4)' }}>
              <Txt size={11} weight={700} color={T.white}>{genre}</Txt>
            </div>
          )}
          {rating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: 'var(--c-t4)', border: '1px solid var(--c-t4)' }}>
              <Icon name="star" size={11} color={T.gold} />
              <Txt size={11} weight={700} color={T.white}>{rating}/10</Txt>
            </div>
          )}
          {runtime && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: 'var(--c-t4)', border: '1px solid var(--c-t4)' }}>
              <Txt size={11} weight={600} color={T.white}>⏱ {runtime}</Txt>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

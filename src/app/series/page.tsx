'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg, type TMDBItem } from '@/lib/tmdb';
import { epWatchedStore, listStore } from '@/lib/store';
import { currentAiredSeason, overdueEpisodes } from '@/lib/seriesSchedule';
import { MasonryGrid2 } from '@/components/posters';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import i18next from '@/lib/i18n';

type SeriesTab = 'maratonando' | 'atrasadas' | 'finalizadas';

type WatchingItem = {
  id: number; title: string; type: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  nextSeason?: number; nextEpisode?: number;
  nextAirDate?: string | null;
  overdueSeason?: number;
  overdueEpisode?: number;
  overdueCount?: number;
  network?: string;
};

type DateResult = { label: string; isToday: boolean; isTomorrow: boolean };

export default function SeriesPage() {
  const router = useRouter();
  const { t } = useTranslation('home');
  const { theme } = useTheme();

  function formatDate(dateStr: string): DateResult {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (d.getTime() === today.getTime()) return { label: t('today'), isToday: true, isTomorrow: false };
    if (d.getTime() === tomorrow.getTime()) return { label: t('tomorrow'), isToday: false, isTomorrow: true };
    const label = new Intl.DateTimeFormat(i18next.language, { day: 'numeric', month: 'long' }).format(d);
    return { label, isToday: false, isTomorrow: false };
  }
  const isDark = theme === 'dark';
  const [tab, setTab] = useState<SeriesTab>('maratonando');
  const [items, setItems] = useState<WatchingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchedList, setWatchedList] = useState<Array<{ id: number; title: string; type: string; poster_path?: string | null }>>([]);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const watched = listStore.get('watched').filter((i) => i.type === 'tv');
    const watchedIds = new Set(watched.map((i) => i.id));
    setWatchedList(watched);

    const watching = listStore.get('watching').filter((i) => i.type === 'tv' && !watchedIds.has(i.id));
    if (watching.length === 0) { setItems([]); setLoading(false); return; }
    setLoading(true);
    Promise.all(
      watching.map(async (item) => {
        try {
          const detail = await tmdb.tvDetail(item.id);
          const next = detail?.next_episode_to_air;
          const seasonNumber = currentAiredSeason(detail || {});
          let overdue: ReturnType<typeof overdueEpisodes> = [];

          if (seasonNumber) {
            const season = await tmdb.season(item.id, seasonNumber);
            const watched = epWatchedStore.getShow(item.id)[String(seasonNumber)] ?? [];
            overdue = overdueEpisodes(season?.episodes || [], watched);
          }

          const latestOverdue = overdue.at(-1);
          return {
            id: item.id, title: detail?.name || item.title, type: item.type,
            poster_path: detail?.poster_path ?? item.poster_path ?? null,
            backdrop_path: detail?.backdrop_path ?? null,
            nextSeason: next?.season_number ?? undefined,
            nextEpisode: next?.episode_number ?? undefined,
            nextAirDate: next?.air_date ?? null,
            overdueSeason: latestOverdue?.season_number ?? seasonNumber ?? undefined,
            overdueEpisode: latestOverdue?.episode_number ?? undefined,
            overdueCount: overdue.length,
            network: (detail as any)?.networks?.[0]?.name ?? '',
          } as WatchingItem;
        } catch {
          return { ...item } as WatchingItem;
        }
      })
    ).then((res) => { setItems(res); setLoading(false); });
  }, []);

  const atrasadas = useMemo(() => items.filter((item) => (item.overdueCount ?? 0) > 0), [items]);
  const emBreve = useMemo(() =>
    items.filter((i) => i.nextAirDate)
      .sort((a, b) => new Date(a.nextAirDate!).getTime() - new Date(b.nextAirDate!).getTime()),
  [items]);
  const emBreveGroups = useMemo(() => {
    const groups = new Map<string, WatchingItem[]>();
    emBreve.forEach((item) => {
      const date = item.nextAirDate!;
      groups.set(date, [...(groups.get(date) || []), item]);
    });
    return Array.from(groups, ([date, groupItems]) => ({ date, items: groupItems }));
  }, [emBreve]);

  return (
    <Frame>
      <Screen>
        <div className="app-page-scroll" ref={scrollRef} onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 10)} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>

          {/* ── Header glass sticky ── */}
          <GlassHeader
            navTitle={t('series', { ns: 'navigation' })}
            showNavTitle={scrolled}
            contentAlign="start"
            children={
              <Txt
                size={26}
                weight={900}
                color={T.t1}
                style={{ display: 'block', letterSpacing: '-0.6px', whiteSpace: 'nowrap' }}
              >
                {t('series', { ns: 'navigation' })}
              </Txt>
            }
            right={
              <button aria-label="Notificações" onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 17, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,12,0.12)', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.14)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as React.CSSProperties}>
                <Icon name="bell" size={16} color={isDark ? '#fff' : 'rgba(0,0,0,0.75)'} />
              </button>
            }
          />

          {/* ── Tabs — sticky logo abaixo do header ── */}
          <div style={{
            position: 'sticky', top: 'calc(46px + var(--safe-area-top))', zIndex: 48,
            display: 'flex', gap: 8,
            padding: scrolled ? '4px 16px 10px' : '8px 16px 12px',
            overflowX: 'auto', scrollbarWidth: 'none',
            background: 'transparent',
            transition: 'padding 0.25s ease',
          } as React.CSSProperties}>
            {(['maratonando', 'atrasadas', 'finalizadas'] as const).map((id) => (
              <button key={id} onClick={() => setTab(id)} style={{
                minHeight: scrolled ? 34 : 36,
                padding: scrolled ? '6px 15px' : '8px 18px',
                borderRadius: 24, flexShrink: 0,
                background: tab === id
                  ? T.pillActiveBg
                  : (isDark ? 'rgba(255,255,255,0.12)' : '#fff'),
                border: tab === id
                  ? 'none'
                  : (isDark ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(0,0,0,0.11)'),
                color: tab === id
                  ? T.pillActiveText
                  : (isDark ? 'rgba(255,255,255,0.80)' : 'rgba(0,0,0,0.60)'),
                fontSize: scrolled ? 13 : 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.25s ease',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              } as React.CSSProperties}>{t(`tabs.${id}`)}</button>
            ))}
          </div>

          {/* ── Content — fade in do bg cobre gradiente ao rolar ── */}
          <div style={{ minHeight: 400 }}>

            {/* ══ TAB: Maratonando ══ */}
            {tab === 'maratonando' && (
              <div style={{ padding: '20px 16px' }}>
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} style={{ height: 112, borderRadius: 16, background: T.surface2 }} />
                    ))}
                  </div>
                ) : emBreve.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0', textAlign: 'center' }}>
                    <Icon name="calendar" size={40} color={T.t4} />
                    <Txt size={15} weight={700} color={T.t2} style={{ display: 'block' }}>{t('noUpcoming')}</Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.4, maxWidth: 240 }}>
                      {t('noUpcomingDetail')}
                    </Txt>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                    {emBreveGroups.map((group) => {
                      const groupDate = formatDate(group.date);
                      return (
                        <section key={group.date}>
                          <Txt size={20} weight={900} style={{ display: 'block', marginBottom: 10 }}>
                            {groupDate.label}
                          </Txt>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {group.items.map((item) => {
                              const thumb = tmdbImg(item.backdrop_path ?? item.poster_path, 'w342');
                              return (
                                <button
                                  key={item.id}
                                  className={groupDate.isToday ? 'series-episode-card-today' : undefined}
                                  onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                                  style={{ width: '100%', minHeight: 112, display: 'flex', alignItems: 'stretch', gap: 14, padding: 0, overflow: 'hidden', background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                                  <div style={{ width: 148, minHeight: 112, overflow: 'hidden', flexShrink: 0, background: T.surface2 }}>
                                    {thumb
                                      ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={20} color={T.t4} /></div>
                                    }
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0, padding: '14px 16px 14px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <Txt size={14} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                                      {item.title}
                                    </Txt>
                                    <Txt size={12} color={T.t3}>
                                      {item.nextSeason && item.nextEpisode
                                        ? <>{t('season', { number: item.nextSeason, ns: 'title' })} · {t('episode', { number: item.nextEpisode, ns: 'title' })}</>
                                        : t('newEpisode')}
                                    </Txt>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: Atrasadas ══ */}
            {tab === 'atrasadas' && (
              <div style={{ padding: '20px 16px' }}>
                <Txt size={22} weight={900} style={{ display: 'block', marginBottom: 4 }}>{t('tabs.atrasadas')}</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 16 }}>
                  {t('behindDetail')}
                </Txt>

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} style={{ height: 76, borderRadius: 16, background: T.surface2 }} />
                    ))}
                  </div>
                ) : atrasadas.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(52,199,89,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={30} color="#1a8f3a" />
                    </div>
                    <Txt size={15} weight={700} color={T.t1} style={{ display: 'block' }}>{t('upToDate')}</Txt>
                    <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.4 }}>{t('noBehind')}</Txt>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {atrasadas.map((item) => {
                      const thumb = tmdbImg(item.backdrop_path ?? item.poster_path, 'w342');
                      return (
                        <button
                          key={item.id}
                          onClick={() => router.push(`/title/${item.type}/${item.id}`)}
                          style={{ width: '100%', minHeight: 112, display: 'flex', alignItems: 'stretch', gap: 14, padding: 0, overflow: 'hidden', background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, cursor: 'pointer', textAlign: 'left' }}>
                          {/* Thumbnail */}
                          <div style={{ width: 148, minHeight: 112, overflow: 'hidden', flexShrink: 0, background: T.surface2, position: 'relative' }}>
                            {thumb
                              ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={20} color={T.t4} /></div>
                            }
                            <span style={{ position: 'absolute', left: 10, bottom: 10, padding: '3px 8px', borderRadius: 999, background: '#e0352b', lineHeight: 1 }}>
                              <Txt size={10} weight={800} color="#fff">{t('tags.atrasado')}</Txt>
                            </span>
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0, padding: '12px 16px 12px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <Txt size={14} weight={700} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
                              {item.title}
                            </Txt>
                            <Txt size={12} color={T.t2} style={{ display: 'block', marginBottom: 6 }}>
                              {item.overdueSeason
                                ? t('seasonNumber', { number: item.overdueSeason })
                                : t('newEpisode')}
                            </Txt>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Icon name="clock" size={13} color={T.t3} />
                              <Txt size={12} weight={700} color={T.t3}>
                                {t('overdueEpisodes', { count: item.overdueCount ?? 0 })}
                              </Txt>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: Finalizadas ══ */}
            {tab === 'finalizadas' && (
              <div style={{ padding: '20px 16px' }}>
                {watchedList.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(52,199,89,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={30} color="#1a8f3a" />
                    </div>
                    <Txt size={15} weight={700} color={T.t1} style={{ display: 'block' }}>{t('emptyFinished')}</Txt>
                  </div>
                ) : (
                  <MasonryGrid2
                    items={watchedList as unknown as TMDBItem[]}
                    onItem={(item) => router.push(`/title/${(item as any).type}/${item.id}`)}
                    padding="0"
                    getTag={() => ({ label: t('tags.concluido'), color: '#fff', bg: 'rgba(52,199,89,0.75)', icon: 'check' })}
                  />
                )}
              </div>
            )}

            <div style={{ height: 24 }} />
          </div>
        </div>
      </Screen>
    </Frame>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { ImgWithSkeleton } from '@/components/posters';
import { Icon } from '@/components/Icon';
import { GlassHeader, Screen, ScrollArea, Skeleton, Txt } from '@/components/primitives';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbRatingStore } from '@/lib/db';
import { navigateBack } from '@/lib/navigation';
import { profileStore, revStore } from '@/lib/store';
import { T } from '@/lib/tokens';
import { tmdb, tmdbImg } from '@/lib/tmdb';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

type RatingsTab = 'series' | 'filmes';
type RatingRecord = { titleId: string; rating: number; updatedAt?: unknown };
type RatedTitle = {
  key: string;
  tab: RatingsTab;
  title: string;
  subtitle: string;
  image: string | null;
  rating: number;
  href: string;
  timestamp: number;
};

function ratingTimestamp(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { seconds?: unknown }).seconds === 'number') {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  const parsed = new Date(value as string | number | Date).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dedupeRatings(records: RatingRecord[]): RatingRecord[] {
  const byTitle = new Map<string, RatingRecord>();
  records.forEach((record) => {
    if (!record.titleId || Number(record.rating) <= 0) return;
    const next = {
      ...record,
      rating: Math.max(1, Math.min(10, Number(record.rating))),
    };
    const current = byTitle.get(record.titleId);
    if (!current || ratingTimestamp(next.updatedAt) >= ratingTimestamp(current.updatedAt)) {
      byTitle.set(record.titleId, next);
    }
  });
  return Array.from(byTitle.values());
}

async function resolveRating(record: RatingRecord): Promise<RatedTitle | null> {
  const movieMatch = record.titleId.match(/^movie_(\d+)$/);
  if (movieMatch) {
    const id = Number(movieMatch[1]);
    const detail = await tmdb.movieDetail(id);
    if (!detail) return null;
    return {
      key: record.titleId,
      tab: 'filmes',
      title: detail.title || detail.original_title || '',
      subtitle: detail.release_date ? String(detail.release_date).slice(0, 4) : '',
      image: tmdbImg(detail.poster_path, 'w342'),
      rating: record.rating,
      href: `/title/movie/${id}`,
      timestamp: ratingTimestamp(record.updatedAt),
    };
  }

  const seriesMatch = record.titleId.match(/^tv_(\d+)$/);
  if (seriesMatch) {
    const id = Number(seriesMatch[1]);
    const detail = await tmdb.tvDetail(id);
    if (!detail) return null;
    return {
      key: record.titleId,
      tab: 'series',
      title: detail.name || detail.original_name || '',
      subtitle: detail.first_air_date ? String(detail.first_air_date).slice(0, 4) : '',
      image: tmdbImg(detail.poster_path, 'w342'),
      rating: record.rating,
      href: `/title/tv/${id}`,
      timestamp: ratingTimestamp(record.updatedAt),
    };
  }

  const episodeMatch = record.titleId.match(/^ep_(\d+)_s(\d+)_e(\d+)$/);
  if (!episodeMatch) return null;
  const tvId = Number(episodeMatch[1]);
  const seasonNumber = Number(episodeMatch[2]);
  const episodeNumber = Number(episodeMatch[3]);
  const [detail, season] = await Promise.all([
    tmdb.tvDetail(tvId),
    tmdb.season(tvId, seasonNumber),
  ]);
  if (!detail) return null;
  const episode = (season?.episodes ?? []).find(
    (item: { episode_number?: number }) => Number(item.episode_number) === episodeNumber,
  );
  const showName = detail.name || detail.original_name || '';
  const episodeName = episode?.name || `Episódio ${episodeNumber}`;
  const params = new URLSearchParams({
    tvId: String(tvId),
    season: String(seasonNumber),
    epNum: String(episodeNumber),
    name: episodeName,
    showName,
    runtime: String(episode?.runtime || ''),
    overview: episode?.overview || '',
    still: episode?.still_path || '',
    network: detail.networks?.[0]?.name || '',
    airDate: episode?.air_date || '',
  });
  return {
    key: record.titleId,
    tab: 'series',
    title: `${showName} · ${episodeName}`,
    subtitle: `Temporada ${seasonNumber} · Episódio ${episodeNumber}`,
    image: tmdbImg(detail.poster_path, 'w342'),
    rating: record.rating,
    href: `/episode?${params.toString()}`,
    timestamp: ratingTimestamp(record.updatedAt),
  };
}

export default function RatingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { t } = useTranslation('home');
  const [tab, setTab] = useState<RatingsTab>('series');
  const [records, setRecords] = useState<RatingRecord[]>([]);
  const [titles, setTitles] = useState<RatedTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [syncRevision, setSyncRevision] = useState(0);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab === 'series' || requestedTab === 'filmes') setTab(requestedTab);
  }, []);

  useEffect(() => {
    const refresh = () => setSyncRevision((revision) => revision + 1);
    window.addEventListener('maratonou:sync', refresh);
    return () => window.removeEventListener('maratonou:sync', refresh);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const profile = profileStore.get(user?.uid);
    const local = dedupeRatings(
      revStore
        .getByAuthor(user?.uid, profile.username || profile.name)
        .filter((review) => review.rating > 0)
        .map((review) => ({
          titleId: review.itemKey,
          rating: review.rating,
          updatedAt: review.date,
        })),
    );
    setSourceLoading(true);
    if (!user || !firebaseConfigured) {
      setRecords(local);
      setSourceLoading(false);
      return () => { cancelled = true; };
    }
    // Never seed an authenticated view from device-local reviews. Firestore
    // is the account-wide source of truth, including a valid empty result.
    setRecords([]);
    dbRatingStore.listForUser(getDB(), user.uid).then((cloud) => {
      if (!cancelled) setRecords(dedupeRatings(cloud));
    }).catch((error) => {
      console.warn('[Ratings] Could not load authoritative ratings', error);
    }).finally(() => {
      if (!cancelled) setSourceLoading(false);
    });
    return () => { cancelled = true; };
  }, [authLoading, user, syncRevision]);

  useEffect(() => {
    if (sourceLoading) {
      setLoading(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(records.map(async (record) => {
      try {
        return await resolveRating(record);
      } catch {
        return null;
      }
    })).then((resolved) => {
      if (cancelled) return;
      setTitles(
        resolved
          .filter((item): item is RatedTitle => Boolean(item?.title))
          .sort((a, b) => b.timestamp - a.timestamp),
      );
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [records, sourceLoading]);

  const visibleTitles = useMemo(
    () => titles.filter((title) => title.tab === tab),
    [tab, titles],
  );

  const actionStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 17,
    background: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
    border: isDark ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.12)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const iconColor = isDark ? '#fff' : 'rgba(0,0,0,0.70)';

  return (
    <Frame>
      <Screen>
        <ScrollArea style={{ paddingBottom: 32 }}>
          <GlassHeader
            left={(
              <button
                className="ios-top-action"
                type="button"
                aria-label={t('ratingsPage.back')}
                onClick={() => navigateBack(router)}
                style={actionStyle}
              >
                <Icon name="chevronL" size={16} color={iconColor} />
              </button>
            )}
            right={(
              <button
                className="ios-top-action"
                type="button"
                aria-label={t('ratingsPage.notifications')}
                onClick={() => router.push('/notifications')}
                style={actionStyle}
              >
                <Icon name="bell" size={16} color={iconColor} />
              </button>
            )}
            navTitle={t('ratingsPage.title')}
            showNavTitle
          />

          <div style={{ padding: '16px 16px 8px' }}>
            <Txt size={28} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.6px' }}>
              {t('ratingsPage.title')}
            </Txt>
          </div>

          <div
            role="tablist"
            aria-label={t('ratingsPage.title')}
            style={{ display: 'flex', gap: 8, padding: '8px 16px 14px' }}
          >
            {([
              ['series', t('ratingsPage.seriesTab')],
              ['filmes', t('ratingsPage.moviesTab')],
            ] as Array<[RatingsTab, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                style={{
                  minHeight: 38,
                  padding: '8px 20px',
                  borderRadius: 22,
                  background: tab === id ? T.pillActiveBg : T.surface2,
                  border: tab === id ? '1px solid transparent' : `1px solid ${T.border}`,
                  color: tab === id ? T.pillActiveText : T.t2,
                  fontFamily: "'Area','Inter',sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    gap: 14,
                    padding: 10,
                    borderRadius: 18,
                    background: T.card,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  <Skeleton w={82} h={104} radius={12} />
                  <div style={{ flex: 1, paddingTop: 12 }}>
                    <Skeleton w="70%" h={14} radius={6} />
                    <Skeleton w="44%" h={10} radius={5} style={{ marginTop: 8 }} />
                    <Skeleton w={72} h={28} radius={14} style={{ marginTop: 18 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleTitles.length === 0 ? (
            <div style={{ padding: '64px 28px', textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  margin: '0 auto 16px',
                  background: T.surface2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="starO" size={28} color={T.t3} />
              </div>
              <Txt size={16} weight={800} color={T.t1} style={{ display: 'block' }}>
                {tab === 'series' ? t('ratingsPage.emptySeries') : t('ratingsPage.emptyMovies')}
              </Txt>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
              {visibleTitles.map((title) => (
                <button
                  key={title.key}
                  type="button"
                  onClick={() => router.push(title.href)}
                  style={{
                    width: '100%',
                    minHeight: 124,
                    padding: 10,
                    borderRadius: 18,
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 14,
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'inherit',
                    fontFamily: 'inherit',
                  }}
                >
                  <ImgWithSkeleton
                    src={title.image}
                    alt={title.title}
                    width={82}
                    height={104}
                    radius={12}
                  />
                  <div style={{ flex: 1, minWidth: 0, padding: '10px 0', display: 'flex', flexDirection: 'column' }}>
                    <Txt
                      size={15}
                      weight={800}
                      color={T.t1}
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {title.title}
                    </Txt>
                    {title.subtitle && (
                      <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 5 }}>
                        {title.subtitle}
                      </Txt>
                    )}
                    <div
                      aria-label={t('ratingsPage.ratingAccessibility', { rating: title.rating })}
                      style={{
                        marginTop: 'auto',
                        alignSelf: 'flex-start',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon name="star" size={18} color="#F5C518" />
                      <Txt size={17} weight={900} color="#F5C518">{title.rating}</Txt>
                      <Txt size={11} weight={700} color={T.t3}>/10</Txt>
                    </div>
                  </div>
                  <Icon name="chevronR" size={16} color={T.t4} style={{ alignSelf: 'center' }} />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

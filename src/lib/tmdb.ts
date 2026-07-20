'use client';
import { useEffect, useState } from 'react';
import i18next from 'i18next';
import { cachedRequest } from './cache';
import { CACHE_TTL } from './dataPolicy';

export type TMDBItem = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  media_type?: 'movie' | 'tv' | 'person';
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  runtime?: number;
  episode_run_time?: number[];
  spoken_languages?: Array<{ name: string }>;
  production_countries?: Array<{ name: string }>;
  seasons?: Array<{ season_number: number }>;
  credits?: { cast: any[]; crew: any[] };
  similar?: { results: TMDBItem[] };
  videos?: { results: any[] };
  images?: {
    posters?: Array<{
      file_path: string;
      iso_639_1: string | null;
      vote_average?: number;
      vote_count?: number;
    }>;
  };
};

export type TMDBImageSize = 'w92' | 'w154' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'original';

export const tmdbImg = (path?: string | null, size: TMDBImageSize = 'w342') => {
  if (!path) return null;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/api/tmdb-image?size=${size}&path=${encodeURIComponent(normalizedPath)}`;
};

/** Converts legacy TMDB CDN URLs kept in client-side caches to the local relay. */
export const normalizeTMDBImageUrl = (value?: string | null) => {
  if (!value) return null;
  if (value.startsWith('/api/tmdb-image?')) return value;

  const match = value.match(
    /^https:\/\/image\.tmdb\.org\/t\/p\/(w92|w154|w185|w300|w342|w500|w780|original)(\/[^?#]+)$/i,
  );
  if (!match) return value;

  return tmdbImg(match[2], match[1].toLowerCase() as TMDBImageSize);
};

const get = async (endpoint: string, params: Record<string, string> = {}) => {
  const url = new URL('/api/tmdb', window.location.origin);
  url.searchParams.set('endpoint', endpoint);
  const lang = i18next.language || 'pt-BR';
  url.searchParams.set('language', lang);
  const region = lang.split('-')[1];
  if (region) url.searchParams.set('region', region);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const ttl = endpoint.startsWith('/search/') ? CACHE_TTL.recentList
    : /^\/(movie|tv|person)\/\d+/.test(endpoint) ? CACHE_TTL.title
      : CACHE_TTL.homeSection;
  return cachedRequest(`tmdb:${url.pathname}${url.search}`, ttl, async () => {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
    return res.json();
  }, { staleIfError: true });
};

export const tmdb = {
  trending: (type: 'all' | 'movie' | 'tv' = 'all', time: 'day' | 'week' = 'week') => get(`/trending/${type}/${time}`),
  nowPlaying: () => get('/movie/now_playing'),
  onAir: () => get('/tv/on_the_air'),
  popular: (type: 'movie' | 'tv' = 'movie') => get(`/${type}/popular`),
  topRated: (type: 'movie' | 'tv' = 'movie') => get(`/${type}/top_rated`),
  upcoming: (region = 'BR') => get('/movie/upcoming', { region }),
  search: (q: string) => get('/search/multi', { query: q }),
  movieDetail: (id: number | string) => get(`/movie/${id}`, { append_to_response: 'credits,similar,videos' }),
  tvDetail: (id: number | string) => get(`/tv/${id}`, { append_to_response: 'credits,similar,videos' }),
  titleDetail: (type: 'movie' | 'tv', id: number | string) => get(`/${type}/${id}`, {
    append_to_response: 'credits,similar,videos,images',
    include_image_language: 'null',
  }),
  season: (tvId: number | string, n: number) => get(`/tv/${tvId}/season/${n}`),
  personDetail: (id: number | string) => get(`/person/${id}`, { append_to_response: 'movie_credits,tv_credits,images' }),
  discover: (type: 'movie' | 'tv', params: Record<string, string>) => get(`/discover/${type}`, params),
  watchProviders: (type: 'movie' | 'tv', id: number | string) => get(`/${type}/${id}/watch/providers`),
};

export function useTMDB<T = any>(fn: () => Promise<T | null>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fn().then((d) => { if (alive) { setData(d); setLoading(false); } })
        .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { data, loading, error, retry: () => setAttempt((value) => value + 1) };
}

export const normalize = (item: TMDBItem = {} as TMDBItem) => ({
  ...item,
  id: item.id,
  title: item.title || item.name || '',
  year: (item.release_date || item.first_air_date || '').slice(0, 4),
  rating: item.vote_average ? item.vote_average.toFixed(1) : '',
  genre: (item.genres || [])[0]?.name || '',
  type: (item.media_type || (item.first_air_date ? 'tv' : 'movie')) as 'movie' | 'tv' | 'person',
  poster_path: item.poster_path,
  backdrop_path: item.backdrop_path,
  overview: item.overview || '',
});

export type NormalizedItem = ReturnType<typeof normalize>;

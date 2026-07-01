'use client';
import { useEffect, useState } from 'react';

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
};

export const tmdbImg = (path?: string | null, size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const get = async (endpoint: string, params: Record<string, string> = {}) => {
  const url = new URL('/api/tmdb', window.location.origin);
  url.searchParams.set('endpoint', endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
};

export const tmdb = {
  trending: (type: 'all' | 'movie' | 'tv' = 'all', time: 'day' | 'week' = 'week') => get(`/trending/${type}/${time}`),
  nowPlaying: () => get('/movie/now_playing'),
  onAir: () => get('/tv/on_the_air'),
  popular: (type: 'movie' | 'tv' = 'movie') => get(`/${type}/popular`),
  topRated: (type: 'movie' | 'tv' = 'movie') => get(`/${type}/top_rated`),
  upcoming: () => get('/movie/upcoming'),
  search: (q: string) => get('/search/multi', { query: q }),
  movieDetail: (id: number | string) => get(`/movie/${id}`, { append_to_response: 'credits,similar,videos' }),
  tvDetail: (id: number | string) => get(`/tv/${id}`, { append_to_response: 'credits,similar,videos' }),
  season: (tvId: number | string, n: number) => get(`/tv/${tvId}/season/${n}`),
  personDetail: (id: number | string) => get(`/person/${id}`, { append_to_response: 'movie_credits,tv_credits,images' }),
  discover: (type: 'movie' | 'tv', params: Record<string, string>) => get(`/discover/${type}`, params),
  watchProviders: (type: 'movie' | 'tv', id: number | string) => get(`/${type}/${id}/watch/providers`),
};

export function useTMDB<T = any>(fn: () => Promise<T | null>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fn().then((d) => { if (alive) { setData(d); setLoading(false); } })
        .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
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

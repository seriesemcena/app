import { tmdb } from '@/lib/tmdb';

export const tmdbService = {
  async search(query: string) {
    const data = await tmdb.search(query);
    return (data?.results ?? []) as Array<Record<string, unknown>>;
  },
};

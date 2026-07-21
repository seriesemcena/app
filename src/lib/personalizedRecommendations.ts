import { tmdb, type TMDBItem } from './tmdb';

type MediaType = 'movie' | 'tv';
type ListItem = {
  id: number;
  title: string;
  type: string;
  poster_path?: string | null;
};

type HistoryItem = ListItem & {
  mediaType: MediaType;
  status: 'watching' | 'watched';
};

export type PersonalizedRecommendations = Record<MediaType, TMDBItem[]>;

/* TMDB uses a few combined genres on TV (for example Action & Adventure),
   while movies keep those genres separate. Canonical keys let one viewing
   history drive useful suggestions for both media types. */
const MOVIE_GENRE_KEYS: Record<number, string[]> = {
  28: ['action'],
  12: ['adventure'],
  16: ['animation'],
  35: ['comedy'],
  80: ['crime'],
  99: ['documentary'],
  18: ['drama'],
  10751: ['family'],
  14: ['fantasy'],
  36: ['history'],
  27: ['horror'],
  10402: ['music'],
  9648: ['mystery'],
  10749: ['romance'],
  878: ['science-fiction'],
  10770: ['tv-movie'],
  53: ['thriller'],
  10752: ['war'],
  37: ['western'],
};

const TV_GENRE_KEYS: Record<number, string[]> = {
  10759: ['action', 'adventure'],
  16: ['animation'],
  35: ['comedy'],
  80: ['crime'],
  99: ['documentary'],
  18: ['drama'],
  10751: ['family'],
  10762: ['kids'],
  9648: ['mystery'],
  10763: ['news'],
  10764: ['reality'],
  10765: ['science-fiction', 'fantasy'],
  10766: ['soap'],
  10767: ['talk'],
  10768: ['war', 'politics'],
  37: ['western'],
};

const MOVIE_TARGET_GENRES: Record<string, number[]> = {
  action: [28], adventure: [12], animation: [16], comedy: [35], crime: [80],
  documentary: [99], drama: [18], family: [10751], fantasy: [14], history: [36],
  horror: [27], kids: [10751, 16], music: [10402], mystery: [9648], politics: [36],
  reality: [99], romance: [10749], 'science-fiction': [878], soap: [18, 10749],
  talk: [99], thriller: [53], 'tv-movie': [10770], war: [10752], western: [37],
};

const TV_TARGET_GENRES: Record<string, number[]> = {
  action: [10759], adventure: [10759], animation: [16], comedy: [35], crime: [80],
  documentary: [99], drama: [18], family: [10751], fantasy: [10765], history: [10768, 99],
  horror: [9648, 10765], kids: [10762, 10751], music: [10764], mystery: [9648],
  news: [10763], politics: [10768], reality: [10764], romance: [18, 10766],
  'science-fiction': [10765], soap: [10766], talk: [10767], thriller: [9648],
  'tv-movie': [18], war: [10768], western: [37],
};

function isMediaType(value: string): value is MediaType {
  return value === 'movie' || value === 'tv';
}

function historyItems(watching: ListItem[], watched: ListItem[]) {
  const deduped = new Map<string, HistoryItem>();

  // A completed item wins if stale local data happens to contain it in both lists.
  for (const [status, items] of [['watching', watching], ['watched', watched]] as const) {
    for (const item of items) {
      if (!isMediaType(item.type)) continue;
      deduped.set(`${item.type}:${item.id}`, { ...item, mediaType: item.type, status });
    }
  }

  return [...deduped.values()].slice(0, 36);
}

function watchedEpisodeCount(
  item: HistoryItem,
  episodeHistory: Record<string, Record<string, number[]>>,
) {
  if (item.mediaType !== 'tv') return 0;
  return Object.values(episodeHistory[String(item.id)] ?? {})
    .reduce((total, episodes) => total + episodes.length, 0);
}

function preferenceWeight(
  item: HistoryItem,
  episodeHistory: Record<string, Record<string, number[]>>,
) {
  const statusWeight = item.status === 'watched' ? 3 : 1;
  const episodeWeight = Math.min(Math.log2(watchedEpisodeCount(item, episodeHistory) + 1), 3);
  return statusWeight + episodeWeight;
}

function targetGenreScores(type: MediaType, affinities: Map<string, number>) {
  const targetMap = type === 'movie' ? MOVIE_TARGET_GENRES : TV_TARGET_GENRES;
  const scores = new Map<number, number>();

  for (const [genreKey, affinity] of affinities) {
    const ids = targetMap[genreKey] ?? [];
    for (const id of ids) scores.set(id, (scores.get(id) ?? 0) + affinity / ids.length);
  }

  return scores;
}

function rankByAffinity(items: TMDBItem[], scores: Map<number, number>, type: MediaType) {
  return items
    .map((item, index) => ({
      item: { ...item, media_type: type } as TMDBItem,
      index,
      affinity: (item.genre_ids ?? []).reduce((sum, genreId) => sum + (scores.get(genreId) ?? 0), 0),
    }))
    .sort((a, b) => b.affinity - a.affinity
      || (b.item.vote_average ?? 0) - (a.item.vote_average ?? 0)
      || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Builds recommendations from actual viewing history. Completed titles have
 * more influence than titles merely in progress; watched TV episodes add a
 * small capped signal so one very long series cannot dominate the profile.
 */
export async function getPersonalizedRecommendations({
  watching,
  watched,
  excluded,
  episodeHistory,
}: {
  watching: ListItem[];
  watched: ListItem[];
  excluded: ListItem[];
  episodeHistory: Record<string, Record<string, number[]>>;
}): Promise<PersonalizedRecommendations | null> {
  const history = historyItems(watching, watched);
  if (history.length === 0) return null;

  const detailedHistory = await Promise.all(history.map(async (item) => {
    try {
      const detail = await tmdb.basicTitle(item.mediaType, item.id) as TMDBItem;
      return { item, detail };
    } catch {
      return null;
    }
  }));

  const affinities = new Map<string, number>();
  for (const entry of detailedHistory) {
    if (!entry) continue;
    const genreKeyMap = entry.item.mediaType === 'movie' ? MOVIE_GENRE_KEYS : TV_GENRE_KEYS;
    const weight = preferenceWeight(entry.item, episodeHistory);
    for (const genre of entry.detail.genres ?? []) {
      const keys = genreKeyMap[genre.id] ?? [];
      for (const key of keys) affinities.set(key, (affinities.get(key) ?? 0) + weight / keys.length);
    }
  }

  if (affinities.size === 0) return null;

  const excludedKeys = new Set(
    excluded.filter((item) => isMediaType(item.type)).map((item) => `${item.type}:${item.id}`),
  );

  const discover = async (type: MediaType) => {
    const scores = targetGenreScores(type, affinities);
    const preferredIds = [...scores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([id]) => id);
    if (preferredIds.length === 0) return [];

    const response = await tmdb.discover(type, {
      with_genres: preferredIds.join('|'),
      sort_by: 'popularity.desc',
      include_adult: 'false',
      'vote_count.gte': type === 'movie' ? '100' : '50',
      page: '1',
    });
    const unseen = ((response?.results ?? []) as TMDBItem[])
      .filter((item) => !excludedKeys.has(`${type}:${item.id}`));
    return rankByAffinity(unseen, scores, type);
  };

  const [movie, tv] = await Promise.all([discover('movie'), discover('tv')]);
  return { movie, tv };
}

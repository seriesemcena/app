export const OVERDUE_EPISODE_WINDOW_MS = 72 * 60 * 60 * 1000;

export type ScheduledEpisode = {
  episode_number?: number | null;
  season_number?: number | null;
  air_date?: string | null;
};

export function currentAiredSeason(detail: {
  last_episode_to_air?: ScheduledEpisode | null;
  next_episode_to_air?: ScheduledEpisode | null;
  number_of_seasons?: number | null;
}): number | null {
  const lastAiredSeason = Number(detail.last_episode_to_air?.season_number);
  if (Number.isInteger(lastAiredSeason) && lastAiredSeason > 0) return lastAiredSeason;

  const nextSeason = Number(detail.next_episode_to_air?.season_number);
  if (Number.isInteger(nextSeason) && nextSeason > 0) return nextSeason;

  const totalSeasons = Number(detail.number_of_seasons);
  return Number.isInteger(totalSeasons) && totalSeasons > 0 ? totalSeasons : null;
}

export function overdueEpisodes(
  episodes: ScheduledEpisode[],
  watchedEpisodeNumbers: number[],
  now = Date.now(),
): ScheduledEpisode[] {
  const watched = new Set(watchedEpisodeNumbers);

  return episodes
    .filter((episode) => {
      const episodeNumber = Number(episode.episode_number);
      if (!Number.isInteger(episodeNumber) || episodeNumber <= 0 || watched.has(episodeNumber)) return false;
      if (!episode.air_date) return false;

      const airDate = new Date(`${episode.air_date}T00:00:00`).getTime();
      return Number.isFinite(airDate) && airDate + OVERDUE_EPISODE_WINDOW_MS <= now;
    })
    .sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
}

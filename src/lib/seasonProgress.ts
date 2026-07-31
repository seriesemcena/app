export const SEASON_PROGRESS_SCHEMA_VERSION = 1;

export type LegacyEpisodeHistory = Record<string, Record<string, number[]>>;

export type EpisodeDurationMap = Record<string, number>;

export type SeasonProgressRecord = {
  uid: string;
  seriesId: number;
  seasonNumber: number;
  watchedEpisodeNumbers: number[];
  episodeDurations: EpisodeDurationMap;
  episodeCount: number;
  watchedDurationMinutes: number;
  completedAt: string | null;
  updatedAt: string;
  source: 'episode' | 'season-finish' | 'series-finish' | 'migration' | 'reconciliation';
  schemaVersion: number;
};

export type SeasonCatalogEntry = {
  seasonNumber: number;
  episodeCount: number;
  airDate?: string | null;
};

export type SeriesSeasonState = 'upcoming' | 'watching' | 'completed' | 'available';

export type SeriesCompletionSummary = {
  completedSeasons: number;
  releasedSeasons: number;
  percentage: number;
  hasCompletedSeason: boolean;
  isFullyCompleted: boolean;
};

export function seasonProgressId(seriesId: string | number, seasonNumber: number): string {
  return `${String(seriesId)}_s${seasonNumber}`;
}

export function uniqueEpisodeNumbers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0)))
    .sort((a, b) => a - b);
}

function validMinutes(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function calculateWatchedDuration(
  watchedEpisodeNumbers: number[],
  episodeDurations: EpisodeDurationMap = {},
  fallbackRuntime = 0,
): number {
  const fallback = validMinutes(fallbackRuntime);
  return uniqueEpisodeNumbers(watchedEpisodeNumbers).reduce((sum, episodeNumber) => (
    sum + (validMinutes(episodeDurations[String(episodeNumber)]) || fallback)
  ), 0);
}

export function mergeSeasonProgress(
  current: Partial<SeasonProgressRecord> | null | undefined,
  incoming: Partial<SeasonProgressRecord>,
): SeasonProgressRecord {
  const watchedEpisodeNumbers = uniqueEpisodeNumbers([
    ...(current?.watchedEpisodeNumbers ?? []),
    ...(incoming.watchedEpisodeNumbers ?? []),
  ]);
  const episodeDurations = {
    ...(current?.episodeDurations ?? {}),
    ...(incoming.episodeDurations ?? {}),
  };
  const episodeCount = Math.max(
    Number(current?.episodeCount) || 0,
    Number(incoming.episodeCount) || 0,
  );
  const completedDates = [current?.completedAt, incoming.completedAt]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort();
  // Merge is intentionally monotonic and is used only by migrations,
  // reconciliation and explicit completion. Live unmark operations use an
  // exact replacement so a stale/legacy record cannot downgrade the most
  // advanced valid state during a conflict.
  const completed = completedDates.length > 0
    || (episodeCount > 0 && watchedEpisodeNumbers.length >= episodeCount);
  const calculatedDuration = calculateWatchedDuration(watchedEpisodeNumbers, episodeDurations);

  return {
    uid: String(incoming.uid ?? current?.uid ?? ''),
    seriesId: Number(incoming.seriesId ?? current?.seriesId ?? 0),
    seasonNumber: Number(incoming.seasonNumber ?? current?.seasonNumber ?? 0),
    watchedEpisodeNumbers,
    episodeDurations,
    episodeCount,
    watchedDurationMinutes: Math.max(
      calculatedDuration,
      Number(current?.watchedDurationMinutes) || 0,
      Number(incoming.watchedDurationMinutes) || 0,
    ),
    completedAt: completed ? (completedDates[0] ?? new Date().toISOString()) : null,
    updatedAt: String(incoming.updatedAt ?? current?.updatedAt ?? new Date().toISOString()),
    source: incoming.source ?? current?.source ?? 'reconciliation',
    schemaVersion: SEASON_PROGRESS_SCHEMA_VERSION,
  };
}

export function legacyHistoryToSeasonProgress(
  uid: string,
  legacy: LegacyEpisodeHistory,
  now = new Date().toISOString(),
): SeasonProgressRecord[] {
  const result: SeasonProgressRecord[] = [];
  for (const [seriesId, seasons] of Object.entries(legacy ?? {})) {
    for (const [seasonNumber, episodes] of Object.entries(seasons ?? {})) {
      const watchedEpisodeNumbers = uniqueEpisodeNumbers(episodes);
      if (watchedEpisodeNumbers.length === 0) continue;
      result.push(mergeSeasonProgress(null, {
        uid,
        seriesId: Number(seriesId),
        seasonNumber: Number(seasonNumber),
        watchedEpisodeNumbers,
        episodeCount: 0,
        completedAt: null,
        updatedAt: now,
        source: 'migration',
      }));
    }
  }
  return result;
}

export function recordsToLegacyHistory(records: SeasonProgressRecord[]): LegacyEpisodeHistory {
  const history: LegacyEpisodeHistory = {};
  for (const record of records) {
    const seriesId = String(record.seriesId);
    const seasonNumber = String(record.seasonNumber);
    history[seriesId] ??= {};
    history[seriesId][seasonNumber] = uniqueEpisodeNumbers([
      ...(history[seriesId][seasonNumber] ?? []),
      ...record.watchedEpisodeNumbers,
    ]);
  }
  return history;
}

export function isSeasonReleased(season: SeasonCatalogEntry, now = new Date()): boolean {
  // Missing dates are not evidence that a season has premiered. Treating
  // them as released used to move completed shows back to "watching" when
  // TMDB added an undated future season.
  if (!season.airDate) return false;
  const release = new Date(`${season.airDate}T00:00:00`);
  return !Number.isNaN(release.getTime()) && release.getTime() <= now.getTime();
}

export function seasonState(
  season: SeasonCatalogEntry,
  progress?: Partial<SeasonProgressRecord> | null,
  now = new Date(),
): SeriesSeasonState {
  const watched = uniqueEpisodeNumbers(progress?.watchedEpisodeNumbers);
  // completedAt is an explicit user action and the strongest available
  // completion signal. Catalog episode counts can be missing or can change
  // after TMDB edits a season, so they must not silently undo completion.
  if (progress?.completedAt) return 'completed';
  // Persisted viewing is stronger evidence than incomplete external
  // metadata, so an undated season with watched episodes is still released.
  if (!isSeasonReleased(season, now) && watched.length === 0) return 'upcoming';
  const total = Math.max(season.episodeCount, Number(progress?.episodeCount) || 0);
  if (total > 0 && watched.length >= total) return 'completed';
  if (watched.length > 0) return 'watching';
  return 'available';
}

export function classifySeries(
  seasons: SeasonCatalogEntry[],
  progress: SeasonProgressRecord[],
  now = new Date(),
): 'finished' | 'watching' | 'unstarted' | 'upcoming-only' {
  const regularSeasons = seasons.filter((season) => season.seasonNumber > 0);
  const bySeason = new Map(progress.map((record) => [record.seasonNumber, record]));
  const released = regularSeasons.filter((season) => (
    isSeasonReleased(season, now)
    || Boolean(bySeason.get(season.seasonNumber)?.completedAt)
    || uniqueEpisodeNumbers(bySeason.get(season.seasonNumber)?.watchedEpisodeNumbers).length > 0
  ));
  const upcoming = regularSeasons.filter((season) => !released.includes(season));
  if (released.length === 0 && upcoming.length > 0) return 'upcoming-only';

  const states = released.map((season) => seasonState(season, bySeason.get(season.seasonNumber), now));
  if (states.length > 0 && states.every((state) => state === 'completed')) return 'finished';
  if (states.some((state) => state === 'watching' || state === 'completed')) return 'watching';
  return 'unstarted';
}

export function summarizeSeriesCompletion(
  seasons: SeasonCatalogEntry[],
  progress: SeasonProgressRecord[],
  now = new Date(),
): SeriesCompletionSummary {
  const regularSeasons = seasons.filter((season) => season.seasonNumber > 0);
  const bySeason = new Map(progress.map((record) => [record.seasonNumber, record]));
  const released = regularSeasons.filter((season) => {
    const record = bySeason.get(season.seasonNumber);
    return isSeasonReleased(season, now)
      || Boolean(record?.completedAt)
      || uniqueEpisodeNumbers(record?.watchedEpisodeNumbers).length > 0;
  });
  const completedSeasons = released.filter((season) => (
    seasonState(season, bySeason.get(season.seasonNumber), now) === 'completed'
  )).length;
  const releasedSeasons = released.length;
  const percentage = releasedSeasons > 0
    ? Math.min(100, Math.round((completedSeasons / releasedSeasons) * 100))
    : 0;

  return {
    completedSeasons,
    releasedSeasons,
    percentage,
    hasCompletedSeason: completedSeasons > 0,
    isFullyCompleted: releasedSeasons > 0 && completedSeasons === releasedSeasons,
  };
}

export function splitSeasonMinutes(records: SeasonProgressRecord[]) {
  return records.reduce((totals, record) => {
    const minutes = Math.max(
      Number(record.watchedDurationMinutes) || 0,
      calculateWatchedDuration(record.watchedEpisodeNumbers, record.episodeDurations),
    );
    const completed = Boolean(record.completedAt)
      || (record.episodeCount > 0 && uniqueEpisodeNumbers(record.watchedEpisodeNumbers).length >= record.episodeCount);
    if (completed) totals.completed += minutes;
    else totals.watching += minutes;
    totals.total += minutes;
    return totals;
  }, { completed: 0, watching: 0, total: 0 });
}

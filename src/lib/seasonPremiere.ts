export type SeasonEpisodeSchedule = {
  air_date?: string | null;
};

export type SeasonSchedule = {
  air_date?: string | null;
  episodes?: SeasonEpisodeSchedule[];
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function getSeasonPremiereDate(season: SeasonSchedule | null | undefined): string | null {
  const seasonDate = season?.air_date;
  if (seasonDate && DATE_ONLY.test(seasonDate)) return seasonDate;

  const episodeDates = (season?.episodes ?? [])
    .map((episode) => episode.air_date)
    .filter((value): value is string => Boolean(value && DATE_ONLY.test(value)))
    .sort();

  return episodeDates[0] ?? null;
}

export function localPremiereDate(date: string): Date | null {
  if (!DATE_ONLY.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isFutureSeason(date: string | null, now = new Date()): boolean {
  if (!date) return false;
  const premiere = localPremiereDate(date);
  if (!premiere) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return premiere.getTime() > today.getTime();
}

export function seasonPremiereNotifyAt(date: string): string | null {
  const premiere = localPremiereDate(date);
  if (!premiere) return null;
  return new Date(premiere.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

export function formatPremiereCountdown(date: string, now = new Date()): string {
  const premiere = localPremiereDate(date);
  if (!premiere) return '';

  const totalMinutes = Math.max(0, Math.floor((premiere.getTime() - now.getTime()) / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${minutes}min`;
}

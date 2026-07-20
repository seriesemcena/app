export const FIRESTORE_PAGE_SIZE = 20;
export const ADMIN_PAGE_SIZE = 20;

export const CACHE_TTL = {
  appConfig: 5 * 60_000,
  publicProfile: 5 * 60_000,
  ratingSummary: 2 * 60_000,
  title: 30 * 60_000,
  homeSection: 10 * 60_000,
  recentList: 2 * 60_000,
} as const;

export function boundedPageSize(value = FIRESTORE_PAGE_SIZE, maximum = FIRESTORE_PAGE_SIZE) {
  if (!Number.isFinite(value)) return maximum;
  return Math.max(1, Math.min(Math.trunc(value), maximum));
}


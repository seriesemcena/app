import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

export type RecentSearchItem = {
  id: number;
  title: string;
  type: string;
  poster_path?: string | null;
  searchedAt: number;
};

export const RECENT_SEARCH_KEY = 'sec_recent_search_v1';
const RECENT_SEARCH_LIMIT = 5;

export function recentSearchKey(item: Pick<RecentSearchItem, 'id' | 'type'>) {
  return `${item.type}:${item.id}`;
}

function isRecentSearchItem(value: unknown): value is Partial<RecentSearchItem> & {
  id: number;
  title: string;
  type: string;
} {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecentSearchItem>;
  return Number.isFinite(item.id) && typeof item.title === 'string' && typeof item.type === 'string';
}

export function normalizeRecentSearches(
  items: unknown,
  fallbackTime = Date.now(),
): RecentSearchItem[] {
  if (!Array.isArray(items)) return [];

  const normalized = items
    .filter(isRecentSearchItem)
    .map((item, index) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      poster_path: typeof item.poster_path === 'string' ? item.poster_path : null,
      searchedAt: typeof item.searchedAt === 'number'
        ? item.searchedAt
        : fallbackTime - index,
    }))
    .sort((a, b) => b.searchedAt - a.searchedAt);

  const seen = new Set<string>();
  return normalized.filter((item) => {
    const key = recentSearchKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, RECENT_SEARCH_LIMIT);
}

export function mergeRecentSearches(
  ...sources: Array<RecentSearchItem[]>
): RecentSearchItem[] {
  return normalizeRecentSearches(sources.flat());
}

export function loadRecentSearchesLocal(): RecentSearchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const items = normalizeRecentSearches(
      JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]'),
    );
    // This also migrates legacy entries that did not have searchedAt.
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(items));
    return items;
  } catch {
    return [];
  }
}

export function saveRecentSearchesLocal(items: RecentSearchItem[]) {
  const normalized = normalizeRecentSearches(items);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(normalized));
    } catch {}
  }
  return normalized;
}

export function addRecentSearchLocal(
  item: Omit<RecentSearchItem, 'searchedAt'> | RecentSearchItem,
) {
  const next: RecentSearchItem = {
    ...item,
    searchedAt: 'searchedAt' in item ? item.searchedAt : Date.now(),
  };
  return saveRecentSearchesLocal([next, ...loadRecentSearchesLocal()]);
}

export function clearRecentSearchesLocal() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_SEARCH_KEY);
  } catch {}
}

function cloudRef(db: Firestore, uid: string) {
  return doc(db, 'users', uid, 'private', 'search_history');
}

export const dbRecentSearchStore = {
  async get(db: Firestore, uid: string): Promise<RecentSearchItem[]> {
    const snap = await getDoc(cloudRef(db, uid));
    return normalizeRecentSearches(snap.data()?.items);
  },

  async set(db: Firestore, uid: string, items: RecentSearchItem[]) {
    await setDoc(cloudRef(db, uid), {
      items: normalizeRecentSearches(items),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },

  async clear(db: Firestore, uid: string) {
    await setDoc(cloudRef(db, uid), {
      items: [],
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },
};

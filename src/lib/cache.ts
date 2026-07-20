import { dataCostDebug } from './devDataMetrics';

type CacheEnvelope<T> = {
  value: T;
  savedAt: number;
  expiresAt: number;
};

const memory = new Map<string, CacheEnvelope<unknown>>();
const requests = new Map<string, Promise<unknown>>();

function storageKey(key: string) {
  return `maratonou:cache:${key}`;
}

function readEnvelope<T>(key: string): CacheEnvelope<T> | null {
  const inMemory = memory.get(key) as CacheEnvelope<T> | undefined;
  if (inMemory) return inMemory;
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) || 'null') as CacheEnvelope<T> | null;
    if (parsed?.savedAt && parsed.expiresAt) {
      memory.set(key, parsed);
      return parsed;
    }
  } catch {}
  return null;
}

export function readCache<T>(key: string, allowStale = false): T | null {
  const entry = readEnvelope<T>(key);
  if (!entry) return null;
  if (!allowStale && entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

export function writeCache<T>(key: string, value: T, ttlMs: number) {
  const envelope: CacheEnvelope<T> = {
    value,
    savedAt: Date.now(),
    expiresAt: Date.now() + Math.max(1_000, ttlMs),
  };
  memory.set(key, envelope);
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(storageKey(key), JSON.stringify(envelope)); } catch {}
  }
}

export function invalidateCache(prefix: string) {
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
  if (typeof window === 'undefined') return;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(storageKey(prefix))) localStorage.removeItem(key);
    }
  } catch {}
}

export async function cachedRequest<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: { force?: boolean; staleIfError?: boolean } = {},
): Promise<T> {
  if (!options.force) {
    const fresh = readCache<T>(key);
    if (fresh !== null) return fresh;
  }
  const existing = requests.get(key) as Promise<T> | undefined;
  if (existing) {
    dataCostDebug.requestStart(key);
    return existing;
  }
  dataCostDebug.requestStart(key);
  const request = loader()
    .then((value) => {
      writeCache(key, value, ttlMs);
      return value;
    })
    .catch((error) => {
      const stale = options.staleIfError === false ? null : readCache<T>(key, true);
      if (stale !== null) return stale;
      throw error;
    })
    .finally(() => {
      requests.delete(key);
      dataCostDebug.requestEnd(key);
    });
  requests.set(key, request);
  return request;
}

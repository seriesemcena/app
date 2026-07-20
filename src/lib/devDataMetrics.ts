type QueryMetric = {
  name: string;
  documents: number;
  at: string;
};

type ImageMetric = {
  name: string;
  inputBytes: number;
  outputBytes: number;
  at: string;
};

const enabled = process.env.NODE_ENV === 'development';
const queries: QueryMetric[] = [];
const activeListeners = new Map<string, number>();
const inFlight = new Set<string>();

function emit(label: string, payload: unknown) {
  if (!enabled || typeof console === 'undefined') return;
  console.debug(`[DataCost] ${label}`, payload);
}

export const dataCostDebug = {
  query(name: string, documents: number) {
    if (!enabled) return;
    const metric = { name, documents, at: new Date().toISOString() };
    queries.push(metric);
    if (queries.length > 200) queries.shift();
    emit('query', metric);
  },
  listenerStart(name: string) {
    if (!enabled) return () => {};
    activeListeners.set(name, (activeListeners.get(name) || 0) + 1);
    emit('listener:start', { name, active: activeListeners.get(name) });
    return () => {
      const next = Math.max(0, (activeListeners.get(name) || 1) - 1);
      if (next) activeListeners.set(name, next); else activeListeners.delete(name);
      emit('listener:stop', { name, active: next });
    };
  },
  requestStart(key: string) {
    if (!enabled) return true;
    if (inFlight.has(key)) {
      emit('duplicate-blocked', { key });
      return false;
    }
    inFlight.add(key);
    return true;
  },
  requestEnd(key: string) {
    if (enabled) inFlight.delete(key);
  },
  image(name: string, inputBytes: number, outputBytes: number) {
    if (!enabled) return;
    const metric: ImageMetric = { name, inputBytes, outputBytes, at: new Date().toISOString() };
    emit('image', { ...metric, reduction: inputBytes ? Math.round((1 - outputBytes / inputBytes) * 100) : 0 });
  },
  snapshot() {
    return {
      queries: [...queries],
      activeListeners: Object.fromEntries(activeListeners),
      inFlight: [...inFlight],
    };
  },
};

declare global {
  interface Window {
    __MARATONOU_DATA_COST__?: typeof dataCostDebug;
  }
}

if (enabled && typeof window !== 'undefined') {
  window.__MARATONOU_DATA_COST__ = dataCostDebug;
}


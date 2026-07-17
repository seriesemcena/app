'use client';

export type Prefs = { genres?: string[]; streams?: string[]; notifications?: string[] };

const PREFS_KEY = 'sec_prefs';

export const prefsStore = {
  get(): Prefs {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
  },
  set(p: Prefs) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
  },
};

export type Review = {
  id: string; user: string; avatar: string; photoUrl?: string; rating: number; text: string;
  gifUrl?: string; date: string; likes?: number; likedBy?: string[];
  replies?: Array<{ id: string; user: string; avatar: string; photoUrl?: string; text: string; date: string; likes?: number; likedBy?: string[] }>;
};

const REV_KEY = 'sec_reviews_v1';

export const revStore = {
  get(itemKey: string): Review[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(REV_KEY) || '{}')[itemKey] || []; } catch { return []; }
  },
  set(itemKey: string, reviews: Review[]) {
    if (typeof window === 'undefined') return;
    try {
      const all = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
      all[itemKey] = reviews;
      localStorage.setItem(REV_KEY, JSON.stringify(all));
    } catch {}
  },
  addReview(itemKey: string, review: Review) {
    const list = revStore.get(itemKey);
    list.unshift(review);
    revStore.set(itemKey, list);
    return list;
  },
  countAll(): number {
    if (typeof window === 'undefined') return 0;
    try {
      const all = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
      return Object.values(all).reduce((sum: number, arr: unknown) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    } catch { return 0; }
  },
  /** Returns all reviews across ALL keys that belong to a given username */
  getByUser(username: string): Array<Review & { itemKey: string }> {
    if (typeof window === 'undefined') return [];
    try {
      const all: Record<string, Review[]> = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
      const result: Array<Review & { itemKey: string }> = [];
      for (const [key, reviews] of Object.entries(all)) {
        if (!Array.isArray(reviews)) continue;
        for (const r of reviews) {
          if (r.user === username) result.push({ ...r, itemKey: key });
        }
      }
      return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch { return []; }
  },
  toggleLike(itemKey: string, reviewId: string, userId = 'me') {
    const list = revStore.get(itemKey);
    const rev = list.find((r) => r.id === reviewId);
    if (!rev) return list;
    rev.likedBy = rev.likedBy || [];
    const idx = rev.likedBy.indexOf(userId);
    if (idx >= 0) rev.likedBy.splice(idx, 1); else rev.likedBy.push(userId);
    rev.likes = rev.likedBy.length;
    revStore.set(itemKey, list);
    return list;
  },
};

/* ─── Watched episodes store ────────────────────────────────
   Format: { [tmdbTvId: string]: { [season: string]: number[] } }
   Key: localStorage 'sec_ep_watched_v1'
─────────────────────────────────────────────────────────── */
const EP_KEY = 'sec_ep_watched_v1';

export const epWatchedStore = {
  getAll(): Record<string, Record<string, number[]>> {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(EP_KEY) || '{}'); } catch { return {}; }
  },
  getShow(tvId: string | number): Record<string, number[]> {
    return epWatchedStore.getAll()[String(tvId)] ?? {};
  },
  isWatched(tvId: string | number, season: number, epNum: number): boolean {
    const show = epWatchedStore.getShow(tvId);
    return (show[String(season)] ?? []).includes(epNum);
  },
  markWatched(tvId: string | number, season: number, epNum: number) {
    const all  = epWatchedStore.getAll();
    const id   = String(tvId);
    const s    = String(season);
    if (!all[id])    all[id]    = {};
    if (!all[id][s]) all[id][s] = [];
    if (!all[id][s].includes(epNum)) all[id][s].push(epNum);
    try { localStorage.setItem(EP_KEY, JSON.stringify(all)); } catch {}
  },
  unmarkWatched(tvId: string | number, season: number, epNum: number) {
    const all = epWatchedStore.getAll();
    const id  = String(tvId);
    const s   = String(season);
    if (!all[id]?.[s]) return;
    all[id][s] = all[id][s].filter((n) => n !== epNum);
    try { localStorage.setItem(EP_KEY, JSON.stringify(all)); } catch {}
  },
  setShow(tvId: string | number, data: Record<string, number[]>) {
    const all = epWatchedStore.getAll();
    all[String(tvId)] = data;
    try { localStorage.setItem(EP_KEY, JSON.stringify(all)); } catch {}
  },
};

/* ─── Profile store ─── */
export type Profile = {
  name: string;
  username: string;
  bio: string;
  avatarLetter: string;
  avatarGradient: string;
  avatarImage: string;   // base64 data URL
  coverImage: string;    // base64 data URL
  social: { instagram: string; twitter: string; letterboxd: string };
  streamings: string[];
  genres: string[];
  followers: number;
  following: number;
};

export const PROFILE_KEY_BASE = 'sec_profile_v1';
export function profileKey(uid?: string | null) {
  return uid ? `${PROFILE_KEY_BASE}_${uid}` : PROFILE_KEY_BASE;
}

const PROFILE_DEFAULT: Profile = {
  name: '',
  username: '',
  bio: '',
  avatarLetter: '',
  avatarGradient: 'linear-gradient(135deg,#C069FF,#c030a0)',
  avatarImage: '',
  coverImage: '',
  social: { instagram: '', twitter: '', letterboxd: '' },
  streamings: [],
  genres: [],
  followers: 0,
  following: 0,
};

export const profileStore = {
  get(uid?: string | null): Profile {
    if (typeof window === 'undefined') return PROFILE_DEFAULT;
    const key = profileKey(uid);
    try { return { ...PROFILE_DEFAULT, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return PROFILE_DEFAULT; }
  },
  set(p: Partial<Profile>, uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = profileKey(uid);
    try { localStorage.setItem(key, JSON.stringify({ ...profileStore.get(uid), ...p })); } catch {}
  },
  clear(uid?: string | null) {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(profileKey(uid)); } catch {}
  },
};

export const SAMPLE_REVIEWS: Review[] = [
  { id: 'r1', user: 'Ana Lima', avatar: 'AL', rating: 9, text: 'Uma das melhores séries dos últimos anos. Atuações impecáveis!', date: '20 abr 2025', likes: 12, likedBy: [], replies: [] },
  { id: 'r2', user: 'Marcos Pinto', avatar: 'MP', rating: 8, text: 'Excelente roteiro. Alguns momentos da terceira temporada são lentos, mas compensa no final.', date: '15 abr 2025', likes: 7, likedBy: [], replies: [] },
  { id: 'r3', user: 'Julia Souza', avatar: 'JS', rating: 10, text: 'Obra-prima absoluta. Recomendo para todos!', date: '10 abr 2025', likes: 24, likedBy: [], replies: [] },
];


/* ─── Home slider store (admin-curated) ─── */
export type SliderCategory = 'nos_cinemas' | 'no_streaming' | 'em_breve' | null;

export interface SliderItem {
  id: number;
  title: string;
  type: 'movie' | 'tv';
  backdrop_path: string | null;
  poster_path:   string | null;
  overview:      string;
  buttonText:    string;       // e.g. "Quero ver", "Assistir agora"
  category:      SliderCategory; // badge shown on the card
}

const SLIDER_KEY = 'sec_admin_slider_v1';

export const sliderStore = {
  get(): SliderItem[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(SLIDER_KEY) || '[]'); } catch { return []; }
  },
  set(items: SliderItem[]) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(SLIDER_KEY, JSON.stringify(items)); } catch {}
  },
};


/* ─── Notified releases store (avoids duplicate notifications) ─── */
const NOTIFIED_KEY = 'sec_notified_releases_v1';

export const notifiedStore = {
  get(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}'); } catch { return {}; }
  },
  set(data: Record<string, string>) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(data)); } catch {}
  },
  has(key: string): boolean {
    return key in notifiedStore.get();
  },
  mark(key: string) {
    const all = notifiedStore.get();
    all[key] = new Date().toISOString();
    notifiedStore.set(all);
  },
  clear() {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(NOTIFIED_KEY); } catch {}
  },
};

type ListType = 'want' | 'watching' | 'watched' | 'favorites';
const LIST_KEY = 'sec_lists_v1';

export const listStore = {
  get(type: ListType): Array<{ id: number; title: string; type: string; poster_path?: string | null }> {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}')[type] || []; } catch { return []; }
  },
  add(type: ListType, item: { id: number; title: string; type: string; poster_path?: string | null }) {
    const all = (() => { try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; } })();
    const cur = all[type] || [];
    if (!cur.some((x: any) => x.id === item.id)) cur.unshift(item);
    all[type] = cur;
    try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}
    return cur;
  },
  remove(type: ListType, id: number) {
    const all = (() => { try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; } })();
    all[type] = (all[type] || []).filter((x: any) => x.id !== id);
    try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}
    return all[type];
  },
};

/* ─── Notification inbox store ─── */
export type InboxNotif = {
  id: string;
  type: 'new_episode' | 'like' | 'reply' | 'follow' | 'release' | 'general';
  title: string;
  body: string;
  time: string;    // ISO date
  read: boolean;
  link?: string;   // optional route to open on tap
};

// Per-user key: sec_notif_inbox_v1_<uid>
// When uid is absent the key resolves to 'sec_notif_inbox_v1_' which
// contains no data — unauthenticated callers always see an empty inbox.
const inboxKey = (uid?: string | null) => `sec_notif_inbox_v1_${uid ?? ''}`;

// Legacy unscoped key written by the old code — kept only for cleanup.
const INBOX_KEY_LEGACY = 'sec_notif_inbox_v1';

const INBOX_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function readInbox(uid?: string | null): InboxNotif[] {
  if (typeof window === 'undefined') return [];
  const key = inboxKey(uid);
  try {
    const all: InboxNotif[] = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();
    const filtered = all.filter(n => now - new Date(n.time).getTime() < INBOX_TTL);
    if (filtered.length !== all.length) localStorage.setItem(key, JSON.stringify(filtered));
    return filtered.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  } catch { return []; }
}

export const notifInboxStore = {
  get(uid?: string | null): InboxNotif[] { return readInbox(uid); },
  add(n: InboxNotif, uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = inboxKey(uid);
    try {
      const all: InboxNotif[] = JSON.parse(localStorage.getItem(key) || '[]');
      all.unshift(n);
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  },
  markRead(id: string, uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = inboxKey(uid);
    try {
      const all = readInbox(uid).map(n => n.id === id ? { ...n, read: true } : n);
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  },
  markAllRead(uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = inboxKey(uid);
    try {
      const all = readInbox(uid).map(n => ({ ...n, read: true }));
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  },
  unreadCount(uid?: string | null): number {
    return readInbox(uid).filter(n => !n.read).length;
  },
  clear(uid?: string | null) {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(inboxKey(uid)); } catch {}
  },
  /** Remove the unscoped legacy key that caused cross-account bleed. */
  clearLegacy() {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(INBOX_KEY_LEGACY); } catch {}
  },
};

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
  id: string; user: string; avatar: string; rating: number; text: string;
  date: string; likes?: number; likedBy?: string[];
  replies?: Array<{ id: string; user: string; avatar: string; text: string; date: string; likes?: number; likedBy?: string[] }>;
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
};

const PROFILE_KEY = 'sec_profile_v1';
const PROFILE_DEFAULT: Profile = {
  name: 'Lucas Tales',
  username: 'lucastales',
  bio: '',
  avatarLetter: 'L',
  avatarGradient: 'linear-gradient(135deg,#E050C8,#c030a0)',
  avatarImage: '',
  coverImage: '',
  social: { instagram: '', twitter: '', letterboxd: '' },
  streamings: [],
  genres: [],
};

export const profileStore = {
  get(): Profile {
    if (typeof window === 'undefined') return PROFILE_DEFAULT;
    try { return { ...PROFILE_DEFAULT, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') }; } catch { return PROFILE_DEFAULT; }
  },
  set(p: Partial<Profile>) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profileStore.get(), ...p })); } catch {}
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

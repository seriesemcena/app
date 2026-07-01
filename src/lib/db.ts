/* ─────────────────────────────────────────────────────────────
   Firestore data layer — mirrors the localStorage store.ts API
   so components can swap between local and cloud storage.

   Firestore structure:
     users/{uid}/profile    — Profile doc
     users/{uid}/lists      — { want, watching, watched }
     users/{uid}/prefs      — Prefs
     users/{uid}/fcm_tokens — { tokens: string[] }
     reviews/{titleKey}     — { items: Review[] }
     config/slider          — { items: SliderItem[] }
   ───────────────────────────────────────────────────────────── */
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove,
  type Firestore,
} from 'firebase/firestore';
import type { Profile, Review, SliderItem, Prefs } from './store';

type ListType = 'want' | 'watching' | 'watched' | 'favorites';
type ListItem = { id: number; title: string; type: string; poster_path?: string | null };

// ── helpers ─────────────────────────────────────────────────

async function getField<T>(db: Firestore, path: string[], field: string, fallback: T): Promise<T> {
  try {
    const snap = await getDoc(doc(db, ...path as [string, string, ...string[]]));
    const data = snap.data();
    return (data?.[field] ?? fallback) as T;
  } catch { return fallback; }
}

async function setField(db: Firestore, path: string[], field: string, value: unknown) {
  await setDoc(doc(db, ...path as [string, string, ...string[]]), { [field]: value }, { merge: true });
}

// ── Profile ──────────────────────────────────────────────────

const PROFILE_DEFAULT: Profile = {
  name: '', username: '', bio: '',
  avatarLetter: '', avatarGradient: '', avatarImage: '', coverImage: '',
  social: { instagram: '', twitter: '', letterboxd: '' },
  streamings: [], genres: [],
};

export const dbProfileStore = {
  async get(db: Firestore, uid: string): Promise<Profile> {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return { ...PROFILE_DEFAULT, ...(snap.data()?.profile ?? {}) } as Profile;
    } catch { return PROFILE_DEFAULT; }
  },
  async set(db: Firestore, uid: string, p: Partial<Profile>) {
    const current = await dbProfileStore.get(db, uid);
    await setField(db, ['users', uid], 'profile', { ...current, ...p });
  },
};

// ── Lists ────────────────────────────────────────────────────

export const dbListStore = {
  async get(db: Firestore, uid: string, type: ListType): Promise<ListItem[]> {
    return getField<ListItem[]>(db, ['users', uid], `lists_${type}`, []);
  },
  async add(db: Firestore, uid: string, type: ListType, item: ListItem) {
    const current = await dbListStore.get(db, uid, type);
    if (current.some((x) => x.id === item.id)) return current;
    const updated = [item, ...current];
    await setField(db, ['users', uid], `lists_${type}`, updated);
    return updated;
  },
  async remove(db: Firestore, uid: string, type: ListType, id: number) {
    const current = await dbListStore.get(db, uid, type);
    const updated = current.filter((x) => x.id !== id);
    await setField(db, ['users', uid], `lists_${type}`, updated);
    return updated;
  },
};

// ── Reviews ──────────────────────────────────────────────────

export const dbRevStore = {
  async get(db: Firestore, titleKey: string): Promise<Review[]> {
    return getField<Review[]>(db, ['reviews', titleKey], 'items', []);
  },
  async set(db: Firestore, titleKey: string, reviews: Review[]) {
    await setField(db, ['reviews', titleKey], 'items', reviews);
  },
  async add(db: Firestore, titleKey: string, review: Review) {
    const current = await dbRevStore.get(db, titleKey);
    const updated = [review, ...current];
    await setField(db, ['reviews', titleKey], 'items', updated);
    return updated;
  },
  async toggleLike(db: Firestore, titleKey: string, reviewId: string, userId = 'me') {
    const list = await dbRevStore.get(db, titleKey);
    const rev = list.find((r) => r.id === reviewId);
    if (!rev) return list;
    rev.likedBy = rev.likedBy ?? [];
    const idx = rev.likedBy.indexOf(userId);
    if (idx >= 0) rev.likedBy.splice(idx, 1); else rev.likedBy.push(userId);
    rev.likes = rev.likedBy.length;
    await setField(db, ['reviews', titleKey], 'items', list);
    return list;
  },
};

// ── Prefs ────────────────────────────────────────────────────

export const dbPrefsStore = {
  async get(db: Firestore, uid: string): Promise<Prefs> {
    return getField<Prefs>(db, ['users', uid], 'prefs', {});
  },
  async set(db: Firestore, uid: string, prefs: Prefs) {
    await setField(db, ['users', uid], 'prefs', prefs);
  },
};

// ── Slider (admin / shared config) ───────────────────────────

export const dbSliderStore = {
  async get(db: Firestore): Promise<SliderItem[]> {
    return getField<SliderItem[]>(db, ['config', 'slider'], 'items', []);
  },
  async set(db: Firestore, items: SliderItem[]) {
    await setField(db, ['config', 'slider'], 'items', items);
  },
};

// ── FCM Tokens ───────────────────────────────────────────────

export const dbTokenStore = {
  async save(db: Firestore, uid: string, token: string) {
    try {
      await updateDoc(doc(db, 'users', uid), { fcm_tokens: arrayUnion(token) });
    } catch {
      await setDoc(doc(db, 'users', uid), { fcm_tokens: [token] }, { merge: true });
    }
  },
  async remove(db: Firestore, uid: string, token: string) {
    try {
      await updateDoc(doc(db, 'users', uid), { fcm_tokens: arrayRemove(token) });
    } catch {}
  },
};

// ── Sync: Firestore → localStorage (runs on every login) ────────

export async function syncFromFirestore(db: Firestore, uid: string) {
  if (typeof window === 'undefined') return;
  try {
    const LIST_KEY = 'sec_lists_v1';
    const all: Record<string, ListItem[]> = (() => {
      try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; }
    })();
    let changed = false;
    for (const type of ['want', 'watching', 'watched', 'favorites'] as ListType[]) {
      const items = await dbListStore.get(db, uid, type);
      if (items.length > 0) {
        all[type] = items;
        changed = true;
      }
    }
    if (changed) {
      try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}
    }
    console.info('[DB] Firestore → localStorage sync ✓');
  } catch (e) {
    console.warn('[DB] Sync from Firestore failed', e);
  }
}

// ── Migration: localStorage → Firestore (runs once after login) ──

export async function migrateLocalToFirestore(db: Firestore, uid: string) {
  if (typeof window === 'undefined') return;
  const MIGRATED_KEY = `sec_migrated_${uid}`;
  if (localStorage.getItem(MIGRATED_KEY)) return; // already done

  try {
    const { listStore, revStore, profileStore, prefsStore } = await import('./store');

    const profile = profileStore.get();
    if (profile.name) await dbProfileStore.set(db, uid, profile);

    for (const type of ['want', 'watching', 'watched', 'favorites'] as ListType[]) {
      const items = listStore.get(type);
      if (items.length) await setField(db, ['users', uid], `lists_${type}`, items);
    }

    const prefs = prefsStore.get();
    if (Object.keys(prefs).length) await dbPrefsStore.set(db, uid, prefs);

    // migrate reviews
    const allReviews = (() => { try { return JSON.parse(localStorage.getItem('sec_reviews_v1') || '{}'); } catch { return {}; } })();
    for (const [key, items] of Object.entries(allReviews)) {
      if (Array.isArray(items) && items.length) {
        await dbRevStore.set(db, key, items as Review[]);
      }
    }

    localStorage.setItem(MIGRATED_KEY, '1');
    console.info('[DB] localStorage migrated to Firestore ✓');
  } catch (e) {
    console.warn('[DB] Migration failed', e);
  }
}

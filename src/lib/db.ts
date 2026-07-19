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
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, increment, writeBatch,
  collection, addDoc, getDocs, deleteDoc, query, orderBy, limit, onSnapshot, where,
  deleteField,
  type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import type { Profile, Review, SliderItem, Prefs } from './store';
import { profileKey } from './store';
import { slugifyUsername, usernameFromNameOrEmail, usernameCandidate, USERNAME_FALLBACK } from './username';

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
  followers: 0, following: 0,
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

export type UserSearchResult = {
  uid: string;
  name: string;
  username: string;
  avatarLetter: string;
  avatarGradient: string;
  avatarImage: string;
  bio: string;
};

export async function searchUsers(db: Firestore, q: string): Promise<UserSearchResult[]> {
  if (!q) return [];
  const lower = q.toLowerCase();
  try {
    const snap = await getDocs(
      query(collection(db, 'users'),
        where('profile.username', '>=', lower),
        where('profile.username', '<=', lower + ''),
        limit(20))
    );
    const byUsername = snap.docs.map(d => {
      const p = d.data()?.profile ?? {};
      return { uid: d.id, name: p.name || '', username: p.username || '', avatarLetter: p.avatarLetter || '', avatarGradient: p.avatarGradient || '', avatarImage: p.avatarImage || '', bio: p.bio || '' };
    }).filter(u => u.username);

    // Also search by name if username search returned nothing
    if (byUsername.length === 0) {
      const snap2 = await getDocs(
        query(collection(db, 'users'),
          where('profile.name', '>=', q),
          where('profile.name', '<=', q + ''),
          limit(20))
      );
      return snap2.docs.map(d => {
        const p = d.data()?.profile ?? {};
        return { uid: d.id, name: p.name || '', username: p.username || '', avatarLetter: p.avatarLetter || '', avatarGradient: p.avatarGradient || '', avatarImage: p.avatarImage || '', bio: p.bio || '' };
      }).filter(u => u.name);
    }
    return byUsername;
  } catch { return []; }
}

export async function getUserByUsername(
  db: Firestore, username: string,
): Promise<{ uid: string; profile: Profile; followingCount: number } | null> {
  const build = (d: { id: string; data: () => any }) => ({
    uid: d.id,
    profile: { ...PROFILE_DEFAULT, ...(d.data()?.profile ?? {}) } as Profile,
    // following_list is the source of truth — profile.following drifts out
    // of sync (accounts exist with 3 entries but a stored count of 0).
    followingCount: (d.data()?.following_list ?? []).length as number,
  });
  const tryQuery = async (field: string, op: '==' | 'array-contains', value: string) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where(field, op as any, value), limit(1))
      );
      return snap.empty ? null : build(snap.docs[0]);
    } catch { return null; }
  };

  // 1. Canonical username
  const byUsername = await tryQuery('profile.username', '==', username);
  if (byUsername) return byUsername;
  // 2. Previous username (kept when the slug migration renamed the account)
  const byAlias = await tryQuery('profile.aliases', 'array-contains', username);
  if (byAlias) return byAlias;
  // 3. Display name — legacy feed/activity links carry the displayName
  const byName = await tryQuery('profile.name', '==', username);
  if (byName) return byName;
  // 4. A uid was passed instead of a username (e.g. from /search)
  try {
    const snap = await getDoc(doc(db, 'users', username));
    if (snap.exists()) return build(snap as any);
  } catch { /* ignore */ }
  return null;
}

/** True when the username already belongs to a different account. */
export async function isUsernameTaken(db: Firestore, username: string, exceptUid?: string): Promise<boolean> {
  if (!username) return false;
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('profile.username', '==', username), limit(2))
    );
    return snap.docs.some(d => d.id !== exceptUid);
  } catch {
    return false; // can't verify (rules/offline) — don't block the user
  }
}

/**
 * First free username in the base, base-2, base-3 … sequence.
 * Degrades to `base` when the uniqueness query can't run.
 */
export async function resolveUniqueUsername(db: Firestore, base: string, exceptUid?: string): Promise<string> {
  const safeBase = base || USERNAME_FALLBACK;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const candidate = usernameCandidate(safeBase, attempt);
    if (!(await isUsernameTaken(db, candidate, exceptUid))) return candidate;
  }
  return `${safeBase}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * One-time migration: derive the username from the user's Name.
 * The old username is kept in `profile.aliases` so previously shared
 * /user/<old> links still resolve. Runs once per account, and never
 * overwrites a username the user set by hand (usernameMigrated).
 */
export async function migrateUsernameToSlug(
  db: Firestore,
  uid: string,
  authName?: string | null,
  email?: string | null,
): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const profile = (snap.data()?.profile ?? {}) as Profile;
    const current = profile.username || '';

    // A username the user picked by hand is final.
    if (profile.usernameCustom) return current || null;

    // Some accounts never stored a name — backfill it from the auth
    // displayName so the profile renders and the slug can be derived.
    const name = profile.name || authName || '';

    // Derive from the Name, then the email prefix. Never the generic
    // fallback: an account with nothing to slug keeps what it has.
    const base =
      slugifyUsername(name) ||
      slugifyUsername((email || '').split('@')[0]);

    const nameChanged = !profile.name && !!name;
    if (!base || current === base) {
      if (nameChanged || !profile.usernameMigrated) {
        await setField(db, ['users', uid], 'profile', {
          ...profile, ...(nameChanged ? { name } : {}), usernameMigrated: true,
        });
      }
      return current || null;
    }

    const next = await resolveUniqueUsername(db, base, uid);
    // Keep old usernames resolvable, but never the generic fallback —
    // several accounts may have been given it.
    const aliases = Array.from(new Set(
      [...(profile.aliases ?? []), current].filter(a => a && a !== USERNAME_FALLBACK)
    ));
    await setField(db, ['users', uid], 'profile', {
      ...profile,
      ...(nameChanged ? { name } : {}),
      username: next, aliases, usernameMigrated: true,
    });
    return next;
  } catch { return null; }
}

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

// New model: reviews/{titleKey}/items/{reviewId} — ONE DOC PER REVIEW.
// Each doc carries authorUid so the security rules can hold every review to
// its author (create/delete). The old model (a single shared `items` array on
// reviews/{titleKey}) could not be protected: any signed-in user could rewrite
// everyone's comments, and two simultaneous writers silently dropped one.
// Legacy array docs are merged into reads as read-only history; writes only
// ever touch the subcollection.

const revCol = (db: Firestore, titleKey: string) => collection(db, 'reviews', titleKey, 'items');

/** Firestore rejects `undefined` values — strip them via JSON round-trip. */
const stripUndefined = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const dbRevStore = {
  async get(db: Firestore, titleKey: string): Promise<Review[]> {
    // Each source fails independently: if the console still has the old rules
    // (no subcollection match → deny), legacy comments must keep rendering.
    const [subSnap, legacy] = await Promise.all([
      getDocs(revCol(db, titleKey)).catch(() => null),
      getField<Review[]>(db, ['reviews', titleKey], 'items', []),
    ]);
    const subs = subSnap ? subSnap.docs.map(d => d.data() as Review) : [];
    const seen = new Set(subs.map(r => r.id));
    return [...subs, ...legacy.filter(r => !seen.has(r.id))]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  /** `review.uid` must be the signed-in user's uid — the rules verify it. */
  async add(db: Firestore, titleKey: string, review: Review) {
    if (!review.uid) return; // signed out → review stays local-only
    await setDoc(
      doc(revCol(db, titleKey), review.id),
      stripUndefined({ ...review, authorUid: review.uid }),
    );
  },

  /** Rules only let the author delete. Legacy array items are frozen; deleting
      them is a silent no-op (the subcollection doc never existed). */
  async remove(db: Firestore, titleKey: string, reviewId: string): Promise<void> {
    await deleteDoc(doc(revCol(db, titleKey), reviewId));
  },

  /** Append a reply to a review (possibly someone else's — the rules allow
      third parties to touch only likes/replies). False → legacy-only review. */
  async addReply(
    db: Firestore, titleKey: string, reviewId: string,
    reply: NonNullable<Review['replies']>[number],
  ): Promise<boolean> {
    try {
      const ref  = doc(revCol(db, titleKey), reviewId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return false;
      const current = (snap.data() as Review).replies || [];
      await updateDoc(ref, { replies: stripUndefined([...current, reply]) });
      return true;
    } catch { return false; }
  },

  /** Toggle a like. Null → legacy-only review, caller keeps its local state. */
  async toggleLike(
    db: Firestore, titleKey: string, reviewId: string, userId: string,
  ): Promise<Review[] | null> {
    try {
      const ref  = doc(revCol(db, titleKey), reviewId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const likedBy = (((snap.data() as Review).likedBy) ?? []).slice();
      const idx = likedBy.indexOf(userId);
      if (idx >= 0) likedBy.splice(idx, 1); else likedBy.push(userId);
      await updateDoc(ref, { likedBy, likes: likedBy.length });
      return dbRevStore.get(db, titleKey);
    } catch { return null; }
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

// ── Activity feed (list actions + reviews visible to all) ────
// Firestore: activity/{auto-id}  ordered by createdAt desc

export type ActivityDoc = {
  uid:       string;
  reviewId?: string;       // links feed item to its exact review/replies
  username:  string;
  avatar:    string;
  photoUrl:  string;
  titleKey:  string;       // e.g. "tv_1396"
  titleName: string;
  poster:    string | null;
  action:    'watched' | 'watching' | 'want' | 'reviewed';
  rating:    number;       // 0 if not a review
  text:      string;       // review text, empty otherwise
  mediaUrl?: string;       // optional GIF or external image URL
  spoiler?:  boolean;
  createdAt: string;       // ISO string
};

export const dbActivityStore = {
  async add(db: Firestore, item: ActivityDoc): Promise<void> {
    try { await addDoc(collection(db, 'activity'), item); } catch {}
  },

  async getRecent(db: Firestore, limitN = 60): Promise<(ActivityDoc & { docId: string })[]> {
    try {
      const q    = query(collection(db, 'activity'), orderBy('createdAt', 'desc'), limit(limitN));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ docId: d.id, ...d.data() as ActivityDoc }));
    } catch { return []; }
  },

  async delete(db: Firestore, docId: string): Promise<void> {
    try { await deleteDoc(doc(db, 'activity', docId)); } catch {}
  },
};

// ── Reports ──────────────────────────────────────────────────
// Firestore: reports/{auto-id}

export const dbReportStore = {
  async add(db: Firestore, report: {
    itemId: string;
    reportedUser: string;
    content: string;
    reportedBy: string;
    reportedAt: string;
  }): Promise<void> {
    try { await addDoc(collection(db, 'reports'), report); } catch {}
  },
};

// ── Feed reactions ───────────────────────────────────────────
// Firestore: reactions/{feedItemId} → { users: { [uid]: emoji } }
// One emoji per user; counts are derived by aggregating the map.

export const dbReactionStore = {
  async get(db: Firestore, feedItemId: string): Promise<Record<string, string>> {
    return getField<Record<string, string>>(db, ['reactions', feedItemId], 'users', {});
  },
  // emoji === null removes the user's reaction
  async set(db: Firestore, feedItemId: string, uid: string, emoji: string | null): Promise<void> {
    try {
      await setDoc(
        doc(db, 'reactions', feedItemId),
        { users: { [uid]: emoji === null ? deleteField() : emoji } },
        { merge: true },
      );
    } catch {}
  },
};

// ── Streaming expenses ───────────────────────────────────────
// Firestore: users/{uid}.expenses — the localStorage cache
// (sec_expenses_v1) is uid-scoped-wiped on account switch, so without
// this cloud copy every new session started from zero.

export const dbExpensesStore = {
  /** null = the field was never written for this account (≠ empty list). */
  async get(db: Firestore, uid: string): Promise<unknown[] | null> {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const v = snap.data()?.expenses;
      return Array.isArray(v) ? v : null;
    } catch { return null; }
  },
  async set(db: Firestore, uid: string, subs: unknown[]) {
    await setField(db, ['users', uid], 'expenses', subs);
  },
};

// ── Real-time subscription: users/{uid} → localStorage ───────
// Call on login; returns an Unsubscribe function.
// Whenever the user's doc changes in Firestore (other device wrote),
// localStorage is refreshed and a custom event is fired so
// any component can re-read and re-render.

const LIST_KEY  = 'sec_lists_v1';
const PREFS_KEY = 'sec_prefs';

export function subscribeUserDoc(db: Firestore, uid: string): Unsubscribe {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (typeof window === 'undefined' || !snap.exists()) return;
    const data = snap.data();
    if (!data) return;

    // ── Lists ──────────────────────────────────────────────
    const all: Record<string, unknown[]> = (() => {
      try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; }
    })();
    let listsChanged = false;
    for (const t of ['want', 'watching', 'watched', 'favorites'] as const) {
      const items = data[`lists_${t}`];
      if (Array.isArray(items)) { all[t] = items; listsChanged = true; }
    }
    if (listsChanged) {
      try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}
    }

    // ── Profile (uid-scoped key) ───────────────────────────
    if (data.profile && typeof data.profile === 'object') {
      try { localStorage.setItem(profileKey(uid), JSON.stringify(data.profile)); } catch {}
    }

    // ── Prefs ──────────────────────────────────────────────
    if (data.prefs && typeof data.prefs === 'object') {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(data.prefs)); } catch {}
    }

    // ── Episode watched ────────────────────────────────────
    if (data.ep_watched && typeof data.ep_watched === 'object') {
      try { localStorage.setItem('sec_ep_watched_v1', JSON.stringify(data.ep_watched)); } catch {}
    }

    // ── Following list ─────────────────────────────────────
    if (Array.isArray(data.following_list)) {
      try { localStorage.setItem('sec_following', JSON.stringify(data.following_list)); } catch {}
    }

    // ── Streaming expenses ─────────────────────────────────
    if (Array.isArray(data.expenses)) {
      try { localStorage.setItem('sec_expenses_v1', JSON.stringify(data.expenses)); } catch {}
    }

    // Notify all listening components
    window.dispatchEvent(new Event('maratonou:sync'));
  });
}

// ── Episode watched ──────────────────────────────────────────

export const dbEpWatchedStore = {
  async set(db: Firestore, uid: string, data: Record<string, Record<string, number[]>>) {
    await setField(db, ['users', uid], 'ep_watched', data);
  },
};

// ── Following list ───────────────────────────────────────────

export const dbFollowStore = {
  async get(db: Firestore, uid: string): Promise<string[]> {
    return getField<string[]>(db, ['users', uid], 'following_list', []);
  },
  async set(db: Firestore, uid: string, list: string[]): Promise<void> {
    await setField(db, ['users', uid], 'following_list', list);
  },
  /**
   * Follow writes ONLY to the follower's own document — Firestore rules
   * allow owner writes only, so a `profile.followers` counter on the target
   * can never be maintained from the client (it silently failed and left
   * every follower count at 0). The follower count is derived instead, via
   * getFollowers(). `targetUsername` must be the target's *canonical*
   * username, otherwise nothing can match it later.
   */
  async follow(db: Firestore, followerUid: string, targetUsername: string): Promise<void> {
    const followerRef = doc(db, 'users', followerUid);
    const snap = await getDoc(followerRef);
    const currentList: string[] = snap.data()?.following_list ?? [];
    if (currentList.includes(targetUsername)) return;
    const nextList = [...currentList, targetUsername];
    await updateDoc(followerRef, {
      following_list: nextList,
      'profile.following': nextList.length,
    });
  },
  async unfollow(db: Firestore, followerUid: string, targetUsername: string): Promise<void> {
    const followerRef = doc(db, 'users', followerUid);
    const snap = await getDoc(followerRef);
    const currentList: string[] = snap.data()?.following_list ?? [];
    // Drop the canonical username and any legacy display-name entry
    const nextList = currentList.filter(u => u !== targetUsername);
    if (nextList.length === currentList.length) return; // wasn't following
    await updateDoc(followerRef, {
      following_list: nextList,
      'profile.following': nextList.length,
    });
  },
};

export type FollowerInfo = {
  uid: string; username: string; name: string;
  avatarImage: string; avatarLetter: string; avatarGradient: string;
};

/**
 * Everyone whose following_list contains any of `identities`.
 *
 * Pass the target's canonical username *plus* their aliases and display
 * name: older follows stored whatever slug was in the URL (often the
 * display name, e.g. "Danilo" instead of "danilo"), so matching only the
 * canonical username would miss them.
 */
export async function getFollowers(db: Firestore, identities: string[]): Promise<FollowerInfo[]> {
  const wanted = Array.from(new Set(identities.filter(Boolean)));
  const seen = new Map<string, FollowerInfo>();
  await Promise.all(wanted.map(async (identity) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('following_list', 'array-contains', identity), limit(50))
      );
      snap.forEach(d => {
        if (seen.has(d.id)) return;
        const p = d.data()?.profile ?? {};
        seen.set(d.id, {
          uid: d.id,
          username: p.username || '', name: p.name || '',
          avatarImage: p.avatarImage || '', avatarLetter: p.avatarLetter || '',
          avatarGradient: p.avatarGradient || '',
        });
      });
    } catch { /* rules/offline — treated as no followers */ }
  }));
  return Array.from(seen.values());
}

// ── Social Notifications ─────────────────────────────────────
// Firestore: notifications/{auto-id}
// Required composite index: recipientId ASC, createdAt DESC

export type NotifDoc = {
  recipientId: string;
  category: 'account';
  type: 'new_follower' | 'comment_reply' | 'comment_like';
  actorId: string;
  actorUsername: string;
  actorName: string;
  actorAvatarLetter: string;
  actorAvatarImage: string;
  titleKey?: string;
  titleName?: string;
  poster?: string;
  commentSnippet?: string;
  read: boolean;
  createdAt: string;
  link?: string;
};

export const dbNotifStore = {
  async add(db: Firestore, notif: Omit<NotifDoc, 'read'>): Promise<void> {
    try { await addDoc(collection(db, 'notifications'), { ...notif, read: false }); } catch {}
  },

  async listForUser(db: Firestore, uid: string): Promise<(NotifDoc & { docId: string })[]> {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ docId: d.id, ...d.data() as NotifDoc }));
    } catch { return []; }
  },

  async markRead(db: Firestore, docId: string): Promise<void> {
    try { await updateDoc(doc(db, 'notifications', docId), { read: true }); } catch {}
  },

  async markAllRead(db: Firestore, uid: string): Promise<void> {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', uid),
        where('read', '==', false),
      );
      const snap = await getDocs(q);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { read: true }));
      await batch.commit();
    } catch {}
  },
};

// ── FCM Tokens ───────────────────────────────────────────────

// Tokens live under users/{uid}/private/push — NOT on the public user doc.
// The users collection is readable by any signed-in account (public profiles),
// and push tokens don't belong in that read surface.
const privatePushDoc = (db: Firestore, uid: string) => doc(db, 'users', uid, 'private', 'push');

export const dbTokenStore = {
  async save(db: Firestore, uid: string, token: string) {
    try {
      await setDoc(privatePushDoc(db, uid), { tokens: arrayUnion(token) }, { merge: true });
      // Clear tokens parked on the public profile doc by older builds.
      try { await updateDoc(doc(db, 'users', uid), { fcm_tokens: deleteField() }); } catch {}
    } catch {}
  },
  async remove(db: Firestore, uid: string, token: string) {
    try {
      await updateDoc(privatePushDoc(db, uid), { tokens: arrayRemove(token) });
    } catch {}
  },
};

// ── Sync: Firestore → localStorage (runs on every login) ────────

export async function syncFromFirestore(db: Firestore, uid: string, email?: string | null, authName?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const LIST_KEY = 'sec_lists_v1';
    const all: Record<string, ListItem[]> = (() => {
      try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; }
    })();
    // Firestore is authoritative: an empty list on the server must clear the
    // local cache too, otherwise a previous account's items survive here.
    for (const type of ['want', 'watching', 'watched', 'favorites'] as ListType[]) {
      all[type] = await dbListStore.get(db, uid, type);
    }
    try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}

    // ── Episode watched + following list + username migration ──
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const data = userSnap.data();
      if (data?.ep_watched && typeof data.ep_watched === 'object') {
        localStorage.setItem('sec_ep_watched_v1', JSON.stringify(data.ep_watched));
      }
      if (Array.isArray(data?.expenses)) {
        localStorage.setItem('sec_expenses_v1', JSON.stringify(data.expenses));
      }
      if (Array.isArray(data?.following_list)) {
        localStorage.setItem('sec_following', JSON.stringify(data.following_list));
      }
      if (data?.profile) {
        // One-time: username becomes the slug of the Name (João Miguel → joao-miguel),
        // falling back to the auth displayName then the email prefix. The previous
        // username is preserved in profile.aliases.
        await migrateUsernameToSlug(db, uid, authName, email);
      }
    } catch {}

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

    const profile = profileStore.get(uid);
    if (profile.name) await dbProfileStore.set(db, uid, profile);

    for (const type of ['want', 'watching', 'watched', 'favorites'] as ListType[]) {
      const items = listStore.get(type);
      if (items.length) await setField(db, ['users', uid], `lists_${type}`, items);
    }

    const prefs = prefsStore.get();
    if (Object.keys(prefs).length) await dbPrefsStore.set(db, uid, prefs);

    // migrate episode watched data
    const { epWatchedStore } = await import('./store');
    const epWatched = epWatchedStore.getAll();
    if (Object.keys(epWatched).length) {
      await setField(db, ['users', uid], 'ep_watched', epWatched);
    }

    // migrate reviews — one doc per review; local reviews were written on
    // this device by this account, so it claims authorship of any without uid
    const allReviews = (() => { try { return JSON.parse(localStorage.getItem('sec_reviews_v1') || '{}'); } catch { return {}; } })();
    for (const [key, items] of Object.entries(allReviews)) {
      if (!Array.isArray(items)) continue;
      for (const r of items as Review[]) {
        try { await dbRevStore.add(db, key, { ...r, uid: r.uid || uid }); } catch {}
      }
    }

    localStorage.setItem(MIGRATED_KEY, '1');
    console.info('[DB] localStorage migrated to Firestore ✓');
  } catch (e) {
    console.warn('[DB] Migration failed', e);
  }
}
